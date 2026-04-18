import type { SheetItem } from "@/lib/types";

/**
 * GAS 응답 한 건을 SheetItem 으로 맞춥니다.
 * 구버전(owner만 있는) 응답도 author 로 흡수합니다.
 */
export function normalizeGasSheetItem(raw: unknown): SheetItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string" || typeof r.url !== "string") {
    return null;
  }

  const ownerLegacy = typeof r.owner === "string" ? r.owner : "";
  const authorDirect = typeof r.author === "string" ? r.author.trim() : "";
  const authorEmail =
    typeof r.authorEmail === "string" && r.authorEmail
      ? r.authorEmail
      : ownerLegacy.includes("@")
        ? ownerLegacy
        : undefined;

  let author = authorDirect;
  if (!author && ownerLegacy) {
    author = ownerLegacy.includes("@")
      ? ownerLegacy.split("@")[0]
      : ownerLegacy.trim();
  }

  const description =
    typeof r.description === "string" ? r.description : undefined;

  return {
    id: r.id,
    name: r.name,
    url: r.url,
    author,
    authorEmail,
    description,
    lastUpdated: typeof r.lastUpdated === "string" ? r.lastUpdated : "",
    createdTime:
      typeof r.createdTime === "string" ? r.createdTime : undefined,
  };
}
