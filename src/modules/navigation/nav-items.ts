import {
  BookOpen,
  Bug,
  FlaskConical,
  History,
  LayoutDashboard,
  LifeBuoy,
  Send,
  Settings,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /**
   * true = ferramenta acessível também dentro do detalhe da API (catálogo).
   * Na sidebar, esses itens ficam na seção recolhível "Ferramentas avançadas".
   */
  advanced?: boolean;
};

/** Fonte única dos módulos: usada na sidebar, no dashboard e nas páginas. */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Visão geral das integrações e atividades recentes.",
    icon: LayoutDashboard,
  },
  {
    href: "/catalogo",
    label: "APIs Fluig",
    description: "Catálogo pesquisável de APIs REST, SOAP e SDK.",
    icon: BookOpen,
  },
  {
    href: "/construtor",
    advanced: true,
    label: "Construtor",
    description: "Gere exemplos de código a partir da documentação oficial.",
    icon: Wrench,
  },
  {
    href: "/tester",
    advanced: true,
    label: "API Tester",
    description: "Execute e salve requisições contra ambientes Fluig.",
    icon: Send,
  },
  {
    href: "/soap",
    label: "Webservices SOAP",
    description: "Importe WSDL, monte envelopes e teste chamadas.",
    icon: FlaskConical,
  },
  {
    href: "/assistente",
    advanced: true,
    label: "Assistente IA",
    description: "Pergunte sobre APIs com respostas baseadas na documentação.",
    icon: Sparkles,
  },
  {
    href: "/diagnostico",
    advanced: true,
    label: "Diagnóstico",
    description: "Analise erros de integração e receba próximos passos.",
    icon: Bug,
  },
  {
    href: "/historico",
    label: "Histórico",
    description: "Requisições, análises e diagnósticos anteriores.",
    icon: History,
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    description: "Ambientes Fluig, credenciais e preferências.",
    icon: Settings,
  },
  {
    href: "/ajuda",
    label: "Ajuda",
    description: "Guia de uso, solução de problemas e glossário.",
    icon: LifeBuoy,
  },
];

export function getNavItem(href: string) {
  return NAV_ITEMS.find((item) => item.href === href);
}

/** Itens primários (topo da sidebar). */
export const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.advanced);

/**
 * Ferramentas avançadas (Construtor, API Tester, Assistente, Diagnóstico): já acessíveis
 * dentro do detalhe da API no catálogo; aqui ficam numa seção recolhível no rodapé.
 */
export const ADVANCED_NAV_ITEMS = NAV_ITEMS.filter((item) => item.advanced);
