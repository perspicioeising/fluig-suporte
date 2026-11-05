import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "@/modules/support/config-parser";
import { validateConfig } from "@/modules/support/config-validation";
import { correlate } from "@/modules/support/correlation";
import { buildEvidenceText, hasEvidence } from "@/modules/support/evidence";
import { buildReport } from "@/modules/support/report";
import { KNOWN_ISSUES, type IssueFinding } from "@/modules/support/known-issues";
import type { AnalysisResult } from "@/modules/support/stream-reader";

function finding(id: string, count = 1): IssueFinding {
  const issue = KNOWN_ISSUES.find((i) => i.id === id)!;
  return { issue, count, firstLine: 10, firstEpochMs: 0, lastEpochMs: 0, sample: "amostra" };
}

const STANDALONE = `<?xml version='1.0'?><server xmlns="urn:jboss:domain:10.0"><profile>
<subsystem xmlns="urn:jboss:domain:datasources:5.0"><datasources>
<datasource jndi-name="java:/jdbc/FluigDS" pool-name="FluigDS">
<connection-url>jdbc:mysql://db:3306/fluig</connection-url><driver>mysqlDriver</driver>
<pool><min-pool-size>10</min-pool-size><max-pool-size>50</max-pool-size></pool>
<security><user-name>fluig</user-name></security></datasource></datasources></subsystem></profile></server>`;
const CONF = `JAVA_OPTS="-Xms4G -Xmx16G -XX:MetaspaceSize=96M"`;

function fakeLog(findingIds: string[]): AnalysisResult {
  return {
    summary: {
      totalEvents: 100,
      counts: { ERROR: 5, WARN: 3, INFO: 92, DEBUG: 0, TRACE: 0, FATAL: 0 },
      firstEpochMs: Date.UTC(2026, 6, 9, 8, 0, 0),
      lastEpochMs: Date.UTC(2026, 6, 9, 9, 0, 0),
      environment: [{ key: "fluig.version", label: "Versão do Fluig", value: "2.0.0" }],
      errorGroups: [
        { signature: "x", level: "ERROR", count: 5, sample: "Communications link failure", category: "com.foo", exception: "java.sql.SQLException", firstEpochMs: 0, lastEpochMs: 0, firstLine: 10 },
      ],
      timeline: [],
      bucketMs: 60000,
    },
    findings: findingIds.map((id) => finding(id)),
    slowOperations: [],
    fileName: "server.log",
    fileSize: 1000,
    keptErrorEvents: [],
    truncatedEvents: false,
  };
}

describe("correlação log × config", () => {
  const config = parseConfig(STANDALONE, "standalone.xml");
  const conf = parseConfig(CONF, "standalone.conf");

  test("liga falha de banco no log ao datasource", () => {
    const cors = correlate([finding("db-connection-lost")], [config], []);
    assert.equal(cors.length, 1);
    assert.equal(cors[0].logIssueId, "db-connection-lost");
    assert.match(cors[0].detail, /FluigDS/);
    assert.match(cors[0].detail, /jdbc:mysql/);
  });

  test("liga OOM ao -Xmx do .conf e inclui achado de memória", () => {
    const confIssues = validateConfig(conf, { fluigVersion: "2.0.0", ramGb: 8 });
    const cors = correlate([finding("out-of-memory")], [conf], confIssues);
    assert.equal(cors.length, 1);
    assert.match(cors[0].detail, /-Xmx=16G/);
    assert.match(cors[0].detail, /acima da RAM/i);
  });

  test("não correlaciona o que não está no log", () => {
    const cors = correlate([finding("md5-login-disabled")], [config], []);
    assert.equal(cors.length, 0);
  });

  test("falha de banco sem config enviada orienta a enviar o arquivo", () => {
    const cors = correlate([finding("db-connection-lost")], [], []);
    assert.equal(cors.length, 1);
    assert.match(cors[0].detail, /Nenhuma configuração de datasource/);
  });
});

