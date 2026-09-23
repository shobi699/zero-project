import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { enable, isEnabled, disable } from '@tauri-apps/plugin-autostart';
import {
  Settings as SettingsIcon, ShieldAlert, Sliders, Volume2, Key,
  RotateCcw, Save, Eye, EyeOff, Cloud, Globe, Cpu, Zap, Check,
  Loader2, Download, Play, Square, Palette, Monitor, Terminal, Sparkles, PanelRight
} from 'lucide-react';
import ModelManager from './ModelManager';
import { THEME_PRESETS, applyThemePreset } from '../utils/themePresets';

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
        <Sliders className="w-4 h-4 text-blue-400" /> انتخاب موتور اصلی تبدیل گفتار به متن (STT Engine)
      </h3>

      <div className="grid grid-cols-1 gap-3">
        {/* Mode 2: Local Model (Default & Recommended) */}
        <label className={`border rounded-xl p-4 cursor-pointer transition ${
          engine === 'local' ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/60'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input type="radio" name="stt_mode" value="local" checked={engine === 'local'}
                onChange={() => selectMode('local')} className="text-blue-500 focus:ring-blue-500 bg-slate-950 border-slate-800" />
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-400" /> حالت مدل لوکال / آفلاین (whisper.cpp)
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">پردازش ۱۰۰٪ محلی در سیستم با ضبط مستقیم WASAPI، بدون نیاز به اینترنت و بدون قطعی</p>
                <p className="text-[10px] text-slate-500 mt-0.5">پشتیبانی از مدل‌های GGML فارسی (پیشنهادی: Whisper Small)</p>
              </div>
            </div>
            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">
              {engine === 'local' ? 'فعال و پیشنهادی' : 'پیشنهادی'}
            </span>
          </div>
        </label>

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
                  <Globe className="w-4 h-4 text-emerald-400" /> حالت مرورگر / آزمایشی (Web Speech API)
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">تبدیل گفتار به متن مرورگر (نیازمند پشتیبانی SpeechRecognition و اتصال به اینترنت)</p>
              </div>
            </div>
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
                  <Zap className="w-4 h-4 text-amber-400" /> حالت پیشرفته / سریع (Faster-Whisper Python)
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">دقت فوق‌العاده بالا با پشتیبانی شتاب‌دهنده کارت گرافیک GPU (توسط CTranslate2)</p>
                <p className="text-[10px] text-slate-500 mt-0.5">نیازمند پایتون لوکال — تا ۱۰ برابر سریع‌تر از پردازنده</p>
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

          {engine === 'faster-whisper' && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800/50 pt-3">
              {!fwStatus?.faster_whisper_installed ? (
                <button onClick={installFW} disabled={fwLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition disabled:opacity-50">
                  {fwLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  نصب کتابخانه Faster-Whisper
                </button>
              ) : !fwStatus?.server_running ? (
                <button onClick={startFW} disabled={fwLoading}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition disabled:opacity-50">
                  {fwLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  راه‌اندازی سرور پایتون
                </button>
              ) : (
                <button onClick={stopFW}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition">
                  <Square className="w-3 h-3" />
                  توقف سرور
                </button>
              )}

              {!fwStatus?.python_available && (
                <span className="text-[10px] text-rose-400">محیط Python یافت نشد</span>
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

function ThemeSettings() {
  const [currentTheme, setCurrentTheme] = useState('slate');

  useEffect(() => {
    const saved = localStorage.getItem('zero_theme_preset') || 'slate';
    setCurrentTheme(saved);
    applyThemePreset(saved);
  }, []);

  const selectTheme = (id: string) => {
    setCurrentTheme(id);
    applyThemePreset(id);
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Palette className="w-4 h-4 text-purple-400" /> تم و پوسته‌های رنگی برنامه (Theme Palettes)
      </h3>
      <p className="text-xs text-slate-400">پالت رنگی مورد علاقه خود را انتخاب کنید (تغییر زنده محیط کاربری):</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {Object.values(THEME_PRESETS).map((t) => (
          <button
            key={t.id}
            onClick={() => selectTheme(t.id)}
            className={`p-3 rounded-xl border text-right transition flex flex-col gap-2 ${
              currentTheme === t.id
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">{t.name}</span>
              {currentTheme === t.id && <Check className="w-3.5 h-3.5 text-purple-400" />}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: t.bg }} />
              <span className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: t.cardBg }} />
              <span className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: t.accent }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function HotkeyRecorder({ value, onChange }: { value: string; onChange: (newHotkey: string) => void }) {
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      let keyName = e.key;
      if (keyName === ' ') keyName = 'Space';
      else if (keyName === 'Control' || keyName === 'Alt' || keyName === 'Shift') {
        return;
      } else if (keyName.length === 1) {
        keyName = keyName.toUpperCase();
      }

      parts.push(keyName);
      const combined = parts.join('+');
      onChange(combined);
      setIsRecording(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRecording, onChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white font-mono"
        >
          <option value="Ctrl+Space">Ctrl + Space (پیش‌فرض محبوب)</option>
          <option value="Alt+Space">Alt + Space (سریع و ساده)</option>
          <option value="Shift+Space">Shift + Space</option>
          <option value="Ctrl+Shift+Z">Ctrl + Shift + Z</option>
          <option value="Alt+Shift+Z">Alt + Shift + Z</option>
          <option value="Ctrl+Shift+X">Ctrl + Shift + X</option>
          <option value="Ctrl+Alt+S">Ctrl + Alt + S</option>
          <option value="F9">F9 (تک‌دکمه‌ای)</option>
          <option value="F10">F10 (تک‌دکمه‌ای)</option>
          {!['Ctrl+Space', 'Alt+Space', 'Shift+Space', 'Ctrl+Shift+Z', 'Alt+Shift+Z', 'Ctrl+Shift+X', 'Ctrl+Alt+S', 'F9', 'F10'].includes(value) && (
            <option value={value}>سفارشی: {value}</option>
          )}
        </select>

        <button
          type="button"
          onClick={() => setIsRecording(true)}
          className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            isRecording
              ? 'bg-rose-500 text-white animate-pulse'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          {isRecording ? 'فشار دادن دکمه‌ها...' : 'ضبط کلید سفارشی'}
        </button>
      </div>

      {isRecording && (
        <p className="text-[11px] text-amber-400 font-semibold animate-pulse">
          اکنون ترکیب دکمه‌های دلخواه خود را روی کیبورد فشار دهید...
        </p>
      )}
    </div>
  );
}

