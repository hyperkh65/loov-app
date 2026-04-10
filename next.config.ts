import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  serverExternalPackages: ['canvas', 'ssh2'],
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
    ],
  },
};

export default nextConfig;
