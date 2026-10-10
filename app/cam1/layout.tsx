import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: '',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function Cam1Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
