import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteRequest } from "@/lib/security/same-origin";
import { getActiveWorkspace } from "@/lib/workspace";
import { SolutionsRequestSchema } from "@/modules/support/schemas";
import { findSolutions } from "@/modules/support/solutions";

export const maxDuration = 30;

const MAX_BODY_BYTES = 10_000;

/**
 * Sugere a página oficial (TDN) correspondente a cada problema detectado no log.
 * Determinístico (sem IA): apoia a análise levando o analista direto à solução documentada.
 */
export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request.headers)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Content-Type deve ser application/json." }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Requisição grande demais." }, { status: 413 });
  }

  const workspace = await getActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { issueIds, hasSlow, queries } = SolutionsRequestSchema.parse(payload);
  if (issueIds.length === 0 && !hasSlow && queries.length === 0) {
    return NextResponse.json({ solutions: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const solutions = await findSolutions(issueIds, hasSlow, queries);
    return NextResponse.json({ solutions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Falha na base não deve quebrar a tela de análise: devolve vazio.
    return NextResponse.json({ solutions: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
