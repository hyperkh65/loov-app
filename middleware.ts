import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/api'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 공개 경로는 통과
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // /dashboard 이하 보호
  if (pathname.startsWith('/dashboard')) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // 쿠키에서 세션 토큰 확인
    const accessToken = request.cookies.get('sb-access-token')?.value
      || request.cookies.get(`sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`)?.value;

    // 토큰이 없으면 로그인 페이지로
    if (!accessToken) {
      // 세션 쿠키가 있는지 좀 더 넓게 확인
      const hasCookie = [...request.cookies.getAll()].some(
        (c) => c.name.includes('auth-token') || c.name.startsWith('sb-')
      );
      if (!hasCookie) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
