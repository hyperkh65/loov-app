import type { Viewport } from 'next';

// 카메라 페이지: 브라우저 핀치줌/더블탭줌 비활성화 (앱 내부에서 직접 처리)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function CameraLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
