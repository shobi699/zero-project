import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  FileText, Plus, Mic, MicOff, Save, Trash2, Copy, Check,
  Search, Clock, AlertCircle, Pin, PinOff, Download, Tag, X,
  Sparkles, Wand2, RefreshCw, Layers, Eye,
} from 'lucide-react';
import { normalizePersianText } from '../utils/persianNormalizer';
import PlaceholderFillModal from './PlaceholderFillModal';
import MarkdownPreviewModal from './MarkdownPreviewModal';

interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return iso;
}

function getSpeechRecognition(): any {
  const w = window as any;
  return w.webkitSpeechRecognition || w.SpeechRecognition || null;
}

interface NotepadProps {
  onTransferToTTS?: (text: string) => void;
}

export default function Notepad({ onTransferToTTS }: NotepadProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [recordError, setRecordError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [lang, setLang] = useState('fa-IR');
  const [sttMode, setSttMode] = useState('browser');
  const [loading, setLoading] = useState(true);
  const [showFillModal, setShowFillModal] = useState(false);
  const [showMdPreview, setShowMdPreview] = useState(false);
  const [normalizedFlash, setNormalizedFlash] = useState(false);
  const recognitionRef = useRef<any>(null);

  const handleNormalize = () => {
    if (!content) return;
    const cleaned = normalizePersianText(content);
    setContent(cleaned);
    setNormalizedFlash(true);
    setTimeout(() => setNormalizedFlash(false), 2000);
  };

  const loadNotes = useCallback(async () => {
    try {
      const res = await invoke<any>('get_notes');
      if (res && res.items) {
        setNotes(JSON.parse(res.items));
      }
    } catch (e) {
      console.warn('Failed to load notes:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotes();
    invoke<any>('get_config').then((res) => {
      if (res && res.config) {
        const cfg = JSON.parse(res.config);
        if (cfg.stt_mode) setSttMode(cfg.stt_mode);
      }
    }).catch(() => {});
  }, [loadNotes]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const activeNote = notes.find((n) => n.id === activeId) ?? null;

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const createNote = async () => {
    try {
      const res = await invoke<any>('create_note', {
        title: '',
        body: '',
        tags: '[]',
      });
      if (res && res.note) {
        const note = JSON.parse(res.note);
        setNotes((prev) => [note, ...prev]);
        setActiveId(note.id);
        setTitle('');
        setContent('');
        setTags([]);
      }
    } catch (e) {
      console.error('Failed to create note:', e);
    }
  };

  const selectNote = (id: string) => {
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
      setContent(note.body);
      setTags(note.tags || []);
    }
  };

  const saveCurrentNote = async () => {
    if (!activeId) return;
    try {
      await invoke('update_note', {
        id: activeId,
        title,
        body: content,
        tags: JSON.stringify(tags),
      });
      setNotes((prev) =>
        prev.map((n) =>
          n.id === activeId
            ? { ...n, title, body: content, tags, updated_at: new Date().toISOString() }
            : n
        )
      );
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      console.error('Failed to save note:', e);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await invoke('delete_note', { id });
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setTitle('');
        setContent('');
        setTags([]);
      }
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  };

  const togglePin = async (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    try {
      await invoke('pin_note', { id, pinned: !note.pinned });
      setNotes((prev) =>
        prev.map((n) => n.id === id ? { ...n, pinned: !n.pinned } : n)
      );
    } catch (e) {
      console.error('Failed to pin note:', e);
    }
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const exportMarkdown = () => {
    const md = `# ${title || 'بدون عنوان'}\n\n${content}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'note'}.md`;
    a.click();
    URL.revokeObjectURL(url);
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
      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) {
        setRecordError('تایپ صوتی در این مرورگر پشتیبانی نمی‌شود.');
        return;
      }
      const rec = new SpeechRecognition();
      rec.lang = lang;
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
          setContent((prev) => (prev ? prev + ' ' + finalText.trim() : finalText.trim()));
          setInterimText('');
        } else {
          setInterimText(interim);
        }
      };
      rec.onerror = (event: any) => {
        if (event.error === 'aborted' || event.error === 'no-speech') return;
        setRecordError(`خطا: ${event.error}`);
      };
      rec.onend = () => {
        setIsListening(false);
        setInterimText('');
        recognitionRef.current = null;
      };
      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);
    } else {
      setIsListening(true);
      try {
        const text = await invoke<string>('record_for_notepad');
        if (text) {
          setContent((prev) => (prev ? prev + ' ' + text : text));
        }
      } catch (e: any) {
        setRecordError(typeof e === 'string' ? e : 'خطا در تبدیل صوت');
      }
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (sttMode === 'browser' && recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    } else {
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
            <p className="text-xs text-slate-400">یادداشت‌های صوتی و متنی با جستجوی تمام‌متن</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-2 py-1 text-[11px] text-slate-300"
          >
            <option value="fa-IR">فارسی</option>
            <option value="en-US">English</option>
          </select>

          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="جستجو در یادداشت‌ها..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg pl-3 pr-9 py-1.5 text-xs text-white"
            />
          </div>

          <button
            onClick={createNote}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center gap-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            جدید
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        {/* Notes List */}
        <div className="w-full md:w-64 shrink-0 space-y-2 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-center py-8"><p className="text-xs text-slate-500">در حال بارگذاری...</p></div>
          ) : filteredNotes.length > 0 ? (
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
                  <span className="text-sm font-bold text-white truncate max-w-[60%] flex items-center gap-1.5">
                    {note.pinned && <Pin className="w-3 h-3 text-amber-400 shrink-0" />}
                    {note.title || 'بدون عنوان'}
                  </span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDate(note.updated_at)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">{note.body || '—'}</p>
                {note.tags && note.tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {note.tags.map((tag) => (
                      <span key={tag} className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
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
              <input
                type="text"
                placeholder="عنوان یادداشت..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-4 py-2.5 text-sm font-bold text-white placeholder:text-slate-600"
              />

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-2">
                {tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                    <Tag className="w-2.5 h-2.5" />
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-rose-400">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="تگ جدید..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    className="w-20 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded px-2 py-0.5 text-[11px] text-white"
                  />
                  <button onClick={addTag} className="text-[11px] text-blue-400 hover:text-blue-300">+</button>
                </div>
              </div>

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

              <div className="relative flex-1 min-h-[200px] flex flex-col">
                <textarea
                  placeholder="متن یادداشت را اینجا بنویسید یا دکمه میکروفن را بزنید..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-full min-h-[200px] bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 resize-none flex-1"
                />

                {/* Text Stats Counter Bar (PromptPad Style) */}
                <div className="flex items-center justify-between text-[10px] text-slate-500 px-3 py-1 bg-slate-950/80 border-x border-b border-slate-800/80 rounded-b-lg">
                  <span>کاراکترها: {content.length} | کلمات: {content.trim() ? content.trim().split(/\s+/).length : 0} | خطوط: {content ? content.split('\n').length : 0}</span>
                  {/[\[\{]/.test(content) && (
                    <button
                      onClick={() => setShowFillModal(true)}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> فیلدهای جای‌خالی کشف شد! کلیک کنید
                    </button>
                  )}
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`flex items-center gap-2 text-xs font-bold py-2 px-4 rounded-lg transition ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {isListening ? <><MicOff className="w-3.5 h-3.5" /> توقف</> : <><Mic className="w-3.5 h-3.5 text-blue-400" /> تایپ صوتی</>}
                </button>

                <button
                  onClick={handleNormalize}
                  className="bg-slate-950 border border-teal-500/30 hover:border-teal-500/60 text-teal-400 hover:bg-teal-500/10 py-2 px-3 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold"
                  title="اصلاح کلمات ی/ک، نیم‌فاصله‌ها و خطوط تکراری"
                >
                  {normalizedFlash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Wand2 className="w-3.5 h-3.5" />}
                  {normalizedFlash ? 'اصلاح شد!' : 'پاکسازی و نیم‌فاصله'}
                </button>

                <button
                  onClick={() => setShowFillModal(true)}
                  className="bg-slate-950 border border-amber-500/30 hover:border-amber-500/60 text-amber-400 hover:bg-amber-500/10 py-2 px-3 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold"
                  title="پرکردن خودکار جای‌خالی‌های [...]"
                >
                  <Sparkles className="w-3.5 h-3.5" /> پرکردن جای‌خالی
                </button>

                {onTransferToTTS && (
                  <button
                    onClick={() => onTransferToTTS(content)}
                    className="bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-400 py-2 px-3 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold ml-auto"
                    title="انتقال به پنل آواساز هوشمند"
                  >
                    <Mic className="w-3.5 h-3.5" /> تبدیل به صوت
                  </button>
                )}

                {recordError && (
                  <span className="text-[11px] text-rose-400 flex items-center gap-1 max-w-xs">
                    <AlertCircle className="w-3 h-3 shrink-0" /> {recordError}
                  </span>
                )}

                <div className="flex-1" />

                <button
                  onClick={() => togglePin(activeId)}
                  className="bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 py-2 px-3 rounded-lg text-slate-400 hover:text-amber-400 transition flex items-center gap-1.5 text-xs font-semibold"
                >
                  {activeNote?.pinned ? <><PinOff className="w-3.5 h-3.5" /> سنجاق</> : <><Pin className="w-3.5 h-3.5" /> سنجاق</>}
                </button>

                <button
                  onClick={() => copyContent(activeId, content)}
                  className="bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 py-2 px-3 rounded-lg text-slate-400 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
                >
                  {copiedId === activeId ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> کپی شد</> : <><Copy className="w-3.5 h-3.5" /> کپی</>}
                </button>

                <button
                  onClick={exportMarkdown}
                  className="bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 py-2 px-3 rounded-lg text-slate-400 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" /> Markdown
                </button>

                <button
                  onClick={() => setShowMdPreview(true)}
                  className="bg-slate-950 border border-purple-500/30 hover:border-purple-500/60 text-purple-400 hover:bg-purple-500/10 py-2 px-3 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold"
                  title="پیش‌نمایش زنده مارک‌داون"
                >
                  <Eye className="w-3.5 h-3.5" /> پیش‌نمایش
                </button>

                <button
                  onClick={saveCurrentNote}
                  className="bg-blue-600 hover:bg-blue-500 text-white py-2 px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold transition"
                >
                  {savedFlash ? <><Check className="w-3.5 h-3.5" /> ذخیره شد</> : <><Save className="w-3.5 h-3.5" /> ذخیره</>}
                </button>

                <button
                  onClick={() => deleteNote(activeId)}
                  className="border border-transparent hover:border-rose-900/30 hover:bg-rose-950/10 p-2 rounded-lg text-slate-500 hover:text-rose-400 transition"
                  title="حذف"
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

      {showFillModal && (
        <PlaceholderFillModal
          templateText={content}
          onClose={() => setShowFillModal(false)}
          onApply={(filledText) => setContent(filledText)}
        />
      )}

      {showMdPreview && (
        <MarkdownPreviewModal
          content={content}
          title={title ? `پیش‌نمایش: ${title}` : 'پیش‌نمایش زنده مارک‌داون'}
          onClose={() => setShowMdPreview(false)}
          onUpdateContent={(updated) => setContent(updated)}
        />
      )}
    </div>
  );
}
