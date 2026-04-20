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
} from "@/components/ui/card";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Layers,
  Loader2Icon,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

const DESC_MAX = 300;

/** 정보 시트 / 취합 시트 구역에서만 사용합니다. */
export type SheetCardSegment = "info" | "collect";

type SheetCardProps = {
  /** 정보 시트 / 취합 시트 — 헤더 아이콘 구분 */
  segment: SheetCardSegment;
  item: SheetItem;
  completing: boolean;
  onComplete: (item: SheetItem) => void;
  onDescriptionSaved: (id: string, description: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

/** 짧은 표기 — 카드 한 줄 메타에 사용 */
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

function SegmentIcon({ segment }: { segment: SheetCardSegment }) {
  if (segment === "collect") {
    return (
      <Layers
        className="text-emerald-700 dark:text-emerald-400 size-5 shrink-0"
        aria-hidden
      />
    );
  }
  return (
    <Info
      className="text-sky-700 dark:text-sky-400 size-5 shrink-0"
      aria-hidden
    />
  );
}

/**
 * 시트 한 건 — 정보/취합 아이콘, 작성자·날짜·설명(Drive 동기화)
 * 레이아웃은 목록 스캔이 쉽도록 한 줄 메타 + 접을 수 있는 설명 영역입니다.
 */
export function SheetCard({
  segment,
  item,
  completing,
  onComplete,
  onDescriptionSaved,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: SheetCardProps) {
  const [draft, setDraft] = React.useState(item.description || "");
  const [savingDesc, setSavingDesc] = React.useState(false);

  React.useEffect(() => {
    setDraft(item.description || "");
  }, [item.id, item.description]);

  const updated = React.useMemo(
    () => formatKoShort(item.lastUpdated),
    [item.lastUpdated]
  );
  const created = React.useMemo(
    () => formatKoShort(item.createdTime, "—"),
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
  const descPreview =
    (item.description || "").trim().slice(0, 36) +
    ((item.description || "").trim().length > 36 ? "…" : "");

  return (
    <Card
      size="sm"
      className="border-border/70 shadow-sm transition-shadow hover:shadow-md"
    >
      <CardHeader className="border-border/50 border-b bg-slate-50/80 py-2.5 dark:bg-slate-900/40">
        <div className="flex items-center gap-2 px-0.5">
          <SegmentIcon segment={segment} />
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "text-primary hover:text-primary/85 focus-visible:ring-ring",
              "min-w-0 flex-1 rounded-md py-0.5 text-left text-base leading-snug font-semibold tracking-tight sm:text-lg",
              "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2",
              "line-clamp-2 hover:underline"
            )}
          >
            {item.name}
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-2.5">
        {/* 작성자 · 생성 · 수정 — 한 줄로 압축 */}
        <p
          className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-tight"
          title={authorTitle}
        >
          <UserRound className="text-primary/60 size-3 shrink-0" aria-hidden />
          <span className="text-foreground/90 font-medium">{authorLabel}</span>
          <span className="text-muted-foreground/70" aria-hidden>
            ·
          </span>
          <CalendarDays className="size-3 shrink-0 opacity-70" aria-hidden />
          <span>생성 {created}</span>
          <span className="text-muted-foreground/70" aria-hidden>
            ·
          </span>
          <Clock className="size-3 shrink-0 opacity-70" aria-hidden />
          <span>수정 {updated}</span>
        </p>

        {/* 접혀 있으면 카드 높이가 줄어들어 목록 스캔이 쉬움 */}
        <details className="border-border/60 bg-muted/15 group/desc rounded-md border open:bg-background/80">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none px-2 py-1.5 text-xs font-medium select-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex w-full items-center justify-between gap-2">
              <span>설명</span>
              <span className="text-muted-foreground/80 max-w-[65%] truncate font-normal tabular-nums">
                {descPreview || "없음"}
              </span>
            </span>
          </summary>
          <div className="border-border/50 space-y-1.5 border-t px-2 py-2">
            <div className="text-muted-foreground/80 flex justify-end text-[10px] tabular-nums">
              {draft.length} / {DESC_MAX}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, DESC_MAX))}
              maxLength={DESC_MAX}
              rows={2}
              placeholder="용도·담당·기한 등을 짧게 적어 주세요."
              className={cn(
                "border-input bg-background ring-offset-background placeholder:text-muted-foreground",
                "focus-visible:ring-ring max-h-[3.5rem] min-h-[2.25rem] w-full resize-y rounded-md border px-2 py-1 text-xs leading-snug shadow-sm",
                "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
              disabled={savingDesc}
              aria-label="시트 설명"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={savingDesc || !dirty}
                onClick={() => void saveDescription()}
                className="h-7 gap-1 px-2 text-xs"
              >
                {savingDesc ? (
                  <>
                    <Loader2Icon className="size-3 shrink-0 animate-spin" />
                    저장 중…
                  </>
                ) : (
                  "설명 저장"
                )}
              </Button>
              {dirty ? (
                <span className="text-muted-foreground text-[10px] leading-tight">
                  저장 전까지 Drive에는 반영되지 않습니다.
                </span>
              ) : null}
            </div>
          </div>
        </details>
      </CardContent>
      <CardFooter className="bg-muted/15 flex flex-wrap gap-1.5 border-t py-2.5">
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
          size="sm"
          disabled={completing}
          onClick={() => onComplete(item)}
          className="h-7 border-transparent bg-red-600 px-2.5 text-xs text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500/40"
        >
          {completing ? "처리 중…" : "완료 처리"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canMoveUp}
          onClick={onMoveUp}
          className="h-7 gap-1 px-2 text-xs"
          title="링크를 위로 이동"
        >
          <ChevronUp className="size-3.5" />
          위로
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canMoveDown}
          onClick={onMoveDown}
          className="h-7 gap-1 px-2 text-xs"
          title="링크를 아래로 이동"
        >
          <ChevronDown className="size-3.5" />
          아래로
        </Button>
      </CardFooter>
    </Card>
  );
}
