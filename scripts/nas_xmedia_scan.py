#!/usr/bin/env python3
"""
NAS /volume1/web/xmedia 영상 목록 스캔 → R2 xmedia-index.json 저장
"""
import os, json, paramiko, boto3
from datetime import datetime, timezone
from urllib.parse import quote

NAS_DIR = '/volume1/web/xmedia'
NAS_URL_BASE = 'https://hy64.synology.me/xmedia'
CACHE_KEY = 'xmedia-index.json'

def scan_nas():
    host = os.environ['NAS_SSH_HOST']
    port = int(os.environ.get('NAS_SSH_PORT', '22'))
    user = os.environ['NAS_SSH_USER']
    password = os.environ['NAS_SSH_PASSWORD']

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, port=port, username=user, password=password, timeout=30)

    # 단 1번 명령으로 전체 파일 목록 수집
    cmd = (
        f'find "{NAS_DIR}" -maxdepth 2 -type f '
        r'\( -name "*.mp4" -o -name "*.mov" -o -name "*.avi" -o -name "*.mkv" \) '
        r'-printf "%P|%s|%TY-%Tm-%Td\n" 2>/dev/null'
    )
    _, stdout, _ = client.exec_command(cmd)
    output = stdout.read().decode('utf-8', errors='ignore')
    client.close()
    return output

def parse_output(output):
    videos = []
    account_set = set()

    for line in output.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        parts = line.split('|')
        if len(parts) < 2:
            continue
        rel = parts[0]
        size = int(parts[1]) if parts[1].isdigit() else 0
        modified = parts[2] if len(parts) > 2 else ''

        slash_idx = rel.find('/')
        if slash_idx < 0:
            continue
        username = rel[:slash_idx]
        filename = rel[slash_idx+1:]
        if not filename:
            continue

        account_set.add(username)
        videos.append({
            'username': username,
            'filename': filename,
            'url': f'{NAS_URL_BASE}/{username}/{quote(filename)}',
            'size': size,
            'modified': modified,
        })

    videos.sort(key=lambda v: v['filename'], reverse=True)
    accounts = sorted(account_set)
    return accounts, videos

def upload_to_r2(data):
    account_id = os.environ['R2_ACCOUNT_ID']
    access_key = os.environ['R2_ACCESS_KEY_ID']
    secret_key = os.environ['R2_SECRET_ACCESS_KEY']
    bucket = os.environ.get('R2_BUCKET', 'loov-storage')

    s3 = boto3.client(
        's3',
        endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name='auto',
    )
    body = json.dumps(data, ensure_ascii=False).encode('utf-8')
    s3.put_object(Bucket=bucket, Key=CACHE_KEY, Body=body, ContentType='application/json')
    print(f'✅ R2 업로드 완료: {CACHE_KEY} ({len(body)} bytes)')

if __name__ == '__main__':
    print('🔍 NAS 스캔 시작...')
    raw = scan_nas()
    accounts, videos = parse_output(raw)
    print(f'  계정: {len(accounts)}개, 영상: {len(videos)}개')

    data = {
        'accounts': accounts,
        'videos': videos,
        'total': len(videos),
        'cached_at': datetime.now(timezone.utc).isoformat(),
    }
    upload_to_r2(data)
    print('🎉 완료')
