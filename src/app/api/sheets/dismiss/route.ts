import { NextResponse } from "next/server";
import type { GasDismissResponse } from "@/lib/types";
import { requireGasMutationToken, requireGasWebAppUrl } from "@/lib/gas-config";

/**
 * 완료 폴더 항목을 허브 목록에서 숨깁니다(드라이브 파일은 유지).
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
      { ok: false, error: message } satisfies GasDismissResponse,
      { status: 500 }
    );
  }

  let body: { fileId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body 가 필요합니다." } satisfies GasDismissResponse,
      { status: 400 }
    );
  }

  const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
  if (!fileId) {
    return NextResponse.json(
      { ok: false, error: "fileId 가 필요합니다." } satisfies GasDismissResponse,
      { status: 400 }
    );
  }

  const url = new URL(baseUrl);
  url.searchParams.set("action", "dismiss");
  url.searchParams.set("fileId", fileId);
  url.searchParams.set("token", token);

  let gasRes: Response;
  try {
    gasRes = await fetch(url.toString(), { cache: "no-store", method: "GET" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `GAS 호출 실패: ${message}` } satisfies GasDismissResponse,
      { status: 502 }
    );
  }

  let data: unknown;
  try {
    data = await gasRes.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "GAS 응답이 JSON 이 아닙니다." } satisfies GasDismissResponse,
      { status: 502 }
    );
  }

  const parsed = data as GasDismissResponse;

  if (!gasRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error || `GAS HTTP ${gasRes.status}`,
      } satisfies GasDismissResponse,
      { status: 502 }
    );
  }

  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 400 });
  }

  return NextResponse.json(parsed);
}
