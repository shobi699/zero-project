import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { History as HistoryIcon, Clipboard, Check, Trash2, Search, Calendar, Clock, AlertTriangle } from 'lucide-react';

interface HistoryItem {
  id: string;
  datetime: string;
  duration_secs: number;
  text: string;
  strategy: string;
  engine: string;
}

export default function History() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      const res = await invoke<any>('get_history');
      if (res && res.items) {
        const parsed = JSON.parse(res.items);
        setItems(parsed);
      }
    } catch (e) {
      console.warn('Failed to load history:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const deleteItem = async (id: string) => {
    try {
      await invoke('delete_history', { id });
      setItems(items.filter((item) => item.id !== id));
    } catch (e) {
      console.error('Failed to delete history item:', e);
    }
  };

  const deleteAll = async () => {
    if (!confirm('آیا از حذف تمام تاریخچه اطمینان دارید؟')) return;
    try {
      await invoke('delete_all_history');
      setItems([]);
    } catch (e) {
      console.error('Failed to delete all history:', e);
    }
  };

  const filteredItems = items.filter((item) =>
    item.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* Title & Search */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
            <HistoryIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">تاریخچه ضبط‌ها</h2>
            <p className="text-xs text-slate-400">تاریخچه تبدیل‌های قبلی و روش‌های درج متن</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="جستجو در میان متن‌ها..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg pl-3 pr-9 py-1.5 text-xs text-white"
            />
          </div>

          {/* Delete All */}
          {items.length > 0 && (
            <button
              onClick={deleteAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 rounded-lg transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف همه
            </button>
          )}
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-slate-500">در حال بارگذاری...</p>
          </div>
        ) : filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex flex-col md:flex-row justify-between md:items-center gap-4 hover:border-slate-700/80 transition"
            >
              {/* Info & Text */}
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {item.datetime}
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {item.duration_secs.toFixed(1)} ثانیه
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-750 px-2 py-0.5 rounded font-mono">
                    {item.strategy}
                  </span>
                  {item.engine === 'cloud' && (
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">
                      ابری
                    </span>
                  )}
                  {item.engine === 'local' && (
                    <span className="text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full font-bold">
                      محلی آفلاین
                    </span>
                  )}
                  {item.engine === 'deferred' && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                      صف تأخیری
                    </span>
                  )}
                </div>
                
                <p className="text-sm font-semibold text-slate-100">{item.text}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 border-t md:border-t-0 border-slate-800/50 pt-3 md:pt-0">
                <button
                  onClick={() => copyToClipboard(item.id, item.text)}
                  className="bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 p-2 rounded-lg text-slate-400 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
                >
                  {copiedId === item.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      کپی شد
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-3.5 h-3.5" />
                      کپی متن
                    </>
                  )}
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="border border-transparent hover:border-rose-900/30 hover:bg-rose-950/10 p-2 rounded-lg text-slate-500 hover:text-rose-400 transition"
                  title="حذف تاریخچه"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-slate-900/10 border border-slate-800/60 rounded-xl">
            <p className="text-sm text-slate-500">هیچ سابقه ضبطی یافت نشد.</p>
          </div>
        )}
      </div>

    </div>
  );
}
