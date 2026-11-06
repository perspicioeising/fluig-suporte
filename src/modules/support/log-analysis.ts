/**
 * Análise dos eventos do server.log: contagem por nível, erros agrupados por "assinatura"
 * (ignorando ids/datas/números que mudam), timeline por janela de tempo e painel do ambiente
 * extraído do bloco BootStrap. Funções puras.
 */

import { LOG_LEVELS, type LogEvent, type LogLevel } from "./log-parser";

/** Propriedades do ambiente que valem a pena destacar (chave no log -> rótulo). */
const ENV_KEYS: [string, string][] = [
  ["fluig.version", "Versão do Fluig"],
  ["fluig.version.name", "Codinome"],
  ["java.version", "Java"],
  ["java.vendor", "Fornecedor Java"],
  ["os.name", "Sistema operacional"],
  ["os.version", "Versão do SO"],
  ["user.timezone", "Fuso horário"],
  ["jboss.server.name", "Nome do servidor"],
  ["jboss.node.name", "Nó"],
  ["FLUIG_URL", "URL do Fluig"],
  ["org.jboss.boot.log.file", "Arquivo de log"],
];

export type EnvInfo = { label: string; key: string; value: string };

export type ErrorGroup = {
  signature: string;
  level: LogLevel;
  count: number;
  /** Mensagem representativa (a primeira ocorrência). */
  sample: string;
  category: string;
  /** Primeiro tipo de exceção identificado, se houver. */
  exception: string | null;
  firstEpochMs: number;
  lastEpochMs: number;
  firstLine: number;
};

export type TimelineBucket = {
  startEpochMs: number;
  total: number;
  errors: number;
  warns: number;
};

/** Um reinício (start) do servidor detectado no log, com o contexto que o antecede. */
export type Restart = {
  /** Momento do start detectado. */
  epochMs: number;
  line: number;
  /** Como o start foi reconhecido ("up and running" do Fluig ou WildFly "started"). */
  via: "fluig-bootstrap" | "wildfly-started";
  /** Shutdown/parada detectado imediatamente antes, se houver (limpo = restart planejado). */
  precededByShutdown: boolean;
  /** Houve OOM ou FATAL nos segundos anteriores ao start (indício de crash). */
  precededByCrashSignal: "oom" | "fatal" | null;
  /** Tempo de indisponibilidade estimado (ms) entre a parada e este start, se mensurável. */
  downtimeMs: number | null;
};

export type AvailabilityAnalysis = {
  restarts: Restart[];
  /** true quando há vários reinícios em janela curta (instabilidade/crash loop). */
  crashLoop: boolean;
};

export type LogSummary = {
  totalEvents: number;
  counts: Record<LogLevel, number>;
  /** Intervalo coberto pelo log. */
  firstEpochMs: number | null;
  lastEpochMs: number | null;
  environment: EnvInfo[];
  /** Grupos de ERROR/FATAL/WARN, do mais frequente ao menos. */
  errorGroups: ErrorGroup[];
  timeline: TimelineBucket[];
  bucketMs: number;
  /** Reinícios do servidor e indisponibilidade inferida a partir deles. */
  availability: AvailabilityAnalysis;
};

const EXCEPTION_RE = /\b([a-zA-Z_][\w.]*\.(?:[A-Z]\w*)?(?:Exception|Error))\b/;

