import * as z from "zod";
import { isIP } from "node:net";
import { isPublicAddress } from "@/lib/security/ssrf";
import { AUTH_TYPES, type AuthType } from "./constants";

/**
 * Normaliza e valida a URL base do ambiente. Retorna a URL sem barra final
 * ou lança um erro com mensagem amigável.
 */
export function normalizeBaseUrl(raw: string, authType: AuthType): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Informe uma URL válida (ex.: https://meu.fluig.com).");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("A URL deve começar com https:// ou http://.");
  }
  if (url.protocol === "http:" && authType !== "none") {
    throw new Error("Ambientes com autenticação exigem https (credenciais não podem trafegar em texto aberto).");
  }
  if (url.username || url.password) {
    throw new Error("Não inclua usuário e senha na URL.");
  }
  if (url.search || url.hash) {
    throw new Error("A URL base não pode ter query string nem fragmento.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Destinos internos não são permitidos.");
  }
  if (isIP(host) !== 0 && !isPublicAddress(host)) {
    throw new Error("Endereços IP internos não são permitidos.");
  }

  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.null(), z.undefined()])
  .transform((v) => v === "on" || v === "true");

export const EnvironmentSchema = z.object({
  name: z.string().trim().min(1, { error: "Informe o nome." }).max(120),
  base_url: z.string().trim().min(1, { error: "Informe a URL base." }).max(500),
  auth_type: z.enum(AUTH_TYPES, { error: "Tipo de autenticação inválido." }),
  allow_write_methods: checkbox,
  is_active: checkbox,
});

export const CredentialsSchemas = {
  none: z.object({}),
  basic: z.object({
    username: z.string().min(1, { error: "Informe o usuário." }).max(300),
    password: z.string().min(1, { error: "Informe a senha." }).max(500),
  }),
  bearer: z.object({
    token: z.string().min(1, { error: "Informe o token." }).max(4000),
  }),
  header: z.object({
    headerName: z
      .string()
      .min(1, { error: "Informe o nome do header." })
      .max(100)
      .regex(/^[A-Za-z0-9-]+$/, { error: "Nome de header inválido." }),
    headerValue: z.string().min(1, { error: "Informe o valor." }).max(4000),
  }),
  oauth1: z.object({
    consumerKey: z.string().min(1, { error: "Informe a consumer key." }).max(500),
    consumerSecret: z.string().min(1, { error: "Informe o consumer secret." }).max(500),
    token: z.string().max(500).optional(),
    tokenSecret: z.string().max(500).optional(),
  }),
} as const;
