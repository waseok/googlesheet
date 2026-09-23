/**
 * 실제 forms.gle 로 제목 추출이 되는지 검증합니다.
 * 사용: node scripts/verify-form-title.mjs
 */
import { createRequire } from "module";
import { pathToFileURL } from "url";
import path from "path";
import { register } from "node:module";
import { MessageChannel } from "node:worker_threads";

const FORM_URL = process.argv[2] || "https://forms.gle/QvQNK2RtrJUHVd2H7";
const EXPECTED_SNIPPET = process.argv[3] || "꿀팁공모전";

/** src/lib/fetch-form-title.ts 와 동일한 핵심 파서(런타임 교차 검증용) */
function parseFormTitleFromHtml(html) {
  const marker = "FB_PUBLIC_LOAD_DATA_";
  const idx = html.indexOf(marker);
  if (idx < 0) {
    const og =
      html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    return (og && og[1] && og[1].trim()) || "";
  }
  const bracket = html.indexOf("[", idx);
  const scriptEnd = html.indexOf("</script>", bracket);
  let chunk = html.slice(bracket, scriptEnd).replace(/;\s*$/, "").trim();
  const last = chunk.lastIndexOf("]");
  chunk = chunk.slice(0, last + 1);
  const data = JSON.parse(chunk);
  const title = data?.[1]?.[8];
  return typeof title === "string" ? title.trim() : "";
}

async function main() {
  const t0 = Date.now();
  console.log("Fetching", FORM_URL);
  const resp = await fetch(FORM_URL, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  console.log("HTTP", resp.status, "final", resp.url, `${Date.now() - t0}ms`);
  if (!resp.ok) {
    console.error("FAIL: HTTP", resp.status);
    process.exit(1);
  }
  const html = await resp.text();
  const title = parseFormTitleFromHtml(html);
  console.log("TITLE:", title);

  if (!title || !title.includes(EXPECTED_SNIPPET)) {
    console.error(
      `FAIL: expected title to include "${EXPECTED_SNIPPET}", got "${title}"`
    );
    process.exit(1);
  }

  // 소스에 핵심 경로가 남아 있는지 확인
  const require = createRequire(import.meta.url);
  const fs = require("fs");
  const src = fs.readFileSync(
    path.resolve("src/lib/fetch-form-title.ts"),
    "utf8"
  );
  if (!src.includes("FB_PUBLIC_LOAD_DATA_") || !src.includes("row[8]")) {
    console.error("FAIL: src/lib/fetch-form-title.ts missing expected parser");
    process.exit(1);
  }
  if (!src.includes("fetchGoogleFormTitle")) {
    console.error("FAIL: fetchGoogleFormTitle export missing");
    process.exit(1);
  }

  const route = fs.readFileSync(
    path.resolve("src/app/api/sheets/register/route.ts"),
    "utf8"
  );
  if (!route.includes("fetchGoogleFormTitle") || !route.includes("name:")) {
    console.error("FAIL: register route does not pass fetched name to GAS");
    process.exit(1);
  }

  console.log("PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
