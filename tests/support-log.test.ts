import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ChunkedLogParser, parseLog } from "@/modules/support/log-parser";
import { analyzeEvents, signatureOf, extractEnvironment } from "@/modules/support/log-analysis";
import { detectKnownIssues, createIssueAccumulator } from "@/modules/support/known-issues";

const SAMPLE = [
  "2026-07-09 08:12:19,659 INFO  [com.datasul.technology.webdesk.dm.servlet.BootStrap] (ServerService Thread Pool -- 39) fluig.version=2.0.0-260317",
  "2026-07-09 08:12:19,659 INFO  [com.datasul.technology.webdesk.dm.servlet.BootStrap] (ServerService Thread Pool -- 39) java.version=11.0.7",
  "2026-07-09 08:12:19,659 INFO  [com.datasul.technology.webdesk.dm.servlet.BootStrap] (ServerService Thread Pool -- 39) user.timezone=America/Sao_Paulo",
  "2026-07-09 08:13:01,100 WARN  [org.jboss.security.auth.spi.AbstractServerLoginModule] (default task-1) O usuário x realizou uma tentativa de login informando a senha em MD5, porém esse tipo de autenticação não está habilitado em sua empresa.",
  "2026-07-09 08:13:02,200 ERROR [com.foo.Bar] (default task-2) Communications link failure",
  "java.sql.SQLException: Could not open connection",
  "\tat com.foo.Bar.open(Bar.java:42)",
  "Caused by: java.net.ConnectException: Connection refused",
  "\t... 9 more",
  "2026-07-09 08:14:00,000 ERROR [com.foo.Bar] (default task-3) Communications link failure",
].join("\n");

describe("parser de log", () => {
  const { events } = parseLog(SAMPLE);

  test("separa eventos por linha de timestamp e anexa stack trace ao evento anterior", () => {
    assert.equal(events.length, 6); // 3 BootStrap + 1 WARN + 2 ERROR
    const err = events[4];
    assert.equal(err.level, "ERROR");
    assert.equal(err.category, "com.foo.Bar");
    assert.equal(err.thread, "default task-2");
    assert.equal(err.message, "Communications link failure");
    assert.match(err.detail, /SQLException/);
    assert.match(err.detail, /Caused by: java\.net\.ConnectException/);
    assert.match(err.detail, /\.\.\. 9 more/);
  });

  test("timestamp vira ISO e epoch coerentes", () => {
    assert.equal(events[0].timestamp, "2026-07-09T08:12:19.659");
    assert.equal(events[0].epochMs, Date.UTC(2026, 6, 9, 8, 12, 19, 659));
  });

  test("numera as linhas corretamente (1-based)", () => {
    assert.equal(events[0].line, 1);
    assert.equal(events[4].line, 5);
    assert.equal(events[5].line, 10);
  });

  test("streaming em pedaços que cortam linhas dá o mesmo resultado", () => {
    const whole = parseLog(SAMPLE).events;
    const collected: ReturnType<typeof parseLog>["events"] = [];
    const p = new ChunkedLogParser(1, (e) => collected.push(e));
    // empurra byte a byte (pior caso de corte)
    for (const ch of SAMPLE) p.push(ch);
    p.finish();
    assert.equal(collected.length, whole.length);
    assert.deepEqual(
      collected.map((e) => [e.level, e.message, e.detail]),
      whole.map((e) => [e.level, e.message, e.detail]),
    );
  });

  test("linhas de continuação antes do primeiro evento viram leadingOrphans", () => {
    const r = parseLog("\tat algo\nlixo\n2026-07-09 08:00:00,000 INFO  [c] (t) ok");
    assert.equal(r.events.length, 1);
    assert.deepEqual(r.leadingOrphans, ["\tat algo", "lixo"]);
  });
});

describe("análise", () => {
  const { events } = parseLog(SAMPLE);
  const summary = analyzeEvents(events);

  test("conta por nível", () => {
    assert.equal(summary.counts.ERROR, 2);
    assert.equal(summary.counts.WARN, 1);
    assert.equal(summary.counts.INFO, 3);
  });

  test("agrupa erros equivalentes por assinatura (ignora números)", () => {
    assert.equal(
      signatureOf({ category: "c", message: "falha no item 123 em 2026-01-01" }),
      signatureOf({ category: "c", message: "falha no item 999 em 2026-02-02" }),
    );
    // os dois "Communications link failure" caem no mesmo grupo
    const group = summary.errorGroups.find((g) => g.sample.includes("Communications link failure"));
    assert.ok(group);
    assert.equal(group.count, 2);
    assert.equal(group.level, "ERROR");
  });

  test("extrai o painel do ambiente do BootStrap", () => {
    const env = extractEnvironment(events);
    const version = env.find((e) => e.key === "fluig.version");
    assert.equal(version?.value, "2.0.0-260317");
    assert.ok(env.some((e) => e.key === "java.version" && e.value === "11.0.7"));
    assert.ok(env.some((e) => e.key === "user.timezone"));
  });

  test("timeline cobre o intervalo e marca erros", () => {
    assert.equal(summary.firstEpochMs, Date.UTC(2026, 6, 9, 8, 12, 19, 659));
    assert.equal(summary.lastEpochMs, Date.UTC(2026, 6, 9, 8, 14, 0, 0));
    const totalErrors = summary.timeline.reduce((n, b) => n + b.errors, 0);
    assert.equal(totalErrors, 2);
  });
});

describe("problemas conhecidos", () => {
  const { events } = parseLog(SAMPLE);

  test("detecta falha de conexão com o banco e login MD5", () => {
    const findings = detectKnownIssues(events);
    const ids = findings.map((f) => f.issue.id);
    assert.ok(ids.includes("db-connection-lost"));
    assert.ok(ids.includes("md5-login-disabled"));
    // alta severidade vem antes de baixa
    assert.equal(findings[0].issue.severity, "alta");
    const db = findings.find((f) => f.issue.id === "db-connection-lost");
    assert.ok(db);
    assert.equal(db.count, 2); // dois ERROR "Communications link failure"
  });

  test("o acumulador incremental dá o mesmo que a versão em lote", () => {
    const acc = createIssueAccumulator();
    for (const e of events) if (["ERROR", "FATAL", "WARN"].includes(e.level)) acc.feed(e);
    const batch = detectKnownIssues(events);
    const inc = acc.result();
    assert.deepEqual(
      inc.map((f) => [f.issue.id, f.count]),
      batch.map((f) => [f.issue.id, f.count]),
    );
  });

  test("não dispara problema sem evidência", () => {
    const { events: clean } = parseLog("2026-07-09 08:00:00,000 INFO  [c] (t) tudo certo");
    assert.equal(detectKnownIssues(clean).length, 0);
  });

  test("respeita o filtro de nível (MD5 só em WARN)", () => {
    const { events: asInfo } = parseLog(
      "2026-07-09 08:00:00,000 INFO  [c] (t) senha em MD5, porém esse tipo não está habilitado",
    );
    assert.equal(detectKnownIssues(asInfo).length, 0);
  });
});
