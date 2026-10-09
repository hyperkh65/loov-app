#!/usr/bin/env python3
"""hy64 영상 수집 워커: Supabase bossai_video_jobs 큐를 폴링해 yt-dlp로 받고, 파일을 내부 HTTP로 서빙.

env(필수): SUPABASE_URL, SUPABASE_SERVICE_KEY, WORKER_TOKEN
env(선택): VIDEO_DIR, COOKIES_DIR, BIND(기본 172.17.0.1 = docker 브리지, 외부 비노출), PORT(58100), YTDLP
쿠키: COOKIES_DIR/<도메인>.txt (예: douyin.com.txt) — URL에 그 도메인이 있으면 --cookies 로 사용.
"""
import hashlib, hmac, http.cookiejar, json, os, re, subprocess, sys, threading, time, urllib.request, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SB = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/bossai_video_jobs"
KEY = os.environ["SUPABASE_SERVICE_KEY"]
TOKEN = os.environ["WORKER_TOKEN"]
VIDEO_DIR = os.environ.get("VIDEO_DIR", "/volume1/homes/urjent/video_search_downloads")
COOKIES_DIR = os.environ.get("COOKIES_DIR", os.path.expanduser("~/video_worker/cookies"))
BIND = os.environ.get("BIND", "172.17.0.1")
PORT = int(os.environ.get("PORT", "58100"))
YTDLP = os.environ.get("YTDLP", "yt-dlp").split()
os.makedirs(VIDEO_DIR, exist_ok=True)


def sb(method, query="", body=None):
    req = urllib.request.Request(
        SB + query, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json",
                 "Prefer": "return=representation"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or "null")


