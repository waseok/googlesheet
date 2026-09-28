import { NextResponse } from "next/server";
import type { GasListResponse, SheetItem } from "@/lib/types";
import { requireGasWebAppUrl } from "@/lib/gas-config";
import { normalizeGasSheetItem } from "@/lib/normalize-sheet-item";

function emptyListError(message: string): GasListResponse {
  return {
    ok: false,
    items: [],
    collectItems: [],
    completedItems: [],
    error: message,
  };
}

function normalizeList(raw: unknown): SheetItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SheetItem[] = [];
  for (const row of raw) {
    const item = normalizeGasSheetItem(row);
    if (item) out.push(item);
  }
  return out;
}

/**
 * GAS 목록을 프록시합니다. 브라우저는 이 엔드포인트만 호출합니다.
 */
export async function GET() {
  let baseUrl: string;
  try {
    baseUrl = requireGasWebAppUrl();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(emptyListError(message), { status: 500 });
  }

  const url = new URL(baseUrl);
  url.searchParams.set("action", "list");

  let gasRes: Response;
  try {
    gasRes = await fetch(url.toString(), { cache: "no-store" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(emptyListError(`GAS 호출 실패: ${message}`), {
      status: 502,
    });
  }

  const rawText = await gasRes.text();
  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    // GAS 가 권한 요청·오류·로그인 페이지 등 HTML 을 돌려준 경우, 원인 파악용으로 제목을 함께 노출
    const titleMatch = rawText.match(/<title[^>]*>([^<]*)<\/title>/i);
    const hint = (titleMatch?.[1] || rawText.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 150);
    return NextResponse.json(
      emptyListError(
        `GAS 응답이 JSON 이 아닙니다. 웹앱 URL·배포·권한 승인을 확인하세요. (HTTP ${gasRes.status}${hint ? `: ${hint}` : ""})`
      ),
      { status: 502 }
    );
  }

  const parsed = data as Partial<GasListResponse>;
  if (!gasRes.ok) {
    return NextResponse.json(
      emptyListError(parsed.error || `GAS HTTP ${gasRes.status}`),
      { status: 502 }
    );
  }

  const items = normalizeList(parsed.items);
  const collectItems = normalizeList(parsed.collectItems);
  const completedItems = normalizeList(parsed.completedItems);

  return NextResponse.json({
    ok: parsed.ok !== false,
    items,
    collectItems,
    completedItems,
    error: parsed.error,
  } satisfies GasListResponse);
}
