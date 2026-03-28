/**
 * loov 레포(hyperkh65/loov)의 별도 Supabase 계정에 연결하는 클라이언트
 * LOOV_SUPABASE_URL, LOOV_SUPABASE_ANON_KEY 설정값을 사용
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSetting } from './get-setting'

export async function createLoovClient() {
  const url = process.env.LOOV_SUPABASE_URL || await getSetting('LOOV_SUPABASE_URL')
  const key = process.env.LOOV_SUPABASE_ANON_KEY || await getSetting('LOOV_SUPABASE_ANON_KEY')

  if (!url || !key) return null

  return createSupabaseClient(url, key, {
    auth: { persistSession: false },
  })
}
