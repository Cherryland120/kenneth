import React, { useState, useRef } from 'react';
import { Mic, Upload, StopCircle, Play, FileAudio, RefreshCw, Languages, Copy, Check, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [igboText, setIgboText] = useState<string>(''); // Intermediate Igbo text when chaining
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>(''); // Shows which step is in progress
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'transcribe' | 'translate'>('transcribe');
  const [copied, setCopied] = useState(false);
  
  const [backendUrl, setBackendUrl] = useState<string>(
    localStorage.getItem('backendUrl') || 'https://curvy-jobs-see.loca.lt'
  );
  const [translationBackendUrl, setTranslationBackendUrl] = useState<string>(
    localStorage.getItem('translationBackendUrl') || ''
  );
  const [translationEngine, setTranslationEngine] = useState<'custom' | 'google'>(
    (localStorage.getItem('translationEngine') as 'custom' | 'google') || 'custom'
  );
  const [showSettings, setShowSettings] = useState(false);
  const [tempUrl, setTempUrl] = useState(backendUrl);
  const [tempTranslationUrl, setTempTranslationUrl] = useState(translationBackendUrl);
  const [tempTranslationEngine, setTempTranslationEngine] = useState<'custom' | 'google'>(translationEngine);

  const handleSaveSettings = () => {
    let finalUrl = tempUrl.trim().replace(/\/$/, '');
    if (finalUrl && !finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
    setBackendUrl(finalUrl);
    localStorage.setItem('backendUrl', finalUrl);

    let finalTranslationUrl = tempTranslationUrl.trim().replace(/\/$/, '');
    if (finalTranslationUrl && !finalTranslationUrl.startsWith('http')) finalTranslationUrl = 'https://' + finalTranslationUrl;
    setTranslationBackendUrl(finalTranslationUrl);
    localStorage.setItem('translationBackendUrl', finalTranslationUrl);

    setTranslationEngine(tempTranslationEngine);
    localStorage.setItem('translationEngine', tempTranslationEngine);

    setShowSettings(false);
  };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError('Microphone access denied. Please ensure you have granted permission.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioBlob(file);
      setAudioUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleProcessAudio = async () => {
    if (!audioBlob) return;
    setIsLoading(true);
    setError(null);
    setIgboText('');
    setTranscription('');

    try {
      const formData = new FormData();
      formData.append('file', audioBlob);
      formData.append('audio', audioBlob);

      // --- Step 1: Always transcribe Igbo audio → Igbo text via speech-to-text ---
      setLoadingStep('Transcribing Igbo audio...');
      const sttRes = await fetch(`${backendUrl}/api/transcribe`, {
        method: 'POST',
        body: formData,
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });

      if (!sttRes.ok) throw new Error('Speech-to-text backend not reachable');

      const sttData = await sttRes.json();
      const igboTranscription = sttData.text || '';

      if (!igboTranscription) {
        setError(sttData.error || 'No speech detected. Please try recording again.');
        setIsLoading(false);
        setLoadingStep('');
        return;
      }

      // If mode is just transcribe, we are done
      if (mode === 'transcribe') {
        setTranscription(igboTranscription);
        setIsLoading(false);
        setLoadingStep('');
        return;
      }

      // --- Step 2 (translate mode): Pass Igbo text → English via text-to-text ---
      setIgboText(igboTranscription); // Show intermediate Igbo text
      setLoadingStep('Translating to English...');

      if (!translationBackendUrl) {
        // Still show the Igbo transcription — just skip translation
        setTranscription(igboTranscription);
        setError('⚠️ Translation backend URL not configured. Add it in Settings to get English output. Showing Igbo transcription only.');
        setIsLoading(false);
        setLoadingStep('');
        return;
      }

      const mtRes = await fetch(`${translationBackendUrl}/api/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ text: igboTranscription, engine: translationEngine })
      });

      if (!mtRes.ok) throw new Error('Text-to-text backend not reachable');

      const mtData = await mtRes.json();
      const englishTranslation = mtData.translated_text || mtData.error || 'No translation received.';
      setTranscription(englishTranslation);

      // Speak the English translation aloud
      if (mtData.translated_text) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(mtData.translated_text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }

    } catch (err: any) {
      console.error(err);
      const msg = err.message || 'Unknown error';
      if (msg.includes('Speech-to-text')) {
        setError('❌ Speech-to-text backend is offline or unreachable. Check your Railway service.');
      } else if (msg.includes('Text-to-text')) {
        // Still show the Igbo text we managed to get
        if (igboText) setTranscription(igboText);
        setError('❌ Translation backend unreachable. Showing Igbo transcription only.');
      } else {
        setError('❌ Error: ' + msg);
      }
    }

    setIsLoading(false);
    setLoadingStep('');
  };

  const reset = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscription('');
    setIgboText('');
    setError(null);
    setCopied(false);
    setLoadingStep('');
  };

  const copyToClipboard = () => {
    if (transcription) {
      navigator.clipboard.writeText(transcription);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="h-screen bg-[#FEF9EC] flex flex-col font-sans text-slate-800 overflow-hidden">
      {/* Top Navigation */}
      <nav className="h-20 bg-white border-b border-orange-100 flex items-center justify-between px-6 md:px-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-sm">
            <Languages className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            Igbo<span className="text-orange-500">Sync</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-3 border-l pl-6 border-orange-100">
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase">Model Active</p>
              <p className="text-xs font-mono text-orange-600 max-w-[200px] truncate">whisper-large-v3-igbo</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-orange-100 border-2 border-white shadow-sm flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Workspace */}
      <main className="flex-1 p-4 md:p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full overflow-y-auto">
        
        {/* Language Selector Bar / Mode Toggle */}
        <div className="flex items-center justify-center gap-4 shrink-0 mt-4 md:mt-0">
          <div className="bg-white p-1 rounded-full shadow-sm border border-orange-50 flex items-center">
            <button
              onClick={() => setMode('transcribe')}
              className={`px-8 py-3 rounded-full text-sm font-semibold transition-all ${
                mode === 'transcribe'
                  ? 'bg-orange-50 text-orange-600 shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Igbo Audio → Igbo Text
            </button>
            <button
              onClick={() => setMode('translate')}
              className={`px-8 py-3 rounded-full text-sm font-semibold transition-all ${
                mode === 'translate'
                  ? 'bg-orange-50 text-orange-600 shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Igbo Audio → English Text
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-2xl text-sm border border-red-100 flex items-center justify-center shrink-0">
            <span className="font-medium text-center">{error}</span>
          </div>
        )}

        {/* Translation Interface */}
        <div className="flex-1 grid md:grid-cols-2 gap-8 min-h-[400px]">
          
          {/* Input Section */}
          <div className="bg-white rounded-[32px] border border-orange-100 shadow-xl p-8 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Input Source</span>
            </div>

            <div className="flex-1 flex flex-col justify-center mt-6">
              <AnimatePresence mode="wait">
                {!audioBlob ? (
                  <motion.div
                    key="input-methods"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-2 gap-4 h-full content-center"
                  >
                    {/* Record Control */}
                    <div 
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center space-y-4 transition-colors group cursor-pointer ${
                        isRecording 
                          ? 'border-red-300 bg-red-50' 
                          : 'border-orange-200 hover:border-orange-400 hover:bg-orange-50/50'
                      }`}
                    >
                      <div className={`p-5 rounded-full transition-all shadow-sm ${
                        isRecording 
                          ? 'bg-red-100 text-red-600 animate-pulse' 
                          : 'bg-orange-100 text-orange-600 group-hover:scale-105'
                      }`}>
                        {isRecording ? <StopCircle className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-slate-800">
                          {isRecording ? 'Listening...' : 'Record Audio'}
                        </p>
                      </div>
                    </div>

                    {/* Upload Control */}
                    <label className="border-2 border-dashed border-orange-200 rounded-2xl p-6 flex flex-col items-center justify-center space-y-4 hover:border-orange-400 hover:bg-orange-50/50 transition-colors cursor-pointer group">
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
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
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
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
                        <button
                          onClick={reset}
                          className="px-4 py-3 text-slate-500 hover:text-slate-700 bg-white rounded-xl shadow-sm border border-slate-200 transition-all hover:bg-slate-50"
                          title="Reset"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
                        <button
                          onClick={handleProcessAudio}
                          disabled={isLoading}
                          className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-semibold shadow-md hover:bg-orange-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-70"
                        >
                          {isLoading ? (
                            <RefreshCw className="w-5 h-5 animate-spin" />
                          ) : (
                            <Play className="w-5 h-5" />
                          )}
                          <span>
                            {isLoading 
                              ? 'Model Processing...' 
                              : mode === 'transcribe' 
                                ? 'Transcribe Audio' 
                                : 'Translate Audio'
                            }
                          </span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Output Section */}
          <div className="bg-orange-500 rounded-[32px] shadow-xl p-8 flex flex-col relative text-white">
            <div className="absolute top-0 right-0 p-4">
              <span className="text-[10px] font-bold text-orange-200 uppercase tracking-widest">
                {mode === 'transcribe' ? 'Igbo Transcription' : 'English Translation'}
              </span>
            </div>
            
            <div className="flex-1 mt-6 overflow-y-auto space-y-4">
              {/* Show intermediate Igbo text when in translate mode and chaining */}
              {mode === 'translate' && igboText && (
                <div className="bg-orange-600/50 rounded-2xl p-4 border border-orange-400/30">
                  <p className="text-[10px] font-bold text-orange-200 uppercase tracking-widest mb-2">Igbo (Transcribed)</p>
                  <p className="text-sm text-orange-100 leading-relaxed">{igboText}</p>
                </div>
              )}

              {transcription ? (
                <div>
                  {mode === 'translate' && igboText && (
                    <p className="text-[10px] font-bold text-orange-200 uppercase tracking-widest mb-2">English (Translated)</p>
                  )}
                  <p className="text-xl md:text-2xl font-medium leading-relaxed whitespace-pre-wrap">
                    {transcription}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full opacity-50 italic font-medium gap-2">
                  {isLoading ? (
                    <>
                      <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      <span>{loadingStep || 'Processing...'}</span>
                    </>
                  ) : 'Output will appear here...'}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-orange-400/30">
              <div className="flex gap-2">
                <button 
                  onClick={copyToClipboard}
                  className="p-3 bg-orange-400/50 rounded-xl text-white hover:bg-orange-400 transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                {transcription && !isLoading && (
                  <span className="text-xs font-bold bg-white/20 px-3 py-1.5 rounded-lg shadow-sm">
                    Success
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-orange-400" />
                  Backend Configuration
                </h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    🎙️ Speech-to-Text URL
                  </label>
                  <input 
                    type="text"
                    value={tempUrl}
                    onChange={(e) => setTempUrl(e.target.value)}
                    placeholder="https://speech-to-text.up.railway.app"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Your Whisper (speech-to-text) Railway service URL.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    📝 Text-to-Text (Translation) URL
                  </label>
                  <input 
                    type="text"
                    value={tempTranslationUrl}
                    onChange={(e) => setTempTranslationUrl(e.target.value)}
                    placeholder="https://text-to-text.up.railway.app"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                  />
                  <p className="text-xs text-slate-500 mt-2 mb-4">
                    Your MarianMT (Igbo → English translation) Railway service URL.
                  </p>

                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    ⚙️ Translation Engine
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-white cursor-pointer bg-slate-950 border border-slate-800 px-4 py-2 rounded-lg flex-1">
                      <input 
                        type="radio" 
                        name="engine" 
                        value="custom" 
                        checked={tempTranslationEngine === 'custom'}
                        onChange={() => setTempTranslationEngine('custom')}
                        className="accent-orange-500 w-4 h-4"
                      />
                      Custom Model
                    </label>
                    <label className="flex items-center gap-2 text-white cursor-pointer bg-slate-950 border border-slate-800 px-4 py-2 rounded-lg flex-1">
                      <input 
                        type="radio" 
                        name="engine" 
                        value="google" 
                        checked={tempTranslationEngine === 'google'}
                        onChange={() => setTempTranslationEngine('google')}
                        className="accent-orange-500 w-4 h-4"
                      />
                      Google Translate
                    </label>
                  </div>
                </div>
                
                <div className="pt-2 flex justify-end gap-3">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="px-4 py-2 rounded-lg font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveSettings}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors shadow-lg shadow-orange-500/20"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Status Bar */}
      <footer className="h-12 bg-slate-900 px-6 md:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-orange-400 animate-pulse' : 'bg-green-400'}`}></div>
            <span className="text-[10px] text-slate-400 font-mono">
              API: {isLoading ? 'Processing' : 'Standby'} (FastAPI)
            </span>
          </div>
          <div className="h-4 w-[1px] bg-slate-700"></div>
          <span className="text-[10px] text-slate-400 font-mono">Status: Ready</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
          <span className="hidden md:block">Powered by Transformers & Whisper v3 Igbo</span>
          <button 
            onClick={() => {
              setTempUrl(backendUrl);
              setTempTranslationUrl(translationBackendUrl);
              setTempTranslationEngine(translationEngine);
              setShowSettings(true);
            }}
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

