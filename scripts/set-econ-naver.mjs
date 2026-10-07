// 경제 블로그 네이버 계정 쿠키 등록/갱신: .env.local 에 NAVER_ECON_BLOG_ID / NAVER_ECON_NID_AUT / NAVER_ECON_NID_SES 를 적고 실행
// node --env-file=.env.local scripts/set-econ-naver.mjs
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, NAVER_ECON_BLOG_ID, NAVER_ECON_NID_AUT, NAVER_ECON_NID_SES } = process.env;
if (!NAVER_ECON_BLOG_ID || !NAVER_ECON_NID_AUT || !NAVER_ECON_NID_SES) { console.error('NAVER_ECON_* 3개 값이 .env.local 에 없음'); process.exit(1); }
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const cur = (await (await fetch(`${url}/rest/v1/app_settings?id=eq.1&select=settings`, { headers: h })).json())[0]?.settings || {};
const settings = { ...cur, NAVER_ECON_BLOG_ID, NAVER_ECON_NID_AUT, NAVER_ECON_NID_SES };
const r = await fetch(`${url}/rest/v1/app_settings?id=eq.1`, { method: 'PATCH', headers: h, body: JSON.stringify({ settings }) });
console.log(r.ok ? '등록 완료' : `실패 ${r.status}`);
