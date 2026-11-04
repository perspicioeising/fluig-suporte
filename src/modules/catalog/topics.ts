/**
 * Classificação por ASSUNTO das entradas do catálogo (Documentos, Usuários, Processos...).
 *
 * É uma ajuda de navegação do Studio, NÃO uma informação da documentação oficial: as regras
 * olham só nome, caminho e grupos oficiais (tags) da entrada. Uma entrada pode ter mais de
 * um assunto. Código puro: usado na importação e em testes.
 */

export const TOPICS = [
  { id: "documentos", label: "Documentos e pastas" },
  { id: "usuarios", label: "Usuários e grupos" },
  { id: "processos", label: "Processos e workflow" },
  { id: "formularios", label: "Formulários" },
  { id: "datasets", label: "Datasets" },
  { id: "social", label: "Social e colaboração" },
  { id: "paginas", label: "Páginas e widgets" },
  { id: "notificacoes", label: "Notificações e e-mail" },
  { id: "administracao", label: "Administração" },
  { id: "seguranca", label: "Segurança e OAuth" },
  { id: "integracao", label: "Serviços e integração" },
  { id: "relatorios", label: "Relatórios" },
  { id: "busca", label: "Busca e filtros" },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];
export const TOPIC_IDS = TOPICS.map((t) => t.id) as [TopicId, ...TopicId[]];
export const TOPIC_LABELS = Object.fromEntries(TOPICS.map((t) => [t.id, t.label])) as Record<TopicId, string>;

/**
 * Cada regra casa no INÍCIO de uma palavra (ex.: "document" casa "documents", "documentService").
 * Palavras curtas e ambíguas usam o limite exato para evitar falsos positivos
 * (ex.: "form" não pode casar "format", nem "file" casar "profile").
 */
const RULES: Record<TopicId, RegExp> = {
  documentos: /(?:^|[^a-z])(?:document|folder|pasta|attachment|anexo|watermark|marca d|upload|contentfile|arquivo|files?(?![a-z]))/,
  usuarios: /(?:^|[^a-z])(?:user|colleague|usuario|profile|groups?(?![a-z])|grupo|role|papel|replacement|impersonat|personific|identity)/,
  processos: /(?:^|[^a-z])(?:process|workflow|requests?(?![a-z])|attribution|task|activit|bpm|adhoc|thread|solicit|tarefa)/,
  formularios: /(?:^|[^a-z])(?:card|formul|forms?(?![a-z]))/,
  datasets: /(?:^|[^a-z])dataset/,
  social: /(?:^|[^a-z])(?:post|sociable|liker|relation|tags? cloud|communit|comunid|comment|social|collaboration|article|artigo|tagscloud|mention|breadcrumb|timeline|follow|favorite)/,
  paginas: /(?:^|[^a-z])(?:page|widget|layout|theme|wcm)/,
  notificacoes: /(?:^|[^a-z])(?:alert|notification|notific|mail)/,
  administracao: /(?:^|[^a-z])(?:admin|business period|custom field|volume|tenant|company|empresa|locals?(?![a-z])|parameter|globalparam|holiday|scheduler|schedul|job|environment|monitor|statistic|use-?policy|i18|license|domain)/,
  seguranca: /(?:^|[^a-z])(?:security|permission|oauth|authoriz|custom app key|use polic)/,
  integracao: /(?:^|[^a-z])(?:dataservice|data service|connector|integration|ipaas|invoke|operations?(?![a-z]))/,
  relatorios: /(?:^|[^a-z])(?:report|relatorio)/,
  busca: /(?:^|[^a-z])(?:search|filter|busca|pesquis)/,
};

/** camelCase -> palavras, minúsculas; separa o prefixo "ECM" colado (ECMDocument -> ecm document). */
function normalize(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\becm(?=[a-z])/g, "ecm ")
    .replace(/[_/.\-{}]+/g, " ");
}

/**
 * Em SOAP e SDK o campo `path` guarda a ASSINATURA do método (com nomes de parâmetros como
 * companyId e colleagueId), que gera falsos positivos; nesses tipos só nome e grupos contam.
 * Em REST o caminho é informativo (ex.: /documents/{id}) e entra na análise.
 */
export function classifyTopics(entry: {
  name: string;
  kind?: string | null;
  path?: string | null;
  tags?: string[] | null;
}): TopicId[] {
  const usePath = entry.kind === "rest_new" || entry.kind === "rest_old";
  const haystack = normalize([entry.name, usePath ? (entry.path ?? "") : "", ...(entry.tags ?? [])].join(" "));
  return TOPICS.filter((t) => RULES[t.id].test(haystack)).map((t) => t.id);
}
