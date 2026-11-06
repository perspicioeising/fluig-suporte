import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SIDEBAR_INIT_SCRIPT } from "@/modules/navigation/sidebar-constants";
import { THEME_INIT_SCRIPT } from "@/modules/navigation/theme-constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Fluig Integration Studio",
    template: "%s | Fluig Integration Studio",
  },
  description:
    "Construa, teste, documente e diagnostique integrações com TOTVS Fluig.",
};

export const viewport: Viewport = {
  // O color-scheme real é definido por [data-theme] no globals.css (claro/escuro).
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: os scripts abaixo marcam data-sidebar e data-theme no <html> antes do React hidratar.
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
