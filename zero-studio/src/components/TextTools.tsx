import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BookOpen, Plus, X, Mic, FileText, Sparkles, Check, Copy } from 'lucide-react';
import { DEFAULT_PERSIAN_PROMPTS, LLMPrompt } from '../config/persianPrompts';
import PlaceholderFillModal from './PlaceholderFillModal';

interface DictEntry {
  id: number;
  wrong: string;
  correct: string;
}

interface Snippet {
  id: number;
  trigger_text: string;
  replacement: string;
}

export default function TextTools() {
  const [activeTab, setActiveTab] = useState<'dictionary' | 'snippets' | 'prompts'>('dictionary');
  const [dictEntries, setDictEntries] = useState<DictEntry[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [prompts, setPrompts] = useState<LLMPrompt[]>(DEFAULT_PERSIAN_PROMPTS);
  const [activePromptId, setActivePromptId] = useState<string>('persian_clean_and_punctuate');
  const [fillModalText, setFillModalText] = useState<string | null>(null);

  const [newWrong, setNewWrong] = useState('');
  const [newCorrect, setNewCorrect] = useState('');
  const [newTrigger, setNewTrigger] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [dictRes, snipRes] = await Promise.all([
        invoke<any>('get_dictionary'),
        invoke<any>('get_snippets'),
      ]);
      if (dictRes?.entries) setDictEntries(JSON.parse(dictRes.entries));
      if (snipRes?.entries) setSnippets(JSON.parse(snipRes.entries));
    } catch (e) {
      console.warn('Failed to load text tools:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const savedPrompt = localStorage.getItem('zero_active_prompt_id');
    if (savedPrompt) setActivePromptId(savedPrompt);
  }, [loadData]);

  const selectPrompt = (id: string) => {
    setActivePromptId(id);
    localStorage.setItem('zero_active_prompt_id', id);
  };

  const copyPromptText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPromptId(id);
    setTimeout(() => setCopiedPromptId(null), 2000);
  };

  const addDictEntry = async () => {
    if (!newWrong.trim() || !newCorrect.trim()) return;
    try {
      await invoke('add_dictionary', { wrong: newWrong.trim(), correct: newCorrect.trim() });
      setNewWrong('');
      setNewCorrect('');
      loadData();
    } catch (e) { console.error(e); }
  };

  const removeDictEntry = async (id: number) => {
    try {
      await invoke('remove_dictionary', { id });
      setDictEntries(prev => prev.filter(e => e.id !== id));
    } catch (e) { console.error(e); }
  };

  const addSnippet = async () => {
    if (!newTrigger.trim() || !newReplacement.trim()) return;
    try {
      await invoke('add_snippet', { triggerText: newTrigger.trim(), replacement: newReplacement.trim() });
      setNewTrigger('');
      setNewReplacement('');
      loadData();
    } catch (e) { console.error(e); }
  };

  const removeSnippet = async (id: number) => {
    try {
      await invoke('remove_snippet', { id });
      setSnippets(prev => prev.filter(s => s.id !== id));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-6 text-slate-100">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="p-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">ابزارهای متنی و پردازش هوشمند صوتی</h2>
          <p className="text-xs text-slate-400">فرمان‌های صوتی فارسی، پرامپت‌های AI، دیکشنری شخصی و اسنیپت‌ها</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('dictionary')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'dictionary' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 inline ml-1.5" />
          دیکشنری و واژگان
        </button>
        <button
          onClick={() => setActiveTab('snippets')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'snippets' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5 inline ml-1.5" />
          اسنیپت‌ها
        </button>
        <button
          onClick={() => setActiveTab('prompts')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'prompts' ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 inline ml-1.5" />
          پرامپت‌های هوشمند AI
        </button>
      </div>

      {/* Voice Commands Info */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Mic className="w-4 h-4 text-rose-400" /> فرمان‌های صوتی فارسی حین ضبط
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-400">
          <div className="bg-slate-950/50 rounded-lg p-2">
            <span className="text-rose-300 font-bold">«پاکش کن»</span> — حذف آخرین کلمه
          </div>
          <div className="bg-slate-950/50 rounded-lg p-2">
            <span className="text-rose-300 font-bold">«خط جدید»</span> — اضافه کردن سطر جدید
          </div>
          <div className="bg-slate-950/50 rounded-lg p-2">
            <span className="text-rose-300 font-bold">«همه‌اش را پاک کن»</span> — پاک‌سازی کامل
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8"><p className="text-sm text-slate-500">در حال بارگذاری...</p></div>
      ) : activeTab === 'prompts' ? (
        /* AI Post-Processing Prompts Tab */
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-bold text-purple-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> تنظیم پرامپت هوشمند برای پردازش ثانویه گفتار
            </h3>
            <p className="text-xs text-slate-400">
              پرامپت فعال برای ویرایش، نگارش، رسم‌الخط فارسی و ترجمه گفتار پس از تبدیل به متن استفاده می‌شود.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {prompts.map(p => {
              const isActive = activePromptId === p.id;
              return (
                <div
                  key={p.id}
                  className={`border rounded-xl p-4 transition space-y-3 ${
                    isActive ? 'bg-purple-950/20 border-purple-500/50' : 'bg-slate-900/30 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        {p.name}
                        {p.category && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                            {p.category}
                          </span>
                        )}
                        {p.isDefault && (
                          <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30">
                            پیش‌فرض
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {/[\[\{]/.test(p.prompt) && (
                        <button
                          onClick={() => setFillModalText(p.prompt)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
                          title="پرکردن هوشمند فیلدهای جای‌خالی"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          پرکردن جای‌خالی
                        </button>
                      )}

                      <button
                        onClick={() => copyPromptText(p.id, p.prompt)}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition text-xs flex items-center gap-1"
                        title="کپی پرامپت"
                      >
                        {copiedPromptId === p.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={() => selectPrompt(p.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                          isActive
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {isActive ? <Check className="w-3.5 h-3.5" /> : null}
                        {isActive ? 'فعال است' : 'انتخاب'}
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-800/60 rounded-lg p-3 dir-rtl text-right">
                    <pre className="text-[11px] font-sans text-slate-300 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                      {p.prompt}
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === 'dictionary' ? (
        /* Dictionary */
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <p className="text-xs text-slate-400">
              کلمات غلط یا تلفظ اصطلاحات را به معادل درست تبدیل کنید. علاوه بر دیکشنری شخصی، واژگان تخصصی برنامه‌نویسی (مانند پایتون → Python) خودکار اعمال می‌شوند.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="کلمه غلط یا تلفظ..."
                value={newWrong}
                onChange={(e) => setNewWrong(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDictEntry()}
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white"
              />
              <input
                type="text"
                placeholder="کلمه درست..."
                value={newCorrect}
                onChange={(e) => setNewCorrect(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDictEntry()}
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white"
              />
              <button onClick={addDictEntry} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> افزودن
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {dictEntries.length > 0 ? dictEntries.map(entry => (
              <div key={entry.id} className="bg-slate-900/30 border border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-rose-400 font-bold line-through">{entry.wrong}</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-emerald-400 font-bold">{entry.correct}</span>
                </div>
                <button onClick={() => removeDictEntry(entry.id)} className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/20 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )) : (
              <div className="text-center py-6 text-xs text-slate-500">دیکشنری شخصی خالی است. (اصلاح واژگان تکنولوژی پیش‌فرض فعال است)</div>
            )}
          </div>
        </div>
      ) : (
        /* Snippets */
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <p className="text-xs text-slate-400">عبارت تریگر بگویید تا متن آماده درج شود. مثال: «امضای من» → متن امضا.</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="عبارت تریگر..."
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSnippet()}
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white"
              />
              <input
                type="text"
                placeholder="متن جایگزین..."
                value={newReplacement}
                onChange={(e) => setNewReplacement(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSnippet()}
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white"
              />
              <button onClick={addSnippet} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> افزودن
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {snippets.length > 0 ? snippets.map(snippet => (
              <div key={snippet.id} className="bg-slate-900/30 border border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-amber-400 font-bold">«{snippet.trigger_text}»</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-emerald-400">{snippet.replacement}</span>
                </div>
                <button onClick={() => removeSnippet(snippet.id)} className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/20 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )) : (
              <div className="text-center py-6 text-xs text-slate-500">هیچ اسنیپتی تعریف نشده.</div>
            )}
          </div>
        </div>
      )}

      {fillModalText && (
        <PlaceholderFillModal
          templateText={fillModalText}
          onClose={() => setFillModalText(null)}
        />
      )}
    </div>
  );
}
