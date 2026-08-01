import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Mic, Settings as SettingsIcon, History as HistoryIcon, FileText, ShieldAlert, LogOut, Trash2, Video, BarChart3, BookOpen } from 'lucide-react';

import Onboarding from './components/Onboarding';
import Settings from './components/Settings';
import History from './components/History';
import Notepad from './components/Notepad';
import Blacklist from './components/Blacklist';
import MeetingMode from './components/MeetingMode';
import Stats from './components/Stats';
import TextTools from './components/TextTools';

export default function App() {
  const [onboarded, setOnboarded] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'history' | 'notepad' | 'blacklist' | 'meeting' | 'stats' | 'texttools'>('settings');
  const [daemonStatus, setDaemonStatus] = useState<string>('Idle');

  // Check onboarding status on mount
  useEffect(() => {
    const isCompleted = localStorage.getItem('zero_onboarded');
    if (isCompleted === 'true') {
      setOnboarded(true);
    }
    fetchDaemonStatus();
    // Poll daemon status every 3 seconds
    const interval = setInterval(fetchDaemonStatus, 3000);

    // Listen for interactive preview requests
    const unlistenPreview = listen('interactive-preview', (event: any) => {
      const { text, x, y } = event.payload;
      localStorage.setItem('zero_preview_text', text);
      
      const webview = new WebviewWindow('preview', {
        url: '/',
        title: 'Preview',
        transparent: true,
        decorations: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        width: 400,
        height: 250,
        x: x,
        y: Math.max(0, y - 280) // Position above cursor
      });

      webview.once('tauri://error', function (e) {
        console.error('Failed to create webview window:', e);
      });
    });

    return () => {
      clearInterval(interval);
      unlistenPreview.then(f => f());
    };
  }, [onboarded]);

  const fetchDaemonStatus = async () => {
    if (!onboarded) return;
    try {
      const res = await invoke<any>('get_daemon_status');
      if (res && res.status) {
        setDaemonStatus(res.status);
      }
    } catch (e) {
      console.warn("Failed to get daemon status: ", e);
    }
  };

  const handleOnboardingComplete = (config: any) => {
    localStorage.setItem('zero_onboarded', 'true');
    localStorage.setItem('zero_gateway_url', config.gatewayUrl);
    setOnboarded(true);
  };

  const handleSaveSettings = async (settings: any) => {
    try {
      await invoke('update_settings', { settings: JSON.stringify(settings) });
    } catch (e) {
      console.error("Failed to send settings to daemon: ", e);
    }
  };

  const triggerManualRecord = async () => {
    try {
      await invoke('trigger_record');
      fetchDaemonStatus();
    } catch (e) {
      console.error("Failed to trigger record: ", e);
    }
  };

  const handleDeleteAllData = async () => {
    if (!confirm('آیا از حذف تمام داده‌ها اطمینان دارید؟\n\nاین عمل غیرقابل بازگشت است:\n- تاریخچه ضبط‌ها\n- لیست سیاه\n- فایل‌های موقت\n- تنظیمات')) return;
    try {
      await invoke('delete_all_data');
      localStorage.removeItem('zero_onboarded');
      setOnboarded(false);
    } catch (e) {
      console.error("Failed to delete all data: ", e);
    }
  };

  if (!onboarded) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans relative overflow-hidden select-none">
      
      {/* Sidebar navigation */}
      <aside className="w-full md:w-64 bg-slate-900/60 backdrop-blur-xl border-b md:border-b-0 md:border-l border-slate-800 flex flex-col justify-between p-6 relative z-10">
        <div className="space-y-8">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 font-bold text-lg">
              Z
            </div>
            <div>
              <h1 className="font-bold text-white tracking-wide">پنل استودیو Zero</h1>
              <p className="text-[10px] text-slate-400">سرویس تبدیل گفتار هوشمند</p>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              تنظیمات پیکربندی
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <HistoryIcon className="w-4 h-4" />
              تاریخچه ضبط‌ها
            </button>

            <button
              onClick={() => setActiveTab('notepad')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'notepad'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <FileText className="w-4 h-4" />
              دفتر یادداشت
            </button>

            <button
              onClick={() => setActiveTab('blacklist')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'blacklist'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              لیست سیاه
            </button>

            <button
              onClick={() => setActiveTab('meeting')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'meeting'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <Video className="w-4 h-4" />
              حالت جلسه
            </button>

            <button
              onClick={() => setActiveTab('stats')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'stats'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              آمار استفاده
            </button>

            <button
              onClick={() => setActiveTab('texttools')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'texttools'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              ابزارهای متنی
            </button>
          </nav>
        </div>

        {/* Daemon Connection Status */}
        <div className="mt-8 md:mt-0 pt-6 border-t border-slate-850 space-y-4">
          <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">وضعیت دیمون:</span>
              <span className={`font-bold flex items-center gap-1.5 ${
                daemonStatus === 'Idle' ? 'text-emerald-400' : 'text-blue-400 animate-pulse'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  daemonStatus === 'Idle' ? 'bg-emerald-400' : 'bg-blue-400'
                }`} />
                {daemonStatus === 'Idle' ? 'آماده (Idle)' : daemonStatus}
              </span>
            </div>
            
            {/* Quick Trigger Button */}
            <button
              onClick={triggerManualRecord}
              className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-850 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition"
            >
              <Mic className="w-3.5 h-3.5 text-blue-400" />
              شبیه‌سازی ضبط (PTT)
            </button>
          </div>

          {/* Delete All Data */}
          <button
            onClick={handleDeleteAllData}
            className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-rose-400 text-xs font-semibold py-2 rounded-lg transition border border-transparent hover:border-rose-500/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
            پاک‌کردن همه داده‌ها
          </button>

          <button
            onClick={() => {
              localStorage.removeItem('zero_onboarded');
              setOnboarded(false);
            }}
            className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-rose-400 text-xs font-semibold py-2 rounded-lg transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            خروج از حساب کاربری
          </button>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto relative z-10">
        
        {/* Glow Effects */}
        <div className="absolute top-10 right-10 w-80 h-80 bg-blue-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-80 h-80 bg-purple-500/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="max-w-4xl mx-auto">
          {activeTab === 'settings' && <Settings onSave={handleSaveSettings} />}
          {activeTab === 'history' && <History />}
          {activeTab === 'notepad' && <Notepad />}
          {activeTab === 'blacklist' && <Blacklist />}
          {activeTab === 'meeting' && <MeetingMode />}
          {activeTab === 'stats' && <Stats />}
          {activeTab === 'texttools' && <TextTools />}
        </div>
      </main>

    </div>
  );
}
