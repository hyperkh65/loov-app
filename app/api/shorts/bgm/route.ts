import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

// 장르별 큐레이션 BGM (Pixabay Music - 직접 재생 가능 URL)
export const BGM_PRESETS = [
  // 잔잔/감성
  { id: 'calm1',   genre: '잔잔',  mood: '감성·힐링', label: '잔잔한 피아노',       bpm: 70,  url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3' },
  { id: 'calm2',   genre: '잔잔',  mood: '감성·힐링', label: '어쿠스틱 기타',       bpm: 75,  url: 'https://cdn.pixabay.com/download/audio/2022/04/27/audio_67f7e5bf64.mp3' },
  { id: 'calm3',   genre: '잔잔',  mood: '감성·힐링', label: '소프트 앰비언트',     bpm: 65,  url: 'https://cdn.pixabay.com/download/audio/2022/08/02/audio_884fe92c21.mp3' },
  // 업비트/신나는
  { id: 'upbeat1', genre: '업비트', mood: '신나는·활기', label: '신나는 팝',         bpm: 120, url: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1bbb.mp3' },
  { id: 'upbeat2', genre: '업비트', mood: '신나는·활기', label: '경쾌한 비트',       bpm: 128, url: 'https://cdn.pixabay.com/download/audio/2023/03/09/audio_c76a5f23bb.mp3' },
  { id: 'upbeat3', genre: '업비트', mood: '신나는·활기', label: '에너지 전자음악',   bpm: 135, url: 'https://cdn.pixabay.com/download/audio/2022/11/22/audio_febc508520.mp3' },
  // Lo-fi/집중
  { id: 'lofi1',   genre: 'Lo-fi', mood: '집중·공부', label: 'Lo-fi 힙합',          bpm: 85,  url: 'https://cdn.pixabay.com/download/audio/2022/05/17/audio_69a61cd6d6.mp3' },
  { id: 'lofi2',   genre: 'Lo-fi', mood: '집중·공부', label: 'Chill 비트',          bpm: 80,  url: 'https://cdn.pixabay.com/download/audio/2022/08/31/audio_d3fc45e7b1.mp3' },
  // 웅장/에픽
  { id: 'epic1',   genre: '에픽',  mood: '웅장·감동', label: '오케스트라 에픽',     bpm: 100, url: 'https://cdn.pixabay.com/download/audio/2022/04/27/audio_c9076a9c73.mp3' },
  { id: 'epic2',   genre: '에픽',  mood: '웅장·감동', label: '시네마틱 드라마',     bpm: 90,  url: 'https://cdn.pixabay.com/download/audio/2021/11/25/audio_5a853b4e0a.mp3' },
  // 코믹/귀여운
  { id: 'fun1',    genre: '코믹',  mood: '재미·유머', label: '귀여운 동요풍',       bpm: 110, url: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_270f49c1a7.mp3' },
  { id: 'fun2',    genre: '코믹',  mood: '재미·유머', label: '경쾌한 팝 코믹',     bpm: 115, url: 'https://cdn.pixabay.com/download/audio/2021/04/07/audio_c86f9c3809.mp3' },
  // 감동/스토리
  { id: 'emo1',    genre: '감동',  mood: '감성·눈물', label: '감동적인 피아노',     bpm: 60,  url: 'https://cdn.pixabay.com/download/audio/2022/10/30/audio_b236c5abfa.mp3' },
  { id: 'emo2',    genre: '감동',  mood: '감성·눈물', label: '스트링 감성',         bpm: 65,  url: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_7b887e7038.mp3' },
  // 트렌디/MZ
  { id: 'trend1',  genre: '트렌드', mood: 'MZ·힙',   label: '트렌디 팝 비트',      bpm: 125, url: 'https://cdn.pixabay.com/download/audio/2023/01/04/audio_74c2a26d8b.mp3' },
  { id: 'trend2',  genre: '트렌드', mood: 'MZ·힙',   label: '모던 R&B',            bpm: 95,  url: 'https://cdn.pixabay.com/download/audio/2023/02/28/audio_bf7a40cc15.mp3' },
];

// 톤 → 추천 BGM
export const TONE_BGM_MAP: Record<string, string[]> = {
  info:    ['calm1', 'lofi1', 'lofi2'],
  fun:     ['fun1', 'fun2', 'upbeat1'],
  emotion: ['emo1', 'emo2', 'calm1'],
  edu:     ['lofi1', 'lofi2', 'calm2'],
  story:   ['emo1', 'epic2', 'calm3'],
  trend:   ['trend1', 'trend2', 'upbeat2'],
};

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tone = searchParams.get('tone') ?? '';
    const genre = searchParams.get('genre') ?? '';

    let list = BGM_PRESETS;
    if (genre) list = list.filter(b => b.genre === genre);

    const recommended = tone ? TONE_BGM_MAP[tone]?.map(id => BGM_PRESETS.find(b => b.id === id)).filter(Boolean) : [];

    // Pixabay Music API 검색 (API 키 있으면 추가 검색)
    const pixabayKey = await getSetting('PIXABAY_API_KEY');
    let searchResults: typeof BGM_PRESETS = [];

    const q = searchParams.get('q');
    if (q && pixabayKey) {
      try {
        const res = await fetch(`https://pixabay.com/api/videos/music/?key=${pixabayKey}&q=${encodeURIComponent(q)}&per_page=10`);
        const data = await res.json() as { hits?: { id: number; tags: string; audio_url: string; duration: number }[] };
        searchResults = (data.hits ?? []).map(h => ({
          id: `px_${h.id}`, genre: '검색결과', mood: h.tags.split(',')[0] ?? '',
          label: h.tags.split(',').slice(0, 2).join(' · '),
          bpm: 100, url: h.audio_url,
        }));
      } catch { /* 검색 실패해도 프리셋 반환 */ }
    }

    const genres = [...new Set(BGM_PRESETS.map(b => b.genre))];
    return NextResponse.json({ presets: list, recommended, searchResults, genres });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
