import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import FloatingVoiceWidget from './FloatingVoiceWidget';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

export default function WidgetOverlay() {
  const [isOpen, setIsOpen] = useState(true);
  const [browserSttActive, setBrowserSttActive] = useState(true);

  useEffect(() => {
    const unlistenStart = listen('start-browser-stt', () => {
      setIsOpen(true);
      setBrowserSttActive(true);
      getCurrentWindow().show().catch(console.error);
    });

    const unlistenStop = listen('stop-browser-stt', () => {
      setBrowserSttActive(false);
    });

    const unlistenToggle = listen('toggle-widget', () => {
      setIsOpen(prev => {
        const next = !prev;
        if (next) {
          getCurrentWindow().show().catch(console.error);
        } else {
          getCurrentWindow().hide().catch(console.error);
        }
        return next;
      });
    });

    return () => {
      unlistenStart.then(f => f());
      unlistenStop.then(f => f());
      unlistenToggle.then(f => f());
    };
  }, []);

  const handleClose = async () => {
    setIsOpen(false);
    setBrowserSttActive(false);
    try {
      await getCurrentWindow().hide();
    } catch (e) {
      console.error('Failed to hide window', e);
    }
  };

  // The widget component expects isOpen prop
  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <FloatingVoiceWidget
        isOpen={isOpen}
        onClose={handleClose}
        browserSttActive={browserSttActive}
        isWindow={true}
      />
    </div>
  );
}
