<div align="center">


# IgboSync 🎙️✨

**Igbo Speech Transcription & Translation Web Application**
</div>

---

IgboSync is a web application designed to bridge the gap between Igbo speakers and technology by providing real-time speech transcription and translation. Utilizing a fine-tuned Whisper Large v3 model, IgboSync can transcribe spoken Igbo into written Igbo text, as well as translate Igbo speech directly to English text, with automated text-to-speech feedback.

Developed as a Final Year Project, IgboSync supports dual running environments: GPU-accelerated remote backends (such as Google Colab or Railway) and a local development server.

---

## 🚀 Key Features

*   **Igbo Audio to Igbo Text (ASR)**: Transcribe Igbo voice or audio files into written Igbo.
*   **Igbo Audio to English Translation**: Direct translation of Igbo speech to English text.
*   **Live Recording**: Record audio directly from your browser.
*   **File Upload**: Upload and process pre-recorded audio files.
*   **Voice Synthesis**: Real-time reading of English translation output using browser Text-to-Speech (TTS).
*   **Configurable Backend**: Instantly change your API server endpoint via the frontend settings panel (supports Google Colab LocalTunnel, Railway, or localhost).
*   **Test Mode**: Run the backend in mock mode to bypass downloading the heavy 3GB model for rapid frontend UI testing.

---

## 🛠️ Tech Stack & Model Details

*   **Frontend**: React (Vite, TypeScript, TailwindCSS v4, Framer Motion for animations, Lucide Icons).
*   **Backend**: FastAPI, PyTorch, Hugging Face Transformers.
*   **Model**: [abasseyfresh/whisper-large-v3-igbo](https://huggingface.co/abasseyfresh/whisper-large-v3-igbo) (ASR and translation).

---

## ⚙️ Setup & Installation

### 1. Frontend Setup

1.  Navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```
2.  Install the required dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
    *The frontend will run at `http://localhost:3000`.*

---

### 2. Backend Setup (Local Server)

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
2.  Create and activate a Python virtual environment:
    ```bash
    python -m venv .venv
    source .venv/bin/activate  # On Windows, use `.venv\Scripts\activate`
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

4.  **Run the Server**:
    *   **Option A: Standard Mode (Downloads & runs the 3GB ASR Model)**
        ```bash
        python fastapi_app.py
        ```
    *   **Option B: Test Mode (Instant startup, uses a mock model)**
        ```bash
        TEST_MODE=true python fastapi_app.py
        ```
    *The backend server will run at `http://localhost:8000`.*

---

### 3. Remote Backend Option (Google Colab / LocalTunnel)

For resource-constrained environments (like laptops without a dedicated GPU), you can host the backend on Google Colab and expose it using a public tunnel.

1.  In Google Colab, install packages:
    ```python
    !pip install fastapi uvicorn python-multipart transformers accelerate librosa soundfile torch nest-asyncio
    !npm install -g localtunnel
    ```
2.  Run the FastAPI app on Colab, load the model onto the GPU, and expose it via LocalTunnel:
    ```python
    import subprocess
    import time
    import urllib.request
    
    # Start the backend server in the background
    server_process = subprocess.Popen(["uvicorn", "backend:app", "--host", "0.0.0.0", "--port", "8000"])
    time.sleep(15)  # Wait for the model to load into GPU memory
    
    # Start localtunnel to expose port 8000
    process = subprocess.Popen(["lt", "--port", "8000"], stdout=subprocess.PIPE, universal_newlines=True)
    for line in process.stdout:
        if "your url is:" in line:
            print("✅ COPY THIS URL AND PASTE IT IN THE FRONTEND CONFIG:")
            print(line.strip().split("your url is: ")[1])
            break
    ```
3.  Open your IgboSync frontend, click the **Config** (Settings) icon at the bottom, paste the generated tunnel URL, and save.

---

## 📂 Project Structure

```text
├── backend/
│   ├── fastapi_app.py      # FastAPI application (ASR & translation endpoints)
│   ├── requirements.txt    # Python dependencies
│   ├── main.py             # Data processing script (parquet to audio)
│   └── test_*.py           # Test scripts for Hugging Face inference/downloads
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Main interactive UI
│   │   └── main.tsx        # React entrypoint
│   ├── package.json        # Frontend scripts and packages
│   └── vite.config.ts      # Vite configuration
└── README.md               # Project documentation
```