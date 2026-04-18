import { NextResponse } from "next/server";
import type { GasListResponse } from "@/lib/types";
import { requireGasWebAppUrl } from "@/lib/gas-config";

/**
 * GAS 목록을 프록시합니다. 브라우저는 이 엔드포인트만 호출합니다.
 */
export async function GET() {
  let baseUrl: string;
  try {
    baseUrl = requireGasWebAppUrl();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, items: [], error: message } satisfies GasListResponse,
      { status: 500 }
    );
  }

  const url = new URL(baseUrl);
  url.searchParams.set("action", "list");

  let gasRes: Response;
  try {
    gasRes = await fetch(url.toString(), { cache: "no-store" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        items: [],
        error: `GAS 호출 실패: ${message}`,
      } satisfies GasListResponse,
      { status: 502 }
    );
  }

  let data: unknown;
  try {
    data = await gasRes.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        items: [],
        error: "GAS 응답이 JSON 이 아닙니다. 웹앱 URL 을 확인하세요.",
      } satisfies GasListResponse,
      { status: 502 }
    );
  }

  const parsed = data as Partial<GasListResponse>;
  if (!gasRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        items: [],
        error: parsed.error || `GAS HTTP ${gasRes.status}`,
      } satisfies GasListResponse,
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: parsed.ok !== false,
    items: Array.isArray(parsed.items) ? parsed.items : [],
    error: parsed.error,
  } satisfies GasListResponse);
}
