"use client";

import * as React from "react";
import type { SortKey } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortDropdownProps = {
  value: SortKey;
  onValueChange: (key: SortKey) => void;
};

const LABELS: Record<SortKey, string> = {
  created_desc: "생성일 · 최신순",
  created_asc: "생성일 · 오래된순",
  lastUpdated_desc: "수정일 · 최신순",
  lastUpdated_asc: "수정일 · 오래된순",
  name_asc: "이름 · 가나다순",
  name_desc: "이름 · 역순",
};

/** Select 트리거에 한글 라벨이 보이도록 items 맵 제공 */
const ITEMS_MAP: Record<string, string> = LABELS;

/**
 * 정렬 선택 — 트리거에도 항상 한글 라벨이 나오도록 items 를 넘깁니다.
 */
export function SortDropdown({ value, onValueChange }: SortDropdownProps) {
  return (
    <Select
      items={ITEMS_MAP}
      value={value}
      onValueChange={(v) => onValueChange(v as SortKey)}
    >
      <SelectTrigger
        className="border-border/80 bg-background/90 h-10 min-w-[220px] shadow-sm"
        aria-label="정렬 기준"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(LABELS) as SortKey[]).map((k) => (
          <SelectItem key={k} value={k}>
            {LABELS[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
