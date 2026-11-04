import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Modelo padrão: claude-sonnet-5-5 (listado para a chave do projeto em /v1/models).
 * Pode ser trocado sem alterar código com a variável ANTHROPIC_MODEL.
 */
export const CHAT_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
export const MAX_OUTPUT_TOKENS = 2048;

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  client = new Anthropic({ apiKey });
  return client;
}
