/**
 * Tech Hub 배포 레지스트리 — 계정을 추가/조정할 땐 이 배열만 고치면 한 번의 실행으로 전부 배포된다.
 * 캡션은 계정마다 persona/rules로 따로 생성.
 */
export interface TechProfile {
  id: string;
  enabled: boolean;
  /** 이 프로필이 다루는 주제(소스 판정·캡션에 사용) */
  topics: string;
  brand: string;
  handle: string;
  persona: string;
  instagram?: string; // sns_connections.platform_user_id
  threads?: string;
  /** 본문 링크 대신 댓글로 블로그 링크를 단다 */
  linkComment: boolean;
}

export const TECHHUB_PROFILES: TechProfile[] = [
  {
    id: 'whasubun',
    enabled: true,
    topics: '과학·기술·AI·전자제품(순수 테크)',
    brand: 'WHASUBUN',
    handle: '@whasubun.kr',
    persona: '쉽게 풀어주는 테크 친구. 어려운 기술을 "그래서 내 일상에 뭐가 달라지는데?"로 번역한다. 과장·낚시 없이 놀라움은 구체적인 숫자와 장면으로.',
    instagram: '27475655598789002',
    threads: '25873039292318366',
    linkComment: true,
  },
  // 계정 추가 예: { id:'xxx', enabled:true, topics:'...', brand:'...', handle:'@...', persona:'...', instagram:'...', threads:'...', linkComment:true },
];

export interface BlogTarget {
  blogger?: { url: string; blogId?: string };
  naver?: { categoryNo: number };
}

/** 블로그 배포처 — 화수분(블로그스팟) + 네이버 */
export const TECHHUB_BLOGS: BlogTarget = {
  blogger: { url: 'https://whasubun.blogspot.com' },
  naver: { categoryNo: 18 },
};
