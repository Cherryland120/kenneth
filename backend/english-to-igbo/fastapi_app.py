from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import MarianMTModel, MarianTokenizer
from deep_translator import GoogleTranslator
import os

app = FastAPI()

# ── CORS Middleware ───────────────────────────────────────────────────────────
# Using FastAPI's official CORSMiddleware — works correctly on Railway's proxy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Load from HF Hub by default; can be overridden via MODEL_PATH env var
model_path = os.getenv("MODEL_PATH", "Cherryland120/english-to-igbo-marian")


print(f"Loading MarianMT model from: {model_path}...")
try:
    tokenizer = MarianTokenizer.from_pretrained(model_path)
    model = MarianMTModel.from_pretrained(model_path)
    print("Model loaded successfully.")
except Exception as e:
    print(f"Error loading model: {e}")
    tokenizer = None
    model = None

class TranslationRequest(BaseModel):
    text: str
    engine: str = "custom" # "custom" or "google"

@app.post("/api/translate")
async def translate_text(request: TranslationRequest):
    if request.engine == "google":
        try:
            translator = GoogleTranslator(source='en', target='ig')
            result = translator.translate(request.text)
            return {"translated_text": result, "engine": "google"}
        except Exception as e:
            return {"error": f"Google Translate error: {str(e)}"}
            
    if not model or not tokenizer:
        return {"error": "Custom model not loaded properly."}
        
    try:
        inputs = tokenizer(request.text, return_tensors="pt", padding=True)
        translated = model.generate(**inputs)
        result = tokenizer.batch_decode(translated, skip_special_tokens=True)[0]
        return {"translated_text": result, "engine": "custom"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
