import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { MessageShape, ParamNode, ParsedWsdl, SoapOperation } from "./types";

/**
 * Parser de WSDL 1.1 (SOAP 1.1/1.2; estilos rpc e document; use literal/encoded).
 * Puro (sem I/O): recebe os textos XML já baixados. Não resolve imports sozinho:
 * use `findSchemaImports` para descobrir o que baixar e passe tudo em `documents`.
 */

type Node = Record<string, unknown>;
type Scope = Map<string, string>; // prefixo -> namespace

const NS_XSD = "http://www.w3.org/2001/XMLSchema";
const NS_SOAP12 = "http://schemas.xmlsoap.org/wsdl/soap12/";
const MAX_DEPTH = 8;
const MAX_NODES = 5000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  textNodeName: "#text",
});

/* ------------------------------ Helpers XML ------------------------------- */

const isObj = (v: unknown): v is Node =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const localName = (key: string) => key.slice(key.indexOf(":") + 1);
const prefixOf = (key: string) => (key.includes(":") ? key.slice(0, key.indexOf(":")) : "");

/** Filhos (objetos) cujo nome local é `name`, com a chave original (para o prefixo). */
function kids(node: Node | undefined, name: string): { key: string; node: Node }[] {
  if (!node) return [];
  const out: { key: string; node: Node }[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_") || key === "#text" || localName(key) !== name) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (isObj(item)) out.push({ key, node: item });
      else if (typeof item === "string") out.push({ key, node: {} });
    }
  }
  return out;
}

const attr = (node: Node, name: string): string | undefined => {
  const v = node[`@_${name}`];
  return typeof v === "string" ? v : undefined;
};

function extendScope(node: Node, parent: Scope): Scope {
  const scope = new Map(parent);
  for (const [key, value] of Object.entries(node)) {
    if (key === "@_xmlns" && typeof value === "string") scope.set("", value);
    else if (key.startsWith("@_xmlns:") && typeof value === "string") scope.set(key.slice(8), value);
  }
  return scope;
}

type QName = { ns: string; local: string };
function resolveQName(q: string, scope: Scope): QName {
  const i = q.indexOf(":");
  if (i < 0) return { ns: scope.get("") ?? "", local: q };
  return { ns: scope.get(q.slice(0, i)) ?? "", local: q.slice(i + 1) };
}
const keyOf = (q: QName) => `${q.ns}|${q.local}`;

function docText(node: Node): string | undefined {
  const doc = kids(node, "documentation")[0];
  if (!doc) return undefined;
  const raw = doc.node["#text"];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/* ------------------------------- Registro --------------------------------- */

type SchemaCtx = { ns: string; qualified: boolean; scope: Scope };
type Def = { node: Node; ctx: SchemaCtx };

type MessagePart = { name: string; element?: QName; type?: QName; scope: Scope };
type PortTypeOp = { name: string; input?: string; output?: string; faults: string[]; doc?: string };
type BindingOp = { soapAction: string; style?: string; use?: string; namespace?: string };

class Registry {
  elements = new Map<string, Def>();
  types = new Map<string, Def>();
  localElements = new Map<string, Def>();
  localTypes = new Map<string, Def>();
  messages = new Map<string, MessagePart[]>();
  portTypes = new Map<string, PortTypeOp[]>();
  bindings = new Map<
    string,
    { portType: string; style: string; soap12: boolean; ops: Map<string, BindingOp> }
  >();
  services: {
    name: string;
    ports: { name: string; binding: string; address: string | null; soap12: boolean }[];
  }[] = [];
  names: string[] = [];
  tns: string | null = null;
  warnings: string[] = [];
  nodeCount = 0;

  addSchema(schema: Node, parentScope: Scope) {
    const scope = extendScope(schema, parentScope);
    const ctx: SchemaCtx = {
      ns: attr(schema, "targetNamespace") ?? "",
      qualified: attr(schema, "elementFormDefault") === "qualified",
      scope,
    };
    for (const { node } of kids(schema, "element")) {
      const name = attr(node, "name");
      if (!name) continue;
      const def = { node, ctx };
      this.elements.set(`${ctx.ns}|${name}`, def);
      this.localElements.set(name, def);
    }
    for (const kind of ["complexType", "simpleType"] as const) {
      for (const { node } of kids(schema, kind)) {
        const name = attr(node, "name");
        if (!name) continue;
        const def = { node: { ...node, __simple: kind === "simpleType" }, ctx };
        this.types.set(`${ctx.ns}|${name}`, def);
        this.localTypes.set(name, def);
      }
    }
  }

  lookupElement(q: QName) {
    return this.elements.get(keyOf(q)) ?? this.localElements.get(q.local);
  }
  lookupType(q: QName) {
    return this.types.get(keyOf(q)) ?? this.localTypes.get(q.local);
  }
}

/* --------------------------- Carga dos documentos ------------------------- */

function rootOf(xml: string): { key: string; node: Node } | null {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(`XML inválido: ${validation.err.msg} (linha ${validation.err.line})`);
  }
  const doc = parser.parse(xml) as Node;
  for (const [key, value] of Object.entries(doc)) {
    if (key.startsWith("?") || key.startsWith("@_") || !isObj(value)) continue;
    return { key, node: value };
  }
  return null;
}

