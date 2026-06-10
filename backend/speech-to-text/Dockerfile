# Use Python 3.10 to ensure compatibility with PyTorch and Transformers
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies (ffmpeg is required for Whisper/audio processing)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose the port Railway uses
EXPOSE 8000

# Start the FastAPI application (note we are using fastapi_app:app, NOT main:app)
CMD ["uvicorn", "fastapi_app:app", "--host", "0.0.0.0", "--port", "8000"]
