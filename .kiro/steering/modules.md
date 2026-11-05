---
inclusion: manual
---

# Módulos (telas) — referência

As 11 telas da área logada. Puxe este arquivo com `#modules` quando for mexer numa tela específica. Cada módulo segue o padrão `queries.ts` / `actions.ts` / `schemas.ts` / `components/` (ver `app-overview.md`).

## Dashboard (`/dashboard`)

Contadores reais (ambientes, requisições salvas, WSDLs), últimas requisições e diagnósticos, atalhos para os módulos. Lê contagens com `head: true` e colunas explícitas (nunca `select("*")` em `fluig_environments`).

## APIs Fluig / Catálogo (`/catalogo`, `/catalogo/[id]`)

- Busca **ao digitar**, case-insensitive, vários termos (AND) via `ILIKE`. Filtros: tipo (`kind`), método HTTP, **assunto** e grupo (`tags`).
- **Assunto** = classificação do **próprio Studio** (`catalog/topics.ts`), **não** da doc oficial. Em soap/sdk ignora `path` (é assinatura). Depende da migration 7 → degrada se faltar.
- `queries.ts`: `searchEntries` (filtros + termos), `getFacets` (grupos distintos + flag de topics), `getEntry`.
- Detalhe: parâmetros (entrada/saída), exemplos, link para a fonte oficial, nota de compatibilidade quando a doc é inconsistente, atalhos **Gerar código** (Construtor) e **Abrir no API Tester** (REST, com `/api/public` no antigo).

## Construtor (`/construtor`)

- Gera exemplos (cURL, JS, Java, JSON, XML/SOAP) **só com o que a doc informa**; o resto vira marcador. Geradores em `builder/generators/` (`rest`, `soap`, `sdk`, `json`, `common`). OAuth1 embutido em JS/Java; cURL deixa a assinatura como marcador.
- `builder/tester-link.ts` — ponte para o Tester via **query string** (link compartilhável): `documentedRows` (obrigatórios habilitados primeiro, com `*`; opcionais desabilitados), `buildTesterHref` (corpo some se o link passar de ~6500 chars), `parseTesterPrefill`.
- `rest-builder.tsx` mostra todos os parâmetros documentados (obrigatórios primeiro, opcionais em `<details>`).

## API Tester (`/tester`)

- Executa REST contra os ambientes. Fluxo em `tester/execute.ts` (resolve ambiente → monta URL na base → SSRF → auth → executa → grava histórico mascarado); rota `app/api/tester/execute`.
- Coleções e histórico na lateral (`tester-sidebar.tsx`); detalhe de resposta em `response-view.tsx` com atalho de diagnóstico em erro.
- Pré-preenchível por URL (`parseTesterPrefill`): ambiente, método, caminho com `{param}`, query/headers, corpo. `{param}` não resolvido **bloqueia** o envio; obrigatório vazio **avisa**.

## Webservices SOAP (`/soap`)

- Importa WSDL (`soap/wsdl-parser.ts`, suporta rpc e document/wrapped; Storage bucket `wsdl-files`; `soap/import.ts`).
- Monta envelope (`soap/envelope.ts`) com placeholders `{{ENV_USERNAME}}`/`{{ENV_PASSWORD}}`, trocados **no servidor**. Executa via `soap/execute.ts` / `app/api/soap/execute`.
- **Guarda de escrita** por nome da operação (`soap/guard.ts`): só nomes claramente de leitura (`get`, `find`, `list`, `is`...) passam sem o ambiente permitir escrita. `inspectEnvelope`/`parseSoapFault` leem resposta e Fault (1.1/1.2).

## Assistente IA (`/assistente`)

- RAG sobre a doc oficial. `retrieve.ts`: full-text (`search_kb_chunks`) + reforço por **identificadores citados** (nome de método/serviço) + **glossário pt→en** (`glossary.ts`, ex.: "usuários ativos" → `user`/`active`), com relaxamento de termos. Prioriza rest_new.
- `prompt.ts`: fidelidade à fonte, cita `[n]`, nunca inventa, trata o `<documento>` como dado (anti-injeção), usa `/api/public` ao montar chamadas do REST antigo. Stream **NDJSON** em `chat.ts` / `app/api/assistant/chat`.
- Limites: 8/min, 300/dia por usuário, 2048 tokens. Sem fontes relevantes → não chama o modelo.

## Diagnóstico (`/diagnostico`)

- Analisa um erro colado (HTTP, timeout, SOAP Fault, JSON/XML inválido, falha de SDK). **`redact.ts` oculta segredos ANTES** de enviar ao modelo e de gravar.
- `signals.ts` detecta pistas; pode anexar um registro do histórico como evidência. Saída: resumo, evidências, causas prováveis (com confiança e `(hipótese)`), validações, próximos passos. 4096 tokens; rota `app/api/diagnostics/analyze`.

## Histórico (`/historico`)

- Todas as execuções REST/SOAP do workspace (`history/queries.ts`, 25/página). Busca ao digitar + filtros: tipo, resultado (sucesso 2xx / erro), período (24h/7d/30d), ambiente, "somente as minhas". `applyHistoryFilters` é compartilhado entre listagem e exclusão em lote.
- Detalhe mascarado; **Reabrir no API Tester** (`history/reopen.ts` — recusa SOAP/outro host/ambiente removido; mascarados voltam vazios/desligados); **Diagnosticar**; **Excluir** (os próprios, respeitando a RLS append-only; `actions.ts`).

## Configurações (`/configuracoes`)

- Cadastro de ambientes e credenciais (owner/admin). Tipos de auth em `environments/constants.ts` (`none`, `basic`, `bearer`, `header`, `oauth1`). Credenciais cifradas via admin client; o navegador nunca as lê.

## Ajuda (`/ajuda`)

- Guia em `help/content.ts` (18 seções, agrupadas). Também **ingerido na base do assistente** (`--source=help`): ao mudar o conteúdo, reingerir. Usa `‵` como placeholder de crase no `content.ts`.
