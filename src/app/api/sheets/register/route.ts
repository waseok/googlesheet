import { NextResponse } from "next/server";
import type { GasRegisterResponse } from "@/lib/types";
import { requireGasMutationToken, requireGasWebAppUrl } from "@/lib/gas-config";
import { normalizeGasSheetItem } from "@/lib/normalize-sheet-item";
import {
  fetchGoogleFormTitle,
  looksLikeGoogleFormShareUrl,
} from "@/lib/fetch-form-title";

/**
 * fileId 수동 등록을 GAS에 위임합니다.
 * forms.gle 등 설문 단축 링크는 Next.js 에서 제목을 먼저 가져온 뒤 GAS에 name 으로 전달합니다.
 * (GAS UrlFetchApp 제목 스크랩은 불안정·느림)
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

  let body: { fileId?: string; name?: string };
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

  let resolvedName =
    typeof body.name === "string" ? body.name.trim() : "";
  if (!resolvedName && looksLikeGoogleFormShareUrl(fileId)) {
    resolvedName = await fetchGoogleFormTitle(fileId);
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
        ...(resolvedName ? { name: resolvedName } : {}),
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

  const parsed = data as GasRegisterResponse & { linkOnly?: boolean; message?: string };
  let item = normalizeGasSheetItem(parsed.item);

  // GAS 가 name 을 무시하는 구버전이어도, 응답·낙관적 UI 에는 실제 제목을 심음
  if (item && resolvedName && (item.name === "설문 링크" || !item.name)) {
    item = { ...item, name: resolvedName };
  }

  const normalized: GasRegisterResponse = {
    ok: parsed.ok === true,
    id: parsed.id,
    item: item || undefined,
    alreadyRegistered: parsed.alreadyRegistered === true,
    linkOnly: parsed.linkOnly === true,
    message: typeof parsed.message === "string" ? parsed.message : undefined,
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
