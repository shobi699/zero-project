import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Mic, Square, Send, Copy, Wand2, Sparkles, X, Check, Globe, FileText, Move, ArrowRightLeft
} from 'lucide-react';
import { normalizePersianText } from '../utils/persianNormalizer';

function getSpeechRecognition(): any {
  const w = window as any;
  return w.webkitSpeechRecognition || w.SpeechRecognition || null;
}

interface FloatingVoiceWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  initialText?: string;
  mousePos?: { x: number; y: number };
  browserSttActive?: boolean;
  isWindow?: boolean;
}

export default function FloatingVoiceWidget({ isOpen, onClose, initialText = '', mousePos, browserSttActive, isWindow }: FloatingVoiceWidgetProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [text, setText] = useState(initialText);
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'done'>('idle');
  const [copied, setCopied] = useState(false);
  const [normalizedFlash, setNormalizedFlash] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [activeTone, setActiveTone] = useState<'normal' | 'formal' | 'friendly' | 'summary'>('normal');
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (initialText) {
      setText(initialText);
      setStatus('done');
    }
  }, [initialText]);

  // Listen to transcription events from daemon
  useEffect(() => {
    if (!isOpen) return;

    const unlistenStatus = listen('daemon-status-changed', (e: any) => {
      const st = e.payload?.status || 'Idle';
      if (st === 'Recording') setStatus('recording');
      else if (st === 'Processing') setStatus('processing');
      else if (st === 'Idle' && status === 'processing') setStatus('done');
    });

    const unlistenText = listen('transcription-done', (e: any) => {
      if (e.payload?.text) {
        setText(e.payload.text);
        setStatus('done');
        setIsRecording(false);
      }
    });

    return () => {
      unlistenStatus.then(fn => fn());
      unlistenText.then(fn => fn());
    };
  }, [isOpen, status]);

  if (!isOpen) return null;

  useEffect(() => {
    if (browserSttActive) {
      if (status !== 'recording') {
        startBrowserRecording();
      }
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
        setStatus('done');
        setIsRecording(false);
        handleInject();
      }
    }
  }, [browserSttActive]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const browserSttActiveRef = useRef(browserSttActive);
  useEffect(() => {
    browserSttActiveRef.current = browserSttActive;
  }, [browserSttActive]);

  const startBrowserRecording = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      console.error('تایپ صوتی در این مرورگر پشتیبانی نمی‌شود.');
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
      console.error(`خطا: ${event.error}`);
    };
    rec.onend = () => {
      setIsRecording(false);
      setInterimText('');
      recognitionRef.current = null;
      if (browserSttActiveRef.current) {
        // It stopped on its own (e.g. silence timeout).
        // If we are still supposed to be active, restart it!
        startBrowserRecording();
      }
    };
    rec.start();
    recognitionRef.current = rec;
    setIsRecording(true);
    setStatus('recording');
  };

  const handleToggleRecord = async () => {
    try {
      if (isRecording) {
        setIsRecording(false);
        if (!browserSttActive) {
            setStatus('processing');
        }
        await invoke('trigger_record');
      } else {
        setIsRecording(true);
        setStatus('recording');
        await invoke('trigger_record');
      }
    } catch (err) {
      console.error('Failed to toggle recording in widget:', err);
      setIsRecording(false);
      setStatus('idle');
    }
  };

  const handleNormalize = () => {
    const cleaned = normalizePersianText(text);
    setText(cleaned);
    setNormalizedFlash(true);
    setTimeout(() => setNormalizedFlash(false), 2000);
  };

  const handleApplyTone = (tone: 'formal' | 'friendly' | 'summary') => {
    setActiveTone(tone);
    let updated = text;
    if (tone === 'formal') {
      updated = text
        .replace(/سلام/g, 'با سلام و احترام،')
        .replace(/ممنون/g, 'با تشکر و سپاس فراوان،')
        .replace(/میخوام/g, 'تمایل دارم')
        .replace(/میخام/g, 'تمایل دارم');
    } else if (tone === 'friendly') {
      updated = text
        .replace(/با سلام و احترام،/g, 'سلام!')
        .replace(/با تشکر/g, 'خیلی ممنون رفیق!')
        .replace(/تمایل دارم/g, 'می‌خوام');
    } else if (tone === 'summary') {
      const words = text.split(' ');
      if (words.length > 10) {
        updated = words.slice(0, 10).join(' ') + '...';
      }
    }
    setText(normalizePersianText(updated));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInject = async () => {
    if (!text.trim()) {
      onClose();
      return;
    }
    setInjecting(true);
    try {
      await invoke('inject_text', { text });
    } catch (e) {
      console.error('Failed to inject text:', e);
    }
    setInjecting(false);
    onClose();
  };

  // Calculate dynamic floating position
  const widgetStyle: React.CSSProperties = mousePos ? {
    position: 'fixed',
    left: Math.min(window.innerWidth - 420, Math.max(20, mousePos.x - 200)),
    top: Math.min(window.innerHeight - 380, Math.max(20, mousePos.y - 320)),
    zIndex: 9999,
  } : {};

  return (
    <div
      className={isWindow ? 'w-full h-full p-4 flex items-center justify-center dir-rtl' : mousePos ? '' : 'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 dir-rtl'}
      onClick={(e) => {
        if (!mousePos && e.target === e.currentTarget && !isWindow) onClose();
      }}
    >
      <div
        style={isWindow ? undefined : widgetStyle}
        className={`${isWindow ? 'w-full' : 'max-w-md w-full'} bg-slate-900/95 border border-blue-500/30 rounded-2xl shadow-2xl shadow-blue-500/10 overflow-hidden flex flex-col p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl dir-rtl`}
      >
        
        {/* Header & Drag Handle */}
        <div data-tauri-drag-region className="flex items-center justify-between border-b border-slate-800 pb-2 cursor-move">
          <div data-tauri-drag-region className="flex items-center gap-2 pointer-events-none">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5 pointer-events-none">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 pointer-events-none" />
              ویجت شناور تایپ صوتی و هوش مصنوعی
            </h4>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Big Interactive Mic Button */}
        <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 rounded-xl p-3">
          <button
            onClick={handleToggleRecord}
            className={`w-12 h-12 rounded-xl flex items-center justify-center text-white transition-all shadow-lg shrink-0 ${
              status === 'recording'
                ? 'bg-rose-600 hover:bg-rose-500 animate-pulse shadow-rose-500/30'
                : status === 'processing'
                ? 'bg-amber-600 animate-spin shadow-amber-500/30'
                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
            }`}
            title={status === 'recording' ? 'توقف ضبط' : 'شروع تایپ صوتی'}
          >
            {status === 'recording' ? (
              <Square className="w-5 h-5 fill-current" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white">
              {status === 'recording'
                ? '🎙️ در حال ضبط گفتار شما...'
                : status === 'processing'
                ? '⏳ در حال تبدیل گفتار به متن...'
                : status === 'done'
                ? '✅ تبدیل صوتی انجام شد'
                : 'کلیک روی میکروفون جهت شروع تایپ صوتی'}
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {status === 'recording' ? 'برای پایان دکمه را مجدداً بزنید' : 'متن شما بلافاصله آماده ویرایش می‌شود'}
            </p>
          </div>
        </div>

        {/* Editable Output Text Area */}
        <div className="space-y-1 relative">
          <textarea
            value={text + (interimText ? (text ? ' ' : '') + interimText : '')}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-28 bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs text-slate-100 resize-none leading-relaxed font-sans"
            placeholder="متن تایپ‌شده صوتی در اینجا قرار می‌گیرد (امکان ویرایش سریع)..."
          />
        </div>

        {/* AI Tone & Fast Utility Bar */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
            <span className="text-slate-400 font-semibold shrink-0">لحن هوشمند:</span>
            <button
              onClick={() => handleApplyTone('formal')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded-md font-semibold transition shrink-0"
            >
              💼 رسمی و اداری
            </button>
            <button
              onClick={() => handleApplyTone('friendly')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-md font-semibold transition shrink-0"
            >
              💬 دوستانه و چت
            </button>
            <button
              onClick={() => handleApplyTone('summary')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded-md font-semibold transition shrink-0"
            >
              📝 خلاصه‌سازی
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-2 gap-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleNormalize}
                className="bg-slate-950 border border-teal-500/30 hover:border-teal-500/60 text-teal-400 hover:bg-teal-500/10 py-1.5 px-2.5 rounded-lg transition flex items-center gap-1 text-[11px] font-semibold"
                title="اصلاح نیم‌فاصله‌ها و علائم نگارشی"
              >
                {normalizedFlash ? <Check className="w-3 h-3 text-emerald-400" /> : <Wand2 className="w-3 h-3" />}
                {normalizedFlash ? 'اصلاح شد' : 'نیم‌فاصله'}
              </button>

              <button
                onClick={handleCopy}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 py-1.5 px-2.5 rounded-lg text-slate-300 hover:text-white transition flex items-center gap-1 text-[11px] font-semibold"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'کپی شد' : 'کپی'}
              </button>
            </div>

            <button
              onClick={handleInject}
              disabled={!text.trim() || injecting}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-3.5 rounded-lg flex items-center gap-1.5 text-xs transition shadow-lg shadow-blue-500/20 disabled:opacity-40 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              {injecting ? 'در حال درج...' : 'درج در نرم‌افزار'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
