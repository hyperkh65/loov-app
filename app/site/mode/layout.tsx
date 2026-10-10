'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', icon: '🏠', label: '홈' },
  { href: '/youtube', icon: '📥', label: 'YouTube 다운로드' },
  { href: '/english', icon: '🇺🇸', label: '영어 공부' },
  { href: '/market', icon: '📊', label: '시장 조사' },
];

export default function ModeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top Nav */}
      <header className="border-b border-gray-800 bg-gray-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-lg text-purple-400">mode</span>
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    pathname === item.href
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
          <a
            href="https://loov.co.kr/dashboard/mode-settings"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ⚙️ 설정
          </a>
        </div>
        {/* Mobile Nav */}
        <nav className="md:hidden flex border-t border-gray-800 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 text-xs whitespace-nowrap transition-colors ${
                pathname === item.href
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-500'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </header>

      <main className={pathname.startsWith('/youtube') ? '' : 'max-w-7xl mx-auto px-4 py-6'}>
        {children}
      </main>
    </div>
  );
}
