import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Trash2,
  Check,
  HardDrive,
  FolderOpen,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Copy,
  CheckCircle,
  Download,
  Loader2,
  FolderDown,
} from 'lucide-react';

interface ModelDef {
  id: string;
  name: string;
  description: string;
  sizeBytes: number;
  source: 'whispercpp' | 'huggingface';
  url: string;
  filename: string; // actual filename to save as
  tags: string[];
  isDefault: boolean;
  needsConversion?: boolean;
}

interface InstalledModel {
  id: string;
  filename: string;
  size_bytes: number;
  is_active: boolean;
}

const MODEL_REGISTRY: ModelDef[] = [
  {
    id: 'ggml-tiny',
    name: 'Whisper Tiny',
    description: 'سریع‌ترین مدل — مناسب برای سیستم‌های ضعیف و تست سریع',
    sizeBytes: 75_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    filename: 'ggml-tiny.bin',
    tags: ['fast'],
    isDefault: false,
  },
  {
    id: 'ggml-base',
    name: 'Whisper Base (پیشفرض)',
    description: 'بهترین تعادل سرعت و دقت — ۱۴۲ مگابایت — پیشنهادی برای استفاده روزمره',
    sizeBytes: 142_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    filename: 'ggml-base.bin',
    tags: ['balanced', 'recommended'],
    isDefault: true,
  },
  {
    id: 'ggml-small',
    name: 'Whisper Small',
    description: 'دقت بالاتر — ۴۶۶ مگابایت — عالی برای زبان فارسی',
    sizeBytes: 466_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    filename: 'ggml-small.bin',
    tags: ['accurate', 'persian'],
    isDefault: false,
  },
  {
    id: 'ggml-medium',
    name: 'Whisper Medium',
    description: 'دقت عالی — ۱.۵ گیگابایت — نیاز به حداقل ۴ گیگابایت رم آزاد',
    sizeBytes: 1_500_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    filename: 'ggml-medium.bin',
    tags: ['high-accuracy'],
    isDefault: false,
  },
  {
    id: 'whisper_base_persian',
    name: 'Whisper Base Persian (فارسی)',
    description: 'ویژه فارسی — ۷۴ میلیون پارامتر — از OpenAI large-v3 دقیق‌تر — نیاز به تبدیل GGML',
    sizeBytes: 290_000_000,
    source: 'huggingface',
    url: 'https://huggingface.co/C1Tech/whisper_base_persian',
    filename: 'model.safetensors',
    tags: ['persian', 'specialized'],
    isDefault: false,
    needsConversion: true,
  },
];

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} گیگابایت`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} مگابایت`;
  return `${Math.round(bytes / 1_000)} کیلوبایت`;
}

