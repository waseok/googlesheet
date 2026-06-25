"use client";

import { cn } from "@/lib/utils";

type HubListingRulesProps = {
  className?: string;
};

const RULE_CHIPS = [
  { label: "구글 스프레드시트", tone: "neutral" as const },
  { label: "제목 [와석초]", tone: "accent" as const },
  { label: "생성 연도 무관", tone: "accent" as const },
  { label: "완료 폴더 제외", tone: "neutral" as const },
];

/**
 * 허브에 시트가 모이는 조건 — `gas/Code.gs` 목록 규칙과 동일하게 안내합니다.
 */
export function HubListingRules({ className }: HubListingRulesProps) {
  return (
    <section
      aria-label="모이는 규칙"
      className={cn(
        "mt-3 rounded-xl border-2 border-amber-300/70 bg-white/14 shadow-lg backdrop-blur-sm",
        className
      )}
    >
      <div className="border-b border-white/15 px-3 py-2.5 sm:px-4">
        <p className="text-amber-100 text-sm font-bold tracking-tight sm:text-base">
          여기에 모이는 규칙
        </p>
        <p className="text-primary-foreground/80 mt-0.5 text-xs sm:text-[13px]">
          조직 공유·내 드라이브에서 자동 검색되며, 안 잡히면 아래에서 URL·fileId로
          수동 등록할 수 있습니다.
        </p>
      </div>

      <div className="space-y-3 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap gap-1.5">
          {RULE_CHIPS.map((chip) => (
            <span
              key={chip.label}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-semibold sm:text-xs",
                chip.tone === "accent"
                  ? "border-amber-200/60 bg-amber-400/25 text-amber-50"
                  : "border-white/25 bg-white/10 text-primary-foreground/95"
              )}
            >
              {chip.label}
            </span>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-300/35 bg-emerald-500/15 px-3 py-2">
            <p className="text-emerald-100 text-xs font-bold">취합 시트</p>
            <p className="text-primary-foreground/90 mt-1 text-xs leading-relaxed">
              제목에 <strong className="font-semibold">&quot;취합&quot;</strong>이
              있으면 취합으로 표시
            </p>
          </div>
          <div className="rounded-lg border border-sky-300/35 bg-sky-500/15 px-3 py-2">
            <p className="text-sky-100 text-xs font-bold">정보 시트</p>
            <p className="text-primary-foreground/90 mt-1 text-xs leading-relaxed">
              &quot;취합&quot; 없이{" "}
              <strong className="font-semibold">&quot;정보&quot;</strong>가 있으면
              정보로 표시
            </p>
          </div>
        </div>

        <p className="text-primary-foreground/75 rounded-md border border-white/10 bg-black/10 px-2.5 py-2 text-xs leading-relaxed">
          &quot;취합&quot;·&quot;정보&quot;가 둘 다 없으면 진행 중 목록에 나오지
          않습니다. 완료 처리한 시트는 하단 <strong className="font-medium">완료 폴더</strong>
          로 이동합니다.
        </p>
      </div>
    </section>
  );
}
