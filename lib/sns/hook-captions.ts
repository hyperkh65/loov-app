import { generateText } from '@/lib/auto-blog-ai';
import { getSection } from '@/lib/sns/sections';
import { THREADS_HOOK_GUIDE, scrubThreads, formatHookLines, fitTwitter } from '@/lib/sns/hook-style';

const CAFE_TAG = 'CAFE';
const TAGS = ['THREADS', 'TWITTER', 'FACEBOOK', 'INSTAGRAM', CAFE_TAG, 'PINTERESTTITLE', 'PINTEREST'];

export async function buildHookCaptions(title: string, summary: string): Promise<Record<string, string>> {
  const prompt = `너는 SNS 채널별 카피를 쓰는 에디터야. 아래 글을 각 채널 문화에 맞게 따로 써줘. 목적은 사람들이 "이거 뭔데?" 하고 눌러보게 만드는 것.
반드시 한국어로만 작성하고, 중국어·일본어 등 외국 문자 절대 사용 금지. 글 제목을 그대로 베끼지 말고 새로 써.
읽는 사람이 "무슨 얘기인지"는 알 수 있어야 하고(주인공·주제·상황을 분명히), 결론·세부 조건만 남겨서 궁금하게 만들 것.
고유명사·숫자는 아래 제목·요약에 나온 그대로만 쓰고(오타·변형 금지), 없는 사실은 지어내지 마. 뜻이 안 통하는 문장, 어색한 신조어 금지.
모든 채널 공통 금지: "블로그", "링크", "확인해보세요", "자세한 내용은", "정리해둠", "전체 기사", "알아보세요" 처럼 어디서 보라고 안내하는 말. URL은 어디에도 넣지 마(내가 따로 붙임).

글 제목: ${title}
글 요약: ${summary.slice(0, 700)}

[채널별 작성 규칙]
- THREADS: 아래 [스레드 훅 작성법]을 그대로 따른다.
- TWITTER(X): 한글은 글자당 2로 계산되니 전체 100자 안팎(최대 120자). 2~3줄: ① 상황·반전 한 줄(한줄평 느낌, 위트) ② 핵심 한 덩어리 ③ 해시태그 1~2개. 이모지 0~1개. 짧고 날카롭게. 존댓말 질문 금지.
- FACEBOOK: 친근한 반말~부드러운 구어체로 2~3문단(문단 사이 빈 줄, 각 문단 1~2문장, 전체 200~300자). 사연·공감·질문으로 시작해 "나도 해당되나?" 싶게 만들고, 마지막은 독자에게 던지는 궁금증 질문 한 줄. 이모지 1~2개. 해시태그 금지.
- INSTAGRAM: 첫 줄이 피드에서 가장 먼저 보이니 가장 강한 훅(공감·숫자·반전)으로. 5~7줄 짧은 줄, 감성+위트 있는 반말, 이모지 3개 안팎. 마지막 빈 줄 뒤 해시태그 6~8개(대형 1~2 + 주제 관련 구체 태그). THREADS와 첫 줄·문장 겹치지 말 것.
- CAFE: THREADS와 같은 형식(한 줄 한 문장, 4~6줄, 해요체 허용, 이모지 0~1개). 핵심은 숨기고 마지막은 궁금증 한 줄.
- PINTERESTTITLE: 핀 제목 40~70자. 검색어(핵심 키워드)로 시작 + 얻는 것 한 구절. 낚시·감탄사 금지.
- PINTEREST: 핀 설명 200~350자, 2~3문장. 핵심 키워드를 자연스럽게 포함하고 보는 사람이 얻는 것(방법·대상·시기)을 구체적으로 쓰되 결론은 남김. 끝에 한글 해시태그 3~5개. 이모지 0~1개, "~해요" 체.
- 채널끼리 같은 문장·같은 첫 줄 재사용 금지(메타가 계정 간 동일 문구를 스팸으로 봄). 시작 각도를 다르게: THREADS=의외의 사실/질문, INSTAGRAM=독자 상황 공감, FACEBOOK=사연·질문, TWITTER=한줄평

${THREADS_HOOK_GUIDE}

반드시 아래 7개 구분자를 하나도 빠뜨리지 말고 이 순서 그대로 출력(설명/코드블록 없이). 구분자는 단독 한 줄, 각 구분자 바로 아래 줄부터 해당 채널 텍스트:
[[[THREADS]]]
[[[TWITTER]]]
[[[FACEBOOK]]]
[[[INSTAGRAM]]]
[[[CAFE]]]
[[[PINTERESTTITLE]]]
[[[PINTEREST]]]`;

  // 텀블러는 구분자를 빼먹고 카페에 섞어 쓰는 일이 잦아 별도 호출(실패해도 나머지에 영향 없음)
  const tumblrPrompt = `텀블러 링크 포스트용 글을 써줘. 한국어만 사용, 이모지·해시태그 금지. 제목·요약에 나온 고유명사·숫자만 쓰고 지어내지 마. "블로그/링크/댓글/확인해보세요" 같은 안내 문구 금지.
글 제목: ${title}
글 요약: ${summary.slice(0, 700)}
출력 형식(정확히 두 줄 이상 이 형태로):
소개: (2~3문장 150~250자. 에디터가 친구에게 "이거 봐봐" 하듯 담백하고 위트 있게. 무슨 내용인지 분명히 쓰고 결론·세부 조건은 남겨 궁금하게)
태그: (한글 주제어 5~8개 쉼표 구분, # 없이)`;
  const [raw, tumblrRaw] = await Promise.all([
    generateText(prompt, 'groq', undefined, undefined, undefined, undefined, { ollamaOnly: true }), // Groq → Gemini만
    generateText(tumblrPrompt, 'groq', undefined, undefined, undefined, undefined, { ollamaOnly: true }).catch(() => ''),
  ]);
  const tumblr = tumblrRaw.match(/소개\s*[:：]\s*([\s\S]*?)(?=\n\s*태그\s*[:：]|$)/)?.[1]?.trim() || '';
  const tumblrTags = tumblrRaw.match(/태그\s*[:：]\s*(.+)/)?.[1]?.trim() || '';
  // 모델이 금지한 "어디서 보라"는 안내 문구를 어겨도 그 줄은 걷어낸다
  const BANNED = /블로그|링크|댓글|아래(에|로)|확인해|자세한 내용|전체 (내용|기사)|정리해/;
  const sec = (t: string) => getSection(raw, t, TAGS).split('\n').filter(l => !BANNED.test(l)).join('\n').trim();
  return {
    threads: scrubThreads(sec('THREADS')),
    twitter: fitTwitter(sec('TWITTER')),
    facebook: formatHookLines(sec('FACEBOOK')),
    instagram: formatHookLines(sec('INSTAGRAM')),
    cafe: formatHookLines(sec(CAFE_TAG)),
    tumblr: /블로그|링크|댓글/.test(tumblr) ? '' : tumblr,
    tumblr_tags: tumblrTags,
    pinterest_title: sec('PINTERESTTITLE'),
    pinterest: sec('PINTEREST'),
  };
}
