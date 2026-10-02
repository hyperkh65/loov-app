/**
 * 네이버 카페 발행 공용 로직. app/api/naver-cafe/publish(세션 사용자용 HTTP 엔드포인트)와
 * lib/rewrite-publish.ts(자동화 파이프라인, admin 클라이언트 + 고정 userId)가 공유한다.
 */
import { withUtm } from '@/lib/utm';
import { createAdminClient } from '@/lib/supabase-server';

type AdminClient = ReturnType<typeof createAdminClient>;

async function refreshNaverToken(token: string): Promise<{ access_token: string; expires_in: number; refresh_token?: string } | null> {
  try {
    const res = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.NAVER_CLIENT_ID!,
        client_secret: process.env.NAVER_CLIENT_SECRET!,
        refresh_token: token,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token?: string; expires_in?: number; refresh_token?: string };
    return data.access_token ? {
      access_token: data.access_token,
      expires_in: data.expires_in || 3600,
      refresh_token: data.refresh_token,
    } : null;
  } catch {
    return null;
  }
}

function htmlToPlainText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
    .replace(/<h[1-3][^>]*>/gi, '\n').replace(/<\/h[1-3]>/gi, '\n')
    .replace(/<li>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
}

export interface NaverCafePublishParams {
  userId: string;
  title: string;
  content: string; // HTML 또는 평문 — 내부에서 평문으로 변환
  menuId?: string | number;
  openYn?: 'Y' | 'N';
  blogUrl?: string; // 있으면 "원문 보기" 링크로 덧붙임
  hook?: string; // SNS 스타일 짧은 요약 한두 줄 — 있으면 본문 발췌 대신 이걸 먼저 보여줌
}

