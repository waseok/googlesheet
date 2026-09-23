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
      자동: 제목 <span className="font-medium">[와석초]</span> 시트 · 수동: 시트·설문
      제목 무관 · 제목에 <span className="font-medium">정보</span>/
      <span className="font-medium">취합</span>
      {" 있으면 구분 (수동·설문은 없어도 표시) · 완료 폴더 제외"}
    </p>
  );
}
