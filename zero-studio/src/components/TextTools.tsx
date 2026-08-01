import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BookOpen, Plus, X, Mic, FileText, AlertCircle } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'dictionary' | 'snippets'>('dictionary');
  const [dictEntries, setDictEntries] = useState<DictEntry[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [newWrong, setNewWrong] = useState('');
  const [newCorrect, setNewCorrect] = useState('');
  const [newTrigger, setNewTrigger] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
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

  useEffect(() => { loadData(); }, [loadData]);

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
          <h2 className="text-xl font-bold text-white">ابزارهای متنی</h2>
          <p className="text-xs text-slate-400">فرمان‌های صوتی، دیکشنری شخصی و اسنیپت‌ها</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('dictionary')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'dictionary' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 inline ml-1.5" />
          دیکشنری
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
      </div>

      {/* Voice Commands Info */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Mic className="w-4 h-4 text-rose-400" /> فرمان‌های صوتی ویرایش
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
      ) : activeTab === 'dictionary' ? (
        /* Dictionary */
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <p className="text-xs text-slate-400">کلمات غلط را به درست تبدیل کنید. اصلاح خودکار قبل از درج اعمال می‌شود.</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="کلمه غلط..."
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
              <div className="text-center py-6 text-xs text-slate-500">دیکشنری خالی است.</div>
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
    </div>
  );
}
