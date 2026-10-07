import { generateText } from '@/lib/auto-blog-ai';
import { getSection } from '@/lib/sns/sections';
import { THREADS_HOOK_GUIDE, scrubThreads, formatHookLines } from '@/lib/sns/hook-style';

const CAFE_TAG = 'CAFE';
const CAPTION_TAGS_WITH_CAFE = ['THREADS', 'TWITTER', 'FACEBOOK', 'INSTAGRAM', CAFE_TAG];

export async function buildHookCaptions(title: string, summary: string): Promise<Record<string, string>> {
  const prompt = `너는 SNS 마케팅 전문가야. 아래 기사를 각 채널에 맞는 후킹성 멘트로 작성해줘.
반드시 한국어로만 작성하고, 중국어·일본어 등 외국 문자 절대 사용 금지. 기사 제목을 그대로 베끼지 말고 호기심을 자극하는 문장으로 새로 써.

기사 제목: ${title}
기사 요약: ${summary.slice(0, 300)}

[채널별 작성 규칙]
- THREADS: 아래 [스레드 훅 작성법]을 따른다. URL 없이 (댓글로 추가)
- TWITTER: 아래 작성법의 첫 줄+둘째 덩어리만(3~4줄, 줄바꿈 유지) + 해시태그 2개. 240자 이내. URL 없이
- FACEBOOK: 아래 작성법 형식 그대로(줄바꿈·짧은 줄·반말). 이모지 1~2개. URL 없이
- INSTAGRAM: THREADS와 같은 형식·길이·말투(4~7줄 짧은 줄, 핵심은 숨기기, 존댓말 금지). 맨 끝 빈 줄 뒤 해시태그 6개만 추가. URL 없이
- 채널끼리 같은 문장·같은 첫 줄 재사용 금지(메타가 계정 간 동일 문구를 스팸으로 봄). 채널마다 다른 각도로 시작: THREADS=의외의 사실/질문, INSTAGRAM=독자 상황 공감, FACEBOOK=숫자·핵심 한 줄, TWITTER=속보형 한 줄
- CAFE: THREADS와 같은 형식(한 줄 한 문장, 짧은 줄, 빈 줄로 2~3덩어리, 4~6줄). 핵심 조건·방법은 숨기고 마지막 줄은 "전체 내용은 아래 링크에" 같은 짧은 한 줄. 해요체 허용, 이모지 0~1개. URL 없이 (내가 따로 붙임)

${THREADS_HOOK_GUIDE}

반드시 아래 구분자 형식으로만 출력 (설명/코드블록 없이):
[[[THREADS]]]
스레드용 텍스트
[[[TWITTER]]]
트위터용 텍스트
[[[FACEBOOK]]]
페이스북용 텍스트
[[[INSTAGRAM]]]
인스타그램용 텍스트
[[[CAFE]]]
카페용 텍스트`;

  const raw = await generateText(prompt, 'groq', undefined, undefined, undefined, undefined, { ollamaOnly: true }); // Groq → Gemini만
  return {
    threads: scrubThreads(getSection(raw, 'THREADS', CAPTION_TAGS_WITH_CAFE)),
    twitter: getSection(raw, 'TWITTER', CAPTION_TAGS_WITH_CAFE),
    facebook: formatHookLines(getSection(raw, 'FACEBOOK', CAPTION_TAGS_WITH_CAFE)),
    instagram: formatHookLines(getSection(raw, 'INSTAGRAM', CAPTION_TAGS_WITH_CAFE)),
    cafe: formatHookLines(getSection(raw, CAFE_TAG, CAPTION_TAGS_WITH_CAFE)),
  };
}
