import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LOOV — AI 직원으로 1인 벤처를 완성하다",
  description: "Leverage · Orchestrate · Own · Venture. AI 직원을 채용하고 지시를 내리세요. 영업, 회계, 마케팅, HR — 모든 부서를 AI로 운영하는 1인 기업 플랫폼.",
  keywords: ["AI 직원", "1인 기업", "AI 팀", "ERP", "마케팅 자동화", "Claude", "Gemini", "LOOV"],
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: "LOOV — AI 직원으로 1인 벤처를 완성하다",
    description: "혼자지만 팀처럼 일하세요. AI 직원이 영업, 회계, 마케팅을 대신합니다.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
