import * as z from "zod";
import type { ExecuteResponse } from "@/modules/tester/schemas";
import type { SoapFault } from "./envelope";
import type { SoapOperation } from "./types";

const PathSchema = z
  .string()
  .min(1)
  .max(2000)
  .regex(/^\/(?!\/)[^\\\u0000-\u001f]*$/, {
    error: "O caminho deve começar com uma única barra (/) e não pode conter caracteres inválidos.",
  });

export const SoapExecuteSchema = z
  .object({
    environmentId: z.uuid({ error: "Selecione um ambiente." }),
    /** Operação importada: o servidor usa SOAPAction/endpoint do banco. */
    operationId: z.uuid().optional(),
    /** Chamada avulsa (sem operação importada). */
    endpointPath: PathSchema.optional(),
    soapAction: z.string().max(500).optional(),
    envelope: z.string().min(1, { error: "O envelope está vazio." }).max(1_000_000),
  })
  .refine((v) => v.operationId || v.endpointPath, {
    error: "Informe uma operação importada ou o caminho do endpoint.",
  });
export type SoapExecuteInput = z.infer<typeof SoapExecuteSchema>;

export type SoapExecuteResponse = ExecuteResponse & {
  operation: string;
  fault: SoapFault | null;
};

export type WsdlSummary = {
  id: string;
  name: string;
  target_namespace: string | null;
  created_at: string;
  operation_count: number;
};

export type SoapOperationRecord = SoapOperation & { id: string };

export type SoapImportState =
  | { ok?: boolean; message?: string; warnings?: string[] }
  | undefined;
