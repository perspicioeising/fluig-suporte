---
inclusion: fileMatch
fileMatchPattern: ['src/lib/security/**', 'src/app/api/**', 'src/modules/environments/runtime.ts', 'next.config.ts']
---

# Segurança

Regra-mãe: **segredos nunca chegam ao navegador** e **o app não alcança rede interna**. Qualquer mudança aqui mexe com credenciais, SSRF ou CSRF — verifique com os testes em `tests/security.test.ts`.

## Chamadas ao Fluig (REST e SOAP)

- Toda requisição de saída passa por **`lib/security/ssrf.ts`**:
  - Bloqueia faixas internas, loopback, link-local (inclui `169.254.169.254`), CGNAT, multicast e reservadas, **IPv4 e IPv6** (e `::ffff:` mapeado).
  - A validação ocorre no **lookup de DNS** (impede DNS rebinding).
  - **Não segue redirecionamentos.** Só `http`/`https`. Recusa URL com credenciais embutidas e hosts `localhost`/`.internal`/`.local`.
  - `sanitizeRequestHeaders` remove hop-by-hop e cabeçalhos com CRLF/nome inválido.
- A URL final é **sempre** montada a partir da base do ambiente em `environments/runtime.ts` → `buildTargetUrl`, que recusa caminho que saia da base. **Não existe chamada a URL arbitrária.**
- Tempo limite: 30 s REST, 45 s SOAP. Resposta truncada por tamanho.

## Credenciais e autenticação

- **`lib/security/crypto.ts`** — AES-256-GCM (`v1:` + base64(iv|tag|ciphertext)). Chave em `CREDENTIALS_ENCRYPTION_KEY` (32 bytes). IV aleatório; adulteração é detectada. Só no servidor.
- **`lib/security/oauth1.ts`** — OAuth 1.0a HMAC-SHA1 (RFC 5849). A **API pública exige OAuth1**; Basic devolve `tenantNotSelected` porque o tenant é resolvido pela identidade OAuth. Conferido contra o vetor da RFC nos testes.
- Credenciais são lidas/gravadas só via **admin client** (grants por coluna impedem o navegador).
- SOAP usa Basic via placeholders `{{ENV_USERNAME}}`/`{{ENV_PASSWORD}}`, trocados **no servidor** (`soap/envelope.ts` → `applyEnvPlaceholders`).

## Rotas `/api` e CSRF

As 4 rotas POST (`tester/execute`, `soap/execute`, `assistant/chat`, `diagnostics/analyze`):
- Exigem **`Content-Type: application/json`** e sessão válida.
- Recusam requisições **cross-site** via **`lib/security/same-origin.ts`** (`isCrossSiteRequest`: checa `sec-fetch-site` e `origin` vs host). Clientes fora do navegador não mandam esses headers, mas também não têm o cookie de sessão.
- Limite de tamanho de corpo; `Cache-Control: no-store`.

## Headers HTTP (`next.config.ts`)

CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS; `poweredByHeader: false`. **CSP sem nonce** porque nonce é incompatível com o Partial Prerendering desta versão do Next (ver `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`): `connect-src` libera só o app e o Supabase; `frame-ancestors 'none'`. Em dev adiciona `'unsafe-eval'`.

## Mascaramento (antes de gravar/enviar)

- Histórico REST: `maskHeaders` / `maskUrl` (`environments/runtime.ts`).
- Histórico SOAP: `maskSensitiveXml` (mantém os placeholders `{{ENV_*}}`).
- Antes da IA (diagnóstico): `diagnostics/redact.ts` oculta senhas, tokens, `Authorization`, cookies e JWT. Reabrir no Tester a partir do histórico deixa campos mascarados vazios/desligados (`history/reopen.ts`).
