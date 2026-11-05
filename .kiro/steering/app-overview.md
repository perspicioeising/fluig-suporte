---
inclusion: always
---

# Fluig Integration Studio — visão geral

Ferramenta web para construir, testar, documentar e diagnosticar integrações com o **TOTVS Fluig** (API REST pública, Webservices SOAP, SDK e eventos JavaScript). Tudo em **português do Brasil**.

Documentação detalhada (carregada sob demanda, não sempre):
- Banco de dados e RLS → `.kiro/steering/database.md` (ativa ao abrir migrations/queries)
- Segurança → `.kiro/steering/security.md` (ativa ao abrir `lib/security`, rotas de API, runtime)
- Navegação e UI → `.kiro/steering/ui-navigation.md` (ativa ao abrir componentes/páginas)
- As 11 telas, uma a uma → `.kiro/steering/modules.md` (puxe com `#modules` quando precisar)

## Princípios que não se quebram

1. **Só documentação oficial.** Catálogo e base do assistente vêm de fontes oficiais (api.fluig.com, Javadoc do SDK, páginas do TDN). O que a documentação não diz **não é inventado**: vira marcador (`SUA_SENHA`, `{param}`) ou "informação insuficiente".
2. **O app nunca altera o Fluig sozinho.** Escrita (POST/PUT/PATCH/DELETE e SOAP que não é de leitura) exige liberação explícita no ambiente; o padrão é somente leitura.
3. **Segredos nunca chegam ao navegador.** Service role, chave da Anthropic e credenciais dos ambientes vivem só no servidor. Credenciais são cifradas (AES-256-GCM).
4. **RLS em tudo.** Dados isolados por workspace via Row Level Security no Supabase.
5. **Entrada da URL é não confiável.** Todo `searchParams`/payload passa por Zod com `.catch(...)` para descartar valores inválidos.

## Pilha

- **Next.js 16.4.5** (App Router, **Cache Components** / `cacheComponents: true`). Consequências práticas:
  - Quem lê `cookies()`, `usePathname()` ou `searchParams` precisa estar sob `<Suspense>`.
  - Middleware é **`src/proxy.ts`** (não `middleware.ts`).
  - Tipos de rota por `npx next typegen` (`PageProps<"/x">`, `LayoutProps<"/">`) — rodar após criar/renomear rotas.
  - **Antes de escrever código Next, leia o guia pertinente em `node_modules/next/dist/docs/`** — esta versão tem mudanças. Veja `AGENTS.md`.
- **React 19**, **Tailwind 4** (config no CSS via `@theme`/`@custom-variant`, sem `tailwind.config`), **Zod 4**.
- **@supabase/ssr** (auth + Postgres + Storage), **@anthropic-ai/sdk**, **cheerio** + **fast-xml-parser**, **react-markdown** + **remark-gfm**, **lucide-react**.
- Deploy na **Vercel**. Em rede corporativa com inspeção TLS, Node precisa de `--use-system-ca`.

## Variáveis de ambiente (`.env.example`)

| Variável | Escopo | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | Conexão do navegador com o Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **servidor** | Credenciais cifradas, Storage, ingestão. **Nunca** com `NEXT_PUBLIC` |
| `ANTHROPIC_API_KEY` | **servidor** | Assistente e diagnóstico |
| `ANTHROPIC_MODEL` | servidor | Opcional; padrão `claude-sonnet-5-5` |
| `CREDENTIALS_ENCRYPTION_KEY` | **servidor** | 32 bytes (64 hex ou base64) para cifrar credenciais dos ambientes |

## Organização do código

- **`src/app/`** — rotas. Grupo `(app)` (área logada; `layout.tsx` valida sessão + sidebar + cabeçalho) e `(auth)` (login/cadastro). `app/api/*` = 4 rotas POST. `app/auth/callback` conclui o login. `src/app/page.tsx` redireciona.
- **`src/modules/<domínio>/`** — a lógica. Padrão por módulo: `queries.ts` (leitura, `import "server-only"`), `actions.ts` (`"use server"`), `schemas.ts`/`types.ts` (Zod + tipos), `components/` (UI). Funções puras (geradores, parsers, redação) ficam em arquivos próprios e são o alvo dos testes.
- **`src/lib/`** — `supabase/` (clientes + `env` + `session`), `security/` (crypto, oauth1, ssrf, same-origin), `workspace.ts` (workspace ativo + papéis), `utils.ts` (`cn`).
- **`src/components/ui/`** — UI compartilhada (ex.: `LoadingState`).
- **`scripts/ingest/`** — importação da documentação (roda na máquina do admin, com service role). Detalhes em `database.md`.
- **`supabase/migrations/`** — SQL idempotente, **aplicado manualmente** pelo usuário no SQL Editor.

### Clientes Supabase — qual usar

- `lib/supabase/server.ts` — **padrão** em Server Components, queries e actions. Respeita RLS (sessão do usuário).
- `lib/supabase/client.ts` — navegador (poucos casos).
- `lib/supabase/admin.ts` — **service role, só no servidor**. Ignora RLS; usar apenas quando necessário (ex.: ler/gravar `encrypted_credentials`, ingestão).

## Autenticação e autorização

- Login via Supabase Auth. **`src/proxy.ts`** renova a sessão e faz checagem **otimista** de rota (deslogado → `/login`; logado fora de `/login|/signup` → `/dashboard`). Públicas: `/login`, `/signup`, `/auth`.
- **Autorização real** é sempre no servidor: `(app)/layout.tsx` chama `supabase.auth.getUser()` e as policies RLS decidem o acesso.
- **Workspace** (`lib/workspace.ts`): no MVP cada usuário tem um workspace pessoal; o modelo já suporta vários. Papéis: `owner`, `admin`, `member`, `viewer`. `WRITE_ROLES` = owner/admin/member; `ADMIN_ROLES` = owner/admin.

## Fluxo de trabalho esperado

- **Verificar sempre:** `npx next typegen` (após mexer em rotas) → `npx tsc --noEmit` → `npx eslint src` → `npm run build`. O ESLint inclui as regras do React Compiler (ex.: não acessar refs no render) e bloqueia o build.
- **Testes:** `npm test` (executor nativo do Node + `tsx`, sem framework extra; arquivos em `tests/`). Cobrem funções puras e de segurança. **Não** tocam banco nem Fluig.
- **Servidor local de produção:** `node --use-system-ca node_modules/next/dist/bin/next start -p 3100`. `npm run dev`/watchers são processos longos: o usuário roda manualmente.
- **Scripts de verificação são temporários** (E2E, UI via CDP, prototipagem): criar, usar e **apagar antes do build** — arquivos `.ts`/`.mts` importados avulsos quebram o `tsc`/build.
- **Migrations o usuário aplica manualmente.** Ao depender de uma coluna nova, verifique a existência e **degrade com elegância** se faltar (padrão já usado em `topics`).
- **Responder em pt-BR.** Comentários de código seguem a convenção do repositório (predominantemente pt-BR).
