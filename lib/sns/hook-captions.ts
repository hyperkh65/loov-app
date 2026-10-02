import { generateText } from '@/lib/auto-blog-ai';
import { getSection } from '@/lib/sns/sections';
import { THREADS_HOOK_GUIDE, scrubThreads } from '@/lib/sns/hook-style';

const CAFE_TAG = 'CAFE';
const CAPTION_TAGS_WITH_CAFE = ['THREADS', 'TWITTER', 'FACEBOOK', 'INSTAGRAM', CAFE_TAG];

export async function buildHookCaptions(title: string, summary: string): Promise<Record<string, string>> {
  const prompt = `너는 SNS 마케팅 전문가야. 아래 기사를 각 채널에 맞는 후킹성 멘트로 작성해줘.
반드시 한국어로만 작성하고, 중국어·일본어 등 외국 문자 절대 사용 금지. 기사 제목을 그대로 베끼지 말고 호기심을 자극하는 문장으로 새로 써.

기사 제목: ${title}
기사 요약: ${summary.slice(0, 300)}

[채널별 작성 규칙]
- THREADS: 아래 [스레드 훅 작성법]을 따른다. URL 없이 (댓글로 추가)
- TWITTER: 한 방에 꽂히는 문장 + 해시태그 2~3개. 240자 이내. URL 없이 (댓글로 추가)
- FACEBOOK: 친근하게 250자 내외. 이모지 적당히. URL 없이 (댓글로 추가)
- INSTAGRAM: 감성적, 이모지 풍부, 해시태그 8개. URL 없이 (댓글로 추가)
- CAFE: 카페 게시글 서두에 쓸 문구. 첫 문장은 호기심을 자극하는 후킹 멘트로 시작(딱딱한 요약문 금지). 이어서 2~3문장으로 자연스럽게 핵심 내용을 풀고, 마지막엔 "더 자세한 내용/전체 글은 아래에서 확인하세요" 같은 자연스러운 문장으로 블로그 이동을 유도. 200자 내외, 이모지는 1개 이하로 절제. URL 없이 (내가 따로 붙임)

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

  const raw = await generateText(prompt, 'gemini');
  return {
    threads: scrubThreads(getSection(raw, 'THREADS', CAPTION_TAGS_WITH_CAFE)),
    twitter: getSection(raw, 'TWITTER', CAPTION_TAGS_WITH_CAFE),
    facebook: getSection(raw, 'FACEBOOK', CAPTION_TAGS_WITH_CAFE),
    instagram: getSection(raw, 'INSTAGRAM', CAPTION_TAGS_WITH_CAFE),
    cafe: getSection(raw, CAFE_TAG, CAPTION_TAGS_WITH_CAFE),
  };
}
