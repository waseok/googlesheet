"use client";

import * as React from "react";
import Image from "next/image";
import { toast } from "sonner";
import type { SheetItem, SortKey } from "@/lib/types";
import { readSheetCacheStaleOk, writeSheetCache } from "@/lib/sheet-cache";
import { SearchBar } from "@/components/SearchBar";
import { SortDropdown } from "@/components/SortDropdown";
import { CompletedFolderList } from "@/components/CompletedFolderList";
import { SheetCard, type SheetCardSegment } from "@/components/SheetCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * GAS `DEFAULT_LIST_YEAR` / 스크립트 속성 LIST_YEAR 기본과 맞춰 안내합니다.
 * 연도를 바꾸면 GAS와 함께 이 값도 수정하세요.
 */
const HUB_LIST_YEAR = 2026;
const SORT_STORAGE_KEY = "wasok-sort-key";

/** 목록 등록 조건을 단어 단위 칩으로 표시 */
function RegChips({
  chips,
  variant = "card",
}: {
  chips: string[];
  variant?: "card" | "header";
}) {
  return (
    <span
      className={cn(
        "flex flex-wrap items-center gap-1",
        variant === "header" && "text-primary-foreground/95"
      )}
      role="note"
    >
      {chips.map((label) => (
        <span
          key={label}
          className={cn(
            "rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-tight sm:text-[11px]",
            variant === "header"
              ? "border-white/25 bg-white/12 text-primary-foreground"
              : "border-border/60 bg-background/80 text-foreground/90 dark:bg-background/40"
          )}
        >
          {label}
        </span>
      ))}
    </span>
  );
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

/**
 * 구글 시트 URL 또는 raw fileId 입력에서 fileId를 추출합니다.
 * 허용 예:
 * - https://docs.google.com/spreadsheets/d/<fileId>/edit...
 * - <fileId>
 */
function extractFileId(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  const m = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m && m[1]) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(text) ? text : "";
}

type SheetGridProps = {
  segment: SheetCardSegment;
  list: SheetItem[];
  completingId: string | null;
  onComplete: (item: SheetItem) => void;
  onDescriptionSaved: (id: string, description: string) => void;
};

