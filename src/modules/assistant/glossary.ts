/**
 * A documentação do Fluig (nomes de métodos, caminhos e resumos) está em inglês, mas as perguntas
 * costumam vir em português. Este glossário traduz termos comuns da pergunta para os termos
 * usados no catálogo, só para BUSCAR. Não é conteúdo técnico do Fluig.
 */
const GLOSSARY: [RegExp, string[]][] = [
  [/\busuari/, ["user"]],
  [/\bcolaborador/, ["colleague", "user"]],
  [/\bativ[oa]s?\b/, ["active"]],
  [/\binativ/, ["inactive"]],
  [/\bgrupo/, ["group"]],
  [/\bdocument/, ["document"]],
  [/\bpasta/, ["folder"]],
  [/\banexo/, ["attachment"]],
  [/\bprocesso/, ["process"]],
  [/\bsolicita/, ["request"]],
  [/\btarefa|\batividade/, ["task", "activity"]],
  [/\bformulario|\bficha/, ["card", "form"]],
  [/\bdataset|\bconjunto de dados/, ["dataset"]],
  [/\bpapel|\bpapeis/, ["role"]],
  [/\bempresa|\binquilino/, ["tenant", "company"]],
  [/\bnotifica|\balerta/, ["alert", "notification"]],
  [/\bpagina/, ["page"]],
  [/\bcomunidade/, ["communit"]],
  [/\bpermiss/, ["permission"]],
  [/\brelatorio/, ["report"]],
  [/\bsubstitut/, ["substitute"]],
  [/\bferiado/, ["holiday"]],
  [/\bagendamento|\bagendad/, ["scheduler"]],
];

const fold = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Termos em inglês (sem repetição, até 4) correspondentes ao que a pergunta menciona. */
export function expandQuestionTerms(question: string): string[] {
  const text = fold(question);
  const out: string[] = [];
  for (const [re, terms] of GLOSSARY) {
    if (re.test(text)) for (const t of terms) if (!out.includes(t)) out.push(t);
  }
  return out.slice(0, 4);
}
