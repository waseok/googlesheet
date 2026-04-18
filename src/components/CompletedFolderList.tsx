"use client";

import * as React from "react";
import type { SheetItem } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  ChevronDown,
  Clock,
  Loader2Icon,
  UserRound,
} from "lucide-react";

type CompletedFolderListProps = {
  items: SheetItem[];
  restoringId: string | null;
  onRestore: (item: SheetItem) => void;
};

/** 카드 메타용 짧은 날짜 (SheetCard와 동일 규칙) */
function formatKoShort(iso?: string, fallback = "—"): string {
  if (!iso) return fallback;
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * 완료 폴더: 한 줄에 최대 3칸(그리드).
 * 접힌 칸을 누르면 작성자·일시·설명 등 기존 정보를 펼쳐 확인합니다.
 */
export function CompletedFolderList({
  items,
  restoringId,
  onRestore,
}: CompletedFolderListProps) {
  /** 펼쳐 둔 시트 id — 여러 개 동시에 펼칠 수 있음 */
  const [openIds, setOpenIds] = React.useState<Set<string>>(() => new Set());

  const toggleOpen = React.useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        완료 폴더에 시트가 없습니다.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const open = openIds.has(item.id);
        const authorLabel = item.author?.trim() || "(알 수 없음)";
        const authorTitle = item.authorEmail
          ? `계정: ${item.authorEmail}`
          : undefined;
        const created = formatKoShort(item.createdTime, "—");
        const updated = formatKoShort(item.lastUpdated);
        const desc = (item.description || "").trim();

        return (
          <li key={item.id} className="min-w-0">
            <div
              className={cn(
                "border-border/60 bg-background/90 flex flex-col overflow-hidden rounded-lg border shadow-sm",
                "transition-shadow hover:shadow-md",
                open && "ring-primary/25 ring-2"
              )}
            >
              {/* 접힘: 제목 행 클릭 → 상세 토글 */}
              <button
                type="button"
                onClick={() => toggleOpen(item.id)}
                className="hover:bg-muted/50 flex w-full items-start gap-2 px-2.5 py-2 text-left"
                aria-expanded={open}
              >
                <ChevronDown
                  className={cn(
                    "text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform",
                    open && "rotate-180"
                  )}
                  aria-hidden
                />
                <span className="text-foreground line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug">
                  {item.name}
                </span>
              </button>

              {/* 접힘일 때: 짧은 안내 + 되돌리기 (펼치지 않고도 실행 가능) */}
              {!open ? (
                <div className="border-border/50 flex items-center justify-between gap-2 border-t px-2 py-1.5">
                  <span className="text-muted-foreground text-[10px] leading-tight sm:text-xs">
                    눌러서 정보 보기
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={restoringId === item.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore(item);
                    }}
                    className="h-7 shrink-0 px-2 text-xs"
                  >
                    {restoringId === item.id ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      "되돌리기"
                    )}
                  </Button>
                </div>
              ) : null}

              {/* 펼침: 기존 SheetCard에서 보던 메타·설명 */}
              {open ? (
                <div className="border-border/50 space-y-2.5 border-t px-2.5 py-2.5">
                  <p
                    className="text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] leading-tight"
                    title={authorTitle}
                  >
                    <UserRound
                      className="text-primary/60 size-3 shrink-0"
                      aria-hidden
                    />
                    <span className="text-foreground/90 font-medium">
                      {authorLabel}
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <CalendarDays
                      className="size-3 shrink-0 opacity-70"
                      aria-hidden
                    />
                    <span>생성 {created}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <Clock className="size-3 shrink-0 opacity-70" aria-hidden />
                    <span>수정 {updated}</span>
                  </p>

                  <div>
                    <p className="text-muted-foreground mb-0.5 text-[10px] font-medium tracking-wide uppercase">
                      설명
                    </p>
                    <p
                      className={cn(
                        "bg-muted/30 text-foreground/90 max-h-28 overflow-y-auto rounded-md border border-border/40 px-2 py-1.5 text-xs leading-snug whitespace-pre-wrap",
                        !desc && "text-muted-foreground"
                      )}
                    >
                      {desc || "등록된 설명이 없습니다."}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ size: "sm" }),
                        "h-7 border-transparent bg-sky-600 px-2.5 text-xs text-white shadow-sm hover:bg-sky-700"
                      )}
                    >
                      시트 열기
                    </a>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={restoringId === item.id}
                      onClick={() => onRestore(item)}
                      className="h-7 px-2.5 text-xs"
                    >
                      {restoringId === item.id ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2Icon className="size-3.5 animate-spin" />
                          처리 중…
                        </span>
                      ) : (
                        "되돌리기"
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
