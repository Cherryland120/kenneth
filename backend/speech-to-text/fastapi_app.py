from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from transformers import pipeline, AutoTokenizer
import tempfile
import os

app = FastAPI()

# Allow cross-origin requests from the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_NAME = "abasseyfresh/whisper-large-v3-igbo"

print("Loading Whisper model...")
test_mode = os.getenv("TEST_MODE", "false").lower() == "true"
if test_mode:
    print("TEST_MODE enabled. Using a dummy model for instant startup.")
    class DummyPipe:
        def __call__(self, audio_path, **kwargs):
            return {"text": "Nke a bụ ule ederede! (This is a test transcription from the mock backend)"}
    pipe = DummyPipe()
else:
    # Use use_fast=False to load the slow Python tokenizer.
    # The fast (Rust) tokenizer for this model uses a newer tokenizer.json format
    # that is incompatible with the tokenizers version pinned by transformers==4.41.2.
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, use_fast=False)
    pipe = pipeline("automatic-speech-recognition", model=MODEL_NAME, tokenizer=tokenizer)
print("Model loaded successfully.")

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribes Igbo audio to Igbo text."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        temp_audio.write(await file.read())
        temp_audio_path = temp_audio.name
        
    try:
        # Run inference for transcription
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
        # Pass task="translate" to force translation output
        result = pipe(temp_audio_path, generate_kwargs={"task": "translate"})
        return {"text": result.get("text", "")}
    except Exception as e:
        print(f"Error: {e}")
        return {"error": "Failed to translate audio."}
    finally:
        if os.path.exists(temp_audio_path):
            os.unlink(temp_audio_path)

if __name__ == "__main__":
    import uvicorn
    # Run the API locally on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
