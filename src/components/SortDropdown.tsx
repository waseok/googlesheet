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

/**
 * 클라이언트에서만 동작하는 정렬 선택입니다.
 * 서버 재요청 없이 각 구역의 배열을 정렬해 보여줍니다.
 */
export function SortDropdown({ value, onValueChange }: SortDropdownProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as SortKey)}
    >
      <SelectTrigger className="w-[220px]" aria-label="정렬 기준">
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
