import React, { useState, useEffect } from 'react';
import { extractPlaceholders, fillPlaceholders, PlaceholderItem } from '../utils/persianNormalizer';
import { Check, Copy, Send, Sparkles, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface Props {
  templateText: string;
  title?: string;
  onClose: () => void;
  onApply?: (filledText: string) => void;
}

export default function PlaceholderFillModal({ templateText, title = 'پر کردن هوشمند جای‌خالی‌ها', onClose, onApply }: Props) {
  const [placeholders, setPlaceholders] = useState<PlaceholderItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [filledText, setFilledText] = useState('');
  const [copied, setCopied] = useState(false);
  const [injected, setInjected] = useState(false);

  useEffect(() => {
    const extracted = extractPlaceholders(templateText);
    setPlaceholders(extracted);

    const initialValues: Record<string, string> = {};
    extracted.forEach(item => {
      initialValues[item.raw] = '';
    });
    setValues(initialValues);
  }, [templateText]);

  useEffect(() => {
    setFilledText(fillPlaceholders(templateText, values));
  }, [templateText, values]);

  const handleChange = (raw: string, val: string) => {
    setValues(prev => ({ ...prev, [raw]: val }));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(filledText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInject = async () => {
    try {
      await invoke('inject_text', { text: filledText });
      setInjected(true);
      setTimeout(() => setInjected(false), 2000);
    } catch (e) {
      console.error('Failed to inject text:', e);
      handleCopy();
    }
  };

  const handleUseInApp = () => {
    if (onApply) onApply(filledText);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-400">
            <Sparkles className="w-5 h-5" />
            <h3 className="text-sm font-bold text-white">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-slate-100">
          {placeholders.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 font-semibold">
                مقادیر فیلدهای جای‌خالی را وارد کنید تا متن نهایی خودکار تکمیل شود:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {placeholders.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <label className="block text-xs font-semibold text-amber-300">
                      {item.label} <span className="text-slate-500 font-mono text-[10px]">{item.raw}</span>
                    </label>
                    <input
                      type="text"
                      placeholder={`مقدار ${item.label}...`}
                      value={values[item.raw] || ''}
                      onChange={(e) => handleChange(item.raw, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-white outline-none transition"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">هیچ فیلد جای‌خالی `[...]` یافت نشد. متن کامل آماده استفاده است.</p>
          )}

          {/* Live Preview */}
          <div className="space-y-1 pt-2 border-t border-slate-800">
            <label className="block text-xs font-semibold text-slate-400">پیش‌نمایش زنده متن نهایی:</label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 leading-relaxed font-sans max-h-48 overflow-y-auto whitespace-pre-wrap dir-rtl text-right">
              {filledText}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'کپی شد' : 'کپی متن'}
            </button>
            <button
              onClick={handleInject}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-3.5 py-2 rounded-xl transition"
            >
              {injected ? <Check className="w-4 h-4 text-emerald-400" /> : <Send className="w-4 h-4" />}
              {injected ? 'درج شد' : 'درج در برنامه فعال'}
            </button>
          </div>

          {onApply && (
            <button
              onClick={handleUseInApp}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition"
            >
              استفاده در یادداشت
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
