"use client";

import * as React from "react";
import Image from "next/image";
import { toast } from "sonner";
import type { ActiveTabFilter, SheetItem, SortKey } from "@/lib/types";
import {
  allActiveItems,
  applyGroupCollectFirst,
  filterActiveEntries,
  mergeActiveEntries,
  migrateLegacyManualOrder,
  moveIdInVisibleOrder,
  reconcileOrder,
  sortActiveEntries,
  sortByManualOrder,
} from "@/lib/active-sheets";
import { readSheetCacheStaleOk, writeSheetCache } from "@/lib/sheet-cache";
import { ActiveSheetBoard } from "@/components/ActiveSheetBoard";
import { HubListingRules } from "@/components/HubListingRules";
import { SearchBar } from "@/components/SearchBar";
import { SortDropdown } from "@/components/SortDropdown";
import { CompletedFolderList } from "@/components/CompletedFolderList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

const SORT_STORAGE_KEY = "wasok-sort-key";
const MANUAL_ORDER_ACTIVE_KEY = "wasok-manual-order-active";
const MANUAL_ORDER_INFO_KEY = "wasok-manual-order-info";
const MANUAL_ORDER_COLLECT_KEY = "wasok-manual-order-collect";
const MANUAL_ORDER_COMPLETED_KEY = "wasok-manual-order-completed";
const GROUP_COLLECT_FIRST_KEY = "wasok-group-collect-first";
const ACTIVE_TAB_KEY = "wasok-active-tab";
const COMPLETED_COLLAPSED_KEY = "wasok-completed-collapsed";

const TAB_OPTIONS: { id: ActiveTabFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "info", label: "정보" },
  { id: "collect", label: "취합" },
];

