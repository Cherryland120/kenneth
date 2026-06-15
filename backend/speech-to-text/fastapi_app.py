from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware
from deep_translator import GoogleTranslator
import tempfile
import os

app = FastAPI()

# ── CORS Middleware ───────────────────────────────────────────────────────────
# Using a raw BaseHTTPMiddleware instead of CORSMiddleware because proxies like 
# Cloudflare Tunnel intercept OPTIONS preflight requests and return a response
# before it ever reaches CORSMiddleware or route handlers. This middleware
# injects Access-Control headers into EVERY response at the lowest level.
class CORSMiddlewareCustom(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Handle preflight OPTIONS immediately
        if request.method == "OPTIONS":
            return Response(
                status_code=204,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Max-Age": "86400",
                },
            )
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

app.add_middleware(CORSMiddlewareCustom)

# ─── Whisper (Speech → Igbo text via HF Endpoint) ───────────────────────────
import httpx
import os

HF_ENDPOINT_URL = os.getenv("HF_ENDPOINT_URL", "https://i3ak233pko6dch3x.eu-west-1.aws.endpoints.huggingface.cloud")
HF_TOKEN = os.getenv("HF_TOKEN", "")

print(f"Routing Whisper requests to HF Endpoint: {HF_ENDPOINT_URL}")

async def query_hf_endpoint(audio_path: str, task: str = "transcribe") -> dict:
    if not HF_TOKEN:
        print("WARNING: HF_TOKEN is not set. Inference will likely fail unless the endpoint is public.")
    
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "audio/wav"
    }
    
    # We can pass parameters like task via X-Amzn-SageMaker-Custom-Attributes or HF custom headers, 
    # but Whisper v3 typically auto-detects. We'll rely on default transcription.
    with open(audio_path, "rb") as f:
        data = f.read()
        
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(HF_ENDPOINT_URL, headers=headers, content=data)
        response.raise_for_status()
        return response.json()

# ─── Google Speech-to-Text (Backup Engine) ──────────────────────────────────
import speech_recognition as sr
from pydub import AudioSegment

def transcribe_google_stt(audio_path: str) -> str:
    """Fallback STT engine using Google's Web Speech API."""
    print("Using Google Speech Recognition as backup...")
    wav_path = audio_path + ".wav"
    try:
        audio = AudioSegment.from_file(audio_path)
        audio.export(wav_path, format="wav")
        
        r = sr.Recognizer()
        with sr.AudioFile(wav_path) as source:
            audio_data = r.record(source)
        return r.recognize_google(audio_data, language="ig-NG")
    except sr.UnknownValueError:
        print("Google STT could not understand audio")
        return ""
    except Exception as e:
        print(f"Google STT error: {e}")
        return ""
    finally:
        if os.path.exists(wav_path):
            os.unlink(wav_path)


# ─── Translation helper for live-translate ──────────────────────────────────
def translate_igbo_to_english(igbo_text: str, engine: str = "google") -> str:
    """Translate Igbo text to English using Google Translator."""
    try:
        translator = GoogleTranslator(source="ig", target="en")
        return translator.translate(igbo_text) or igbo_text
    except Exception as e:
        print(f"Google Translate error: {e}.")
        return igbo_text


# ─── Existing endpoints ───────────────────────────────────────────────────────

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...), engine: str = Form("custom")):
    """Transcribes Igbo audio to Igbo text."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        temp_audio.write(await file.read())
        temp_audio_path = temp_audio.name

    try:
        if engine == "google":
            text = transcribe_google_stt(temp_audio_path)
        else:
            result = await query_hf_endpoint(temp_audio_path)
            text = result.get("text", "")
        return {"text": text}
    except Exception as e:
        print(f"Error: {e}")
        return {"error": "Failed to transcribe audio."}
    finally:
        if os.path.exists(temp_audio_path):
            os.unlink(temp_audio_path)


@app.post("/api/translate")
async def translate_audio(file: UploadFile = File(...)):
    """Translates Igbo audio directly to English text."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        temp_audio.write(await file.read())
        temp_audio_path = temp_audio.name

    try:
        result = await query_hf_endpoint(temp_audio_path, task="translate")
        return {"text": result.get("text", "")}
    except Exception as e:
        print(f"Error: {e}")
        return {"error": "Failed to translate audio."}
    finally:
        if os.path.exists(temp_audio_path):
            os.unlink(temp_audio_path)


# ─── NEW: Live translation endpoints ─────────────────────────────────────────

@app.post("/api/live-transcribe")
async def live_transcribe(
    file: UploadFile = File(...),
    chunk_id: int = Form(0),
    engine: str = Form("custom"),
):
    """
    Live mode — transcribe only.
    Accepts a ~4s audio chunk, returns Igbo transcription text.
    """
    suffix = ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        if engine == "google":
            igbo_text = transcribe_google_stt(tmp_path).strip()
        else:
            result = await query_hf_endpoint(tmp_path)
            igbo_text = (result.get("text") or "").strip()
        return {"igbo_text": igbo_text, "chunk_id": chunk_id}
    except Exception as e:
        print(f"live_transcribe error (chunk {chunk_id}): {e}")
        return {"error": str(e), "chunk_id": chunk_id}
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/api/live-translate")
async def live_translate(
    file: UploadFile = File(...),
    chunk_id: int = Form(0),
    engine: str = Form("custom"),  # "custom" (MarianMT) or "google"
    stt_engine: str = Form("custom"),  # "custom" (Whisper) or "google"
):
    """
    Live mode — transcribe + translate.
    Accepts a ~4s audio chunk.
    Step 1: STT Engine (Whisper/Google) transcribes → Igbo text.
    Step 2: Translation Engine (MarianMT/Google) → English text.
    Returns { igbo_text, english_text, chunk_id, engine }.
    """
    suffix = ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # Step 1: Transcription
        if stt_engine == "google":
            igbo_text = transcribe_google_stt(tmp_path).strip()
        else:
            result = await query_hf_endpoint(tmp_path)
            igbo_text = (result.get("text") or "").strip()

        if not igbo_text:
            return {
                "igbo_text": "",
                "english_text": "",
                "chunk_id": chunk_id,
                "engine": engine,
                "note": "No speech detected in this chunk.",
            }

        # Step 2: Translation
        english_text = translate_igbo_to_english(igbo_text, engine=engine)

        return {
            "igbo_text": igbo_text,
            "english_text": english_text,
            "chunk_id": chunk_id,
            "engine": engine,
        }

    except Exception as e:
        print(f"live_translate error (chunk {chunk_id}): {e}")
        return {"error": str(e), "chunk_id": chunk_id}
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "whisper_endpoint": HF_ENDPOINT_URL,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
