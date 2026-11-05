/**
 * Regras de validação dos arquivos de configuração do Fluig. Função pura.
 * Cada regra aponta um FATO observável; não conclui causa sem evidência.
 *
 * Regra de versão (informada pelo usuário / cliente):
 *  - standalone.xml → Fluig 2.0+
 *  - domain.xml + host.xml → até 1.8.2 (modo domain)
 */

import { KIND_INFO, parseMemory, type ParsedConfig } from "./config-parser";
import type { Severity } from "./known-issues";

export type ConfigIssue = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Procedimento oficial, quando houver. */
  reference?: string;
};

/** Categorias de logger do Fluig cujos logs o suporte costuma precisar. */
const FLUIG_LOG_CATEGORIES = [
  "com.datasul.technology.webdesk.workflow",
  "com.datasul.technology.webdesk.customization",
  "com.datasul.technology.webdesk.dataset",
];

export type VersionContext = {
  /** Versão do Fluig informada pelo analista (ex.: "2.0.0", "1.8.2"), ou null. */
  fluigVersion: string | null;
  /** RAM total da máquina informada, em GB, ou null. */
  ramGb: number | null;
};

function majorMinor(version: string | null): [number, number] | null {
  if (!version) return null;
  const m = /(\d+)\.(\d+)/.exec(version);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** true se a versão informada é 2.0 ou maior. */
function isV2Plus(version: string | null): boolean | null {
  const mm = majorMinor(version);
  return mm ? mm[0] >= 2 : null;
}

export function validateConfig(config: ParsedConfig, ctx: VersionContext = { fluigVersion: null, ramGb: null }): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const add = (i: ConfigIssue) => issues.push(i);

  // 1. Coerência de versão x tipo de arquivo
  const v2 = isV2Plus(ctx.fluigVersion);
  if (v2 !== null) {
    if (config.kind === "standalone" && v2 === false) {
      add({
        id: "version-standalone-old",
        severity: "alta",
        title: "standalone.xml com versão informada anterior à 2.0",
        detail: `Você informou a versão ${ctx.fluigVersion}, mas standalone.xml é usado a partir da 2.0. Até a 1.8.2 a configuração fica em domain.xml + host.xml.`,
      });
    }
    if ((config.kind === "domain" || config.kind === "host") && v2 === true) {
      add({
        id: "version-domain-new",
        severity: "alta",
        title: `${KIND_INFO[config.kind].label} com versão informada 2.0 ou superior`,
        detail: `Você informou a versão ${ctx.fluigVersion}. A partir da 2.0 a configuração foi unificada em standalone.xml; ${KIND_INFO[config.kind].label} é de versões até a 1.8.2.`,
      });
    }
  }

  // 2. Memória (só faz sentido no .conf)
  if (config.jvm) {
    const xmx = parseMemory(config.jvm.xmx);
    const xms = parseMemory(config.jvm.xms);
    const ram = ctx.ramGb != null ? ctx.ramGb * 2 ** 30 : null;
    if (xmx && ram && xmx > ram) {
      add({
        id: "xmx-above-ram",
        severity: "alta",
        title: "Memória máxima da JVM acima da RAM informada",
        detail: `-Xmx está em ${config.jvm.xmx}, acima da RAM informada (${ctx.ramGb} GB). A JVM pode não iniciar ou o SO pode derrubar o processo.`,
      });
    }
    if (xmx && ram && xmx <= ram && xmx > ram * 0.9) {
      add({
        id: "xmx-near-ram",
        severity: "media",
        title: "Memória máxima da JVM muito próxima da RAM total",
        detail: `-Xmx (${config.jvm.xmx}) ocupa mais de 90% da RAM (${ctx.ramGb} GB), deixando pouco para o SO e o cache. Considere folga.`,
      });
    }
    if (xms && xmx && xms > xmx) {
      add({
        id: "xms-above-xmx",
        severity: "alta",
        title: "Memória inicial maior que a máxima",
        detail: `-Xms (${config.jvm.xms}) é maior que -Xmx (${config.jvm.xmx}); a JVM não inicia com essa combinação.`,
      });
    }
    if (!xmx) {
      add({
        id: "no-xmx",
        severity: "media",
        title: "-Xmx não definido no standalone.conf",
        detail: "Não foi encontrado -Xmx no JAVA_OPTS. Sem limite explícito, o dimensionamento de memória fica imprevisível.",
      });
    }
  }

  // 3. Datasources (XML)
  for (const ds of config.datasources) {
    const label = ds.poolName || ds.jndi || "(sem nome)";
    if (!ds.connectionUrl) {
      add({ id: `ds-no-url-${label}`, severity: "alta", title: `Datasource "${label}" sem connection-url`, detail: "O datasource não tem URL de conexão definida." });
    }
    if (ds.maxPoolSize != null && ds.maxPoolSize < 10 && ds.jndi.includes("Fluig")) {
      add({
        id: `ds-small-pool-${label}`,
        severity: "media",
        title: `Pool pequeno no datasource "${label}"`,
        detail: `max-pool-size = ${ds.maxPoolSize}. Em produção, um pool muito pequeno pode causar espera por conexão sob carga.`,
      });
    }
    if (ds.minPoolSize != null && ds.maxPoolSize != null && ds.minPoolSize > ds.maxPoolSize) {
      add({
        id: `ds-pool-inverted-${label}`,
        severity: "alta",
        title: `Pool invertido no datasource "${label}"`,
        detail: `min-pool-size (${ds.minPoolSize}) é maior que max-pool-size (${ds.maxPoolSize}).`,
      });
    }
    if (/useSSL=false/i.test(ds.connectionUrl)) {
      add({
        id: `ds-nossl-${label}`,
        severity: "baixa",
        title: `Conexão sem SSL no datasource "${label}"`,
        detail: "A connection-url usa useSSL=false. Avalie se o tráfego com o banco deveria ser criptografado neste ambiente.",
      });
    }
    if (ds.userName && /^(root|sa|admin)$/i.test(ds.userName)) {
      add({
        id: `ds-superuser-${label}`,
        severity: "baixa",
        title: `Datasource "${label}" conecta com usuário privilegiado`,
        detail: `O usuário do banco é "${ds.userName}". Por boa prática, use um usuário dedicado com permissões mínimas.`,
      });
    }
  }

  // 4. Loggers do Fluig desligados (explica "logs não aparecem")
  if (config.kind === "standalone" || config.kind === "domain") {
    const configured = new Map(config.loggers.map((l) => [l.category, l.level]));
    const off = FLUIG_LOG_CATEGORIES.filter((cat) => {
      const level = configured.get(cat);
      return level && /^(OFF|ERROR|FATAL)$/i.test(level);
    });
    if (off.length > 0) {
      add({
        id: "fluig-loggers-off",
        severity: "media",
        title: "Logger de categoria do Fluig em nível alto demais",
        detail: `As categorias ${off.join(", ")} estão em nível que suprime INFO/WARN. Isso pode fazer parecer que "os logs não aparecem" para workflow, customização ou dataset.`,
        reference: "https://centraldeatendimento.totvs.com/hc/pt-br/articles/27662259465751",
      });
    }
  }

  return issues;
}
