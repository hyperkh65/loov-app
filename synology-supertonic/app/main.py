import os, base64, io, tempfile
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
import soundfile as sf

app = FastAPI()

API_SECRET = os.environ.get("API_SECRET", "")

# 지연 초기화 (첫 요청 시 모델 다운로드)
_tts = None

def get_tts():
    global _tts
    if _tts is None:
        from supertonic import TTS
        _tts = TTS(auto_download=True)
    return _tts

VOICES = [
    { "id": "F1", "name": "F1 · 여성 · 차분" },
    { "id": "F2", "name": "F2 · 여성 · 밝음" },
    { "id": "F3", "name": "F3 · 여성 · 감성적" },
    { "id": "F4", "name": "F4 · 여성 · 전문적" },
    { "id": "F5", "name": "F5 · 여성 · 활기찬" },
    { "id": "M1", "name": "M1 · 남성 · 차분" },
    { "id": "M2", "name": "M2 · 남성 · 밝음" },
    { "id": "M3", "name": "M3 · 남성 · 내레이션" },
    { "id": "M4", "name": "M4 · 남성 · 전문적" },
    { "id": "M5", "name": "M5 · 남성 · 활기찬" },
]

def check_auth(request: Request):
    if not API_SECRET:
        return
    auth = request.headers.get("X-API-Secret", "")
    if auth != API_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/voices")
async def get_voices():
    return {"voices": VOICES}

@app.post("/tts")
async def tts(request: Request):
    check_auth(request)
    body = await request.json()

    text  = body.get("text", "").strip()
    voice = body.get("voice", "F3")
    lang  = body.get("lang", "ko")
    speed = float(body.get("speed", 1.05))

    if not text:
        raise HTTPException(status_code=400, detail="텍스트가 없습니다.")

    tts_engine = get_tts()
    style = tts_engine.get_voice_style(voice_name=voice)
    wav, duration = tts_engine.synthesize(text, voice_style=style, lang=lang, speed=speed)

    # numpy array → WAV bytes → base64
    buf = io.BytesIO()
    sf.write(buf, wav, samplerate=24000, format="WAV", subtype="PCM_16")
    audio_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return JSONResponse({
        "audio":    f"data:audio/wav;base64,{audio_b64}",
        "duration": int(duration * 1000),  # ms
        "voice":    voice,
    })
