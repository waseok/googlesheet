import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* 브라우저 기본 /favicon.ico 요청을 SVG 아이콘으로 보냄 */
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/icon.svg",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