function loadDocument(xml: string, reg: Registry) {
  const root = rootOf(xml);
  if (!root) throw new Error("Documento XML vazio.");
  const kind = localName(root.key);

  if (kind === "schema") {
    reg.addSchema(root.node, new Map());
    return;
  }
  if (kind !== "definitions") {
    throw new Error(`Documento não reconhecido: elemento raiz "${root.key}" (esperado wsdl:definitions).`);
  }

  const scope = extendScope(root.node, new Map());
  const tns = attr(root.node, "targetNamespace") ?? "";
  if (reg.tns === null) {
    reg.tns = tns;
    reg.names.push(attr(root.node, "name") ?? "");
  }

  for (const types of kids(root.node, "types")) {
    for (const { node } of kids(types.node, "schema")) reg.addSchema(node, scope);
  }

  for (const { node } of kids(root.node, "message")) {
    const name = attr(node, "name");
    if (!name) continue;
    const parts: MessagePart[] = [];
    for (const part of kids(node, "part")) {
      const partName = attr(part.node, "name");
      if (!partName) continue;
      const element = attr(part.node, "element");
      const type = attr(part.node, "type");
      parts.push({
        name: partName,
        element: element ? resolveQName(element, scope) : undefined,
        type: type ? resolveQName(type, scope) : undefined,
        scope,
      });
    }
    reg.messages.set(`${tns}|${name}`, parts);
  }

  for (const { node } of kids(root.node, "portType")) {
    const name = attr(node, "name");
    if (!name) continue;
    const ops: PortTypeOp[] = [];
    for (const op of kids(node, "operation")) {
      const opName = attr(op.node, "name");
      if (!opName) continue;
      const messageOf = (n: string) => {
        const m = kids(op.node, n)[0]?.node;
        const ref = m ? attr(m, "message") : undefined;
        return ref ? keyOf(resolveQName(ref, scope)) : undefined;
      };
      ops.push({
        name: opName,
        input: messageOf("input"),
        output: messageOf("output"),
        faults: kids(op.node, "fault")
          .map((f) => attr(f.node, "message"))
          .filter((m): m is string => !!m)
          .map((m) => resolveQName(m, scope).local),
        doc: docText(op.node),
      });
    }
    reg.portTypes.set(`${tns}|${name}`, ops);
  }

  for (const { node } of kids(root.node, "binding")) {
    const name = attr(node, "name");
    const type = attr(node, "type");
    if (!name || !type) continue;

    const soapBinding = Object.entries(node).find(
      ([k]) => localName(k) === "binding" && !k.startsWith("@_"),
    );
    const soap12 = soapBinding ? scope.get(prefixOf(soapBinding[0])) === NS_SOAP12 : false;
    const bindingNode = isObj(soapBinding?.[1]) ? (soapBinding![1] as Node) : {};
    const ops = new Map<string, BindingOp>();

    for (const op of kids(node, "operation")) {
      const opName = attr(op.node, "name");
      if (!opName) continue;
      const soapOp = kids(op.node, "operation")[0]?.node ?? {};
      const inputBody = kids(kids(op.node, "input")[0]?.node, "body")[0]?.node ?? {};
      ops.set(opName, {
        soapAction: attr(soapOp, "soapAction") ?? "",
        style: attr(soapOp, "style"),
        use: attr(inputBody, "use"),
        namespace: attr(inputBody, "namespace"),
      });
    }
    reg.bindings.set(`${tns}|${name}`, {
      portType: keyOf(resolveQName(type, scope)),
      style: attr(bindingNode, "style") ?? "document",
      soap12,
      ops,
    });
  }

  for (const { node } of kids(root.node, "service")) {
    const name = attr(node, "name");
    if (!name) continue;
    const ports = kids(node, "port").flatMap((port) => {
      const portName = attr(port.node, "name");
      const binding = attr(port.node, "binding");
      if (!portName || !binding) return [];
      const addr = Object.entries(port.node).find(
        ([k]) => !k.startsWith("@_") && localName(k) === "address",
      );
      const addrNode = addr && isObj(addr[1]) ? (addr[1] as Node) : undefined;
      return [
        {
          name: portName,
          binding: keyOf(resolveQName(binding, scope)),
          address: addrNode ? (attr(addrNode, "location") ?? null) : null,
          soap12: addr ? scope.get(prefixOf(addr[0])) === NS_SOAP12 : false,
        },
      ];
    });
    reg.services.push({ name, ports });
  }
}

