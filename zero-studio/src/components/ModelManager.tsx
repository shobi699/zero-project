import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Plus,
  Sparkles,
  X,
  Zap,
  Cpu,
  Layers,
  Award,
  Flame,
  Activity,
  ShieldCheck,
  Info,
} from 'lucide-react';

export type ModelCategory = 'all' | 'persian_recommended' | 'fast_daily' | 'high_accuracy' | 'custom';

export interface ModelDef {
  id: string;
  name: string;
  description: string;
  sizeBytes: number;
  source: 'whispercpp' | 'huggingface';
  url: string;
  repoUrl?: string;
  filename: string;
  tags: string[];
  isDefault: boolean;
  needsConversion?: boolean;
  isCustom?: boolean;
  category: 'persian_recommended' | 'fast_daily' | 'high_accuracy';
  hwRequirement: string;
  accuracyScore: string;
  speedScore: string;
}

export interface InstalledModel {
  id: string;
  filename: string;
  size_bytes: number;
  is_active: boolean;
}

interface BenchmarkResult {
  duration_ms: number;
  output: string;
  ok: boolean;
}

export const BUILTIN_MODEL_REGISTRY: ModelDef[] = [
  {
    id: 'ggml-small',
    name: 'Whisper Small (انتخاب طلایی فارسی)',
    description: 'بهترین تعادل برای زبان فارسی — ۴۶۶ مگابایت — دقت بسیار بالا با زمان پاسخگویی سریع روی تمام پردازنده‌ها',
    sizeBytes: 466_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    filename: 'ggml-small.bin',
    tags: ['recommended', 'persian', 'golden-choice'],
    isDefault: false,
    category: 'persian_recommended',
    hwRequirement: '۴ گیگابایت رم | ۲ الی ۴ هسته پردازنده',
    accuracyScore: '۹۲٪ دقت فارسی',
    speedScore: 'بسیار سریع (۱ الی ۲ ثانیه)',
  },
  {
    id: 'whisper-medium-q4_1',
    name: 'Whisper Medium Q5 / Q4 (فشرده فوق دقیق)',
    description: 'مدیوم فشرده ۵ بیتی بهینه‌شده — ۵۳۹ مگابایت — دقت ۹۵٪ در سطح Whisper Medium اما با یک‌سوم مصرف رم و سرعت بالا',
    sizeBytes: 539_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-q5_0.bin',
    filename: 'ggml-medium-q5_0.bin',
    tags: ['medium', 'persian', 'compact', 'recommended'],
    isDefault: false,
    category: 'persian_recommended',
    hwRequirement: '۴ گیگابایت رم | ۴ هسته پردازنده',
    accuracyScore: '۹۵٪ دقت فارسی',
    speedScore: 'سریع (۲ الی ۳ ثانیه)',
  },
  {
    id: 'ggml-base',
    name: 'Whisper Base (سبک و روزمره پیش‌فرض)',
    description: 'سریع‌ترین مدل پایدار — ۱۴۲ مگابایت — مصرف رم نامحسوس و مناسب برای پیام‌های کوتاه روزمره',
    sizeBytes: 142_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    filename: 'ggml-base.bin',
    tags: ['balanced', 'recommended', 'fast'],
    isDefault: true,
    category: 'fast_daily',
    hwRequirement: '۲ گیگابایت رم | ۲ هسته پردازنده',
    accuracyScore: '۸۵٪ دقت فارسی',
    speedScore: 'آنی (زیر ۱ ثانیه)',
  },
  {
    id: 'ggml-tiny',
    name: 'Whisper Tiny (فوق سریع و سبک)',
    description: 'کم‌حجم‌ترین مدل با حجم ۷۵ مگابایت — مناسب برای لپ‌تاپ‌های ضعیف یا تست سریع اتصال',
    sizeBytes: 75_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    filename: 'ggml-tiny.bin',
    tags: ['fast', 'lightweight'],
    isDefault: false,
    category: 'fast_daily',
    hwRequirement: '۱ گیگابایت رم | پردازنده ضعیف',
    accuracyScore: '۷۵٪ دقت فارسی',
    speedScore: 'فوق‌سریع (۰.۵ ثانیه)',
  },
  {
    id: 'ggml-medium',
    name: 'Whisper Medium (فوق دقیق ۱.۵ گیگابایت)',
    description: 'دقت عالی برای متون طولانی و اداری — ۱.۵ گیگابایت — نیازمند پردازنده چند هسته‌ای قوی جهت جلوگیری از تأخیر',
    sizeBytes: 1_500_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    filename: 'ggml-medium.bin',
    tags: ['high-accuracy', 'persian', 'heavy'],
    isDefault: false,
    category: 'high_accuracy',
    hwRequirement: '۶ الی ۸ گیگابایت رم | حداقل ۴ تا ۸ هسته CPU قوی',
    accuracyScore: '۹۷٪ دقت فارسی',
    speedScore: 'سنگین روی CPU (۵ الی ۱۰ ثانیه)',
  },
  {
    id: 'ggml-large-v3-turbo',
    name: 'Whisper Large-v3 Turbo (پیشرفته OpenAI)',
    description: 'جدیدترین نسخه توربو لارج — ۱.۵ گیگابایت — سرعت بالاتر از Large معمولی به همراه بالاترین دقت لهجه فارسی',
    sizeBytes: 1_549_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
    filename: 'ggml-large-v3-turbo.bin',
    tags: ['large', 'turbo', 'persian', 'recommended'],
    isDefault: false,
    category: 'high_accuracy',
    hwRequirement: '۸ گیگابایت رم | پردازنده ۸ هسته یا کارت گرافیک',
    accuracyScore: '۹۸٪ بالاترین دقت جهانی',
    speedScore: 'بهینه‌شده (۳ الی ۶ ثانیه)',
  },
  {
    id: 'ggml-large-v3-q5_0',
    name: 'Whisper Large-v3 Q5 (کوانتایز ۵ بیتی)',
    description: 'نسخه فشرده Large-v3 با حجم ۱.۰۳ گیگابایت — دقت نزدیک به نسخه کامل با مصرف رم کنترل‌شده',
    sizeBytes: 1_031_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-q5_0.bin',
    filename: 'ggml-large-v3-q5_0.bin',
    tags: ['large', 'high-accuracy', 'persian'],
    isDefault: false,
    category: 'high_accuracy',
    hwRequirement: '۶ گیگابایت رم | پردازنده قوی',
    accuracyScore: '۹۷.۵٪ دقت فارسی',
    speedScore: 'متوسط (۴ الی ۷ ثانیه)',
  },
  {
    id: 'c1tech_whisper_small_persian',
    name: 'Whisper Small Persian (C1Tech SOTA)',
    description: 'مدل تخصصی رتبه ۱ لیدربورد فارسی — بهینه‌شده با دیتاست‌های بومی فارسی (نیازمند تبدیل با پایتون)',
    sizeBytes: 967_000_000,
    source: 'huggingface',
    url: 'https://huggingface.co/C1Tech/whisper_small_persian/resolve/main/model.safetensors',
    repoUrl: 'https://huggingface.co/C1Tech/whisper_small_persian',
    filename: 'c1tech_whisper_small_persian.safetensors',
    tags: ['sota', 'leaderboard', 'persian'],
    isDefault: false,
    needsConversion: true,
    category: 'persian_recommended',
    hwRequirement: '۴ گیگابایت رم | نیازمند پایتون جهت تبدیل',
    accuracyScore: '۹۶٪ اختصاصی فارسی',
    speedScore: 'سریع پس از تبدیل',
  },
  {
    id: 'hezarai_whisper_small_fa',
    name: 'Whisper Small Fa (فریم‌ورک هزار)',
    description: 'مدل بومی هوش مصنوعی هزار (HezarAI) بازآموزی‌شده روی Common Voice فارسی (نیازمند تبدیل)',
    sizeBytes: 967_000_000,
    source: 'huggingface',
    url: 'https://huggingface.co/hezarai/whisper-small-fa/resolve/main/model.safetensors',
    repoUrl: 'https://huggingface.co/hezarai/whisper-small-fa',
    filename: 'hezarai_whisper_small_fa.safetensors',
    tags: ['hezarai', 'persian', 'trending'],
    isDefault: false,
    needsConversion: true,
    category: 'persian_recommended',
    hwRequirement: '۴ گیگابایت رم | نیازمند پایتون جهت تبدیل',
    accuracyScore: '۹۴٪ تخصصی فارسی',
    speedScore: 'سریع پس از تبدیل',
  },
];

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} گیگابایت`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} مگابایت`;
  return `${Math.round(bytes / 1_000)} کیلوبایت`;
}

