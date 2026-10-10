import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const url = request.nextUrl;

  // ── 서브도메인 감지: *.loov.co.kr 또는 *.localhost ──
  // 예: company.loov.co.kr → slug = 'company'
  // 예: company.localhost:3000 → slug = 'company' (로컬 개발용)
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'loov.co.kr';
  const serviceDomain = process.env.NEXT_PUBLIC_SERVICE_DOMAIN || 'service.loov.co.kr';

  // service.loov.co.kr 특수 처리
  const isServiceDomain =
    hostname === serviceDomain ||
    hostname === `${serviceDomain}:3000` ||
    (process.env.NODE_ENV !== 'production' && hostname === 'service.localhost:3000');

  if (isServiceDomain) {
    // /api, /_next, /favicon 등은 그대로 통과
    if (
      url.pathname.startsWith('/api') ||
      url.pathname.startsWith('/_next') ||
      url.pathname.startsWith('/favicon')
    ) {
      const response = NextResponse.next();
      response.headers.set('x-is-service', '1');
      return response;
    }

    // 루트 경로 → /service-home으로 rewrite
    if (url.pathname === '/') {
      const rewriteUrl = new URL('/service-home', url.origin);
      const response = NextResponse.rewrite(rewriteUrl);
      response.headers.set('x-is-service', '1');
      return response;
    }

    // 나머지 경로는 그대로 통과 (service 도메인임을 헤더로 표시)
    const response = NextResponse.next();
    response.headers.set('x-is-service', '1');
    return response;
  }

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
