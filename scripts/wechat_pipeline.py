#!/usr/bin/env python3
"""
WeChat 자동 백업 파이프라인 v2
1. lldb로 WeChat 메모리에서 SQLite 리프 페이지 덤프
2. 메시지 파싱 (최근 26시간)
3. Claude API로 AI 요약
4. NAS SSH 업로드 (paramiko 비밀번호 인증)
5. Notion 페이지 생성 (선택)

Usage: python3 wechat_pipeline.py [wechat_pid]
"""
import sys, os, json, struct, datetime, hashlib, re, subprocess, tempfile, time

WORK_DIR = os.path.expanduser("~/.wechat_backup")
CONFIG_FILE = os.path.join(WORK_DIR, "config.json")
PAGE_SIZE = 4096

def load_config():
    with open(CONFIG_FILE) as f:
        return json.load(f)

# ══════════════════════════════════════════════════════════════
# STEP 1: lldb 메모리 덤프
# ══════════════════════════════════════════════════════════════
DUMP_SCRIPT_TEMPLATE = r"""
import lldb, struct, os
PAGE_SIZE=4096; LEAF=0x0D
OUT="{out}"; LOG="{log}"
def log(m):
    with open(LOG,'a') as f: f.write(m+"\n")
def rm(p,a,s):
    e=lldb.SBError(); d=p.ReadMemory(a,s,e)
    return d if(e.Success() and d) else None
def il(pg):
    if len(pg)<PAGE_SIZE or pg[0]!=LEAF: return False
    cc=struct.unpack_from('>H',pg,3)[0]
    if cc==0 or cc>300: return False
    cs=struct.unpack_from('>H',pg,5)[0]
    if cs==0: cs=65536
    return 9<=cs<=PAGE_SIZE
def run(debugger,command,result,internal_dict):
    t=debugger.GetSelectedTarget(); p=t.GetProcess()
    wr=(p.GetState()==lldb.eStateRunning)
    if wr: p.Stop(); import time; time.sleep(0.3)
    n=0; f=open(OUT,'wb')
    C=8*1024*1024; a=0x100000000
    while a<0x300000000000:
        r=lldb.SBMemoryRegionInfo()
        if not p.GetMemoryRegionInfo(a,r).Success(): break
        rs,re=r.GetRegionBase(),r.GetRegionEnd()
        if re<=a: break
        sz=re-rs
        if r.IsReadable() and PAGE_SIZE<=sz<=512*1024*1024:
            for off in range(0,sz,C):
                d=rm(p,rs+off,min(C,sz-off))
                if not d: continue
                for pi in range(len(d)//PAGE_SIZE):
                    pg=d[pi*PAGE_SIZE:(pi+1)*PAGE_SIZE]
                    if il(pg): f.write(pg); n+=1
        a=re
    f.close(); log(str(n)+" pages")
    if wr: p.Continue()
def __lldb_init_module(debugger,internal_dict):
    debugger.HandleCommand('command script add -f wc_dmp.run do_dump')
    run(debugger,'',None,{})
"""

def dump_memory(pid):
    out = os.path.join(WORK_DIR, "leaves.bin")
    log = os.path.join(WORK_DIR, "dump.log")
    mod = os.path.join(WORK_DIR, "wc_dmp.py")
    cmds = os.path.join(WORK_DIR, "dump.lldb")

    with open(mod, 'w') as f:
        f.write(DUMP_SCRIPT_TEMPLATE.replace('{out}', out).replace('{log}', log))
    with open(cmds, 'w') as f:
        f.write(f"process attach --pid {pid}\ncommand script import {mod}\nquit\n")

    print(f"[1/5] Dumping WeChat memory PID={pid}...")
    r = subprocess.run(["lldb","--batch","-s",cmds], capture_output=True, text=True, timeout=300)
    if os.path.exists(out) and os.path.getsize(out) > 0:
        n = os.path.getsize(out) // PAGE_SIZE
        print(f"  OK: {n} leaf pages")
        return out
    print(f"  FAIL: {r.stderr[:200]}")
    return None

