---
inclusion: fileMatch
fileMatchPattern: ['src/modules/navigation/**', 'src/app/(app)/**/*.tsx', 'src/components/ui/**', 'src/app/globals.css', 'src/app/layout.tsx']
---

# Navegação e UI

Tema escuro de ferramenta técnica (inspiração Postman/VS Code). Cores e variantes no `globals.css` via Tailwind 4 (`@theme`, `@custom-variant`) — **não há `tailwind.config`**.

## Layout fluido por container queries (importante)

O `<main>` da área logada é **`@container/main`**. As páginas respondem à **largura real disponível** (que muda ao recolher a sidebar), não à largura da tela. Então, em páginas de `(app)`:

- Use as variantes **`@.../main:`** para grade/colunas/disposição: `@md/main:` (28rem), `@xl/main:` (36rem), `@2xl/main:` (42rem), `@5xl/main:` (64rem), `@6xl/main:` (72rem).
- **Não use** `sm:`/`md:`/`lg:` de tela para layout dessas páginas. (Breakpoints de tela seguem valendo na sidebar/cabeçalho e nas telas de `(auth)`, que ficam fora do `@container/main`.)

## Sidebar responsiva (`src/modules/navigation/`)

- `nav-items.ts` — **fonte única** dos módulos, agrupados: `Explorar`, `Testar`, `Inteligência`, `Gestão`, `Suporte`. Usada na sidebar, no dashboard e no breadcrumb.
- `sidebar.tsx`:
  - **Desktop (`lg+`):** coluna fixa ao lado do conteúdo; expandida (15rem) ou recolhida (4rem, só ícones com dica no hover). A largura recolhida vem da variante CSS `sidebar-collapsed` (`@custom-variant` sobre `[data-sidebar="collapsed"]`), não de JS.
  - **Celular/tablet:** gaveta sobreposta com backdrop; trava a rolagem da página e o foco, devolve o foco ao fechar.
  - Atalho **Ctrl/⌘+B** (recolhe no desktop, abre/fecha a gaveta no mobile); **Esc** fecha a gaveta.
- `sidebar-store.ts` — estado via `useSyncExternalStore`, compartilhado com o cabeçalho. O recolhido persiste em `localStorage` (`fis:sidebar`) e no atributo `<html data-sidebar>`.
- `sidebar-constants.ts` — a chave e o **script inline** marcam `<html data-sidebar="collapsed">` **antes da primeira pintura** para não haver "flash" (padrão do guia `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`). O root layout usa `suppressHydrationWarning` por causa disso. Em dev, `useLayoutEffect` reaplica o atributo após o remount do Strict Mode.
- `app-header.tsx` — botão de menu (mobile), título/breadcrumb da página atual, usuário e logout.

## Convenções de UI

- **Acessibilidade:** link "Pular para o conteúdo" (`#conteudo`), `aria-current`, `aria-label` em ícones/botões, foco visível, `role="status"` em estados de carregamento. Respeitar `prefers-reduced-motion` (há regra global que corta animações).
- **Carregamento:** usar `LoadingState` (`src/components/ui/`) nos `fallback` de `<Suspense>`, não um `<p>` solto.
- **Busca ao digitar:** componente cliente fora do `<Suspense>` dos resultados, `debounce` ~250ms, `router.replace(..., { scroll: false })`, estado na URL, reset de página. Padrão em catálogo, histórico e construtor.
- **React Compiler:** o ESLint bloqueia padrões proibidos (ex.: acessar `ref.current` durante o render; passar handler que lê ref). Use handlers inline/efeitos. Isso quebra o build se violado.
- Ícones: `lucide-react`. Markdown: `react-markdown` + `remark-gfm`.
