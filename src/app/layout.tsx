import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** OG/아이콘 절대 URL 생성용. 커스텀 도메인이면 Vercel에 NEXT_PUBLIC_SITE_URL 설정 권장. */
function defaultMetadataBase(): URL {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    return new URL(site.endsWith("/") ? site.slice(0, -1) : site);
  }
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`);
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: defaultMetadataBase(),
  title: "와석초등학교 시트 허브",
  description:
    "와석초등학교 업무용 구글 시트를 한곳에서 찾고, 완료 시 지정 폴더로 이동합니다.",
  // app/icon.svg 가 자동 연결됨. SVG 미지원·/favicon.ico 고정 요청 대비로 병기
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