# ══════════════════════════════════════════════════════════════
# STEP 2: 메시지 파싱
# ══════════════════════════════════════════════════════════════
def rv(data, pos):
    result=0
    for i in range(9):
        if pos+i>=len(data): return 0,pos
        b=data[pos+i]
        if i<8:
            result=(result<<7)|(b&0x7F)
            if not(b&0x80): return result,pos+i+1
        else: result=(result<<8)|b; return result,pos+i+1
    return result,pos

def prec(page, pos, size):
    payload=page[pos:pos+size]
    if len(payload)<2: return None
    hdr,hpos=rv(payload,0)
    if hdr<=0 or hdr>len(payload): return None
    ct=[]
    while hpos<hdr: t,hpos=rv(payload,hpos); ct.append(t)
    dp=hdr; vals=[]
    for t in ct:
        if dp>len(payload): break
        if t==0: vals.append(None)
        elif t==1: vals.append(struct.unpack_from('b',payload,dp)[0] if dp+1<=len(payload) else 0); dp+=1
        elif t==2: vals.append(struct.unpack_from('>h',payload,dp)[0] if dp+2<=len(payload) else 0); dp+=2
        elif t==3: vals.append(int.from_bytes(payload[dp:dp+3],'big',signed=True)); dp+=3
        elif t==4: vals.append(struct.unpack_from('>i',payload,dp)[0] if dp+4<=len(payload) else 0); dp+=4
        elif t==5: vals.append(int.from_bytes(payload[dp:dp+6],'big',signed=True)); dp+=6
        elif t==6: vals.append(struct.unpack_from('>q',payload,dp)[0] if dp+8<=len(payload) else 0); dp+=8
        elif t==7: vals.append(struct.unpack_from('>d',payload,dp)[0] if dp+8<=len(payload) else 0); dp+=8
        elif t==8: vals.append(0)
        elif t==9: vals.append(1)
        elif t>=12 and t%2==0: sz=(t-12)//2; vals.append(bytes(payload[dp:dp+sz])); dp+=sz
        elif t>=13 and t%2==1:
            sz=(t-13)//2
            try: s=payload[dp:dp+sz].decode('utf-8')
            except: s=payload[dp:dp+sz].decode('latin-1',errors='replace')
            vals.append(s); dp+=sz
        else: break
    return vals

def ppage(data, off):
    if off+PAGE_SIZE>len(data): return []
    page=data[off:off+PAGE_SIZE]
    if page[0]!=0x0D: return []
    cc=struct.unpack_from('>H',page,3)[0]
    if cc==0 or cc>300: return []
    rows=[]
    for i in range(cc):
        ptr=struct.unpack_from('>H',page,8+i*2)[0]
        if ptr<8 or ptr>=PAGE_SIZE: continue
        pos=ptr; ps,pos=rv(page,pos); rid,pos=rv(page,pos)
        if ps<=0 or ps>PAGE_SIZE: continue
        rec=prec(page,pos,min(ps,PAGE_SIZE-pos))
        if rec: rows.append((rid,rec))
    return rows

def fmt_ts(ts):
    try: return datetime.datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S')
    except: return str(ts)

ZSTD_MAGIC = b'\x28\xb5\x2f\xfd'
try:
    import zstandard as _zstd
    _dctx = _zstd.ZstdDecompressor()
    def _zdecompress(b):
        if isinstance(b, bytes) and b[:4] == ZSTD_MAGIC:
            try: return _dctx.decompress(b, max_output_size=131072).decode('utf-8', errors='replace')
            except: pass
        return None
except ImportError:
    def _zdecompress(b): return None

def _col_str(v):
    """컬럼 값을 문자열로 반환 (zstd 압축된 경우 해제)"""
    if isinstance(v, str): return v
    return _zdecompress(v) or ''

