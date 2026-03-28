/**
 * loov22.vercel.app 에서 사용하는 기존 Supabase에 연결
 * 설정: LOOV_SUPABASE_URL, LOOV_SUPABASE_ANON_KEY
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSetting } from './get-setting'

export async function createLoovClient() {
  const url = process.env.LOOV_SUPABASE_URL || await getSetting('LOOV_SUPABASE_URL')
  const key = process.env.LOOV_SUPABASE_ANON_KEY || await getSetting('LOOV_SUPABASE_ANON_KEY')
  if (!url || !key) return null
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}
