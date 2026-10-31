/**
 * 딸깍 라이선스 공용 로직. 번호는 해시로만 저장하고, 맥 앱에는 서명(Ed25519)된 인증서를 준다.
 * 앱은 공개키로 서명을 확인하므로 인터넷이 끊겨도 인증서 유효기간 동안은 쓸 수 있다.
 */
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting, invalidateSettingsCache } from '@/lib/get-setting';

export const PLANS = {
  trial1: { label: '무료 1개월 쿠폰', months: 1 },
  m3: { label: '3개월', months: 3 },
  m6: { label: '6개월', months: 6 },
  m9: { label: '9개월', months: 9 },
  m12: { label: '12개월', months: 12 },
} as const;
export type PlanId = keyof typeof PLANS;

export const CERT_DAYS = 7; // 인증서 유효기간(앱이 이 안에 한 번은 서버에 다녀와야 한다. 앱은 +3일 유예)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 I,O,0,1 제외

export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashCode = (c: string) => crypto.createHash('sha256').update(normalizeCode(c)).digest('hex');
export const newCode = () => 'DDAL-' + Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')).join('-');
export const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

/** 서명 키: 처음 한 번 만들어 설정(app_settings)에 보관한다. 발급(admin) 때만 만들고, 활성화 때는 있는 것만 쓴다. */
export async function signingKey(create = false): Promise<crypto.KeyObject | null> {
  const stored = await getSetting('DDALKAK_LICENSE_PRIVATE_KEY');
  if (stored) return crypto.createPrivateKey(Buffer.from(stored, 'base64').toString('utf8'));
  if (!create) return null;
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const admin = createAdminClient();
  const { data: cur } = await admin.from('app_settings').select('settings').eq('id', 1).single();
  const next: Record<string, string> = { ...((cur?.settings as Record<string, string>) || {}) };
  if (next.DDALKAK_LICENSE_PRIVATE_KEY) return crypto.createPrivateKey(Buffer.from(next.DDALKAK_LICENSE_PRIVATE_KEY, 'base64').toString('utf8')); // 동시에 만든 쪽이 이김
  next.DDALKAK_LICENSE_PRIVATE_KEY = Buffer.from(pem).toString('base64');
  await admin.from('app_settings').update({ settings: next, updated_at: new Date().toISOString() }).eq('id', 1);
  invalidateSettingsCache();
  return privateKey;
}
export const publicPem = (k: crypto.KeyObject) => crypto.createPublicKey(k).export({ type: 'spki', format: 'pem' }).toString();

export interface CertPayload { v: 1; lid: string; email: string; plan: string; licExp: number; dev: string; iat: number; certExp: number }
export function signCert(key: crypto.KeyObject, p: Omit<CertPayload, 'v' | 'iat' | 'certExp'>): string {
  const now = Date.now(), body: CertPayload = { v: 1, ...p, iat: now, certExp: now + CERT_DAYS * 864e5 };
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  return data + '.' + crypto.sign(null, Buffer.from(data), key).toString('base64url');
}
/** 갱신 때 앱이 보낸 옛 인증서가 진짜인지 확인(만료돼도 서명만 맞으면 통과) */
export function readCert(key: crypto.KeyObject, cert: string): CertPayload | null {
  const [data, sig] = String(cert || '').split('.');
  if (!data || !sig) return null;
  try { return crypto.verify(null, Buffer.from(data), crypto.createPublicKey(key), Buffer.from(sig, 'base64url')) ? JSON.parse(Buffer.from(data, 'base64url').toString()) : null; } catch { return null; }
}
