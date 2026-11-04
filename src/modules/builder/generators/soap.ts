import {
  buildCurlSample,
  buildJavaSample,
  buildJavaScriptSample,
  buildSoapEnvelope,
} from "@/modules/soap/envelope";
import type { SoapOperationRecord } from "@/modules/soap/schemas";
import type { ParamNode } from "@/modules/soap/types";
import type { CatalogEntry, CatalogParameter } from "@/modules/catalog/types";
import type { Snippet } from "../types";

const XSD_BY_JAVA: Record<string, string> = {
  string: "string",
  int: "int",
  integer: "int",
  long: "long",
  short: "short",
  boolean: "boolean",
  double: "double",
  float: "float",
};

export const NAMESPACE_PLACEHOLDER = "NAMESPACE_DO_WSDL";

/**
 * Operação reconstruída SÓ com o que o catálogo (TDN) documenta: nome do serviço,
 * do método e dos argumentos. Namespace, SOAPAction e endereço NÃO são documentados
 * e ficam como marcadores, em vez de serem inventados.
 */
export function soapOperationFromCatalog(
  entry: CatalogEntry,
  parameters: CatalogParameter[],
): SoapOperationRecord {
  const [service, method] = entry.name.includes(".") ? entry.name.split(".") : ["", entry.name];

  const params: ParamNode[] = parameters
    .filter((p) => p.direction === "input" && p.location === "argument")
    .map((p) => {
      const raw = (p.data_type ?? "").trim();
      const base = raw.replace(/\[\]$/, "").toLowerCase();
      const xsd = XSD_BY_JAVA[base];
      return {
        name: p.name,
        type: xsd ?? raw,
        minOccurs: 1,
        maxOccurs: 1,
        ns: "",
        qualified: false,
        placeholder:
          xsd && !raw.endsWith("[]")
            ? undefined
            : `tipo ${raw || "desconhecido"}: consulte o WSDL do serviço para a estrutura`,
      };
    });

  return {
    id: "catalog",
    service,
    port: "",
    name: method,
    soapAction: "",
    style: "rpc",
    use: "literal",
    soapVersion: "1.1",
    endpoint: null,
    input: { wrapper: { ns: NAMESPACE_PLACEHOLDER, name: method }, params },
    output: { wrapper: null, params: [] },
    faults: [],
  };
}

/** `endpoint` resolvido contra a URL base do ambiente (se houver um selecionado). */
export function generateSoapSnippets(
  op: SoapOperationRecord,
  endpoint: string,
  values?: Record<string, string>,
  extraNotes: string[] = [],
): Snippet[] {
  const envelope = buildSoapEnvelope(op, values);
  const input = { endpoint, soapAction: op.soapAction, soapVersion: op.soapVersion, envelope };
  const notes = [
    ...extraNotes,
    ...(!endpoint ? ["Informe a URL do seu ambiente: o endereço do serviço não está declarado."] : []),
  ];

  return [
    { id: "envelope", label: "XML (envelope SOAP)", language: "xml", code: envelope, notes },
    { id: "curl", label: "cURL", language: "bash", code: buildCurlSample(input), notes },
    { id: "javascript", label: "JavaScript", language: "javascript", code: buildJavaScriptSample(input), notes },
    { id: "java", label: "Java", language: "java", code: buildJavaSample(input), notes },
  ];
}
