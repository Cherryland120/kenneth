from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from elevenlabs.client import ElevenLabs
import os
from dotenv import load_dotenv

# Load environment variables from .env file (if present)
load_dotenv()

app = FastAPI()

# ── CORS Middleware ───────────────────────────────────────────────────────────
# Using a raw BaseHTTPMiddleware instead of CORSMiddleware because Railway's
# reverse proxy can intercept OPTIONS preflight requests and return a response
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
        audio_generator = client.text_to_speech.convert(
            text=request.text,
            voice_id="b8XX4QShLFkd3yZQlz8T",
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )

        # Consume generator into bytes
        audio_bytes = b"".join(audio_generator)

        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        import traceback
        print("=== TTS ERROR ===")
        print(traceback.format_exc())
        print("=================")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
