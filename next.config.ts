import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  // playwright-extra/stealth 플러그인이 standalone 빌드 트레이서에서 중첩 의존성이
  // 빠진 채로 번들링돼 프로덕션에서 "Cannot find module"로 죽던 문제 — canvas/ssh2와
  // 동일하게 external 처리해서 node_modules 전체가 그대로 복사되도록 함. 최상위
  // 패키지만 external로 지정하면 트레이서가 그 하위 체인(puppeteer-extra-plugin
  // → merge-deep → clone-deep → is-plain-object, lazy-cache)까지는 안 따라가서
  // 하나씩 실제 실행하며 확인한 전체 체인을 명시함
  serverExternalPackages: [
    'canvas', 'ssh2',
    'playwright', 'playwright-extra', 'puppeteer-extra-plugin-stealth',
    'puppeteer-extra-plugin', 'merge-deep', 'clone-deep', 'is-plain-object', 'lazy-cache',
  ],
  turbopack: {
    resolveAlias: {
      'onnxruntime-web': './lib/empty-stub.ts',
      'onnxruntime-web/webgpu': './lib/empty-stub.ts',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdnjs.cloudflare.com',
        pathname: '/ajax/libs/twemoji/**',
      },
      {
        protocol: 'https',
        hostname: 'y.yarn.co',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
