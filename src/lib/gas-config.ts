/**
 * 서버 전용: Route Handler에서 GAS 웹앱 URL·토큰을 읽습니다.
 * 브라우저에 노출하지 마세요.
 */
export function requireGasWebAppUrl(): string {
  const url = process.env.GAS_WEB_APP_URL?.trim();
  if (!url) {
    throw new Error(
      "환경 변수 GAS_WEB_APP_URL 이 설정되지 않았습니다. Vercel 또는 .env.local 에 웹앱 exec URL 을 넣어주세요."
    );
  }
  return url;
}

export function requireGasMutationToken(): string {
  const token = process.env.GAS_MUTATION_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "환경 변수 GAS_MUTATION_TOKEN 이 없습니다. GAS 스크립트 속성 MUTATION_TOKEN 과 동일한 값을 설정하세요."
    );
  }
  return token;
}
