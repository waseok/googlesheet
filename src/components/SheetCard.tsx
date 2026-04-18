"use client";

import * as React from "react";
import type { SheetItem } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CalendarDays, Clock, FileText, UserRound } from "lucide-react";

type SheetCardProps = {
  item: SheetItem;
  completing: boolean;
  onComplete: (item: SheetItem) => void;
};

function formatKo(iso?: string, fallback = ""): string {
  if (!iso) return fallback;
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * 시트 한 건 — 업무용 카드, Drive 파일 설명을 요약 칸으로 표시합니다.
 */
export function SheetCard({ item, completing, onComplete }: SheetCardProps) {
  const updated = React.useMemo(
    () => formatKo(item.lastUpdated),
    [item.lastUpdated]
  );
  const created = React.useMemo(
    () => formatKo(item.createdTime, "—"),
    [item.createdTime]
  );

  const desc = (item.description || "").trim();
  const authorLabel = item.author?.trim() || "(알 수 없음)";
  const authorTitle = item.authorEmail
    ? `계정: ${item.authorEmail}`
    : undefined;

  return (
    <Card className="border-border/70 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="border-border/50 space-y-1 border-b bg-slate-50/80 pb-3 dark:bg-slate-900/40">
        <div className="flex items-start gap-2">
          <div className="bg-primary/10 text-primary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md">
            <FileText className="size-4" aria-hidden />
          </div>
          <CardTitle className="text-primary leading-snug font-semibold tracking-tight">
            {item.name}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span
            className="inline-flex items-center gap-1.5"
            title={authorTitle}
          >
            <UserRound className="text-primary/70 size-3.5 shrink-0" />
            <span className="text-foreground font-medium">작성자</span>
            {authorLabel}
          </span>
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5 shrink-0 opacity-70" />
            생성 {created}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5 shrink-0 opacity-70" />
            수정 {updated}
          </span>
        </div>
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
            설명
          </p>
          <div
            className={cn(
              "text-foreground/90 min-h-[3rem] rounded-md border px-3 py-2 text-sm leading-relaxed",
              desc
                ? "border-border/80 bg-white dark:bg-slate-950/50"
                : "border-dashed border-muted-foreground/25 bg-muted/30 text-muted-foreground"
            )}
          >
            {desc || (
              <span className="text-muted-foreground">
                Drive에서 파일 우클릭 → 세부정보 → 설명에 입력하면 여기에
                표시됩니다.
              </span>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="bg-muted/20 flex flex-wrap gap-2 border-t pt-4">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          시트 열기
        </a>
        <Button
          size="sm"
          disabled={completing}
          onClick={() => onComplete(item)}
          className="bg-[#183963] hover:bg-[#143156]"
        >
          {completing ? "처리 중…" : "완료 처리"}
        </Button>
      </CardFooter>
    </Card>
  );
}
