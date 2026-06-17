import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic, Upload, StopCircle, Play, FileAudio, RefreshCw, Languages,
  Copy, Check, Settings, X, Radio, ChevronRight, Timer, Zap, Type,
  ArrowRight, Volume2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Language = 'igbo' | 'english';
type IgboFeature = 'audio-to-text' | 'audio-to-english' | 'text-to-english' | 'live';
type EnglishFeature = 'audio-to-english-text' | 'text-to-igbo' | 'audio-to-igbo' | 'en-live';
type ActiveFeature = IgboFeature | EnglishFeature | null;
type TranslationEngine = 'custom' | 'google';
type TranscriptionEngine = 'custom' | 'google';

interface LiveChunk {
  id: number;
  igbo: string;
  english: string;
}

interface EnLiveChunk {
  id: number;
  english: string;
  igbo: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Feature Card ─────────────────────────────────────────────────────────────

function FeatureCard({
  icon, title, description, active, onClick, accent = 'orange'
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
  accent?: 'orange' | 'blue';
}) {
  const isOrange = accent === 'orange';
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`w-full text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
        active
          ? isOrange
            ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-200'
            : 'bg-slate-800 border-slate-700 text-white shadow-lg shadow-slate-200'
          : 'bg-white border-orange-100 text-slate-700 hover:border-orange-300 hover:shadow-md'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
        active
          ? isOrange ? 'bg-orange-400' : 'bg-slate-700'
          : isOrange ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-600'
      }`}>
        {icon}
      </div>
      <p className={`font-bold text-sm mb-1 ${active ? 'text-white' : 'text-slate-800'}`}>{title}</p>
      <p className={`text-xs leading-relaxed ${active ? 'text-white/80' : 'text-slate-500'}`}>{description}</p>
    </motion.button>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // ── shared settings ──────────────────────────────────────────────────────
  const [backendUrl, setBackendUrl] = useState<string>(
    localStorage.getItem('backendUrl') || 'https://purplish-slip-stride.ngrok-free.dev'
  );
  const [translationBackendUrl, setTranslationBackendUrl] = useState<string>(
    localStorage.getItem('translationBackendUrl') || 'https://fearless-manifestation-production.up.railway.app'
  );
  const [translationEngine, setTranslationEngine] = useState<TranslationEngine>(
    (localStorage.getItem('translationEngine') as TranslationEngine) || 'custom'
  );
  const [transcriptionEngine] = useState<TranscriptionEngine>(
    (localStorage.getItem('transcriptionEngine') as TranscriptionEngine) || 'custom'
  );
  const [ttsBackendUrl, setTtsBackendUrl] = useState<string>(
    localStorage.getItem('ttsBackendUrl') || 'https://artistic-wonder-production-cf65.up.railway.app'
  );
  const [enToIgBackendUrl, setEnToIgBackendUrl] = useState<string>(
    localStorage.getItem('enToIgBackendUrl') || ''
  );
  const [showSettings, setShowSettings] = useState(false);
  const [tempUrl, setTempUrl] = useState(backendUrl);
  const [tempTranslationUrl, setTempTranslationUrl] = useState(translationBackendUrl);
  const [tempTranslationEngine, setTempTranslationEngine] = useState<TranslationEngine>(translationEngine);
  const [tempTtsUrl, setTempTtsUrl] = useState<string>(ttsBackendUrl);
  const [tempEnToIgUrl, setTempEnToIgUrl] = useState<string>(enToIgBackendUrl);

  // ── language + feature routing ────────────────────────────────────────────
  const [activeLanguage, setActiveLanguage] = useState<Language>('igbo');
  const [activeFeature, setActiveFeature] = useState<ActiveFeature>(null);

  // ── shared processing state ───────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const [secondaryText, setSecondaryText] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [textInput, setTextInput] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // ── live translate state ─────────────────────────────────────────────────
  const [isLiveRecording, setIsLiveRecording] = useState(false);
  const [liveChunks, setLiveChunks] = useState<LiveChunk[]>([]);
  const [liveChunkId, setLiveChunkId] = useState(0);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [livePendingCount, setLivePendingCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [liveCopied, setLiveCopied] = useState(false);

  const liveMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const liveChunkIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const igboScrollRef = useRef<HTMLDivElement>(null);
  const englishScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    igboScrollRef.current?.scrollTo({ top: igboScrollRef.current.scrollHeight, behavior: 'smooth' });
    englishScrollRef.current?.scrollTo({ top: englishScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [liveChunks]);

  // ── English → Igbo live state ─────────────────────────────────────────────
  const [isEnLiveRecording, setIsEnLiveRecording] = useState(false);
  const [enLiveChunks, setEnLiveChunks] = useState<EnLiveChunk[]>([]);
  const [enLiveChunkId, setEnLiveChunkId] = useState(0);
  const [enLiveError, setEnLiveError] = useState<string | null>(null);
  const [enLivePendingCount, setEnLivePendingCount] = useState(0);
  const [enLiveElapsed, setEnLiveElapsed] = useState(0);
  const [enLiveCopied, setEnLiveCopied] = useState(false);

  const enLiveMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const enLiveChunkIdRef = useRef(0);
  const enLiveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const enLiveEnScrollRef = useRef<HTMLDivElement>(null);
  const enLiveIgScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    enLiveEnScrollRef.current?.scrollTo({ top: enLiveEnScrollRef.current.scrollHeight, behavior: 'smooth' });
    enLiveIgScrollRef.current?.scrollTo({ top: enLiveIgScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [enLiveChunks]);

  // ── audio queue for TTS ──────────────────────────────────────────────────
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingAudioRef = useRef<boolean>(false);
  const ttsBackendUrlRef = useRef<string>(ttsBackendUrl);
  useEffect(() => { ttsBackendUrlRef.current = ttsBackendUrl; }, [ttsBackendUrl]);

  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length === 0) { isPlayingAudioRef.current = false; return; }
    isPlayingAudioRef.current = true;
    const url = audioQueueRef.current.shift()!;
    const audio = new Audio(url);
    audio.onended = () => playNextAudio();
    audio.play().catch(() => playNextAudio());
  }, []);

