import React, { useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Video, VideoOff, Clock, Copy, Check, Save, FileText, AlertCircle } from 'lucide-react';

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function MeetingMode() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedToNotes, setSavedToNotes] = useState(false);
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = async () => {
    setError('');
    setTranscript('');
    setElapsed(0);
    try {
      await invoke('start_meeting');
      setIsRecording(true);
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - startTimeRef.current) / 1000);
      }, 1000);
    } catch (e: any) {
      setError(typeof e === 'string' ? e : 'خطا در شروع ضبط');
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setIsProcessing(true);
    setError('');
    try {
      const result = await invoke<string>('stop_meeting');
      if (result) {
        setTranscript(result);
      } else {
        setError('ترنسکریپت خالی برگشت');
      }
    } catch (e: any) {
      setError(typeof e === 'string' ? e : 'خطا در ترنسکریپت');
    }
    setIsProcessing(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveToNotes = async () => {
    try {
      const title = `جلسه ${new Date().toLocaleDateString('fa-IR')}`;
      await invoke('create_note', {
        title,
        body: transcript,
        tags: '["جلسه","ترنسکریپت"]',
      });
      setSavedToNotes(true);
      setTimeout(() => setSavedToNotes(false), 2000);
    } catch (e) {
      console.error('Failed to save to notes:', e);
    }
  };

  const exportMarkdown = () => {
    const blob = new Blob([transcript], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="p-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg">
          <Video className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">حالت جلسه</h2>
          <p className="text-xs text-slate-400">ضبط طولانی و ترنسکریپت کامل جلسات</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Record Button */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                isRecording
                  ? 'bg-rose-500 hover:bg-rose-600 animate-pulse shadow-lg shadow-rose-500/30'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isRecording ? (
                <VideoOff className="w-6 h-6 text-white" />
              ) : (
                <Video className="w-6 h-6 text-white" />
              )}
            </button>

            <div>
              <p className="text-sm font-bold text-white">
                {isRecording ? 'در حال ضبط...' : isProcessing ? 'در حال ترنسکریپت...' : 'آماده ضبط'}
              </p>
              <p className="text-xs text-slate-400">
                {isRecording
                  ? 'برای توقف و ترنسکریپت، دکمه را دوباره بزنید'
                  : isProcessing
                  ? 'لطفاً صبر کنید...'
                  : 'حداکثر ۶۰ دقیقه'}
              </p>
            </div>
          </div>

          {/* Timer */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-2xl font-mono font-bold text-white tabular-nums">
              {formatDuration(elapsed)}
            </span>
          </div>
        </div>

        {/* Progress bar during processing */}
        {isProcessing && (
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-blue-500 h-full rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-rose-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
      </div>

      {/* Transcript */}
      {transcript && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">ترنسکریپت</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-400 hover:text-white transition"
              >
                {copied ? <><Check className="w-3 h-3 text-emerald-400" /> کپی شد</> : <><Copy className="w-3 h-3" /> کپی</>}
              </button>
              <button
                onClick={saveToNotes}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
              >
                {savedToNotes ? <><Check className="w-3 h-3" /> ذخیره شد</> : <><Save className="w-3 h-3" /> ذخیره در یادداشت</>}
              </button>
              <button
                onClick={exportMarkdown}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-400 hover:text-white transition"
              >
                <FileText className="w-3 h-3" /> Markdown
              </button>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 max-h-96 overflow-y-auto">
            <pre className="text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed">{transcript}</pre>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!transcript && !isRecording && !isProcessing && (
        <div className="text-center py-12 bg-slate-900/10 border border-slate-800/60 rounded-xl">
          <Video className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">برای شروع ضبط جلسه، دکمه بالا را بزنید.</p>
          <p className="text-xs text-slate-600 mt-1">ضبط تا ۶۰ دقیقه پشتیبانی می‌شود.</p>
        </div>
      )}
    </div>
  );
}
