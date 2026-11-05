/**
 * Parser dos arquivos de configuração do Fluig (JBoss/WildFly): standalone.xml (2.0+),
 * domain.xml + host.xml (até 1.8.2) e standalone.conf. Função pura (sem I/O).
 * Extrai os pontos que importam para o suporte e MASCARA segredos (senhas de datasource).
 */

import { XMLParser } from "fast-xml-parser";

export type ConfigFileKind = "standalone" | "domain" | "host" | "conf" | "desconhecido";

/** Família de arquivo por versão do Fluig. */
export const KIND_INFO: Record<ConfigFileKind, { label: string; versionHint: string | null }> = {
  standalone: { label: "standalone.xml", versionHint: "2.0+" },
  domain: { label: "domain.xml", versionHint: "até 1.8.2" },
  host: { label: "host.xml", versionHint: "até 1.8.2" },
  conf: { label: "standalone.conf", versionHint: null },
  desconhecido: { label: "arquivo desconhecido", versionHint: null },
};

export type Datasource = {
  poolName: string;
  jndi: string;
  driver: string;
  connectionUrl: string;
  userName: string | null;
  minPoolSize: number | null;
  maxPoolSize: number | null;
  enabled: boolean;
  jta: boolean;
};

export type LoggerConfig = { category: string; level: string };

export type ParsedConfig = {
  kind: ConfigFileKind;
  /** Versão do namespace raiz (ex.: "urn:jboss:domain:10.0"). */
  rootNamespace: string | null;
  datasources: Datasource[];
  loggers: LoggerConfig[];
  rootLoggerLevel: string | null;
  /** Memória/JVM (só do .conf). */
  jvm: {
    memoryMin: string | null;
    memoryMax: string | null;
    xms: string | null;
    xmx: string | null;
    metaspace: string | null;
    maxMetaspace: string | null;
    javaHome: string | null;
    jbossHome: string | null;
  } | null;
  warnings: string[];
};

const PASSWORD_RE = /(<password>)([\s\S]*?)(<\/password>)/gi;

/** Oculta senhas de datasource antes de qualquer exibição. Pura. */
export function maskConfigSecrets(xml: string): string {
  return xml.replace(PASSWORD_RE, (_m, a, _v, c) => `${a}***${c}`);
}

function num(v: unknown): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: true,
  trimValues: true,
  // Mantém só o nome local das tags (sem prefixo de namespace), para navegar sem saber o prefixo.
  transformTagName: (tag) => tag.replace(/^.*:/, ""),
});

/**
 * Descobre o tipo pela RAIZ (primeiro elemento após a declaração <?xml?>), não por qualquer
 * ocorrência: standalone usa <server>, domain usa <domain>, host usa <host>. Cuidado: há um
 * <host> interno no subsistema undertow do standalone — por isso ancoramos na raiz.
 */
function detectKind(xml: string): { kind: ConfigFileKind; rootNamespace: string | null } {
  // remove declaração XML e comentários iniciais, pega o primeiro elemento de abertura
  const withoutProlog = xml.replace(/^\uFEFF/, "").replace(/<\?xml[\s\S]*?\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const root = /<(?:[\w.-]+:)?([A-Za-z][\w.-]*)\b[^>]*>/.exec(withoutProlog);
  if (!root) return { kind: "desconhecido", rootNamespace: null };
  const tag = root[1].replace(/^.*:/, "").toLowerCase();
  const ns = /xmlns="([^"]+)"/.exec(root[0])?.[1] ?? null;
  const kind: ConfigFileKind =
    tag === "server" ? "standalone" : tag === "domain" ? "domain" : tag === "host" ? "host" : "desconhecido";
  return { kind, rootNamespace: ns };
}

/** Procura recursivamente todos os nós com um dado nome local (após transformTagName). */
function findAll(node: unknown, name: string, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!node || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === name) for (const v of asArray(value)) if (v && typeof v === "object") out.push(v as Record<string, unknown>);
    for (const v of asArray(value)) findAll(v, name, out);
  }
  return out;
}

