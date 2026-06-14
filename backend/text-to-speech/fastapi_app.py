from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from elevenlabs.client import ElevenLabs
import os
from dotenv import load_dotenv

# Load environment variables from .env file (if present)
load_dotenv()

app = FastAPI()

# Allow cross-origin requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Explicit OPTIONS handler — Railway (like Cloudflare) can intercept preflights
# before they reach FastAPI, so we handle them explicitly here.
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

# Initialize ElevenLabs client
api_key = os.environ.get("ELEVEN_LABS_API")
if not api_key:
    print("Warning: ELEVEN_LABS_API environment variable not set.")
    
client = ElevenLabs(api_key=api_key)

class TTSRequest(BaseModel):
    text: str

@app.post("/api/synthesize")
async def synthesize_speech(request: TTSRequest):
    if not api_key:
        raise HTTPException(status_code=500, detail="ElevenLabs API Key not configured on the server.")
        
    try:
        # User requested hardcoded voice_id
        audio_generator = client.text_to_speech.convert(
            text=request.text,
            voice_id="neMPCpWtBwWZhxEC8qpe",
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        
        # convert generator to bytes
        audio_bytes = b"".join(audio_generator)
        
        # Return the audio stream directly to the client
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
