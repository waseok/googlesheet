import type { SheetItem } from "@/lib/types";
import { normalizeGasSheetItem } from "@/lib/normalize-sheet-item";

/** 스키마 변경 시 키만 올리면 이전 캐시 무시 */
const CACHE_KEY = "wasok_sheets_cache_v3";

const CACHE_TTL_MS = 5 * 60 * 1000;

type CachePayload = {
  ts: number;
  items: SheetItem[];
  collectItems: SheetItem[];
};

function normalizeCachedList(raw: unknown[]): SheetItem[] {
  const out: SheetItem[] = [];
  for (const row of raw) {
    const item = normalizeGasSheetItem(row);
    if (item) out.push(item);
  }
  return out;
}

/**
 * 일반 목록 + 취합 목록을 함께 캐시합니다.
 */
export function readSheetCache(): {
  items: SheetItem[];
  collectItems: SheetItem[];
  fresh: boolean;
} {
  if (typeof window === "undefined") {
    return { items: [], collectItems: [], fresh: false };
  }
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return { items: [], collectItems: [], fresh: false };
    const parsed = JSON.parse(raw) as Partial<CachePayload>;
    if (
      typeof parsed.ts !== "number" ||
      !Array.isArray(parsed.items) ||
      Date.now() - parsed.ts > CACHE_TTL_MS
    ) {
      return { items: [], collectItems: [], fresh: false };
    }
    return {
      items: normalizeCachedList(parsed.items),
      collectItems: Array.isArray(parsed.collectItems)
        ? normalizeCachedList(parsed.collectItems)
        : [],
      fresh: true,
    };
  } catch {
    return { items: [], collectItems: [], fresh: false };
  }
}

export function writeSheetCache(
  items: SheetItem[],
  collectItems: SheetItem[]
): void {
  if (typeof window === "undefined") return;
  const payload: CachePayload = {
    ts: Date.now(),
    items,
    collectItems,
  };
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}
