"use client";

import * as React from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

type SearchBarProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

/**
 * 제목·작성자·설명 검색용 입력창입니다.
 */
export function SearchBar({
  value,
  onChange,
  placeholder = "제목, 작성자, 설명으로 검색…",
}: SearchBarProps) {
  return (
    <div className="relative max-w-md flex-1">
      <SearchIcon
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border-border/80 bg-background/90 h-10 pr-3 pl-9 shadow-sm"
        aria-label="시트 검색"
      />
    </div>
  );
}
