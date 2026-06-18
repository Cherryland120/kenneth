# Use Python 3.10 to ensure compatibility with PyTorch and Transformers
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies (ffmpeg is required for Whisper/audio processing)
RUN apt-get update && apt-get install -y ffmpeg git && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download DeepFilterNet model to pre-package it in the image.
# Use || true so a network/build failure here doesn't block the entire deploy.
# The app handles a missing model gracefully at runtime (audio purification is disabled).
RUN python -c "from df.enhance import init_df; init_df()" || true

# Copy the rest of the application
COPY . .

# Expose the port Railway uses
EXPOSE 8000

# Start the FastAPI application (note we are using fastapi_app:app, NOT main:app)
CMD sh -c "uvicorn fastapi_app:app --host 0.0.0.0 --port ${PORT:-8000}"
