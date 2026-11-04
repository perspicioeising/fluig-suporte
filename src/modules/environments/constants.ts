/** Constantes e tipos seguros para uso no navegador e no servidor. */

export const AUTH_TYPES = ["none", "basic", "bearer", "header", "oauth1"] as const;
export type AuthType = (typeof AUTH_TYPES)[number];

export const AUTH_LABELS: Record<AuthType, string> = {
  none: "Sem autenticação",
  basic: "Basic (usuário e senha)",
  bearer: "Bearer token",
  header: "Header personalizado",
  oauth1: "OAuth 1.0a",
};

export type EnvFormState =
  | { ok?: boolean; message?: string; errors?: Record<string, string[] | undefined> }
  | undefined;

export type EnvironmentSummary = {
  id: string;
  name: string;
  base_url: string;
  auth_type: AuthType;
  has_credentials: boolean;
  is_active: boolean;
  allow_write_methods: boolean;
};
