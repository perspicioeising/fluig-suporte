import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getEntry } from "@/modules/catalog/queries";
import { rowToOperation } from "@/modules/soap/queries";
import type { BuilderEntry, SdkAccessor } from "./types";

const IDENT = /^[A-Za-z0-9_]+$/;

/** Reúne tudo que o gerador precisa sobre uma entrada do catálogo. */
export async function getBuilderEntry(id: string): Promise<BuilderEntry | null> {
  const found = await getEntry(id); // valida o UUID
  if (!found) return null;

  const { entry, parameters } = found;
  const supabase = await createClient();

  let soapOperation: BuilderEntry["soapOperation"] = null;
  let soapWsdlId: string | null = null;
  let sdkAccessor: SdkAccessor | null = null;

  // SOAP: usa o WSDL que o usuário importou (endpoint, namespace e SOAPAction exatos).
  if (entry.kind === "soap" && entry.name.includes(".")) {
    const [service, method] = entry.name.split(".");
    if (IDENT.test(service) && IDENT.test(method)) {
      const { data: wsdl } = await supabase
        .from("soap_wsdls")
        .select("id")
        .eq("name", service)
        .limit(1)
        .maybeSingle();
      if (wsdl) {
        const { data: op } = await supabase
          .from("soap_operations")
          .select("id, service_name, port_name, operation_name, soap_action, input_schema, output_schema")
          .eq("wsdl_id", wsdl.id)
          .eq("operation_name", method)
          .limit(1)
          .maybeSingle();
        if (op) {
          soapOperation = rowToOperation(op as never);
          soapWsdlId = wsdl.id as string;
        }
      }
    }
  }

  // SDK: método de FluigAPI que devolve o serviço (o nome NÃO é derivável do tipo).
  if (entry.kind === "sdk" && !entry.name.startsWith("FluigAPI.")) {
    const className = entry.name.split(".")[0];
    if (IDENT.test(className)) {
      const { data } = await supabase
        .from("catalog_entries")
        .select("path")
        .like("name", "FluigAPI.get%")
        .like("path", `public ${className} get%`)
        .limit(1)
        .maybeSingle();
      const match = data?.path?.match(/^public\s+(\S+)\s+(get\w+)\(\)/);
      if (match) sdkAccessor = { returnType: match[1], method: match[2] };
    }
  }

  return { entry, parameters, soapOperation, soapWsdlId, sdkAccessor };
}
