// blog.2days.kr 여행 특집 글감 — kind별로 돌아가며 사용, 이미 쓴 주제는 사이트 검색으로 건너뜀
const WORLD = ['도쿄', '오사카', '후쿠오카', '교토', '삿포로', '방콕', '치앙마이', '다낭', '나트랑', '푸꾸옥', '호치민', '하노이', '세부', '보라카이', '발리', '싱가포르', '쿠알라룸푸르', '코타키나발루', '타이베이', '홍콩', '마카오', '괌', '사이판', '파리', '런던', '로마', '바르셀로나', '프라하', '이스탄불', '두바이'];
const KOREA = ['제주도', '부산', '강릉', '속초', '여수', '전주', '경주', '통영', '남해', '거제', '목포', '순천', '안동', '울릉도', '대구', '춘천', '양양', '포항', '서울 성수동', '서울 익선동'];
const FOOD_WORLD = ['도쿄', '오사카', '후쿠오카', '방콕', '다낭', '타이베이', '홍콩', '싱가포르', '발리', '세부'];
const FOOD_KOREA = ['제주도', '부산', '강릉', '전주', '여수', '경주', '통영', '속초', '대구', '서울 성수동'];

export type TravelKind = 'world' | 'korea' | 'food';
export const TRAVEL_TOPICS: Record<TravelKind, { place: string; title: string }[]> = {
  world: WORLD.map(p => ({ place: p, title: `${p} 처음 가는 사람을 위한 가성비 여행 코스` })),
  korea: KOREA.map(p => ({ place: p, title: `${p} 당일·1박 여행 코스 가볼만한 곳` })),
  food: [
    ...FOOD_WORLD.map(p => ({ place: p, title: `${p} 현지 맛집 추천 먹킷리스트` })),
    ...FOOD_KOREA.map(p => ({ place: p, title: `${p} 현지인이 가는 맛집 추천` })),
  ],
};
export const TRAVEL_KINDS: TravelKind[] = ['world', 'korea', 'food'];
