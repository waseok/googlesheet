import type { SheetItem } from "@/lib/types";

/** sessionStorage 키 (버전 접미사로 스키마 변경 시 충돌 방지) */
const CACHE_KEY = "wasok_sheets_cache_v1";

/** 캐시 유효 시간(밀리초) — 5분 */
const CACHE_TTL_MS = 5 * 60 * 1000;

type CachePayload = {
  ts: number;
  items: SheetItem[];
};

/**
 * 브라우저 탭 단위 캐시: GAS/프록시 호출을 줄여 체감 속도를 높입니다.
 * 새로고침 버튼에서는 `force` 로 이 캐시를 무시합니다.
 */
export function readSheetCache(): { items: SheetItem[]; fresh: boolean } {
  if (typeof window === "undefined") {
    return { items: [], fresh: false };
  }
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return { items: [], fresh: false };
    const parsed = JSON.parse(raw) as Partial<CachePayload>;
    if (
      typeof parsed.ts !== "number" ||
      !Array.isArray(parsed.items) ||
      Date.now() - parsed.ts > CACHE_TTL_MS
    ) {
      return { items: [], fresh: false };
    }
    return { items: parsed.items as SheetItem[], fresh: true };
  } catch {
    return { items: [], fresh: false };
  }
}

export function writeSheetCache(items: SheetItem[]): void {
  if (typeof window === "undefined") return;
  const payload: CachePayload = { ts: Date.now(), items };
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}
