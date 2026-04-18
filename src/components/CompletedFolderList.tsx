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
 * 완료 폴더: 제목 + 되돌리기만, 한 줄에 최대 4칸(반응형 그리드).
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
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <div className="border-border/60 bg-background/90 flex flex-col gap-1.5 rounded-md border px-2 py-1.5 shadow-sm">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/85 line-clamp-2 min-h-[2.25rem] text-left text-[11px] leading-tight font-medium hover:underline sm:text-xs"
              title={item.name}
            >
              {item.name}
            </a>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={restoringId === item.id}
              onClick={() => onRestore(item)}
              className="h-7 w-full px-1.5 text-[11px] sm:text-xs"
            >
              {restoringId === item.id ? (
                <Loader2Icon className="mx-auto size-3.5 animate-spin" />
              ) : (
                "되돌리기"
              )}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
