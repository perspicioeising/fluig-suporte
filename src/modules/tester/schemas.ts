import * as z from "zod";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Métodos que não alteram dados no servidor. */
export const READ_ONLY_METHODS: readonly HttpMethod[] = ["GET", "HEAD", "OPTIONS"];

export const BODY_TYPES = ["none", "json", "xml", "text", "form"] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const KeyValueSchema = z.object({
  key: z.string().max(200),
  value: z.string().max(4000),
  enabled: z.boolean(),
  /** Parâmetro obrigatório segundo a documentação (apenas para a interface). */
  required: z.boolean().optional(),
  /** Tipo e descrição vindos da documentação (apenas para a interface). */
  hint: z.string().max(300).optional(),
});
export type KeyValue = z.infer<typeof KeyValueSchema>;

// Caminho relativo ao ambiente: começa com "/", sem "//" inicial, sem
// barras invertidas nem caracteres de controle (evita trocar o host).
const PathSchema = z
  .string()
  .min(1)
  .max(2000)
  .regex(/^\/(?!\/)[^\\\u0000-\u001f]*$/, {
    error: "O caminho deve começar com uma única barra (/) e não pode conter caracteres inválidos.",
  });

export const ExecuteSchema = z.object({
  environmentId: z.uuid({ error: "Selecione um ambiente." }),
  method: z.enum(HTTP_METHODS),
  path: PathSchema,
  query: z.array(KeyValueSchema).max(50),
  headers: z.array(KeyValueSchema).max(50),
  bodyType: z.enum(BODY_TYPES),
  body: z.string().max(1_000_000).optional(),
});
export type ExecuteInput = z.infer<typeof ExecuteSchema>;

export const SaveRequestSchema = z.object({
  name: z.string().trim().min(1, { error: "Informe o nome da requisição." }).max(160),
  collectionId: z.uuid().optional(),
  newCollectionName: z.string().trim().max(120).optional(),
  environmentId: z.uuid().nullable().optional(),
  method: z.enum(HTTP_METHODS),
  path: PathSchema,
  query: z.array(KeyValueSchema).max(50),
  headers: z.array(KeyValueSchema).max(50),
  bodyType: z.enum(BODY_TYPES),
  body: z.string().max(1_000_000).optional(),
});
export type SaveRequestInput = z.infer<typeof SaveRequestSchema>;

export type ExecuteResponse = {
  status: number | null;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  /** Corpo textual (ou aviso para conteúdo binário). */
  body: string;
  truncated: boolean;
  error?: string;
  url: string;
  /** Registro correspondente em request_history (para o atalho de diagnóstico). */
  historyId?: string | null;
};

export type SavedRequest = {
  id: string;
  name: string;
  method: HttpMethod;
  path: string;
  query: KeyValue[];
  headers: KeyValue[];
  body_type: BodyType;
  body: string | null;
  environment_id: string | null;
};

export type CollectionWithRequests = {
  id: string;
  name: string;
  saved_requests: SavedRequest[];
};

export type HistoryItem = {
  id: string;
  environment_id: string | null;
  method: string;
  url: string;
  status_code: number | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
  request_headers: Record<string, string>;
  request_body: string | null;
};
