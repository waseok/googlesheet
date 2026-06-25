"use client";

import * as React from "react";
import type { SheetItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Loader2Icon } from "lucide-react";

type CompletedFolderListProps = {
  items: SheetItem[];
  restoringId: string | null;
  dismissingId: string | null;
  onRestore: (item: SheetItem) => void;
  onDismiss: (item: SheetItem) => void;
};

/**
 * 완료 폴더: 제목 + 되돌리기·목록 삭제
 */
export function CompletedFolderList({
  items,
  restoringId,
  dismissingId,
  onRestore,
  onDismiss,
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
      {items.map((item) => {
        const busy = restoringId === item.id || dismissingId === item.id;
        return (
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
              <div className="grid grid-cols-2 gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onRestore(item)}
                  className="h-7 px-1 text-[11px] sm:text-xs"
                >
                  {restoringId === item.id ? (
                    <Loader2Icon className="mx-auto size-3.5 animate-spin" />
                  ) : (
                    "되돌리기"
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => onDismiss(item)}
                  className="h-7 px-1 text-[11px] sm:text-xs"
                  title="허브 목록에서만 제거합니다. 구글 시트 파일은 삭제되지 않습니다."
                >
                  {dismissingId === item.id ? (
                    <Loader2Icon className="mx-auto size-3.5 animate-spin" />
                  ) : (
                    "삭제"
                  )}
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