def patch(job_id, **fields):
    fields["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    sb("PATCH", "?id=eq." + job_id, fields)


def cookies_for(url):
    host = urllib.parse.urlparse(url).netloc.lower()
    if os.path.isdir(COOKIES_DIR):
        for f in os.listdir(COOKIES_DIR):
            if f.endswith(".txt") and f[:-4] in host:
                return os.path.join(COOKIES_DIR, f)
    return None


def download(job):
    url = job["input"]
    cmd = YTDLP + ["--no-playlist", "--restrict-filenames", "--no-warnings", "--print-json", "--no-simulate",
                   "-o", os.path.join(VIDEO_DIR, "%(extractor)s_%(id)s.%(ext)s"),
                   "-f", "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/b[ext=mp4]/bv*+ba/b",
                   "--merge-output-format", "mp4"]
    ck = cookies_for(url)
    if ck:
        cmd += ["--cookies", ck]
    p = subprocess.run(cmd + [url], capture_output=True, text=True, timeout=1800)
    if p.returncode != 0:
        msg = (p.stderr or p.stdout).strip()
        raise RuntimeError(msg.splitlines()[-1][:500] if msg else "yt-dlp 실패")
    info = json.loads(p.stdout.strip().splitlines()[-1])
    path = info.get("filepath") or info.get("_filename")
    return {"file": os.path.basename(path), "title": info.get("title"), "site": info.get("extractor_key"),
            "thumbnail": info.get("thumbnail"), "uploader": info.get("uploader"),
            "duration": info.get("duration"), "size": os.path.getsize(path)}


_bili = {"opener": None, "exp": 0}


def bili_opener():
    # 비로그인 방문 쿠키(buvid)가 있어야 412가 안 남. 1시간 캐시.
    if time.time() > _bili["exp"]:
        op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        op.addheaders = [("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"),
                         ("Referer", "https://www.bilibili.com/")]
        op.open("https://www.bilibili.com/", timeout=20).read(1)
        op.open("https://api.bilibili.com/x/frontend/finger/spi", timeout=20).read()
        _bili.update(opener=op, exp=time.time() + 3600)
    return _bili["opener"]


def search_bilibili(q, n):
    url = "https://api.bilibili.com/x/web-interface/search/type?search_type=video&page=1&keyword=" + urllib.parse.quote(q)
    j = json.loads(bili_opener().open(url, timeout=20).read())
    if j.get("code") != 0:
        raise RuntimeError("bilibili code %s %s" % (j.get("code"), j.get("message")))
    out = []
    for r in (j["data"].get("result") or [])[:n]:
        h, m, sec = ([0, 0] + [int(x) for x in re.findall(r"\d+", r.get("duration", "0"))])[-3:]
        out.append({"site": "bilibili", "title": re.sub(r"<[^>]+>", "", r["title"]), "url": r["arcurl"].replace("http://", "https://"),
                    "thumbnail": "https:" + r["pic"] if r["pic"].startswith("//") else r["pic"],
                    "uploader": r.get("author"), "duration": h * 3600 + m * 60 + sec})
    return out


def search_youtube(q, n):
    p = subprocess.run(YTDLP + ["--flat-playlist", "--no-warnings", "-j", "ytsearch%d:%s" % (n, q)],
                       capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError((p.stderr.strip().splitlines() or ["youtube 검색 실패"])[-1][:300])
    out = []
    for line in p.stdout.splitlines():
        i = json.loads(line)
        th = i.get("thumbnails") or []
        out.append({"site": "youtube", "title": i.get("title"), "url": i.get("url") or i.get("webpage_url"),
                    "thumbnail": th[-1]["url"] if th else None, "uploader": i.get("channel") or i.get("uploader"),
                    "duration": i.get("duration")})
    return out


# 사이트 어댑터: name -> fn(query, limit) -> [{site,title,url,thumbnail,uploader,duration}]
SEARCH = {"bilibili": search_bilibili, "youtube": search_youtube}


def search(job):
    req = json.loads(job["input"])
    items, errors = [], {}
    for site in req.get("sites") or list(SEARCH):
        try:
            items += SEARCH[site](req["q"], int(req.get("limit", 10)))
        except Exception as e:
            errors[site] = str(e)[:200]
    if not items and errors:
        raise RuntimeError("; ".join("%s: %s" % kv for kv in errors.items()))
    return {"items": items, "errors": errors}


def work_loop(kind, handler):
    sb("PATCH", "?status=eq.running&kind=eq." + kind, {"status": "queued"})  # 재시작 시 중단된 작업 복구
    while True:
        try:
            jobs = sb("GET", "?status=eq.queued&kind=eq.%s&order=created_at.asc&limit=1" % kind)
            if not jobs:
                time.sleep(5)
                continue
            job = jobs[0]
            if not sb("PATCH", "?id=eq.%s&status=eq.queued" % job["id"], {"status": "running"}):
                continue
            try:
                patch(job["id"], status="done", result=handler(job), error=None)
            except Exception as e:  # 한 작업 실패가 워커를 멈추면 안 됨
                patch(job["id"], status="error", error=str(e)[:500])
        except Exception as e:
            print("loop error:", e, file=sys.stderr)
            time.sleep(10)


class Files(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(u.query)
        signed = u.path.startswith("/dl/")
        name = urllib.parse.unquote(u.path).removeprefix("/dl/" if signed else "/files/")
        if signed:  # 서명 링크: sig = HMAC-SHA256(TOKEN, "<name>.<exp>"), exp = unix초
            exp, sig = q.get("exp", [""])[0], q.get("sig", [""])[0]
            good = hmac.new(TOKEN.encode(), f"{name}.{exp}".encode(), hashlib.sha256).hexdigest()
            if not exp.isdigit() or int(exp) < time.time() or not hmac.compare_digest(sig, good):
                self.send_error(403)
                return
        elif self.headers.get("X-Worker-Token") != TOKEN:
            self.send_error(403)
            return
        path = os.path.join(VIDEO_DIR, name)
        if "/" in name or ".." in name or not os.path.isfile(path):
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "video/mp4" if name.endswith(".mp4") else "application/octet-stream")
        self.send_header("Content-Length", str(os.path.getsize(path)))
        if signed:
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(name))
        self.end_headers()
        with open(path, "rb") as f:
            while chunk := f.read(1 << 20):
                self.wfile.write(chunk)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    threading.Thread(target=lambda: ThreadingHTTPServer((BIND, PORT), Files).serve_forever(), daemon=True).start()
    threading.Thread(target=work_loop, args=("search", search), daemon=True).start()
    work_loop("download", download)
