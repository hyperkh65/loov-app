import os, base64, asyncio, tempfile
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import edge_tts

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BGM_DIR = os.path.join(os.path.dirname(__file__), "bgm")
if os.path.isdir(BGM_DIR):
    app.mount("/bgm", StaticFiles(directory=BGM_DIR), name="bgm")

API_SECRET = os.environ.get("API_SECRET", "")

VOICES = [
    {"id": "ko-KR-SunHiNeural",    "name": "선희 · 여성 · 밝고 친근"},
    {"id": "ko-KR-InJoonNeural",   "name": "인준 · 남성 · 따뜻하고 친근"},
    {"id": "ko-KR-JiMinNeural",    "name": "지민 · 여성 · 부드럽"},
    {"id": "ko-KR-BongJinNeural",  "name": "봉진 · 남성 · 차분·전문적"},
    {"id": "ko-KR-GookMinNeural",  "name": "국민 · 남성 · 젊고 활기찬"},
    {"id": "ko-KR-HyunsuNeural",   "name": "현수 · 남성 · 내레이션"},
    {"id": "ko-KR-SeoHyeonNeural", "name": "서현 · 여성 · 어린이"},
    {"id": "ko-KR-YuJinNeural",    "name": "유진 · 여성 · 감성적"},
]

def check_auth(request: Request):
    if not API_SECRET:
        return
    auth = request.headers.get("X-API-Secret", "")
    if auth != API_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.get("/voices")
async def get_voices():
    return {"voices": VOICES}

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/tts")
async def tts(request: Request):
    check_auth(request)
    body = await request.json()

    text     = body.get("text", "").strip()
    voice    = body.get("voice", "ko-KR-SunHiNeural")
    rate     = body.get("rate", 0)    # % (-50 ~ +100)
    pitch    = body.get("pitch", 0)   # Hz (-50 ~ +50)

    if not text:
        raise HTTPException(status_code=400, detail="텍스트가 없습니다.")

    rate_str  = f"+{rate}%" if rate >= 0 else f"{rate}%"
    pitch_str = f"+{pitch}Hz" if pitch >= 0 else f"{pitch}Hz"

    # edge-tts로 음성 생성
    communicate = edge_tts.Communicate(text, voice, rate=rate_str, pitch=pitch_str)

    audio_chunks = []
    words = []

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_chunks.append(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            words.append({
                "word":  chunk["text"],
                "start": chunk["offset"] // 10000,       # 100ns → ms
                "end":   (chunk["offset"] + chunk["duration"]) // 10000,
            })

    if not audio_chunks:
        raise HTTPException(status_code=500, detail="오디오 생성 실패")

    audio_bytes = b"".join(audio_chunks)
    audio_b64   = base64.b64encode(audio_bytes).decode("utf-8")
    duration    = words[-1]["end"] if words else 0

    return JSONResponse({
        "audio":    f"data:audio/mpeg;base64,{audio_b64}",
        "words":    words,
        "duration": duration,
        "voice":    voice,
    })
