from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from transformers import pipeline, MarianMTModel, MarianTokenizer
from deep_translator import GoogleTranslator
import tempfile
import os

app = FastAPI()

# Allow cross-origin requests from any origin.
# We use allow_origins=["*"] and also manually handle OPTIONS (preflight)
# because Cloudflare Tunnel can intercept OPTIONS before FastAPI responds.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Explicit OPTIONS handler to handle Cloudflare preflight interception
@app.options("/{rest_of_path:path}")
async def preflight_handler(request: Request, rest_of_path: str):
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )

# ─── Whisper (Speech → Igbo text) ───────────────────────────────────────────

WHISPER_MODEL = "abasseyfresh/whisper-large-v3-igbo"

print("Loading Whisper model...")
test_mode = os.getenv("TEST_MODE", "false").lower() == "true"
if test_mode:
    print("TEST_MODE enabled. Using dummy models for instant startup.")

    class DummyWhisperPipe:
        def __call__(self, audio_path, **kwargs):
            return {"text": "Nke a bụ ule ederede! (This is a test transcription from the mock backend)"}

    pipe = DummyWhisperPipe()
else:
    pipe = pipeline("automatic-speech-recognition", model=WHISPER_MODEL)
print("Whisper model loaded.")

# ─── MarianMT (Igbo text → English text) ─────────────────────────────────────

MARIAN_MODEL = os.getenv("MARIAN_MODEL_PATH", "Cherryland120/igbo-mt-finetuned")

print(f"Loading MarianMT model from: {MARIAN_MODEL}...")
try:
    marian_tokenizer = MarianTokenizer.from_pretrained(MARIAN_MODEL)
    marian_model = MarianMTModel.from_pretrained(MARIAN_MODEL)
    print("MarianMT model loaded.")
except Exception as e:
    print(f"Warning: MarianMT model failed to load: {e}")
    marian_tokenizer = None
    marian_model = None


def translate_igbo_to_english(igbo_text: str, engine: str = "custom") -> str:
    """Translate Igbo text to English using the selected engine."""
    if engine == "google":
        try:
            translator = GoogleTranslator(source="ig", target="en")
            return translator.translate(igbo_text) or igbo_text
        except Exception as e:
            print(f"Google Translate error: {e}. Falling back to custom model.")

    # Custom MarianMT model (default)
    if marian_model and marian_tokenizer:
        try:
            inputs = marian_tokenizer(igbo_text, return_tensors="pt", padding=True)
            translated = marian_model.generate(**inputs)
            return marian_tokenizer.batch_decode(translated, skip_special_tokens=True)[0]
        except Exception as e:
            print(f"MarianMT error: {e}.")
            return igbo_text

    return igbo_text  # fallback: return source text unchanged


# ─── Existing endpoints ───────────────────────────────────────────────────────

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribes Igbo audio to Igbo text."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        temp_audio.write(await file.read())
        temp_audio_path = temp_audio.name

    try:
        result = pipe(temp_audio_path)
        return {"text": result.get("text", "")}
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
        result = pipe(temp_audio_path, generate_kwargs={"task": "translate"})
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
        result = pipe(tmp_path)
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
):
    """
    Live mode — transcribe + translate.
    Accepts a ~4s audio chunk.
    Step 1: Whisper transcribes → Igbo text.
    Step 2: MarianMT (default) or Google Translate → English text.
    Returns { igbo_text, english_text, chunk_id, engine }.
    """
    suffix = ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # Step 1: Whisper transcription
        result = pipe(tmp_path)
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
        "whisper_loaded": not isinstance(pipe, type(None)),
        "marian_loaded": marian_model is not None,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