function parseDatasources(tree: unknown, warnings: string[]): Datasource[] {
  const nodes = findAll(tree, "datasource");
  const out: Datasource[] = [];
  for (const ds of nodes) {
    const pool = asArray(ds["pool"])[0] as Record<string, unknown> | undefined;
    const security = asArray(ds["security"])[0] as Record<string, unknown> | undefined;
    out.push({
      poolName: String(ds["@_pool-name"] ?? ""),
      jndi: String(ds["@_jndi-name"] ?? ""),
      driver: String(asArray(ds["driver"])[0] ?? ""),
      connectionUrl: String(asArray(ds["connection-url"])[0] ?? ""),
      userName: security?.["user-name"] != null ? String(security["user-name"]) : null,
      minPoolSize: pool ? num(pool["min-pool-size"]) : null,
      maxPoolSize: pool ? num(pool["max-pool-size"]) : null,
      enabled: String(ds["@_enabled"] ?? "true") !== "false",
      jta: String(ds["@_jta"] ?? "false") === "true",
    });
  }
  if (nodes.length === 0) warnings.push("Nenhum datasource encontrado no arquivo.");
  return out;
}

function parseLoggers(tree: unknown): { loggers: LoggerConfig[]; rootLevel: string | null } {
  const loggers = findAll(tree, "logger").map((l) => ({
    category: String(l["@_category"] ?? ""),
    level: String((asArray(l["level"])[0] as Record<string, unknown> | undefined)?.["@_name"] ?? ""),
  }));
  const root = findAll(tree, "root-logger")[0];
  const rootLevel = root ? String((asArray(root["level"])[0] as Record<string, unknown> | undefined)?.["@_name"] ?? "") : null;
  return { loggers: loggers.filter((l) => l.category && l.level), rootLevel: rootLevel || null };
}

/** standalone.conf: shell script — extrai por regex (não é XML). */
function parseConf(text: string): ParsedConfig {
  const pick = (re: RegExp) => re.exec(text)?.[1]?.trim() ?? null;
  const javaOpts = text.match(/JAVA_OPTS="([^"]*)"/g)?.join(" ") ?? "";
  return {
    kind: "conf",
    rootNamespace: null,
    datasources: [],
    loggers: [],
    rootLoggerLevel: null,
    jvm: {
      memoryMin: pick(/FLUIG_SERVER_MEMORY_MIN="?([^"\n]+)"?/),
      memoryMax: pick(/FLUIG_SERVER_MEMORY_MAX="?([^"\n]+)"?/),
      // [^\s"] para não capturar a aspa de fechamento do JAVA_OPTS quando a flag é o último token.
      xms: /-Xms([^\s"]+)/.exec(javaOpts)?.[1] ?? null,
      xmx: /-Xmx([^\s"]+)/.exec(javaOpts)?.[1] ?? null,
      metaspace: /-XX:MetaspaceSize=([^\s"]+)/.exec(javaOpts)?.[1] ?? null,
      maxMetaspace: /-XX:MaxMetaspaceSize=([^\s"]+)/.exec(javaOpts)?.[1] ?? null,
      javaHome: pick(/JAVA_HOME="?([^"\n]+)"?/),
      jbossHome: pick(/JBOSS_HOME="?([^"\n]+)"?/),
    },
    warnings: [],
  };
}

/** Interpreta um arquivo de configuração. `fileName` ajuda a decidir entre .conf e XML. */
export function parseConfig(content: string, fileName = ""): ParsedConfig {
  const text = content.trim();
  const looksXml = text.startsWith("<") || /\.(xml)$/i.test(fileName);
  if (!looksXml || /\.conf$/i.test(fileName)) {
    if (/JAVA_OPTS|JBOSS_HOME|FLUIG_SERVER_MEMORY/.test(text)) return parseConf(text);
  }

  const { kind, rootNamespace } = detectKind(text);
  const warnings: string[] = [];
  if (kind === "desconhecido") {
    warnings.push("Não foi possível reconhecer a raiz (standalone, domain ou host).");
    return { kind, rootNamespace, datasources: [], loggers: [], rootLoggerLevel: null, jvm: null, warnings };
  }

  let tree: unknown;
  try {
    tree = parser.parse(text);
  } catch {
    warnings.push("XML inválido ou malformado.");
    return { kind, rootNamespace, datasources: [], loggers: [], rootLoggerLevel: null, jvm: null, warnings };
  }

  const datasources = parseDatasources(tree, warnings);
  const { loggers, rootLevel } = parseLoggers(tree);

  return { kind, rootNamespace, datasources, loggers, rootLoggerLevel: rootLevel, jvm: null, warnings };
}

/** "16G"/"4096m"/"512M" -> bytes (aproximado). null se não reconhecer. */
export function parseMemory(value: string | null): number | null {
  if (!value) return null;
  const m = /^(\d+(?:\.\d+)?)\s*([kmgt])?b?$/i.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  const mult = unit === "t" ? 2 ** 40 : unit === "g" ? 2 ** 30 : unit === "m" ? 2 ** 20 : unit === "k" ? 2 ** 10 : 1;
  return n * mult;
}
