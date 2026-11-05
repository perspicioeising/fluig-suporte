/**
 * Parser do server.log do Fluig (JBoss/WildFly). Função pura, sem I/O: recebe texto
 * (um pedaço ou o arquivo todo) e devolve eventos estruturados. Usado no navegador
 * (streaming) e nos testes.
 *
 * Formato de uma linha de evento:
 *   2026-07-09 08:12:19,659 INFO  [categoria] (thread) mensagem
 * Linhas sem esse prefixo (stack trace "\tat ...", "Caused by:", "... N more",
 * mensagens multilinha) pertencem ao evento anterior.
 */

export const LOG_LEVELS = ["ERROR", "FATAL", "WARN", "INFO", "DEBUG", "TRACE"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogEvent = {
  /** ISO 8601 em horário local do log (sem fuso; o log não informa offset). */
  timestamp: string;
  /** epoch ms (para ordenar e agrupar na timeline). */
  epochMs: number;
  level: LogLevel;
  category: string;
  thread: string;
  message: string;
  /** Linhas de continuação (stack trace etc.), sem o prefixo. */
  detail: string;
  /** Nº da primeira linha no arquivo (1-based), para localização. */
  line: number;
};

// 2026-07-09 08:12:19,659 INFO  [cat] (thread) msg   (ms com , ou .)
const HEAD = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s+([A-Z]+)\s+\[([^\]]*)\]\s+(?:\(([^)]*)\)\s+)?(.*)$/;

function toLevel(raw: string): LogLevel {
  const up = raw.toUpperCase();
  return (LOG_LEVELS as readonly string[]).includes(up) ? (up as LogLevel) : "INFO";
}

/** Converte os grupos de data em epoch ms (tratado como UTC: comparações relativas são o que importa). */
function epochOf(y: string, mo: string, d: string, h: string, mi: string, s: string, ms: string): number {
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms);
}

export type ParseResult = {
  events: LogEvent[];
  /** Linhas de continuação antes do primeiro evento (arquivo começando no meio). */
  leadingOrphans: string[];
};

/**
 * Interpreta texto de log. `startLine` permite numerar corretamente quando se processa
 * em pedaços. Retorna também um "parser incremental" via parseLogChunked para streaming.
 */
export function parseLog(text: string, startLine = 1): ParseResult {
  const parser = new ChunkedLogParser(startLine);
  parser.push(text);
  const events = parser.finish();
  return { events, leadingOrphans: parser.leadingOrphans };
}

/**
 * Parser incremental para streaming: alimente com `push(chunk)` (pedaços de texto que
 * podem cortar linhas no meio) e chame `finish()` no fim. Mantém na memória só o evento
 * aberto no momento, não o arquivo inteiro.
 */
export class ChunkedLogParser {
  private buffer = "";
  private current: LogEvent | null = null;
  private lineNo: number;
  readonly leadingOrphans: string[] = [];
  private sawFirstEvent = false;
  private emitted: LogEvent[] = [];
  private onEvent?: (e: LogEvent) => void;

  constructor(startLine = 1, onEvent?: (e: LogEvent) => void) {
    this.lineNo = startLine;
    this.onEvent = onEvent;
  }

  push(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).replace(/\r$/, "");
      this.buffer = this.buffer.slice(nl + 1);
      this.consume(line, this.lineNo);
      this.lineNo++;
    }
  }

  private consume(line: string, lineNo: number): void {
    const m = HEAD.exec(line);
    if (m) {
      this.flush();
      this.sawFirstEvent = true;
      this.current = {
        timestamp: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}`,
        epochMs: epochOf(m[1], m[2], m[3], m[4], m[5], m[6], m[7]),
        level: toLevel(m[8]),
        category: m[9] ?? "",
        thread: m[10] ?? "",
        message: m[11] ?? "",
        detail: "",
        line: lineNo,
      };
    } else if (this.current) {
      this.current.detail += (this.current.detail ? "\n" : "") + line;
    } else if (!this.sawFirstEvent && line.trim()) {
      this.leadingOrphans.push(line);
    }
  }

  private flush(): void {
    if (!this.current) return;
    this.current.detail = this.current.detail.replace(/\s+$/, "");
    if (this.onEvent) this.onEvent(this.current);
    else this.emitted.push(this.current);
    this.current = null;
  }

  /** Processa o resto do buffer (última linha sem \n) e devolve os eventos acumulados. */
  finish(): LogEvent[] {
    if (this.buffer.length) {
      this.consume(this.buffer.replace(/\r$/, ""), this.lineNo);
      this.buffer = "";
    }
    this.flush();
    return this.emitted;
  }
}
