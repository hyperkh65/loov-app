/**
 * 쿠팡/무신사/토스 제휴 콘텐츠용 1st-party 클릭 추적. 지금까지는 세 파이프라인
 * 전부 제휴 URL을 그대로 노출해서 어떤 상품·채널·앵글이 실제로 클릭되는지
 * 전혀 알 수 없었음 — /go/{id}로 감싸서 클릭을 기록한 뒤 실제 URL로 리다이렉트.
 */
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase-server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randomId(len = 8): string {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, b => BASE62[b % BASE62.length]).join('');
}

export type AffiliatePlatform = 'coupang' | 'musinsa' | 'toss';
export type ContentChannel = 'sns_comment' | 'wordpress_cta';
export type ContentAngle = 'discount' | 'compare' | 'review' | 'use_case';

const ANGLES: ContentAngle[] = ['discount', 'compare', 'review', 'use_case'];
export function pickContentAngle(): ContentAngle {
  return ANGLES[Math.floor(Math.random() * ANGLES.length)];
}

export interface CreateGoLinkParams {
  platform: AffiliatePlatform;
  networkProductId: string;
  productName: string;
  destinationUrl: string;
  scheduleId?: string;
  contentChannel: ContentChannel;
  snsPlatform?: string;
  contentAngle?: ContentAngle;
}

/** go-link row를 만들고 짧은 추적 URL을 반환한다. 실패하면 원본 URL로 폴백해서
 * (테이블이 아직 없거나 DB 오류가 나도) 발행 자체는 막히지 않게 한다. */
export async function createGoLink(params: CreateGoLinkParams): Promise<string> {
  try {
    const admin = createAdminClient();
    const id = randomId();
    const { error } = await admin.from('bossai_affiliate_go_links').insert({
      id,
      platform: params.platform,
      network_product_id: params.networkProductId,
      product_name: params.productName,
      destination_url: params.destinationUrl,
      schedule_id: params.scheduleId || null,
      content_channel: params.contentChannel,
      sns_platform: params.snsPlatform || null,
      content_angle: params.contentAngle || null,
    });
    if (error) throw error;
    return `${APP_URL}/go/${id}`;
  } catch (e) {
    console.error('[affiliate-tracking] go-link 생성 실패, 원본 URL로 폴백:', e);
    return params.destinationUrl;
  }
}
