import os
import re
import httpx
from fastapi import FastAPI, Query, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET = os.getenv("YARN_SCRAPER_SECRET", "")
ZENROWS_KEY = os.getenv("ZENROWS_API_KEY", "")
ZENROWS_URL = "https://api.zenrows.com/v1/"


def check_secret(x_secret: Optional[str]):
    if SECRET and x_secret != SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── ZenRows로 JSON API 호출 (JS 렌더링 없이, CF bypass만) ─────────────────
async def fetch_via_zenrows_json(url: str) -> tuple[int, str]:
    if not ZENROWS_KEY:
        return 503, ""
    params = {
        "apikey": ZENROWS_KEY,
        "url": url,
        "premium_proxy": "true",
        "custom_headers": "true",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(ZENROWS_URL, params=params, headers={
            "Accept": "application/json",
            "Referer": "https://yarn.co/",
        })
    return res.status_code, res.text


# ── ZenRows 긴 대기 (JS 검색 렌더링 대기) ────────────────────────────────
async def fetch_via_zenrows_long_wait(url: str, wait_ms: int = 8000) -> tuple[int, str]:
    if not ZENROWS_KEY:
        return 503, ""
    params = {
        "apikey": ZENROWS_KEY,
        "url": url,
        "js_render": "true",
        "premium_proxy": "true",
        "wait": str(wait_ms),
    }
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.get(ZENROWS_URL, params=params)
    return res.status_code, res.text


# ── ZenRows로 yarn.co 페이지 가져오기 ────────────────────────────────────
async def fetch_via_zenrows(url: str) -> tuple[int, str]:
    if not ZENROWS_KEY:
        return 503, ""
    params = {
        "apikey": ZENROWS_KEY,
        "url": url,
        "js_render": "true",
        "premium_proxy": "true",
        "wait": "3000",       # JS 렌더링 대기 3초
    }
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.get(ZENROWS_URL, params=params)
    return res.status_code, res.text


# ── yarn.co Nuxt 클립 파서 (mp4 URL 기반) ────────────────────────────────
def unescape_nuxt(s: str) -> str:
    return (s.replace("\\u002F", "/")
             .replace('\\"', '"')
             .replace("\\\\", "\\")
             .replace("\\n", " ")
             .replace("\\'", "'"))


def parse_clips_from_args(html: str, query: str = "") -> list:
    """
    ARGS 섹션에서 직접 파싱:
    패턴: "UUID","transcript text","https:\\u002F\\u002Fy.yarn.co\\u002FUUID_thumb.jpg"
    """
    query_lower = query.lower()
    clips = []
    seen = set()

    # UUID 바로 뒤에 transcript가 오고, 그 뒤에 같은 UUID의 thumb URL이 오는 패턴
    pattern = re.compile(
        r'"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})"'
        r'(?:,\s*"([^"\\]{0,300}(?:\\.[^"\\]{0,300})*)")+'  # 중간 텍스트들
        r'(?:.*?)'
        r'"https:\\u002F\\u002Fy\.yarn\.co\\u002F\1_thumb\.jpg"',
        re.DOTALL
    )

    # 더 단순한 직접 매칭: UUID → 텍스트 → 같은 UUID가 포함된 thumb URL
    # thumb URL 패턴으로 UUID 찾기
    thumb_re = re.compile(
        r'"https:\\u002F\\u002Fy\.yarn\.co\\u002F'
        r'([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})'
        r'_thumb\.jpg"'
    )

    for thumb_m in thumb_re.finditer(html):
        uuid = thumb_m.group(1)
        if uuid in seen:
            continue

        # thumb URL 이전 300자에서 UUID와 transcript 찾기
        start = max(0, thumb_m.start() - 400)
        before = html[start:thumb_m.start()]

        # UUID가 이 앞에 있는지 확인
        if f'"{uuid}"' not in before:
            continue

        seen.add(uuid)

        # UUID와 thumb URL 사이의 문자열들에서 transcript 추출
        uuid_pos = before.rfind(f'"{uuid}"')
        between = before[uuid_pos + len(uuid) + 2:]  # UUID 따옴표 이후

        # 따옴표로 둘러싸인 텍스트들 추출
        strings = re.findall(r'"((?:[^"\\]|\\.){2,200})"', between)
        transcript = ""
        show = ""
        for s in strings:
            s_clean = unescape_nuxt(s)
            # URL이나 UUID가 아닌 텍스트만
            if not s_clean.startswith("http") and "-" * 3 not in s_clean and len(s_clean) > 3:
                if not transcript:
                    transcript = s_clean
                elif not show and not any(c.isdigit() for c in s_clean[:5]):
                    show = s_clean
                    break

        if not transcript:
            continue
        if query and query_lower not in transcript.lower():
            continue

        clips.append({
            "id": uuid,
            "text": transcript,
            "videoUrl": f"https://y.yarn.co/{uuid}.mp4",
            "thumbnailUrl": f"https://y.yarn.co/{uuid}_thumb.jpg",
            "show": show,
            "platform": "yarn",
        })

    return clips


def parse_nuxt_clips(html: str, query: str = "") -> list:
    return parse_clips_from_args(html, query)


def parse_clips_from_dom(html: str) -> list:
    """
    렌더된 DOM에서 /yarn-clip/UUID 링크 파싱.
    구조: href="/yarn-clip/UUID" + class="transcript">TEXT + class="title">SHOW
    """
    clips = []
    seen = set()

    # yarn.co 실제 링크 패턴: /yarn-clip/UUID
    link_re = re.compile(
        r'href=["\']?/yarn-clip/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})["\']?'
    )

    for m in link_re.finditer(html):
        uuid = m.group(1)
        if uuid in seen:
            continue
        seen.add(uuid)

        # 앞뒤 1500자 컨텍스트
        start = max(0, m.start() - 800)
        end = min(len(html), m.end() + 800)
        context = html[start:end]

        # class="transcript" 내 텍스트
        transcript_m = re.search(r'class="[^"]*transcript[^"]*"[^>]*>([^<]{2,300})<', context)
        transcript = transcript_m.group(1).strip() if transcript_m else ""

        # class="title" 내 텍스트 (쇼 이름)
        title_m = re.search(r'class="[^"]*title[^"]*"[^>]*>([^<]{2,100})<', context)
        show = title_m.group(1).strip() if title_m else ""

        if not transcript:
            continue

        clips.append({
            "id": uuid,
            "text": transcript,
            "videoUrl": f"https://y.yarn.co/{uuid}.mp4",
            "thumbnailUrl": f"https://y.yarn.co/{uuid}_thumb.jpg",
            "show": show,
            "platform": "yarn",
        })

    return clips


# ── 검색 ──────────────────────────────────────────────────────────────────
@app.get("/search")
async def search(
    q: str = Query(...),
    limit: int = 30,
    x_secret: Optional[str] = Header(None),
):
    check_secret(x_secret)
    try:
        import json as jsonlib
        if not ZENROWS_KEY:
            return {"clips": [], "error": "ZENROWS_API_KEY not set", "query": q}

        # input.new-textbox 셀렉터로 검색 입력 → Enter → 결과 대기
        instructions = jsonlib.dumps([
            {"type": "wait", "milliseconds": 2000},
            {"type": "click", "selector": "input.new-textbox"},
            {"type": "fill", "selector": "input.new-textbox", "value": q},
            {"type": "click", "selector": "button[name='btnSearch']"},
            {"type": "wait", "milliseconds": 7000},
        ])
        params = {
            "apikey": ZENROWS_KEY,
            "url": "https://yarn.co/",
            "js_render": "true",
            "premium_proxy": "true",
            "js_instructions": instructions,
        }
        async with httpx.AsyncClient(timeout=40) as client:
            res = await client.get(ZENROWS_URL, params=params)
        status, html = res.status_code, res.text
        import logging
        logging.warning(f"[ZR] status={status} html_len={len(html)}")

        if status != 200 or not html:
            return {"clips": [], "error": f"ZenRows 오류 (status={status})", "query": q}

        # 1순위: 렌더된 DOM에서 /yarn-clip/UUID 링크 파싱
        dom_clips_all = parse_clips_from_dom(html)
        q_lower = q.lower()
        # 검색어 포함 클립 우선, 없으면 전체 반환
        dom_clips_filtered = [c for c in dom_clips_all if q_lower in c["text"].lower()]
        dom_clips = dom_clips_filtered or dom_clips_all

        # 2순위: NUXT ARGS 파싱 (SSR 데이터)
        args_clips_with_q = parse_nuxt_clips(html, q)
        args_clips_all = parse_nuxt_clips(html, "")

        yarn_links_count = len(re.findall(r'href=["\']?/yarn-clip/', html))
        print(f"[SEARCH] q={q!r} html_len={len(html)} dom_all={len(dom_clips_all)} "
              f"dom_filtered={len(dom_clips_filtered)} args_q={len(args_clips_with_q)} "
              f"yarn_links={yarn_links_count}")

        clips = dom_clips or args_clips_with_q or args_clips_all

        return {
            "clips": clips[:limit],
            "total": len(clips),
            "query": q,
            "source": "yarn.co",
            "_debug": {
                "dom_clips": len(dom_clips),
                "args_with_q": len(args_clips_with_q),
                "args_all": len(args_clips_all),
                "yarn_links": yarn_links_count,
                "html_len": len(html),
            },
        }
    except Exception as e:
        return {"clips": [], "error": str(e), "query": q}


# ── 비디오/이미지 프록시 (ZenRows premium_proxy로 CF 우회) ───────────────
@app.get("/proxy")
async def proxy(
    url: str = Query(...),
    x_secret: Optional[str] = Header(None),
    range_header: Optional[str] = Header(None, alias="range"),
):
    check_secret(x_secret)

    if not (url.startswith("https://y.yarn.co/") or url.startswith("http://y.yarn.co/")):
        raise HTTPException(status_code=400, detail="Invalid URL")

    if not ZENROWS_KEY:
        raise HTTPException(status_code=503, detail="ZENROWS_API_KEY not set")

    try:
        params = {
            "apikey": ZENROWS_KEY,
            "url": url,
            "premium_proxy": "true",
        }

        async with httpx.AsyncClient(timeout=40) as client:
            res = await client.get(ZENROWS_URL, params=params)

        if res.status_code not in (200, 206):
            raise HTTPException(status_code=res.status_code, detail=f"ZenRows proxy error: {res.status_code} body={res.text[:200]}")

        # 파일 확장자로 Content-Type 결정
        if url.endswith(".mp4"):
            content_type = "video/mp4"
        elif url.endswith(".jpg") or url.endswith(".jpeg"):
            content_type = "image/jpeg"
        else:
            content_type = res.headers.get("content-type", "application/octet-stream")

        resp_headers = {
            "Content-Type": content_type,
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
            "Accept-Ranges": "bytes",
        }
        for h in ["content-length", "content-range"]:
            if h in res.headers:
                resp_headers[h.title()] = res.headers[h]

        return StreamingResponse(
            iter([res.content]),
            status_code=res.status_code,
            headers=resp_headers,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 디버그 ────────────────────────────────────────────────────────────────
@app.get("/debug")
async def debug(
    q: str = Query("I love you"),
    x_secret: Optional[str] = Header(None),
):
    check_secret(x_secret)
    try:
        status, html = await fetch_via_zenrows_long_wait(f"https://yarn.co/?q={q}", wait_ms=8000)

        # 렌더된 DOM에서 /video/ 링크와 주변 텍스트 추출
        video_links = re.findall(r'href="/video/([a-f0-9-]{36})"', html)

        # 클립 카드 HTML 패턴 (렌더된 DOM)
        card_patterns = re.findall(r'<[^>]+class="[^"]*clip[^"]*"[^>]*>([\s\S]{0,500}?)</[^>]+>', html)[:5]

        # transcript 텍스트가 있는 p, span, div 태그 샘플
        text_tags = re.findall(r'<(?:p|span|div)[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]{0,200}?)</(?:p|span|div)>', html)[:5]

        # SSR nuxt 클립 수
        nuxt_clips = parse_nuxt_clips(html, "")

        return {
            "status": status,
            "html_length": len(html),
            "nuxt_clips_total": len(nuxt_clips),
            "dom_video_uuids": video_links[:10],
            "dom_clip_cards": card_patterns[:3],
            "dom_transcript_tags": text_tags[:5],
            "body_snippet": html[-3000:-2000],  # 페이지 끝부분 (렌더된 콘텐츠)
        }
    except Exception as e:
        return {"error": str(e)}


# ── 헬스체크 ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "zenrows": bool(ZENROWS_KEY)}
