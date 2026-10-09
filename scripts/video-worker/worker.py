#!/usr/bin/env python3
"""hy64 영상 수집 워커: Supabase bossai_video_jobs 큐를 폴링해 yt-dlp로 받고, 파일을 내부 HTTP로 서빙.

env(필수): SUPABASE_URL, SUPABASE_SERVICE_KEY, WORKER_TOKEN
env(선택): VIDEO_DIR, COOKIES_DIR, BIND(기본 172.17.0.1 = docker 브리지, 외부 비노출), PORT(58100), YTDLP
쿠키: COOKIES_DIR/<도메인>.txt (예: douyin.com.txt) — URL에 그 도메인이 있으면 --cookies 로 사용.
"""
import json, os, subprocess, sys, threading, time, urllib.request, urllib.parse
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


def work_loop():
    sb("PATCH", "?status=eq.running&kind=eq.download", {"status": "queued"})  # 재시작 시 중단된 작업 복구
    while True:
        try:
            jobs = sb("GET", "?status=eq.queued&kind=eq.download&order=created_at.asc&limit=1")
            if not jobs:
                time.sleep(5)
                continue
            job = jobs[0]
            if not sb("PATCH", "?id=eq.%s&status=eq.queued" % job["id"], {"status": "running"}):
                continue
            try:
                patch(job["id"], status="done", result=download(job), error=None)
            except Exception as e:  # 한 작업 실패가 워커를 멈추면 안 됨
                patch(job["id"], status="error", error=str(e)[:500])
        except Exception as e:
            print("loop error:", e, file=sys.stderr)
            time.sleep(10)


class Files(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get("X-Worker-Token") != TOKEN:
            self.send_error(403)
            return
        name = urllib.parse.unquote(self.path.split("?")[0]).removeprefix("/files/")
        path = os.path.join(VIDEO_DIR, name)
        if "/" in name or ".." in name or not os.path.isfile(path):
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "video/mp4" if name.endswith(".mp4") else "application/octet-stream")
        self.send_header("Content-Length", str(os.path.getsize(path)))
        self.end_headers()
        with open(path, "rb") as f:
            while chunk := f.read(1 << 20):
                self.wfile.write(chunk)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    threading.Thread(target=lambda: ThreadingHTTPServer((BIND, PORT), Files).serve_forever(), daemon=True).start()
    work_loop()
