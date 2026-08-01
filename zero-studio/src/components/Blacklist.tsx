import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ShieldAlert, Plus, X, AlertCircle } from 'lucide-react';

export default function Blacklist() {
  const [processes, setProcesses] = useState<string[]>([]);
  const [newProcess, setNewProcess] = useState('');
  const [loading, setLoading] = useState(true);

  const loadBlacklist = useCallback(async () => {
    try {
      const res = await invoke<any>('get_blacklist');
      if (res && res.processes) {
        const parsed = JSON.parse(res.processes);
        setProcesses(parsed);
      }
    } catch (e) {
      console.warn('Failed to load blacklist:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBlacklist();
  }, [loadBlacklist]);

  const addProcess = async () => {
    const name = newProcess.trim();
    if (!name) return;
    if (processes.includes(name)) {
      setNewProcess('');
      return;
    }
    try {
      await invoke('add_blacklist', { process: name });
      setProcesses([...processes, name]);
      setNewProcess('');
    } catch (e) {
      console.error('Failed to add to blacklist:', e);
    }
  };

  const removeProcess = async (process: string) => {
    try {
      await invoke('remove_blacklist', { process });
      setProcesses(processes.filter((p) => p !== process));
    } catch (e) {
      console.error('Failed to remove from blacklist:', e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addProcess();
    }
  };

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* Title */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="p-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">لیست سیاه</h2>
          <p className="text-xs text-slate-400">برنامه‌هایی که میانبر در آنها غیرفعال است</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-200/80">
          وقتی نام یک برنامه در لیست سیاه باشد، میانبر ضبط در آن برنامه کاملاً بی‌اثر می‌شود.
          نام پروسه را بدون مسیر وارد کنید (مثلاً <code className="bg-amber-500/10 px-1 rounded">chrome.exe</code>).
        </p>
      </div>

      {/* Add Input */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="نام پروسه (مثال: chrome.exe)"
          value={newProcess}
          onChange={(e) => setNewProcess(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-4 py-2 text-sm text-white placeholder:text-slate-600"
        />
        <button
          onClick={addProcess}
          disabled={!newProcess.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-semibold rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          افزودن
        </button>
      </div>

      {/* Process List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-500">در حال بارگذاری...</p>
          </div>
        ) : processes.length > 0 ? (
          processes.map((process) => (
            <div
              key={process}
              className="bg-slate-900/30 border border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between hover:border-slate-700/80 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                </div>
                <span className="text-sm font-mono text-slate-200">{process}</span>
              </div>
              <button
                onClick={() => removeProcess(process)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/20 transition"
                title="حذف از لیست سیاه"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))
        ) : (
          <div className="text-center py-8 bg-slate-900/10 border border-slate-800/60 rounded-xl">
            <p className="text-sm text-slate-500">لیست سیاه خالی است.</p>
            <p className="text-xs text-slate-600 mt-1">نام برنامه‌ای که می‌خواهید مسدود شود را وارد کنید.</p>
          </div>
        )}
      </div>

    </div>
  );
}
