import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import InteractivePreviewModal from './InteractivePreviewModal';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function PreviewOverlay() {
  const [previewData, setPreviewData] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    // Listen for events sent to this window
    const unlistenPreview = listen('interactive-preview', (event: any) => {
      const { text, x, y } = event.payload || {};
      if (text) {
        setPreviewData({ text, x: x || 100, y: y || 100 });
      }
    });

    return () => {
      unlistenPreview.then(f => f());
    };
  }, []);

  useEffect(() => {
    if (!previewData) {
      getCurrentWindow().hide().catch(() => {});
    }
  }, [previewData]);

  if (!previewData) {
    return null;
  }

  const handleClose = async () => {
    setPreviewData(null);
    try {
      await getCurrentWindow().hide();
    } catch (e) {
      console.error('Failed to hide window', e);
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <InteractivePreviewModal
        text={previewData.text}
        x={previewData.x}
        y={previewData.y}
        onClose={handleClose}
        isWindow={true}
      />
    </div>
  );
}
