import type { ActiveSheetEntry, ActiveTabFilter, SheetItem, SortKey } from "@/lib/types";

/** 정보·취합 배열을 게시판용 단일 목록으로 합칩니다. */
export function mergeActiveEntries(
  items: SheetItem[],
  collectItems: SheetItem[]
): ActiveSheetEntry[] {
  const infoEntries: ActiveSheetEntry[] = items.map((item) => ({
    item,
    segment: "info" as const,
  }));
  const collectEntries: ActiveSheetEntry[] = collectItems.map((item) => ({
    item,
    segment: "collect" as const,
  }));
  return [...infoEntries, ...collectEntries];
}

export function allActiveItems(items: SheetItem[], collectItems: SheetItem[]): SheetItem[] {
  return [...items, ...collectItems];
}

export function reconcileOrder(order: string[], items: SheetItem[]): string[] {
  const itemIdSet = new Set(items.map((x) => x.id));
  const next: string[] = [];
  for (const id of order) {
    if (itemIdSet.has(id)) next.push(id);
  }
  for (const item of items) {
    if (!next.includes(item.id)) next.push(item.id);
  }
  return next;
}

function primaryTime(it: SheetItem): string {
  return it.createdTime || it.lastUpdated;
}

export function sortActiveEntries(
  entries: ActiveSheetEntry[],
  sortKey: SortKey
): ActiveSheetEntry[] {
  const copy = [...entries];
  switch (sortKey) {
    case "lastUpdated_desc":
      return copy.sort((a, b) =>
        a.item.lastUpdated < b.item.lastUpdated
          ? 1
          : a.item.lastUpdated > b.item.lastUpdated
            ? -1
            : 0
      );
    case "lastUpdated_asc":
      return copy.sort((a, b) =>
        a.item.lastUpdated > b.item.lastUpdated
          ? 1
          : a.item.lastUpdated < b.item.lastUpdated
            ? -1
            : 0
      );
    case "created_desc":
      return copy.sort((a, b) => {
        const ta = primaryTime(a.item);
        const tb = primaryTime(b.item);
        return ta < tb ? 1 : ta > tb ? -1 : 0;
      });
    case "created_asc":
      return copy.sort((a, b) => {
        const ta = primaryTime(a.item);
        const tb = primaryTime(b.item);
        return ta > tb ? 1 : ta < tb ? -1 : 0;
      });
    case "name_asc":
      return copy.sort((a, b) => a.item.name.localeCompare(b.item.name, "ko"));
    case "name_desc":
      return copy.sort((a, b) => b.item.name.localeCompare(a.item.name, "ko"));
    default:
      return copy;
  }
}

export function sortByManualOrder(
  entries: ActiveSheetEntry[],
  order: string[]
): ActiveSheetEntry[] {
  if (entries.length <= 1) return entries;
  const idxMap = new Map<string, number>();
  for (let i = 0; i < order.length; i++) idxMap.set(order[i], i);
  return [...entries].sort((a, b) => {
    const ai = idxMap.get(a.item.id);
    const bi = idxMap.get(b.item.id);
    if (ai == null && bi == null) return 0;
    if (ai == null) return 1;
    if (bi == null) return -1;
    return ai - bi;
  });
}

/** 취합 항목을 위로 올리되, 각 그룹 내 상대 순서는 유지합니다. */
export function applyGroupCollectFirst(entries: ActiveSheetEntry[]): ActiveSheetEntry[] {
  const collect: ActiveSheetEntry[] = [];
  const info: ActiveSheetEntry[] = [];
  for (const entry of entries) {
    if (entry.segment === "collect") collect.push(entry);
    else info.push(entry);
  }
  return [...collect, ...info];
}

export function filterActiveEntries(
  entries: ActiveSheetEntry[],
  query: string,
  tab: ActiveTabFilter
): ActiveSheetEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (tab === "info" && entry.segment !== "info") return false;
    if (tab === "collect" && entry.segment !== "collect") return false;
    if (!q) return true;
    const it = entry.item;
    const desc = (it.description || "").toLowerCase();
    const author = (it.author || "").toLowerCase();
    const mail = (it.authorEmail || "").toLowerCase();
    return (
      it.name.toLowerCase().includes(q) ||
      author.includes(q) ||
      mail.includes(q) ||
      desc.includes(q)
    );
  });
}

/** 탭 필터가 적용된 화면에서 위/아래 이동 시 전역 순서를 갱신합니다. */
export function moveIdInVisibleOrder(
  globalOrder: string[],
  visibleIds: string[],
  itemId: string,
  direction: "up" | "down"
): string[] {
  const vis = [...visibleIds];
  const idx = vis.indexOf(itemId);
  if (idx < 0) return globalOrder;
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= vis.length) return globalOrder;

  const swapped = [...vis];
  const tmp = swapped[idx];
  swapped[idx] = swapped[swapWith];
  swapped[swapWith] = tmp;

  const visibleSet = new Set(swapped);
  const queue = [...swapped];
  return globalOrder.map((id) => {
    if (visibleSet.has(id)) {
      const next = queue.shift();
      return next ?? id;
    }
    return id;
  });
}

/** 예전 구역별 순서 키를 통합 순서로 이어 붙입니다(취합 우선). */
export function migrateLegacyManualOrder(
  infoOrder: string[],
  collectOrder: string[],
  items: SheetItem[],
  collectItems: SheetItem[]
): string[] {
  const merged = [
    ...reconcileOrder(collectOrder, collectItems),
    ...reconcileOrder(infoOrder, items),
  ];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of merged) {
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }
  return reconcileOrder(deduped, allActiveItems(items, collectItems));
}
