import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { nasExec, nasExecWithStdin, nasExecCustom, nasExecWithStdinCustom } from '@/lib/nas-ssh';
import { getUserSettings, isOwner } from '@/lib/user-settings';

const OWNER_NAS_WEB_BASE = process.env.NAS_WEB_BASE_URL || 'http://hy64.synology.me';
const NAS_PHOTO_DIR = '/volume1/web/camera_photos';

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, filter, filterCss, location, notionDbId, metadata, isSecret } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: '이미지 없음' }, { status: 400 });

    const photoId = metadata?.id || Date.now().toString();
    const filename = `${photoId}.jpg`;

    // base64 → Buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // 현재 로그인 유저 확인
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();

    const owner = user ? isOwner(user.id) : false;

    // 유저 설정 읽기 (일반 유저만)
    const userSettings = (!owner && user) ? await getUserSettings(user.id) : null;

    // NAS 연결 정보 결정
    const nasWebBase = owner
      ? OWNER_NAS_WEB_BASE
      : (userSettings?.nas_web_base_url || '');

    const nasCredentials = owner
      ? null // 기본 env var 사용
      : (userSettings?.nas_ssh_host && userSettings?.nas_ssh_user && userSettings?.nas_ssh_password
        ? {
            host: userSettings.nas_ssh_host,
            port: userSettings.nas_ssh_port ?? 22,
            username: userSettings.nas_ssh_user,
            password: userSettings.nas_ssh_password,
          }
        : null);

    const hasNas = owner || !!nasCredentials;

    // ── 1. NAS 저장 ──────────────────────────────────────────────
    let nasUrl = '';
    if (hasNas) {
      try {
        if (owner) {
          await nasExec(`mkdir -p ${NAS_PHOTO_DIR}`);
          await nasExecWithStdin(`cat > ${NAS_PHOTO_DIR}/${filename}`, imageBuffer);
        } else if (nasCredentials) {
          await nasExecCustom(`mkdir -p ${NAS_PHOTO_DIR}`, nasCredentials);
          await nasExecWithStdinCustom(`cat > ${NAS_PHOTO_DIR}/${filename}`, imageBuffer, nasCredentials);
        }
        if (nasWebBase) {
          nasUrl = `${nasWebBase}/camera_photos/${filename}`;
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('NAS save error:', message);
      }
    }

    // ── 2. Notion 저장 ────────────────────────────────────────────
    let notionPageId = '';

    // Notion API 키 결정
    const notionApiKey = owner
      ? (process.env.NOTION_API_KEY || '')
      : (userSettings?.notion_api_key || '');
    const targetNotionDb = notionDbId
      || (owner ? process.env.NOTION_CAMERA_DB_ID : userSettings?.notion_camera_db_id)
      || '';

    if (notionApiKey && targetNotionDb) {
      try {
        const children = nasUrl
          ? [{ object: 'block', type: 'image', image: { type: 'external', external: { url: nasUrl } } }]
          : [];

        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${notionApiKey}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            parent: { database_id: targetNotionDb },
            properties: {
              이름: { title: [{ type: 'text', text: { content: `📸 ${metadata?.timestamp || new Date().toLocaleString('ko-KR')}` } }] },
              필터: { rich_text: [{ type: 'text', text: { content: filter || 'normal' } }] },
              촬영일시: { date: { start: new Date().toISOString() } },
              ...(nasUrl && {
                이미지: { files: [{ type: 'external', name: filename, external: { url: nasUrl } }] },
              }),
              ...(location && {
                위치: { rich_text: [{ type: 'text', text: { content: `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` } }] },
              }),
            },
            children,
          }),
        });
        const d = await res.json();
        notionPageId = d.id || '';
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('Notion save error:', message);
      }
    }

    // ── 3. Supabase 저장 (크로스 디바이스 동기화) ────────────────
    const imageUrlForDb = nasUrl || imageBase64; // NAS URL 우선, 없으면 full base64

    const sbAdmin = createAdminClient();
    const { data: savedPhoto, error: dbError } = await sbAdmin
      .from('camera_photos')
      .upsert({
        id: photoId,
        user_id: user?.id ?? null,
        cloudinary_url: imageUrlForDb,
        thumbnail_url: nasUrl || '',
        filter: filter || 'normal',
        filter_css: filterCss || '',
        timestamp: metadata?.timestamp || new Date().toLocaleString('ko-KR'),
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        is_secret: isSecret ?? false,
      }, { onConflict: 'id' })
      .select()
      .single();

    if (dbError) console.error('Supabase save error:', dbError);

    return NextResponse.json({
      nasUrl,
      notionPageId,
      photoId: savedPhoto?.id || photoId,
      ok: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    console.error('Camera save error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 갤러리 로드 (모든 기기에서 공유)
// ?secret=1 + 올바른 비밀번호 헤더 필요 시 비밀사진 반환
export async function GET(req: NextRequest) {
  try {
    const sbAdmin = createAdminClient();
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();

    const url = new URL(req.url);
    const wantSecret = url.searchParams.get('secret') === '1';

    // 비밀 갤러리 요청: 비밀번호 헤더 검증
    if (wantSecret) {
      const pw = req.headers.get('x-secret-password');
      // 대표님: env var 사용, 일반 유저: user_settings 사용
      let envPw = process.env.CAMERA_SECRET_PASSWORD || '0506';
      if (user && !isOwner(user.id)) {
        const userSettings = await getUserSettings(user.id);
        if (userSettings?.camera_secret_password) {
          envPw = userSettings.camera_secret_password;
        }
      }
      if (pw !== envPw) {
        return NextResponse.json({ error: '인증 실패' }, { status: 401 });
      }
    }

    let query = sbAdmin
      .from('camera_photos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (wantSecret) {
      // 비밀사진: is_secret = true 만
      query = query.eq('is_secret', true);
    } else {
      // 일반사진: is_secret = false 또는 NULL (컬럼 없거나 기존 데이터)
      query = query.or('is_secret.eq.false,is_secret.is.null');
    }

    if (user) query = query.eq('user_id', user.id);

    const { data, error } = await query;
    // is_secret 컬럼 미존재 등 오류 시 전체 반환 (비밀 요청이 아닐 때만)
    if (error) {
      if (!wantSecret) {
        const { data: fallback } = await sbAdmin
          .from('camera_photos')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);
        return NextResponse.json({ photos: fallback || [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ photos: data || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 비밀사진 토글
export async function PATCH(req: NextRequest) {
  try {
    const { id, isSecret, password } = await req.json();
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();

    let envPw = process.env.CAMERA_SECRET_PASSWORD || '0506';
    if (user && !isOwner(user.id)) {
      const userSettings = await getUserSettings(user.id);
      if (userSettings?.camera_secret_password) {
        envPw = userSettings.camera_secret_password;
      }
    }

    if (password !== envPw) {
      return NextResponse.json({ error: '인증 실패' }, { status: 401 });
    }
    const sbAdmin = createAdminClient();
    const { error } = await sbAdmin.from('camera_photos').update({ is_secret: isSecret }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 사진 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const sbAdmin = createAdminClient();
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();

    // Supabase에서 URL 먼저 조회
    const { data } = await sbAdmin.from('camera_photos').select('thumbnail_url').eq('id', id).single();

    // NAS 파일 삭제
    if (data?.thumbnail_url?.includes('camera_photos')) {
      const filename = data.thumbnail_url.split('/').pop();
      const owner = user ? isOwner(user.id) : false;
      if (owner) {
        nasExec(`rm -f ${NAS_PHOTO_DIR}/${filename}`).catch(() => {});
      } else if (user) {
        const userSettings = await getUserSettings(user.id);
        if (userSettings?.nas_ssh_host && userSettings?.nas_ssh_user && userSettings?.nas_ssh_password) {
          nasExecCustom(`rm -f ${NAS_PHOTO_DIR}/${filename}`, {
            host: userSettings.nas_ssh_host,
            port: userSettings.nas_ssh_port ?? 22,
            username: userSettings.nas_ssh_user,
            password: userSettings.nas_ssh_password,
          }).catch(() => {});
        }
      }
    }

    const { error } = await sbAdmin.from('camera_photos').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
