# Use a lightweight python image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose the port Railway uses
EXPOSE 8000

# Start the FastAPI application respecting the PORT env var provided by Railway
CMD sh -c "uvicorn fastapi_app:app --host 0.0.0.0 --port ${PORT:-8000}"
