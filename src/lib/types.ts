/**
 * GAS 목록 API와 동일한 스프레드시트 한 건의 형태입니다.
 */
export interface SheetItem {
  id: string;
  name: string;
  url: string;
  /** 표시용 작성자 이름 (GAS: 소유자 getName 우선) */
  author: string;
  /** 툴팁·접근성용(있을 때만) */
  authorEmail?: string;
  /** Drive 파일 설명(getDescription) */
  description?: string;
  lastUpdated: string;
  /** 생성 시각(ISO). GAS에서 getDateCreated 기준 */
  createdTime?: string;
}

/** GAS `listWasokSheets` 응답 — 일반 / 취합 분리 */
export interface GasListResponse {
  ok: boolean;
  /** 제목에 "취합"이 없는 시트 */
  items: SheetItem[];
  /** 제목에 "취합"이 포함된 시트 */
  collectItems: SheetItem[];
  error?: string;
}

/** GAS `moveFileToCompleted` / 토큰 오류 응답 */
export interface GasCompleteResponse {
  ok: boolean;
  message?: string;
  id?: string;
  error?: string;
}

/** 정렬 옵션: UI에서 사용 */
export type SortKey =
  | "lastUpdated_desc"
  | "lastUpdated_asc"
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc";
