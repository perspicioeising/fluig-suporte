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

export type NavGroup = "Explorar" | "Testar" | "Inteligência" | "Gestão" | "Suporte";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: NavGroup;
};

export const NAV_GROUPS: NavGroup[] = ["Explorar", "Testar", "Inteligência", "Gestão", "Suporte"];

/** Fonte única dos módulos: usada na sidebar, no dashboard e nas páginas. */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    group: "Explorar",
    label: "Dashboard",
    description: "Visão geral das integrações e atividades recentes.",
    icon: LayoutDashboard,
  },
  {
    href: "/catalogo",
    group: "Explorar",
    label: "APIs Fluig",
    description: "Catálogo pesquisável de APIs REST, SOAP e SDK.",
    icon: BookOpen,
  },
  {
    href: "/construtor",
    group: "Explorar",
    label: "Construtor",
    description: "Gere exemplos de código a partir da documentação oficial.",
    icon: Wrench,
  },
  {
    href: "/tester",
    group: "Testar",
    label: "API Tester",
    description: "Execute e salve requisições contra ambientes Fluig.",
    icon: Send,
  },
  {
    href: "/soap",
    group: "Testar",
    label: "Webservices SOAP",
    description: "Importe WSDL, monte envelopes e teste chamadas.",
    icon: FlaskConical,
  },
  {
    href: "/assistente",
    group: "Inteligência",
    label: "Assistente IA",
    description: "Pergunte sobre APIs com respostas baseadas na documentação.",
    icon: Sparkles,
  },
  {
    href: "/diagnostico",
    group: "Inteligência",
    label: "Diagnóstico",
    description: "Analise erros de integração e receba próximos passos.",
    icon: Bug,
  },
  {
    href: "/historico",
    group: "Gestão",
    label: "Histórico",
    description: "Requisições, análises e diagnósticos anteriores.",
    icon: History,
  },
  {
    href: "/configuracoes",
    group: "Gestão",
    label: "Configurações",
    description: "Ambientes Fluig, credenciais e preferências.",
    icon: Settings,
  },
  {
    href: "/ajuda",
    group: "Suporte",
    label: "Ajuda",
    description: "Guia de uso, solução de problemas e glossário.",
    icon: LifeBuoy,
  },
];

export function getNavItem(href: string) {
  return NAV_ITEMS.find((item) => item.href === href);
}
