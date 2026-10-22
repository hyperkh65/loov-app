/** 쇼츠 상품 링크 모음(유튜브 쇼츠는 설명란 링크가 안 눌려서, 채널 프로필 링크 → 이 페이지 → 상품번호로 찾는다). NAS 파일 하나에 저장 */
import fs from 'fs';
import path from 'path';
import { NASQ_DIR } from '@/lib/shorts-nasq';

export interface ShopItem { no: number; title: string; link: string; img?: string; price?: number; at: number }
const FILE = path.join(NASQ_DIR, 'shop.json');
export const readShop = (): ShopItem[] => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } };
export function upsertShop(it: ShopItem) {
  const list = readShop().filter(x => x.no !== it.no);
  list.unshift(it); list.sort((a, b) => b.no - a.no);
  fs.mkdirSync(NASQ_DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(list.slice(0, 1000)));
}
