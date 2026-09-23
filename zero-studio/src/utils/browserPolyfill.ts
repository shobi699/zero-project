/**
 * Browser polyfill for Zero Studio when running in a standalone web browser (outside Tauri webview).
 * In Tauri webview, window.__TAURI_INTERNALS__ is provided natively and this polyfill does nothing.
 */
if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
  const store: Record<string, any> = {
    config: JSON.stringify({
      stt_mode: 'local',
      active_model: 'ggml-small.bin',
      engine_mode: 'hybrid',
      hotkey: 'Ctrl+Shift+Z',
      hotkey_mode: 'toggle',
      enable_right_panel: true,
      interactive_mode: false,
      auto_submit: true,
      auto_submit_key: 'enter',
      append_trailing_space: true,
      audio_feedback: true,
      vad_silence_timeout: 2.0,
      models_dir: 'D:\\New folder (6)',
      llm_provider: 'openai',
      llm_endpoint: 'https://api.openai.com/v1',
      llm_model: 'gpt-4o-mini',
      translate_mode: 'off',
      polish_mode: 'off',
      overlay_mode: 'cursor',
    }),
    notes: [
      {
        id: '1',
        title: 'یادداشت نمونه صوتی',
        body: 'این یک یادداشت نمونه است که نشان می‌دهد سیستم صوتی و ویرایشگر دفتر یادداشت زیرو فعال است.',
        tags: ['شخصی', 'تایپ صوتی'],
        pinned: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  };

  (window as any).__TAURI_INTERNALS__ = {
    plugins: {},
    transformCallback: () => 1,
    unregisterListener: () => {},
    invoke: async (cmd: string, args: any = {}) => {
      switch (cmd) {
        case 'get_config':
          return { config: store.config };
        case 'set_config':
          store.config = args.config;
          return { ok: true };
        case 'update_settings':
          return { ok: true };
        case 'get_daemon_status':
          return { state: 'idle', engine_loaded: true, process_name: 'zero-daemon' };
        case 'is_right_panel_running':
          return true;
        case 'set_right_panel_enabled':
          return true;
        case 'start_right_panel':
        case 'stop_right_panel':
          return true;
        case 'check_faster_whisper':
          return {
            python_available: true,
            faster_whisper_installed: true,
            server_running: false,
            stt_mode: 'local',
          };
        case 'start_faster_whisper':
          return 'سرور Faster-Whisper با موفقیت روی پورت 8787 راه‌اندازی شد';
        case 'stop_faster_whisper':
          return 'سرور متوقف شد';
        case 'set_stt_mode':
          return { ok: true };
        case 'get_model_status':
          return {
            models: JSON.stringify([
              {
                id: 'ggml-small',
                filename: 'ggml-small.bin',
                size_bytes: 487601967,
                is_active: true,
              },
              {
                id: 'ggml-base',
                filename: 'ggml-base.bin',
                size_bytes: 147951465,
                is_active: false,
              },
            ]),
          };
        case 'set_active_model':
          return { ok: true };
        case 'test_model':
          return { exists: true, is_valid: true };
        case 'test_model_inference':
          return { ok: true, duration_ms: 1200, output: 'استنتاج مدل با موفقیت انجام شد.' };
        case 'get_notes':
          return { items: JSON.stringify(store.notes) };
        case 'create_note': {
          const newNote = {
            id: Date.now().toString(),
            title: args.title || '',
            body: args.body || '',
            tags: JSON.parse(args.tags || '[]'),
            pinned: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          store.notes.unshift(newNote);
          return { note: JSON.stringify(newNote) };
        }
        case 'update_note': {
          const note = store.notes.find((n: any) => n.id === args.id);
          if (note) {
            note.title = args.title;
            note.body = args.body;
            note.tags = JSON.parse(args.tags || '[]');
            note.updated_at = new Date().toISOString();
          }
          return { ok: true };
        }
        case 'record_for_notepad':
          await new Promise((r) => setTimeout(r, 1000));
          return 'این متن به صورت خودکار از طریق موتور صوتی به یادداشت اضافه شد.';
        case 'trigger_record':
          return { ok: true };
        case 'get_history':
          return { items: '[]' };
        case 'get_blacklist':
          return { items: '[]' };
        case 'get_dictionary':
          return { items: '[]' };
        case 'get_snippets':
          return { items: '[]' };
        case 'get_usage_stats':
          return { total_words: 1450, total_duration_secs: 320, today_transcriptions: 14 };
        case 'plugin:autostart|is_enabled':
          return false;
        case 'plugin:autostart|enable':
        case 'plugin:autostart|disable':
          return true;
        default:
          return { ok: true };
      }
    },
  };
}

export {};
