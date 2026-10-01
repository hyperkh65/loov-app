/**
 * 발행 직전 게이트: 보이지 않는 문자 제거 + 깨지거나 잘린 HTML 차단
 */

// 제로폭·방향제어·유니코드 태그 문자(LLM 워터마크에 쓰이는 U+E0000대)·한글 채움문자 등
const INVISIBLE_RE = /[​-‏‪-‮⁠-⁤⁦-⁩­͏᠎﻿ᅟᅠㅤﾠ-]|[\u{E0000}-\u{E007F}]/gu;
// 모양만 공백인 특수 공백 → 일반 공백
const ODD_SPACE_RE = /[  -   　]/g;

export function sanitizeInvisible(s: string): string {
  return s.replace(INVISIBLE_RE, '').replace(ODD_SPACE_RE, ' ');
}

const PAIRED_TAGS = ['p', 'h2', 'h3', 'h4', 'div', 'ul', 'ol', 'li', 'figure', 'figcaption', 'b', 'i', 'strong', 'em', 'span', 'a', 'table', 'tr', 'td', 'th'];

/** 문제가 있으면 사유 문자열, 정상이면 null */
export function findHtmlProblem(title: string, html: string): string | null {
  if (!title || title.trim().length < 5) return '제목 없음/너무 짧음';
  if (!html) return '본문 없음';

  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 300) return `본문이 너무 짧음(${text.length}자)`;

  // 끝이 태그 조각 중간에서 끊김
  if (/<[a-zA-Z/][^>]*$/.test(html.trimEnd())) return '본문 끝이 태그 중간에서 잘림';

  // 태그 안 따옴표 홀수 = 속성이 잘림
  for (const m of html.matchAll(/<[a-zA-Z][^>]*>/g)) {
    if (((m[0].match(/"/g) || []).length) % 2 !== 0) return `속성이 잘린 태그: ${m[0].slice(0, 60)}`;
  }

  // 여닫는 태그 개수 불일치
  for (const t of PAIRED_TAGS) {
    const open = (html.match(new RegExp(`<${t}[\\s>]`, 'gi')) || []).length;
    const close = (html.match(new RegExp(`</${t}>`, 'gi')) || []).length;
    if (open !== close) return `<${t}> 여닫기 불일치(열림 ${open}/닫힘 ${close})`;
  }

  // 태그 문법이 본문 글자로 새어 나옴 (잘린 HTML이 이스케이프돼 노출되는 경우 포함)
  if (/style\s*=|data-ke-size|background\s*:|linear-gradient|&lt;\/?[a-z]/i.test(text)) return '본문에 태그/스타일 코드가 글자로 노출됨';

  // 프롬프트 자리표시자·마커 누출
  if (/===[A-Z0-9]+===|\(단락\d|\(키워드 포함|\(메타 설명|\[뉴스\d\]|\[블로그\d\]/.test(text)) return '프롬프트 지시문/마커가 본문에 남음';

  // 문장 중간(쉼표·콜론·여는 괄호)에서 끝남
  if (/[,:;(]$/.test(text)) return `본문이 문장 중간에서 끊김: ${text.slice(-30)}`;

  return null;
}

export function assertPublishableHtml(title: string, html: string): void {
  const problem = findHtmlProblem(title, html);
  if (problem) throw new Error(`발행 차단(불완전 HTML): ${problem}`);
}