describe("pacote de evidências", () => {
  const config = parseConfig(STANDALONE, "standalone.xml");

  test("hasEvidence reflete log/config/correlações", () => {
    assert.equal(hasEvidence({ logAnalysis: null, configs: [], correlations: [] }), false);
    // log com erros => tem evidência
    assert.equal(hasEvidence({ logAnalysis: fakeLog(["db-connection-lost"]), configs: [], correlations: [] }), true);
    // config COM achado (useSSL=false) => tem evidência
    const withIssue = parseConfig(
      `<?xml version='1.0'?><server xmlns="urn:jboss:domain:10.0"><profile><subsystem xmlns="urn:jboss:domain:datasources:5.0"><datasources><datasource jndi-name="java:/jdbc/FluigDS" pool-name="FluigDS"><connection-url>jdbc:mysql://db:3306/fluig?useSSL=false</connection-url><driver>mysqlDriver</driver><security><user-name>root</user-name></security></datasource></datasources></subsystem></profile></server>`,
      "standalone.xml",
    );
    const issues = validateConfig(withIssue, { fluigVersion: "2.0.0", ramGb: 8 });
    assert.ok(issues.length > 0);
    assert.equal(hasEvidence({ logAnalysis: null, configs: [{ fileName: "s.xml", parsed: withIssue, issues }], correlations: [] }), true);
    // config "limpo" (sem achados) e sem log => sem evidência
    assert.equal(
      hasEvidence({ logAnalysis: null, configs: [{ fileName: "s.xml", parsed: config, issues: [] }], correlations: [] }),
      false,
    );
  });

  test("buildEvidenceText inclui ambiente, erros, config e correlações", () => {
    const log = fakeLog(["db-connection-lost"]);
    const configs = [{ fileName: "standalone.xml", parsed: config, issues: validateConfig(config, { fluigVersion: "2.0.0", ramGb: 8 }) }];
    const correlations = correlate(log.findings, [config], []);
    const text = buildEvidenceText({ logAnalysis: log, configs, correlations });
    assert.match(text, /## Ambiente/);
    assert.match(text, /Vers[ãa]o do Fluig: 2\.0\.0/);
    assert.match(text, /Communications link failure/);
    assert.match(text, /## Configuração: standalone\.xml/);
    assert.match(text, /## Correlações/);
    assert.ok(text.length < 18_100);
  });

  test("texto vazio quando não há nada", () => {
    const text = buildEvidenceText({ logAnalysis: null, configs: [], correlations: [] });
    assert.equal(text.trim(), "");
  });
});

describe("relatório técnico", () => {
  const config = parseConfig(STANDALONE, "standalone.xml");
  const now = new Date(Date.UTC(2026, 6, 9, 12, 0, 0));

  test("monta relatório com evidências e diagnóstico", () => {
    const logResult = fakeLog(["db-connection-lost"]);
    const configs = [{ fileName: "standalone.xml", parsed: config, issues: [] }];
    const correlations = correlate(logResult.findings, [config], []);
    const md = buildReport({
      pkg: { logAnalysis: logResult, configs, correlations },
      diagnosisMarkdown: "## Resumo do problema\nFalha de conexão com o banco.",
      diagnosisSources: [{ index: 1, title: "Perda de conexão", url: "https://x", kind: "docs", entryId: null, snippet: "", cited: true }],
      now,
    });
    assert.match(md, /# Relatório técnico/);
    assert.match(md, /## Ambiente/);
    assert.match(md, /Falha\/perda de conex/);
    assert.match(md, /## Configuração: standalone\.xml/);
    assert.match(md, /## Correlações/);
    assert.match(md, /## Diagnóstico assistido por IA/);
    assert.match(md, /### Fontes consultadas/);
    assert.match(md, /\[1\] Perda de conexão — https:\/\/x/);
    assert.match(md, /não contém o log bruto/);
  });

  test("funciona sem diagnóstico de IA (só evidências)", () => {
    const md = buildReport({
      pkg: { logAnalysis: fakeLog(["db-connection-lost"]), configs: [], correlations: [] },
      diagnosisMarkdown: null,
      diagnosisSources: [],
      now,
    });
    assert.match(md, /# Relatório técnico/);
    assert.ok(!md.includes("## Diagnóstico assistido por IA"));
  });
});
