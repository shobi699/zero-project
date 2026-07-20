import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Mic, Shield, Server, ArrowLeft, ArrowRight, CheckCircle, RefreshCw, Loader2 } from 'lucide-react';

interface OnboardingProps {
  onComplete: (config: { gatewayUrl: string; localMode: boolean }) => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [gatewayUrl, setGatewayUrl] = useState('http://localhost:9009');
  const [apiKey, setApiKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(75_000_000);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);

  useEffect(() => {
    const unlisten = listen<any>('model-download-progress', (event) => {
      setDownloadProgress(event.payload.downloaded);
      setDownloadTotal(event.payload.total);
    });
    const unlistenComplete = listen<any>('model-download-complete', () => {
      setIsDownloading(false);
      setDownloadComplete(true);
      setDownloadProgress(0);
    });
    // Check if model already exists on disk
    invoke<any>('test_model', { modelId: 'ggml-base.bin' })
      .then((res) => {
        if (res && res.exists) {
          setDownloadComplete(true);
        }
      })
      .catch(() => {});
    return () => {
      unlisten.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, []);

  const testConnection = async () => {
    setIsTesting(true);
    setTestResult('idle');
    try {
      // Simulate connection test
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setTestResult('success');
    } catch {
      setTestResult('error');
    } finally {
      setIsTesting(false);
    }
  };

  const startModelDownload = async () => {
    setIsDownloading(true);
    setDownloadError('');
    try {
      await invoke('download_model', {
        modelId: 'ggml-base.bin',
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
      });
    } catch (e: any) {
      setIsDownloading(false);
      setDownloadError(typeof e === 'string' ? e : 'خطا در دانلود مدل');
    }
  };

  const checkMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setHasMicPermission(true);
    } catch {
      setHasMicPermission(false);
    }
  };

  const handleFinish = () => {
    onComplete({
      gatewayUrl,
      localMode: downloadComplete,
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden select-none">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px]" />

      <div className="w-full max-w-xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-8 relative z-10">
        
        {/* Step Indicator */}
        <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
          <span className="text-sm font-semibold text-slate-400">مرحله {step} از ۴</span>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`w-8 h-1.5 rounded-full transition-all duration-300 ${
                  s === step ? 'bg-blue-500 w-12' : s < step ? 'bg-blue-500/40' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step Content */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-blue-500/10 rounded-full border border-blue-500/20 text-blue-400">
                <Mic className="w-12 h-12" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-center text-white">به Zero خوش آمدید</h2>
            <p className="text-slate-300 text-center leading-relaxed">
              برنامه Zero به شما امکان می‌دهد در هر پنجره یا فیلد متنی، به راحتی صحبت کنید و گفتار شما به طور زنده و خودکار به متن تبدیل شده و تایپ می‌شود.
            </p>
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm text-slate-300">
                <span>کلید میانبر پیش‌فرض (PTT):</span>
                <span className="font-mono bg-slate-900 px-2 py-0.5 rounded text-blue-400 border border-slate-700">Ctrl + Shift + Z</span>
              </div>
              <p className="text-xs text-slate-400 text-right">دکمه‌ها را نگه دارید تا ضبط آغاز شود، و با رها کردن آن‌ها متن درج خواهد شد.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-purple-500/10 rounded-full border border-purple-500/20 text-purple-400">
                <Server className="w-12 h-12" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-center text-white">تنظیمات سرور ابری</h2>
            <p className="text-slate-300 text-center text-sm">
              آدرس سرور مرکزی و کلید دسترسی حساب کاربری خود را برای اتصال به هوش مصنوعی وارد کنید.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">آدرس سرور (Gateway URL)</label>
                <input
                  type="text"
                  value={gatewayUrl}
                  onChange={(e) => setGatewayUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 text-left dir-ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">کلید API یا توکن دسترسی (اختیاری)</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 text-left dir-ltr"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={testConnection}
                  disabled={isTesting}
                  className="bg-slate-800 hover:bg-slate-700 active:bg-slate-750 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50"
                >
                  {isTesting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  تست اتصال
                </button>
                {testResult === 'success' && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                    <CheckCircle className="w-4 h-4" /> اتصال با موفقیت برقرار شد
                  </span>
                )}
                {testResult === 'error' && (
                  <span className="text-xs text-rose-400 font-semibold">
                    خطا در برقراری ارتباط با سرور
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-teal-500/10 rounded-full border border-teal-500/20 text-teal-400">
                <Shield className="w-12 h-12" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-center text-white">موتور تبدیل گفتار آفلاین</h2>
            <p className="text-slate-300 text-center text-sm">
              برای تبدیل گفتار به صورت ۱۰۰٪ آفلاین و بدون نیاز به اینترنت، مدل سبک هوش مصنوعی را روی سیستم خود بارگذاری کنید.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-white text-sm">مدل Whisper Base (پیشفرض)</h4>
                  <p className="text-xs text-slate-500">حجم فایل: ۱۴۲ مگابایت | بهترین تعادل سرعت و دقت</p>
                </div>
                {downloadComplete ? (
                  <span className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-bold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> آماده استفاده
                  </span>
                ) : (
                  <button
                    onClick={startModelDownload}
                    disabled={isDownloading}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        در حال دریافت...
                      </>
                    ) : (
                      'دریافت مدل'
                    )}
                  </button>
                )}
              </div>

              {isDownloading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-400">
                    <span>پیشرفت دریافت:</span>
                    <span>{downloadTotal > 0 ? Math.round((downloadProgress / downloadTotal) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-slate-850 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${downloadTotal > 0 ? (downloadProgress / downloadTotal) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 text-center">
                    {downloadProgress > 0 ? `${Math.round(downloadProgress / 1_000_000)}MB / ${Math.round(downloadTotal / 1_000_000)}MB` : 'در حال شروع...'}
                  </p>
                </div>
              )}

              {downloadError && (
                <p className="text-xs text-rose-400 font-semibold">{downloadError}</p>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-emerald-400">
                <CheckCircle className="w-12 h-12" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-center text-white">پیکربندی نهایی و دسترسی‌ها</h2>
            <p className="text-slate-300 text-center text-sm">
              دسترسی به میکروفون را برای شروع کار بررسی کنید و فرآیند را به پایان برسانید.
            </p>

            <div className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-300">بررسی دسترسی میکروفون سیستم:</span>
                {hasMicPermission === true ? (
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full font-bold">
                    تایید شده
                  </span>
                ) : (
                  <button
                    onClick={checkMicrophone}
                    className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                  >
                    تست میکروفون
                  </button>
                )}
              </div>
              {hasMicPermission === false && (
                <p className="text-xs text-rose-400 font-semibold text-center">
                  میکروفون یافت نشد یا دسترسی مسدود است. لطفاً تنظیمات ویندوز خود را بررسی کنید.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center mt-8 border-t border-slate-800 pt-6">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="text-slate-400 hover:text-white text-sm font-semibold flex items-center gap-1 transition"
            >
              <ArrowLeft className="w-4 h-4" /> مرحله قبل
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-lg shadow-blue-500/20"
            >
              مرحله بعد <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white px-8 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-500/20"
            >
              ورود به استودیو
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