/** Normaliza a mensagem para agrupar ocorrências equivalentes: remove números, uuids, aspas, hex. */
export function signatureOf(event: Pick<LogEvent, "message" | "category">): string {
  const base = event.message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b0x[0-9a-fA-F]+\b/g, "<hex>")
    .replace(/\b\d[\d.,:]*\b/g, "<n>")
    .replace(/["'`][^"'`]*["'`]/g, "<str>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return `${event.category}|${base}`;
}

function firstException(event: LogEvent): string | null {
  return EXCEPTION_RE.exec(event.message)?.[1] ?? EXCEPTION_RE.exec(event.detail)?.[1] ?? null;
}

/** Extrai o painel do ambiente do bloco BootStrap (linhas "chave=valor"). */
export function extractEnvironment(events: LogEvent[]): EnvInfo[] {
  const found = new Map<string, string>();
  for (const e of events) {
    if (!e.category.includes("BootStrap")) continue;
    const eq = e.message.indexOf("=");
    if (eq <= 0) continue;
    const key = e.message.slice(0, eq).trim();
    const value = e.message.slice(eq + 1).trim();
    if (value && !found.has(key)) found.set(key, value);
  }
  return ENV_KEYS.filter(([key]) => found.has(key)).map(([key, label]) => ({
    key,
    label,
    value: found.get(key)!,
  }));
}

// Marcadores de disponibilidade do servidor (WildFly/JBoss + Fluig).
// "up and running": o Fluig terminou de subir e está atendendo (marcador definitivo).
const UP_AND_RUNNING_RE = /up and running|is up and running|fluig .*(?:iniciad|dispon[íi]vel)|plataforma .*(?:iniciad|no ar)/i;
// WildFly terminou de subir ("started in N ms"): serviço de aplicação pronto.
const WILDFLY_STARTED_RE = /WFLYSRV0025|started in \d+ms|started \(with errors\) in \d+ms/i;
// Parada do servidor (shutdown limpo = manutenção; sem isso antes de um start = possível crash).
const SHUTDOWN_RE = /WFLYSRV0050|stopped in \d+ms|Shutdown|shutting down|JBAS015950|Undeploying/i;

/** Janela (ms) para considerar reinícios próximos como instabilidade/crash loop. */
const CRASH_LOOP_WINDOW_MS = 30 * 60_000;
/** A partir de quantos reinícios na janela consideramos crash loop. */
const CRASH_LOOP_MIN = 3;

/**
 * Detecta reinícios do servidor e infere a indisponibilidade a partir deles — NÃO a partir
 * de silêncio no log (o Fluig reinicia rápido e volta a escrever logo). O sinal confiável é
 * o próprio ciclo parada/subida: medimos o tempo até o "up and running" e sinalizamos quando
 * há vários reinícios em janela curta (crash loop).
 */
export function analyzeAvailability(events: LogEvent[]): AvailabilityAnalysis {
  // Momentos-chave em ordem cronológica.
  let lastShutdownMs: number | null = null;
  let lastShutdownIdx = -1;
  let lastOomMs: number | null = null;
  let lastFatalMs: number | null = null;
  // Evita contar o mesmo ciclo de subida várias vezes (bootstrap + starting + started juntos).
  let lastRestartMs: number | null = null;

  const restarts: Restart[] = [];

  // Conta reinícios pelo marco de CONCLUSÃO da subida ("up and running" / WildFly started):
  // é quando o serviço volta a atender. O BootStrap/starting só marca o começo e aparece em
  // todo boot (inclusive o primeiro, normal), então não é usado como gatilho de reinício.
  const isUp = (e: LogEvent) => UP_AND_RUNNING_RE.test(e.message) || WILDFLY_STARTED_RE.test(e.message);
  const via = (e: LogEvent): Restart["via"] =>
    UP_AND_RUNNING_RE.test(e.message) ? "fluig-bootstrap" : "wildfly-started";

  for (const e of events) {
    // sinais de crash que podem explicar um reinício logo em seguida
    if (/OutOfMemoryError|Java heap space|Metaspace|GC overhead limit exceeded/i.test(e.message)) lastOomMs = e.epochMs;
    if (e.level === "FATAL") lastFatalMs = e.epochMs;
    if (SHUTDOWN_RE.test(e.message)) {
      lastShutdownMs = e.epochMs;
      lastShutdownIdx = restarts.length;
    }

    if (!isUp(e)) continue;

    // Agrupa marcos próximos do MESMO ciclo (ex.: "started in" seguido de "up and running") num reinício só.
    if (lastRestartMs !== null && e.epochMs - lastRestartMs < 2 * 60_000) continue;

    const crashSignal: Restart["precededByCrashSignal"] =
      lastOomMs !== null && e.epochMs - lastOomMs < 5 * 60_000
        ? "oom"
        : lastFatalMs !== null && e.epochMs - lastFatalMs < 5 * 60_000
          ? "fatal"
          : null;

    const precededByShutdown = lastShutdownMs !== null && e.epochMs - lastShutdownMs < 10 * 60_000;
    const downtimeMs = precededByShutdown && lastShutdownMs !== null ? e.epochMs - lastShutdownMs : null;

    restarts.push({
      epochMs: e.epochMs,
      line: e.line,
      via: via(e),
      precededByShutdown,
      precededByCrashSignal: crashSignal,
      downtimeMs,
    });
    lastRestartMs = e.epochMs;
    // consome o shutdown já associado
    if (lastShutdownIdx >= 0) lastShutdownMs = null;
  }

  // Crash loop: CRASH_LOOP_MIN+ reinícios dentro de uma janela deslizante curta.
  let crashLoop = false;
  for (let i = 0; i < restarts.length; i++) {
    const windowEnd = restarts[i].epochMs + CRASH_LOOP_WINDOW_MS;
    const inWindow = restarts.filter((r) => r.epochMs >= restarts[i].epochMs && r.epochMs <= windowEnd).length;
    if (inWindow >= CRASH_LOOP_MIN) {
      crashLoop = true;
      break;
    }
  }

  return { restarts, crashLoop };
}

/** Escolhe uma janela de tempo (bucket) para ~120 pontos na timeline. */
function chooseBucket(spanMs: number): number {
  const target = spanMs / 120;
  const steps = [1_000, 5_000, 15_000, 30_000, 60_000, 300_000, 900_000, 1_800_000, 3_600_000, 21_600_000, 86_400_000];
  return steps.find((s) => s >= target) ?? steps[steps.length - 1];
}

export function analyzeEvents(events: LogEvent[]): LogSummary {
  const counts = Object.fromEntries(LOG_LEVELS.map((l) => [l, 0])) as Record<LogLevel, number>;
  let first: number | null = null;
  let last: number | null = null;

  const groups = new Map<string, ErrorGroup>();

  for (const e of events) {
    counts[e.level]++;
    if (first === null || e.epochMs < first) first = e.epochMs;
    if (last === null || e.epochMs > last) last = e.epochMs;

    if (e.level === "ERROR" || e.level === "FATAL" || e.level === "WARN") {
      const sig = signatureOf(e);
      const existing = groups.get(sig);
      if (existing) {
        existing.count++;
        existing.lastEpochMs = Math.max(existing.lastEpochMs, e.epochMs);
        existing.firstEpochMs = Math.min(existing.firstEpochMs, e.epochMs);
      } else {
        groups.set(sig, {
          signature: sig,
          level: e.level,
          count: 1,
          sample: e.message.slice(0, 300),
          category: e.category,
          exception: firstException(e),
          firstEpochMs: e.epochMs,
          lastEpochMs: e.epochMs,
          firstLine: e.line,
        });
      }
    }
  }

  const severityRank: Record<string, number> = { FATAL: 0, ERROR: 1, WARN: 2 };
  const errorGroups = [...groups.values()].sort(
    (a, b) => b.count - a.count || severityRank[a.level] - severityRank[b.level],
  );

  // Timeline
  const bucketMs = first !== null && last !== null && last > first ? chooseBucket(last - first) : 60_000;
  const timeline: TimelineBucket[] = [];
  if (first !== null && last !== null) {
    const bucketIndex = new Map<number, TimelineBucket>();
    for (const e of events) {
      const start = Math.floor(e.epochMs / bucketMs) * bucketMs;
      let b = bucketIndex.get(start);
      if (!b) {
        b = { startEpochMs: start, total: 0, errors: 0, warns: 0 };
        bucketIndex.set(start, b);
      }
      b.total++;
      if (e.level === "ERROR" || e.level === "FATAL") b.errors++;
      else if (e.level === "WARN") b.warns++;
    }
    timeline.push(...[...bucketIndex.values()].sort((a, b) => a.startEpochMs - b.startEpochMs));
  }

  return {
    totalEvents: events.length,
    counts,
    firstEpochMs: first,
    lastEpochMs: last,
    environment: extractEnvironment(events),
    errorGroups,
    timeline,
    bucketMs,
    availability: analyzeAvailability(events),
  };
}
