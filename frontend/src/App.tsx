import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic, Upload, StopCircle, Play, FileAudio, RefreshCw, Languages,
  Copy, Check, Settings, X, Radio, ChevronRight, Timer, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppMode = 'transcribe' | 'translate' | 'live' | 'text';
type TranslationEngine = 'custom' | 'google';

interface LiveChunk {
  id: number;
  igbo: string;
  english: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // ── shared settings ──────────────────────────────────────────────────────
  const [backendUrl, setBackendUrl] = useState<string>(
    localStorage.getItem('backendUrl') || 'https://curvy-jobs-see.loca.lt'
  );
  const [translationBackendUrl, setTranslationBackendUrl] = useState<string>(
    localStorage.getItem('translationBackendUrl') || ''
  );
  const [translationEngine, setTranslationEngine] = useState<TranslationEngine>(
    (localStorage.getItem('translationEngine') as TranslationEngine) || 'custom'
  );
  const [ttsBackendUrl, setTtsBackendUrl] = useState<string>(
    localStorage.getItem('ttsBackendUrl') || ''
  );
  const [showSettings, setShowSettings] = useState(false);
  const [tempUrl, setTempUrl] = useState(backendUrl);
  const [tempTranslationUrl, setTempTranslationUrl] = useState(translationBackendUrl);
  const [tempTranslationEngine, setTempTranslationEngine] = useState<TranslationEngine>(translationEngine);
  const [tempTtsUrl, setTempTtsUrl] = useState<string>(ttsBackendUrl);

  // ── global mode ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<AppMode>('transcribe');

  // ── record / upload mode state ───────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [igboText, setIgboText] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // ── live translate state ─────────────────────────────────────────────────
  const [isLiveRecording, setIsLiveRecording] = useState(false);
  const [liveChunks, setLiveChunks] = useState<LiveChunk[]>([]);
  const [liveChunkId, setLiveChunkId] = useState(0);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [livePendingCount, setLivePendingCount] = useState(0); // chunks in-flight
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [liveCopied, setLiveCopied] = useState(false);

  const liveMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const liveChunkIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const igboScrollRef = useRef<HTMLDivElement>(null);
  const englishScrollRef = useRef<HTMLDivElement>(null);

  // ── auto-scroll live panels ──────────────────────────────────────────────
  useEffect(() => {
    igboScrollRef.current?.scrollTo({ top: igboScrollRef.current.scrollHeight, behavior: 'smooth' });
    englishScrollRef.current?.scrollTo({ top: englishScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [liveChunks]);

  // ── audio queue for TTS ──────────────────────────────────────────────────
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingAudioRef = useRef<boolean>(false);
  // Ref so sendChunk always reads the latest ttsBackendUrl (avoids stale closure)
  const ttsBackendUrlRef = useRef<string>(ttsBackendUrl);
  useEffect(() => { ttsBackendUrlRef.current = ttsBackendUrl; }, [ttsBackendUrl]);

  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingAudioRef.current = false;
      return;
    }
    isPlayingAudioRef.current = true;
    const url = audioQueueRef.current.shift()!;
    const audio = new Audio(url);
    audio.onended = () => playNextAudio();
    audio.play().catch(e => {
      console.error(e);
      playNextAudio();
    });
  }, []);

