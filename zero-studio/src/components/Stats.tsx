import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BarChart3, Clock, Type, Hash, Activity } from 'lucide-react';

interface UsageStats {
  total_entries: number;
  total_duration_secs: number;
  total_words: number;
  avg_duration_secs: number;
  by_engine: Record<string, number>;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.floor(secs)} ثانیه`;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  if (m < 60) return `${m} دقیقه و ${s} ثانیه`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h} ساعت و ${rm} دقیقه`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('fa-IR');
}

export default function Stats() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const res = await invoke<any>('get_usage_stats');
      if (res && res.stats) {
        setStats(JSON.parse(res.stats));
      }
    } catch (e) {
      console.warn('Failed to load stats:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-slate-500">در حال بارگذاری...</p>
      </div>
    );
  }

  if (!stats || stats.total_entries === 0) {
    return (
      <div className="space-y-6 text-slate-100">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">آمار استفاده</h2>
            <p className="text-xs text-slate-400">گزارش استفاده از تبدیل گفتار</p>
          </div>
        </div>
        <div className="text-center py-12 bg-slate-900/10 border border-slate-800/60 rounded-xl">
          <BarChart3 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">هنوز داده‌ای ثبت نشده است.</p>
          <p className="text-xs text-slate-600 mt-1">پس از اولین ضبط، آمار اینجا نمایش داده می‌شود.</p>
        </div>
      </div>
    );
  }

  const engineLabels: Record<string, string> = {
    hybrid: 'هیبرید',
    cloud: 'ابری',
    local: 'محلی',
    deferred: 'تأخیری',
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">آمار استفاده</h2>
          <p className="text-xs text-slate-400">گزارش استفاده از تبدیل گفتار</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-400">
            <Hash className="w-4 h-4" />
            <span className="text-xs font-semibold">تعداد ضبط</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(stats.total_entries)}</p>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-400">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-semibold">مدت کل</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatDuration(stats.total_duration_secs)}</p>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-400">
            <Type className="w-4 h-4" />
            <span className="text-xs font-semibold">تعداد کلمات</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(stats.total_words)}</p>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-400">
            <Activity className="w-4 h-4" />
            <span className="text-xs font-semibold">میانگین مدت</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatDuration(stats.avg_duration_secs)}</p>
        </div>
      </div>

      {/* Engine Breakdown */}
      {Object.keys(stats.by_engine).length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">توزیع موتور تبدیل</h3>
          <div className="space-y-3">
            {Object.entries(stats.by_engine).map(([engine, count]) => {
              const pct = Math.round((count / stats.total_entries) * 100);
              return (
                <div key={engine} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{engineLabels[engine] || engine}</span>
                    <span className="text-slate-300">{formatNumber(count)} ضبط ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