  const playElevenLabsAudio = useCallback(async (text: string) => {
    const ttsUrl = ttsBackendUrlRef.current;
    if (!ttsUrl) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'en-US'; utt.rate = 0.9;
      window.speechSynthesis.speak(utt);
      return;
    }
    try {
      const res = await fetch(`${ttsUrl}/api/synthesize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioQueueRef.current.push(url);
      if (!isPlayingAudioRef.current) playNextAudio();
    } catch { console.error('TTS failed'); }
  }, [playNextAudio]);

  // ── settings ─────────────────────────────────────────────────────────────
  const handleSaveSettings = () => {
    const clean = (u: string) => {
      let s = u.trim().replace(/\/$/, '');
      if (s && !s.startsWith('http')) s = 'https://' + s;
      return s;
    };
    const bu = clean(tempUrl); setBackendUrl(bu); localStorage.setItem('backendUrl', bu);
    const tu = clean(tempTranslationUrl); setTranslationBackendUrl(tu); localStorage.setItem('translationBackendUrl', tu);
    setTranslationEngine(tempTranslationEngine); localStorage.setItem('translationEngine', tempTranslationEngine);
    const tts = clean(tempTtsUrl); setTtsBackendUrl(tts); localStorage.setItem('ttsBackendUrl', tts);
    const eti = clean(tempEnToIgUrl); setEnToIgBackendUrl(eti); localStorage.setItem('enToIgBackendUrl', eti);
    setShowSettings(false);
  };

  // ── reset / clipboard ─────────────────────────────────────────────────────
  const reset = () => {
    setAudioBlob(null); setAudioUrl(null); setTranscription('');
    setInputText(''); setSecondaryText(''); setError(null);
    setCopied(false); setLoadingStep(''); setTextInput('');
  };

  const handleSelectFeature = (f: ActiveFeature) => {
    setActiveFeature(f); reset();
  };

  const handleSelectLanguage = (lang: Language) => {
    setActiveLanguage(lang); setActiveFeature(null); reset();
    stopLiveTranslation(); resetLive();
  };

  const copyToClipboard = () => {
    if (transcription) { navigator.clipboard.writeText(transcription); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  // ── recording ─────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start(); setIsRecording(true); setError(null);
    } catch { setError('Microphone access denied.'); }
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); setIsRecording(false); };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setAudioBlob(file); setAudioUrl(URL.createObjectURL(file)); setError(null); }
  };

  // ── process audio ─────────────────────────────────────────────────────────
  const handleProcessAudio = async () => {
    if (!audioBlob) return;
    setIsLoading(true); setError(null); setTranscription(''); setInputText(''); setSecondaryText('');

    try {
      const fd = new FormData();
      fd.append('file', audioBlob); fd.append('audio', audioBlob);

      // Determine language and engine hints per feature
      const isEnglishInput = activeFeature === 'audio-to-english-text' || activeFeature === 'audio-to-igbo';
      fd.append('engine', isEnglishInput ? 'google' : transcriptionEngine);
      if (isEnglishInput) fd.append('language', 'en-US');

      setLoadingStep('Transcribing audio…');
      const sttRes = await fetch(`${backendUrl}/api/transcribe`, { method: 'POST', body: fd });
      if (!sttRes.ok) throw new Error('Speech-to-text backend not reachable');
      const sttData = await sttRes.json();
      const transcribed = sttData.text || '';
      if (!transcribed) { setError(sttData.error || 'No speech detected.'); return; }

      // Features that only need STT (no translation)
      if (activeFeature === 'audio-to-text' || activeFeature === 'audio-to-english-text') {
        setTranscription(transcribed);
        return;
      }

      setInputText(transcribed);
      setLoadingStep('Translating…');

      const isEnToIg = activeFeature === 'audio-to-igbo';
      const urlToUse = isEnToIg ? enToIgBackendUrl : translationBackendUrl;
      if (!urlToUse) { setTranscription(transcribed); setError('⚠️ Translation backend URL not configured.'); return; }

      const mtRes = await fetch(`${urlToUse}/api/translate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcribed, engine: translationEngine }),
      });
      if (!mtRes.ok) throw new Error('Translation backend not reachable');
      const mtData = await mtRes.json();
      const translated = mtData.translated_text || mtData.error || 'No translation received.';
      setTranscription(translated);
      if (mtData.translated_text && !isEnToIg) playElevenLabsAudio(mtData.translated_text);

    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('Speech-to-text') || err instanceof TypeError) {
        setError('❌ STT backend is offline. Check the URL in Config.');
      } else {
        setError('❌ ' + msg);
      }
    } finally { setIsLoading(false); setLoadingStep(''); }
  };

  // ── process text ──────────────────────────────────────────────────────────
  const handleProcessText = async () => {
    if (!textInput.trim()) { setError('Please enter some text.'); return; }
    const isEnToIg = activeFeature === 'text-to-igbo';
    const urlToUse = isEnToIg ? enToIgBackendUrl : translationBackendUrl;
    if (!urlToUse) { setError('Translation backend URL not configured in Settings.'); return; }

    setIsLoading(true); setError(null); setTranscription(''); setCopied(false);
    setLoadingStep('Translating…');
    try {
      const res = await fetch(`${urlToUse}/api/translate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput, engine: translationEngine })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTranscription(data.translated_text);
      setInputText(textInput);
      if (data.translated_text && !isEnToIg) playElevenLabsAudio(data.translated_text);
    } catch (e: any) { setError(`Translation failed: ${e.message}`); }
    finally { setIsLoading(false); setLoadingStep(''); }
  };

  // ── live translate ────────────────────────────────────────────────────────
  const sendChunk = useCallback(async (blob: Blob, chunkId: number) => {
    if (blob.size < 500) return;
    setLivePendingCount((c) => c + 1);
    try {
      const fd = new FormData();
      fd.append('file', blob, `chunk_${chunkId}.webm`);
      fd.append('chunk_id', String(chunkId));
      fd.append('engine', translationEngine);
      fd.append('stt_engine', transcriptionEngine);
      const res = await fetch(`${backendUrl}/api/live-translate`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) { setLiveError(`Chunk ${chunkId}: ${data.error}`); return; }
      if (data.igbo_text) {
        setLiveChunks((prev) => [...prev, { id: chunkId, igbo: data.igbo_text, english: data.english_text || '' }]);
        if (data.english_text) playElevenLabsAudio(data.english_text);
      }
    } catch (e: any) {
      setLiveError(e instanceof TypeError
        ? `❌ Chunk ${chunkId}: Backend offline or URL changed.`
        : `Chunk ${chunkId} failed: ${e.message}`);
    } finally { setLivePendingCount((c) => Math.max(0, c - 1)); }
  }, [backendUrl, translationEngine, transcriptionEngine, playElevenLabsAudio]);

  const startLiveTranslation = async () => {
    if (!backendUrl) { setLiveError('Speech backend URL not configured.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      liveChunkIdRef.current = 0;
      setLiveChunks([]); setLiveError(null); setElapsedSeconds(0); setLiveChunkId(0); setIsLiveRecording(true);
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
    } catch { setLiveError('Microphone access denied.'); }
  };

  const stopLiveTranslation = () => {
    setIsLiveRecording(false);
    if (liveMediaRecorderRef.current?.state !== 'inactive') liveMediaRecorderRef.current?.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const resetLive = () => {
    setLiveChunks([]); setLiveError(null); setElapsedSeconds(0); setLiveChunkId(0); setLivePendingCount(0);
  };

  const copyLiveTranscript = () => {
    const text = liveChunks.map((c) => c.english).filter(Boolean).join(' ');
    if (text) { navigator.clipboard.writeText(text); setLiveCopied(true); setTimeout(() => setLiveCopied(false), 2000); }
  };

  // ── English → Igbo live handlers ──────────────────────────────────────────
  const sendEnChunk = useCallback(async (blob: Blob, chunkId: number) => {
    if (blob.size < 500) return;
    setEnLivePendingCount((c) => c + 1);
    try {
      // Step 1: English STT via the speech backend (Google engine, en-US)
      const fd = new FormData();
      fd.append('file', blob, `chunk_${chunkId}.webm`);
      fd.append('engine', 'google');
      fd.append('language', 'en-US');
      const sttRes = await fetch(`${backendUrl}/api/transcribe`, { method: 'POST', body: fd });
      if (!sttRes.ok) throw new Error(`STT HTTP ${sttRes.status}`);
      const sttData = await sttRes.json();
      const englishText = (sttData.text || '').trim();
      if (!englishText) return; // silent chunk, skip

      // Step 2: English → Igbo via the english-to-igbo backend
      if (!enToIgBackendUrl) {
        setEnLiveError('English-to-Igbo backend URL not set. Add it in Config.');
        return;
      }
      const mtRes = await fetch(`${enToIgBackendUrl}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: englishText, engine: translationEngine }),
      });
      if (!mtRes.ok) throw new Error(`Translation HTTP ${mtRes.status}`);
      const mtData = await mtRes.json();
      const igboText = (mtData.translated_text || '').trim();

      setEnLiveChunks((prev) => [...prev, { id: chunkId, english: englishText, igbo: igboText }]);
    } catch (e: any) {
      setEnLiveError(e instanceof TypeError
        ? `❌ Chunk ${chunkId}: Backend offline or URL changed.`
        : `Chunk ${chunkId} failed: ${e.message}`);
    } finally {
      setEnLivePendingCount((c) => Math.max(0, c - 1));
    }
  }, [backendUrl, enToIgBackendUrl, translationEngine]);

  const startEnLiveTranslation = async () => {
    if (!backendUrl) { setEnLiveError('Speech backend URL not configured.'); return; }
    if (!enToIgBackendUrl) { setEnLiveError('English-to-Igbo backend URL not configured. Add it in Config.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      enLiveChunkIdRef.current = 0;
      setEnLiveChunks([]); setEnLiveError(null); setEnLiveElapsed(0); setEnLiveChunkId(0); setIsEnLiveRecording(true);
      const recordChunk = () => {
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 500) {
            enLiveChunkIdRef.current += 1;
            setEnLiveChunkId(enLiveChunkIdRef.current);
            sendEnChunk(e.data, enLiveChunkIdRef.current);
          }
        };
        recorder.start();
        enLiveMediaRecorderRef.current = recorder;
        setTimeout(() => {
          if (enLiveMediaRecorderRef.current === recorder && recorder.state !== 'inactive') {
            recorder.stop();
            if (enLiveTimerRef.current) recordChunk();
          }
        }, 4000);
      };
      recordChunk();
      enLiveTimerRef.current = setInterval(() => setEnLiveElapsed((s) => s + 1), 1000);
    } catch { setEnLiveError('Microphone access denied.'); }
  };

  const stopEnLiveTranslation = () => {
    setIsEnLiveRecording(false);
    if (enLiveMediaRecorderRef.current?.state !== 'inactive') enLiveMediaRecorderRef.current?.stop();
    if (enLiveTimerRef.current) { clearInterval(enLiveTimerRef.current); enLiveTimerRef.current = null; }
  };

  const resetEnLive = () => {
    setEnLiveChunks([]); setEnLiveError(null); setEnLiveElapsed(0); setEnLiveChunkId(0); setEnLivePendingCount(0);
  };

  const copyEnLiveTranscript = () => {
    const text = enLiveChunks.map((c) => c.igbo).filter(Boolean).join(' ');
    if (text) { navigator.clipboard.writeText(text); setEnLiveCopied(true); setTimeout(() => setEnLiveCopied(false), 2000); }
  };

  // ── derived helpers ───────────────────────────────────────────────────────
  const isAudioFeature = activeFeature === 'audio-to-text' || activeFeature === 'audio-to-english' || activeFeature === 'audio-to-english-text' || activeFeature === 'audio-to-igbo';
  const isTextFeature = activeFeature === 'text-to-english' || activeFeature === 'text-to-igbo';
  const isLiveFeature = activeFeature === 'live';
  const isEnLiveFeature = activeFeature === 'en-live';


  const outputLabel = () => {
    if (activeFeature === 'audio-to-text') return 'Igbo Transcription';
    if (activeFeature === 'audio-to-english' || activeFeature === 'text-to-english') return 'English Translation';
    if (activeFeature === 'audio-to-english-text') return 'English Transcription';
    if (activeFeature === 'audio-to-igbo' || activeFeature === 'text-to-igbo') return 'Igbo Translation';
    return 'Output';
  };

  const inputLabel = () => {
    if (activeFeature === 'audio-to-english' || activeFeature === 'text-to-english') return 'Igbo (Input)';
    if (activeFeature === 'audio-to-igbo' || activeFeature === 'text-to-igbo') return 'English (Input)';
    return '';
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
            Igbo<span className="text-orange-500">Sync</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-4 border-l pl-6 border-orange-100">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-400 uppercase">Model Active</p>
            <p className="text-xs font-mono text-orange-600">whisper-large-v3-igbo · MarianMT</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-orange-100 border-2 border-white shadow-sm flex items-center justify-center">
            <div className={`w-2 h-2 rounded-full ${isLiveRecording ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`} />
          </div>
        </div>
      </nav>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col p-4 md:p-8 max-w-6xl mx-auto w-full overflow-y-auto gap-6">

        {/* ── Language Selector ─────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-4 shrink-0 mt-2">
          {([
            { id: 'igbo' as Language, label: 'Igbo', emoji: '🇳🇬', sub: 'Speak or write Igbo' },
            { id: 'english' as Language, label: 'English', emoji: '🇬🇧', sub: 'Speak or write English' },
          ]).map(({ id, label, emoji, sub }) => (
            <motion.button
              key={id}
              onClick={() => handleSelectLanguage(id)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={`relative flex items-center gap-4 px-8 py-5 rounded-2xl border-2 transition-all duration-200 min-w-[200px] ${
                activeLanguage === id
                  ? 'bg-orange-500 border-orange-500 text-white shadow-xl shadow-orange-200'
                  : 'bg-white border-orange-100 text-slate-700 hover:border-orange-300 hover:shadow-md'
              }`}
            >
              <span className="text-3xl">{emoji}</span>
              <div className="text-left">
                <p className={`text-lg font-bold ${activeLanguage === id ? 'text-white' : 'text-slate-800'}`}>{label}</p>
                <p className={`text-xs ${activeLanguage === id ? 'text-orange-100' : 'text-slate-400'}`}>{sub}</p>
              </div>
              {activeLanguage === id && (
                <motion.div
                  layoutId="lang-indicator"
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/60"
                />
              )}
            </motion.button>
          ))}
        </div>

        {/* ── Feature Cards ─────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {activeLanguage === 'igbo' && (
            <motion.div
              key="igbo-features"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0"
            >
              <FeatureCard
                icon={<Mic className="w-5 h-5" />}
                title="Audio → Igbo Text"
                description="Record or upload Igbo speech and get a text transcription"
                active={activeFeature === 'audio-to-text'}
                onClick={() => handleSelectFeature('audio-to-text')}
              />
              <FeatureCard
                icon={<ArrowRight className="w-5 h-5" />}
                title="Audio → English"
                description="Transcribe Igbo speech and translate it to English"
                active={activeFeature === 'audio-to-english'}
                onClick={() => handleSelectFeature('audio-to-english')}
              />
              <FeatureCard
                icon={<Type className="w-5 h-5" />}
                title="Igbo Text → English"
                description="Type Igbo text and get an English translation"
                active={activeFeature === 'text-to-english'}
                onClick={() => handleSelectFeature('text-to-english')}
              />
              <FeatureCard
                icon={<Radio className="w-5 h-5" />}
                title="Live Translate"
                description="Real-time Igbo speech translation streamed live"
                active={activeFeature === 'live'}
                onClick={() => handleSelectFeature('live')}
              />
            </motion.div>
          )}

          {activeLanguage === 'english' && (
            <motion.div
              key="english-features"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0"
            >
              <FeatureCard
                icon={<Volume2 className="w-5 h-5" />}
                title="English Audio → Text"
                description="Record or upload English speech and get English text back"
                active={activeFeature === 'audio-to-english-text'}
                onClick={() => handleSelectFeature('audio-to-english-text')}
                accent="orange"
              />
              <FeatureCard
                icon={<Type className="w-5 h-5" />}
                title="English Text → Igbo"
                description="Type English text and translate it to Igbo"
                active={activeFeature === 'text-to-igbo'}
                onClick={() => handleSelectFeature('text-to-igbo')}
                accent="orange"
              />
              <FeatureCard
                icon={<Mic className="w-5 h-5" />}
                title="English Audio → Igbo"
                description="Speak English and get an Igbo text translation"
                active={activeFeature === 'audio-to-igbo'}
                onClick={() => handleSelectFeature('audio-to-igbo')}
                accent="orange"
              />
              <FeatureCard
                icon={<Radio className="w-5 h-5" />}
                title="Live Translate"
                description="Real-time English speech translated to Igbo, streamed live"
                active={activeFeature === 'en-live'}
                onClick={() => handleSelectFeature('en-live')}
                accent="orange"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Workspace ─────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">

          {/* No feature selected */}
          {!activeFeature && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400"
            >
              <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center">
                <Languages className="w-8 h-8 text-orange-400" />
              </div>
              <p className="text-base font-semibold text-slate-500">Select a feature above to get started</p>
              <p className="text-sm">Choose what you want to do with {activeLanguage === 'igbo' ? 'Igbo' : 'English'} speech or text</p>
            </motion.div>
          )}

          {/* ── LIVE TRANSLATE ──────────────────────────────────────────── */}
          {isLiveFeature && (
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
                  <button
                    onClick={isLiveRecording ? stopLiveTranslation : startLiveTranslation}
                    className={`relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                      isLiveRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-orange-500 hover:bg-orange-600'
                    } text-white`}
                  >
                    {isLiveRecording && <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />}
                    {isLiveRecording ? <StopCircle className="w-7 h-7 relative z-10" /> : <Mic className="w-7 h-7 relative z-10" />}
                  </button>
                  <div>
                    <p className="font-bold text-slate-800 text-base">
                      {isLiveRecording ? 'Recording…' : liveChunks.length > 0 ? 'Session complete' : 'Ready to translate'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isLiveRecording ? 'Audio sent every 4 seconds' : 'Press the mic to begin live translation'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {isLiveRecording && (
                    <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 text-red-600 rounded-full px-3 py-1.5 text-xs font-semibold">
                      <Timer className="w-3.5 h-3.5" />{formatTime(elapsedSeconds)}
                    </div>
                  )}
                  {liveChunkId > 0 && (
                    <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-100 text-orange-600 rounded-full px-3 py-1.5 text-xs font-semibold">
                      <Zap className="w-3.5 h-3.5" />{liveChunkId} chunk{liveChunkId !== 1 ? 's' : ''} sent
                    </div>
                  )}
                  {livePendingCount > 0 && (
                    <div className="flex items-center gap-1.5 bg-slate-100 text-slate-500 rounded-full px-3 py-1.5 text-xs font-semibold">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />Processing…
                    </div>
                  )}
                  {(liveChunks.length > 0 || liveError) && !isLiveRecording && (
                    <button onClick={resetLive} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {liveError && (
                <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm font-medium shrink-0">{liveError}</div>
              )}
              <div className="flex-1 grid md:grid-cols-2 gap-4 min-h-[300px]">
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
                      <motion.div key={chunk.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                        <p className="text-[10px] text-slate-300 font-mono mb-0.5">#{chunk.id}</p>
                        <p className="text-slate-700 leading-relaxed text-sm">{chunk.igbo}</p>
                      </motion.div>
                    ))}
                    {isLiveRecording && livePendingCount > 0 && (
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <div className="flex gap-1">
                          {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 bg-orange-300 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                        </div>
                        Transcribing…
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-orange-500 rounded-2xl shadow-sm flex flex-col overflow-hidden text-white">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-orange-400/40 shrink-0">
                    <span className="text-xs font-bold text-orange-200 uppercase tracking-widest">English (Translated)</span>
                    <div className="flex items-center gap-2">
                      {liveChunks.some(c => c.english) && (
                        <button onClick={copyLiveTranscript} className="p-1.5 bg-orange-400/40 hover:bg-orange-400/60 rounded-lg transition-colors">
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
                      <motion.div key={chunk.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                        <p className="text-[10px] text-orange-300/70 font-mono mb-0.5">#{chunk.id}</p>
                        <p className="text-white leading-relaxed text-sm font-medium">
                          {chunk.english || <span className="text-orange-200 italic text-xs">No translation for this chunk</span>}
                        </p>
                      </motion.div>
                    ))}
                    {isLiveRecording && livePendingCount > 0 && (
                      <div className="flex items-center gap-2 text-orange-200 text-sm">
                        <div className="flex gap-1">
                          {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 bg-orange-200 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                        </div>
                        Translating…
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {!isLiveRecording && liveChunks.length === 0 && (
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 shrink-0 pb-2">
                  <ChevronRight className="w-3 h-3" />
                  Audio is split into 4-second chunks · each chunk is transcribed + translated independently
                </div>
              )}
            </motion.div>
          )}

          {/* ── ENGLISH → IGBO LIVE TRANSLATE ───────────────────────────── */}
          {isEnLiveFeature && (
            <motion.div
              key="en-live"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="flex-1 flex flex-col gap-4"
            >
              {/* Control bar */}
              <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-4">
                  <button
                    onClick={isEnLiveRecording ? stopEnLiveTranslation : startEnLiveTranslation}
                    className={`relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                      isEnLiveRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-orange-500 hover:bg-orange-600'
                    } text-white`}
                  >
                    {isEnLiveRecording && <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />}
                    {isEnLiveRecording ? <StopCircle className="w-7 h-7 relative z-10" /> : <Mic className="w-7 h-7 relative z-10" />}
                  </button>
                  <div>
                    <p className="font-bold text-slate-800 text-base">
                      {isEnLiveRecording ? 'Recording…' : enLiveChunks.length > 0 ? 'Session complete' : 'Ready to translate'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isEnLiveRecording
                        ? 'English audio → STT → English-to-Igbo · every 4 seconds'
                        : 'Speak English — each chunk is transcribed then translated to Igbo'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {isEnLiveRecording && (
                    <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 text-red-600 rounded-full px-3 py-1.5 text-xs font-semibold">
                      <Timer className="w-3.5 h-3.5" />{formatTime(enLiveElapsed)}
                    </div>
                  )}
                  {enLiveChunkId > 0 && (
                    <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-100 text-orange-600 rounded-full px-3 py-1.5 text-xs font-semibold">
                      <Zap className="w-3.5 h-3.5" />{enLiveChunkId} chunk{enLiveChunkId !== 1 ? 's' : ''} sent
                    </div>
                  )}
                  {enLivePendingCount > 0 && (
                    <div className="flex items-center gap-1.5 bg-slate-100 text-slate-500 rounded-full px-3 py-1.5 text-xs font-semibold">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />Processing…
                    </div>
                  )}
                  {(enLiveChunks.length > 0 || enLiveError) && !isEnLiveRecording && (
                    <button onClick={resetEnLive} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {enLiveError && (
                <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm font-medium shrink-0">{enLiveError}</div>
              )}

              <div className="flex-1 grid md:grid-cols-2 gap-4 min-h-[300px]">
                {/* English panel (what was heard) */}
                <div className="bg-white rounded-2xl border border-orange-100 shadow-sm flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-orange-50 shrink-0">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">English (Transcribed)</span>
                    <div className="w-2 h-2 rounded-full bg-slate-300" />
                  </div>
                  <div ref={enLiveEnScrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                    {enLiveChunks.length === 0 && !isEnLiveRecording && (
                      <p className="text-slate-400 italic text-sm text-center mt-8">English transcription will appear here…</p>
                    )}
                    {enLiveChunks.map((chunk) => (
                      <motion.div key={chunk.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                        <p className="text-[10px] text-slate-300 font-mono mb-0.5">#{chunk.id}</p>
                        <p className="text-slate-700 leading-relaxed text-sm">{chunk.english}</p>
                      </motion.div>
                    ))}
                    {isEnLiveRecording && enLivePendingCount > 0 && (
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <div className="flex gap-1">
                          {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 bg-orange-300 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                        </div>
                        Transcribing English…
                      </div>
                    )}
                  </div>
                </div>

                {/* Igbo panel (translated output) */}
                <div className="bg-orange-500 rounded-2xl shadow-sm flex flex-col overflow-hidden text-white">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-orange-400/40 shrink-0">
                    <span className="text-xs font-bold text-orange-200 uppercase tracking-widest">Igbo (Translated)</span>
                    <div className="flex items-center gap-2">
                      {enLiveChunks.some(c => c.igbo) && (
                        <button onClick={copyEnLiveTranscript} className="p-1.5 bg-orange-400/40 hover:bg-orange-400/60 rounded-lg transition-colors">
                          {enLiveCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                      )}
                      <div className="w-2 h-2 rounded-full bg-orange-200" />
                    </div>
                  </div>
                  <div ref={enLiveIgScrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                    {enLiveChunks.length === 0 && !isEnLiveRecording && (
                      <p className="text-orange-200 italic text-sm text-center mt-8">Igbo translation will appear here…</p>
                    )}
                    {enLiveChunks.map((chunk) => (
                      <motion.div key={chunk.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                        <p className="text-[10px] text-orange-300/70 font-mono mb-0.5">#{chunk.id}</p>
                        <p className="text-white leading-relaxed text-sm font-medium">
                          {chunk.igbo || <span className="text-orange-200 italic text-xs">No translation for this chunk</span>}
                        </p>
                      </motion.div>
                    ))}
                    {isEnLiveRecording && enLivePendingCount > 0 && (
                      <div className="flex items-center gap-2 text-orange-200 text-sm">
                        <div className="flex gap-1">
                          {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 bg-orange-200 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                        </div>
                        Translating to Igbo…
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {!isEnLiveRecording && enLiveChunks.length === 0 && (
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 shrink-0 pb-2">
                  <ChevronRight className="w-3 h-3" />
                  English STT (Google) → English-to-Igbo (MarianMT) · 4-second chunks
                </div>
              )}
            </motion.div>
          )}

          {/* ── AUDIO / TEXT FEATURE WORKSPACE ──────────────────────────── */}
          {(isAudioFeature || isTextFeature) && (
            <motion.div
              key={activeFeature}
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

                {/* Input Panel */}
                <div className="bg-white rounded-[32px] border border-orange-100 shadow-xl p-8 flex flex-col relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Input</span>
                  </div>
                  <div className="flex-1 flex flex-col justify-center mt-6">
                    <AnimatePresence mode="wait">
                      {isTextFeature ? (
                        <motion.div
                          key="text-input"
                          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                          className="flex flex-col h-full space-y-4 justify-center"
                        >
                          <textarea
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            placeholder={activeFeature === 'text-to-igbo' ? 'Type English text here…' : 'Type Igbo text here…'}
                            className="w-full h-40 p-4 border border-orange-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none bg-orange-50/50 text-slate-800"
                          />
                          <div className="flex gap-3 pt-2">
                            <button onClick={reset} className="px-4 py-3 text-slate-500 hover:text-slate-700 bg-white rounded-xl shadow-sm border border-slate-200 transition-all hover:bg-slate-50">
                              <RefreshCw className="w-5 h-5" />
                            </button>
                            <button
                              onClick={handleProcessText}
                              disabled={isLoading}
                              className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-semibold shadow-md hover:bg-orange-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-70"
                            >
                              {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                              <span>{isLoading ? 'Translating…' : 'Translate Text'}</span>
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
                            <p className="font-semibold text-slate-800 text-center">{isRecording ? 'Listening…' : 'Record Audio'}</p>
                          </div>
                          <label className="border-2 border-dashed border-orange-200 rounded-2xl p-6 flex flex-col items-center justify-center space-y-4 hover:border-orange-400 hover:bg-orange-50/50 transition-colors cursor-pointer group">
                            <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                            <div className="p-5 rounded-full bg-slate-100 text-slate-600 group-hover:bg-slate-200 group-hover:scale-105 transition-all shadow-sm">
                              <Upload className="w-8 h-8" />
                            </div>
                            <p className="font-semibold text-slate-800 text-center">Upload File</p>
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
                              <button onClick={reset} className="px-4 py-3 text-slate-500 hover:text-slate-700 bg-white rounded-xl shadow-sm border border-slate-200 transition-all hover:bg-slate-50">
                                <RefreshCw className="w-5 h-5" />
                              </button>
                              <button
                                onClick={handleProcessAudio}
                                disabled={isLoading}
                                className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-semibold shadow-md hover:bg-orange-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-70"
                              >
                                {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                                <span>{isLoading ? (loadingStep || 'Processing…') : activeFeature === 'audio-to-text' || activeFeature === 'audio-to-english-text' ? 'Transcribe' : 'Translate'}</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Output Panel */}
                <div className="bg-orange-500 rounded-[32px] shadow-xl p-8 flex flex-col relative text-white">
                  <div className="absolute top-0 right-0 p-4">
                    <span className="text-[10px] font-bold text-orange-200 uppercase tracking-widest">{outputLabel()}</span>
                  </div>
                  <div className="flex-1 mt-6 overflow-y-auto space-y-4">
                    {inputText && (
                      <div className="bg-orange-600/50 rounded-2xl p-4 border border-orange-400/30">
                        <p className="text-[10px] font-bold text-orange-200 uppercase tracking-widest mb-2">{inputLabel()}</p>
                        <p className="text-sm text-orange-100 leading-relaxed">{inputText}</p>
                      </div>
                    )}
                    {secondaryText && (
                      <div className="bg-orange-600/50 rounded-2xl p-4 border border-orange-400/30">
                        <p className="text-sm text-orange-100 leading-relaxed">{secondaryText}</p>
                      </div>
                    )}
                    {transcription ? (
                      <div>
                        {inputText && (
                          <p className="text-[10px] font-bold text-orange-200 uppercase tracking-widest mb-2">{outputLabel()}</p>
                        )}
                        <p className="text-xl md:text-2xl font-medium leading-relaxed whitespace-pre-wrap">{transcription}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full opacity-50 italic font-medium gap-2">
                        {isLoading
                          ? <><div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin" /><span>{loadingStep || 'Processing…'}</span></>
                          : 'Output will appear here…'}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-orange-400/30">
                    <button onClick={copyToClipboard} className="p-3 bg-orange-400/50 rounded-xl text-white hover:bg-orange-400 transition-colors">
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
                  <Settings className="w-5 h-5 text-orange-400" />Backend Configuration
                </h3>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                {[
                  { label: '🎙️ Speech-to-Text URL', val: tempUrl, set: setTempUrl, placeholder: 'https://speech-to-text.up.railway.app', hint: 'Hosts /api/transcribe and /api/live-translate' },
                  { label: '📝 Igbo → English URL', val: tempTranslationUrl, set: setTempTranslationUrl, placeholder: 'https://text-to-text.up.railway.app', hint: 'Used for Igbo-to-English translation modes' },
                  { label: '🔄 English → Igbo URL', val: tempEnToIgUrl, set: setTempEnToIgUrl, placeholder: 'https://english-to-igbo.up.railway.app', hint: 'Used for English-to-Igbo translation modes' },
                  { label: '🗣️ Text-to-Speech URL', val: tempTtsUrl, set: setTempTtsUrl, placeholder: 'https://text-to-speech.up.railway.app', hint: 'ElevenLabs TTS. Leave blank for browser voice.' },
                ].map(({ label, val, set, placeholder, hint }) => (
                  <div key={label}>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
                    <input
                      type="text" value={val} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                    />
                    <p className="text-xs text-slate-500 mt-1">{hint}</p>
                  </div>
                ))}

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">⚙️ Translation Engine</label>
                  <div className="flex gap-3">
                    {(['custom', 'google'] as TranslationEngine[]).map((eng) => (
                      <label key={eng} className="flex items-center gap-2 text-white cursor-pointer bg-slate-950 border border-slate-800 px-4 py-2 rounded-lg flex-1 hover:border-slate-600 transition-colors">
                        <input type="radio" name="engine" value={eng} checked={tempTranslationEngine === eng} onChange={() => setTempTranslationEngine(eng)} className="accent-orange-500 w-4 h-4" />
                        {eng === 'custom' ? 'Custom Model' : 'Google Translate'}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button onClick={() => setShowSettings(false)} className="px-4 py-2 rounded-lg font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">Cancel</button>
                  <button onClick={handleSaveSettings} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors shadow-lg shadow-orange-500/20">Save Changes</button>
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
            {isLiveRecording ? `Chunks: ${liveChunkId}` : 'Status: Ready'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
          <span className="hidden md:block">Powered by Whisper v3 · MarianMT</span>
          <button
            onClick={() => { setTempUrl(backendUrl); setTempTranslationUrl(translationBackendUrl); setTempEnToIgUrl(enToIgBackendUrl); setTempTranslationEngine(translationEngine); setTempTtsUrl(ttsBackendUrl); setShowSettings(true); }}
            className="flex items-center gap-1.5 hover:text-orange-400 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />Config
          </button>
        </div>
      </footer>
    </div>
  );
}
