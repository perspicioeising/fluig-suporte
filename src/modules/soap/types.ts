/** Modelo normalizado de uma operação SOAP extraída de um WSDL 1.1. */

export type ParamNode = {
  name: string;
  /** Rótulo do tipo: "string", "int", "companyDto", "companyDto[]"... */
  type: string;
  minOccurs: number;
  /** null = unbounded */
  maxOccurs: number | null;
  nillable?: boolean;
  enum?: string[];
  /** Namespace do elemento (usado quando qualificado). */
  ns: string;
  /** true se o elemento deve ser escrito com prefixo de namespace. */
  qualified: boolean;
  children?: ParamNode[];
  /** Tipo recursivo: a expansão foi interrompida aqui. */
  recursive?: boolean;
};

export type MessageShape = {
  /** Elemento "embrulho" do Body (document/wrapped ou rpc). null = partes soltas. */
  wrapper: { ns: string; name: string } | null;
  params: ParamNode[];
};

export type SoapOperation = {
  service: string;
  port: string;
  name: string;
  soapAction: string;
  style: "document" | "rpc";
  use: "literal" | "encoded";
  soapVersion: "1.1" | "1.2";
  /** Endereço declarado no WSDL (pode apontar para um host interno). */
  endpoint: string | null;
  input: MessageShape;
  output: MessageShape;
  faults: string[];
  documentation?: string;
};

export type ParsedWsdl = {
  name: string | null;
  targetNamespace: string | null;
  operations: SoapOperation[];
  warnings: string[];
};
