import { NextResponse, type NextRequest } from "next/server";
import { handleDiagnose } from "@/modules/diagnostics/analyze";
import { DiagnoseRequestSchema } from "@/modules/diagnostics/types";

export const maxDuration = 60;

const MAX_BODY_BYTES = 80_000;

export async function POST(request: NextRequest) {
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

  const parsed = DiagnoseRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Parâmetros inválidos." },
      { status: 400 },
    );
  }

  return handleDiagnose(parsed.data, request.signal);
}
