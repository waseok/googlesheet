"use client";

import * as React from "react";
import type { ActiveSheetEntry } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2Icon,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

const DESC_MAX = 300;

type SheetBoardRowProps = {
  entry: ActiveSheetEntry;
  completing: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onComplete: (entry: ActiveSheetEntry) => void;
  onDescriptionSaved: (id: string, description: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  showReorder: boolean;
};

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
 * 진행 중 시트 게시판 — 한 줄 스캔 + 펼침 설명
 */
export function SheetBoardRow({
  entry,
  completing,
  expanded,
  onToggleExpand,
  onComplete,
  onDescriptionSaved,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  showReorder,
}: SheetBoardRowProps) {
  const { item, segment } = entry;
  const [draft, setDraft] = React.useState(item.description || "");
  const [savingDesc, setSavingDesc] = React.useState(false);

  React.useEffect(() => {
    setDraft(item.description || "");
  }, [item.id, item.description]);

  const updated = formatKoShort(item.lastUpdated);
  const authorLabel = item.author?.trim() || "(알 수 없음)";
  const authorTitle = item.authorEmail ? `계정: ${item.authorEmail}` : undefined;
  const dirty = draft !== (item.description || "");

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

  return (
    <li
      className={cn(
        "border-border/60 group/row border-b last:border-b-0",
        segment === "collect"
          ? "bg-emerald-50/20 hover:bg-emerald-50/45 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/25"
          : "bg-background hover:bg-slate-50/80 dark:hover:bg-slate-900/40"
      )}
    >
      <div className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,7rem)_5.5rem_auto] sm:items-center sm:gap-3 sm:px-4">
        <div className="flex items-center gap-2 sm:block">
          <Badge variant={segment === "collect" ? "collect" : "info"}>
            {segment === "collect" ? "취합" : "정보"}
          </Badge>
        </div>

        <div className="min-w-0">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:text-primary line-clamp-2 text-sm leading-snug font-semibold tracking-tight transition-colors hover:underline sm:text-[0.95rem]"
          >
            {item.name}
          </a>
          <p
            className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] sm:hidden"
            title={authorTitle}
          >
            <UserRound className="size-3 shrink-0 opacity-70" aria-hidden />
            <span>{authorLabel}</span>
            <span aria-hidden>·</span>
            <Clock className="size-3 shrink-0 opacity-70" aria-hidden />
            <span>{updated}</span>
          </p>
        </div>

        <p
          className="text-muted-foreground hidden min-w-0 truncate text-xs sm:block"
          title={authorTitle}
        >
          <UserRound className="mr-1 inline size-3 opacity-70" aria-hidden />
          {authorLabel}
        </p>

        <p className="text-muted-foreground hidden text-xs tabular-nums sm:block">
          <Clock className="mr-1 inline size-3 opacity-70" aria-hidden />
          {updated}
        </p>

        <div className="flex flex-wrap items-center gap-1 sm:justify-end">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onToggleExpand}
            className="text-muted-foreground h-7 px-2 text-[11px]"
            aria-expanded={expanded}
          >
            설명
          </Button>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ size: "xs" }),
              "h-7 border-transparent bg-[#183963] px-2 text-[11px] text-white hover:bg-[#1f4a7c]"
            )}
          >
            열기
          </a>
          <Button
            type="button"
            size="xs"
            disabled={completing}
            onClick={() => onComplete(entry)}
            className="h-7 border-transparent bg-red-600 px-2 text-[11px] text-white hover:bg-red-700"
          >
            {completing ? "…" : "완료"}
          </Button>
          {showReorder ? (
            <>
              <Button
                type="button"
                size="icon-xs"
                variant="outline"
                disabled={!canMoveUp}
                onClick={onMoveUp}
                title="위로"
                aria-label="위로"
              >
                <ChevronUp />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="outline"
                disabled={!canMoveDown}
                onClick={onMoveDown}
                title="아래로"
                aria-label="아래로"
              >
                <ChevronDown />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div
          className={cn(
            "border-border/50 space-y-2 border-t px-3 py-2.5 sm:px-4",
            segment === "collect" ? "bg-emerald-50/30 dark:bg-emerald-950/15" : "bg-muted/20"
          )}
        >
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
              "border-input bg-background focus-visible:ring-ring min-h-[2.5rem] w-full resize-y rounded-md border px-2.5 py-1.5 text-xs leading-snug shadow-sm",
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
              className="h-7 text-xs"
            >
              {savingDesc ? (
                <>
                  <Loader2Icon className="size-3 animate-spin" />
                  저장 중…
                </>
              ) : (
                "설명 저장"
              )}
            </Button>
            {dirty ? (
              <span className="text-muted-foreground text-[10px]">
                저장 전까지 Drive에는 반영되지 않습니다.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
