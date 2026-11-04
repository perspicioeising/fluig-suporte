import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

before(() => {
  // Chave descartável só para os testes (nunca a do .env).
  process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

describe("crypto (AES-256-GCM)", () => {
  test("criptografa e descriptografa o mesmo valor", async () => {
    const { encryptJson, decryptJson } = await import("@/lib/security/crypto");
    const secret = { username: "usuario", password: "s3nh@" };
    const payload = encryptJson(secret);
    assert.match(payload, /^v1:/);
    assert.ok(!payload.includes("s3nh@"), "o texto cifrado não pode conter o segredo");
    assert.deepEqual(decryptJson(payload), secret);
  });

  test("usa IV aleatório (dois cifrados diferentes para o mesmo valor)", async () => {
    const { encryptJson } = await import("@/lib/security/crypto");
    assert.notEqual(encryptJson({ a: 1 }), encryptJson({ a: 1 }));
  });

  test("detecta adulteração do cifrado", async () => {
    const { encryptJson, decryptJson } = await import("@/lib/security/crypto");
    const payload = encryptJson({ token: "abc" });
    const raw = Buffer.from(payload.slice(3), "base64");
    raw[raw.length - 1] ^= 0xff;
    assert.throws(() => decryptJson(`v1:${raw.toString("base64")}`));
  });

  test("recusa formato desconhecido", async () => {
    const { decryptJson } = await import("@/lib/security/crypto");
    assert.throws(() => decryptJson("v0:abc"), /Formato/);
  });
});

describe("SSRF", () => {
  test("bloqueia endereços internos, loopback e metadados de nuvem", async () => {
    const { isPublicAddress } = await import("@/lib/security/ssrf");
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
  });

  test("permite endereços públicos", async () => {
    const { isPublicAddress } = await import("@/lib/security/ssrf");
    for (const ip of ["8.8.8.8", "200.155.0.10", "2606:4700:4700::1111"]) {
      assert.equal(isPublicAddress(ip), true, ip);
    }
  });

  test("assertSafeHost recusa esquemas, credenciais na URL e hosts internos", async () => {
    const { assertSafeHost } = await import("@/lib/security/ssrf");
    for (const url of ["file:///etc/passwd", "ftp://x.com", "https://user:pw@x.com", "http://localhost:3000", "http://a.internal", "http://10.0.0.1", "http://[::1]/"]) {
      assert.throws(() => assertSafeHost(new URL(url)), url);
    }
    assert.doesNotThrow(() => assertSafeHost(new URL("https://exemplo.fluig.com/api")));
  });

  test("sanitizeRequestHeaders remove hop-by-hop e injeção de CRLF", async () => {
    const { sanitizeRequestHeaders } = await import("@/lib/security/ssrf");
    const clean = sanitizeRequestHeaders({
      Host: "evil",
      "X-Ok": "1",
      "X-Bad": "a\r\nInjected: 1",
      "Bad Name": "x",
      "Proxy-Authorization": "y",
    });
    assert.deepEqual(clean, { "X-Ok": "1" });
  });
});

describe("CSRF (mesma origem)", () => {
  test("recusa requisições de outro site e aceita as do próprio app", async () => {
    const { isCrossSiteRequest } = await import("@/lib/security/same-origin");
    const h = (o: Record<string, string>) => new Headers(o);
    assert.equal(isCrossSiteRequest(h({ host: "app.com", origin: "https://app.com", "sec-fetch-site": "same-origin" })), false);
    assert.equal(isCrossSiteRequest(h({ host: "app.com" })), false, "sem headers de navegador (ex.: curl)");
    assert.equal(isCrossSiteRequest(h({ host: "app.com", "sec-fetch-site": "cross-site" })), true);
    assert.equal(isCrossSiteRequest(h({ host: "app.com", "sec-fetch-site": "same-site" })), true);
    assert.equal(isCrossSiteRequest(h({ host: "app.com", origin: "https://evil.com" })), true);
    assert.equal(isCrossSiteRequest(h({ host: "app.com", origin: "null" })), true);
    assert.equal(isCrossSiteRequest(h({ host: "interno:3000", "x-forwarded-host": "app.com", origin: "https://app.com" })), false);
  });
});

describe("OAuth 1.0a", () => {
  test("assinatura bate com o exemplo da RFC 5849 (seção 1.2)", async () => {
    const { buildOAuth1Header } = await import("@/lib/security/oauth1");
    const header = buildOAuth1Header({
      method: "GET",
      url: new URL("http://photos.example.net/photos?file=vacation.jpg&size=original"),
      credentials: {
        consumerKey: "dpf43f3p2l4k3l03",
        consumerSecret: "kd94hf93k423kf44",
        token: "nnch734d00sl2jdk",
        tokenSecret: "pfkkdhi9sl3r4s00",
      },
      nonce: "kllo9940pd9333jh",
      timestamp: "1191242096",
    });
    assert.match(header, /^OAuth /);
    assert.match(header, /oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"/);
  });
});

describe("mascaramento de credenciais", () => {
  test("maskHeaders e maskUrl ocultam valores sensíveis", async () => {
    const { maskHeaders, maskUrl } = await import("@/modules/environments/runtime");
    assert.deepEqual(maskHeaders({ Authorization: "Basic abc", "X-Api-Key": "k", Accept: "json" }), {
      Authorization: "***",
      "X-Api-Key": "***",
      Accept: "json",
    });
    const masked = maskUrl(new URL("https://x.com/a?token=abc&page=2&password=p"));
    assert.ok(!masked.includes("abc") && !masked.includes("password=p"));
    assert.match(masked, /page=2/);
  });

  test("buildTargetUrl não deixa o caminho sair da URL base", async () => {
    const { buildTargetUrl } = await import("@/modules/environments/runtime");
    const env = { base_url: "https://fluig.exemplo.com/ctx" };
    const ok = buildTargetUrl(env, "/api/public/2.0/users");
    assert.ok(ok.ok && ok.url.toString() === "https://fluig.exemplo.com/ctx/api/public/2.0/users");
    for (const path of ["/../outro", "//evil.com/x", "@evil.com"]) {
      const r = buildTargetUrl(env, path);
      assert.ok(!r.ok || (r.url.host === "fluig.exemplo.com" && r.url.pathname.startsWith("/ctx/")), path);
    }
  });

  test("redactSecrets oculta senhas, tokens, Authorization, cookies e JWT", async () => {
    const { redactSecrets } = await import("@/modules/diagnostics/redact");
    const input = [
      "Authorization: Basic dXNlcjpwYXNzd29yZA==",
      'Authorization: OAuth oauth_consumer_key="ck", oauth_signature="sig"',
      '{"password": "minhaSenha", "user": "joao"}',
      "<ws:password>outraSenha</ws:password>",
      "Cookie: JSESSIONID=abc123",
      "url?access_token=tok123&page=1",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk",
    ].join("\n");
    const { text, count } = redactSecrets(input);
    for (const secret of ["dXNlcjpwYXNzd29yZA", "minhaSenha", "outraSenha", "abc123", "tok123", "eyJhbGciOiJIUzI1NiJ9", 'oauth_signature="sig"']) {
      assert.ok(!text.includes(secret), `vazou: ${secret}`);
    }
    assert.ok(text.includes('"user": "joao"') && text.includes("page=1"), "não deve ocultar dados comuns");
    assert.ok(count >= 7);
  });

  test("maskSensitiveXml oculta senha mas mantém marcadores do ambiente", async () => {
    const { maskSensitiveXml } = await import("@/modules/soap/envelope");
    const xml = "<x><password>abc</password><senha>{{ENV_PASSWORD}}</senha><user>u</user></x>";
    assert.equal(maskSensitiveXml(xml), "<x><password>***</password><senha>{{ENV_PASSWORD}}</senha><user>u</user></x>");
  });

  test("applyEnvPlaceholders escapa as credenciais para XML", async () => {
    const { applyEnvPlaceholders, hasEnvPlaceholders } = await import("@/modules/soap/envelope");
    const xml = "<u>{{ENV_USERNAME}}</u><p>{{ENV_PASSWORD}}</p>";
    assert.ok(hasEnvPlaceholders(xml));
    assert.equal(applyEnvPlaceholders(xml, { username: "a&b", password: "<x>" }), "<u>a&amp;b</u><p>&lt;x&gt;</p>");
  });
});

describe("guarda de escrita SOAP", () => {
  test("só considera leitura nomes claramente de consulta", async () => {
    const { isReadOnlySoapName } = await import("@/modules/soap/guard");
    for (const name of ["getColleagues", "findUser", "isActive", '"urn:x#getDataset"', "GetFoo", "searchDocuments"]) {
      assert.equal(isReadOnlySoapName(name), true, name);
    }
    for (const name of ["createColleague", "deleteDocument", "updateCard", "getting", "issueToken", "startProcess", ""]) {
      assert.equal(isReadOnlySoapName(name), false, name);
    }
  });
});
