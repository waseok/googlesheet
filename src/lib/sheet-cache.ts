import type { SheetItem } from "@/lib/types";
import { normalizeGasSheetItem } from "@/lib/normalize-sheet-item";

const CACHE_KEY = "wasok_sheets_cache_v4";

const CACHE_TTL_MS = 5 * 60 * 1000;

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

export function readSheetCache(): {
  items: SheetItem[];
  collectItems: SheetItem[];
  completedItems: SheetItem[];
  fresh: boolean;
} {
  if (typeof window === "undefined") {
    return { items: [], collectItems: [], completedItems: [], fresh: false };
  }
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) {
      return { items: [], collectItems: [], completedItems: [], fresh: false };
    }
    const parsed = JSON.parse(raw) as Partial<CachePayload>;
    if (
      typeof parsed.ts !== "number" ||
      !Array.isArray(parsed.items) ||
      Date.now() - parsed.ts > CACHE_TTL_MS
    ) {
      return { items: [], collectItems: [], completedItems: [], fresh: false };
    }
    return {
      items: normalizeCachedList(parsed.items),
      collectItems: Array.isArray(parsed.collectItems)
        ? normalizeCachedList(parsed.collectItems)
        : [],
      completedItems: Array.isArray(parsed.completedItems)
        ? normalizeCachedList(parsed.completedItems)
        : [],
      fresh: true,
    };
  } catch {
    return { items: [], collectItems: [], completedItems: [], fresh: false };
  }
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
