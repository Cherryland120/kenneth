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

# Railway dynamically assigns PORT at runtime — must not hardcode it
EXPOSE 8000

# Use shell form so $PORT is expanded at runtime
CMD uvicorn fastapi_app:app --host 0.0.0.0 --port ${PORT:-8000}