/* ------------------------- Expansão de schemas ---------------------------- */

function expandType(
  q: QName,
  reg: Registry,
  stack: string[],
): { label: string; children?: ParamNode[]; enum?: string[]; recursive?: boolean } {
  if (q.ns === NS_XSD) return { label: q.local };

  const def = reg.lookupType(q);
  if (!def) {
    reg.warnings.push(`Tipo não encontrado no schema: ${q.local}`);
    return { label: q.local };
  }
  const key = keyOf(q);
  if (stack.includes(key) || stack.length >= MAX_DEPTH) {
    return { label: q.local, recursive: true };
  }

  if (def.node.__simple) {
    const restriction = kids(def.node, "restriction")[0];
    const values = restriction
      ? kids(restriction.node, "enumeration")
          .map((e) => attr(e.node, "value"))
          .filter((v): v is string => v !== undefined)
      : [];
    const base = restriction ? attr(restriction.node, "base") : undefined;
    return {
      label: base ? resolveQName(base, def.ctx.scope).local : q.local,
      enum: values.length ? values : undefined,
    };
  }

  return {
    label: q.local,
    children: complexChildren(def.node, def.ctx, reg, [...stack, key]),
  };
}

function particles(container: Node, ctx: SchemaCtx, reg: Registry, stack: string[], optional: boolean): ParamNode[] {
  const out: ParamNode[] = [];
  for (const { node } of kids(container, "element")) {
    const param = elementToParam(node, ctx, reg, stack);
    if (param) out.push(optional ? { ...param, minOccurs: 0 } : param);
  }
  for (const kind of ["sequence", "all", "choice", "group"] as const) {
    for (const { node } of kids(container, kind)) {
      out.push(...particles(node, ctx, reg, stack, optional || kind === "choice"));
    }
  }
  return out;
}

function complexChildren(node: Node, ctx: SchemaCtx, reg: Registry, stack: string[]): ParamNode[] {
  const out: ParamNode[] = [];

  const content = kids(node, "complexContent")[0]?.node;
  if (content) {
    const derivation = kids(content, "extension")[0] ?? kids(content, "restriction")[0];
    if (derivation) {
      const base = attr(derivation.node, "base");
      if (base && localName(derivation.key) === "extension") {
        const baseType = expandType(resolveQName(base, ctx.scope), reg, stack);
        out.push(...(baseType.children ?? []));
      }
      out.push(...particles(derivation.node, ctx, reg, stack, false));
    }
    return out;
  }

  return particles(node, ctx, reg, stack, false);
}

function occurs(node: Node) {
  const min = Number.parseInt(attr(node, "minOccurs") ?? "1", 10);
  const maxRaw = attr(node, "maxOccurs") ?? "1";
  return {
    minOccurs: Number.isNaN(min) ? 1 : min,
    maxOccurs: maxRaw === "unbounded" ? null : Number.parseInt(maxRaw, 10) || 1,
  };
}

function elementToParam(el: Node, ctx: SchemaCtx, reg: Registry, stack: string[]): ParamNode | null {
  if (++reg.nodeCount > MAX_NODES) return null;
  const { minOccurs, maxOccurs } = occurs(el);

  const ref = attr(el, "ref");
  if (ref) {
    const target = reg.lookupElement(resolveQName(ref, ctx.scope));
    if (!target) {
      reg.warnings.push(`Elemento referenciado não encontrado: ${ref}`);
      return null;
    }
    const param = elementToParam(target.node, target.ctx, reg, stack);
    return param ? { ...param, minOccurs, maxOccurs, qualified: true } : null;
  }

  const name = attr(el, "name");
  if (!name) return null;

  const base: Omit<ParamNode, "type"> = {
    name,
    minOccurs,
    maxOccurs,
    nillable: attr(el, "nillable") === "true" || undefined,
    ns: ctx.ns,
    qualified: attr(el, "form") ? attr(el, "form") === "qualified" : ctx.qualified,
  };

  const type = attr(el, "type");
  if (type) {
    const expanded = expandType(resolveQName(type, ctx.scope), reg, stack);
    return { ...base, type: expanded.label, children: expanded.children, enum: expanded.enum, recursive: expanded.recursive };
  }

  const inlineComplex = kids(el, "complexType")[0];
  if (inlineComplex) {
    return { ...base, type: "complexType", children: complexChildren(inlineComplex.node, ctx, reg, stack) };
  }
  const inlineSimple = kids(el, "simpleType")[0];
  if (inlineSimple) {
    const restriction = kids(inlineSimple.node, "restriction")[0];
    const values = restriction
      ? kids(restriction.node, "enumeration").map((e) => attr(e.node, "value")).filter((v): v is string => v !== undefined)
      : [];
    const baseType = restriction ? attr(restriction.node, "base") : undefined;
    return { ...base, type: baseType ? resolveQName(baseType, ctx.scope).local : "string", enum: values.length ? values : undefined };
  }

  return { ...base, type: "anyType" };
}

