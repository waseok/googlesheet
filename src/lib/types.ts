/**
 * GAS 목록 API와 동일한 스프레드시트 한 건의 형태입니다.
 */
export interface SheetItem {
  id: string;
  name: string;
  url: string;
  owner: string;
  lastUpdated: string;
}

/** GAS `listWasokSheets` 응답 */
export interface GasListResponse {
  ok: boolean;
  items: SheetItem[];
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
  | "name_asc"
  | "name_desc";
