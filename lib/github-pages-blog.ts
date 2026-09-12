/**
 * GitHub Pages(Jekyll) 위성 블로그 발행 — Blogger/워드프레스닷컴과 같은 목적.
 * _posts/YYYY-MM-DD-slug.md 파일을 커밋하면 GitHub Pages가 자동 빌드해서 반영.
 */
import { getSetting } from '@/lib/get-setting';

function htmlToPlainText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return base || 'post';
}

export interface GithubPagesPublishParams {
  title: string;
  content: string;
  articleUrl?: string;
}

/** GitHub Pages 블로그에 요약+링크 형태로 마크다운 글 발행 */
export async function publishToGithubPages(
  params: GithubPagesPublishParams,
): Promise<{ url: string | null }> {
  const { title, content, articleUrl } = params;

  const token = await getSetting('GITHUB_PAGES_TOKEN');
  const repo = await getSetting('GITHUB_PAGES_REPO');
  const pagesUrl = await getSetting('GITHUB_PAGES_URL');
  if (!token || !repo) throw new Error('GitHub Pages 연결 필요 (토큰/저장소 미설정)');

  const stripped = htmlToPlainText(content);
  const excerpt = stripped.slice(0, 800) + (stripped.length > 800 ? '...' : '');
  const linkLine = articleUrl ? `\n\n▶ [전체 내용 보기](${articleUrl})` : '';

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const slug = slugify(title);
  const path = `_posts/${dateStr}-${slug}-${now.getTime()}.md`;

  const escapedTitle = title.replace(/"/g, '\\"');
  const body = `---
layout: post
title: "${escapedTitle}"
date: ${dateStr} ${now.toTimeString().slice(0, 8)} +0900
---

${excerpt}${linkLine}
`;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `post: ${title}`.slice(0, 200),
      content: Buffer.from(body, 'utf-8').toString('base64'),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub Pages 발행 실패: HTTP ${res.status} | ${errText.slice(0, 200)}`);
  }

  const postUrl = pagesUrl ? `${pagesUrl.replace(/\/$/, '')}/${dateStr.replace(/-/g, '/')}/${slug}-${now.getTime()}.html` : null;
  return { url: postUrl };
}
