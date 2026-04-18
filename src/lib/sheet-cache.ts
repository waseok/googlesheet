import type { SheetItem } from "@/lib/types";
import { normalizeGasSheetItem } from "@/lib/normalize-sheet-item";

const CACHE_KEY = "wasok_sheets_cache_v4";

/** TTL 안이면 네트워크 없이 캐시만 사용합니다. (같은 탭에서 재방문 시 빠른 표시) */
const CACHE_TTL_MS = 30 * 60 * 1000;

type CachePayload = {
  ts: number;
  items: SheetItem[];
  collectItems: SheetItem[];
  completedItems: SheetItem[];
};

function normalizeCachedList(raw: unknown[]): SheetItem[] {
  const out: SheetItem[] = [];
  for (const row of raw) {
    const item = normalizeGasSheetItem(row);
    if (item) out.push(item);
  }
  return out;
}

function parsePayload(raw: string): Partial<CachePayload> | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CachePayload>;
    if (typeof parsed.ts !== "number" || !Array.isArray(parsed.items)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * sessionStorage 에 저장된 목록을 읽습니다.
 * - `fromStorage`: 유효한 JSON 이 있었는지
 * - `fresh`: TTL 이내(이 경우 목록만 보고 서버 재요청 생략 가능)
 */
export function readSheetCacheStaleOk(): {
  items: SheetItem[];
  collectItems: SheetItem[];
  completedItems: SheetItem[];
  fromStorage: boolean;
  fresh: boolean;
} {
  if (typeof window === "undefined") {
    return {
      items: [],
      collectItems: [],
      completedItems: [],
      fromStorage: false,
      fresh: false,
    };
  }
  const raw = sessionStorage.getItem(CACHE_KEY);
  if (!raw) {
    return {
      items: [],
      collectItems: [],
      completedItems: [],
      fromStorage: false,
      fresh: false,
    };
  }
  const parsed = parsePayload(raw);
  if (!parsed || typeof parsed.ts !== "number") {
    return {
      items: [],
      collectItems: [],
      completedItems: [],
      fromStorage: false,
      fresh: false,
    };
  }
  const age = Date.now() - parsed.ts;
  const fresh = age <= CACHE_TTL_MS;
  const mainItems = parsed.items as unknown[];
  return {
    items: normalizeCachedList(mainItems),
    collectItems: Array.isArray(parsed.collectItems)
      ? normalizeCachedList(parsed.collectItems)
      : [],
    completedItems: Array.isArray(parsed.completedItems)
      ? normalizeCachedList(parsed.completedItems)
      : [],
    fromStorage: true,
    fresh,
  };
}

/**
 * TTL 이내 캐시만 반환합니다. (만료 시 빈 배열 — 예전 동작 호환)
 */
export function readSheetCache(): {
  items: SheetItem[];
  collectItems: SheetItem[];
  completedItems: SheetItem[];
  fresh: boolean;
} {
  const r = readSheetCacheStaleOk();
  if (!r.fromStorage || !r.fresh) {
    return {
      items: [],
      collectItems: [],
      completedItems: [],
      fresh: false,
    };
  }
  return {
    items: r.items,
    collectItems: r.collectItems,
    completedItems: r.completedItems,
    fresh: true,
  };
}

export function writeSheetCache(
  items: SheetItem[],
  collectItems: SheetItem[],
  completedItems: SheetItem[]
): void {
  if (typeof window === "undefined") return;
  const payload: CachePayload = {
    ts: Date.now(),
    items,
    collectItems,
    completedItems,
  };
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}
