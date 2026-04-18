import { NextResponse } from "next/server";
import type { GasDescriptionResponse } from "@/lib/types";
import { requireGasMutationToken, requireGasWebAppUrl } from "@/lib/gas-config";

const MAX_LEN = 8000;

/**
 * 시트 설명을 Drive에 저장합니다(GAS POST → setDescription).
 */
export async function POST(request: Request) {
  let baseUrl: string;
  let token: string;
  try {
    baseUrl = requireGasWebAppUrl();
    token = requireGasMutationToken();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message } satisfies GasDescriptionResponse,
      { status: 500 }
    );
  }

  let body: { fileId?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body 가 필요합니다." } satisfies GasDescriptionResponse,
      { status: 400 }
    );
  }

  const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
  if (!fileId) {
    return NextResponse.json(
      { ok: false, error: "fileId 가 필요합니다." } satisfies GasDescriptionResponse,
      { status: 400 }
    );
  }

  const rawDesc =
    typeof body.description === "string" ? body.description : "";
  const description =
    rawDesc.length > MAX_LEN ? rawDesc.slice(0, MAX_LEN) : rawDesc;

  let gasRes: Response;
  try {
    gasRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        action: "saveDescription",
        token,
        fileId,
        description,
      }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `GAS 호출 실패: ${message}` } satisfies GasDescriptionResponse,
      { status: 502 }
    );
  }

  let data: unknown;
  try {
    data = await gasRes.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "GAS 응답이 JSON 이 아닙니다." } satisfies GasDescriptionResponse,
      { status: 502 }
    );
  }

  const parsed = data as GasDescriptionResponse;

  if (!gasRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error || `GAS HTTP ${gasRes.status}`,
      } satisfies GasDescriptionResponse,
      { status: 502 }
    );
  }

  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 400 });
  }

  return NextResponse.json(parsed);
}
