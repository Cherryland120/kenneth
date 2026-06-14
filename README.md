<div align="center">

# Kenneth Final Year Project 🎙️✨

**Igbo Speech & Text Translation Web Application**
</div>

---

Kenneth Final Year Project is a web application designed to bridge the gap between Igbo speakers and technology by providing real-time speech transcription, translation, and voice synthesis. Utilizing a fine-tuned Whisper Large v3 model, the app can transcribe spoken Igbo into written text and translate it to English — with automated text-to-speech readout via **ElevenLabs AI voices**.

Developed as a Final Year Project, the system is composed of three independent microservices deployed on Railway, with a React frontend hosted on Vercel.

---

## 🚀 Key Features

*   **Igbo Audio → Igbo Text (ASR)**: Transcribe Igbo voice or audio files into written Igbo.
*   **Igbo Audio → English Translation**: Direct translation of Igbo speech to English text.
*   **Igbo Text → English Translation**: Type Igbo text and translate it instantly.
*   **Live Translate Mode**: Real-time streaming translation — audio is captured in 4-second chunks, transcribed and translated on the fly.
*   **ElevenLabs Voice Synthesis**: English translations are automatically read aloud using a premium AI voice (ElevenLabs `eleven_multilingual_v2` model).
*   **File Upload**: Upload and process pre-recorded audio files.
*   **Configurable Backends**: Set all three backend URLs independently via the in-app Settings panel.
*   **Test Mode**: Run the speech backend in mock mode to bypass the 3GB model download for rapid UI testing.

---

## 🛠️ Tech Stack & Model Details

| Layer | Technology |
|---|---|
| **Frontend** | React, Vite, TypeScript, TailwindCSS v4, Framer Motion, Lucide Icons |
| **Speech-to-Text** | FastAPI · [abasseyfresh/whisper-large-v3-igbo](https://huggingface.co/abasseyfresh/whisper-large-v3-igbo) |
| **Text Translation** | FastAPI · [Cherryland120/igbo-mt-finetuned](https://huggingface.co/Cherryland120/igbo-mt-finetuned) (MarianMT) |
| **Text-to-Speech** | FastAPI · ElevenLabs Python SDK (`eleven_multilingual_v2`) |
| **Hosting** | Vercel (frontend) · Railway (all three backends) |

---

## 📂 Project Structure

```text
├── backend/
│   ├── speech-to-text/
│   │   ├── fastapi_app.py      # Whisper ASR — /api/transcribe, /api/live-translate
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   ├── text-to-text/
│   │   ├── fastapi_app.py      # MarianMT translation — /api/translate
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   └── text-to-speech/
│       ├── fastapi_app.py      # ElevenLabs TTS — /api/synthesize
│       ├── requirements.txt
│       └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Main interactive UI (all modes + settings)
│   │   └── main.tsx            # React entrypoint
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

---

## ⚙️ Setup & Installation

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:5173
```

---

### 2. Backend Services (Local)

Each of the three backends is an independent FastAPI service. Run each in its own terminal:

#### Speech-to-Text
```bash
cd backend/speech-to-text
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python fastapi_app.py           # Standard (downloads 3GB Whisper model)
TEST_MODE=true python fastapi_app.py  # Test mode (instant startup, mock model)
```

#### Text-to-Text (Translation)
```bash
cd backend/text-to-text
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python fastapi_app.py
```

#### Text-to-Speech (ElevenLabs)
```bash
cd backend/text-to-speech
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
ELEVEN_LABS_API=your_key_here python fastapi_app.py
```

---

### 3. Environment Variables

The **text-to-speech** service requires one secret:

| Variable | Service | Description |
|---|---|---|
| `ELEVEN_LABS_API` | `text-to-speech` | Your ElevenLabs API key (requires a paid plan when running from a server) |

When deploying to Railway, set this in the service's **Variables** tab. Never commit it to version control.

---

### 4. Deploying to Railway

Each backend is deployed as a separate Railway service from its own subdirectory:

1. Create a new Railway project.
2. Add three services — one for each folder under `backend/`.
3. Set the **Root Directory** of each service to its folder (e.g. `backend/text-to-speech`).
4. Add the `ELEVEN_LABS_API` environment variable to the `text-to-speech` service.
5. Once deployed, copy each service's public URL.
6. Open the Kenneth frontend, click **Settings ⚙️**, and paste the URLs for each backend.

---

### 5. Configuring Backends in the Frontend

Open the Settings panel (⚙️ icon in the bottom bar) and fill in:

| Field | Which service |
|---|---|
| 🎙️ Speech-to-Text URL | `backend/speech-to-text` Railway URL |
| 📝 Text-to-Text (Translation) URL | `backend/text-to-text` Railway URL |
| 🗣️ Text-to-Speech URL | `backend/text-to-speech` Railway URL |

Leave **Text-to-Speech URL** blank to fall back to the browser's built-in voice synthesis.

---

## 🔗 Live Demo

| Service | URL |
|---|---|
| Frontend | [kenneth-ten.vercel.app](https://kenneth-ten.vercel.app) |