import type { CatalogEntry, CatalogParameter } from "@/modules/catalog/types";
import type { SoapOperationRecord } from "@/modules/soap/schemas";

/** Trecho de código gerado, exibido numa aba. */
export type Snippet = {
  id: string;
  label: string;
  /** Linguagem para rótulo/realce (javascript, java, bash, json, xml). */
  language: string;
  code: string;
  /** Avisos específicos desta aba. */
  notes?: string[];
};

export type SdkAccessor = {
  /** Ex.: getUserService */
  method: string;
  /** Ex.: UserService */
  returnType: string;
};

/** Tudo que o gerador precisa sobre uma entrada do catálogo (serializável). */
export type BuilderEntry = {
  entry: CatalogEntry;
  parameters: CatalogParameter[];
  /** SOAP: operação do WSDL importado pelo usuário (endpoint/namespace exatos). */
  soapOperation: SoapOperationRecord | null;
  soapWsdlId: string | null;
  /** SDK: método de FluigAPI que devolve o serviço. */
  sdkAccessor: SdkAccessor | null;
};

export type BuilderEnvironment = {
  id: string;
  name: string;
  base_url: string;
};
