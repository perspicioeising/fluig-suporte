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
    label: "Construtor",
    description: "Gere exemplos de código a partir da documentação oficial.",
    icon: Wrench,
  },
  {
    href: "/tester",
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
    label: "Assistente IA",
    description: "Pergunte sobre APIs com respostas baseadas na documentação.",
    icon: Sparkles,
  },
  {
    href: "/diagnostico",
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
