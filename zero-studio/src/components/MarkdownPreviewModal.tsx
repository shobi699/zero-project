import React, { useState } from 'react';
import { Check, Copy, Download, ExternalLink, Eye, FileText, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface Props {
  content: string;
  title?: string;
  onClose: () => void;
  onUpdateContent?: (newContent: string) => void;
}

export default function MarkdownPreviewModal({ content, title = 'پیش‌نمایش مارک‌داون (Markdown)', onClose, onUpdateContent }: Props) {
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleOpenLink = (url: string) => {
    invoke('open_external_url', { url }).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  };

  // Simple Markdown Renderer
  const renderMarkdownLines = () => {
    if (!content) return <p className="text-slate-500 text-xs">متنی برای پیش‌نمایش وجود ندارد.</p>;

    const lines = content.split('\n');
    let inCodeBlock = false;
    let codeBlockBuffer: string[] = [];
    let codeBlockLang = '';
    const elements: React.ReactNode[] = [];

    lines.forEach((line, idx) => {
      // Code Block Start/End
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          // Close Code Block
          const codeText = codeBlockBuffer.join('\n');
          const codeId = `code-${idx}`;
          elements.push(
            <div key={codeId} className="relative group my-3 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden text-left dir-ltr">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[10px] text-slate-400 font-mono">
                <span>{codeBlockLang || 'code'}</span>
                <button
                  onClick={() => copyText(codeText, codeId)}
                  className="hover:text-white flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded transition"
                >
                  {copiedCodeId === codeId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedCodeId === codeId ? 'کپی شد' : 'کپی کد'}
                </button>
              </div>
              <pre className="p-3 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed">
                <code>{codeText}</code>
              </pre>
            </div>
          );
          inCodeBlock = false;
          codeBlockBuffer = [];
          codeBlockLang = '';
        } else {
          inCodeBlock = true;
          codeBlockLang = line.trim().replace('```', '').trim();
        }
        return;
      }

      if (inCodeBlock) {
        codeBlockBuffer.push(line);
        return;
      }

      // Headings
      if (line.startsWith('# ')) {
        elements.push(<h1 key={idx} className="text-lg font-bold text-amber-400 border-b border-slate-800 pb-1 mt-4 mb-2">{line.replace('# ', '')}</h1>);
        return;
      }
      if (line.startsWith('## ')) {
        elements.push(<h2 key={idx} className="text-base font-bold text-blue-400 mt-3 mb-1.5">{line.replace('## ', '')}</h2>);
        return;
      }
      if (line.startsWith('### ')) {
        elements.push(<h3 key={idx} className="text-sm font-bold text-teal-400 mt-2 mb-1">{line.replace('### ', '')}</h3>);
        return;
      }

      // Todo Checkboxes: - [ ] or - [x]
      if (/^\s*- \[( |x)\] /.test(line)) {
        const checked = /^\s*- \[x\] /.test(line);
        const textPart = line.replace(/^\s*- \[( |x)\] /, '');

        const toggleCheck = () => {
          if (!onUpdateContent) return;
          const newCheckedState = !checked;
          const updatedLines = [...lines];
          updatedLines[idx] = line.replace(/^\s*- \[( |x)\] /, `- [${newCheckedState ? 'x' : ' '}] `);
          onUpdateContent(updatedLines.join('\n'));
        };

        elements.push(
          <div key={idx} className="flex items-center gap-2 my-1 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={checked}
              onChange={toggleCheck}
              className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
            />
            <span className={checked ? 'line-through text-slate-500' : ''}>{textPart}</span>
          </div>
        );
        return;
      }

      // Bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        elements.push(
          <div key={idx} className="flex items-start gap-2 my-0.5 text-xs text-slate-300 pr-2">
            <span className="text-amber-400 font-bold">•</span>
            <span>{line.trim().substring(2)}</span>
          </div>
        );
        return;
      }

      // Empty lines
      if (!line.trim()) {
        elements.push(<div key={idx} className="h-2" />);
        return;
      }

      // Regular Paragraph
      elements.push(
        <p key={idx} className="text-xs text-slate-200 leading-relaxed dir-rtl text-right my-0.5">
          {line}
        </p>
      );
    });

    return elements;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-400">
            <Eye className="w-5 h-5" />
            <h3 className="text-sm font-bold text-white">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content View */}
        <div className="p-5 space-y-2 overflow-y-auto flex-1 text-slate-100 bg-slate-950/50">
          {renderMarkdownLines()}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>حالت پیش‌نمایش زنده مارک‌داون</span>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-1.5 rounded-lg transition"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
