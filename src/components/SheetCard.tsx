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
import { CalendarDays, Clock, FileText, Loader2Icon, UserRound } from "lucide-react";
import { toast } from "sonner";

const DESC_MAX = 8000;

type SheetCardProps = {
  item: SheetItem;
  completing: boolean;
  onComplete: (item: SheetItem) => void;
  /** 설명 저장 후 부모 목록·캐시 동기화 */
  onDescriptionSaved: (id: string, description: string) => void;
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
 * 시트 한 건 — 작성자·날짜·웹에서 편집 가능한 설명(Drive 동기화)
 */
export function SheetCard({
  item,
  completing,
  onComplete,
  onDescriptionSaved,
}: SheetCardProps) {
  const [draft, setDraft] = React.useState(item.description || "");
  const [savingDesc, setSavingDesc] = React.useState(false);

  React.useEffect(() => {
    setDraft(item.description || "");
  }, [item.id, item.description]);

  const updated = React.useMemo(
    () => formatKo(item.lastUpdated),
    [item.lastUpdated]
  );
  const created = React.useMemo(
    () => formatKo(item.createdTime, "—"),
    [item.createdTime]
  );

  const authorLabel = item.author?.trim() || "(알 수 없음)";
  const authorTitle = item.authorEmail
    ? `계정: ${item.authorEmail}`
    : undefined;

  const saveDescription = async () => {
    const trimmed = draft.slice(0, DESC_MAX);
    setSavingDesc(true);
    try {
      const res = await fetch("/api/sheets/description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: item.id, description: trimmed }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        description?: string;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const saved = typeof data.description === "string" ? data.description : trimmed;
      setDraft(saved);
      onDescriptionSaved(item.id, saved);
      toast.success("설명을 저장했습니다.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("설명 저장에 실패했습니다.", { description: msg });
    } finally {
      setSavingDesc(false);
    }
  };

  const dirty = draft !== (item.description || "");

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
          <div className="text-muted-foreground mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-medium tracking-wide uppercase">
              설명
            </span>
            <span className="text-muted-foreground/80 text-xs tabular-nums">
              {draft.length} / {DESC_MAX}
            </span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, DESC_MAX))}
            maxLength={DESC_MAX}
            rows={4}
            placeholder="이 시트 용도·담당·기한 등을 적어 두면 다른 선생님들이 바로 파악할 수 있어요."
            className={cn(
              "border-input bg-background ring-offset-background placeholder:text-muted-foreground",
              "focus-visible:ring-ring w-full resize-y rounded-md border px-3 py-2 text-sm leading-relaxed shadow-sm",
              "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
            disabled={savingDesc}
            aria-label="시트 설명"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={savingDesc || !dirty}
              onClick={() => void saveDescription()}
              className="inline-flex gap-1.5"
            >
              {savingDesc ? (
                <>
                  <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
                  저장 중…
                </>
              ) : (
                "설명 저장"
              )}
            </Button>
            {dirty ? (
              <span className="text-muted-foreground text-xs">
                저장 전까지 Drive에는 반영되지 않습니다.
              </span>
            ) : null}
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
