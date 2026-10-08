/**
 * 발행 직전 게이트: 보이지 않는 문자 제거 + 깨지거나 잘린 HTML 차단
 */

// 제로폭·방향제어·유니코드 태그 문자(LLM 워터마크에 쓰이는 U+E0000대)·한글 채움문자 등
const INVISIBLE_RE = /[​-‏‪-‮⁠-⁤⁦-⁩­͏᠎﻿ᅟᅠㅤﾠ-]|[\u{E0000}-\u{E007F}]/gu;
// 모양만 공백인 특수 공백 → 일반 공백
const ODD_SPACE_RE = /[  -   　]/g;

export function sanitizeInvisible(s: string): string {
  // 섹션 구분자(===FAQ=== 등) 파싱 잔여물로 '=' 한 글자만 든 문단이 생기던 버그 방어
  return s.replace(INVISIBLE_RE, '').replace(ODD_SPACE_RE, ' ').replace(/<p[^>]*>\s*=+\s*<\/p>\n?/g, '')
    // 프롬프트의 '핵심:' 라벨이 문단 머리에 그대로 노출되는 것 방지
    .replace(/(<p[^>]*>)\s*(?:<(?:b|strong)>)?\s*핵심\s*[:：]\s*(?:<\/(?:b|strong)>)?\s*/g, '$1')
    // 문장 중간(같은 줄)에 붙은 '핵심:' 라벨 제거 — 줄 머리는 위 규칙/박스 파서가 처리
    .replace(/([.!?]["')\]]?[ \t]+)(?:<(?:b|strong)>)?핵심\s*[:：]\s*(?:<\/(?:b|strong)>)?[ \t]*/g, '$1');
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
  const leak = text.match(/===[A-Z0-9]+===|\(단락\d|\(키워드 포함|\(메타 설명|\[뉴스\d\]|\[블로그\d\]|\b(?:short|long) sentence\s*:/i);
  if (leak) return `프롬프트 지시문/마커가 본문에 남음: ${text.slice(Math.max(0, leak.index! - 20), leak.index! + 40)}`;

  // 모델 반복 루프: 같은 단어/구절이 연달아 반복되거나 줄 끝에 구분자 '='만 남은 경우
  const loop = text.match(/([가-힣A-Za-z0-9]\S+)(?:\s+\1){4,}/) || text.match(/((?:\S+\s+){1,5}\S+)(?:\s+\1){3,}/) || text.match(/([가-힣A-Za-z0-9]{2,10}?)\1{5,}/);
  if (loop) return `같은 표현이 반복됨: ${loop[0].slice(0, 30)}`;
  if (/(^|>)\s*=+\s*(<|$)/.test(html)) return '본문에 구분자(=)가 남음';

  // 문장 중간(쉼표·콜론·여는 괄호)에서 끝남
  if (/[,:;(]$/.test(text)) return `본문이 문장 중간에서 끊김: ${text.slice(-30)}`;

  return null;
}

export function assertPublishableHtml(title: string, html: string): void {
  const problem = findHtmlProblem(title, html);
  if (problem) throw new Error(`발행 차단(불완전 HTML): ${problem}`);
}

// 한국어 본문에 새어 들어온 외국어(영·스페인·프랑스·튀르키예어 등) 단어 감지.
// 브랜드·약어는 대문자/혼합 표기(eSIM, LAFC)라 걸리지 않고, 전부 소문자인 4자 이상 단어만 본다.
const FOREIGN_ALLOW = new Set('wifi apps mail blog html http https www nbsp amp kakao naver google apple youtube tistory instagram threads iphone chatgpt claude email tips live news nasa covid json code data cloud server token app'.split(' '));

export function findForeignWords(html: string): string[] {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]*>/g, ' ').replace(/\S*\.(com|kr|net|org|co|io)\S*/g, ' ');
  return [...new Set((text.match(/\b[a-z]{4,}\b/g) || []).filter(w => !FOREIGN_ALLOW.has(w)))];
}

// 제목은 프롬프트로 20~32자 유도, 여기선 비정상적으로 긴 경우(50자 초과)만 안전망으로 정리 — 조금 넘는 건 자르지 않음
// 잘린 끝이 "및"·"그리고"·쉼표처럼 뜻 없이 매달리지 않게 정리
export function tightTitle(title: string, max = 50): string {
  const t = title.replace(/\s+/g, ' ').trim();
  if ([...t].length <= max) return t;
  const head = [...t].slice(0, max).join('');
  const cut = Math.max(head.lastIndexOf(','), head.lastIndexOf('·'), head.lastIndexOf('|'), head.lastIndexOf(' - '), head.lastIndexOf('–'), head.lastIndexOf(':'));
  let out: string;
  if (cut >= 12) out = head.slice(0, cut);
  else {
    const sp = head.lastIndexOf(' ');
    out = sp >= 12 ? head.slice(0, sp) : head;
  }
  // 잘린 지점이 단어 중간이면(원문의 다음 글자가 공백이 아님) 마지막 단어 버림
  if (out === head && t[max] && t[max] !== ' ') out = out.replace(/\s+\S*$/, '');
  return out.replace(/(\s+(및|그리고|또는|와|과|vs))+$/i, '').replace(/[\s,·|:–-]+$/, '').trim();
}
