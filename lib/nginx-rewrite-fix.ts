/**
 * wp-auto가 만드는 WebStation "일반 PHP" 서비스 프로필은 워드프레스 예쁜
 * 퍼머링크(및 그걸로 만들어지는 사이트맵 등)에 필요한 nginx try_files
 * 폴백이 기본으로 안 들어있어서, 홈 화면(`/`)만 열리고 그 외 모든 글/페이지/
 * 사이트맵 URL은 404가 나는 문제가 실사용 중(finance.2days.kr) 확인됨.
 * WebStation이 서비스별 커스텀 설정으로 공식 지원하는
 * conf.d/<service-id>/user.conf에 try_files 규칙을 추가하면 해결됨 —
 * 이 파일은 그 서비스 하나만의 전용 파일이라 다른 사이트에 영향 없음.
 */
import type { NasKey } from '@/lib/nas-targets';
import { NAS_TARGETS } from '@/lib/nas-targets';

const SUDO_PASS: Record<NasKey, string> = {
  hy64: process.env.NAS_SYNO_ADMIN_PASS || '',
  hy65: process.env.NAS2_SSH_PASSWORD || 'Fpahs60577##7759',
};

export async function ensureWordPressRewrite(nas: NasKey, fqdn: string): Promise<{ fixed: boolean; note: string }> {
  const target = NAS_TARGETS[nas];
  const sudo = SUDO_PASS[nas];
  if (!sudo) return { fixed: false, note: 'sudo 비밀번호 없음' };

  // 셸 한 번으로: Portal.json에서 fqdn의 service id 찾기 → user.conf 존재+try_files
  // 포함 여부 확인 → 없으면 생성 + nginx reload
  const script = `
set -e
SUDO='${sudo}'
SVC_ID=$(echo "$SUDO" | sudo -S python3 -c "
import json
p = json.load(open('/usr/syno/etc/packages/WebStation/Portal.json'))
items = p if isinstance(p, list) else p.get('portal_list', p.get('portals', []))
for item in items:
    if item.get('fqdn') == '${fqdn}':
        print(item.get('service', ''))
        break
" 2>/dev/null)
if [ -z "$SVC_ID" ]; then echo "NO_PORTAL"; exit 0; fi
CONF_DIR="/usr/local/etc/nginx/conf.d/$SVC_ID"
CONF_FILE="$CONF_DIR/user.conf"
if echo "$SUDO" | sudo -S test -f "$CONF_FILE" 2>/dev/null && echo "$SUDO" | sudo -S grep -q "try_files" "$CONF_FILE" 2>/dev/null; then
  echo "ALREADY_OK:$SVC_ID"
  exit 0
fi
echo "$SUDO" | sudo -S mkdir -p "$CONF_DIR"
echo "$SUDO" | sudo -S sh -c "cat > '$CONF_FILE' << 'EOC'
location / {
    try_files \\\$uri \\\$uri/ /index.php?\\\$args;
}
EOC"
echo "$SUDO" | sudo -S nginx -t 2>&1
echo "$SUDO" | sudo -S nginx -s reload 2>&1
echo "FIXED:$SVC_ID"
`;

  const res = await target.exec(script);
  const out = res.stdout.trim();
  if (out.includes('NO_PORTAL')) return { fixed: false, note: `${fqdn}에 대한 WebStation 가상호스트가 아직 없음(수동 연결 전)` };
  if (out.includes('ALREADY_OK')) return { fixed: false, note: '이미 적용됨' };
  if (out.includes('FIXED')) return { fixed: true, note: 'try_files 규칙 추가 + nginx reload 완료' };
  return { fixed: false, note: `알 수 없는 결과: ${out.slice(0, 200)} / ${res.stderr.slice(0, 200)}` };
}
