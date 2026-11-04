import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUp, BookOpen, FlaskConical, Send, Settings, Stethoscope } from "lucide-react";
import { HELP_SECTIONS, sectionsByGroup } from "@/modules/help/content";
import { HelpMarkdown } from "@/modules/help/components/help-markdown";

export const metadata: Metadata = {
  title: "Ajuda",
  description: "Guia de uso do Fluig Integration Studio.",
};

const QUICK_LINKS = [
  { href: "#ambientes-credenciais", label: "Cadastrar um ambiente", icon: Settings },
  { href: "#primeiros-passos", label: "Fazer a primeira chamada", icon: Send },
  { href: "#soap", label: "Importar um WSDL", icon: FlaskConical },
  { href: "#catalogo", label: "Pesquisar o catálogo", icon: BookOpen },
  { href: "#diagnostico", label: "Diagnosticar um erro", icon: Stethoscope },
];

export default function HelpPage() {
  const groups = sectionsByGroup();

  return (
    <div className="space-y-8" id="topo">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Ajuda e documentação</h1>
        <p className="max-w-3xl text-sm text-muted">
          Guia completo do Fluig Integration Studio: como configurar ambientes, usar cada módulo, interpretar
          resultados e resolver problemas. Use o índice para ir direto ao assunto.
        </p>
      </header>

      <nav aria-label="Atalhos rápidos">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <a
                href={href}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3 text-sm hover:border-accent"
              >
                <Icon className="size-4 shrink-0 text-accent" aria-hidden />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Índice: fixo em telas largas; recolhível em telas pequenas */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <nav aria-label="Índice da ajuda" className="rounded-lg border border-border bg-surface p-3">
            <details open className="group lg:[&>summary]:hidden" >
              <summary className="cursor-pointer text-sm font-medium lg:hidden">Índice</summary>
              <div className="space-y-4 pt-2 lg:pt-0">
                {groups.map(({ group, sections }) => (
                  <div key={group}>
                    <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{group}</p>
                    <ul className="space-y-0.5">
                      {sections.map((s) => (
                        <li key={s.id}>
                          <a href={`#${s.id}`} className="block rounded px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-foreground">
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </nav>
        </aside>

        <div className="min-w-0 space-y-6">
          {HELP_SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-titulo`}
              className="scroll-mt-4 space-y-4 rounded-lg border border-border bg-surface p-5"
            >
              <div className="space-y-1">
                <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">{section.group}</p>
                <h2 id={`${section.id}-titulo`} className="text-xl font-semibold">
                  {section.title}
                </h2>
                <p className="text-sm text-muted">{section.summary}</p>
              </div>
              <HelpMarkdown text={section.body} />
              <p className="pt-1 text-right">
                <a href="#topo" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
                  <ArrowUp className="size-3" aria-hidden />
                  Voltar ao topo
                </a>
              </p>
            </section>
          ))}

          <p className="text-center text-sm text-muted">
            Não encontrou o que procurava? Pergunte ao{" "}
            <Link href="/assistente" className="text-accent hover:underline">
              Assistente IA
            </Link>
            : ele também conhece este guia.
          </p>
        </div>
      </div>
    </div>
  );
}