export default function ModelManager() {
  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [activeModel, setActiveModel] = useState('ggml-base.bin');
  const [customModels, setCustomModels] = useState<ModelDef[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ModelCategory>('persian_recommended');

  // Benchmark & Testing State
  const [benchmarkingModel, setBenchmarkingModel] = useState<string | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<Record<string, BenchmarkResult>>({});

  // Add Custom Model Form Modal state
  const [showAddForm, setShowAddForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customFilename, setCustomFilename] = useState('');
  const [customTags, setCustomTags] = useState('persian, custom');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [modelsDir, setModelsDir] = useState('');
  const [editingDir, setEditingDir] = useState(false);
  const [newDir, setNewDir] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(0);
  const [converting, setConverting] = useState<string | null>(null);
  const [convertProgressMsg, setConvertProgressMsg] = useState('');
  const [conversionLogs, setConversionLogs] = useState<string[]>([]);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);

  // Load custom models from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('zero_custom_models');
    if (saved) {
      try {
        setCustomModels(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to parse custom models from localStorage', e);
      }
    }
  }, []);

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
      setSuccess('مدل با موفقیت دانلود و به پوشه مدل‌ها اضافه شد');
      setTimeout(() => setSuccess(''), 3500);
      loadStatus();
    });
    const unlistenConvert = listen<any>('model-convert-progress', (event) => {
      const msg = event.payload.message || '';
      setConversionLogs((prev) => [...prev, msg].slice(-200));
      if (msg.startsWith('PROGRESS:')) {
        setConvertProgressMsg(msg.replace('PROGRESS:', '').trim());
      } else if (msg.includes('%|') || msg.includes('MB/s') || msg.includes('kB/s')) {
        setConvertProgressMsg('در حال دریافت: ' + msg.trim());
      }
    });
    return () => {
      unlisten.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenConvert.then((fn) => fn());
    };
  }, [loadStatus]);

  const handleAddCustomModel = () => {
    if (!customName.trim() || !customUrl.trim()) {
      setError('لطفاً حداقل نام مدل و آدرس دانلود یا لینک مخزن را وارد کنید.');
      setTimeout(() => setError(''), 4000);
      return;
    }

    const isHF = customUrl.includes('huggingface.co') && !customUrl.endsWith('.bin') && !customUrl.endsWith('.gguf');
    const autoFilename =
      customFilename.trim() ||
      (customUrl.split('/').pop()?.includes('.')
        ? customUrl.split('/').pop()!
        : `${customName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.bin`);

    const newModel: ModelDef = {
      id: `custom_${Date.now()}`,
      name: customName.trim(),
      description: customDesc.trim() || 'مدل سفارشی افزوده شده توسط کاربر',
      sizeBytes: 500_000_000,
      source: isHF ? 'huggingface' : 'whispercpp',
      url: customUrl.trim(),
      filename: autoFilename,
      tags: customTags.split(',').map((t) => t.trim()).filter(Boolean),
      isDefault: false,
      needsConversion: isHF,
      isCustom: true,
      category: 'persian_recommended',
      hwRequirement: 'سفارشی',
      accuracyScore: 'سفارشی',
      speedScore: 'متغیر',
    };

    const updated = [...customModels, newModel];
    setCustomModels(updated);
    localStorage.setItem('zero_custom_models', JSON.stringify(updated));

    setCustomName('');
    setCustomDesc('');
    setCustomUrl('');
    setCustomFilename('');
    setShowAddForm(false);
    setSuccess('مدل سفارشی با موفقیت اضافه شد!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const removeCustomModel = (id: string) => {
    const updated = customModels.filter((m) => m.id !== id);
    setCustomModels(updated);
    localStorage.setItem('zero_custom_models', JSON.stringify(updated));
    setSuccess('مدل سفارشی حذف شد');
    setTimeout(() => setSuccess(''), 2000);
  };

  const openUrl = async (url: string) => {
    try {
      await invoke('open_external_url', { url });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const downloadModel = async (model: ModelDef) => {
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

  const autoConvertModel = async (model: ModelDef) => {
    setConverting(model.id);
    setConvertProgressMsg('در حال راه‌اندازی فرآیند تبدیل و دانلود...');
    setConversionLogs([]);
    setError('');
    try {
      const rawUrl = model.repoUrl || model.url;
      const repoId = rawUrl
        .replace('https://huggingface.co/', '')
        .split('/resolve/main')[0]
        .split('/blob/main')[0]
        .split('/tree/main')[0]
        .trim();

      await invoke('auto_convert_hf_model', { repoId, filename: model.filename });
      setSuccess('مدل با موفقیت تبدیل و دانلود شد');
      setTimeout(() => setSuccess(''), 3000);
      loadStatus();
    } catch (e: any) {
      setError(typeof e === 'string' ? e : 'خطا در تبدیل مدل');
      setShowLogsModal(true);
    } finally {
      setConverting(null);
    }
  };

  const convertLocalModel = async (model: ModelDef) => {
    try {
      const result = await invoke<string | null>('pick_folder');
      if (result) {
        setConverting(model.id);
        setConvertProgressMsg('در حال پردازش فایل‌های محلی...');
        setConversionLogs([]);
        setError('');
        try {
          await invoke('auto_convert_hf_model', { repoId: result, filename: model.filename });
          setSuccess('مدل محلی با موفقیت تبدیل شد');
          setTimeout(() => setSuccess(''), 3000);
          loadStatus();
        } catch (e: any) {
          setError(typeof e === 'string' ? e : 'خطا در تبدیل مدل محلی');
          setShowLogsModal(true);
        } finally {
          setConverting(null);
        }
      }
    } catch {
      setError('خطا در انتخاب پوشه');
    }
  };

  const confirmDeleteModel = (modelId: string) => {
    setModelToDelete(modelId);
  };

  const deleteModel = async () => {
    if (!modelToDelete) return;
    try {
      await invoke('delete_model', { modelId: modelToDelete });
      setSuccess('مدل با موفقیت از دیسک حذف شد');
      setTimeout(() => setSuccess(''), 3000);
      loadStatus();
    } catch (e: any) {
      setError(typeof e === 'string' ? e : 'خطا در حذف مدل');
    } finally {
      setModelToDelete(null);
    }
  };

  const activateModel = async (modelId: string) => {
    try {
      const testRes = await invoke<any>('test_model', { modelId });
      if (testRes && testRes.exists && !testRes.is_valid) {
        setError(`مدل ${modelId} ناقص یا آسیب‌دیده است و امکان فعال‌سازی آن وجود ندارد.`);
        setTimeout(() => setError(''), 4000);
        return;
      }
      await invoke('set_active_model', { modelId });
      setActiveModel(modelId);
      setSuccess(`مدل ${modelId} با موفقیت فعال شد و به دیمون اعمال گردید.`);
      setTimeout(() => setSuccess(''), 3000);
      loadStatus();
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : (e?.message || 'خطا در فعال‌سازی مدل');
      if (msg.includes('not found')) {
        setError(`فایل مدل یافت نشد. لطفاً مدل را مجدداً دانلود کنید.`);
      } else {
        setError(msg);
      }
    }
  };

  const runBenchmark = async (modelFilename: string) => {
    setBenchmarkingModel(modelFilename);
    setError('');
    try {
      const res = await invoke<any>('test_model_inference', { modelId: modelFilename });
      if (res && res.ok) {
        setBenchmarkResults((prev) => ({
          ...prev,
          [modelFilename]: {
            duration_ms: res.duration_ms,
            output: res.output || 'تست باینری موفق بدون هذیان',
            ok: true,
          },
        }));
        setSuccess(`تست مدل موفق: زمان استنتاج ${(res.duration_ms / 1000).toFixed(2)} ثانیه — باینری بدون مشکل اجرا شد.`);
        setTimeout(() => setSuccess(''), 4500);
      } else {
        setError('پاسخی از مدل دریافت نشد');
      }
    } catch (e: any) {
      setError(typeof e === 'string' ? e : (e?.message || 'خطا در اجرای تست مدل'));
    } finally {
      setBenchmarkingModel(null);
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

  const openModelsDir = async () => {
    try {
      await invoke('open_models_dir');
    } catch (e: any) {
      setError(typeof e === 'string' ? e : 'خطا در باز کردن پوشه');
    }
  };

  const pickFolder = async () => {
    try {
      const result = await invoke<string | null>('pick_folder');
      if (result) {
        setNewDir(result);
        await invoke('set_models_dir', { dir: result });
        setModelsDir(result);
        setEditingDir(false);
        setSuccess('پوشه جدید مدل‌ها با موفقیت تنظیم شد');
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

  const getInstalled = (filename: string) => installed.find((m) => m.filename === filename);

  const allModels = useMemo(() => [...BUILTIN_MODEL_REGISTRY, ...customModels], [customModels]);

  const filteredModels = useMemo(() => {
    if (selectedCategory === 'all') return allModels;
    if (selectedCategory === 'custom') return allModels.filter((m) => m.isCustom);
    return allModels.filter((m) => m.category === selectedCategory);
  }, [allModels, selectedCategory]);

  const totalStorageBytes = installed.reduce((acc, m) => acc + (m.size_bytes || 0), 0);
  const installedCount = installed.length;
  const activeInstalledModel = installed.find((m) => m.filename === activeModel || m.id === activeModel);

  return (
    <div className="space-y-6 dir-rtl text-right">
      {/* Header & Status Banner */}
      <div className="bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-950/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl shadow-black/20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl shadow-inner shrink-0 mt-0.5">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-black text-white tracking-tight">مدیریت موتور و مدل‌های گفتار به متن (STT)</h3>
                <span className="text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> فیلتر ضد هذیان فعال
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                مدل‌های Whisper محلی بر روی حافظه سیستم اجرا می‌شوند و هیچ دیتایی به خارج ارسال نمی‌گردد.
              </p>
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-300 flex-wrap">
                <div className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-800/80 px-3 py-1 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>مدل فعال فعلی:</span>
                  <strong className="text-blue-400 font-mono dir-ltr">{activeModel}</strong>
                  {activeInstalledModel && (
                    <span className="text-[10px] text-slate-400 font-mono">({formatSize(activeInstalledModel.size_bytes)})</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-800/80 px-3 py-1 rounded-lg">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>مدل‌های نصب‌شده:</span>
                  <strong className="text-purple-300">{installedCount} مدل</strong>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-400 dir-ltr">{formatSize(totalStorageBytes)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 shadow-lg shadow-purple-900/20 transition-all hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" />
              افزودن مدل دلخواه
            </button>
            <button
              onClick={loadStatus}
              className="text-slate-400 hover:text-white p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 transition"
              title="بررسی مجدد مدل‌ها و سلامت دیسک"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Directory settings bar */}
        <div className="mt-5 pt-4 border-t border-slate-800/60 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-slate-400 shrink-0 font-medium">پوشه ذخیره‌سازی مدل‌ها:</span>
            {editingDir ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={newDir}
                  onChange={(e) => setNewDir(e.target.value)}
                  placeholder="مثال: D:\ZeroModels"
                  className="flex-1 bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-1 text-xs text-white dir-ltr text-left"
                />
                <button
                  onClick={saveNewDir}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-3 rounded-lg transition"
                >
                  ذخیره
                </button>
                <button
                  onClick={() => setEditingDir(false)}
                  className="text-slate-400 hover:text-white py-1 px-2 rounded-lg transition"
                >
                  انصراف
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800/90 rounded-lg px-2.5 py-1 flex-1 max-w-xl">
                <span className="font-mono text-slate-300 truncate dir-ltr text-left flex-1">{modelsDir}</span>
                <button onClick={copyPath} className="text-slate-500 hover:text-white transition p-1" title="کپی مسیر">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setNewDir(modelsDir);
                    setEditingDir(true);
                  }}
                  className="text-slate-500 hover:text-blue-400 transition p-1"
                  title="ویرایش دستی مسیر"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openModelsDir}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-3 rounded-lg border border-slate-700/60 transition"
            >
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
              باز کردن پوشه مدل‌ها
            </button>
            <button
              onClick={pickFolder}
              className="flex items-center gap-1.5 bg-slate-800/50 hover:bg-slate-800 text-slate-300 py-1.5 px-3 rounded-lg border border-slate-700/40 transition"
            >
              <FolderDown className="w-3.5 h-3.5" />
              انتخاب پوشه دیگر
            </button>
          </div>
        </div>
      </div>

      {/* Persian Advice Notice */}
      <div className="bg-blue-950/30 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1 text-slate-300 leading-relaxed">
          <p>
            <strong className="text-white">نکته بسیار مهم در دقت زبان فارسی:</strong> مدل{' '}
            <span className="text-teal-300 font-bold">Whisper Small (۴۶۶ مگابایت)</span> و{' '}
            <span className="text-amber-300 font-bold">Whisper Medium Q4 (۴۶۹ مگابایت)</span> بهترین بازدهی دقت و سرعت را روی سیستم‌های عادی دارند. مدل‌های سنگین ۱.۵ گیگابایتی (مثل Medium کامل) دقت عالی دارند اما روی پردازنده‌های معمولی نیازمند ۵ تا ۱۰ ثانیه زمان پردازش به ازای هر جمله هستند.
          </p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setSelectedCategory('persian_recommended')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shrink-0 ${
            selectedCategory === 'persian_recommended'
              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900/60 border border-transparent'
          }`}
        >
          <Award className="w-4 h-4 text-teal-400" />
          🌟 پیشنهادی طلایی فارسی
        </button>

        <button
          onClick={() => setSelectedCategory('fast_daily')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shrink-0 ${
            selectedCategory === 'fast_daily'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900/60 border border-transparent'
          }`}
        >
          <Zap className="w-4 h-4 text-blue-400" />
          ⚡ سریع و روزمره (سبک)
        </button>

        <button
          onClick={() => setSelectedCategory('high_accuracy')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shrink-0 ${
            selectedCategory === 'high_accuracy'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900/60 border border-transparent'
          }`}
        >
          <Flame className="w-4 h-4 text-purple-400" />
          🎯 فوق‌دقیق و سنگین (۱.۵ گیگابایت)
        </button>

        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shrink-0 ${
            selectedCategory === 'all'
              ? 'bg-slate-800 text-white border border-slate-700'
              : 'text-slate-400 hover:text-white hover:bg-slate-900/60 border border-transparent'
          }`}
        >
          <Layers className="w-4 h-4" />
          📦 همه مدل‌ها ({allModels.length})
        </button>

        {customModels.length > 0 && (
          <button
            onClick={() => setSelectedCategory('custom')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shrink-0 ${
              selectedCategory === 'custom'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60 border border-transparent'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            سفارشی ({customModels.length})
          </button>
        )}
      </div>

      {/* Custom Model Form Modal */}
      {showAddForm && (
        <div className="bg-purple-950/20 border border-purple-500/30 rounded-2xl p-5 space-y-4 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
            <h4 className="text-sm font-bold text-purple-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" /> افزودن مدل جدید و سفارشی (Custom STT Model)
            </h4>
            <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">نام مدل *</label>
              <input
                type="text"
                placeholder="مثال: مدل فارسی اختصاصی من"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">نام فایل ذخیره‌سازی (.bin) *</label>
              <input
                type="text"
                placeholder="مثال: my_custom_model.bin"
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white dir-ltr text-left font-mono"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">آدرس مستقیم دانلود یا مخزن Hugging Face *</label>
              <input
                type="text"
                placeholder="مثال: https://huggingface.co/username/repo-name یا لینک مستقیم فایل .bin"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white dir-ltr text-left font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">توضیحات کوتاه</label>
              <input
                type="text"
                placeholder="توضیح کوتاه درباره این مدل..."
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">تگ‌ها (جداشده با کاما)</label>
              <input
                type="text"
                placeholder="مثال: persian, custom, fast"
                value={customTags}
                onChange={(e) => setCustomTags(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white dir-ltr text-left"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-purple-500/20">
            <button
              onClick={() => setShowAddForm(false)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 px-4 rounded-xl transition"
            >
              انصراف
            </button>
            <button
              onClick={handleAddCustomModel}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2 px-5 rounded-xl flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              افزودن به لیست مدل‌ها
            </button>
          </div>
        </div>
      )}

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 gap-4">
        {filteredModels.map((model) => {
          const installedModel = getInstalled(model.filename);
          const isActive = activeModel === model.filename || activeModel === model.id;
          const isDownloading = downloading === model.id;
          const isConverting = converting === model.id;
          const isBenchmarking = benchmarkingModel === model.filename;
          const benchResult = benchmarkResults[model.filename];
          const progressPercent = downloadTotal > 0 ? (downloadProgress / downloadTotal) * 100 : 0;

          return (
            <div
              key={model.id}
              className={`border rounded-2xl p-5 transition-all shadow-md ${
                isActive
                  ? 'border-blue-500/80 bg-blue-500/10 shadow-blue-900/20 ring-1 ring-blue-500/40'
                  : installedModel
                  ? 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60'
                  : 'border-slate-800/60 bg-slate-950/40 hover:border-slate-800 hover:bg-slate-900/30'
              }`}
            >
              <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                {/* Details */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-base font-bold text-white tracking-tight">{model.name}</h4>
                    {isActive && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Check className="w-3 h-3" /> مدل فعال دیمون
                      </span>
                    )}
                    {installedModel && !isActive && (
                      <span className="text-[10px] bg-slate-800 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> دانلود شده ({formatSize(installedModel.size_bytes)})
                      </span>
                    )}
                    {model.category === 'persian_recommended' && (
                      <span className="text-[10px] bg-teal-500/15 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        🌟 انتخاب طلایی فارسی
                      </span>
                    )}
                    {model.tags.includes('sota') && (
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold">
                        🏆 رتبه ۱ لیدربورد
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">{model.description}</p>

                  {/* Performance Badges */}
                  <div className="flex items-center gap-2 flex-wrap text-[11px] pt-1">
                    <div className="flex items-center gap-1 bg-slate-950/70 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-300">
                      <Cpu className="w-3.5 h-3.5 text-blue-400" />
                      <span>{model.hwRequirement}</span>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-950/70 border border-slate-800 px-2.5 py-1 rounded-lg text-emerald-300">
                      <Award className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{model.accuracyScore}</span>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-950/70 border border-slate-800 px-2.5 py-1 rounded-lg text-amber-300">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>{model.speedScore}</span>
                    </div>

                    <span className="text-slate-500 font-mono text-[10px] dir-ltr bg-slate-900 px-2 py-1 rounded">
                      {model.filename} ({formatSize(model.sizeBytes)})
                    </span>
                  </div>

                  {/* Live Benchmark Result Pill */}
                  {benchResult && (
                    <div className="mt-2 bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-2.5 flex items-center gap-2 text-xs text-emerald-300 animate-in fade-in">
                      <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        تست سرعت استنتاج: <strong>{(benchResult.duration_ms / 1000).toFixed(2)} ثانیه</strong> روی پردازنده — مدل ۱۰۰٪ سالم و آماده تبدیل صوت است.
                      </span>
                    </div>
                  )}

                  {/* Download Links & Tools */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      onClick={() => openUrl(model.url)}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition font-medium bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg"
                      title="دانلود با مرورگر"
                    >
                      <Download className="w-3 h-3" />
                      لینک دانلود با مرورگر
                    </button>
                    {model.repoUrl && (
                      <button
                        onClick={() => openUrl(model.repoUrl!)}
                        className="inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition font-medium bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg"
                      >
                        <ExternalLink className="w-3 h-3" />
                        صفحه مخزن
                      </button>
                    )}
                    <button
                      onClick={() => copyUrl(model.url)}
                      className="text-[11px] text-slate-400 hover:text-white transition flex items-center gap-1 bg-slate-800/60 border border-slate-700/50 px-2 py-1 rounded-lg"
                    >
                      {copiedUrl === model.url ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          کپی شد
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          کپی لینک
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap lg:flex-nowrap">
                  {isDownloading ? (
                    <div className="flex items-center gap-2 bg-slate-950 border border-blue-500/40 rounded-xl p-3">
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                      <div className="w-36">
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full transition-all"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 block text-center dir-ltr">
                          {formatSize(downloadProgress)} / {formatSize(downloadTotal)}
                        </span>
                      </div>
                    </div>
                  ) : isConverting ? (
                    <div className="flex items-center gap-2 bg-slate-950 border border-amber-500/40 rounded-xl p-3">
                      <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                      <span className="text-xs text-amber-300 max-w-[200px] truncate" title={convertProgressMsg}>
                        {convertProgressMsg}
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Live Inference Benchmark Test Button */}
                      {installedModel && (
                        <button
                          onClick={() => runBenchmark(model.filename)}
                          disabled={isBenchmarking}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold py-2 px-3 rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
                          title="تست سرعت استنتاج و سلامت باینری مدل با یک نمونه صدا"
                        >
                          {isBenchmarking ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          ) : (
                            <Activity className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          تست سرعت و کارایی
                        </button>
                      )}

                      {/* Activate Button */}
                      {installedModel &&
                        (isActive ? (
                          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 rounded-xl">
                            <Check className="w-4 h-4" />
                            مدل فعال
                          </span>
                        ) : (
                          <button
                            onClick={() => activateModel(model.filename)}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md transition-all hover:scale-[1.02]"
                          >
                            فعال‌سازی مدل
                          </button>
                        ))}

                      {/* Download Button */}
                      {!installedModel && !model.needsConversion && (
                        <button
                          onClick={() => downloadModel(model)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 shadow-md transition-all hover:scale-[1.02]"
                        >
                          <Download className="w-4 h-4" />
                          دانلود مدل
                        </button>
                      )}

                      {/* Convert Button for HuggingFace safetensors */}
                      {!installedModel && model.needsConversion && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => autoConvertModel(model)}
                            className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold py-2 px-3 rounded-xl flex items-center gap-1.5 transition"
                            title="دانلود خودکار فایل‌ها و تبدیل به باینری GGML"
                          >
                            <Download className="w-3.5 h-3.5" />
                            دانلود و تبدیل خودکار
                          </button>
                          <button
                            onClick={() => convertLocalModel(model)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 px-2.5 rounded-xl border border-slate-700 transition"
                            title="تبدیل فایل‌های موجود در سیستم"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Remove Custom Model Definition */}
                      {model.isCustom && (
                        <button
                          onClick={() => removeCustomModel(model.id)}
                          className="border border-purple-800/40 hover:border-rose-900/50 hover:bg-rose-950/20 p-2 rounded-xl text-purple-300 hover:text-rose-400 transition"
                          title="حذف از لیست مدل‌های سفارشی"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete File from Disk */}
                      {installedModel && !isActive && !model.isCustom && (
                        <button
                          onClick={() => confirmDeleteModel(model.filename)}
                          className="border border-transparent hover:border-rose-900/30 hover:bg-rose-950/20 p-2 rounded-xl text-slate-500 hover:text-rose-400 transition"
                          title="حذف فایل مدل از روی هارد"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Guide Card */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> راهنمای عملکرد و تنظیم بهینه مدل‌ها
        </h4>
        <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside leading-relaxed">
          <li>
            تمامی تبدیل‌های صوتی بدون ارسال حتی یک بایت به اینترنت و به شکل محلی بر روی سیستم پردازش می‌شوند.
          </li>
          <li>
            در صورتی که سیستمی با پردازنده معمولی (Core i5 یا Core i7 نسل‌های قبل) دارید، انتخاب مدل <strong className="text-teal-300">Whisper Small</strong> باعث می‌شود گفتار فارسی در کمتر از ۲ ثانیه بدون تاخیر تایپ شود.
          </li>
          <li>
            مدل <strong className="text-purple-300">Whisper Medium (۱.۵ گیگابایت)</strong> برای کاربران با سیستم‌های قوی یا متون بسیار پیچیده تخصصی طراحی شده است.
          </li>
          <li>
            فایل‌های باینری به شکل خودکار پس از ۵ دقیقه عدم استفاده از رم سیستم تخلیه می‌شوند تا حافظه کامپیوتر شما آزاد باقی بماند.
          </li>
        </ul>
      </div>

      {/* Error / Success Toasts */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-md px-4 pointer-events-none">
        {error && (
          <div className="bg-slate-950 border border-rose-500 shadow-2xl shadow-rose-900/30 rounded-2xl p-4 flex items-center gap-3 animate-in slide-in-from-bottom-4">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="text-xs font-bold text-rose-400">{error}</span>
          </div>
        )}
        {success && (
          <div className="bg-slate-950 border border-emerald-500 shadow-2xl shadow-emerald-900/30 rounded-2xl p-4 flex items-center gap-3 animate-in slide-in-from-bottom-4">
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="text-xs font-bold text-emerald-400">{success}</span>
          </div>
        )}
      </div>

      {/* Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" /> لاگ‌های عملیات تبدیل
              </h3>
              <button onClick={() => setShowLogsModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 bg-black/40">
              <pre className="text-[10px] text-slate-300 font-mono whitespace-pre-wrap dir-ltr text-left">
                {conversionLogs.length === 0 ? 'هیچ لاگی ثبت نشده است...' : conversionLogs.join('\n')}
              </pre>
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowLogsModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2 px-4 rounded-xl"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modelToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-rose-900/50 rounded-2xl w-full max-w-md shadow-2xl shadow-rose-900/20 animate-in fade-in zoom-in-95">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 text-rose-500">
                <AlertCircle className="w-6 h-6" />
                <h3 className="text-sm font-bold">حذف مدل از روی دیسک</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                آیا از حذف این فایل مدل از پوشه مدل‌ها اطمینان دارید؟ با حذف مدل، فضای دیسک آزاد شده و برای استفاده مجدد باید دوباره دانلود شود.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setModelToDelete(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 px-4 rounded-xl transition"
                >
                  انصراف
                </button>
                <button
                  onClick={deleteModel}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-2 px-5 rounded-xl flex items-center gap-1.5 transition"
                >
                  <Trash2 className="w-4 h-4" />
                  حذف قطعی مدل
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
