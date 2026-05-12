import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { postToPlatformWithMedia } from '@/lib/sns/platforms-server';
import type { Schedule, InstagramAutoConfig } from './index';

async function getSnsConnection(userId: string, platform: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('sns_connections')
    .select('platform_user_id, access_token, is_active')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('is_active', true)
    .limit(1)
    .single();
  return data;
}

export async function runInstagramAuto(schedule: Schedule): Promise<{ topic: string; published: boolean; caption?: string }> {
  const config = schedule.config as InstagramAutoConfig;
  if (!config.topics?.length) throw new Error('주제가 설정되지 않았습니다');

  const idx = schedule.keyword_index % config.topics.length;
  const topic = config.topic_mode === 'random'
    ? config.topics[Math.floor(Math.random() * config.topics.length)]
    : config.topics[idx];

  const toneGuide = config.tone === 'professional'
    ? '전문적이고 신뢰감 있는 말투, 이모지 적절히 사용'
    : config.tone === 'trendy'
    ? '트렌디하고 감각적인 말투, 이모지와 라인브레이크 활용'
    : '친근하고 편안한 말투, 이모지 풍부하게 사용';

  const prompt = `당신은 인스타그램 마케터입니다. 다음 주제로 인스타그램 게시물 캡션을 작성하세요.

주제: ${topic}
톤: ${toneGuide}

요구사항:
- 첫 줄은 시선을 끄는 훅 문장
- 이모지 적절히 활용
- 해시태그 10-15개 포함 (캡션 끝에)
- 총 400자 이내
- 한국어로만 작성, 중국어·일본어 절대 금지
- 설명 없이 캡션만 출력`;

  const aiText = await generateText(prompt, 'qwen3');

  // 주제 인덱스 업데이트
  if (config.topic_mode === 'rotate') {
    const supabase = createAdminClient();
    await supabase.from('bossai_schedules').update({ keyword_index: (idx + 1) % config.topics.length }).eq('id', schedule.id);
  }

  if (!config.auto_publish) {
    return { topic, published: false, caption: aiText };
  }

  // 인스타그램 자동 발행
  const conn = await getSnsConnection(schedule.user_id, 'instagram');
  if (!conn) throw new Error('인스타그램 계정이 연결되지 않았습니다 (허브에서 연결 필요)');

  // Instagram은 이미지 필수이므로 Pixabay에서 이미지 가져오기 시도
  let imageUrls: string[] = [];
  try {
    const { getSetting } = await import('@/lib/get-setting');
    const pixabayKey = await getSetting('PIXABAY_API_KEY');
    if (pixabayKey) {
      const res = await fetch(`https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(topic)}&image_type=photo&per_page=3&safesearch=true&min_width=800`);
      if (res.ok) {
        const data = await res.json() as { hits?: { largeImageURL: string }[] };
        imageUrls = (data.hits || []).map(h => h.largeImageURL).slice(0, 1);
      }
    }
  } catch { /* 이미지 없이 진행 */ }

  if (!imageUrls.length) {
    return { topic, published: false, caption: aiText + '\n(이미지 없어 발행 스킵 — Pixabay API 키 설정 필요)' };
  }

  await postToPlatformWithMedia('instagram', conn.access_token, conn.platform_user_id, aiText, imageUrls);
  return { topic, published: true, caption: aiText };
}
