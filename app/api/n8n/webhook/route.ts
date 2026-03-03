import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// n8n 웹훅 시크릿 검증
function verifySecret(req: NextRequest): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return true; // 시크릿 미설정 시 허용 (개발 환경)

  const headerSecret = req.headers.get('x-webhook-secret') || req.headers.get('x-n8n-secret');
  return headerSecret === secret;
}

export async function POST(req: NextRequest) {
  // 시크릿 검증
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, userId, data } = body;

    const supabase = createAdminClient();

    switch (action) {
      // ── AI 인사이트 자동 생성 ──
      case 'generate_insights': {
        const { apiKey, provider = 'gemini' } = data || {};
        if (!apiKey) {
          return NextResponse.json({ error: 'API 키가 없습니다' }, { status: 400 });
        }

        // insights/generate API 내부 호출
        const insightRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/insights/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, provider }),
        });
        const insightData = await insightRes.json();
        return NextResponse.json({ success: true, action, ...insightData });
      }

      // ── 일일 ERP 보고서 생성 ──
      case 'daily_erp_report': {
        if (!userId) return NextResponse.json({ error: 'userId 필요' }, { status: 400 });

        const today = new Date();
        const month = today.toISOString().slice(0, 7);

        // 이번 달 회계 데이터
        const { data: accounting } = await supabase
          .from('bossai_accounting_entries')
          .select('type, amount, category')
          .eq('user_id', userId)
          .gte('date', `${month}-01`);

        const income = (accounting || []).filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
        const expense = (accounting || []).filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

        // 영업 파이프라인
        const { data: sales } = await supabase
          .from('bossai_sales_leads')
          .select('status, value')
          .eq('user_id', userId);

        const pipeline = (sales || []).filter((l) => !['won', 'lost'].includes(l.status)).reduce((s, l) => s + l.value, 0);
        const won = (sales || []).filter((l) => l.status === 'won').reduce((s, l) => s + l.value, 0);

        const report = {
          month,
          income,
          expense,
          profit: income - expense,
          pipelineValue: pipeline,
          wonValue: won,
          generatedAt: new Date().toISOString(),
        };

        return NextResponse.json({ success: true, action, report });
      }

      // ── SNS 자동 포스팅 예약 ──
      case 'sns_auto_post': {
        if (!userId || !data?.content) {
          return NextResponse.json({ error: 'userId와 content 필요' }, { status: 400 });
        }

        // SNS 예약 포스트 저장
        await supabase.from('bossai_marketing_campaigns').insert({
          user_id: userId,
          id: crypto.randomUUID(),
          name: data.title || 'n8n 자동 포스팅',
          platform: data.platform || 'instagram',
          status: 'scheduled',
          content: data.content,
          schedule_date: data.scheduleDate || new Date().toISOString(),
        });

        return NextResponse.json({ success: true, action, message: 'SNS 포스팅이 예약되었습니다.' });
      }

      // ── 스케줄 이벤트 자동 추가 ──
      case 'add_schedule': {
        if (!userId || !data?.title || !data?.date) {
          return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 });
        }

        await supabase.from('bossai_schedule_events').insert({
          user_id: userId,
          id: crypto.randomUUID(),
          title: data.title,
          description: data.description || '',
          date: data.date,
          time: data.time || '',
          end_time: data.endTime || '',
          type: data.type || 'meeting',
          assigned_employee_ids: [],
          is_all_day: false,
          color: '',
        });

        return NextResponse.json({ success: true, action });
      }

      default:
        return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('n8n webhook error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// n8n 연결 확인용 GET
export async function GET(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    status: 'ok',
    service: 'LOOV n8n Webhook',
    version: '1.0',
    timestamp: new Date().toISOString(),
    supportedActions: ['generate_insights', 'daily_erp_report', 'sns_auto_post', 'add_schedule'],
  });
}
