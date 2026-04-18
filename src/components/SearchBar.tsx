"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

type SearchBarProps = {
  /** 현재 입력값 (부모 state와 동기화) */
  value: string;
  /** 입력이 바뀔 때마다 호출 → 부모에서 filter 용 query 갱신 */
  onChange: (next: string) => void;
  /** 접근성·힌트용 placeholder */
  placeholder?: string;
};

/**
 * 시트 제목·소유자 검색용 입력창입니다.
 * 디바운스 없이 즉시 반응하도록 설계되어 있습니다(로컬 필터만 사용).
 */
export function SearchBar({
  value,
  onChange,
  placeholder = "제목 또는 소유자 이메일로 검색…",
}: SearchBarProps) {
  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="max-w-md"
      aria-label="시트 검색"
    />
  );
}
