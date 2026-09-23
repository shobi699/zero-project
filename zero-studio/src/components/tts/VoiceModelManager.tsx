import React, { useState, useEffect } from 'react';
import { X, Download, HardDrive, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface ModelStatus {
  id: string;
  name: string;
  engine: string;
  status: 'missing' | 'downloading' | 'extracting' | 'downloaded' | 'done' | 'error';
  progress: number;
  error?: string;
}

interface Props {
  onClose: () => void;
  apiBase: string;
}

export default function VoiceModelManager({ onClose, apiBase }: Props) {
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchModels();
    const interval = setInterval(fetchModels, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch(`${apiBase}/settings/models`);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } catch (e) {
      console.error('Failed to fetch settings models:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerDownload = async (modelId: string) => {
    try {
      await fetch(`${apiBase}/settings/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId })
      });
      fetchModels(); // Refresh immediately
    } catch (e) {
      console.error('Failed to trigger download:', e);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" dir="rtl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-400" />
            مدیریت و دانلود مدل‌ها
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-rose-400 bg-slate-800/50 hover:bg-slate-800 p-1.5 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {isLoading && models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
              <p className="text-sm">در حال بارگذاری اطلاعات...</p>
            </div>
          ) : (
            models.map(m => (
              <div key={m.id} className="bg-slate-950/50 rounded-xl p-4 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-white text-sm mb-1">{m.name}</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5" /> موتور: {m.engine === 'piper' ? 'Piper VITS' : 'Sherpa-ONNX'}
                  </p>
                </div>
                
                <div className="min-w-[120px]">
                  {(m.status === 'downloaded' || m.status === 'done') && (
                    <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/20 flex items-center gap-1.5 justify-center w-full">
                      <CheckCircle2 className="w-4 h-4" /> نصب شده
                    </span>
                  )}
                  {m.status === 'missing' && (
                    <button 
                      onClick={() => triggerDownload(m.id)}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" /> دانلود و نصب
                    </button>
                  )}
                  {(m.status === 'downloading' || m.status === 'extracting') && (
                    <div className="flex flex-col items-end gap-1.5 w-32">
                      <span className="text-[10px] text-amber-400 font-bold">
                        {m.status === 'downloading' ? 'در حال دانلود' : 'استخراج'} {m.progress}%
                      </span>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-amber-400 h-full transition-all duration-300" style={{ width: `${m.progress}%` }}></div>
                      </div>
                    </div>
                  )}
                  {m.status === 'error' && (
                    <button 
                      onClick={() => triggerDownload(m.id)}
                      title={m.error}
                      className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-rose-500/20 flex items-center gap-1.5 justify-center transition"
                    >
                      <AlertTriangle className="w-4 h-4" /> تلاش مجدد
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