def extract_messages(leaves_file, hours_back=26):
    print(f"[2/5] Parsing messages (last {hours_back}h)...")
    data = open(leaves_file,'rb').read()
    total = len(data)//PAGE_SIZE
    cutoff = int(time.time()) - hours_back*3600
    messages = []

    for i in range(total):
        for rid,cols in ppage(data, i*PAGE_SIZE):
            if len(cols) < 12: continue
            create_time = cols[5]
            if not isinstance(create_time,int) or create_time<cutoff: continue

            source = _col_str(cols[11]) if len(cols) > 11 else ''
            msg_content = _col_str(cols[12]) if len(cols) > 12 else ''
            if not msg_content.strip(): continue

            # source XML fr 태그 (fr=0: 나, fr=1또는2: 상대방)
            is_other = None
            m = re.search(r'<fr>(\d+)</fr>', source)
            if m: is_other = (int(m.group(1)) != 0)

            # 그룹채팅 발신자 패턴
            sender = None; msg_text = msg_content
            m2 = re.match(r'^([^\n:]{3,50}):\n?(.+)', msg_content, re.DOTALL)
            if m2: sender=m2.group(1); msg_text=m2.group(2)

            messages.append({
                'time': create_time,
                'time_str': fmt_ts(create_time),
                'is_other': is_other,
                'sender': sender,
                'msg': msg_text.strip(),
            })

    seen=set(); unique=[]
    for m in messages:
        k=(m['time'],m['msg'][:50])
        if k not in seen: seen.add(k); unique.append(m)
    unique.sort(key=lambda x:x['time'])
    print(f"  Extracted {len(unique)} messages")
    return unique

# ══════════════════════════════════════════════════════════════
# STEP 3: AI 요약 (Ollama → OpenRouter free → Claude 순)
# ══════════════════════════════════════════════════════════════
def summarize(messages, today, cfg):
    print("[3/5] AI summarizing...")

    msg_text=""
    for m in messages:
        who = "나" if m['is_other']==False else (m['sender'] or "상대방")
        msg_text += f"[{m['time_str']}] {who}: {m['msg']}\n"

    prompt = (f"{today} 위챗 비즈니스 대화 요약 (한국어):\n"
              "1. 주요 논의 (5개 이내 bullet)\n"
              "2. 결정사항\n"
              "3. 팔로업 필요 항목\n"
              "4. #해시태그\n\n---\n" + msg_text[:8000])

    import urllib.request

    # 1. 로컬 Ollama (설정된 경우)
    ollama_url = cfg.get('ollama_base_url', 'http://localhost:11434')
    for model in ['qwen3.5', 'qwen3', 'llama3.3', 'mistral', 'gemma3', 'phi4']:
        try:
            body=json.dumps({"model":model,"messages":[{"role":"user","content":prompt}],"stream":False}).encode()
            req=urllib.request.Request(f"{ollama_url}/api/chat",data=body,headers={"Content-Type":"application/json"})
            with urllib.request.urlopen(req,timeout=60) as r:
                res=json.loads(r.read()); s=res.get('message',{}).get('content','')
                if s: print(f"  OK via Ollama({model})"); return s
        except: continue

    # 2. OpenRouter free
    or_key = cfg.get('openrouter_api_key', '')
    if or_key:
        for model in ['qwen/qwen3-235b-a22b:free','meta-llama/llama-3.3-70b-instruct:free','deepseek/deepseek-r1:free','google/gemma-3-27b-it:free','mistralai/mistral-7b-instruct:free']:
            try:
                body=json.dumps({"model":model,"messages":[{"role":"user","content":prompt}]}).encode()
                req=urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",data=body,
                    headers={"Authorization":f"Bearer {or_key}","Content-Type":"application/json"})
                with urllib.request.urlopen(req,timeout=30) as r:
                    res=json.loads(r.read()); s=res.get('choices',[{}])[0].get('message',{}).get('content','')
                    if s: print(f"  OK via OpenRouter({model})"); return s
            except: continue

    # 3. Claude API (있는 경우)
    api_key = cfg.get('anthropic_api_key', '')
    if api_key:
        try:
            body=json.dumps({"model":"claude-sonnet-4-6","max_tokens":1500,
                "messages":[{"role":"user","content":prompt}]}).encode()
            req=urllib.request.Request("https://api.anthropic.com/v1/messages",data=body,headers={
                "x-api-key":api_key,"anthropic-version":"2023-06-01","content-type":"application/json"})
            with urllib.request.urlopen(req,timeout=60) as r:
                res=json.loads(r.read()); s=res['content'][0]['text']
                print(f"  OK via Claude"); return s
        except Exception as e:
            print(f"  Claude fail: {e}")

    print("  SKIP: no AI available")
    return f"(AI 없음 - 메시지 {len(messages)}개)"

