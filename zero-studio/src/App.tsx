import React, { useState, useEffect, Suspense, lazy } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut';
import {
  Mic, Settings as SettingsIcon, History as HistoryIcon, FileText,
  ShieldAlert, LogOut, Trash2, Video, BarChart3, BookOpen,
  Sparkles as SparklesIcon, Mic as MicIcon, Loader2
} from 'lucide-react';
import { initializeRTL } from './lib/rtl';

const Onboarding = lazy(() => import('./components/Onboarding'));
const Settings = lazy(() => import('./components/Settings'));
const History = lazy(() => import('./components/History'));
const Notepad = lazy(() => import('./components/Notepad'));
const Blacklist = lazy(() => import('./components/Blacklist'));
const MeetingMode = lazy(() => import('./components/MeetingMode'));
const Stats = lazy(() => import('./components/Stats'));
const TextTools = lazy(() => import('./components/TextTools'));
const TTSPanel = lazy(() => import('./components/tts/TTSPanel'));

import InteractivePreviewModal from './components/InteractivePreviewModal';
import FloatingVoiceWidget from './components/FloatingVoiceWidget';
import PreviewOverlay from './components/PreviewOverlay';
import WidgetOverlay from './components/WidgetOverlay';

function TabLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse p-4 md:p-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-800/80"></div>
        <div className="space-y-2">
          <div className="h-5 bg-slate-800/80 rounded-lg w-40"></div>
          <div className="h-3 bg-slate-800/50 rounded-md w-64"></div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div className="h-28 bg-slate-900/60 rounded-2xl border border-slate-800/60"></div>
        <div className="h-28 bg-slate-900/60 rounded-2xl border border-slate-800/60"></div>
      </div>
      <div className="h-64 bg-slate-900/40 rounded-2xl border border-slate-800/40 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <span>در حال بارگذاری سریع ماژول...</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const windowParam = urlParams.get('window');

  if (windowParam === 'preview' || windowParam === 'widget') {
    document.body.style.setProperty('background-color', 'transparent', 'important');
    document.documentElement.style.setProperty('background-color', 'transparent', 'important');
  }

  if (windowParam === 'preview') {
    return <PreviewOverlay />;
  }
  if (windowParam === 'widget') {
    return <WidgetOverlay />;
  }

  const [onboarded, setOnboarded] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'history' | 'notepad' | 'blacklist' | 'meeting' | 'stats' | 'texttools' | 'tts'>(() => {
    const saved = localStorage.getItem('zero_active_tab');
    const validTabs = ['settings', 'history', 'notepad', 'blacklist', 'meeting', 'stats', 'texttools', 'tts'];
    if (saved && validTabs.includes(saved)) {
      return saved as any;
    }
    return 'notepad';
  });

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    localStorage.setItem('zero_active_tab', tab);
  };
  const [daemonStatus, setDaemonStatus] = useState<string>('Idle');
  const [previewData, setPreviewData] = useState<{ text: string; x: number; y: number } | null>(null);
  const [showFloatingWidget, setShowFloatingWidget] = useState(false);
  const [widgetMousePos, setWidgetMousePos] = useState<{ x: number; y: number } | undefined>(undefined);
  const [browserSttActive, setBrowserSttActive] = useState(false);

  // Check onboarding status on mount & initialize RTL
  useEffect(() => {
    initializeRTL('fa');
    const isCompleted = localStorage.getItem('zero_onboarded');
    if (isCompleted === 'true') {
      setOnboarded(true);
    }
    fetchDaemonStatus();
    const unlistenStatus = listen<{ status: string }>('daemon-status-changed', (event) => {
      setDaemonStatus(event.payload.status);
    });

    const unlistenPreview = listen('interactive-preview', (event: any) => {
      const { text, x, y } = event.payload || {};
      if (text) {
        setPreviewData({ text, x: x || 100, y: y || 100 });
      }
    });

    const unlistenStartBrowserStt = listen('start-browser-stt', () => {
      setShowFloatingWidget(true);
      setBrowserSttActive(true);
    });

    const unlistenStopBrowserStt = listen('stop-browser-stt', () => {
      setBrowserSttActive(false);
    });

    let registeredShortcut = 'Alt+V';
    // Global Shortcut for Floating Voice Widget
    const setupShortcut = async () => {
      try {
        const res = await invoke<any>('get_config');
        if (res && res.config) {
          const cfg = JSON.parse(res.config);
          if (cfg.floating_hotkey) {
            registeredShortcut = cfg.floating_hotkey;
          }
        }
        
        if (await isRegistered(registeredShortcut)) {
          await unregister(registeredShortcut);
        }
        await register(registeredShortcut, async () => {
          emit('toggle-widget');
        });
      } catch (err) {
        console.error("Global shortcut error", err);
      }
    };
    setupShortcut();

    return () => {
      unlistenStatus.then(f => f());
      unlistenPreview.then(f => f());
      unlistenStartBrowserStt.then(f => f());
      unlistenStopBrowserStt.then(f => f());
      unregister(registeredShortcut).catch(console.error);
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
    return (
      <Suspense fallback={<TabLoadingSkeleton />}>
        <Onboarding onComplete={handleOnboardingComplete} />
      </Suspense>
    );
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
              onClick={() => handleTabChange('notepad')}
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
              onClick={() => handleTabChange('settings')}
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
              onClick={() => handleTabChange('tts')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === 'tts'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <MicIcon className="w-4 h-4" />
              آوا ساز هوشمند
            </button>

            <button
              onClick={() => handleTabChange('history')}
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
              onClick={() => handleTabChange('blacklist')}
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
              onClick={() => handleTabChange('meeting')}
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
              onClick={() => handleTabChange('stats')}
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
              onClick={() => handleTabChange('texttools')}
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

            {/* Floating Voice Widget Launcher */}
            <button
              onClick={() => {
                emit('toggle-widget');
              }}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/20"
              title="میانبر Alt + V"
            >
              <SparklesIcon className="w-3.5 h-3.5 text-amber-300" />
              ویجت شناور تایپ صوتی (Alt+V)
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
          <Suspense fallback={<TabLoadingSkeleton />}>
            {activeTab === 'settings' && <Settings onSave={handleSaveSettings} />}
            {activeTab === 'history' && <History />}
            {activeTab === 'notepad' && (
              <Notepad 
                onTransferToTTS={(text) => {
                  localStorage.setItem('tts_initial_text', text);
                  handleTabChange('tts');
                }}
              />
            )}
            {activeTab === 'blacklist' && <Blacklist />}
            {activeTab === 'meeting' && <MeetingMode />}
            {activeTab === 'stats' && <Stats />}
            {activeTab === 'texttools' && <TextTools />}
            {activeTab === 'tts' && <TTSPanel />}
          </Suspense>
        </div>
      </main>

    </div>
  );
}