export async function publishToNaverCafe(
  admin: AdminClient,
  params: NaverCafePublishParams,
): Promise<{ articleUrl: string | null; extra: { cafe: string; articleUrl?: string; error?: string }[] }> {
  const { userId, title, content, blogUrl, hook, openYn = 'Y' } = params;

  const { data: conn } = await admin.from('naver_cafe_connections')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (!conn) throw new Error('네이버 카페 연결 필요');
  if (!conn.club_id) throw new Error('카페 ID 미설정');

  let accessToken: string = conn.access_token;
  const needsRefresh = !conn.token_expires_at || new Date(conn.token_expires_at) < new Date(Date.now() + 60_000);
  if (needsRefresh) {
    if (!conn.refresh_token) throw new Error('네이버 카페 재연결 필요 (refresh token 없음)');
    const refreshed = await refreshNaverToken(conn.refresh_token);
    if (!refreshed) throw new Error('네이버 카페 토큰 갱신 실패 — 설정에서 재연결해주세요.');
    accessToken = refreshed.access_token;
    const payload: Record<string, string> = {
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (refreshed.refresh_token) payload.refresh_token = refreshed.refresh_token;
    await admin.from('naver_cafe_connections').update(payload).eq('user_id', userId);
  }

  const targetMenuId = params.menuId || (conn.menu_list as { menuId: number }[] | null)?.[0]?.menuId;
  if (!targetMenuId) throw new Error('게시판을 선택하거나 설정에서 게시판을 추가하세요');

  // 본문 앞부분 400자를 그대로 발췌해서 붙이면 "▶ 원문 보기" 링크까지 한 문단으로
  // 이어져 가독성이 떨어진다는 사용자 피드백 — hook(SNS 스타일 짧은 요약)이 있으면
  // 발췌 대신 그걸 먼저 보여주고, 링크는 줄바꿈으로 분리해 다음 줄에 넣음.
  // "▶ 원문 보기:" 같은 딱딱한 라벨보다 자연스러운 유도 문구가 클릭을 더
  // 이끌어낸다는 게 확인된 사실이라(쿠팡/무신사 캡션과 동일한 원칙) 문구를 바꿈.
  const textFor = (cafeTag: string) => {
    const linkLine = blogUrl ? `👉 전체 내용은 여기서 확인하세요\n${withUtm(blogUrl, `cafe_${cafeTag}`)}` : '';
    if (hook?.trim()) return [hook.trim(), linkLine].filter(Boolean).join('\n\n');
    const stripped = htmlToPlainText(content);
    const excerpt = stripped.slice(0, 400) + (stripped.length > 400 ? '...' : '');
    return [excerpt, linkLine].filter(Boolean).join('\n\n');
  };

  const menuList = conn.menu_list as { menuId: number; menuName: string }[] | null;
  const primary = await postToCafe(admin, {
    userId, accessToken, clubId: conn.club_id, cafeSlug: conn.cafe_url || conn.club_id,
    menuId: targetMenuId, menuName: menuList?.find(m => String(m.menuId) === String(targetMenuId))?.menuName,
    title, textContent: textFor(conn.cafe_url || conn.club_id), openYn,
  });

  // 같은 네이버 계정의 추가 카페들 — 기본 카페가 성공한 뒤 같은 토큰으로 순서대로 발행. 하나가 실패해도 나머지는 계속.
  const extras = (conn.extra_cafes as ExtraCafe[] | null) || [];
  const extraResults: { cafe: string; articleUrl?: string; error?: string }[] = [];
  for (const c of extras) {
    if (!c.club_id || !c.menu_id) continue;
    try {
      const r = await postToCafe(admin, {
        userId, accessToken, clubId: c.club_id, cafeSlug: c.cafe_url || c.club_id,
        menuId: c.menu_id, menuName: c.menu_name, title, textContent: textFor(c.cafe_url || c.club_id), openYn,
      });
      extraResults.push({ cafe: c.cafe_name || c.club_id, articleUrl: r ?? undefined });
    } catch (e) {
      extraResults.push({ cafe: c.cafe_name || c.club_id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { articleUrl: primary, extra: extraResults };
}

export interface ExtraCafe {
  club_id: string;
  cafe_name?: string;
  cafe_url?: string;
  menu_id: string | number;
  menu_name?: string;
}

async function postToCafe(admin: AdminClient, p: {
  userId: string; accessToken: string; clubId: string; cafeSlug: string;
  menuId: string | number; menuName?: string; title: string; textContent: string; openYn: 'Y' | 'N';
}): Promise<string | null> {
  const apiUrl = `https://openapi.naver.com/v1/cafe/${p.clubId}/menu/${p.menuId}/articles`;

  // 네이버 카페 글쓰기 API는 multipart(FormData)로 보내면 한글이 깨짐(실사용 중 확인:
  // 자동발행 글만 깨지고 수동 발행은 멀쩡했음) — 커뮤니티에서 확인된 이 엔드포인트 특유의
  // 해결법대로 x-www-form-urlencoded + 값을 한 번 더 encodeURIComponent(이중 인코딩)해야
  // 정상 표시됨. URLSearchParams가 직렬화하면서 인코딩을 한 번 더 걸어줌.
  const body = new URLSearchParams({
    subject: encodeURIComponent(p.title),
    content: encodeURIComponent(p.textContent),
    openYn: p.openYn,
  });

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${p.accessToken}` },
    body,
    signal: AbortSignal.timeout(20_000),
  });

  const rawText = await res.text();
  let resData: {
    message?: {
      result?: { articleId?: number; code?: string; message?: string };
      error?: { code?: string; msg?: string };
    };
    errorCode?: string; errorMessage?: string;
  } = {};
  try { resData = JSON.parse(rawText); } catch { /* non-JSON error body */ }

  // 네이버가 실제로는 HTTP 200 + message.error.{code,msg} 형태로 인증 실패를
  // 내려보내는 걸 실사용 중 확인 — 알려진 에러 모양을 전부 확인.
  const errCode = resData.errorCode || resData.message?.result?.code || resData.message?.error?.code;
  const errDetail = resData.errorMessage || resData.message?.result?.message || resData.message?.error?.msg;
  const articleId = resData.message?.result?.articleId;
  if (!res.ok || errCode || !articleId) {
    throw new Error(`카페 발행 실패(${p.cafeSlug}): HTTP ${res.status}${errCode ? ` | ${errCode}` : ''}${errDetail ? ` | ${errDetail}` : ` | ${rawText.slice(0, 300)}`}`);
  }
  const articleUrl = `https://cafe.naver.com/${p.cafeSlug}/articles/${articleId}`;

  try {
    await admin.from('naver_cafe_history').insert({
      user_id: p.userId,
      club_id: p.clubId,
      article_id: String(articleId),
      article_url: articleUrl,
      title: p.title,
      menu_id: String(p.menuId),
      menu_name: p.menuName || null,
      open_yn: p.openYn,
    });
  } catch { /* 기록 실패는 무시 — 발행 자체는 이미 성공 */ }

  return articleUrl;
}
