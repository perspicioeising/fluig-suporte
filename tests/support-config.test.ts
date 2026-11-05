import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseConfig, maskConfigSecrets, parseMemory } from "@/modules/support/config-parser";
import { validateConfig } from "@/modules/support/config-validation";

const STANDALONE = `<?xml version='1.0' encoding='UTF-8'?>
<server xmlns="urn:jboss:domain:10.0">
  <profile>
    <subsystem xmlns="urn:jboss:domain:logging:8.0">
      <logger category="com.datasul.technology.webdesk.dataset"><level name="OFF"/></logger>
      <logger category="com.arjuna"><level name="WARN"/></logger>
      <root-logger><level name="INFO"/></root-logger>
    </subsystem>
    <subsystem xmlns="urn:jboss:domain:datasources:5.0">
      <datasources>
        <datasource jta="true" jndi-name="java:/jdbc/FluigDS" pool-name="FluigDS" enabled="true">
          <connection-url>jdbc:mysql://localhost:3306/fluig_prod?useSSL=false</connection-url>
          <driver>mysqlDriver</driver>
          <pool><min-pool-size>10</min-pool-size><max-pool-size>200</max-pool-size></pool>
          <security><user-name>root</user-name><password>segredo123</password></security>
        </datasource>
      </datasources>
    </subsystem>
  </profile>
  <!-- host interno do undertow: NÃO é a raiz -->
  <subsystem xmlns="urn:jboss:domain:undertow:9.0">
    <server name="default-server"><host name="default-host" alias="localhost"/></server>
  </subsystem>
</server>`;

const CONF = `JBOSS_HOME="/app/fluig/appserver"
JAVA_HOME="/app/fluig/jdk-64"
FLUIG_SERVER_MEMORY_MIN="4G"
FLUIG_SERVER_MEMORY_MAX="16G"
JAVA_OPTS="-Xms4G -Xmx16G -XX:MetaspaceSize=96M -XX:MaxMetaspaceSize=1024m -Djava.net.preferIPv4Stack=true"`;

describe("parser de configuração", () => {
  test("detecta standalone pela raiz <server> (ignora <host> interno do undertow)", () => {
    const c = parseConfig(STANDALONE, "standalone.xml");
    assert.equal(c.kind, "standalone");
    assert.equal(c.rootNamespace, "urn:jboss:domain:10.0");
  });

  test("detecta domain e host pela raiz", () => {
    assert.equal(parseConfig(`<?xml version="1.0"?><domain xmlns="urn:jboss:domain:10.0"></domain>`).kind, "domain");
    assert.equal(parseConfig(`<?xml version="1.0"?><host xmlns="urn:jboss:domain:10.0" name="master"></host>`).kind, "host");
  });

  test("extrai datasources com pool e usuário", () => {
    const c = parseConfig(STANDALONE, "standalone.xml");
    assert.equal(c.datasources.length, 1);
    const ds = c.datasources[0];
    assert.equal(ds.poolName, "FluigDS");
    assert.equal(ds.driver, "mysqlDriver");
    assert.equal(ds.minPoolSize, 10);
    assert.equal(ds.maxPoolSize, 200);
    assert.equal(ds.userName, "root");
  });

  test("extrai loggers e root-logger", () => {
    const c = parseConfig(STANDALONE, "standalone.xml");
    assert.ok(c.loggers.some((l) => l.category.endsWith("dataset") && l.level === "OFF"));
    assert.equal(c.rootLoggerLevel, "INFO");
  });

  test("interpreta o standalone.conf (shell)", () => {
    const c = parseConfig(CONF, "standalone.conf");
    assert.equal(c.kind, "conf");
    assert.equal(c.jvm?.xmx, "16G");
    assert.equal(c.jvm?.xms, "4G");
    assert.equal(c.jvm?.metaspace, "96M");
    assert.equal(c.jvm?.javaHome, "/app/fluig/jdk-64");
  });

  test("maskConfigSecrets oculta senhas", () => {
    const masked = maskConfigSecrets(STANDALONE);
    assert.ok(!masked.includes("segredo123"));
    assert.match(masked, /<password>\*\*\*<\/password>/);
  });

  test("parseMemory converte unidades", () => {
    assert.equal(parseMemory("16G"), 16 * 2 ** 30);
    assert.equal(parseMemory("512m"), 512 * 2 ** 20);
    assert.equal(parseMemory("4096"), 4096);
    assert.equal(parseMemory("abc"), null);
  });

  test("XML malformado vira aviso, não exceção", () => {
    const c = parseConfig("<server><broken", "standalone.xml");
    assert.ok(c.warnings.length > 0);
  });
});

describe("validação de configuração", () => {
  const standalone = parseConfig(STANDALONE, "standalone.xml");
  const conf = parseConfig(CONF, "standalone.conf");

  test("acusa standalone.xml informado como versão < 2.0", () => {
    const issues = validateConfig(standalone, { fluigVersion: "1.8.2", ramGb: 8 });
    assert.ok(issues.some((i) => i.id === "version-standalone-old" && i.severity === "alta"));
  });

  test("não acusa incompatibilidade quando a versão bate", () => {
    const issues = validateConfig(standalone, { fluigVersion: "2.0.0", ramGb: 8 });
    assert.ok(!issues.some((i) => i.id.startsWith("version-")));
  });

  test("detecta Xmx acima da RAM e Xms > Xmx", () => {
    assert.ok(validateConfig(conf, { fluigVersion: "2.0.0", ramGb: 8 }).some((i) => i.id === "xmx-above-ram"));
    const inverted = parseConfig(`JAVA_OPTS="-Xms20G -Xmx8G"`, "standalone.conf");
    assert.ok(validateConfig(inverted, { fluigVersion: "2.0.0", ramGb: 64 }).some((i) => i.id === "xms-above-xmx"));
  });

  test("aponta logger do Fluig suprimido (logs não aparecem)", () => {
    const issues = validateConfig(standalone, { fluigVersion: "2.0.0", ramGb: 8 });
    const off = issues.find((i) => i.id === "fluig-loggers-off");
    assert.ok(off);
    assert.match(off.detail, /dataset/);
  });

  test("sinaliza useSSL=false e usuário root", () => {
    const issues = validateConfig(standalone, { fluigVersion: "2.0.0", ramGb: 8 });
    assert.ok(issues.some((i) => i.id.startsWith("ds-nossl-")));
    assert.ok(issues.some((i) => i.id.startsWith("ds-superuser-")));
  });

  test("sem versão/RAM informadas, não inventa achados de versão/memória", () => {
    const issues = validateConfig(standalone, { fluigVersion: null, ramGb: null });
    assert.ok(!issues.some((i) => i.id.startsWith("version-") || i.id.startsWith("xmx-")));
  });
});
