import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

interface BlogCheckResult {
  blogId: string;
  blogUrl: string;
  status: 'healthy' | 'warning' | 'restricted' | 'unknown';
  statusLabel: string;
  indexedCount?: number;
  recentPosts?: number;
  lastPostDate?: string;
  restrictions: string[];
  warnings: string[];
  score: number; // 0-100
  details: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const blogUrl = searchParams.get('url') || '';

  if (!blogUrl) return NextResponse.json({ error: '블로그 URL을 입력하세요' }, { status: 400 });

  const naverClientId = await getSetting('NAVER_CLIENT_ID');
  const naverClientSecret = await getSetting('NAVER_CLIENT_SECRET');

  // Extract blog ID from URL
  let blogId = '';
  const blogMatch = blogUrl.match(/blog\.naver\.com\/([^/?#]+)/);
  if (blogMatch) {
    blogId = blogMatch[1];
  } else if (!blogUrl.includes('http')) {
    blogId = blogUrl.trim();
  }

  if (!blogId) {
    return NextResponse.json({ error: '올바른 네이버 블로그 URL 또는 아이디를 입력하세요' }, { status: 400 });
  }

  const result: BlogCheckResult = {
    blogId,
    blogUrl: `https://blog.naver.com/${blogId}`,
    status: 'unknown',
    statusLabel: '확인 중',
    restrictions: [],
    warnings: [],
    score: 50,
    details: '',
  };

  try {
    // 1. Check if blog is accessible
    const blogPageRes = await fetch(`https://blog.naver.com/${blogId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });

    if (!blogPageRes.ok) {
      result.status = 'restricted';
      result.statusLabel = '접근 불가';
      result.restrictions.push(`HTTP ${blogPageRes.status}: 블로그에 접근할 수 없습니다`);
      result.score = 0;
      return NextResponse.json(result);
    }

    const html = await blogPageRes.text();

    // 2. Check for restriction signals in HTML
    if (html.includes('이용이 제한된 블로그') || html.includes('블로그 이용 제한')) {
      result.restrictions.push('⛔ 블로그 이용 제한 (저품질 또는 스팸 판정)');
      result.status = 'restricted';
      result.score = 0;
    }

    if (html.includes('로봇이 아님을 인증') || html.includes('captcha')) {
      result.warnings.push('⚠️ 봇 차단 감지됨');
    }

    if (html.includes('비공개') || html.includes('private')) {
      result.warnings.push('🔒 비공개 블로그');
    }

    // 3. Check Naver search indexing
    if (naverClientId && naverClientSecret) {
      try {
        const searchRes = await fetch(
          `https://openapi.naver.com/v1/search/blog?query=site:blog.naver.com/${blogId}&display=1&sort=date`,
          {
            headers: {
              'X-Naver-Client-Id': naverClientId,
              'X-Naver-Client-Secret': naverClientSecret,
            },
          }
        );
        const searchData = await searchRes.json() as {
          total?: number;
          items?: Array<{ title: string; description: string; postdate: string; link: string }>;
        };

        result.indexedCount = searchData.total || 0;

        if (result.indexedCount === 0) {
          result.warnings.push('⚠️ 네이버 검색 미노출 (저품질 의심)');
          result.score = Math.max(result.score - 30, 0);
        } else if (result.indexedCount < 10) {
          result.warnings.push(`📊 검색 노출 ${result.indexedCount}건 (적은 편)`);
        }

        if (searchData.items?.length) {
          const latest = searchData.items[0];
          result.lastPostDate = latest.postdate;
          result.recentPosts = searchData.items.length;

          // Check post date recency
          if (latest.postdate) {
            const postDate = new Date(latest.postdate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
            const daysSince = (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince > 90) {
              result.warnings.push(`📅 최근 발행일: ${Math.round(daysSince)}일 전 (비활성 의심)`);
            }
          }
        }
      } catch { /* ignore */ }
    }

    // 4. Determine final status
    if (result.restrictions.length > 0) {
      result.status = 'restricted';
      result.statusLabel = '⛔ 제한됨';
      result.score = 10;
    } else if (result.warnings.length >= 2) {
      result.status = 'warning';
      result.statusLabel = '⚠️ 주의 필요';
      result.score = 40;
    } else if (result.warnings.length === 1) {
      result.status = 'warning';
      result.statusLabel = '⚠️ 경고';
      result.score = 60;
    } else {
      result.status = 'healthy';
      result.statusLabel = '✅ 정상';
      result.score = 85 + Math.min((result.indexedCount || 0) / 100, 15);
    }

    result.details = result.restrictions.length === 0 && result.warnings.length === 0
      ? `${blogId} 블로그는 정상적으로 운영 중입니다. 검색 노출 ${result.indexedCount || 0}건`
      : `${result.restrictions.concat(result.warnings).join(' / ')}`;

  } catch (e) {
    result.status = 'unknown';
    result.statusLabel = '확인 불가';
    result.details = `오류: ${String(e)}`;
    result.score = 0;
  }

  return NextResponse.json(result);
}
