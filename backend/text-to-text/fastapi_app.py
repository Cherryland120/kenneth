from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import MarianMTModel, MarianTokenizer
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

# Path to the local fine-tuned model
model_path = "./igbo_mt_finetuned"

print("Loading MarianMT model...")
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

@app.post("/api/translate")
async def translate_text(request: TranslationRequest):
    if not model or not tokenizer:
        return {"error": "Model not loaded properly."}
        
    try:
        inputs = tokenizer(request.text, return_tensors="pt", padding=True)
        translated = model.generate(**inputs)
        result = tokenizer.batch_decode(translated, skip_special_tokens=True)[0]
        return {"translated_text": result}
    except Exception as e:
        return {"error": str(e)}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