interface SettingsProps {
  onSave: (config: any) => void;
}

export default function Settings({ onSave }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'stt' | 'appearance' | 'models' | 'api' | 'advanced'>('stt');

  const [engine, setEngine] = useState('hybrid');
  const [hotkey, setHotkey] = useState('Ctrl+Shift+Z');
  const [hotkeyMode, setHotkeyMode] = useState('toggle');
  const [unloadTimeout, setUnloadTimeout] = useState(5);
  const [overlayMode, setOverlayMode] = useState('cursor');
  const [translateMode, setTranslateMode] = useState('off');
  const [polishMode, setPolishMode] = useState('off');
  const [interactiveMode, setInteractiveMode] = useState(false);

  const [autoSubmit, setAutoSubmit] = useState(false);
  const [autoSubmitKey, setAutoSubmitKey] = useState('enter');
  const [appendTrailingSpace, setAppendTrailingSpace] = useState(false);
  const [audioFeedback, setAudioFeedback] = useState(false);
  const [vadSilenceTimeout, setVadSilenceTimeout] = useState(2.0);
  const [floatingHotkey, setFloatingHotkey] = useState('Alt+V');
  const [threadsCount, setThreadsCount] = useState(4);
  const [autostart, setAutostart] = useState(false);
  const [llmProvider, setLlmProvider] = useState('openai');
  const [llmEndpoint, setLlmEndpoint] = useState('https://api.openai.com/v1');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('gpt-4o-mini');

  const [enableRightPanel, setEnableRightPanel] = useState(true);
  const [rightPanelRunning, setRightPanelRunning] = useState(false);
  const [rpLoading, setRpLoading] = useState(false);

  const [remainingQuota, setRemainingQuota] = useState(85);
  const [showSavedMsg, setShowSavedMsg] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [testLlmStatus, setTestLlmStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testLlmMessage, setTestLlmMessage] = useState('');

  const loadConfig = useCallback(async () => {
    try {
      const res = await invoke<any>('get_config');
      if (res && res.config) {
        const cfg = JSON.parse(res.config);
        if (cfg.engine_mode) setEngine(cfg.engine_mode);
        if (cfg.hotkey) setHotkey(cfg.hotkey);
        if (cfg.hotkey_mode) setHotkeyMode(cfg.hotkey_mode);
        if (cfg.unload_timeout) setUnloadTimeout(cfg.unload_timeout);
        if (cfg.overlay_mode) setOverlayMode(cfg.overlay_mode);
        if (cfg.translate_mode) setTranslateMode(cfg.translate_mode);
        if (cfg.polish_mode) setPolishMode(cfg.polish_mode);
        if (cfg.interactive_mode !== undefined) setInteractiveMode(cfg.interactive_mode);
        if (cfg.auto_submit !== undefined) setAutoSubmit(cfg.auto_submit);
        if (cfg.auto_submit_key) setAutoSubmitKey(cfg.auto_submit_key);
        if (cfg.append_trailing_space !== undefined) setAppendTrailingSpace(cfg.append_trailing_space);
        if (cfg.audio_feedback !== undefined) setAudioFeedback(cfg.audio_feedback);
        if (cfg.vad_silence_timeout) setVadSilenceTimeout(cfg.vad_silence_timeout);
        if (cfg.floating_hotkey) setFloatingHotkey(cfg.floating_hotkey);
        if (cfg.threads_count) setThreadsCount(cfg.threads_count);
        if (cfg.llm_provider) setLlmProvider(cfg.llm_provider);
        if (cfg.llm_endpoint) setLlmEndpoint(cfg.llm_endpoint);
        if (cfg.llm_api_key) setLlmApiKey(cfg.llm_api_key);
        if (cfg.llm_model) setLlmModel(cfg.llm_model);
        if (cfg.enable_right_panel !== undefined) setEnableRightPanel(cfg.enable_right_panel);
      }
      
      invoke<boolean>('is_right_panel_running').then(setRightPanelRunning).catch(() => {});

      const autostartEnabled = await isEnabled();
      setAutostart(autostartEnabled);
    } catch (e) {
      console.warn('Failed to load config:', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const toggleRightPanel = async (enabled: boolean) => {
    setRpLoading(true);
    setEnableRightPanel(enabled);
    try {
      await invoke('set_right_panel_enabled', { enabled });
      const running = await invoke<boolean>('is_right_panel_running');
      setRightPanelRunning(running);
    } catch (e) {
      console.error('Failed to toggle right panel:', e);
    } finally {
      setRpLoading(false);
    }
  };

  const restartRightPanel = async () => {
    setRpLoading(true);
    try {
      await invoke('stop_right_panel');
      await new Promise((r) => setTimeout(r, 600));
      await invoke('start_right_panel');
      const running = await invoke<boolean>('is_right_panel_running');
      setRightPanelRunning(running);
    } catch (e) {
      console.error('Failed to restart right panel:', e);
    } finally {
      setRpLoading(false);
    }
  };

  const saveApiKey = async () => {
    try {
      const res = await invoke<any>('get_config');
      let cfg = res && res.config ? JSON.parse(res.config) : {};
      cfg.llm_api_key = llmApiKey;
      cfg.llm_provider = llmProvider;
      cfg.llm_endpoint = llmEndpoint;
      cfg.llm_model = llmModel;
      await invoke('set_config', { config: JSON.stringify(cfg) });
      await invoke('update_settings', {
        settings: JSON.stringify({
          engine, hotkey, hotkeyMode, unloadTimeout, overlayMode, translateMode, polishMode, interactiveMode,
          autoSubmit, autoSubmitKey, appendTrailingSpace, audioFeedback, vadSilenceTimeout,
          floatingHotkey, threadsCount, llmProvider, llmEndpoint, llmApiKey, llmModel
        })
      });
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2000);
    } catch (e) {
      console.error('Failed to save API key:', e);
    }
  };

  const handleTestLlm = async () => {
    setTestLlmStatus('loading');
    setTestLlmMessage('');
    try {
      const result = await invoke<string>('test_llm_api', {
        endpoint: llmEndpoint,
        apiKey: llmApiKey,
        model: llmModel
      });
      setTestLlmStatus('success');
      setTestLlmMessage(result);
    } catch (e: any) {
      setTestLlmStatus('error');
      setTestLlmMessage(e.toString());
    }
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value;
    setLlmProvider(provider);
    
    switch (provider) {
      case 'openai':
        setLlmEndpoint('https://api.openai.com/v1');
        setLlmModel('gpt-4o-mini');
        break;
      case 'groq':
        setLlmEndpoint('https://api.groq.com/openai/v1');
        setLlmModel('llama-3.1-8b-instant');
        break;
      case 'ollama':
        setLlmEndpoint('http://localhost:11434/v1');
        setLlmModel('llama3');
        break;
      case 'lmstudio':
        setLlmEndpoint('http://localhost:1234/v1');
        setLlmModel('local-model');
        break;
      case 'openrouter':
        setLlmEndpoint('https://openrouter.ai/api/v1');
        setLlmModel('google/gemini-2.5-flash-free');
        break;
      case 'together':
        setLlmEndpoint('https://api.together.xyz/v1');
        setLlmModel('meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo');
        break;
      case 'deepseek':
        setLlmEndpoint('https://api.deepseek.com');
        setLlmModel('deepseek-chat');
        break;
      case 'gemini':
        setLlmEndpoint('https://generativelanguage.googleapis.com/v1beta/openai');
        setLlmModel('gemini-2.5-flash');
        break;
      case 'cohere':
        setLlmEndpoint('https://api.cohere.ai/v1');
        setLlmModel('command-r-plus');
        break;
    }
  };

  const handleSave = async () => {
    try {
      const res = await invoke<any>('get_config');
      let cfg = res && res.config ? JSON.parse(res.config) : {};
      cfg.engine_mode = engine;
      cfg.hotkey = hotkey;
      cfg.hotkey_mode = hotkeyMode;
      cfg.unload_timeout = unloadTimeout;
      cfg.overlay_mode = overlayMode;
      cfg.translate_mode = translateMode;
      cfg.polish_mode = polishMode;
      cfg.interactive_mode = interactiveMode;
      cfg.auto_submit = autoSubmit;
      cfg.auto_submit_key = autoSubmitKey;
      cfg.append_trailing_space = appendTrailingSpace;
      cfg.audio_feedback = audioFeedback;
      cfg.vad_silence_timeout = vadSilenceTimeout;
      cfg.floating_hotkey = floatingHotkey;
      cfg.threads_count = threadsCount;
      cfg.llm_provider = llmProvider;
      cfg.llm_endpoint = llmEndpoint;
      cfg.llm_api_key = llmApiKey;
      cfg.llm_model = llmModel;
      cfg.enable_right_panel = enableRightPanel;
      await invoke('set_config', { config: JSON.stringify(cfg) });

      await invoke('update_settings', {
        settings: JSON.stringify({
          engine, hotkey, hotkeyMode, unloadTimeout, overlayMode, translateMode, polishMode, interactiveMode,
          autoSubmit, autoSubmitKey, appendTrailingSpace, audioFeedback, vadSilenceTimeout,
          floatingHotkey, threadsCount, llmProvider, llmEndpoint, llmApiKey, llmModel
        })
      });

      if (autostart) {
        await enable();
      } else {
        await disable();
      }

      setShowSavedMsg(true);
      setTimeout(() => setShowSavedMsg(false), 2000);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  };

  // Auto-Save whenever settings change
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      handleSave();
    }, 400);
    return () => clearTimeout(timer);
  }, [
    engine, hotkey, hotkeyMode, unloadTimeout, overlayMode, translateMode, polishMode,
    interactiveMode, autoSubmit, autoSubmitKey, appendTrailingSpace,
    audioFeedback, vadSilenceTimeout, floatingHotkey, threadsCount, autostart, isLoaded,
    llmProvider, llmEndpoint, llmModel // API key is saved explicitly usually, but we auto-save too
  ]);

  const handleReset = async () => {
    setEngine('hybrid');
    setHotkey('Ctrl+Shift+Z');
    setUnloadTimeout(5);
    setOverlayMode('cursor');
    setTranslateMode('off');
    setPolishMode('off');
    setInteractiveMode(false);
    setAutoSubmit(false);
    setAutoSubmitKey('enter');
    setAppendTrailingSpace(false);
    setAudioFeedback(false);
    setVadSilenceTimeout(2.0);
    try {
      const res = await invoke<any>('get_config');
      let cfg = res && res.config ? JSON.parse(res.config) : {};
      cfg.engine_mode = 'hybrid';
      cfg.hotkey = 'Ctrl+Shift+Z';
      cfg.unload_timeout = 5;
      cfg.overlay_mode = 'cursor';
      cfg.translate_mode = 'off';
      cfg.polish_mode = 'off';
      cfg.interactive_mode = false;
      cfg.auto_submit = false;
      cfg.auto_submit_key = 'enter';
      cfg.append_trailing_space = false;
      cfg.audio_feedback = false;
      cfg.vad_silence_timeout = 2.0;
      await invoke('set_config', { config: JSON.stringify(cfg) });
      await invoke('update_settings', { settings: JSON.stringify(cfg) });
    } catch (e) {
      console.error('Failed to reset settings:', e);
    }
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Page Title */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
          <SettingsIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">تنظیمات و پیکربندی سیستم</h2>
          <p className="text-xs text-slate-400">مدیریت موتورهای صوتی، تم، میانبرها و دیمون ویندوز</p>
        </div>
      </div>

      {/* Tab Navigation (زبانه‌ها) */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('stt')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'stt'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
          }`}
        >
          <Sliders className="w-4 h-4" />
          موتور و ضبط صوتی
        </button>

        <button
          onClick={() => setActiveTab('appearance')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'appearance'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
          }`}
        >
          <Palette className="w-4 h-4" />
          تم و پوسته ظاهری
        </button>

        <button
          onClick={() => setActiveTab('models')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'models'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
          }`}
        >
          <Cpu className="w-4 h-4" />
          مدیریت مدل‌ها
        </button>

        <button
          onClick={() => setActiveTab('api')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'api'
              ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
          }`}
        >
          <Cloud className="w-4 h-4" />
          موتور پردازش متنی (LLM)
        </button>

        <button
          onClick={() => setActiveTab('advanced')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'advanced'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
          }`}
        >
          <Zap className="w-4 h-4" />
          پیشرفته و دیمون
        </button>
      </div>

      {/* Tab Contents */}

      {/* TAB 1: STT & Hotkey Engine */}
      {activeTab === 'stt' && (
        <div className="space-y-6">
          <SttModeSettings engine={engine} setEngine={setEngine} />

          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-400" /> کلید میانبر ضبط و تبدیل فوری (Push-to-Talk)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">ترکیب کلید میانبر دلخواه (Global Hotkey)</label>
                <HotkeyRecorder value={hotkey} onChange={setHotkey} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">نحوه عملکرد کلید میانبر</label>
                <select
                  value={hotkeyMode}
                  onChange={(e) => setHotkeyMode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-[9px] text-sm text-white"
                >
                  <option value="toggle">تغییر وضعیت (با یک بار زدن)</option>
                  <option value="hold">نگه داشتن (Push-to-Talk)</option>
                  <option value="modal">باز شدن ویجت</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">مهلت قطع خودکار در سکوت (ثانیه)</label>
                <select
                  value={vadSilenceTimeout.toString()}
                  onChange={(e) => setVadSilenceTimeout(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="1.5">۱.۵ ثانیه (سریع)</option>
                  <option value="2.0">۲.۰ ثانیه (استاندارد)</option>
                  <option value="3.0">۳.۰ ثانیه (طولانی)</option>
                  <option value="5.0">۵.۰ ثانیه (جلسه / مکث بالا)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" /> ترجمه همزمان گفتار به زبان دیگر
            </h3>
            <p className="text-xs text-slate-400">متن ترجمه‌شده به جای متن اصلی در برنامه فعال تایپ می‌شود</p>
            
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setTranslateMode('off')}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  translateMode === 'off'
                    ? 'border-slate-500 bg-slate-500/10 text-white'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-semibold">غیرفعال</div>
              </button>
              <button
                onClick={() => setTranslateMode('fa-en')}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  translateMode === 'fa-en'
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-semibold">فارسی → انگلیسی</div>
              </button>
              <button
                onClick={() => setTranslateMode('en-fa')}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  translateMode === 'en-fa'
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-semibold">انگلیسی → فارسی</div>
              </button>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" /> هوش مصنوعی نگارش (ویژه Pro)
            </h3>
            <p className="text-xs text-slate-400">بازنویسی و تصحیح متن با استفاده از هوش مصنوعی قبل از تایپ نهایی</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => setPolishMode('off')}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  polishMode === 'off'
                    ? 'border-slate-500 bg-slate-500/10 text-white'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-semibold">غیرفعال</div>
              </button>
              <button
                onClick={() => setPolishMode('grammar')}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  polishMode === 'grammar'
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-semibold">تصحیح نگارش</div>
              </button>
              <button
                onClick={() => setPolishMode('formal')}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  polishMode === 'formal'
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-semibold">رسمی / اداری</div>
              </button>
              <button
                onClick={() => setPolishMode('informal')}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  polishMode === 'informal'
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-semibold">غیررسمی / دوستانه</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Appearance & Themes */}
      {activeTab === 'appearance' && (
        <div className="space-y-6">
          <ThemeSettings />

          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-400" /> موقعیت و حالت نشانگر اورلی (Overlay Indicator)
            </h3>
            <p className="text-xs text-slate-400">نحوه نمایش دایره وضعیت صوتی در صفحه نمایش</p>
            
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
                <div className="text-xs mt-1 opacity-70">دایره متحرک کنار مکان‌نما</div>
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
                <div className="text-sm font-semibold">ویجت گوشه صفحه</div>
                <div className="text-xs mt-1 opacity-70">ثابت در پایین/گوشه صفحه</div>
              </button>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-xs text-slate-400">تست نمایش اورلی روی صفحه:</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await invoke('trigger_record');
                  } catch (e) {
                    console.error('Overlay test failed:', e);
                  }
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                تست و نمایش زنده اورلی
              </button>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Monitor className="w-4 h-4 text-blue-400" /> پنجره پیش‌نمایش شناور قبل از درج (Interactive Preview)
            </h3>
            <p className="text-xs text-slate-400">باز شدن یک پنجره تعاملی برای ویرایش متن قبل از درج نهایی در نرم‌افزار هدف</p>
            
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={interactiveMode}
                    onChange={(e) => setInteractiveMode(e.target.checked)}
                  />
                  <div className={`block w-10 h-6 rounded-full transition ${interactiveMode ? 'bg-blue-500' : 'bg-slate-700'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${interactiveMode ? 'translate-x-4' : ''}`}></div>
                </div>
                <span className="text-sm font-semibold text-slate-200">
                  فعال‌سازی پنجره پیش‌نمایش شناور
                </span>
              </label>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('interactive-preview', {
                    detail: { text: 'این یک متن نمونه برای تست پنجره شناور تعاملی پیش از درج در نرم‌افزار است.', x: 200, y: 200 }
                  }));
                  // emit tauri event fallback
                  const event = new CustomEvent('interactive-preview');
                  (event as any).payload = { text: 'این یک متن نمونه برای تست پنجره شناور تعاملی پیش از درج در نرم‌افزار است.', x: 200, y: 200 };
                  window.dispatchEvent(event);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-400 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                تست پنجره پیش‌نمایش
              </button>
            </div>
          </div>

          {/* Right Panel Dock Settings */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <PanelRight className="w-4 h-4 text-cyan-400" /> داک و پنل روان لبه صفحه (Right Panel Dock)
              </h3>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5 ${
                  rightPanelRunning
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${rightPanelRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  {rightPanelRunning ? 'در حال اجرا' : 'غیرفعال / متوقف'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              پنل کناری به صورت یک زبانه روان و زیبا در لبه راست مانیتور شما قرار می‌گیرد. با بردن ماوس به لبه، پنل باز شده و امکان دسترسی سریع به تایپ صوتی، یادداشت‌ها، تاریخچه کلیپ‌بورد و قطعه‌متن‌های سریع را بدون اشغال فضای صفحه فراهم می‌کند.
            </p>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={enableRightPanel}
                    disabled={rpLoading}
                    onChange={(e) => toggleRightPanel(e.target.checked)}
                  />
                  <div className={`block w-10 h-6 rounded-full transition ${enableRightPanel ? 'bg-cyan-500' : 'bg-slate-700'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${enableRightPanel ? 'translate-x-4' : ''}`}></div>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-200">
                    فعال‌سازی پنل کناری و اجرای خودکار
                  </span>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    با اجرای نرم‌افزار، پنل کناری نیز طبق این تنظیم شروع به کار خواهد کرد
                  </p>
                </div>
              </label>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  disabled={rpLoading}
                  onClick={restartRightPanel}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
                  title="راه‌اندازی مجدد پروسه پنل کناری"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${rpLoading ? 'animate-spin' : ''}`} />
                  راه‌اندازی مجدد
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Models Manager */}
      {activeTab === 'models' && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6">
          <ModelManager />
        </div>
      )}

      {/* TAB 4: API & Cloud Services */}
      {activeTab === 'api' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" /> موتور پردازش متنی (LLM Engine)
            </h3>
            <p className="text-[11px] text-slate-400">
              تنظیمات مربوط به مدل‌های هوش مصنوعی برای اصلاح لحن، ویرایش نگارشی و پرامپت‌های اختصاصی شما.
            </p>

            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold">پلتفرم ارائه‌دهنده (Provider)</label>
                <select
                  value={llmProvider}
                  onChange={handleProviderChange}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="openai">OpenAI (GPT-4o, etc.)</option>
                  <option value="groq">Groq (سریع و رایگان)</option>
                  <option value="openrouter">OpenRouter (مدل‌های متنوع)</option>
                  <option value="together">Together AI (مدل‌های متن‌باز)</option>
                  <option value="deepseek">DeepSeek (ارزان و هوشمند)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="cohere">Cohere</option>
                  <option value="ollama">Ollama (آفلاین و محلی)</option>
                  <option value="lmstudio">LM Studio (آفلاین)</option>
                  <option value="custom">Custom Endpoint (API سازگار)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold">آدرس سرور (Endpoint URL)</label>
                <input
                  type="text"
                  value={llmEndpoint}
                  onChange={(e) => setLlmEndpoint(e.target.value)}
                  placeholder="e.g. https://api.openai.com/v1"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-lg px-3 py-2 text-xs text-white dir-ltr text-left"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold">نام مدل (Model Name)</label>
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="e.g. gpt-4o-mini, llama3:8b, llama3-70b-8192"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-lg px-3 py-2 text-xs text-white dir-ltr text-left"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold">کلید API (در صورت نیاز)</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-lg px-3 py-2 pr-9 text-xs text-white dir-ltr text-left"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 pt-1">
                  برای ابزارهای آفلاین (مثل Ollama) این فیلد را خالی بگذارید. این کلید برای پردازش‌های متنی و تبدیل گفتار به متن ابری نیز استفاده می‌شود.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleTestLlm}
                  disabled={testLlmStatus === 'loading'}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold py-2 px-3 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {testLlmStatus === 'loading' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : testLlmStatus === 'success' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Globe className="w-3.5 h-3.5" />
                  )}
                  تست اتصال API
                </button>
                <button
                  onClick={saveApiKey}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {keySaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  {keySaved ? 'ذخیره شد' : 'ذخیره تنظیمات'}
                </button>
              </div>
              {testLlmMessage && (
                <div className={`p-3 rounded-lg text-[10px] font-mono whitespace-pre-wrap dir-ltr text-left mt-2 border ${
                  testLlmStatus === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>
                  {testLlmMessage}
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" /> سهمیه و وضعیت حساب ابری
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between text-xs text-slate-400">
                <span>نوع حساب کاربری:</span>
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
        </div>
      )}

      {/* TAB 5: Advanced & Daemon */}
      {activeTab === 'advanced' && (
        <div className="space-y-6">
          
          {/* General & System */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Monitor className="w-4 h-4 text-emerald-400" /> تنظیمات سیستمی و عمومی
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">اجرای خودکار هنگام شروع ویندوز (Autostart)</label>
                <button
                  type="button"
                  onClick={() => setAutostart(!autostart)}
                  className={`w-full py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-between ${
                    autostart
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                      : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  <span>اجرا در پس‌زمینه سیستم</span>
                  <span>{autostart ? 'فعال ✓' : 'غیرفعال'}</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">کلید میانبر باز کردن ویجت شناور</label>
                <HotkeyRecorder value={floatingHotkey} onChange={setFloatingHotkey} />
              </div>
            </div>
          </div>

          {/* Processing Optimization */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-400" /> بهینه‌سازی پردازش مدل محلی
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">تعداد رشته‌های پردازشی (CPU Threads)</label>
                <input
                  type="number"
                  min="1"
                  max="32"
                  value={threadsCount}
                  onChange={(e) => setThreadsCount(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg px-3 py-2 text-sm text-white text-left dir-ltr"
                />
                <p className="text-[10px] text-slate-500 mt-1">مقدار بیشتر پردازش را تسریع می‌کند اما CPU را بیشتر درگیر می‌کند (پیش‌فرض: 4).</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">آزادسازی حافظه موقت (RAM Unload)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={unloadTimeout}
                  onChange={(e) => setUnloadTimeout(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg px-3 py-2 text-sm text-white text-left dir-ltr"
                />
                <p className="text-[10px] text-slate-500 mt-1">مدت زمان عدم استفاده برای آزادسازی رم مدل محلی (دقیقه).</p>
              </div>
            </div>
          </div>

          {/* Typing Behavior */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-purple-400" /> رفتار درج متن و فیدبک
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">ارسال خودکار (Auto-Submit)</label>
                <select
                  value={autoSubmit ? autoSubmitKey : 'off'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'off') {
                      setAutoSubmit(false);
                    } else {
                      setAutoSubmit(true);
                      setAutoSubmitKey(val);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="off">غیرفعال (فقط درج)</option>
                  <option value="enter">کلید Enter</option>
                  <option value="ctrl_enter">Ctrl + Enter</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">فاصله پایانی (Trailing Space)</label>
                <button
                  type="button"
                  onClick={() => setAppendTrailingSpace(!appendTrailingSpace)}
                  className={`w-full py-1.5 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-between ${
                    appendTrailingSpace
                      ? 'border-purple-500/50 bg-purple-500/10 text-purple-400'
                      : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  <span>افزودن خودکار فاصله</span>
                  <span>{appendTrailingSpace ? '✓' : '✗'}</span>
                </button>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">بازخورد صوتی (Audio Beep)</label>
                <button
                  type="button"
                  onClick={() => setAudioFeedback(!audioFeedback)}
                  className={`w-full py-1.5 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-between ${
                    audioFeedback
                      ? 'border-purple-500/50 bg-purple-500/10 text-purple-400'
                      : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  <span>بوق شروع/پایان</span>
                  <span>{audioFeedback ? '🔔' : '🔕'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-400" /> اطلاعات دیمون ویندوز (Zero Daemon IPC)
            </h3>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex justify-between border-b border-slate-800/50 pb-2">
                <span>وضعیت ارتباط دیمون:</span>
                <span className="text-emerald-400 font-semibold">متصل (Named Pipe \\.\pipe\zero-ipc)</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/50 pb-2">
                <span>نسخه سرویس:</span>
                <span className="text-slate-300 font-mono">v0.1.0</span>
              </div>
              <div className="flex justify-between pb-1">
                <span>فناوری تزریق متن:</span>
                <span className="text-slate-300">UI Automation & Win32 Input</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Save & Reset Action Bar */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-6">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition shadow-lg shadow-blue-500/20"
          >
            <Save className="w-4 h-4" /> ذخیره تمام تغییرات
          </button>
          <button
            onClick={handleReset}
            className="text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-900 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition"
          >
            <RotateCcw className="w-4 h-4" /> بازنشانی به پیش‌فرض
          </button>
        </div>

        {showSavedMsg && (
          <span className="text-xs text-emerald-400 font-semibold animate-pulse">
            تنظیمات با موفقیت ذخیره و اعمال شد ✓
          </span>
        )}
      </div>
    </div>
  );
}
