import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // pdfjs-dist(unpdf 내부)는 canvas 등 브라우저 API 참조 → 번들링 제외
  serverExternalPackages: ['canvas'],
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
