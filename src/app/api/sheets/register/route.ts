import { NextResponse } from "next/server";
import type { GasRegisterResponse } from "@/lib/types";
import { requireGasMutationToken, requireGasWebAppUrl } from "@/lib/gas-config";
import { normalizeGasSheetItem } from "@/lib/normalize-sheet-item";

/**
 * fileId 수동 등록을 GAS에 위임합니다.
 * - 권한이 없는 fileId는 GAS에서 거부됩니다.
 * - 등록 후 목록 조회에 포함되도록 GAS ScriptProperties에 저장합니다.
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
      { ok: false, error: message } satisfies GasRegisterResponse,
      { status: 500 }
    );
  }

  let body: { fileId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body 가 필요합니다." } satisfies GasRegisterResponse,
      { status: 400 }
    );
  }

  const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
  if (!fileId) {
    return NextResponse.json(
      { ok: false, error: "fileId 가 필요합니다." } satisfies GasRegisterResponse,
      { status: 400 }
    );
  }

  let gasRes: Response;
  try {
    gasRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        action: "register",
        token,
        fileId,
      }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `GAS 호출 실패: ${message}` } satisfies GasRegisterResponse,
      { status: 502 }
    );
  }

  let data: unknown;
  try {
    data = await gasRes.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "GAS 응답이 JSON 이 아닙니다." } satisfies GasRegisterResponse,
      { status: 502 }
    );
  }

  const parsed = data as GasRegisterResponse;
  const item = normalizeGasSheetItem(parsed.item);
  const normalized: GasRegisterResponse = {
    ok: parsed.ok === true,
    id: parsed.id,
    item: item || undefined,
    alreadyRegistered: parsed.alreadyRegistered === true,
    error: parsed.error,
  };

  if (!gasRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: normalized.error || `GAS HTTP ${gasRes.status}`,
      } satisfies GasRegisterResponse,
      { status: 502 }
    );
  }

  if (!normalized.ok) {
    return NextResponse.json(normalized, { status: 400 });
  }

  return NextResponse.json(normalized);
}
