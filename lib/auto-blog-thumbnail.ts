import sharp from 'sharp'
import { uploadToR2 } from './r2-storage'

// /api/gen-thumbnail 호출 → PNG 반환 → R2 업로드
// size: 'blog' = 1200×628 (OGP 표준, 기본값), 'square' = 1080×1080 (인스타그램)
// 배경 없는 민짜 그라디언트 카드는 글마다 똑같아 중복 이미지가 됨(사용자 확정 2026-10-04) —
// 배경 후보를 순서대로 시도하고, 다 실패하면 제목 기반 AI 이미지를 배경으로 씀. 그것도 실패할 때만 민짜.
export async function generateAndUploadThumbnail(
  title: string,
  keyword: string,
  colorScheme: 'blue' | 'dark' | 'green' | 'red' | 'orange' | 'violet' | 'teal' | 'golden' = 'blue',
  bgImageUrl?: string | string[],
  site?: string,
  sub?: string,
  size: 'blog' | 'square' = 'square',
): Promise<string> {
  // 공개 도메인으로 자기 자신을 호출하면 hairpin NAT로 간헐적으로 실패함.
  // localhost는 컨테이너 바인딩 이슈로 연결 거부되어 도커 브리지
  // 게이트웨이+게시된 포트로 우회(app/api/rewrite/auto-run/route.ts 참고).
  const appUrl = 'http://172.17.0.1:3100'

  const render = async (bg?: string) => {
    const params = new URLSearchParams({ title, keyword, color: colorScheme, size })
    if (bg) params.set('bg', bg)
    if (site) params.set('site', site)
    if (sub) params.set('sub', sub)
    const res = await fetch(`${appUrl}/api/gen-thumbnail?${params.toString()}`, { signal: AbortSignal.timeout(25_000) })
    if (!res.ok) throw new Error(`썸네일 생성 실패: HTTP ${res.status}`)
    return { buffer: Buffer.from(await res.arrayBuffer()), hasBg: res.headers.get('x-bg') === '1' }
  }

  const candidates = (Array.isArray(bgImageUrl) ? bgImageUrl : [bgImageUrl]).filter((u): u is string => !!u).slice(0, 4)
  let out: { buffer: Buffer; hasBg: boolean } | null = null
  for (const bg of candidates) {
    out = await render(bg).catch(() => null)
    if (out?.hasBg) break
  }
  if (!out?.hasBg) {
    const { designImageScene, generateAiImage } = await import('./blog-content-generator')
    const ai = await designImageScene(title).then(generateAiImage).catch(() => null)
    const aiOut = ai ? await render(ai).catch(() => null) : null
    out = aiOut?.hasBg ? aiOut : (out || await render())
  }

  // PNG(평균 약 1.1MB)는 R2 저장 용량의 주범(월 5~6GB씩 증가) → JPEG q88로 저장(약 1/4~1/6).
  // WebP는 인스타·스레드 등 SNS 업로드가 받지 못해 JPEG로 통일. 변환 실패 시 기존 PNG로 폴백.
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  try {
    const jpg = await sharp(out.buffer).flatten({ background: '#ffffff' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
    return await uploadToR2(`thumbnails/${id}.jpg`, jpg, 'image/jpeg')
  } catch (e) {
    console.error('[thumbnail] JPEG 변환 실패→PNG 저장:', (e as Error).message)
    return uploadToR2(`thumbnails/${id}.png`, out.buffer, 'image/png')
  }
}
