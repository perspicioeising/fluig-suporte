import "server-only";
import * as z from "zod";
import { createClient } from "@/lib/supabase/server";
import type { MessageShape, SoapOperation } from "./types";
import type { SoapOperationRecord, WsdlSummary } from "./schemas";

export async function listWsdls(): Promise<WsdlSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soap_wsdls")
    .select("id, name, target_namespace, created_at, soap_operations(count)")
    .order("name", { ascending: true });
  if (error) throw new Error("Não foi possível listar os WSDLs.");

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    target_namespace: row.target_namespace as string | null,
    created_at: row.created_at as string,
    operation_count: (row.soap_operations as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));
}

type OperationRow = {
  id: string;
  service_name: string;
  port_name: string | null;
  operation_name: string;
  soap_action: string | null;
  input_schema: {
    style?: SoapOperation["style"];
    use?: SoapOperation["use"];
    soapVersion?: SoapOperation["soapVersion"];
    endpoint?: string | null;
    documentation?: string | null;
    faults?: string[];
    shape?: MessageShape;
  } | null;
  output_schema: MessageShape | null;
};

const EMPTY_SHAPE: MessageShape = { wrapper: null, params: [] };

export function rowToOperation(row: OperationRow): SoapOperationRecord {
  const meta = row.input_schema ?? {};
  return {
    id: row.id,
    service: row.service_name,
    port: row.port_name ?? "",
    name: row.operation_name,
    soapAction: row.soap_action ?? "",
    style: meta.style ?? "document",
    use: meta.use ?? "literal",
    soapVersion: meta.soapVersion ?? "1.1",
    endpoint: meta.endpoint ?? null,
    input: meta.shape ?? EMPTY_SHAPE,
    output: row.output_schema ?? EMPTY_SHAPE,
    faults: meta.faults ?? [],
    documentation: meta.documentation ?? undefined,
  };
}

export async function getOperations(wsdlId: string): Promise<SoapOperationRecord[]> {
  // O id vem da URL: valida antes de consultar.
  if (!z.uuid().safeParse(wsdlId).success) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soap_operations")
    .select("id, service_name, port_name, operation_name, soap_action, input_schema, output_schema")
    .eq("wsdl_id", wsdlId)
    .order("operation_name", { ascending: true });
  if (error) throw new Error("Não foi possível listar as operações.");

  return (data as unknown as OperationRow[]).map(rowToOperation);
}
