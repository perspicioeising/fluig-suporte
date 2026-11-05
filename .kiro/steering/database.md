---
inclusion: fileMatch
fileMatchPattern: ['supabase/migrations/**', 'src/modules/**/queries.ts', 'src/modules/**/actions.ts', 'scripts/ingest/**']
---

# Banco de dados, RLS e ingestão

Supabase Postgres. SQL em `supabase/migrations/`, **idempotente** e **aplicado manualmente** pelo usuário no SQL Editor (nesta ordem). Validação local pode usar PGlite num diretório temporário.

## Migrations (`20261104000001..07`)

1. `core_workspaces` — `profiles`, `workspaces`, `workspace_members` (papéis), RLS e helpers `is_workspace_member(uuid)` e `has_workspace_role(uuid, text[])`.
2. `catalog` — `catalog_sources`; `catalog_entries` (`kind`: `rest_new|rest_old|soap|sdk`); `catalog_parameters`. Índices: `kind`, `tags` (GIN), `name` (trigram).
3. `knowledge_base` — `kb_documents`, `kb_chunks` (coluna `embedding vector(1024)` **reservada, hoje não usada**).
4. `workspace_data` — `fluig_environments`, `collections`, `saved_requests`, `request_history`, `soap_wsdls`, `soap_operations`, `diagnostics`, `ai_conversations`, `ai_messages`.
5. `parameter_argument_location` — posição/argumentos de métodos SOAP/SDK.
6. `kb_fulltext_search` — função `search_kb_chunks(text, int)` (tsvector `'portuguese'`); `execute` só para `authenticated`.
7. `catalog_topics` — coluna `catalog_entries.topics text[]` + índice GIN + índice em `http_method`. **Aplicada depois das demais.**

## Regras de RLS e gravação

- **Tudo isolado por workspace.** Leituras usam `is_workspace_member`; escritas usam `has_workspace_role(..., WRITE_ROLES)`.
- **`request_history` e `diagnostics` são append-only:** `UPDATE` revogado; `DELETE` só do próprio `user_id`. A tela de Histórico depende disso (excluir só os próprios registros).
- **`fluig_environments` tem grants por coluna:** o navegador **não** lê `encrypted_credentials`. **Nunca** `select("*")` nessa tabela com o cliente do usuário — liste as colunas (já causou bug no Dashboard). Para ler/gravar credenciais, use o **admin client** no servidor.
- `catalog_entries.path` guarda, para **soap/sdk**, a **assinatura** do método (contém nomes de parâmetros como `companyId`) — por isso a classificação de assunto ignora `path` nesses tipos (ver `catalog/topics.ts`).

## Degradar quando falta migration

O usuário aplica migrations manualmente, então **não assuma que a coluna existe**. Padrão (usado em `topics`): tente `select` da coluna; no erro de coluna inexistente (Postgres `42703` / PostgREST), esconda o recurso em vez de quebrar a página.

## Busca

Busca textual é **full-text por palavras-chave** (`search_kb_chunks`, tsvector português), **não embeddings** — a Anthropic não oferece embeddings. O caminho de vetor fica pluggável (coluna `embedding` e `match_kb_chunks` reservados). Filtros de catálogo/histórico usam `ILIKE` (case-insensitive), AND de termos, `.contains` para tags/topics.

## Ingestão (`scripts/ingest/`)

Roda na máquina do admin, com service role (`getAdminClient`). Nunca imprime a chave.

```bash
npm run ingest -- --source=rest-new|rest-old|sdk|tdn|help|topics|all [--dry-run] [--limit=N] [--dir=documentos]
```

- `rest-new` — Swagger de api.fluig.com/latest.
- `rest-old` — HTML de api.fluig.com/old. **Caminhos precisam do prefixo `/api/public`** ao chamar.
- `sdk` — Javadoc do SDK.
- `tdn` — páginas do TDN salvas **à mão** em `documentos/` (gitignored). O TDN bloqueia automação via Cloudflare — **não contornar**; o import lê os HTML locais (`tdn-local.ts`).
- `help` — reingere o guia da Ajuda (`help/content.ts`) na base do assistente.
- `topics` — recalcula `catalog_entries.topics` para as entradas já gravadas (rodar após mudar as regras ou aplicar a migration 7).
- **Idempotente** (upsert por chave). Em TLS corporativo já usa `--use-system-ca`.