export default function ModelManager() {
  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [activeModel, setActiveModel] = useState('ggml-base.bin');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [modelsDir, setModelsDir] = useState('');
  const [editingDir, setEditingDir] = useState(false);
  const [newDir, setNewDir] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(0);

  const loadStatus = useCallback(async () => {
    try {
      const res = await invoke<any>('get_model_status');
      if (res && res.models) {
        const models = JSON.parse(res.models);
        setInstalled(models);
        const active = models.find((m: InstalledModel) => m.is_active);
        if (active) setActiveModel(active.id);
      }
    } catch (e) {
      console.warn('Failed to get model status:', e);
    }
    try {
      const dir = await invoke<string>('get_models_dir');
      setModelsDir(dir);
    } catch {
      setModelsDir('%USERPROFILE%\\Zero\\models');
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const unlisten = listen<any>('model-download-progress', (event) => {
      setDownloadProgress(event.payload.downloaded);
      setDownloadTotal(event.payload.total);
    });
    const unlistenComplete = listen<any>('model-download-complete', () => {
      setDownloading(null);
      setDownloadProgress(0);
      setDownloadTotal(0);
      setSuccess('مدل با موفقیت دانلود شد');
      setTimeout(() => setSuccess(''), 3000);
      loadStatus();
    });
    return () => {
      unlisten.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, [loadStatus]);

  const downloadModel = async (model: ModelDef) => {
    if (model.needsConversion) {
      setError('این مدل نیاز به تبدیل GGML دارد. ابتدا با ابزار whisper.cpp تبدیل کنید.');
      setTimeout(() => setError(''), 5000);
      return;
    }
    setDownloading(model.id);
    setDownloadProgress(0);
    setDownloadTotal(model.sizeBytes);
    setError('');
    try {
      await invoke('download_model', { modelId: model.filename, url: model.url });
    } catch (e: any) {
      setDownloading(null);
      setError(typeof e === 'string' ? e : 'خطا در دانلود مدل');
    }
  };

  const deleteModel = async (modelId: string) => {
    try {
      await invoke('delete_model', { modelId });
      setSuccess('مدل حذف شد');
      setTimeout(() => setSuccess(''), 3000);
      loadStatus();
    } catch (e: any) {
      setError(typeof e === 'string' ? e : 'خطا در حذف مدل');
    }
  };

  const activateModel = async (modelId: string) => {
    try {
      await invoke('set_active_model', { modelId });
      setActiveModel(modelId);
      setSuccess('مدل فعال شد');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : (e?.message || 'خطا در فعال‌سازی مدل');
      if (msg.includes('not found')) {
        setError(`فایل مدل یافت نشد. لطفاً مدل را مجدداً دانلود کنید.`);
      } else {
        setError(msg);
      }
    }
  };

  const testModel = async (modelId: string) => {
    try {
      const res = await invoke<any>('test_model', { modelId });
      if (res && res.exists) {
        setSuccess(`مدل ${modelId} نصب شده (${formatSize(res.size_bytes)})`);
      } else {
        setSuccess('');
        setError(`مدل ${modelId} یافت نشد. لطفاً دانلود و کپی کنید.`);
      }
      setTimeout(() => { setSuccess(''); setError(''); }, 4000);
    } catch (e: any) {
      setError(typeof e === 'string' ? e : 'خطا در بررسی مدل');
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const copyPath = () => {
    navigator.clipboard.writeText(modelsDir);
    setSuccess('مسیر پوشه کپی شد');
    setTimeout(() => setSuccess(''), 2000);
  };

  const pickFolder = async () => {
    try {
      const result = await invoke<string | null>('pick_folder');
      if (result) {
        setNewDir(result);
        // Auto-save the picked folder
        await invoke('set_models_dir', { dir: result });
        setModelsDir(result);
        setEditingDir(false);
        setSuccess('پوشه جدید انتخاب و ذخیره شد');
        setTimeout(() => setSuccess(''), 3000);
        loadStatus();
      }
    } catch (e: any) {
      setError(typeof e === 'string' ? e : 'خطا در انتخاب پوشه');
    }
  };

  const saveNewDir = async () => {
    if (!newDir.trim()) return;
    try {
      await invoke('set_models_dir', { dir: newDir.trim() });
      setModelsDir(newDir.trim());
      setEditingDir(false);
      setSuccess('مسیر پوشه تغییر کرد');
      setTimeout(() => setSuccess(''), 2000);
      loadStatus();
    } catch (e: any) {
      setError(typeof e === 'string' ? e : 'خطا در تغییر مسیر');
    }
  };

  const resetDir = async () => {
    try {
      await invoke('set_models_dir', { dir: '' });
      setEditingDir(false);
      loadStatus();
      setSuccess('مسیر به حالت پیشفرض بازگشت');
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError(typeof e === 'string' ? e : 'خطا در بازنشانی مسیر');
    }
  };

  const isInstalled = (filename: string) => installed.some((m) => m.filename === filename);
  const getInstalled = (filename: string) => installed.find((m) => m.filename === filename);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">مدیریت مدل‌های STT</h3>
            <p className="text-xs text-slate-400">دانلود، انتخاب و مدیریت مدل‌های تبدیل صوت به متن</p>
          </div>
        </div>
        <button
          onClick={loadStatus}
          className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
          title="بررسی مجدد"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Active Model + Folder Path */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-bold text-white">مدل فعال:</span>
            <span className="text-sm text-blue-400">{activeModel}</span>
          </div>
        </div>

        {editingDir ? (
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">مسیر جدید پوشه مدل‌ها:</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newDir}
                onChange={(e) => setNewDir(e.target.value)}
                placeholder="مثال: D:\ZeroModels"
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-1.5 text-xs text-white dir-ltr text-left"
              />
              <button
                onClick={saveNewDir}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition"
              >
                ذخیره
              </button>
              <button
                onClick={() => setEditingDir(false)}
                className="text-slate-400 hover:text-white text-xs py-1.5 px-2 rounded-lg transition"
              >
                انصراف
              </button>
            </div>
            <button
              onClick={resetDir}
              className="text-[10px] text-slate-500 hover:text-amber-400 transition"
            >
              بازنشانی به پیشفرض
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-slate-950/60 rounded-lg p-3">
            <FolderOpen className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400 flex-1 dir-ltr text-left truncate">{modelsDir}</span>
            <button onClick={copyPath} className="text-slate-500 hover:text-white transition p-1" title="کپی مسیر">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button onClick={pickFolder} className="text-slate-500 hover:text-blue-400 transition p-1" title="انتخاب پوشه">
              <FolderDown className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setNewDir(modelsDir); setEditingDir(true); }} className="text-slate-500 hover:text-blue-400 transition p-1" title="تایپ دستی مسیر">
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <p className="text-[10px] text-slate-500">
          فایل‌های مدل (.bin) را در این پوشه قرار دهید یا از دکمه دانلود خودکار استفاده کنید.
        </p>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="text-xs text-rose-400">{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs text-emerald-400">{success}</span>
        </div>
      )}

      {/* Model Cards */}
      <div className="space-y-3">
        {MODEL_REGISTRY.map((model) => {
          const installedModel = getInstalled(model.filename);
          const isActive = activeModel === model.filename;
          const isDownloading = downloading === model.id;
          const progressPercent = downloadTotal > 0 ? (downloadProgress / downloadTotal) * 100 : 0;

          return (
            <div
              key={model.id}
              className={`bg-slate-900/30 border rounded-xl p-4 transition ${
                isActive ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800/80 hover:border-slate-700/80'
              }`}
            >
              <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-white">{model.name}</h4>
                    {model.isDefault && (
                      <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold">پیشفرض</span>
                    )}
                    {model.tags.includes('persian') && (
                      <span className="text-[9px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-1.5 py-0.5 rounded font-bold">فارسی</span>
                    )}
                    {model.needsConversion && (
                      <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold">نیاز به تبدیل</span>
                    )}
                    {installedModel && (
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold">نصب شده</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">{model.description}</p>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span>{formatSize(model.sizeBytes)}</span>
                    <span className="flex items-center gap-1">
                      {model.source === 'whispercpp' ? 'whisper.cpp' : 'HuggingFace'}
                    </span>
                  </div>

                  {/* Download Link */}
                  {!model.needsConversion && (
                    <div className="flex items-center gap-2 mt-2">
                      <a href={model.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition font-semibold">
                        <ExternalLink className="w-3 h-3" />
                        لینک دانلود
                      </a>
                      <button onClick={() => copyUrl(model.url)}
                        className="text-[11px] text-slate-500 hover:text-white transition flex items-center gap-1">
                        {copiedUrl === model.url ? (
                          <><Check className="w-3 h-3 text-emerald-400" />کپی شد</>
                        ) : (
                          <><Copy className="w-3 h-3" />کپی لینک</>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Actions - 3 buttons: Test, Activate, Download */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {isDownloading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                      <div className="w-32">
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
                        </div>
                        <span className="text-[9px] text-slate-500 mt-0.5 block text-center">
                          {formatSize(downloadProgress)} / {formatSize(downloadTotal)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Test Button */}
                      <button
                        onClick={() => testModel(model.filename)}
                        className="border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-bold py-1.5 px-3 rounded-lg transition"
                      >
                        تست
                      </button>

                      {/* Activate Button */}
                      {installedModel && (
                        isActive ? (
                          <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                            <Check className="w-3.5 h-3.5" />فعال
                          </span>
                        ) : (
                          <button
                            onClick={() => activateModel(model.filename)}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition"
                          >
                            فعال کردن
                          </button>
                        )
                      )}

                      {/* Download Button */}
                      {!installedModel && !model.needsConversion && (
                        <button
                          onClick={() => downloadModel(model)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                          دانلود
                        </button>
                      )}

                      {/* Delete Button */}
                      {installedModel && !isActive && (
                        <button
                          onClick={() => deleteModel(model.filename)}
                          className="border border-transparent hover:border-rose-900/30 hover:bg-rose-950/10 p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition"
                          title="حذف مدل"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Download progress bar */}
              {isDownloading && (
                <div className="mt-3">
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Instructions */}
      <div className="bg-slate-900/20 border border-slate-800/60 rounded-xl p-4 space-y-2">
        <h4 className="text-sm font-bold text-white">راهنمای نصب مدل</h4>
        <ol className="text-[11px] text-slate-400 space-y-1.5 list-decimal list-inside">
          <li>روی <span className="text-emerald-400 font-bold">دانلود</span> کلیک کنید یا فایل .bin را دستی دانلود کنید</li>
          <li>فایل در پوشه مدل‌ها ذخیره می‌شود</li>
          <li>دکمه <span className="text-blue-400 font-bold">تست</span> را بزنید تا مدل شناسایی شود</li>
          <li>دکمه <span className="text-blue-400 font-bold">فعال کردن</span> را بزنید</li>
          <li>مدل آماده استفاده است</li>
        </ol>
      </div>
    </div>
  );
}
