import type { CatalogParameter } from "@/modules/catalog/types";
import type { Snippet, SdkAccessor } from "../types";

export type SdkInput = {
  /** Ex.: "UserService" */
  className: string;
  /** Ex.: "create" */
  methodName: string;
  parameters: CatalogParameter[];
  accessor: SdkAccessor | null;
};

const PRIMITIVE_SAMPLE: Record<string, string> = {
  string: '"valor"',
  int: "0",
  integer: "0",
  long: "0L",
  short: "(short) 0",
  double: "0.0",
  float: "0.0f",
  boolean: "false",
};

function sampleFor(type: string | null): string {
  if (!type) return "null";
  const base = type.replace(/\[\]$/, "").trim();
  if (base.toLowerCase() in PRIMITIVE_SAMPLE) return PRIMITIVE_SAMPLE[base.toLowerCase()];
  if (type.endsWith("[]")) return `new ${base}[0]`;
  // Tipo do domínio (DTO/VO): o SDK exige construir o objeto antes de chamar o método.
  return `new ${base}() /* preencha os campos do ${base} */`;
}

/** Gera a chamada ao método do SDK a partir da ASSINATURA REAL (Javadoc). */
export function generateSdkSnippets(input: SdkInput): Snippet[] {
  // Métodos da própria FluigAPI: devolvem o serviço (ponto de entrada do SDK).
  if (input.className === "FluigAPI") {
    const type = input.parameters.find((p) => p.direction === "output")?.data_type ?? "Object";
    return [
      {
        id: "java",
        label: "Java (evento/componente)",
        language: "java",
        code: [
          "import com.fluig.sdk.api.FluigAPI;",
          "",
          "FluigAPI api = new FluigAPI();",
          `${type} service = api.${input.methodName}();`,
        ].join("\n"),
      },
      {
        id: "javascript",
        label: "JavaScript (evento customizado)",
        language: "javascript",
        code: ["// Nos eventos customizados, `fluigAPI` já está disponível.", `var service = fluigAPI.${input.methodName}();`].join("\n"),
      },
    ];
  }

  const inputs = input.parameters.filter((p) => p.direction === "input");
  const output = input.parameters.find((p) => p.direction === "output");
  const notes: string[] = [];

  const varName = (name: string) => (/^[a-z]/.test(name) ? name : name[0].toLowerCase() + name.slice(1));

  const declarations = inputs.map((p) => {
    if (!p.data_type) notes.push(`O tipo de "${p.name}" não está documentado; ajuste conforme o Javadoc do SDK.`);
    return `        ${p.data_type ?? "Object"} ${varName(p.name)} = ${sampleFor(p.data_type)};`;
  });
  const args = inputs.map((p) => varName(p.name)).join(", ");

  const accessorLine = input.accessor
    ? `${input.accessor.returnType} service = new FluigAPI().${input.accessor.method}();`
    : `${input.className} service = null; // TODO: obtenha a instância conforme o Javadoc do SDK (não localizada em FluigAPI)`;
  if (!input.accessor) {
    notes.push(
      `Não encontrei em FluigAPI um método que devolva ${input.className}, então não vou sugerir como obter a instância. Confirme no Javadoc do SDK.`,
    );
  }

  const call = output && output.data_type && output.data_type !== "void"
    ? `${output.data_type} ${varName(output.name)} = service.${input.methodName}(${args});`
    : `service.${input.methodName}(${args});`;

  const hasDomainTypes = inputs.some((p) => sampleFor(p.data_type).startsWith("new ") && !(p.data_type ?? "").endsWith("[]"));
  const javaLines = [
    "// Executa dentro de um evento customizado do Fluig (ex.: evento de Workflow ou de Widget),",
    "// onde a instância de FluigAPI está disponível.",
    "import com.fluig.sdk.api.FluigAPI;",
    // Os serviços do SDK ficam no pacote com.fluig.sdk.service (Javadoc).
    ...(input.accessor ? [`import com.fluig.sdk.service.${input.accessor.returnType};`] : []),
    ...(hasDomainTypes || (output?.data_type && /VO|Dto/.test(output.data_type))
      ? ["// Importe também os tipos VO/DTO usados (pacotes com.fluig.sdk.api.* — veja o Javadoc)."]
      : []),
    "",
    "public class Example {",
    "    public void run() throws Exception {",
    `        ${accessorLine}`,
    "",
    ...declarations,
    "",
    `        ${call}`,
    "    }",
    "}",
  ];

  const jsLines = [
    "// Evento customizado em JavaScript (Workflow, Widget ou Personalização Social).",
    "// O objeto global `fluigAPI` já está disponível nesse contexto.",
    input.accessor
      ? `var service = fluigAPI.${input.accessor.method}();`
      : `var service = null; // TODO: obtenha a instância de ${input.className} conforme o Javadoc do SDK`,
    ...inputs.map((p) => `var ${varName(p.name)} = ${sampleFor(p.data_type).replace(/^new [A-Za-z]+\(\)/, "{}")};`),
    output && output.data_type && output.data_type !== "void"
      ? `var ${varName(output.name)} = service.${input.methodName}(${args});`
      : `service.${input.methodName}(${args});`,
  ];

  return [
    { id: "java", label: "Java (evento/componente)", language: "java", code: javaLines.join("\n"), notes },
    { id: "javascript", label: "JavaScript (evento customizado)", language: "javascript", code: jsLines.join("\n"), notes },
  ];
}
