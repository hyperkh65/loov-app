import { uploadToR2 } from './r2-storage'

// /api/gen-thumbnail 호출 → PNG 반환 → R2 업로드
// size: 'blog' = 1200×628 (OGP 표준, 기본값), 'square' = 1080×1080 (인스타그램)
export async function generateAndUploadThumbnail(
  title: string,
  keyword: string,
  colorScheme: 'blue' | 'dark' | 'green' | 'red' | 'orange' | 'violet' | 'teal' | 'golden' = 'blue',
  bgImageUrl?: string,
  site?: string,
  sub?: string,
  size: 'blog' | 'square' = 'square',
): Promise<string> {
  // 공개 도메인으로 자기 자신을 호출하면 hairpin NAT로 간헐적으로 실패함 —
  // 항상 이 컨테이너 안에서만 실행되므로 내부 포트로 직접 호출.
  const appUrl = 'http://localhost:3000'

  const params = new URLSearchParams({ title, keyword, color: colorScheme, size })
  if (bgImageUrl) params.set('bg', bgImageUrl)
  if (site) params.set('site', site)
  if (sub) params.set('sub', sub)

  const genUrl = `${appUrl}/api/gen-thumbnail?${params.toString()}`
  const res = await fetch(genUrl, { signal: AbortSignal.timeout(25_000) })
  if (!res.ok) throw new Error(`썸네일 생성 실패: HTTP ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const filename = `thumbnails/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`

  return uploadToR2(filename, buffer, 'image/png')
}