  const playElevenLabsAudio = useCallback(async (text: string) => {
    const ttsUrl = ttsBackendUrlRef.current;
    if (!ttsUrl) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'en-US'; utt.rate = 0.9;
      window.speechSynthesis.speak(utt);
      return;
    }
    try {
      const res = await fetch(`${ttsUrl}/api/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!res.ok) throw new Error("TTS backend failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioQueueRef.current.push(url);
      if (!isPlayingAudioRef.current) {
        playNextAudio();
      }
    } catch (err) {
      console.error("Failed to play TTS", err);
    }
  }, [playNextAudio]);

  // ── settings ─────────────────────────────────────────────────────────────
  const handleSaveSettings = () => {
    let u = tempUrl.trim().replace(/\/$/, '');
    if (u && !u.startsWith('http')) u = 'https://' + u;
    setBackendUrl(u);
    localStorage.setItem('backendUrl', u);

    let tu = tempTranslationUrl.trim().replace(/\/$/, '');
    if (tu && !tu.startsWith('http')) tu = 'https://' + tu;
    setTranslationBackendUrl(tu);
    localStorage.setItem('translationBackendUrl', tu);

    setTranslationEngine(tempTranslationEngine);
    localStorage.setItem('translationEngine', tempTranslationEngine);

    let ttsU = tempTtsUrl.trim().replace(/\/$/, '');
    if (ttsU && !ttsU.startsWith('http')) ttsU = 'https://' + ttsU;
    setTtsBackendUrl(ttsU);
    localStorage.setItem('ttsBackendUrl', ttsU);

    setShowSettings(false);
  };

  // ─── Record / Upload handlers ─────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      setIsRecording(true);
      setError(null);
    } catch {
      setError('Microphone access denied. Please grant permission and try again.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setAudioBlob(file); setAudioUrl(URL.createObjectURL(file)); setError(null); }
  };

  const handleProcessAudio = async () => {
    if (!audioBlob) return;
    setIsLoading(true); setError(null); setIgboText(''); setTranscription('');
    try {
      const fd = new FormData();
      fd.append('file', audioBlob);
      fd.append('audio', audioBlob);

      setLoadingStep('Transcribing Igbo audio...');
      const sttRes = await fetch(`${backendUrl}/api/transcribe`, {
        method: 'POST', body: fd, headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      if (!sttRes.ok) throw new Error('Speech-to-text backend not reachable');
      const sttData = await sttRes.json();
      const igbo = sttData.text || '';
      if (!igbo) { setError(sttData.error || 'No speech detected.'); return; }

      if (mode === 'transcribe') { setTranscription(igbo); return; }

      setIgboText(igbo);
      setLoadingStep('Translating to English...');

      if (!translationBackendUrl) {
        setTranscription(igbo);
        setError('⚠️ Translation backend URL not configured. Add it in Settings.');
        return;
      }

      const mtRes = await fetch(`${translationBackendUrl}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
        body: JSON.stringify({ text: igbo, engine: translationEngine }),
      });
      if (!mtRes.ok) throw new Error('Text-to-text backend not reachable');
      const mtData = await mtRes.json();
      const english = mtData.translated_text || mtData.error || 'No translation received.';
      setTranscription(english);

      if (mtData.translated_text) {
        playElevenLabsAudio(mtData.translated_text);
      }
    } catch (err: any) {
      const msg = err.message || 'Unknown error';
      if (msg.includes('Speech-to-text')) setError('❌ Speech-to-text backend offline. Check Railway.');
      else if (msg.includes('Text-to-text')) { if (igboText) setTranscription(igboText); setError('❌ Translation backend unreachable. Showing Igbo only.'); }
      else setError('❌ ' + msg);
    } finally {
      setIsLoading(false); setLoadingStep('');
    }
  };

  const handleProcessText = async () => {
    if (!textInput.trim()) { setError('Please enter some text to translate.'); return; }
    if (!translationBackendUrl) { setError('Translation backend URL not configured in Settings.'); return; }

    setIsLoading(true); setError(null); setTranscription(''); setIgboText(''); setCopied(false);
    setLoadingStep('Translating text...');

    try {
      const res = await fetch(`${translationBackendUrl}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
        body: JSON.stringify({ text: textInput, engine: translationEngine })
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setTranscription(data.translated_text);
      setIgboText(textInput);
      if (data.translated_text) {
        playElevenLabsAudio(data.translated_text);
      }
    } catch (e: any) {
      setError(`Translation failed: ${e.message}`);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const reset = () => {
    setAudioBlob(null); setAudioUrl(null); setTranscription('');
    setIgboText(''); setError(null); setCopied(false); setLoadingStep('');
    setTextInput('');
  };

  const copyToClipboard = () => {
    if (transcription) { navigator.clipboard.writeText(transcription); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  // ─── Live translate handlers ──────────────────────────────────────────────

  const sendChunk = useCallback(async (blob: Blob, chunkId: number) => {
    if (blob.size < 500) return; // skip tiny/empty blobs
    setLivePendingCount((c) => c + 1);
    try {
      const fd = new FormData();
      fd.append('file', blob, `chunk_${chunkId}.webm`);
      fd.append('chunk_id', String(chunkId));
      fd.append('engine', translationEngine);

      const res = await fetch(`${backendUrl}/api/live-translate`, {
        method: 'POST', body: fd, headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.error) {
        setLiveError(`Chunk ${chunkId}: ${data.error}`);
        return;
      }
      if (data.igbo_text) {
        setLiveChunks((prev) => [
          ...prev,
          { id: chunkId, igbo: data.igbo_text, english: data.english_text || '' },
        ]);
        if (data.english_text) {
          playElevenLabsAudio(data.english_text);
        }
      }
    } catch (e: any) {
      setLiveError(`Chunk ${chunkId} failed: ${e.message}`);
    } finally {
      setLivePendingCount((c) => Math.max(0, c - 1));
    }
  }, [backendUrl, translationEngine, ttsBackendUrl, playElevenLabsAudio]);

  const startLiveTranslation = async () => {
    if (!backendUrl) { setLiveError('Speech backend URL not configured. Go to Settings.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      liveChunkIdRef.current = 0;
      setLiveChunks([]); setLiveError(null); setElapsedSeconds(0); setLiveChunkId(0);
      setIsLiveRecording(true);

      const recordChunk = () => {
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 500) {
            liveChunkIdRef.current += 1;
            setLiveChunkId(liveChunkIdRef.current);
            sendChunk(e.data, liveChunkIdRef.current);
          }
        };

        recorder.start();
        liveMediaRecorderRef.current = recorder;

        setTimeout(() => {
          if (liveMediaRecorderRef.current === recorder && recorder.state !== 'inactive') {
            recorder.stop();
            if (timerRef.current) recordChunk();
          }
        }, 4000);
      };

      recordChunk();
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } catch {
      setLiveError('Microphone access denied. Please grant permission.');
    }
  };

  const stopLiveTranslation = () => {
    setIsLiveRecording(false);
    if (liveMediaRecorderRef.current && liveMediaRecorderRef.current.state !== 'inactive') {
      liveMediaRecorderRef.current.stop();
    }
    if (timerRef.current) { 
      clearInterval(timerRef.current); 
      timerRef.current = null; 
    }
  };

  const resetLive = () => {
    setLiveChunks([]); setLiveError(null); setElapsedSeconds(0);
    setLiveChunkId(0); setLivePendingCount(0);
  };

  const copyLiveTranscript = () => {
    const text = liveChunks.map((c) => c.english).filter(Boolean).join(' ');
    if (text) { navigator.clipboard.writeText(text); setLiveCopied(true); setTimeout(() => setLiveCopied(false), 2000); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-[#FEF9EC] flex flex-col font-sans text-slate-800 overflow-hidden">

      {/* ── Top Nav ─────────────────────────────────────────────────────── */}
      <nav className="h-20 bg-white border-b border-orange-100 flex items-center justify-between px-6 md:px-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-sm">
            <Languages className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            Kenneth <span className="text-orange-500">Project</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-4 border-l pl-6 border-orange-100">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-400 uppercase">Model Active</p>
            <p className="text-xs font-mono text-orange-600 max-w-[200px] truncate">whisper-large-v3-igbo</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-orange-100 border-2 border-white shadow-sm flex items-center justify-center">
            <div className={`w-2 h-2 rounded-full ${isLiveRecording ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`} />
          </div>
        </div>
      </nav>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col gap-6 p-4 md:p-8 max-w-6xl mx-auto w-full overflow-y-auto">

        {/* Mode Tab Bar */}
        <div className="flex items-center justify-center gap-2 shrink-0 mt-4 md:mt-0">
          <div className="bg-white p-1 rounded-full shadow-sm border border-orange-50 flex items-center gap-1">
            {([
              { id: 'transcribe', label: 'Audio → Igbo Text' },
              { id: 'translate',  label: 'Audio → English Text' },
              { id: 'text',       label: 'Text → English Text' },
            ] as { id: AppMode; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  mode === id ? 'bg-orange-50 text-orange-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setMode('live')}
              className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 ${
                mode === 'live'
                  ? 'bg-red-50 text-red-600 shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${mode === 'live' && isLiveRecording ? 'animate-pulse' : ''}`} />
              Live Translate
            </button>
          </div>
        </div>

        {/* ── LIVE TRANSLATE MODE ──────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {mode === 'live' && (
            <motion.div
              key="live"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="flex-1 flex flex-col gap-4"
            >
              {/* Live control bar */}
              <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-4">
                  {/* Big mic button */}
                  <button
                    onClick={isLiveRecording ? stopLiveTranslation : startLiveTranslation}
                    className={`relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                      isLiveRecording
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                    }`}
                  >
                    {isLiveRecording && (
                      <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
                    )}
                    {isLiveRecording
                      ? <StopCircle className="w-7 h-7 relative z-10" />
                      : <Mic className="w-7 h-7 relative z-10" />
                    }
                  </button>

                  <div>
                    <p className="font-bold text-slate-800 text-base">
                      {isLiveRecording ? 'Recording…' : liveChunks.length > 0 ? 'Session complete' : 'Ready to translate'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isLiveRecording
                        ? 'Audio is sent every 4 seconds for translation'
                        : 'Press the mic button to begin live translation'}
                    </p>
                  </div>
                </div>

                {/* Status chips */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {isLiveRecording && (
                    <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 text-red-600 rounded-full px-3 py-1.5 text-xs font-semibold">
                      <Timer className="w-3.5 h-3.5" />
                      {formatTime(elapsedSeconds)}
                    </div>
                  )}
                  {liveChunkId > 0 && (
                    <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-100 text-orange-600 rounded-full px-3 py-1.5 text-xs font-semibold">
                      <Zap className="w-3.5 h-3.5" />
                      {liveChunkId} chunk{liveChunkId !== 1 ? 's' : ''} sent
                    </div>
                  )}
                  {livePendingCount > 0 && (
                    <div className="flex items-center gap-1.5 bg-slate-100 text-slate-500 rounded-full px-3 py-1.5 text-xs font-semibold">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Processing…
                    </div>
                  )}
                  {/* Engine badge */}
                  <div className="bg-slate-100 text-slate-600 rounded-full px-3 py-1.5 text-xs font-semibold capitalize">
                    {translationEngine === 'google' ? 'Google' : 'Custom Model'}
                  </div>
                  {(liveChunks.length > 0 || liveError) && !isLiveRecording && (
                    <button
                      onClick={resetLive}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                      title="Reset"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Live error */}
              {liveError && (
                <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm font-medium shrink-0">
                  {liveError}
                </div>
              )}

              {/* Live transcript panels */}
              <div className="flex-1 grid md:grid-cols-2 gap-4 min-h-[300px]">

                {/* Igbo panel */}
                <div className="bg-white rounded-2xl border border-orange-100 shadow-sm flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-orange-50 shrink-0">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Igbo (Transcribed)</span>
                    <div className="w-2 h-2 rounded-full bg-orange-300" />
                  </div>
                  <div ref={igboScrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                    {liveChunks.length === 0 && !isLiveRecording && (
                      <p className="text-slate-400 italic text-sm text-center mt-8">Igbo transcription will appear here…</p>
                    )}
                    {liveChunks.map((chunk) => (
                      <motion.div
                        key={chunk.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="group"
                      >
                        <p className="text-[10px] text-slate-300 font-mono mb-0.5">#{chunk.id}</p>
                        <p className="text-slate-700 leading-relaxed text-sm">{chunk.igbo}</p>
                      </motion.div>
                    ))}
                    {isLiveRecording && livePendingCount > 0 && (
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <div className="flex gap-1">
                          {[0,1,2].map(i => (
                            <span key={i} className="w-1.5 h-1.5 bg-orange-300 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </div>
                        Transcribing…
                      </div>
                    )}
                  </div>
                </div>

                {/* English panel */}
                <div className="bg-orange-500 rounded-2xl shadow-sm flex flex-col overflow-hidden text-white">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-orange-400/40 shrink-0">
                    <span className="text-xs font-bold text-orange-200 uppercase tracking-widest">English (Translated)</span>
                    <div className="flex items-center gap-2">
                      {liveChunks.some(c => c.english) && (
                        <button
                          onClick={copyLiveTranscript}
                          className="p-1.5 bg-orange-400/40 hover:bg-orange-400/60 rounded-lg transition-colors"
                          title="Copy English transcript"
                        >
                          {liveCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                      )}
                      <div className="w-2 h-2 rounded-full bg-orange-200" />
                    </div>
                  </div>
                  <div ref={englishScrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                    {liveChunks.length === 0 && !isLiveRecording && (
                      <p className="text-orange-200 italic text-sm text-center mt-8">English translation will appear here…</p>
                    )}
                    {liveChunks.map((chunk) => (
                      <motion.div
                        key={chunk.id}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="group"
                      >
                        <p className="text-[10px] text-orange-300/70 font-mono mb-0.5">#{chunk.id}</p>
                        <p className="text-white leading-relaxed text-sm font-medium">
                          {chunk.english || <span className="text-orange-200 italic text-xs">No translation for this chunk</span>}
                        </p>
                      </motion.div>
                    ))}
                    {isLiveRecording && livePendingCount > 0 && (
                      <div className="flex items-center gap-2 text-orange-200 text-sm">
                        <div className="flex gap-1">
                          {[0,1,2].map(i => (
                            <span key={i} className="w-1.5 h-1.5 bg-orange-200 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </div>
                        Translating…
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Live footer hint */}
              {!isLiveRecording && liveChunks.length === 0 && (
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 shrink-0 pb-2">
                  <ChevronRight className="w-3 h-3" />
                  Audio is split into 4-second chunks · each chunk is transcribed + translated independently
                </div>
              )}
            </motion.div>
          )}

          {/* ── TRANSCRIBE / TRANSLATE MODE ─────────────────────────────── */}
          {mode !== 'live' && (
            <motion.div
              key="record"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="flex-1 flex flex-col gap-6"
            >
              {error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-2xl text-sm border border-red-100 flex items-center justify-center shrink-0">
                  <span className="font-medium text-center">{error}</span>
                </div>
              )}

              <div className="flex-1 grid md:grid-cols-2 gap-8 min-h-[400px]">

                {/* Input */}
                <div className="bg-white rounded-[32px] border border-orange-100 shadow-xl p-8 flex flex-col relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Input Source</span>
                  </div>
                  <div className="flex-1 flex flex-col justify-center mt-6">
                    <AnimatePresence mode="wait">
                      {mode === 'text' ? (
                        <motion.div
                          key="text-input"
                          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                          className="flex flex-col h-full space-y-4 justify-center"
                        >
                          <textarea
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            placeholder="Type Igbo text here..."
                            className="w-full h-40 p-4 border border-orange-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none bg-orange-50/50 text-slate-800"
                          />
                          <div className="flex gap-3 pt-2">
                            <button onClick={reset} className="px-4 py-3 text-slate-500 hover:text-slate-700 bg-white rounded-xl shadow-sm border border-slate-200 transition-all hover:bg-slate-50" title="Reset">
                              <RefreshCw className="w-5 h-5" />
                            </button>
                            <button
                              onClick={handleProcessText}
                              disabled={isLoading}
                              className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-semibold shadow-md hover:bg-orange-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-70"
                            >
                              {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                              <span>{isLoading ? 'Processing...' : 'Translate Text'}</span>
                            </button>
                          </div>
                        </motion.div>
                      ) : !audioBlob ? (
                        <motion.div
                          key="input-methods"
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                          className="grid grid-cols-2 gap-4 h-full content-center"
                        >
                          <div
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center space-y-4 transition-colors group cursor-pointer ${
                              isRecording ? 'border-red-300 bg-red-50' : 'border-orange-200 hover:border-orange-400 hover:bg-orange-50/50'
                            }`}
                          >
                            <div className={`p-5 rounded-full transition-all shadow-sm ${
                              isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-orange-100 text-orange-600 group-hover:scale-105'
                            }`}>
                              {isRecording ? <StopCircle className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                            </div>
                            <div className="text-center">
                              <p className="font-semibold text-slate-800">{isRecording ? 'Listening...' : 'Record Audio'}</p>
                            </div>
                          </div>

                          <label className="border-2 border-dashed border-orange-200 rounded-2xl p-6 flex flex-col items-center justify-center space-y-4 hover:border-orange-400 hover:bg-orange-50/50 transition-colors cursor-pointer group">
                            <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                            <div className="p-5 rounded-full bg-slate-100 text-slate-600 group-hover:bg-slate-200 group-hover:scale-105 transition-all shadow-sm">
                              <Upload className="w-8 h-8" />
                            </div>
                            <div className="text-center">
                              <p className="font-semibold text-slate-800">Upload File</p>
                            </div>
                          </label>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="preview-player"
                          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                          className="flex flex-col h-full justify-center space-y-6"
                        >
                          <div className="bg-orange-50/80 rounded-2xl p-6 flex flex-col border border-orange-100 gap-6">
                            <div className="flex items-center space-x-4">
                              <div className="p-3 bg-orange-100 text-orange-600 rounded-xl shadow-sm">
                                <FileAudio className="w-6 h-6" />
                              </div>
                              <div className="flex-1 overflow-hidden">
                                <p className="font-semibold text-slate-800">Ready to Process</p>
                                <p className="text-xs text-slate-500">Audio captured successfully</p>
                              </div>
                            </div>
                            <audio src={audioUrl || ''} controls className="w-full h-10 outline-none" />
                            <div className="flex gap-3 pt-2">
                              <button onClick={reset} className="px-4 py-3 text-slate-500 hover:text-slate-700 bg-white rounded-xl shadow-sm border border-slate-200 transition-all hover:bg-slate-50" title="Reset">
                                <RefreshCw className="w-5 h-5" />
                              </button>
                              <button
                                onClick={handleProcessAudio}
                                disabled={isLoading}
                                className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-semibold shadow-md hover:bg-orange-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-70"
                              >
                                {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                                <span>{isLoading ? 'Processing...' : mode === 'transcribe' ? 'Transcribe Audio' : 'Translate Audio'}</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Output */}
                <div className="bg-orange-500 rounded-[32px] shadow-xl p-8 flex flex-col relative text-white">
                  <div className="absolute top-0 right-0 p-4">
                    <span className="text-[10px] font-bold text-orange-200 uppercase tracking-widest">
                      {mode === 'transcribe' ? 'Igbo Transcription' : 'English Translation'}
                    </span>
                  </div>
                  <div className="flex-1 mt-6 overflow-y-auto space-y-4">
                    {(mode === 'translate' || mode === 'text') && igboText && (
                      <div className="bg-orange-600/50 rounded-2xl p-4 border border-orange-400/30">
                        <p className="text-[10px] font-bold text-orange-200 uppercase tracking-widest mb-2">Igbo (Input)</p>
                        <p className="text-sm text-orange-100 leading-relaxed">{igboText}</p>
                      </div>
                    )}
                    {transcription ? (
                      <div>
                        {(mode === 'translate' || mode === 'text') && igboText && (
                          <p className="text-[10px] font-bold text-orange-200 uppercase tracking-widest mb-2">English (Translated)</p>
                        )}
                        <p className="text-xl md:text-2xl font-medium leading-relaxed whitespace-pre-wrap">{transcription}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full opacity-50 italic font-medium gap-2">
                        {isLoading
                          ? <><div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin" /><span>{loadingStep || 'Processing...'}</span></>
                          : 'Output will appear here...'}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-orange-400/30">
                    <button onClick={copyToClipboard} className="p-3 bg-orange-400/50 rounded-xl text-white hover:bg-orange-400 transition-colors" title="Copy to clipboard">
                      {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                    {transcription && !isLoading && (
                      <span className="text-xs font-bold bg-white/20 px-3 py-1.5 rounded-lg shadow-sm">Success</span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Settings Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-orange-400" />
                  Backend Configuration
                </h3>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    🎙️ Speech-to-Text URL <span className="text-xs text-slate-500">(also used for Live Translate)</span>
                  </label>
                  <input
                    type="text" value={tempUrl} onChange={(e) => setTempUrl(e.target.value)}
                    placeholder="https://speech-to-text.up.railway.app"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                  />
                  <p className="text-xs text-slate-500 mt-1">Hosts /api/transcribe, /api/live-translate, /api/live-transcribe</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">📝 Text-to-Text (Translation) URL</label>
                  <input
                    type="text" value={tempTranslationUrl} onChange={(e) => setTempTranslationUrl(e.target.value)}
                    placeholder="https://text-to-text.up.railway.app"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                  />
                  <p className="text-xs text-slate-500 mt-1 mb-4">Used for the batch Translate tab only.</p>

                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    ⚙️ Translation Engine <span className="text-xs text-slate-500">(applies to all modes)</span>
                  </label>
                  <div className="flex gap-3">
                    {(['custom', 'google'] as TranslationEngine[]).map((eng) => (
                      <label key={eng} className="flex items-center gap-2 text-white cursor-pointer bg-slate-950 border border-slate-800 px-4 py-2 rounded-lg flex-1 hover:border-slate-600 transition-colors">
                        <input
                          type="radio" name="engine" value={eng}
                          checked={tempTranslationEngine === eng}
                          onChange={() => setTempTranslationEngine(eng)}
                          className="accent-orange-500 w-4 h-4"
                        />
                        {eng === 'custom' ? 'Custom Model' : 'Google Translate'}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Custom Model = MarianMT (more accurate, slower). Google = fast fallback.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">🗣️ Text-to-Speech URL</label>
                  <input
                    type="text" value={tempTtsUrl} onChange={(e) => setTempTtsUrl(e.target.value)}
                    placeholder="https://text-to-speech.up.railway.app"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                  />
                  <p className="text-xs text-slate-500 mt-1">Used to read out English translations with ElevenLabs. Leave blank for browser voice.</p>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button onClick={() => setShowSettings(false)} className="px-4 py-2 rounded-lg font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSaveSettings} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors shadow-lg shadow-orange-500/20">
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="h-12 bg-slate-900 px-6 md:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isLiveRecording ? 'bg-red-500 animate-pulse' : isLoading ? 'bg-orange-400 animate-pulse' : 'bg-green-400'}`} />
            <span className="text-[10px] text-slate-400 font-mono">
              {isLiveRecording ? `LIVE · ${formatTime(elapsedSeconds)}` : isLoading ? 'Processing' : 'Standby'} (FastAPI)
            </span>
          </div>
          <div className="h-4 w-[1px] bg-slate-700" />
          <span className="text-[10px] text-slate-400 font-mono">
            {isLiveRecording ? `Chunks sent: ${liveChunkId}` : 'Status: Ready'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
          <span className="hidden md:block">Powered by Whisper v3 Igbo · MarianMT</span>
          <button
            onClick={() => { setTempUrl(backendUrl); setTempTranslationUrl(translationBackendUrl); setTempTranslationEngine(translationEngine); setShowSettings(true); }}
            className="flex items-center gap-1.5 hover:text-orange-400 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Config
          </button>
        </div>
      </footer>
    </div>
  );
}