# ══════════════════════════════════════════════════════════════
# STEP 4: NAS 업로드 (paramiko)
# ══════════════════════════════════════════════════════════════
def upload_nas(cfg, today, content):
    print("[4/5] Uploading to NAS...")
    try:
        import paramiko, base64
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(cfg['nas_host'], port=cfg['nas_port'],
                    username=cfg['nas_user'], password=cfg['nas_password'],
                    timeout=30)

        remote_dir = f"~/wechat_backup/{today[:7]}"
        remote_file = f"{remote_dir}/wechat_{today}.md"

        # 디렉토리 생성
        _, so, se = ssh.exec_command(f"mkdir -p {remote_dir}")
        so.channel.recv_exit_status()

        # base64로 파일 전송 (SFTP chroot 우회)
        b64 = base64.b64encode(content.encode('utf-8')).decode()
        _, so, se = ssh.exec_command(f'echo "{b64}" | base64 -d > {remote_file} && echo OK')
        result = so.read().decode().strip()

        ssh.close()
        if result == 'OK':
            print(f"  Uploaded: {remote_file}")
            return True
        else:
            print(f"  FAIL: {se.read().decode()[:100]}")
            return False
    except Exception as e:
        print(f"  FAIL: {e}"); return False

# ══════════════════════════════════════════════════════════════
# STEP 5: Notion (loov API 경유)
# ══════════════════════════════════════════════════════════════
def create_notion(cfg, today, summary, messages):
    print("[5/5] Notion via loov API...")
    loov_url = cfg.get('loov_url', 'https://loov.co.kr')
    loov_token = cfg.get('loov_token', '') or cfg.get('loov_session', '')
    if not loov_token:
        print("  SKIP: loov_token not configured (loov 설정에서 config.json 다운로드하세요)"); return False

    import urllib.request
    data = {
        'date': today,
        'count': len(messages),
        'messages': messages,
        'summary': summary,
    }
    req = urllib.request.Request(
        f"{loov_url}/api/wechat/backup",
        data=json.dumps(data).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {loov_token}',
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            res = json.loads(r.read())
            print(f"  OK: {res.get('summary','')[:80]}"); return True
    except Exception as e:
        print(f"  FAIL: {e}"); return False

# ══════════════════════════════════════════════════════════════
# 메인
# ══════════════════════════════════════════════════════════════
def main():
    cfg = load_config()

    # WeChat PID
    if len(sys.argv) >= 2:
        pid = int(sys.argv[1])
    else:
        r = subprocess.run(['pgrep','-x','WeChat'], capture_output=True, text=True)
        pid_str = r.stdout.strip()
        if not pid_str:
            print("WeChat not running"); sys.exit(1)
        pid = int(pid_str.split('\n')[0])

    today = datetime.date.today().isoformat()
    print(f"\n{'='*55}\nWeChat Backup - {today} (PID {pid})\n{'='*55}\n")

    # 1. 메모리 덤프
    leaves = dump_memory(pid)
    if not leaves: sys.exit(1)

    # 2. 메시지 추출
    messages = extract_messages(leaves, cfg.get('hours_back', 26))

    # 저장
    out_json = os.path.join(WORK_DIR, f"{today}.json")
    with open(out_json,'w') as f:
        json.dump({'date':today,'count':len(messages),'messages':messages},f,ensure_ascii=False,indent=2)

    if not messages:
        print("No messages. Done."); sys.exit(0)

    # 3. AI 요약
    summary = summarize(messages, today, cfg)

    # 보고서 생성
    report = f"# WeChat 백업 - {today}\n\n"
    report += f"**메시지**: {len(messages)}개 | **생성**: {datetime.datetime.now().strftime('%H:%M:%S')}\n\n"
    report += f"---\n\n## AI 요약\n\n{summary}\n\n---\n\n## 메시지 로그\n\n"
    for m in messages:
        who = "나" if m['is_other']==False else (m['sender'] or "상대방")
        report += f"**[{m['time_str']}]** {who}: {m['msg']}\n\n"

    out_md = os.path.join(WORK_DIR, f"{today}.md")
    with open(out_md,'w') as f: f.write(report)

    # 4. NAS
    upload_nas(cfg, today, report)

    # 5. Notion
    create_notion(cfg, today, summary, messages)

    print(f"\n{'='*55}\nDone! {len(messages)} messages | {out_md}\n{'='*55}")

if __name__ == '__main__':
    main()
