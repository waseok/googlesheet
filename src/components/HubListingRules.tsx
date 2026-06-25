"use client";

import { cn } from "@/lib/utils";

type HubListingRulesProps = {
  className?: string;
};

/**
 * 허브 모이는 규칙 — `gas/Code.gs` 와 동일, 한 줄 요약
 */
export function HubListingRules({ className }: HubListingRulesProps) {
  return (
    <p
      className={cn(
        "text-primary-foreground/85 mt-1 max-w-3xl text-xs leading-relaxed sm:text-sm",
        className
      )}
    >
      <span className="text-primary-foreground/95 font-semibold">모이는 규칙</span>
      {" — "}
      제목 <span className="font-medium">[와석초]</span> 구글 시트 · 제목에{" "}
      <span className="font-medium">정보</span> 또는 <span className="font-medium">취합</span>
      {" · 생성 연도 무관 · 완료 폴더 제외 · 검색 안 되면 하단 수동 등록"}
    </p>
  );
}
