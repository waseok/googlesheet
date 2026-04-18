"use client";

import * as React from "react";
import { toast } from "sonner";
import type { SheetItem, SortKey } from "@/lib/types";
import { readSheetCache, writeSheetCache } from "@/lib/sheet-cache";
import { SearchBar } from "@/components/SearchBar";
import { SortDropdown } from "@/components/SortDropdown";
import { SheetCard } from "@/components/SheetCard";
import { Button } from "@/components/ui/button";

/** 정렬·필터에 쓰는 시각(생성일 없으면 수정일로 대체) */
function primaryTime(it: SheetItem): string {
  return it.createdTime || it.lastUpdated;
}

/**
 * 검색어로 제목·소유자를 필터링합니다(대소문자 무시).
 */
function filterItems(items: SheetItem[], query: string): SheetItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (it) =>
      it.name.toLowerCase().includes(q) ||
      (it.owner && it.owner.toLowerCase().includes(q))
  );
}

/**
 * 정렬 키에 따라 복사본을 정렬합니다.
 */
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

type SheetGridProps = {
  list: SheetItem[];
  completingId: string | null;
  onComplete: (item: SheetItem) => void;
};

function SheetGrid({ list, completingId, onComplete }: SheetGridProps) {
  if (list.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-sm">
        이 구역에 표시할 시트가 없습니다.
      </p>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((item) => (
        <li key={item.id}>
          <SheetCard
            item={item}
            completing={completingId === item.id}
            onComplete={onComplete}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * 대시보드: 일반 / 취합 구역 분리, sessionStorage 캐시, 검색·정렬, 완료(낙관적 업데이트).
 */
export function WasokDashboard() {
  const [items, setItems] = React.useState<SheetItem[]>([]);
  const [collectItems, setCollectItems] = React.useState<SheetItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("created_desc");
  const [completingId, setCompletingId] = React.useState<string | null>(null);

  const loadSheets = React.useCallback(async (opts: { force: boolean }) => {
    if (!opts.force) {
      const cached = readSheetCache();
      if (cached.fresh) {
        setItems(cached.items);
        setCollectItems(cached.collectItems);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/sheets", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        items?: SheetItem[];
        collectItems?: SheetItem[];
        error?: string;
      };

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const next = Array.isArray(data.items) ? data.items : [];
      const nextCollect = Array.isArray(data.collectItems) ? data.collectItems : [];
      setItems(next);
      setCollectItems(nextCollect);
      writeSheetCache(next, nextCollect);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("목록을 불러오지 못했습니다.", { description: msg });
      setItems([]);
      setCollectItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSheets({ force: false });
  }, [loadSheets]);

  const visibleMain = React.useMemo(
    () => sortItems(filterItems(items, query), sortKey),
    [items, query, sortKey]
  );

  const visibleCollect = React.useMemo(
    () => sortItems(filterItems(collectItems, query), sortKey),
    [collectItems, query, sortKey]
  );

  const totalVisible = visibleMain.length + visibleCollect.length;

  const handleComplete = React.useCallback(
    async (item: SheetItem) => {
      const prevMain = items;
      const prevCollect = collectItems;
      const optimisticMain = prevMain.filter((x) => x.id !== item.id);
      const optimisticCollect = prevCollect.filter((x) => x.id !== item.id);
      setItems(optimisticMain);
      setCollectItems(optimisticCollect);
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
        writeSheetCache(optimisticMain, optimisticCollect);
      } catch (e) {
        setItems(prevMain);
        setCollectItems(prevCollect);
        const msg = e instanceof Error ? e.message : String(e);
        toast.error("완료 처리에 실패했습니다.", { description: msg });
      } finally {
        setCompletingId(null);
      }
    },
    [items, collectItems]
  );

  return (
    <div className="space-y-10">
      <header className="space-y-2 border-b pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          와석초 Sheet Hub
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          제목에{" "}
          <code className="bg-muted text-foreground rounded px-1 py-0.5">
            [와석초]
          </code>{" "}
          가 포함되고,{" "}
          <strong className="text-foreground">2026년에 생성된</strong>{" "}
          스프레드시트만 표시합니다. 제목에{" "}
          <code className="bg-muted text-foreground rounded px-1 py-0.5">
            취합
          </code>
          이 들어간 시트는 아래 &quot;취합&quot; 구역에 따로 모읍니다.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void loadSheets({ force: true })}
          >
            {loading ? "불러오는 중…" : "새로고침"}
          </Button>
          <span className="text-muted-foreground text-sm">
            캐시 TTL 5분 · GAS에서 연도·키워드 필터
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SearchBar value={query} onChange={setQuery} />
        <SortDropdown value={sortKey} onValueChange={setSortKey} />
      </div>

      {loading && items.length === 0 && collectItems.length === 0 ? (
        <p className="text-muted-foreground text-sm">목록을 불러오는 중입니다…</p>
      ) : totalVisible === 0 ? (
        <p className="text-muted-foreground text-sm">
          표시할 시트가 없습니다. 검색어를 바꾸거나 새로고침 해 보세요.
        </p>
      ) : (
        <>
          <section className="space-y-3" aria-labelledby="sec-general">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
              <h2
                id="sec-general"
                className="text-lg font-medium tracking-tight"
              >
                일반
              </h2>
              <span className="text-muted-foreground text-sm">
                {visibleMain.length}건
              </span>
            </div>
            <SheetGrid
              list={visibleMain}
              completingId={completingId}
              onComplete={handleComplete}
            />
          </section>

          <section className="space-y-3" aria-labelledby="sec-collect">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
              <h2
                id="sec-collect"
                className="text-lg font-medium tracking-tight"
              >
                취합 (제목에 &quot;취합&quot; 포함)
              </h2>
              <span className="text-muted-foreground text-sm">
                {visibleCollect.length}건
              </span>
            </div>
            <SheetGrid
              list={visibleCollect}
              completingId={completingId}
              onComplete={handleComplete}
            />
          </section>
        </>
      )}
    </div>
  );
}
