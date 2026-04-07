import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
        {/* 채널톡 */}
        <Script id="channel-talk" strategy="afterInteractive">{`
          (function(){var w=window;if(w.ChannelIO){return w.console.error("ChannelIO script included twice.");}var ch=function(){ch.c(arguments);};ch.q=[];ch.c=function(args){ch.q.push(args);};w.ChannelIO=ch;function l(){if(w.ChannelIOInitialized){return;}w.ChannelIOInitialized=true;var s=document.createElement("script");s.type="text/javascript";s.async=true;s.src="https://cdn.channel.io/plugin/ch-plugin-web.js";var x=document.getElementsByTagName("script")[0];if(x.parentNode){x.parentNode.insertBefore(s,x);}}if(document.readyState==="complete"){l();}else{w.addEventListener("DOMContentLoaded",l);w.addEventListener("load",l);}})();
          ChannelIO('boot', {
            pluginKey: '${process.env.NEXT_PUBLIC_CHANNEL_TALK_KEY || "YOUR_PLUGIN_KEY"}',
          });
        `}</Script>
      </body>
    </html>
  );
}
