import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const url = request.nextUrl;

  // ── 서브도메인 감지: *.loov.co.kr 또는 *.localhost ──
  // 예: company.loov.co.kr → slug = 'company'
  // 예: company.localhost:3000 → slug = 'company' (로컬 개발용)
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'loov.co.kr';
  const isSubdomain =
    hostname.endsWith(`.${mainDomain}`) ||
    (process.env.NODE_ENV !== 'production' && hostname.match(/^[^.]+\.localhost/));

  if (isSubdomain) {
    const slug = hostname.split('.')[0];

    // /api, /_next, /favicon 등은 그대로 통과
    if (
      url.pathname.startsWith('/api') ||
      url.pathname.startsWith('/_next') ||
      url.pathname.startsWith('/favicon')
    ) {
      return NextResponse.next();
    }

    // 서브도메인 → /site/[slug]로 내부 라우트 rewrite
    const rewriteUrl = new URL(`/site/${slug}${url.pathname}${url.search}`, url.origin);
    return NextResponse.rewrite(rewriteUrl);
  }

  // Auth 체크는 DashboardLayout(client-side)에서 supabase.auth.getSession()으로 처리
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
