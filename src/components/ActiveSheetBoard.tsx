"use client";

import * as React from "react";
import type { ActiveSheetEntry } from "@/lib/types";
import { SheetBoardRow } from "@/components/SheetBoardRow";
import { cn } from "@/lib/utils";

type ActiveSheetBoardProps = {
  entries: ActiveSheetEntry[];
  completingId: string | null;
  sortKey: string;
  onComplete: (entry: ActiveSheetEntry) => void;
  onDescriptionSaved: (id: string, description: string) => void;
  onMoveUp: (itemId: string) => void;
  onMoveDown: (itemId: string) => void;
  emptyMessage?: string;
};

/**
 * 정보·취합 통합 게시판 — 데스크톱에서는 표 헤더, 모바일에서는 행 단위
 */
export function ActiveSheetBoard({
  entries,
  completingId,
  sortKey,
  onComplete,
  onDescriptionSaved,
  onMoveUp,
  onMoveDown,
  emptyMessage = "표시할 시트가 없습니다.",
}: ActiveSheetBoardProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const showReorder = sortKey === "manual";

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">{emptyMessage}</p>
    );
  }

  return (
    <div className="overflow-hidden">
      <div
        className="text-muted-foreground border-border/60 hidden border-b bg-slate-50/90 px-4 py-2 text-[11px] font-semibold tracking-wide uppercase sm:grid sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,7rem)_5.5rem_auto] sm:gap-3 dark:bg-slate-900/50"
        aria-hidden
      >
        <span>유형</span>
        <span>제목</span>
        <span>작성자</span>
        <span>수정</span>
        <span className="text-right">작업</span>
      </div>
      <ul className={cn("divide-border/40 divide-y")}>
        {entries.map((entry) => (
          <SheetBoardRow
            key={entry.item.id}
            entry={entry}
            completing={completingId === entry.item.id}
            expanded={expandedId === entry.item.id}
            onToggleExpand={() =>
              setExpandedId((prev) =>
                prev === entry.item.id ? null : entry.item.id
              )
            }
            onComplete={onComplete}
            onDescriptionSaved={onDescriptionSaved}
            onMoveUp={() => onMoveUp(entry.item.id)}
            onMoveDown={() => onMoveDown(entry.item.id)}
            canMoveUp={entries[0]?.item.id !== entry.item.id}
            canMoveDown={entries[entries.length - 1]?.item.id !== entry.item.id}
            showReorder={showReorder}
          />
        ))}
      </ul>
    </div>
  );
}
