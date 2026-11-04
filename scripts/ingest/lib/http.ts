const USER_AGENT =
  "FluigIntegrationStudio-Ingest/1.0 (leitura de documentacao publica; uso interno)";

const DELAY_MS = 350;
const MAX_ATTEMPTS = 3;

let lastRequestAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Baixa texto de uma URL pública respeitando um intervalo mínimo entre
 * requisições. NÃO tenta contornar bloqueios: respostas 403/429 (inclusive
 * desafios de bot) são tratadas como falha.
 */
export async function fetchText(url: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const wait = lastRequestAt + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        signal: AbortSignal.timeout(60_000),
      });

      if (response.ok) return await response.text();

      // Erros definitivos: não adianta repetir.
      if (response.status === 403 || response.status === 404) {
        throw new FetchError(`HTTP ${response.status} em ${url}`, response.status);
      }
      lastError = new FetchError(`HTTP ${response.status} em ${url}`, response.status);
    } catch (error) {
      if (error instanceof FetchError && (error.status === 403 || error.status === 404)) {
        throw error;
      }
      lastError = error;
    }

    await sleep(1000 * attempt);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJson<T>(url: string): Promise<T> {
  const text = await fetchText(url);
  if (!text.trim()) throw new FetchError(`Resposta vazia em ${url}`);
  return JSON.parse(text) as T;
}
