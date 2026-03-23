import { createAdminClient } from './supabase-server';

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function wrapTextLines(text: string, maxCharsPerLine = 14): string[] {
  const lines: string[] = [];
  let current = '';
  for (const char of text) {
    current += char;
    if (current.length >= maxCharsPerLine) {
      lines.push(current);
      current = '';
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4); // 최대 4줄
}

function generateSvg(
  title: string,
  keyword: string,
  colorScheme: 'blue' | 'dark' | 'green' = 'blue',
  bgBase64?: string,
  bgMimeType?: string,
): string {
  const lines = wrapTextLines(title, 14);
  const fontSize = lines.some(l => l.length > 12) ? 64 : 72;
  const lineHeight = fontSize * 1.4;
  const totalTextH = lines.length * lineHeight;
  const startY = (1080 - totalTextH) / 2 - 40;

  const textElements = lines.map((line, i) => `
    <text x="540" y="${startY + i * lineHeight + fontSize}"
      text-anchor="middle"
      font-family="'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR','Nanum Gothic',sans-serif"
      font-size="${fontSize}" font-weight="bold" fill="white">
      <tspan filter="url(#shadow)">${escapeXml(line)}</tspan>
    </text>`).join('');

  const gradColors = {
    blue: ['#0a1628', '#1a3a6b', '#0d2447'],
    dark: ['#1a1a1a', '#2d2d2d', '#0f0f0f'],
    green: ['#0a2010', '#1a4a20', '#0d3010'],
  }[colorScheme];

  const keywordTagWidth = keyword.length * 14 + 40;
  const keywordTagX = 540 - keywordTagWidth / 2;
  const keywordTagY = startY + lines.length * lineHeight + 30;

  if (bgBase64 && bgMimeType) {
    // 배경 사진 + 텍스트 오버레이 방식
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="rgba(0,0,0,0.95)"/>
    </filter>
  </defs>

  <!-- 배경 사진 -->
  <image href="data:${bgMimeType};base64,${bgBase64}" x="0" y="0" width="1080" height="1080" preserveAspectRatio="xMidYMid slice"/>

  <!-- 어두운 오버레이 -->
  <rect width="1080" height="1080" fill="rgba(0,0,0,0.55)"/>

  <!-- 상단 골드 바 -->
  <rect x="0" y="0" width="1080" height="14" fill="#f0b429"/>

  <!-- 하단 골드 바 -->
  <rect x="0" y="1066" width="1080" height="14" fill="#f0b429"/>

  <!-- 제목 텍스트 (흰색, 그림자) -->
  ${textElements}

  <!-- 키워드 태그 (골드 배경) -->
  <rect x="${keywordTagX}" y="${keywordTagY}"
    width="${keywordTagWidth}" height="56"
    rx="28" fill="rgba(240,180,41,0.9)"/>
  <text x="540" y="${keywordTagY + 34}"
    text-anchor="middle"
    font-family="'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif"
    font-size="28" font-weight="bold" fill="#1a1a1a">
    ${escapeXml(keyword)}
  </text>

  <!-- loov.co.kr 워터마크 -->
  <text x="540" y="1040"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="22" fill="rgba(255,255,255,0.4)">
    loov.co.kr
  </text>
</svg>`;
  }

  // 기존 그라디언트 배경 방식
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${gradColors[0]}"/>
      <stop offset="50%" stop-color="${gradColors[1]}"/>
      <stop offset="100%" stop-color="${gradColors[2]}"/>
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.5)"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="rgba(0,0,0,0.95)"/>
    </filter>
  </defs>

  <!-- 배경 그라디언트 -->
  <rect width="1080" height="1080" fill="url(#bg)"/>

  <!-- 비네팅 -->
  <rect width="1080" height="1080" fill="url(#vignette)"/>

  <!-- 상단 골드 바 -->
  <rect x="0" y="0" width="1080" height="14" fill="#f0b429"/>

  <!-- 하단 골드 바 -->
  <rect x="0" y="1066" width="1080" height="14" fill="#f0b429"/>

  <!-- 좌우 골드 라인 -->
  <rect x="0" y="0" width="8" height="1080" fill="rgba(240,180,41,0.3)"/>
  <rect x="1072" y="0" width="8" height="1080" fill="rgba(240,180,41,0.3)"/>

  <!-- 제목 텍스트 -->
  ${textElements}

  <!-- 키워드 태그 -->
  <rect x="${keywordTagX}" y="${keywordTagY}"
    width="${keywordTagWidth}" height="56"
    rx="28" fill="rgba(240,180,41,0.9)"/>
  <text x="540" y="${keywordTagY + 34}"
    text-anchor="middle"
    font-family="'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif"
    font-size="28" font-weight="bold" fill="#1a1a1a">
    ${escapeXml(keyword)}
  </text>

  <!-- 하단 도메인 워터마크 -->
  <text x="540" y="1040"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="22" fill="rgba(255,255,255,0.4)">
    loov.co.kr
  </text>
</svg>`;
}

// 에러 발생 시 throw (null 반환 안 함 - 호출측에서 try/catch로 처리)
export async function generateAndUploadThumbnail(
  title: string,
  keyword: string,
  colorScheme: 'blue' | 'dark' | 'green' = 'blue',
  bgImageUrl?: string,
): Promise<string> {
  let bgBase64: string | undefined;
  let bgMimeType: string | undefined;

  if (bgImageUrl) {
    try {
      const imgRes = await fetch(bgImageUrl);
      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        const mimeType = contentType.split(';')[0].trim();
        const arrayBuffer = await imgRes.arrayBuffer();
        bgBase64 = Buffer.from(arrayBuffer).toString('base64');
        bgMimeType = mimeType;
      }
    } catch {
      // 배경 이미지 fetch 실패 시 그라디언트 배경으로 폴백 (무시)
    }
  }

  const svg = generateSvg(title, keyword, colorScheme, bgBase64, bgMimeType);
  const buffer = Buffer.from(svg, 'utf-8');

  const supabase = createAdminClient();
  const filename = `thumbnails/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.svg`;

  // 버킷 생성 시도 (이미 존재하면 에러 무시)
  const { error: bucketErr } = await supabase.storage.createBucket('auto-blog', { public: true });
  if (bucketErr && !bucketErr.message.includes('already exist') && !bucketErr.message.includes('duplicate')) {
    // 버킷이 정말 없는지 확인
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b: { name: string }) => b.name === 'auto-blog');
    if (!exists) {
      throw new Error('Supabase Storage "auto-blog" 버킷이 없습니다. Supabase Dashboard → Storage에서 auto-blog 버킷을 Public으로 생성해주세요.');
    }
  }

  const { error } = await supabase.storage
    .from('auto-blog')
    .upload(filename, buffer, { contentType: 'image/svg+xml', upsert: true });

  if (error) {
    throw new Error(`썸네일 업로드 실패: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage.from('auto-blog').getPublicUrl(filename);
  return publicUrl;
}
