import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

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

export async function uploadToR2(key: string, body: Buffer | ArrayBuffer | Uint8Array, contentType: string): Promise<string> {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body as ArrayBuffer)
  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buf,
    ContentType: contentType,
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
