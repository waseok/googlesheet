/**
 * 공개 Google Forms / forms.gle 페이지에서 설문 제목을 추출합니다.
 * (GAS UrlFetchApp 대신 Next.js 서버에서 호출 — 배포·테스트가 쉽고 안정적)
 */

function cleanFetchedFormTitle(raw: string): string {
  let t = String(raw || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(/\s*[-–|]\s*Google\s*Forms?\s*$/i, "").trim();
  t = t.replace(/\s*[-–|]\s*Google\s*설문지?\s*$/i, "").trim();
  if (
    !t ||
    /^google\s*forms?$/i.test(t) ||
    t === "설문지" ||
    t === "Google Forms"
  ) {
    return "";
  }
  return t.length > 120 ? t.slice(0, 120) : t;
}

function extractFbPublicLoadData(html: string): unknown[] | null {
  const marker = "FB_PUBLIC_LOAD_DATA_";
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const bracket = html.indexOf("[", idx);
  if (bracket < 0) return null;
  let scriptEnd = html.indexOf("</script>", bracket);
  if (scriptEnd < 0) scriptEnd = Math.min(bracket + 500_000, html.length);
  let chunk = html.slice(bracket, scriptEnd).replace(/;\s*$/, "").trim();
  const lastBracket = chunk.lastIndexOf("]");
  if (lastBracket > 0) chunk = chunk.slice(0, lastBracket + 1);
  try {
    const data = JSON.parse(chunk);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function guessFormTitleFromFbData(data: unknown[]): string {
  const row = data[1];
  if (!Array.isArray(row)) return "";

  // 표준 위치: data[1][8] = title
  if (typeof row[8] === "string" && row[8].trim()) {
    const t8 = cleanFetchedFormTitle(row[8]);
    if (t8) return t8;
  }

  // 루트 근처 문자열 (구버전/변형)
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const cell = data[i];
    if (typeof cell === "string") {
      const rt = cleanFetchedFormTitle(cell);
      if (rt && rt.length >= 2 && !rt.startsWith("/forms")) return rt;
    }
  }

  return "";
}

/** HTML 문자열에서 제목만 뽑습니다(단위 테스트·스크립트용). */
export function parseFormTitleFromHtml(html: string): string {
  const data = extractFbPublicLoadData(html);
  if (data) {
    const guessed = guessFormTitleFromFbData(data);
    if (guessed) return guessed;
  }

  const freebird = html.match(
    /freebirdFormviewerViewHeaderTitle[^>]*>([^<]+)</i
  );
  if (freebird?.[1]) {
    const t = cleanFetchedFormTitle(freebird[1]);
    if (t) return t;
  }

  const item =
    html.match(/itemprop=["']name["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["'][^>]*itemprop=["']name["']/i);
  if (item?.[1]) {
    const t = cleanFetchedFormTitle(item[1]);
    if (t) return t;
  }

  const og =
    html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (og?.[1]) {
    const t = cleanFetchedFormTitle(og[1]);
    if (t) return t;
  }

  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (title?.[1]) return cleanFetchedFormTitle(title[1]);

  return "";
}

export function looksLikeGoogleFormShareUrl(raw: string): boolean {
  const text = raw.trim();
  return (
    /forms\.gle\//i.test(text) ||
    /docs\.google\.com\/forms\//i.test(text) ||
    /forms\.google\.com\//i.test(text)
  );
}

/**
 * forms.gle / viewform URL을 fetch 해서 설문 제목을 반환합니다.
 * 실패 시 빈 문자열.
 */
export async function fetchGoogleFormTitle(pageUrl: string): Promise<string> {
  const url = pageUrl.trim();
  if (!url) return "";

  try {
    const resp = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!resp.ok) return "";
    const html = await resp.text();
    return parseFormTitleFromHtml(html);
  } catch {
    return "";
  }
}
