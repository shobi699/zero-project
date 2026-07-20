import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings as SettingsIcon, ShieldAlert, Sliders, Volume2, Key, RotateCcw, Save, Eye, EyeOff, Cloud, Globe, Cpu, Zap, Check, Loader2, Download, Play, Square } from 'lucide-react';
import ModelManager from './ModelManager';

// ========== STT Mode Settings Component ==========
function SttModeSettings({ engine, setEngine }: { engine: string; setEngine: (v: string) => void }) {
  const [fwStatus, setFwStatus] = useState<any>(null);
  const [fwLoading, setFwLoading] = useState(false);
  const [fwMessage, setFwMessage] = useState('');

  useEffect(() => {
    invoke<any>('check_faster_whisper').then(setFwStatus).catch(() => {});
  }, []);

  const installFW = async () => {
    setFwLoading(true);
    setFwMessage('');
    try {
      const msg = await invoke<string>('install_faster_whisper');
      setFwMessage(msg);
      // Refresh status
      const status = await invoke<any>('check_faster_whisper');
      setFwStatus(status);
    } catch (e: any) {
      setFwMessage(typeof e === 'string' ? e : 'خطا در نصب');
    }
    setFwLoading(false);
  };

  const startFW = async () => {
    setFwLoading(true);
    try {
      const msg = await invoke<string>('start_faster_whisper');
      setFwMessage(msg);
      const status = await invoke<any>('check_faster_whisper');
      setFwStatus(status);
    } catch (e: any) {
      setFwMessage(typeof e === 'string' ? e : 'خطا در راه‌اندازی');
    }
    setFwLoading(false);
  };

  const stopFW = async () => {
    await invoke<string>('stop_faster_whisper').catch(() => {});
    const status = await invoke<any>('check_faster_whisper').catch(() => null);
    setFwStatus(status);
    setFwMessage('سرور متوقف شد');
  };

  const selectMode = async (mode: string) => {
    setEngine(mode);
    await invoke('set_stt_mode', { mode }).catch(() => {});
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Sliders className="w-4 h-4 text-blue-400" /> حالت تبدیل گفتار (STT Mode)
      </h3>

      <div className="grid grid-cols-1 gap-3">
        {/* Mode 1: Browser / Native */}
        <label className={`border rounded-xl p-4 cursor-pointer transition ${
          engine === 'browser' ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/60'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input type="radio" name="stt_mode" value="browser" checked={engine === 'browser'}
                onChange={() => selectMode('browser')} className="text-blue-500 focus:ring-blue-500 bg-slate-950 border-slate-800" />
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" /> حالت مرورگر / سبک
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">Web Speech API — صفر هزینه، صفر دانلود، سریع‌ترین</p>
                <p className="text-[10px] text-slate-500 mt-0.5">پشتیبانی فارسی عالی در Edge/Chrome — نیاز به اینترنت</p>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
              پیشنهادی
            </span>
          </div>
        </label>

        {/* Mode 2: Local Model */}
        <label className={`border rounded-xl p-4 cursor-pointer transition ${
          engine === 'local' ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/60'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input type="radio" name="stt_mode" value="local" checked={engine === 'local'}
                onChange={() => selectMode('local')} className="text-blue-500 focus:ring-blue-500 bg-slate-950 border-slate-800" />
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-400" /> حالت مدل لوکال / آفلاین
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">whisper.cpp — بدون اینترنت، ۱۰۰٪ محلی</p>
                <p className="text-[10px] text-slate-500 mt-0.5">نیاز به دانلود مدل GGML (75MB تا 1.5GB)</p>
              </div>
            </div>
            {engine === 'local' && (
              <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">
                فعال
              </span>
            )}
          </div>
        </label>

        {/* Mode 3: Faster-Whisper */}
        <label className={`border rounded-xl p-4 cursor-pointer transition ${
          engine === 'faster-whisper' ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/60'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input type="radio" name="stt_mode" value="faster-whisper" checked={engine === 'faster-whisper'}
                onChange={() => selectMode('faster-whisper')} className="text-blue-500 focus:ring-blue-500 bg-slate-950 border-slate-800" />
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" /> حالت پیشرفته / سریع
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">Faster-Whisper — دقت بالا + سرعت بالا</p>
                <p className="text-[10px] text-slate-500 mt-0.5">نیاز به Python — GPU اختیاری (10x سریع‌تر)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {engine === 'faster-whisper' && (
                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">
                  فعال
                </span>
              )}
              {fwStatus?.server_running ? (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                  سرور فعال
                </span>
              ) : fwStatus?.faster_whisper_installed ? (
                <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                  نصب شده
                </span>
              ) : null}
            </div>
          </div>

          {/* Faster-Whisper action buttons */}
          {engine === 'faster-whisper' && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800/50 pt-3">
              {!fwStatus?.faster_whisper_installed ? (
                <button onClick={installFW} disabled={fwLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition disabled:opacity-50">
                  {fwLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  نصب Faster-Whisper
                </button>
              ) : !fwStatus?.server_running ? (
                <button onClick={startFW} disabled={fwLoading}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition disabled:opacity-50">
                  {fwLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  راه‌اندازی سرور
                </button>
              ) : (
                <button onClick={stopFW}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition">
                  <Square className="w-3 h-3" />
                  توقف سرور
                </button>
              )}

              {!fwStatus?.python_available && (
                <span className="text-[10px] text-rose-400">Python نصب نیست</span>
              )}
            </div>
          )}

          {fwMessage && (
            <p className="text-[10px] text-slate-400 mt-2">{fwMessage}</p>
          )}
        </label>
      </div>
    </div>
  );
}

interface SettingsProps {
  onSave: (config: any) => void;
}

export default function Settings({ onSave }: SettingsProps) {
  const [engine, setEngine] = useState('hybrid');
  const [hotkey, setHotkey] = useState('Ctrl+Shift+Z');
  const [unloadTimeout, setUnloadTimeout] = useState(5);
  const [overlayMode, setOverlayMode] = useState('cursor');
  const [remainingQuota, setRemainingQuota] = useState(85);
  const [showSavedMsg, setShowSavedMsg] = useState(false);
  const [openaiKey, setOpenaiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const res = await invoke<any>('get_config');
      if (res && res.config) {
        const cfg = JSON.parse(res.config);
        if (cfg.openai_api_key) setOpenaiKey(cfg.openai_api_key);
        if (cfg.engine_mode) setEngine(cfg.engine_mode);
        if (cfg.hotkey) setHotkey(cfg.hotkey);
        if (cfg.unload_timeout) setUnloadTimeout(cfg.unload_timeout);
        if (cfg.overlay_mode) setOverlayMode(cfg.overlay_mode);
      }
    } catch (e) {
      console.warn('Failed to load config:', e);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveOpenaiKey = async () => {
    try {
      const res = await invoke<any>('get_config');
      let cfg = res && res.config ? JSON.parse(res.config) : {};
      cfg.openai_api_key = openaiKey;
      await invoke('set_config', { config: JSON.stringify(cfg) });
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2000);
    } catch (e) {
      console.error('Failed to save OpenAI key:', e);
    }
  };

  const handleSave = async () => {
    try {
      // Read current config, update fields, save back
      const res = await invoke<any>('get_config');
      let cfg = res && res.config ? JSON.parse(res.config) : {};
      cfg.engine_mode = engine;
      cfg.hotkey = hotkey;
      cfg.unload_timeout = unloadTimeout;
      cfg.overlay_mode = overlayMode;
      await invoke('set_config', { config: JSON.stringify(cfg) });

      // Also update settings in daemon live memory
      await invoke('update_settings', { settings: JSON.stringify({ engine, hotkey, unloadTimeout, overlayMode }) });

      setShowSavedMsg(true);
      setTimeout(() => setShowSavedMsg(false), 2000);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  };

  const handleReset = async () => {
    setEngine('hybrid');
    setHotkey('Ctrl+Shift+Z');
    setUnloadTimeout(5);
    setOverlayMode('cursor');
    try {
      const res = await invoke<any>('get_config');
      let cfg = res && res.config ? JSON.parse(res.config) : {};
      cfg.engine_mode = 'hybrid';
      cfg.hotkey = 'Ctrl+Shift+Z';
      cfg.unload_timeout = 5;
      cfg.overlay_mode = 'cursor';
      await invoke('set_config', { config: JSON.stringify(cfg) });
      await invoke('update_settings', { settings: JSON.stringify({ engine: 'hybrid', hotkey: 'Ctrl+Shift+Z', unloadTimeout: 5, overlayMode: 'cursor' }) });
    } catch (e) {
      console.error('Failed to reset settings:', e);
    }
  };

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* Title */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
          <SettingsIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">تنظیمات پیکربندی</h2>
          <p className="text-xs text-slate-400">شخصی‌سازی مکانیزم‌های موتور تبدیل گفتار و دیمون ویندوز</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Side settings */}
        <div className="md:col-span-2 space-y-6">
          
          {/* STT Mode Settings */}
          <SttModeSettings engine={engine} setEngine={setEngine} />

          {/* Hotkey and RAM Settings */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-400" /> میانبر و حافظه موقت
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">کلید میانبر ضبط (Push-to-Talk)</label>
                <select
                  value={hotkey}
                  onChange={(e) => setHotkey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="Ctrl+Shift+Z">Ctrl + Shift + Z</option>
                  <option value="Alt+Shift+Z">Alt + Shift + Z</option>
                  <option value="Ctrl+Shift+X">Ctrl + Shift + X</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">مدت زمان آزادسازی رم مدل محلی (دقیقه)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={unloadTimeout}
                  onChange={(e) => setUnloadTimeout(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm text-white text-left dir-ltr"
                />
              </div>
            </div>
          </div>

          {/* Overlay Mode Settings */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-400" /> حالت اورلی
            </h3>
            <p className="text-xs text-slate-400">نحوه نمایش نشانگر وضعیت صوتی را انتخاب کنید</p>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setOverlayMode('cursor')}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  overlayMode === 'cursor' 
                    ? 'border-blue-500 bg-blue-500/10 text-white' 
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="text-2xl mb-2">🖱️</div>
                <div className="text-sm font-semibold">دنبال‌کننده مکان‌نما</div>
                <div className="text-xs mt-1 opacity-70">دایره کنار مکان‌نما</div>
              </button>
              
              <button
                onClick={() => setOverlayMode('corner')}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  overlayMode === 'corner' 
                    ? 'border-blue-500 bg-blue-500/10 text-white' 
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="text-2xl mb-2">📌</div>
                <div className="text-sm font-semibold">ویجت گوشه</div>
                <div className="text-xs mt-1 opacity-70">ثابت در گوشه صفحه</div>
              </button>
            </div>
          </div>

        </div>

        {/* Right Side Info */}
        <div className="space-y-6">

          {/* OpenAI API Key */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cloud className="w-4 h-4 text-blue-400" /> کلید API ابری (اختیاری)
            </h3>
            <p className="text-[11px] text-slate-400">
              برای تبدیل صوت ابری با دقت بالا، کلید OpenAI API خود را وارد کنید.
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 pr-9 text-xs text-white dir-ltr text-left"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={saveOpenaiKey}
                className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-white text-xs font-bold py-2 px-3 rounded-lg transition"
              >
                {keySaved ? 'ذخیره شد ✓' : 'ذخیره'}
              </button>
            </div>
          </div>

          {/* Quota indicator */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" /> سهمیه و اشتراک کاربری
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between text-xs text-slate-400">
                <span>نوع اشتراک:</span>
                <span className="text-white font-bold">بخش توسعه (حرفه‌ای)</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>سهمیه باقی‌مانده ابری:</span>
                <span className="text-emerald-400 font-bold">{remainingQuota}٪ (۸۵۰ ثانیه)</span>
              </div>

              <div className="w-full bg-slate-850 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full"
                  style={{ width: `${remainingQuota}%` }}
                />
              </div>
            </div>
          </div>

          {/* Daemon info */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-blue-400" /> اطلاعات دیمون فعال
            </h3>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>وضعیت ارتباط دیمون:</span>
                <span className="text-emerald-400 font-semibold">متصل (Named Pipe)</span>
              </div>
              <div className="flex justify-between">
                <span>نسخه سرویس:</span>
                <span className="text-slate-300 font-mono">v0.1.0</span>
              </div>
              <div className="flex justify-between">
                <span>فناوری تزریق متن:</span>
                <span className="text-slate-300">UI Automation</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Model Manager */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6">
        <ModelManager />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 border-t border-slate-800 pt-6">
        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-lg shadow-blue-500/10"
        >
          <Save className="w-4 h-4" /> ذخیره تغییرات
        </button>
        <button
          onClick={handleReset}
          className="text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-900 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition"
        >
          <RotateCcw className="w-4 h-4" /> بازنشانی به پیش‌فرض
        </button>

        {showSavedMsg && (
          <span className="text-xs text-emerald-400 font-semibold animate-pulse">
            تغییرات با موفقیت ذخیره و به دیمون لوکال ارسال شد
          </span>
        )}
      </div>

    </div>
  );
}