function SheetGrid({
  segment,
  list,
  completingId,
  onComplete,
  onDescriptionSaved,
}: SheetGridProps) {
  if (list.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        표시할 시트가 없습니다.
      </p>
    );
  }
  // 한 줄에 시트 카드 2개 (넓은 화면에서도 3열로 늘리지 않음)
  return (
    <ul className="grid grid-cols-2 gap-3">
      {list.map((item) => (
        <li key={item.id}>
          <SheetCard
            segment={segment}
            item={item}
            completing={completingId === item.id}
            onComplete={onComplete}
            onDescriptionSaved={onDescriptionSaved}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * 와석초 시트 허브 — 정보 시트 / 취합 / 완료 폴더(하단)
 */
export function WasokDashboard() {
  const [items, setItems] = React.useState<SheetItem[]>([]);
  const [collectItems, setCollectItems] = React.useState<SheetItem[]>([]);
  const [completedItems, setCompletedItems] = React.useState<SheetItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>(() => {
    if (typeof window === "undefined") return "name_asc";
    const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (
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
  const [registerInput, setRegisterInput] = React.useState("");
  const [registering, setRegistering] = React.useState(false);

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

    // 캐시가 있으면 즉시 화면에 반영 (만료됐어도 stale-while-revalidate)
    if (!opts.force && peek.fromStorage) {
      setItems(peek.items);
      setCollectItems(peek.collectItems);
      setCompletedItems(peek.completedItems);
      setLoading(false);
      if (peek.fresh) {
        return;
      }
    }

    // 첫 방문·강제 새로고침: 캐시 없을 때만 전체 로딩 스피너
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
    window.localStorage.setItem(SORT_STORAGE_KEY, sortKey);
  }, [sortKey]);

  const visibleMain = React.useMemo(
    () => sortItems(filterItems(items, query), sortKey),
    [items, query, sortKey]
  );

  const visibleCollect = React.useMemo(
    () => sortItems(filterItems(collectItems, query), sortKey),
    [collectItems, query, sortKey]
  );

  const visibleCompleted = React.useMemo(
    () => sortItems(filterItems(completedItems, query), sortKey),
    [completedItems, query, sortKey]
  );

  const totalFiltered =
    visibleMain.length + visibleCollect.length + visibleCompleted.length;

  const initialSkeleton =
    loading &&
    items.length === 0 &&
    collectItems.length === 0 &&
    completedItems.length === 0;

  const handleComplete = React.useCallback(
    async (item: SheetItem) => {
      const prevMain = items;
      const prevCollect = collectItems;
      const prevDone = completedItems;
      const optimisticMain = prevMain.filter((x) => x.id !== item.id);
      const optimisticCollect = prevCollect.filter((x) => x.id !== item.id);
      const optimisticDone = sortItems(
        [item, ...prevDone.filter((x) => x.id !== item.id)],
        sortKey
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
      /** GAS와 동일: "취합"이 있으면 취합 구역, 아니면 정보(items) 구역(구 규칙 시트 포함) */
      const isCollect = item.name.includes("취합");

      const withoutDone = prevDone.filter((x) => x.id !== item.id);
      const optimisticMain = isCollect
        ? prevMain
        : sortItems(
            [item, ...prevMain.filter((x) => x.id !== item.id)],
            sortKey
          );
      const optimisticCollect = isCollect
        ? sortItems(
            [item, ...prevCollect.filter((x) => x.id !== item.id)],
            sortKey
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
              <h1 className="flex flex-col gap-1.5 text-xl font-bold tracking-tight sm:text-2xl">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span>
                    와석초등학교{" "}
                    <span className="text-primary-foreground/90 font-semibold">
                      시트 허브
                    </span>
                  </span>
                  <RegChips
                    variant="header"
                    chips={[
                      "[와석초]",
                      "구글시트",
                      `${HUB_LIST_YEAR}년생성`,
                      "조직공유",
                      "검색+수동등록",
                    ]}
                  />
                </span>
              </h1>
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
        <div className="border-border/60 bg-background/95 mb-8 flex flex-col gap-4 rounded-xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
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
          <div className="flex shrink-0 flex-col gap-1">
            <p className="text-muted-foreground text-xs font-medium">
              링크 순서 정렬
            </p>
            <SortDropdown value={sortKey} onValueChange={setSortKey} />
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

            <div className="space-y-10">
              <section
                className="border-border/60 bg-card overflow-hidden rounded-xl border shadow-sm"
                aria-labelledby="sec-info"
              >
                <div className="border-border/50 flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-5 py-3 dark:bg-slate-900/50">
                  <h2
                    id="sec-info"
                    className="text-primary border-primary/30 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-l-4 pl-3 text-lg font-semibold tracking-tight"
                  >
                    <span>정보 시트</span>
                    <RegChips
                      chips={[
                        "[와석초]",
                        "정보",
                        "취합없음",
                        `${HUB_LIST_YEAR}년`,
                        "시트",
                      ]}
                    />
                  </h2>
                  <span className="text-muted-foreground text-sm font-medium tabular-nums">
                    {visibleMain.length}건
                  </span>
                </div>
                <div className="p-5">
                  <SheetGrid
                    segment="info"
                    list={visibleMain}
                    completingId={completingId}
                    onComplete={handleComplete}
                    onDescriptionSaved={patchDescription}
                  />
                </div>
              </section>

              <section
                className="border-border/60 bg-card overflow-hidden rounded-xl border shadow-sm"
                aria-labelledby="sec-collect"
              >
                <div className="border-border/50 flex flex-wrap items-center justify-between gap-2 border-b bg-emerald-50/60 px-5 py-3 dark:bg-emerald-950/25">
                  <h2
                    id="sec-collect"
                    className="text-emerald-900 dark:text-emerald-100 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-l-4 border-emerald-600 pl-3 text-lg font-semibold tracking-tight"
                  >
                    <span>취합 시트</span>
                    <RegChips
                      chips={["[와석초]", "취합", `${HUB_LIST_YEAR}년`, "시트"]}
                    />
                  </h2>
                  <span className="text-muted-foreground text-sm font-medium tabular-nums">
                    {visibleCollect.length}건
                  </span>
                </div>
                <div className="p-5">
                  <SheetGrid
                    segment="collect"
                    list={visibleCollect}
                    completingId={completingId}
                    onComplete={handleComplete}
                    onDescriptionSaved={patchDescription}
                  />
                </div>
              </section>

              <section
                className="border-border/60 bg-card overflow-hidden rounded-xl border shadow-sm"
                aria-labelledby="sec-completed"
              >
                <div className="border-border/50 flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50/70 px-5 py-3 dark:bg-amber-950/20">
                  <h2
                    id="sec-completed"
                    className="text-amber-950 dark:text-amber-100 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-l-4 border-amber-700 pl-3 text-lg font-semibold tracking-tight"
                  >
                    <span>완료 폴더</span>
                    <RegChips
                      chips={[
                        "[와석초]",
                        `${HUB_LIST_YEAR}년`,
                        "시트",
                        "완료폴더",
                        "직속",
                      ]}
                    />
                  </h2>
                  <span className="text-muted-foreground text-sm font-medium tabular-nums">
                    {visibleCompleted.length}건
                  </span>
                </div>
                <div className="p-4 sm:p-5">
                  <CompletedFolderList
                    items={visibleCompleted}
                    restoringId={restoringId}
                    onRestore={handleRestore}
                  />
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
