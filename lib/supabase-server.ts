import { createServerClient } from '@supabase/ssr';
import { createClient as createAdminClientBase } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** 현재 사용자 세션을 쿠키에서 읽는 서버 클라이언트 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* Route Handler에서는 무시 */ }
        },
      },
    }
  );
}

/** RLS 우회가 필요한 서버 작업용 어드민 클라이언트 */
export function createAdminClient() {
  return createAdminClientBase(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
