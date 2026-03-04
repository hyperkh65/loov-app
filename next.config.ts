import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // pdf-parse(pdfjs-dist)는 DOMMatrix 등 브라우저 API 참조 → 번들링 제외
  serverExternalPackages: ['pdf-parse', 'canvas'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdnjs.cloudflare.com',
        pathname: '/ajax/libs/twemoji/**',
      },
    ],
  },
};

export default nextConfig;
