"use client";

import * as React from "react";
import { toast } from "sonner";
import type { SheetItem, SortKey } from "@/lib/types";
import { readSheetCache, writeSheetCache } from "@/lib/sheet-cache";
import { SearchBar } from "@/components/SearchBar";
import { SortDropdown } from "@/components/SortDropdown";
import { SheetCard } from "@/components/SheetCard";
import { Button } from "@/components/ui/button";

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
 * 정렬 키에 따라 복사본을 정렬합니다(원본 `items` state는 바꾸지 않음).
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
    case "name_asc":
      return copy.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    case "name_desc":
      return copy.sort((a, b) => b.name.localeCompare(a.name, "ko"));
    default:
      return copy;
  }
}

/**
 * 대시보드 본문: 목록 로드, sessionStorage 캐시, 검색·정렬, 완료(낙관적 업데이트).
 */
export function WasokDashboard() {
  const [items, setItems] = React.useState<SheetItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("lastUpdated_desc");
  const [completingId, setCompletingId] = React.useState<string | null>(null);

  const loadSheets = React.useCallback(async (opts: { force: boolean }) => {
    if (!opts.force) {
      const cached = readSheetCache();
      if (cached.fresh) {
        setItems(cached.items);
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
        error?: string;
      };

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const next = Array.isArray(data.items) ? data.items : [];
      setItems(next);
      writeSheetCache(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("목록을 불러오지 못했습니다.", { description: msg });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSheets({ force: false });
  }, [loadSheets]);

  const visible = React.useMemo(
    () => sortItems(filterItems(items, query), sortKey),
    [items, query, sortKey]
  );

  const handleComplete = React.useCallback(
    async (item: SheetItem) => {
      const prev = items;
      const optimistic = prev.filter((x) => x.id !== item.id);
      setItems(optimistic);
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
        writeSheetCache(optimistic);
      } catch (e) {
        setItems(prev);
        const msg = e instanceof Error ? e.message : String(e);
        toast.error("완료 처리에 실패했습니다.", { description: msg });
      } finally {
        setCompletingId(null);
      }
    },
    [items]
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          와석초 Sheet Hub
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          제목에 <code className="rounded bg-muted px-1 py-0.5 text-foreground">[와석초]</code>가
          포함된 구글 시트를 모아 보여 줍니다. 완료 시 지정한 Drive 폴더로 이동합니다.
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
            캐시 TTL 5분 · 새로고침 시 항상 최신 조회
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SearchBar value={query} onChange={setQuery} />
        <SortDropdown value={sortKey} onValueChange={setSortKey} />
      </div>

      {loading && items.length === 0 ? (
        <p className="text-muted-foreground text-sm">목록을 불러오는 중입니다…</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          표시할 시트가 없습니다. 검색어를 바꾸거나 새로고침 해 보세요.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <li key={item.id}>
              <SheetCard
                item={item}
                completing={completingId === item.id}
                onComplete={handleComplete}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
