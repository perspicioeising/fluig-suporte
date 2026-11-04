import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fillPathParams, javaString, joinUrl, shellQuote } from "@/modules/builder/generators/common";
import { generateRestSnippets } from "@/modules/builder/generators/rest";
import { buildTesterHref, documentedRows, parseTesterPrefill } from "@/modules/builder/tester-link";
import type { CatalogParameter } from "@/modules/catalog/types";

describe("utilitários dos geradores", () => {
  test("fillPathParams codifica valores e marca os ausentes", () => {
    assert.deepEqual(fillPathParams("/users/{login}/groups/{code}", { login: "joão silva" }), {
      path: "/users/jo%C3%A3o%20silva/groups/PREENCHER_code",
      missing: ["code"],
    });
    assert.equal(fillPathParams("/a/{id}", {}, "braces").path, "/a/{id}");
  });

  test("escapes de shell e Java impedem quebra de string", () => {
    assert.equal(shellQuote("it's"), `'it'\\''s'`);
    assert.equal(javaString('a"b\n'), '"a\\"b\\n"');
    assert.equal(joinUrl("https://x.com/", "api"), "https://x.com/api");
  });
});

describe("gerador REST", () => {
  const snippets = generateRestSnippets({
    method: "GET",
    baseUrl: "https://SEU_FLUIG",
    path: "/api/public/wcm/user/findActiveUsersUsingFilter",
    query: [{ key: "limit", value: "20" }],
  });

  test("gera cURL, JavaScript, Java e JSON com a URL e a query", () => {
    const ids = snippets.map((s) => s.id);
    for (const id of ["curl", "javascript", "java"]) assert.ok(ids.includes(id), `falta ${id}: ${ids.join(",")}`);
    for (const s of snippets.filter((s) => s.id !== "json")) {
      assert.match(s.code, /findActiveUsersUsingFilter/, s.id);
      assert.match(s.code, /limit=20|"limit"/, s.id);
    }
  });

  test("não embute credenciais reais (só marcadores)", () => {
    for (const s of snippets) {
      assert.doesNotMatch(s.code, /Basic [A-Za-z0-9+/=]{12,}/, s.id);
    }
  });

  test("GET não envia corpo", () => {
    const withBody = generateRestSnippets({ method: "GET", baseUrl: "https://x", path: "/a", query: [], body: '{"a":1}' });
    const curl = withBody.find((s) => s.id === "curl");
    assert.ok(curl && !curl.code.includes('{"a":1}'));
  });
});

describe("ponte Construtor -> API Tester", () => {
  const param = (p: Partial<CatalogParameter>): CatalogParameter => ({
    id: "x",
    direction: "input",
    location: "query",
    name: "p",
    data_type: null,
    is_required: false,
    description: null,
    example: null,
    position: 0,
    ...p,
  });

  test("documentedRows: obrigatórios primeiro e habilitados; headers gerenciados ficam de fora", () => {
    const rows = documentedRows([
      param({ name: "limit", data_type: "integer" }),
      param({ name: "pattern", is_required: true }),
      param({ name: "Authorization", location: "header" }),
      param({ name: "X-Custom", location: "header", example: "1" }),
      param({ name: "id", location: "path", is_required: true }),
    ]);
    assert.deepEqual(rows.query.map((r) => [r.key, r.enabled, r.required]), [
      ["pattern", true, true],
      ["limit", false, false],
    ]);
    assert.deepEqual(rows.headers.map((r) => [r.key, r.value]), [["X-Custom", "1"]]);
  });

  test("buildTesterHref -> parseTesterPrefill preserva os dados", () => {
    const prefill = {
      environmentId: "3f2b8f4e-6d7a-4c1e-9b0a-2d3c4e5f6a7b",
      method: "POST" as const,
      path: "/api/public/2.0/users/{login}",
      query: [{ key: "a", value: "1", enabled: true }],
      headers: [],
      bodyType: "json" as const,
      body: '{"x":1}',
    };
    const { href, bodyDropped } = buildTesterHref(prefill);
    assert.equal(bodyDropped, false);
    const params = Object.fromEntries(new URL(`http://h${href}`).searchParams);
    const parsed = parseTesterPrefill(params);
    assert.ok(parsed);
    assert.equal(parsed.method, "POST");
    assert.equal(parsed.path, prefill.path);
    assert.equal(parsed.environmentId, prefill.environmentId);
    assert.equal(parsed.body, prefill.body);
    assert.equal(parsed.query[0].key, "a");
  });

  test("parseTesterPrefill recusa entrada maliciosa", () => {
    assert.equal(parseTesterPrefill({ method: "GET", path: "//evil.com/x" }), null);
    assert.equal(parseTesterPrefill({ method: "TRACE", path: "/a" }), null);
    assert.equal(parseTesterPrefill({ method: "GET", path: "https://evil.com" }), null);
    const ok = parseTesterPrefill({ method: "get", path: "/a", env: "nao-e-uuid", q: "{json quebrado" });
    assert.ok(ok);
    assert.equal(ok.environmentId, undefined);
    assert.deepEqual(ok.query, []);
  });

  test("corpo muito grande fica de fora do link", () => {
    const { href, bodyDropped } = buildTesterHref({
      method: "POST",
      path: "/a",
      query: [],
      headers: [],
      bodyType: "json",
      body: "x".repeat(10_000),
    });
    assert.equal(bodyDropped, true);
    assert.ok(href.length < 6500);
  });
});
