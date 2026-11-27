import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { compressForWeb } from '@/lib/image-compress'

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ''
const BUCKET = process.env.R2_BUCKET || 'loov-storage'
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')

let _client: S3Client | null = null

function getClient() {
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    })
  }
  return _client
}

export function r2Available(): boolean {
  return !!(ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && PUBLIC_URL)
}

/** R2 업로드. 사진(png/jpg/webp)이 300KB를 넘으면 웹용으로 줄여서 올린다(대표이미지·본문·카드뉴스 등 모든 경로 공통).
 *  원본 그대로 올려야 하면 opts.raw = true. 파일 이름(확장자)은 그대로 두고 내용 형식(ContentType)만 바뀔 수 있다. */
export async function uploadToR2(key: string, body: Buffer | ArrayBuffer | Uint8Array, contentType: string, opts: { raw?: boolean } = {}): Promise<string> {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(body as ArrayBuffer)
  if (!opts.raw) { const w = await compressForWeb(buf, contentType); buf = w.buf; contentType = w.type }
  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buf,
    ContentType: contentType,
    ContentLength: buf.byteLength,
  }))
  return `${PUBLIC_URL}/${key}`
}

export async function deleteFromR2(keys: string[]): Promise<void> {
  if (!keys.length) return
  await Promise.all(
    keys.map(key => getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {}))
  )
}

export function getR2PublicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`
}

export async function readFromR2(key: string): Promise<string | null> {
  try {
    const res = await getClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    const chunks: Uint8Array[] = []
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString('utf-8')
  } catch {
    return null
  }
}
