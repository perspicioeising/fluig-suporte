import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ChunkedLogParser, parseLog } from "@/modules/support/log-parser";
import { analyzeEvents, analyzeAvailability, signatureOf, extractEnvironment } from "@/modules/support/log-analysis";
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

describe("disponibilidade e reinícios", () => {
  test("detecta reinício com parada limpa antes e mede o downtime", () => {
    const SAMPLE_RESTART = [
      "2026-07-09 03:00:00,000 INFO  [org.jboss.as] (MSC service thread) WFLYSRV0050: WildFly stopped in 1200ms",
      "2026-07-09 03:02:30,000 INFO  [org.jboss.as.server] (Controller Boot Thread) WFLYSRV0025: WildFly started in 90000ms",
      "2026-07-09 03:02:31,000 INFO  [com.fluig.BootStrap] (ServerService) Fluig is up and running",
    ].join("\n");
    const { events } = parseLog(SAMPLE_RESTART);
    const av = analyzeAvailability(events);
    assert.equal(av.restarts.length, 1); // marcos próximos do mesmo ciclo contam como 1
    const r = av.restarts[0];
    assert.equal(r.precededByShutdown, true);
    assert.equal(r.precededByCrashSignal, null);
    // 03:00:00 -> 03:02:30 = 150s
    assert.equal(r.downtimeMs, 150_000);
    assert.equal(av.crashLoop, false);
  });

  test("marca queda abrupta (sem shutdown) precedida de OutOfMemory", () => {
    const SAMPLE_OOM = [
      "2026-07-09 10:00:00,000 ERROR [com.foo] (task) java.lang.OutOfMemoryError: Java heap space",
      "2026-07-09 10:01:00,000 INFO  [org.jboss.as.server] (Controller Boot Thread) WFLYSRV0025: WildFly started in 60000ms",
    ].join("\n");
    const { events } = parseLog(SAMPLE_OOM);
    const av = analyzeAvailability(events);
    assert.equal(av.restarts.length, 1);
    assert.equal(av.restarts[0].precededByShutdown, false);
    assert.equal(av.restarts[0].precededByCrashSignal, "oom");
  });

  test("identifica crash loop (vários reinícios em janela curta)", () => {
    const lines: string[] = [];
    for (let i = 0; i < 3; i++) {
      const mm = String(i * 5).padStart(2, "0"); // 11:00, 11:05, 11:10
      lines.push(`2026-07-09 11:${mm}:00,000 INFO  [org.jboss.as.server] (Controller Boot Thread) WFLYSRV0025: WildFly started in 60000ms`);
    }
    const { events } = parseLog(lines.join("\n"));
    const av = analyzeAvailability(events);
    assert.equal(av.restarts.length, 3);
    assert.equal(av.crashLoop, true);
  });

  test("log estável (sem reinício) não gera reinícios", () => {
    const { events } = parseLog(SAMPLE);
    const av = analyzeAvailability(events);
    assert.equal(av.restarts.length, 0);
    assert.equal(av.crashLoop, false);
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

  test("detecta novos padrões do dicionário (personificação, timeout de serviço)", () => {
    const { events } = parseLog(
      [
        "2026-07-09 08:00:00,000 ERROR [c] (t) Acesso negado: Usuário x sem permissão de personificação",
        "2026-07-09 08:00:01,000 ERROR [com.fluig.authorize.client.CustomNoneAuthorize] (t) Connect to 177.1.1.1:8082 failed: Connection timed out",
      ].join("\n"),
    );
    const ids = detectKnownIssues(events).map((f) => f.issue.id);
    assert.ok(ids.includes("impersonation-denied"));
    assert.ok(ids.includes("integration-service-timeout"));
  });
});

describe("lentidão (JSChronos)", () => {
  const LOG = [
    "2026-07-09 08:00:00,000 WARN  [com.fluig.monitoring.jschronos.JSChronos] (default task-1) DatasetFactory.getDataset.ds_lento executou por 196 segundos",
    "2026-07-09 08:01:00,000 WARN  [com.fluig.monitoring.jschronos.JSChronos] (default task-2) DatasetFactory.getDataset.ds_lento executou por 211 segundos",
    "2026-07-09 08:02:00,000 WARN  [com.fluig.monitoring.jschronos.JSChronos] (default task-3) algo.rapido executou por 3 segundos",
  ].join("\n");

  test("agrega operações lentas pelo maior tempo e ignora as rápidas", () => {
    const { events } = parseLog(LOG);
    const acc = createIssueAccumulator();
    for (const e of events) acc.feed(e);
    const slow = acc.slowOperations();
    assert.equal(slow.length, 1); // "algo.rapido" (3s) fica de fora (< 30s)
    assert.equal(slow[0].name, "DatasetFactory.getDataset.ds_lento");
    assert.equal(slow[0].maxSeconds, 211);
    assert.equal(slow[0].count, 2);
    assert.equal(slow[0].severity, "alta"); // > 60s
  });

  test("severidade média entre 30s e 60s", () => {
    const { events } = parseLog(
      "2026-07-09 08:00:00,000 WARN  [JSChronos] (t) consulta.media executou por 45 segundos",
    );
    const acc = createIssueAccumulator();
    for (const e of events) acc.feed(e);
    assert.equal(acc.slowOperations()[0].severity, "media");
  });

  test("operação abaixo de 30s não é considerada lenta", () => {
    const { events } = parseLog(
      "2026-07-09 08:00:00,000 WARN  [JSChronos] (t) quase.lento executou por 25 segundos",
    );
    const acc = createIssueAccumulator();
    for (const e of events) acc.feed(e);
    assert.equal(acc.slowOperations().length, 0);
  });
});

describe("indexador Solr fora do ar", () => {
  // Erro real: EJB do Indexer falha porque o Solr (porta 8983) recusou conexão.
  const INDEXER = [
    "2026-03-03 10:20:08,000 ERROR [org.jboss.as.ejb3.invocation] (Thread-34) WFLYEJB0034: EJB Invocation failed on component service/Indexer for method FDNIndexerService.index",
    "Caused by: com.totvs.technology.foundation.indexer.exception.IndexerException: Failed to validate Solr core: 1",
    "Caused by: org.apache.solr.client.solrj.SolrServerException: Server refused connection at: http://172.23.52.19:8983/solr",
    "Caused by: org.apache.http.conn.HttpHostConnectException: Connect to 172.23.52.19:8983 failed: Connection refused: connect",
  ].join("\n");

  test("classifica como Indexer/Solr e não como banco nem timeout de serviço externo", () => {
    const { events } = parseLog(INDEXER);
    const ids = detectKnownIssues(events).map((f) => f.issue.id);
    assert.ok(ids.includes("indexer-solr-down"), "deveria detectar o Indexer");
    assert.ok(!ids.includes("db-connection-lost"), "não deveria classificar como conexão de banco");
    assert.ok(!ids.includes("integration-service-timeout"), "não deveria classificar como serviço externo");
  });

  test("conexão de banco real (JDBC) ainda é detectada", () => {
    const { events } = parseLog(
      "2026-03-03 10:00:00,000 ERROR [c] (t) org.hibernate.exception.JDBCConnectionException: Could not open JDBC connection for transaction",
    );
    const ids = detectKnownIssues(events).map((f) => f.issue.id);
    assert.ok(ids.includes("db-connection-lost"));
  });
});

describe("violação de constraint (benigno vs real)", () => {
  test("chave duplicada em HISTOR_ACES é tratada como benigna e suprime o genérico", () => {
    const { events } = parseLog(
      [
        "2026-03-03 08:32:32,000 WARN  [org.hibernate.engine.jdbc.spi.SqlExceptionHelper] (t) SQL Error: 2627, SQLState: 23000",
        "2026-03-03 08:32:32,001 ERROR [org.hibernate.engine.jdbc.spi.SqlExceptionHelper] (t) Violation of PRIMARY KEY constraint 'pk_HISTOR_ACES'. Cannot insert duplicate key in object 'dbo.HISTOR_ACES'.",
      ].join("\n"),
    );
    const ids = detectKnownIssues(events).map((f) => f.issue.id);
    assert.ok(ids.includes("db-async-duplicate-benign"), "deveria reconhecer a tabela assíncrona");
    assert.ok(!ids.includes("db-constraint-violation"), "o alerta genérico deveria ser suprimido");
  });

  test("violação em tabela de aplicação (sem ser assíncrona) mantém o alerta genérico", () => {
    const { events } = parseLog(
      "2026-03-03 09:00:00,000 ERROR [c] (t) Violation of UNIQUE KEY constraint 'UK_MINHA_TABELA'. Cannot insert duplicate key in object 'dbo.MINHA_TABELA'.",
    );
    const ids = detectKnownIssues(events).map((f) => f.issue.id);
    assert.ok(ids.includes("db-constraint-violation"));
    assert.ok(!ids.includes("db-async-duplicate-benign"));
  });
});
