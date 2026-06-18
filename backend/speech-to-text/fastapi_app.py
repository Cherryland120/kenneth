from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.cors import CORSMiddleware
from deep_translator import GoogleTranslator
import tempfile
import os

app = FastAPI()

# ── Startup diagnostics ───────────────────────────────────────────────────────
print("=== Speech-to-Text Service Starting ===")
print(f"PORT: {os.environ.get('PORT', '8000 (default)')}")
print(f"HF_TOKEN set: {'yes' if os.environ.get('HF_TOKEN') else 'NO — inference will fail!'}")
print(f"HF_ENDPOINT_URL: {os.environ.get('HF_ENDPOINT_URL', '(using hardcoded default)')}")

# ── DeepFilterNet (Audio Purification) ─────────────────────────────────────────
try:
    from df.enhance import enhance, init_df, load_audio, save_audio
    print("Loading DeepFilterNet model...")
    df_model, df_state, _ = init_df()
    print("DeepFilterNet model loaded.")
except ImportError:
    print("deepfilternet not installed. Audio purification will be disabled.")
    df_model, df_state = None, None
except Exception as e:
    print(f"Failed to load DeepFilterNet: {e}")
    df_model, df_state = None, None

def convert_to_wav(input_path: str) -> str:
    """
    Convert any audio file (webm, mp4, ogg, etc.) to a proper WAV file
    that DeepFilterNet and Google STT can read.
    Returns the path to the new WAV file (caller must delete it).
    """
    from pydub import AudioSegment
    try:
        audio = AudioSegment.from_file(input_path)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            wav_path = tmp.name
        audio.export(wav_path, format="wav")
        return wav_path
    except Exception as e:
        print(f"Audio conversion error: {e} — using original file")
        return input_path


def purify_audio(audio_path: str) -> str:
    """Purifies audio using DeepFilterNet to remove noise."""
    if df_model is None or df_state is None:
        return audio_path
    try:
        print(f"Purifying audio: {audio_path}")
        audio, _ = load_audio(audio_path, sr=df_state.sr())
        enhanced = enhance(df_model, df_state, audio)
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            enhanced_path = tmp.name
            
        save_audio(enhanced_path, enhanced, df_state.sr())
        return enhanced_path
    except Exception as e:
        print(f"Purification error: {e}")
        return audio_path

# ── CORS Middleware ───────────────────────────────────────────────────────────
# NOTE: You cannot use allow_origins=["*"] with allow_credentials=True.
# Browsers block this combination. Use explicit origins instead.
ALLOWED_ORIGINS = [
    "https://kenneth-ten.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        
    print(f"Calling HF Endpoint: {HF_ENDPOINT_URL}")
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(HF_ENDPOINT_URL, headers=headers, content=data)
            if response.status_code != 200:
                print(f"HF Endpoint error {response.status_code}: {response.text}")
            response.raise_for_status()
            result = response.json()
            print(f"HF Endpoint success: {result}")
            return result
        except Exception as e:
            print(f"HF Endpoint request failed: {e}")
            raise

# ─── Google Speech-to-Text (Backup Engine) ──────────────────────────────────
import speech_recognition as sr
from pydub import AudioSegment

def transcribe_google_stt(audio_path: str, language: str = "ig-NG") -> str:
    """Fallback STT engine using Google's Web Speech API."""
    print(f"Using Google Speech Recognition as backup ({language})...")
    wav_path = audio_path + ".wav"
    try:
        audio = AudioSegment.from_file(audio_path)
        audio.export(wav_path, format="wav")
        
        r = sr.Recognizer()
        with sr.AudioFile(wav_path) as source:
            audio_data = r.record(source)
        return r.recognize_google(audio_data, language=language)
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
async def transcribe_audio(file: UploadFile = File(...), engine: str = Form("custom"), language: str = Form("ig-NG")):
    """Transcribes audio to text."""
    # Save with .webm so pydub can detect the format correctly
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
        temp_audio.write(await file.read())
        raw_path = temp_audio.name

    wav_path = None
    try:
        # Convert to real WAV before DeepFilterNet / Whisper / Google STT
        wav_path = convert_to_wav(raw_path)
        os.unlink(raw_path)

        enhanced_path = purify_audio(wav_path)
        if enhanced_path != wav_path:
            os.unlink(wav_path)
            wav_path = enhanced_path

        if engine == "google":
            text = transcribe_google_stt(wav_path, language=language)
        else:
            result = await query_hf_endpoint(wav_path)
            text = result.get("text", "")
        return {"text": text}
    except Exception as e:
        print(f"Error: {e}")
        return {"error": "Failed to transcribe audio."}
    finally:
        for p in [raw_path, wav_path]:
            if p and os.path.exists(p):
                os.unlink(p)


@app.post("/api/translate")
async def translate_audio(file: UploadFile = File(...)):
    """Translates Igbo audio directly to English text."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        temp_audio.write(await file.read())
        temp_audio_path = temp_audio.name

    try:
        enhanced_path = purify_audio(temp_audio_path)
        if enhanced_path != temp_audio_path:
            os.unlink(temp_audio_path)
            temp_audio_path = enhanced_path

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
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await file.read())
        raw_path = tmp.name

    wav_path = None
    try:
        wav_path = convert_to_wav(raw_path)
        os.unlink(raw_path)

        enhanced_path = purify_audio(wav_path)
        if enhanced_path != wav_path:
            os.unlink(wav_path)
            wav_path = enhanced_path

        if engine == "google":
            igbo_text = transcribe_google_stt(wav_path).strip()
        else:
            result = await query_hf_endpoint(wav_path)
            igbo_text = (result.get("text") or "").strip()
        return {"igbo_text": igbo_text, "chunk_id": chunk_id}
    except Exception as e:
        print(f"live_transcribe error (chunk {chunk_id}): {e}")
        return {"error": str(e), "chunk_id": chunk_id}
    finally:
        for p in [raw_path, wav_path]:
            if p and os.path.exists(p):
                os.unlink(p)


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
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await file.read())
        raw_path = tmp.name

    wav_path = None
    try:
        wav_path = convert_to_wav(raw_path)
        os.unlink(raw_path)

        enhanced_path = purify_audio(wav_path)
        if enhanced_path != wav_path:
            os.unlink(wav_path)
            wav_path = enhanced_path

        # Step 1: Transcription
        if stt_engine == "google":
            igbo_text = transcribe_google_stt(wav_path).strip()
        else:
            result = await query_hf_endpoint(wav_path)
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
        for p in [raw_path, wav_path]:
            if p and os.path.exists(p):
                os.unlink(p)


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
