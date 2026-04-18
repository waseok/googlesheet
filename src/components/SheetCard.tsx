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

type SheetCardProps = {
  item: SheetItem;
  /** [완료] 처리 중이면 버튼 비활성화 */
  completing: boolean;
  /** 완료 버튼 클릭 시 (낙관적 업데이트는 부모에서 처리) */
  onComplete: (item: SheetItem) => void;
};

function formatKo(iso?: string, fallback = ""): string {
  if (!iso) return fallback;
  try {
    return new Date(iso).toLocaleString("ko-KR");
  } catch {
    return iso;
  }
}

/**
 * 한 개의 구글 시트 정보를 카드로 표시합니다.
 * [바로가기]는 새 탭에서 시트를 엽니다.
 */
export function SheetCard({ item, completing, onComplete }: SheetCardProps) {
  const updated = React.useMemo(
    () => formatKo(item.lastUpdated),
    [item.lastUpdated]
  );
  const created = React.useMemo(
    () => formatKo(item.createdTime, "(알 수 없음)"),
    [item.createdTime]
  );

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="line-clamp-2 text-base leading-snug">
          {item.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-1 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">소유자</span>{" "}
          {item.owner || "(알 수 없음)"}
        </p>
        <p>
          <span className="font-medium text-foreground">생성</span> {created}
        </p>
        <p>
          <span className="font-medium text-foreground">수정</span> {updated}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t pt-4">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          바로가기
        </a>
        <Button
          size="sm"
          disabled={completing}
          onClick={() => onComplete(item)}
        >
          {completing ? "처리 중…" : "완료"}
        </Button>
      </CardFooter>
    </Card>
  );
}
