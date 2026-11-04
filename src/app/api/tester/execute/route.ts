import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteRequest } from "@/lib/security/same-origin";
import { executeRequest } from "@/modules/tester/execute";
import { ExecuteSchema } from "@/modules/tester/schemas";

// Chamadas ao Fluig podem demorar (limite interno de 30 s por requisição).
export const maxDuration = 60;

const MAX_BODY_BYTES = 1_500_000;

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request.headers)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }
  // Só JSON: formulários de outros sites não conseguem enviar este tipo sem preflight.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Content-Type deve ser application/json." }, { status: 415 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Requisição grande demais." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = ExecuteSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? "Parâmetros inválidos." },
      { status: 400 },
    );
  }

  const outcome = await executeRequest(parsed.data);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  return NextResponse.json(outcome.response, {
    headers: { "Cache-Control": "no-store" },
  });
}
