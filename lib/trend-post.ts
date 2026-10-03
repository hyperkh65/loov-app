/**
 * 2days.kr 트렌드 글 — 글은 로컬 Claude(Code)가 직접 조사·작성(사용자 확정 2026-10-03: 서버 AI가 쓰면 안 됨).
 * 서버는 ① 텔레그램/API 요청을 대기열에 넣고 ② 로컬이 넘긴 완성 글에 이미지를 붙여 발행·SNS만 한다.
 */
import { createAdminClient } from '@/lib/supabase-server';
import { searchInlineImages, rehostImages, insertImagesIntoContent, generateHqImage } from '@/lib/blog-content-generator';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import { sanitizeInvisible, assertPublishableHtml, tightTitle } from '@/lib/html-gate';
import { publishToWordPress, crossPostBlogToSns, TREND_CATEGORY_2DAYS } from '@/lib/scheduler/blog-runner';
import { alertOwner } from '@/lib/owner-alert';

const SITE = 'https://2days.kr';

// ponytail: 프로세스 메모리 대기열 — 컨테이너 재시작 시 대기 작업 유실(그땐 텔레그램으로 다시 /글)
type Job = { id: string; keyword?: string; at: number };
const queue: Job[] = [];
export function enqueueTrendJob(keyword?: string): Job {
  const job = { id: Date.now().toString(36), keyword: keyword?.trim() || undefined, at: Date.now() };
  queue.push(job);
  return job;
}
export function takeTrendJob(): Job | null { return queue.shift() || null; }

// thumb_image_url: 로컬 Claude가 image_prompt로 생성·직접 확인한 대표이미지 / source_images: 읽은 기사들의 관련 사진
export type TrendArticle = { title: string; html: string; outlets?: string[]; thumb_prompt?: string; thumb_image_url?: string; source_images?: string[] };

export const generateTrendImage = (prompt: string) => generateHqImage(prompt);

export async function publishTrendArticle(article: TrendArticle, keyword: string) {
  const title = tightTitle(sanitizeInvisible(article.title));
  let content = sanitizeInvisible(article.html);
  assertPublishableHtml(title, content);
  // 대표이미지: 글을 쓴 로컬 AI가 묘사한 장면(thumb_prompt)으로 생성 — 서버가 키워드로 추측하면 엉뚱해짐
  const sourceImgs = await rehostImages((article.source_images || []).slice(0, 4));
  const [{ displayUrls }, aiBg] = await Promise.all([
    sourceImgs.length >= 2 ? Promise.resolve({ displayUrls: [] as string[] }) : searchInlineImages(keyword, 3),
    article.thumb_image_url ? Promise.resolve(article.thumb_image_url) : article.thumb_prompt ? generateHqImage(article.thumb_prompt) : Promise.resolve(null),
  ]);
  const bodyImgs = sourceImgs.length >= 2 ? sourceImgs : [...sourceImgs, ...(await rehostImages(displayUrls))];
  content = insertImagesIntoContent(content, bodyImgs, keyword);
  if (article.outlets?.length) content += `\n<p style="margin-top:24px;padding:12px 14px;background:#f6f7f9;border-radius:8px;font-size:14px;color:#555;">이 글은 ${article.outlets.slice(0, 5).join('·')} 보도를 교차 확인해 공통된 사실을 중심으로 정리했습니다.</p>`;
  const imageUrl = await generateAndUploadThumbnail(title, keyword, 'blue', aiBg || bodyImgs[0], 'TREND').catch(() => null);
  const { data: site } = await createAdminClient().from('wordpress_sites').select('site_url, wp_username, app_password').eq('site_url', SITE).single();
  if (!site) throw new Error('2days.kr 연결 정보 없음');
  const wp = await publishToWordPress(site.site_url, site.wp_username, site.app_password, title, content, imageUrl, 'publish', { bypassSlot: true, categories: [TREND_CATEGORY_2DAYS] });
  if (!wp.link) throw new Error('워드프레스 발행 실패');
  crossPostBlogToSns(process.env.OWNER_USER_ID!, SITE, title, wp.link, wp.featuredImageUrl || imageUrl, content).catch(() => {});
  alertOwner(`trend:${wp.link}`, `🔥 트렌드 글 발행(Claude 작성)\n키워드: ${keyword}\n교차확인: ${(article.outlets || []).join(', ') || '-'}\n${decodeURI(wp.link)}`).catch(() => {});
  return { ok: true, keyword, title, url: wp.link };
}
