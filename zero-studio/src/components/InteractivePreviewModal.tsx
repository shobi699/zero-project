import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, Copy, Sparkles, Send, X, Wand2 } from 'lucide-react';
import { normalizePersianText } from '../utils/persianNormalizer';

interface Props {
  text: string;
  x: number;
  y: number;
  onClose: () => void;
  isWindow?: boolean;
}

export default function InteractivePreviewModal({ text: initialText, onClose, isWindow }: Props) {
  const [editedText, setEditedText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [normalizedFlash, setNormalizedFlash] = useState(false);

  const handleNormalize = () => {
    const cleaned = normalizePersianText(editedText);
    setEditedText(cleaned);
    setNormalizedFlash(true);
    setTimeout(() => setNormalizedFlash(false), 2000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInject = async () => {
    setInjecting(true);
    try {
      await invoke('inject_text', { text: editedText });
    } catch (e) {
      console.error('Failed to inject text:', e);
    }
    setInjecting(false);
    onClose();
  };

  const handleCancel = async () => {
    try {
      await invoke('cancel_preview');
    } catch (e) {
      console.error('Failed to cancel preview:', e);
    }
    onClose();
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 dir-rtl ${isWindow ? 'bg-transparent' : 'bg-black/50 backdrop-blur-sm'}`}>
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col space-y-4 p-5 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div data-tauri-drag-region className="flex items-center justify-between border-b border-slate-800 pb-3 cursor-move">
          <div data-tauri-drag-region className="flex items-center gap-2 text-blue-400 pointer-events-none">
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse pointer-events-none" />
            <h3 className="text-sm font-bold text-white pointer-events-none">پنجره بازبینی و پیش‌نمایش شناور</h3>
          </div>
          <button
            onClick={handleCancel}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Text Field */}
        <div className="space-y-1">
          <label className="text-xs text-slate-400 font-semibold">متن تبدیل‌شده (قابل ویرایش قبل از درج):</label>
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full h-32 bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-sm text-slate-100 resize-none leading-relaxed"
            placeholder="متن تبدیل‌شده صوتی..."
          />
        </div>

        {/* Quick Tools & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleNormalize}
              className="bg-slate-950 border border-teal-500/30 hover:border-teal-500/60 text-teal-400 hover:bg-teal-500/10 py-1.5 px-3 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold"
              title="اصلاح کلمات ی/ک و نیم‌فاصله‌ها"
            >
              {normalizedFlash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Wand2 className="w-3.5 h-3.5" />}
              {normalizedFlash ? 'اصلاح شد!' : 'نیم‌فاصله‌ها'}
            </button>

            <button
              onClick={handleCopy}
              className="bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 py-1.5 px-3 rounded-lg text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'کپی شد' : 'کپی'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white py-2 px-3 rounded-lg text-xs font-semibold transition"
            >
              انصراف
            </button>

            <button
              onClick={handleInject}
              disabled={injecting}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-1.5 text-xs transition shadow-lg shadow-blue-500/20 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {injecting ? 'در حال درج...' : 'درج و تایپ نهایی'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