/* ------------------------- Montagem das operações ------------------------- */

function partToParam(part: MessagePart, reg: Registry): ParamNode | null {
  if (part.element) {
    const def = reg.lookupElement(part.element);
    if (!def) {
      reg.warnings.push(`Elemento da mensagem não encontrado: ${part.element.local}`);
      return null;
    }
    const param = elementToParam(def.node, def.ctx, reg, []);
    return param ? { ...param, qualified: true, minOccurs: 1, maxOccurs: 1 } : null;
  }
  if (part.type) {
    const expanded = expandType(part.type, reg, []);
    return {
      name: part.name,
      type: expanded.label,
      minOccurs: 1,
      maxOccurs: 1,
      ns: "",
      qualified: false, // acessores de partes RPC não têm namespace
      children: expanded.children,
      enum: expanded.enum,
      recursive: expanded.recursive,
    };
  }
  return null;
}

function messageShape(
  messageKey: string | undefined,
  style: "document" | "rpc",
  opName: string,
  rpcNamespace: string,
  isOutput: boolean,
  reg: Registry,
): MessageShape {
  const parts = messageKey ? reg.messages.get(messageKey) : undefined;
  if (!parts) return { wrapper: null, params: [] };

  if (style === "rpc") {
    return {
      wrapper: { ns: rpcNamespace, name: isOutput ? `${opName}Response` : opName },
      params: parts.map((p) => partToParam(p, reg)).filter((p): p is ParamNode => p !== null),
    };
  }

  const params = parts.map((p) => partToParam(p, reg)).filter((p): p is ParamNode => p !== null);
  if (params.length === 1 && parts[0].element) {
    const root = params[0];
    return { wrapper: { ns: root.ns, name: root.name }, params: root.children ?? [] };
  }
  return { wrapper: null, params };
}

/* --------------------------------- API ------------------------------------ */

/** Descobre arquivos a baixar (xsd:import/include e wsdl:import) a partir de um documento. */
export function findSchemaImports(xml: string): string[] {
  const found = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!isObj(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("@_")) continue;
      const name = localName(key);
      if (name === "import" || name === "include") {
        for (const item of Array.isArray(child) ? child : [child]) {
          if (!isObj(item)) continue;
          const loc = attr(item, "schemaLocation") ?? attr(item, "location");
          if (loc) found.add(loc);
        }
      }
      walk(child);
    }
  };
  const root = rootOf(xml);
  if (root) walk(root.node);
  return [...found];
}

export function parseWsdl(documents: string[]): ParsedWsdl {
  if (documents.length === 0) throw new Error("Nenhum documento WSDL informado.");
  const reg = new Registry();
  for (const xml of documents) loadDocument(xml, reg);

  const operations: SoapOperation[] = [];

  for (const service of reg.services) {
    for (const port of service.ports) {
      const binding = reg.bindings.get(port.binding);
      if (!binding) {
        reg.warnings.push(`Binding não encontrado para a porta ${port.name}.`);
        continue;
      }
      const portType = reg.portTypes.get(binding.portType);
      if (!portType) {
        reg.warnings.push(`PortType não encontrado para o binding da porta ${port.name}.`);
        continue;
      }

      for (const op of portType) {
        const meta = binding.ops.get(op.name);
        const style = ((meta?.style ?? binding.style) === "rpc" ? "rpc" : "document") as "rpc" | "document";
        const rpcNs = meta?.namespace ?? reg.tns ?? "";

        operations.push({
          service: service.name,
          port: port.name,
          name: op.name,
          soapAction: meta?.soapAction ?? "",
          style,
          use: meta?.use === "encoded" ? "encoded" : "literal",
          soapVersion: port.soap12 || binding.soap12 ? "1.2" : "1.1",
          endpoint: port.address,
          input: messageShape(op.input, style, op.name, rpcNs, false, reg),
          output: messageShape(op.output, style, op.name, rpcNs, true, reg),
          faults: op.faults,
          documentation: op.doc,
        });
      }
    }
  }

  if (operations.length === 0) {
    reg.warnings.push("Nenhuma operação encontrada (o WSDL não tem service/port/binding completos).");
  }

  return {
    name: reg.names.find(Boolean) ?? reg.services[0]?.name ?? null,
    targetNamespace: reg.tns,
    operations,
    warnings: [...new Set(reg.warnings)],
  };
}
