"use client";

import * as React from "react";
import type { SheetItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Loader2Icon } from "lucide-react";

type CompletedFolderListProps = {
  items: SheetItem[];
  restoringId: string | null;
  onRestore: (item: SheetItem) => void;
};

/**
 * 완료 폴더: 제목만 표시(클릭 시 시트 열기) + 되돌리기
 */
export function CompletedFolderList({
  items,
  restoringId,
  onRestore,
}: CompletedFolderListProps) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        완료 폴더에 시트가 없습니다.
      </p>
    );
  }

  return (
    <ul className="divide-border/60 divide-y rounded-lg border border-border/60 bg-background/80">
      {items.map((item) => (
        <li
          key={item.id}
          className="hover:bg-muted/40 flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap"
        >
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 min-w-0 flex-1 truncate text-sm font-medium hover:underline"
          >
            {item.name}
          </a>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={restoringId === item.id}
            onClick={() => onRestore(item)}
            className="shrink-0"
          >
            {restoringId === item.id ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2Icon className="size-3.5 animate-spin" />
                처리 중…
              </span>
            ) : (
              "되돌리기"
            )}
          </Button>
        </li>
      ))}
    </ul>
  );
}
