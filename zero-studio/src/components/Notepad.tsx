import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  FileText,
  Plus,
  Mic,
  MicOff,
  Save,
  Trash2,
  Copy,
  Check,
  Search,
  Clock,
  AlertCircle,
} from 'lucide-react';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem('zero_notes');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem('zero_notes', JSON.stringify(notes));
}

function getSpeechRecognition(): any {
  const w = window as any;
  return w.webkitSpeechRecognition || w.SpeechRecognition || null;
}

export default function Notepad() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [recordError, setRecordError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [lang, setLang] = useState('fa-IR');
  const [sttMode, setSttMode] = useState('browser');
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load STT mode from config
  useEffect(() => {
    invoke<any>('get_config').then((res) => {
      if (res && res.config) {
        const cfg = JSON.parse(res.config);
        if (cfg.stt_mode) setSttMode(cfg.stt_mode);
      }
    }).catch(() => {});
  }, []);

  const activeNote = notes.find((n) => n.id === activeId) ?? null;

  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const createNote = () => {
    const id = generateId();
    const now = new Date().toISOString();
    const note: Note = { id, title: '', content: '', createdAt: now, updatedAt: now };
    setNotes((prev) => [note, ...prev]);
    setActiveId(id);
    setTitle('');
    setContent('');
  };

  const selectNote = (id: string) => {
    // Stop listening if switching notes
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
      setInterimText('');
    }
    const note = notes.find((n) => n.id === id);
    if (note) {
      setActiveId(id);
      setTitle(note.title);
      setContent(note.content);
    }
  };

  const saveCurrentNote = () => {
    if (!activeId) return;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === activeId
          ? { ...n, title, content, updatedAt: new Date().toISOString() }
          : n
      )
    );
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setTitle('');
      setContent('');
    }
  };

  const copyContent = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const startListening = async () => {
    setRecordError('');
    setInterimText('');

    if (sttMode === 'browser') {
      // Web Speech API
      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) {
        setRecordError('تایپ صوتی در این مرورگر پشتیبانی نمی‌شود. از Edge استفاده کنید.');
        return;
      }

      const rec = new SpeechRecognition();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        if (final) {
          setContent((prev) => (prev ? prev + ' ' + final.trim() : final.trim()));
          setInterimText('');
        } else {
          setInterimText(interim);
        }
      };

      rec.onerror = (event: any) => {
        if (event.error === 'aborted' || event.error === 'no-speech') return;
        const msg: Record<string, string> = {
          'not-allowed': 'دسترسی میکروفون مسدود شده.',
          'network': 'خطای شبکه.',
          'service-not-allowed': 'سرویس تشخیص گفتار در دسترس نیست.',
        };
        setRecordError(msg[event.error] || `خطا: ${event.error}`);
      };

      rec.onend = () => {
        setIsListening(false);
        setInterimText('');
        recognitionRef.current = null;
      };

      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);

    } else if (sttMode === 'local') {
      // Daemon IPC — whisper.cpp
      setIsListening(true);
      try {
        const text = await invoke<string>('record_for_notepad');
        if (text) {
          setContent((prev) => (prev ? prev + ' ' + text : text));
        }
      } catch (e: any) {
        setRecordError(typeof e === 'string' ? e : 'خطا در تبدیل صوت محلی');
      }
      setIsListening(false);

    } else if (sttMode === 'faster-whisper') {
      // Faster-Whisper server
      setIsListening(true);
      try {
        const text = await invoke<string>('record_for_notepad');
        if (text) {
          setContent((prev) => (prev ? prev + ' ' + text : text));
        }
      } catch (e: any) {
        setRecordError(typeof e === 'string' ? e : 'خطا در Faster-Whisper');
      }
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (sttMode === 'browser' && recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    } else if (sttMode === 'local' || sttMode === 'faster-whisper') {
      invoke('trigger_record').catch(() => {});
    }
    setIsListening(false);
    setInterimText('');
  };

  return (
    <div className="space-y-6 text-slate-100 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">دفتر یادداشت</h2>
            <p className="text-xs text-slate-400">تایپ صوتی رایگان — بدون نیاز به اینترنت یا مدل</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Language selector */}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-2 py-1 text-[11px] text-slate-300"
          >
            <option value="fa-IR">فارسی</option>
            <option value="en-US">English</option>
            <option value="auto">خودکار</option>
          </select>

          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="جستجو..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg pl-3 pr-9 py-1.5 text-xs text-white"
            />
          </div>

          <button
            onClick={createNote}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center gap-1.5 transition shadow-lg shadow-blue-500/10"
          >
            <Plus className="w-3.5 h-3.5" />
            یادداشت جدید
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        {/* Notes List */}
        <div className="w-full md:w-64 shrink-0 space-y-2 overflow-y-auto max-h-[60vh]">
          {filteredNotes.length > 0 ? (
            filteredNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => selectNote(note.id)}
                className={`w-full text-right bg-slate-900/30 border rounded-xl p-3 transition ${
                  activeId === note.id
                    ? 'border-blue-500 bg-blue-500/5'
                    : 'border-slate-800/80 hover:border-slate-700/80'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-white truncate max-w-[70%]">
                    {note.title || 'بدون عنوان'}
                  </span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDate(note.updatedAt)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">{note.content || '—'}</p>
              </button>
            ))
          ) : (
            <div className="text-center py-8 bg-slate-900/10 border border-slate-800/60 rounded-xl">
              <p className="text-xs text-slate-500">هیچ یادداشتی وجود ندارد.</p>
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {activeId ? (
            <>
              {/* Title */}
              <input
                type="text"
                placeholder="عنوان یادداشت..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-4 py-2.5 text-sm font-bold text-white placeholder:text-slate-600"
              />

              {/* Listening indicator + interim text */}
              {isListening && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                    <span className="text-xs font-bold text-rose-400">در حال گوش دادن...</span>
                  </div>
                  {interimText && (
                    <p className="text-xs text-slate-400 dir-auto text-right pr-4">{interimText}</p>
                  )}
                </div>
              )}

              {/* Textarea */}
              <div className="relative flex-1 min-h-[200px]">
                <textarea
                  ref={textareaRef}
                  placeholder="متن یادداشت را اینجا بنویسید یا دکمه میکروفن را بزنید..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-full min-h-[200px] bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 resize-none"
                />
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
                {/* Voice Button — Web Speech API */}
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`flex items-center gap-2 text-xs font-bold py-2 px-4 rounded-lg transition ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {isListening ? (
                    <>
                      <MicOff className="w-3.5 h-3.5" />
                      توقف
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 text-blue-400" />
                      تایپ صوتی
                    </>
                  )}
                </button>

                {recordError && (
                  <span className="text-[11px] text-rose-400 flex items-center gap-1 max-w-xs">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {recordError}
                  </span>
                )}

                <div className="flex-1" />

                {/* Copy */}
                <button
                  onClick={() => copyContent(activeId, content)}
                  className="bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 py-2 px-3 rounded-lg text-slate-400 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
                >
                  {copiedId === activeId ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      کپی شد
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      کپی متن
                    </>
                  )}
                </button>

                {/* Save */}
                <button
                  onClick={saveCurrentNote}
                  className="bg-blue-600 hover:bg-blue-500 text-white py-2 px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold transition shadow-lg shadow-blue-500/10"
                >
                  {savedFlash ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      ذخیره شد
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      ذخیره
                    </>
                  )}
                </button>

                {/* Delete */}
                <button
                  onClick={() => deleteNote(activeId)}
                  className="border border-transparent hover:border-rose-900/30 hover:bg-rose-950/10 p-2 rounded-lg text-slate-500 hover:text-rose-400 transition"
                  title="حذف یادداشت"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-900/10 border border-slate-800/60 rounded-xl">
              <div className="text-center space-y-2">
                <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm text-slate-500">یک یادداشت انتخاب کنید یا جدید بسازید.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