function readIdOrderFromStorage(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function readBoolFromStorage(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function readActiveTabFromStorage(): ActiveTabFilter {
  if (typeof window === "undefined") return "all";
  const raw = window.localStorage.getItem(ACTIVE_TAB_KEY);
  if (raw === "info" || raw === "collect" || raw === "all") return raw;
  return "all";
}

function primaryTime(it: SheetItem): string {
  return it.createdTime || it.lastUpdated;
}

function filterItems(items: SheetItem[], query: string): SheetItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
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

function sortItems(items: SheetItem[], sortKey: SortKey): SheetItem[] {
  const copy = [...items];
  switch (sortKey) {
    case "manual":
      return copy;
    case "lastUpdated_desc":
      return copy.sort((a, b) =>
        a.lastUpdated < b.lastUpdated ? 1 : a.lastUpdated > b.lastUpdated ? -1 : 0
      );
    case "lastUpdated_asc":
      return copy.sort((a, b) =>
        a.lastUpdated > b.lastUpdated ? 1 : a.lastUpdated < b.lastUpdated ? -1 : 0
      );
    case "created_desc":
      return copy.sort((a, b) => {
        const ta = primaryTime(a);
        const tb = primaryTime(b);
        return ta < tb ? 1 : ta > tb ? -1 : 0;
      });
    case "created_asc":
      return copy.sort((a, b) => {
        const ta = primaryTime(a);
        const tb = primaryTime(b);
        return ta > tb ? 1 : ta < tb ? -1 : 0;
      });
    case "name_asc":
      return copy.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    case "name_desc":
      return copy.sort((a, b) => b.name.localeCompare(a.name, "ko"));
    default:
      return copy;
  }
}

function sortByManualOrderItems(items: SheetItem[], order: string[]): SheetItem[] {
  if (items.length <= 1) return items;
  const idxMap = new Map<string, number>();
  for (let i = 0; i < order.length; i++) idxMap.set(order[i], i);
  return [...items].sort((a, b) => {
    const ai = idxMap.get(a.id);
    const bi = idxMap.get(b.id);
    if (ai == null && bi == null) return 0;
    if (ai == null) return 1;
    if (bi == null) return -1;
    return ai - bi;
  });
}

function extractFileId(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  const m = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m && m[1]) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(text) ? text : "";
}

function readInitialManualActiveOrder(
  items: SheetItem[],
  collectItems: SheetItem[]
): string[] {
  const active = readIdOrderFromStorage(MANUAL_ORDER_ACTIVE_KEY);
  if (active.length > 0) {
    return reconcileOrder(active, allActiveItems(items, collectItems));
  }
  return migrateLegacyManualOrder(
    readIdOrderFromStorage(MANUAL_ORDER_INFO_KEY),
    readIdOrderFromStorage(MANUAL_ORDER_COLLECT_KEY),
    items,
    collectItems
  );
}

/**
 * 와석초 시트 허브 — 통합 게시판(정보+취합) + 완료 폴더
 */
export function WasokDashboard() {
  const [items, setItems] = React.useState<SheetItem[]>([]);
  const [collectItems, setCollectItems] = React.useState<SheetItem[]>([]);
  const [completedItems, setCompletedItems] = React.useState<SheetItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<ActiveTabFilter>(readActiveTabFromStorage);
  const [groupCollectFirst, setGroupCollectFirst] = React.useState(() =>
    readBoolFromStorage(GROUP_COLLECT_FIRST_KEY, true)
  );
  const [sortKey, setSortKey] = React.useState<SortKey>(() => {
    if (typeof window === "undefined") return "name_asc";
    const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (
      saved === "manual" ||
      saved === "lastUpdated_desc" ||
      saved === "lastUpdated_asc" ||
      saved === "created_desc" ||
      saved === "created_asc" ||
      saved === "name_asc" ||
      saved === "name_desc"
    ) {
      return saved;
    }
    return "name_asc";
  });
  const [completingId, setCompletingId] = React.useState<string | null>(null);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);
  const [dismissingId, setDismissingId] = React.useState<string | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = React.useState(() =>
    readBoolFromStorage(COMPLETED_COLLAPSED_KEY, false)
  );
  const [registerInput, setRegisterInput] = React.useState("");
  const [registering, setRegistering] = React.useState(false);
  const [manualActiveOrder, setManualActiveOrder] = React.useState<string[]>([]);
  const [manualCompletedOrder, setManualCompletedOrder] = React.useState<string[]>(() =>
    readIdOrderFromStorage(MANUAL_ORDER_COMPLETED_KEY)
  );
  const manualBootstrapped = React.useRef(false);

  const itemsRef = React.useRef(items);
  const collectRef = React.useRef(collectItems);
  const completedRef = React.useRef(completedItems);
  itemsRef.current = items;
  collectRef.current = collectItems;
  completedRef.current = completedItems;

  const patchDescription = React.useCallback(
    (id: string, description: string) => {
      const patch = (list: SheetItem[]) =>
        list.map((x) => (x.id === id ? { ...x, description } : x));
      const nextMain = patch(itemsRef.current);
      const nextCol = patch(collectRef.current);
      const nextDone = patch(completedRef.current);
      setItems(nextMain);
      setCollectItems(nextCol);
      setCompletedItems(nextDone);
      writeSheetCache(nextMain, nextCol, nextDone);
    },
    []
  );

  const loadSheets = React.useCallback(async (opts: { force: boolean }) => {
    const peek = readSheetCacheStaleOk();

    if (!opts.force && peek.fromStorage) {
      setItems(peek.items);
      setCollectItems(peek.collectItems);
      setCompletedItems(peek.completedItems);
      setLoading(false);
      if (peek.fresh) {
        return;
      }
    }

    const showBlockingSpinner = opts.force || !peek.fromStorage;
    if (showBlockingSpinner) {
      setLoading(true);
    }

    try {
      const res = await fetch("/api/sheets", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        items?: SheetItem[];
        collectItems?: SheetItem[];
        completedItems?: SheetItem[];
        error?: string;
      };

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const next = Array.isArray(data.items) ? data.items : [];
      const nextCollect = Array.isArray(data.collectItems) ? data.collectItems : [];
      const nextDone = Array.isArray(data.completedItems) ? data.completedItems : [];
      setItems(next);
      setCollectItems(nextCollect);
      setCompletedItems(nextDone);
      writeSheetCache(next, nextCollect, nextDone);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("목록을 불러오지 못했습니다.", { description: msg });
      if (!peek.fromStorage) {
        setItems([]);
        setCollectItems([]);
        setCompletedItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSheets({ force: false });
  }, [loadSheets]);

  React.useEffect(() => {
    if (manualBootstrapped.current) return;
    if (items.length === 0 && collectItems.length === 0) return;
    manualBootstrapped.current = true;
    setManualActiveOrder(readInitialManualActiveOrder(items, collectItems));
  }, [items, collectItems]);

  React.useEffect(() => {
    window.localStorage.setItem(SORT_STORAGE_KEY, sortKey);
  }, [sortKey]);

  React.useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  React.useEffect(() => {
    window.localStorage.setItem(GROUP_COLLECT_FIRST_KEY, String(groupCollectFirst));
  }, [groupCollectFirst]);

  React.useEffect(() => {
    window.localStorage.setItem(COMPLETED_COLLAPSED_KEY, String(completedCollapsed));
  }, [completedCollapsed]);

  React.useEffect(() => {
    setManualActiveOrder((prev) =>
      reconcileOrder(prev, allActiveItems(items, collectItems))
    );
  }, [items, collectItems]);

  React.useEffect(() => {
    setManualCompletedOrder((prev) => reconcileOrder(prev, completedItems));
  }, [completedItems]);

  React.useEffect(() => {
    window.localStorage.setItem(
      MANUAL_ORDER_ACTIVE_KEY,
      JSON.stringify(manualActiveOrder)
    );
  }, [manualActiveOrder]);

  React.useEffect(() => {
    window.localStorage.setItem(
      MANUAL_ORDER_COMPLETED_KEY,
      JSON.stringify(manualCompletedOrder)
    );
  }, [manualCompletedOrder]);

  const sortedActiveEntries = React.useMemo(() => {
    let entries = mergeActiveEntries(items, collectItems);
    if (sortKey === "manual") {
      entries = sortByManualOrder(entries, manualActiveOrder);
    } else {
      entries = sortActiveEntries(entries, sortKey);
    }
    if (groupCollectFirst) {
      entries = applyGroupCollectFirst(entries);
    }
    return entries;
  }, [items, collectItems, sortKey, manualActiveOrder, groupCollectFirst]);

  const visibleActive = React.useMemo(
    () => filterActiveEntries(sortedActiveEntries, query, activeTab),
    [sortedActiveEntries, query, activeTab]
  );

  const visibleCompleted = React.useMemo(
    () =>
      sortKey === "manual"
        ? sortByManualOrderItems(
            filterItems(completedItems, query),
            manualCompletedOrder
          )
        : sortItems(filterItems(completedItems, query), sortKey),
    [completedItems, query, sortKey, manualCompletedOrder]
  );

  const activeCounts = React.useMemo(
    () => ({
      all: items.length + collectItems.length,
      info: items.length,
      collect: collectItems.length,
    }),
    [items.length, collectItems.length]
  );

  const totalFiltered =
    visibleActive.length + visibleCompleted.length;

  const initialSkeleton =
    loading &&
    items.length === 0 &&
    collectItems.length === 0 &&
    completedItems.length === 0;

  const handleComplete = React.useCallback(
    async (entry: { item: SheetItem }) => {
      const item = entry.item;
      const prevMain = items;
      const prevCollect = collectItems;
      const prevDone = completedItems;
      const optimisticMain = prevMain.filter((x) => x.id !== item.id);
      const optimisticCollect = prevCollect.filter((x) => x.id !== item.id);
      const optimisticDone = sortItems(
        [item, ...prevDone.filter((x) => x.id !== item.id)],
        sortKey === "manual" ? "lastUpdated_desc" : sortKey
      );
      setItems(optimisticMain);
      setCollectItems(optimisticCollect);
      setCompletedItems(optimisticDone);
      setCompletingId(item.id);

      try {
        const res = await fetch("/api/sheets/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: item.id }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };

        if (!res.ok || data.ok === false) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        toast.success("완료 폴더로 이동했습니다.", { description: item.name });
        writeSheetCache(optimisticMain, optimisticCollect, optimisticDone);
      } catch (e) {
        setItems(prevMain);
        setCollectItems(prevCollect);
        setCompletedItems(prevDone);
        const msg = e instanceof Error ? e.message : String(e);
        toast.error("완료 처리에 실패했습니다.", { description: msg });
      } finally {
        setCompletingId(null);
      }
    },
    [items, collectItems, completedItems, sortKey]
  );

  const handleRestore = React.useCallback(
    async (item: SheetItem) => {
      const prevMain = items;
      const prevCollect = collectItems;
      const prevDone = completedItems;
      const isCollect = item.name.includes("취합");

      const withoutDone = prevDone.filter((x) => x.id !== item.id);
      const optimisticMain = isCollect
        ? prevMain
        : sortItems(
            [item, ...prevMain.filter((x) => x.id !== item.id)],
            sortKey === "manual" ? "name_asc" : sortKey
          );
      const optimisticCollect = isCollect
        ? sortItems(
            [item, ...prevCollect.filter((x) => x.id !== item.id)],
            sortKey === "manual" ? "name_asc" : sortKey
          )
        : prevCollect;

      setItems(optimisticMain);
      setCollectItems(optimisticCollect);
      setCompletedItems(withoutDone);
      setRestoringId(item.id);

      try {
        const res = await fetch("/api/sheets/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: item.id }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };

        if (!res.ok || data.ok === false) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        toast.success("완료 폴더에서 꺼냈습니다.", { description: item.name });
        writeSheetCache(optimisticMain, optimisticCollect, withoutDone);
      } catch (e) {
        setItems(prevMain);
        setCollectItems(prevCollect);
        setCompletedItems(prevDone);
        const msg = e instanceof Error ? e.message : String(e);
        toast.error("되돌리기에 실패했습니다.", { description: msg });
      } finally {
        setRestoringId(null);
      }
    },
    [items, collectItems, completedItems, sortKey]
  );

  const handleDismiss = React.useCallback(
    async (item: SheetItem) => {
      if (
        !window.confirm(
          `"${item.name}"\n\n허브 목록에서 삭제할까요?\n(구글 시트 파일 자체는 삭제되지 않습니다.)`
        )
      ) {
        return;
      }

      const prevMain = items;
      const prevCollect = collectItems;
      const prevDone = completedItems;
      const withoutDone = prevDone.filter((x) => x.id !== item.id);

      setCompletedItems(withoutDone);
      setDismissingId(item.id);

      try {
        const res = await fetch("/api/sheets/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: item.id }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };

        if (!res.ok || data.ok === false) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        toast.success("목록에서 삭제했습니다.", { description: item.name });
        writeSheetCache(prevMain, prevCollect, withoutDone);
      } catch (e) {
        setCompletedItems(prevDone);
        const msg = e instanceof Error ? e.message : String(e);
        toast.error("목록 삭제에 실패했습니다.", { description: msg });
      } finally {
        setDismissingId(null);
      }
    },
    [items, collectItems, completedItems]
  );

  const handleRegister = React.useCallback(async () => {
    const fileId = extractFileId(registerInput);
    if (!fileId) {
      toast.error("올바른 시트 URL 또는 fileId를 입력해주세요.");
      return;
    }

    setRegistering(true);
    try {
      const res = await fetch("/api/sheets/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        alreadyRegistered?: boolean;
        error?: string;
      };

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (data.alreadyRegistered) {
        toast.success("이미 등록된 시트입니다.");
      } else {
        toast.success("시트를 등록했습니다. 목록을 새로 불러옵니다.");
      }

      setRegisterInput("");
      await loadSheets({ force: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("시트 등록에 실패했습니다.", { description: msg });
    } finally {
      setRegistering(false);
    }
  }, [loadSheets, registerInput]);

  const handleMoveActive = React.useCallback(
    (itemId: string, direction: "up" | "down") => {
      const visibleIds = visibleActive.map((e) => e.item.id);
      setManualActiveOrder((prev) =>
        moveIdInVisibleOrder(
          reconcileOrder(prev, allActiveItems(items, collectItems)),
          visibleIds,
          itemId,
          direction
        )
      );
      if (sortKey !== "manual") {
        setSortKey("manual");
        toast.success("직접 정렬 모드로 전환했습니다.");
      }
    },
    [visibleActive, items, collectItems, sortKey]
  );

  return (
    <div className="min-h-screen bg-slate-100/90 dark:bg-slate-950">
      <header className="border-border/40 text-primary-foreground border-b bg-[#183963] shadow-md">
        <div className="container mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/waseok-logo.png"
              alt="와석초등학교 교표"
              width={56}
              height={56}
              className="ring-background/20 size-14 shrink-0 rounded-full object-cover shadow-md ring-2"
              priority
            />
            <div>
              <p className="text-primary-foreground/85 text-sm font-medium tracking-wide">
                업무용 시트 관리
              </p>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                와석초등학교{" "}
                <span className="text-primary-foreground/90 font-semibold">
                  시트 허브
                </span>
              </h1>
              <HubListingRules />
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => void loadSheets({ force: true })}
            className="shrink-0 self-start sm:self-center"
          >
            {loading ? "불러오는 중…" : "새로고침"}
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-8">
        <div className="border-border/60 bg-background/95 mb-6 flex flex-col gap-4 rounded-xl border p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <SearchBar value={query} onChange={setQuery} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={registerInput}
                onChange={(e) => setRegisterInput(e.target.value)}
                placeholder="시트 URL 또는 fileId를 입력해 수동 등록"
                aria-label="시트 URL 또는 fileId 수동 등록"
                disabled={registering}
              />
              <Button
                type="button"
                variant="outline"
                disabled={registering}
                onClick={() => void handleRegister()}
                className="sm:w-auto"
              >
                {registering ? "등록 중…" : "시트 등록"}
              </Button>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={groupCollectFirst}
                onChange={(e) => setGroupCollectFirst(e.target.checked)}
                className="border-input text-primary focus-visible:ring-ring size-4 rounded border"
              />
              <span className="text-foreground font-medium">취합 시트를 위로</span>
            </label>
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs font-medium">링크 순서 정렬</p>
              <SortDropdown value={sortKey} onValueChange={setSortKey} />
            </div>
          </div>
        </div>

        {initialSkeleton ? (
          <p className="text-muted-foreground text-sm">목록을 불러오는 중입니다…</p>
        ) : (
          <>
            {!loading && query.trim() && totalFiltered === 0 ? (
              <p className="text-muted-foreground mb-6 text-center text-sm">
                검색 결과가 없습니다. 검색어를 바꿔 보세요.
              </p>
            ) : null}

            <div className="space-y-8">
              <section
                className="border-border/60 bg-card overflow-hidden rounded-xl border shadow-sm"
                aria-labelledby="sec-active"
              >
                <div className="border-border/50 flex flex-col gap-3 border-b bg-slate-50/90 px-4 py-3 dark:bg-slate-900/50 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div>
                    <h2
                      id="sec-active"
                      className="text-primary border-primary/30 border-l-4 pl-3 text-lg font-semibold tracking-tight"
                    >
                      진행 중 시트
                    </h2>
                    <p className="text-muted-foreground mt-1 pl-4 text-xs">
                      정보·취합을 한 목록에서 확인합니다. 유형 뱃지로 구분됩니다.
                    </p>
                  </div>
                  <span className="text-muted-foreground pl-4 text-sm font-medium tabular-nums sm:pl-0">
                    {activeCounts.all}건
                  </span>
                </div>

                <div className="border-border/50 flex flex-wrap gap-1.5 border-b px-4 py-2.5">
                  {TAB_OPTIONS.map((tab) => (
                    <Button
                      key={tab.id}
                      type="button"
                      size="sm"
                      variant={activeTab === tab.id ? "default" : "outline"}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "h-8 rounded-lg px-3 text-xs",
                        activeTab === tab.id &&
                          "bg-[#183963] text-white hover:bg-[#1f4a7c]"
                      )}
                    >
                      {tab.label}
                      <span className="ml-1.5 tabular-nums opacity-80">
                        {activeCounts[tab.id]}
                      </span>
                    </Button>
                  ))}
                </div>

                <ActiveSheetBoard
                  entries={visibleActive}
                  completingId={completingId}
                  sortKey={sortKey}
                  onComplete={handleComplete}
                  onDescriptionSaved={patchDescription}
                  onMoveUp={(id) => handleMoveActive(id, "up")}
                  onMoveDown={(id) => handleMoveActive(id, "down")}
                  emptyMessage={
                    query.trim()
                      ? "검색 조건에 맞는 진행 중 시트가 없습니다."
                      : "표시할 시트가 없습니다."
                  }
                />
              </section>

              <section
                className="border-border/60 bg-card overflow-hidden rounded-xl border shadow-sm"
                aria-labelledby="sec-completed"
              >
                <button
                  type="button"
                  id="sec-completed"
                  onClick={() => setCompletedCollapsed((v) => !v)}
                  className="border-border/50 flex w-full flex-wrap items-center justify-between gap-2 border-b bg-amber-50/70 px-5 py-3 text-left dark:bg-amber-950/20"
                  aria-expanded={!completedCollapsed}
                >
                  <h2 className="text-amber-950 dark:text-amber-100 flex items-center gap-2 border-l-4 border-amber-700 pl-3 text-lg font-semibold tracking-tight">
                    <ChevronDown
                      className={cn(
                        "size-5 shrink-0 transition-transform",
                        completedCollapsed && "-rotate-90"
                      )}
                      aria-hidden
                    />
                    <span>완료 폴더</span>
                    <span className="text-muted-foreground text-sm font-medium tabular-nums">
                      {visibleCompleted.length}건
                    </span>
                  </h2>
                  <span className="text-muted-foreground text-xs">
                    {completedCollapsed ? "펼치기" : "접기"}
                  </span>
                </button>
                {!completedCollapsed ? (
                  <div className="p-4 sm:p-5">
                    <CompletedFolderList
                      items={visibleCompleted}
                      restoringId={restoringId}
                      dismissingId={dismissingId}
                      onRestore={handleRestore}
                      onDismiss={handleDismiss}
                    />
                  </div>
                ) : null}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
