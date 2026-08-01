import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { RefreshCw, Check, X } from 'lucide-react';

export default function InteractivePreview() {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    // Read the passed text from the window label or a custom event/storage
    // Since we can't easily pass props to a new window natively in Tauri 2 without events,
    // we assume the main window stored the text in localStorage before opening this.
    const previewText = localStorage.getItem('zero_preview_text') || '';
    setText(previewText);

    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleInsert = async () => {
    setIsSubmitting(true);
    try {
      await invoke('inject_text', { text });
      await appWindow.close();
    } catch (e) {
      console.error("Failed to inject text:", e);
      setIsSubmitting(false);
    }
  };

  const handleRetry = async () => {
    setIsSubmitting(true);
    try {
      await invoke('cancel_preview');
      await invoke('trigger_record');
      await appWindow.close();
    } catch (e) {
      console.error("Failed to retry:", e);
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setIsSubmitting(true);
    try {
      await invoke('cancel_preview');
      await appWindow.close();
    } catch (e) {
      console.error("Failed to cancel:", e);
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInsert();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div className="min-h-screen bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-4 text-slate-100 font-sans shadow-2xl shadow-blue-900/20" data-tauri-drag-region>
      <div className="flex justify-between items-center" data-tauri-drag-region>
        <span className="text-xs font-bold text-blue-400 flex items-center gap-2 pointer-events-none" data-tauri-drag-region>
          پیش‌نمایش تعاملی
        </span>
        <button onClick={handleCancel} className="text-slate-500 hover:text-rose-400 transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3 text-sm text-white resize-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition dir-rtl"
        placeholder="متن را اینجا ویرایش کنید..."
      />

      <div className="flex gap-3 mt-auto">
        <button
          onClick={handleRetry}
          disabled={isSubmitting}
          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          تلاش مجدد
        </button>
        <button
          onClick={handleInsert}
          disabled={isSubmitting}
          className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/20 disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          درج متن
        </button>
      </div>
    </div>
  );
}
