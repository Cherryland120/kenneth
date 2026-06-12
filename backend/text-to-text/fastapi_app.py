from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import MarianMTModel, MarianTokenizer
from deep_translator import GoogleTranslator
import os

app = FastAPI()

# Allow cross-origin requests from the Vercel frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load from HF Hub by default; can be overridden via MODEL_PATH env var
model_path = os.getenv("MODEL_PATH", "Cherryland120/igbo-mt-finetuned")

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
            # Use deep_translator for robust Google Translate API access
            translator = GoogleTranslator(source='ig', target='en')
            result = translator.translate(request.text)
            return {"translated_text": result, "engine": "google"}
        except Exception as e:
            return {"error": f"Google Translate error: {str(e)}"}
            
    # Default to custom model
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
