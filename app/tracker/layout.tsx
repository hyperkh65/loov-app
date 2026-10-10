import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '날씨',
  description: '날씨 앱',
};

export default function TrackerLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, padding: 0, background: '#000', overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}
