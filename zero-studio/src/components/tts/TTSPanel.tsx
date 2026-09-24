import React, { useState, useEffect, useRef } from 'react';
import { Mic, Download, Play, StopCircle, RefreshCw, Settings, Sparkles } from 'lucide-react';
import VoiceModelManager from './VoiceModelManager';

interface TTSModel {
  id: string;
  name: string;
  engine: string;
  status: string;
}

export default function TTSPanel() {
  const [text, setText] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [tone, setTone] = useState('normal');
  const [speed, setSpeed] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [mode, setMode] = useState<'normal' | 'clone'>('normal');
  const [refAudio, setRefAudio] = useState<File | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModelManager, setShowModelManager] = useState(false);
  
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const recognitionRef = useRef<any>(null);

  const API_BASE = 'http://localhost:3000/tts'; // Adjust if NestJS runs on a different port

  useEffect(() => {
    fetchModels();
    
    // Check if text was transferred from Notepad
    const initialText = localStorage.getItem('tts_initial_text');
    if (initialText) {
      setText(initialText);
      localStorage.removeItem('tts_initial_text');
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch(`${API_BASE}/models`);
      if (res.ok) {
        const data = await res.json();
        const available = data.models || [];
        setModels(available);
        if (available.length > 0) {
          setSelectedModel(available[0]);
        }
      } else {
        // Fallback default voices
        const defaults = ['fa_female_1', 'fa_male_1'];
        setModels(defaults);
        setSelectedModel(defaults[0]);
      }
    } catch {
      // Quiet fallback when backend service is not running locally
      const defaults = ['fa_female_1', 'fa_male_1'];
      setModels(defaults);
      setSelectedModel(defaults[0]);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    if (mode === 'normal' && !selectedModel) {
      setError('لطفاً یک مدل صوتی انتخاب کنید.');
      return;
    }
    if (mode === 'clone' && !refAudio) {
      setError('لطفاً یک فایل صوتی الگو آپلود کنید.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setAudioUrl(null);

    try {
      let response;
      if (mode === 'normal') {
        const url = new URL(`${API_BASE}/generate`);
        url.searchParams.append('text', text);
        url.searchParams.append('model', selectedModel);
        url.searchParams.append('tone', tone);
        url.searchParams.append('speed', speed.toString());
        url.searchParams.append('volume', volume.toString());
        response = await fetch(url.toString());
      } else {
        const formData = new FormData();
        formData.append('text', text);
        formData.append('ref_audio', refAudio as Blob);
        response = await fetch(`${API_BASE}/clone`, {
          method: 'POST',
          body: formData,
        });
      }

      if (!response.ok) {
        throw new Error('خطا در تولید صدا');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(e => console.error("Auto-play failed:", e));
      }
    } catch (e: any) {
      setError(e.message || 'خطای غیرمنتظره‌ای رخ داد.');
    } finally {
      setIsGenerating(false);
    }
  };

  const startListening = () => {
    const w = window as any;
    const SpeechRecognition = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!SpeechRecognition) {
      setError('تایپ صوتی در این مرورگر پشتیبانی نمی‌شود.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'fa-IR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event: any) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (finalText) {
        setText((prev) => (prev ? prev + ' ' + finalText.trim() : finalText.trim()));
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };
    rec.onerror = (event: any) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      console.error('STT error', event.error);
      setIsListening(false);
    };
    rec.onend = () => setIsListening(false);
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimText('');
    }
  };

  const formatModelName = (rawName: string) => {
    let name = rawName;
    let type = '';
    
    if (rawName.includes('matcha-tts')) {
        type = 'Matcha-TTS';
        name = rawName.replace('matcha-tts-fa_en-', '');
    } else if (rawName.includes('vits-piper')) {
        type = 'Piper VITS';
        name = rawName.replace('vits-piper-fa_IR-', '').replace('-medium', '');
    }

    name = name.charAt(0).toUpperCase() + name.slice(1);

    const translations: Record<string, string> = {
        'Khadijah': 'خدیجه (زن)',
        'Musa': 'موسی (مرد)',
        'Amir': 'امیر (مرد)',
        'Gyro': 'جایرو (مرد)'
    };

    return `${translations[name] || name} — ${type}`;
  };

  return (
    <div className="bg-slate-900/40 rounded-2xl p-6 border border-slate-800 shadow-xl" dir="rtl">
      <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg">
            <Mic className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">آوا ساز هوشمند</h2>
            <p className="text-slate-400 text-sm">تبدیل متن به گفتار طبیعی</p>
          </div>
        </div>
        <button 
          onClick={() => setShowModelManager(true)}
          className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
          title="مدیریت مدل‌ها"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Settings Sidebar */}
        <div className="md:col-span-4 space-y-5">
          {/* Mode Switch */}
          <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
            <label className="block text-sm font-bold text-slate-300 mb-3">حالت تولید صدا</label>
            <div className="flex bg-slate-900 rounded-lg p-1">
              <button 
                onClick={() => setMode('normal')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition ${mode === 'normal' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
                عادی (آفلاین)
              </button>
              <button 
                onClick={() => setMode('clone')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition flex items-center justify-center gap-1 ${mode === 'clone' ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Sparkles className="w-3.5 h-3.5" /> شبیه‌سازی
              </button>
            </div>
          </div>

          {mode === 'normal' ? (
            <div className="bg-slate-950/30 rounded-xl p-4 border border-slate-800 space-y-4 animate-in fade-in">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">انتخاب صدای گوینده</label>
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
                  disabled={models.length === 0}
                >
                  {models.length === 0 ? (
                    <option value="">در حال بارگذاری...</option>
                  ) : (
                    models.map(m => (
                      <option key={m} value={m}>{formatModelName(m)}</option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">انتخاب لحن</label>
                <select 
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500 mb-4"
                >
                  <option value="normal">عادی (نرمال)</option>
                  <option value="angry">تند / جدی</option>
                  <option value="sad">آرام / غمگین</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 flex justify-between">
                  <span>سرعت پخش</span>
                  <span className="text-blue-400">{speed.toFixed(1)}x</span>
                </label>
                <input 
                  type="range" 
                  min="0.5" max="2.0" step="0.1" 
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-blue-500 mb-4"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 flex justify-between">
                  <span>بلندی صدا</span>
                  <span className="text-blue-400">{volume.toFixed(1)}</span>
                </label>
                <input 
                  type="range" 
                  min="0.5" max="2.0" step="0.1" 
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/30 rounded-xl p-4 border border-slate-800 space-y-4 animate-in fade-in">
               <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">آپلود فایل صدای الگو</label>
                <input 
                  type="file" 
                  accept="audio/wav, audio/mp3, audio/ogg"
                  onChange={(e) => setRefAudio(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600/20 file:text-indigo-400 hover:file:bg-indigo-600/30 cursor-pointer"
                />
              </div>
              <p className="text-[10px] text-amber-500/80 leading-relaxed">
                یک فایل صدای ۵ الی ۱۰ ثانیه‌ای واضح از فرد مورد نظر را آپلود کنید. پردازش این حالت زمان‌بر است.
              </p>
            </div>
          )}
        </div>

        {/* Text Area & Player */}
        <div className="md:col-span-8 flex flex-col space-y-4">
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-bold text-slate-300">متن خود را بنویسید</label>
              <button 
                onClick={isListening ? stopListening : startListening}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition ${
                  isListening 
                    ? 'bg-rose-500 text-white animate-pulse' 
                    : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                }`}
              >
                {isListening ? (
                  <><StopCircle className="w-4 h-4" /> توقف تایپ صوتی</>
                ) : (
                  <><Mic className="w-4 h-4" /> تایپ صوتی</>
                )}
              </button>
            </div>
            
            {isListening && interimText && (
               <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 mb-2">
                 <p className="text-xs text-rose-400 leading-relaxed">{interimText}</p>
               </div>
            )}
            <textarea 
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="متن فارسی خود را اینجا تایپ کنید تا به صوت تبدیل شود..."
              className="flex-1 min-h-[200px] w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none text-sm leading-relaxed"
            />
          </div>

          <button 
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim()}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> در حال پردازش هوش مصنوعی...</>
            ) : (
              <><Mic className="w-5 h-5" /> تولید صدای هوشمند</>
            )}
          </button>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-semibold">
              {error}
            </div>
          )}

          {audioUrl && (
            <div className="bg-slate-950/60 rounded-xl border border-slate-800 p-4 animate-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-emerald-400">پردازش با موفقیت انجام شد</span>
                <a 
                  href={audioUrl} 
                  download="zero-studio-voice.wav"
                  className="text-slate-400 hover:text-white p-1.5 bg-slate-800 rounded-md transition"
                  title="دانلود فایل"
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
              <audio ref={audioRef} controls className="w-full h-10 rounded-lg outline-none" src={audioUrl} />
            </div>
          )}
        </div>
      </div>

      {showModelManager && (
        <VoiceModelManager 
          onClose={() => {
            setShowModelManager(false);
            fetchModels();
          }} 
          apiBase={API_BASE}
        />
      )}
    </div>
  );
}
