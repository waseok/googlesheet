"use client";

import * as React from "react";
import Image from "next/image";
import { toast } from "sonner";
import type { SheetItem, SortKey } from "@/lib/types";
import { readSheetCache, writeSheetCache } from "@/lib/sheet-cache";
import { SearchBar } from "@/components/SearchBar";
import { SortDropdown } from "@/components/SortDropdown";
import { SheetCard } from "@/components/SheetCard";
import { Button } from "@/components/ui/button";

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

type SheetSegment = "general" | "collect";

type SheetGridProps = {
  segment: SheetSegment;
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
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
 * 와석초 시트 허브 대시보드 — 교표·헤더, 일반/취합 구역, 검색·정렬
 */
export function WasokDashboard() {
  const [items, setItems] = React.useState<SheetItem[]>([]);
  const [collectItems, setCollectItems] = React.useState<SheetItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("created_desc");
  const [completingId, setCompletingId] = React.useState<string | null>(null);

  const itemsRef = React.useRef(items);
  const collectRef = React.useRef(collectItems);
  itemsRef.current = items;
  collectRef.current = collectItems;

  const patchDescription = React.useCallback(
    (id: string, description: string) => {
      const nextMain = itemsRef.current.map((x) =>
        x.id === id ? { ...x, description } : x
      );
      const nextCol = collectRef.current.map((x) =>
        x.id === id ? { ...x, description } : x
      );
      setItems(nextMain);
      setCollectItems(nextCol);
      writeSheetCache(nextMain, nextCol);
    },
    []
  );

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
          <SearchBar value={query} onChange={setQuery} />
          <SortDropdown value={sortKey} onValueChange={setSortKey} />
        </div>

        {loading && items.length === 0 && collectItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">목록을 불러오는 중입니다…</p>
        ) : totalVisible === 0 ? (
          <div className="border-border/60 bg-card rounded-xl border p-10 text-center shadow-sm">
            <p className="text-muted-foreground text-sm">
              표시할 시트가 없습니다. 검색어를 바꾸거나 새로고침 해 보세요.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            <section
              className="border-border/60 bg-card overflow-hidden rounded-xl border shadow-sm"
              aria-labelledby="sec-general"
            >
              <div className="border-border/50 flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-5 py-3 dark:bg-slate-900/50">
                <h2
                  id="sec-general"
                  className="text-primary border-primary/30 flex items-center gap-2 border-l-4 pl-3 text-lg font-semibold tracking-tight"
                >
                  일반 시트
                </h2>
                <span className="text-muted-foreground text-sm font-medium tabular-nums">
                  {visibleMain.length}건
                </span>
              </div>
              <div className="p-5">
                <SheetGrid
                  segment="general"
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
                  className="text-emerald-900 dark:text-emerald-100 flex items-center gap-2 border-l-4 border-emerald-600 pl-3 text-lg font-semibold tracking-tight"
                >
                  취합 시트
                  <span className="text-muted-foreground text-xs font-normal">
                    (제목에 &quot;취합&quot; 포함)
                  </span>
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
          </div>
        )}
      </main>
    </div>
  );
}
