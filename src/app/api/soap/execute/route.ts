import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteRequest } from "@/lib/security/same-origin";
import { executeSoap } from "@/modules/soap/execute";
import { SoapExecuteSchema } from "@/modules/soap/schemas";

export const maxDuration = 60;

const MAX_BODY_BYTES = 1_500_000;

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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = SoapExecuteSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Parâmetros inválidos." },
      { status: 400 },
    );
  }

  const outcome = await executeSoap(parsed.data);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  return NextResponse.json(outcome.response, { headers: { "Cache-Control": "no-store" } });
}
