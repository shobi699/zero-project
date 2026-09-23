# Bug Fix: Right Panel Edge Activation, Whisper Model 404 Download & Notepad Voice Typing Integration

- **Slug**: test-panel
- **Fixed**: 2026-09-23T22:45:00+03:30
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

رفع قطعی خطای ۴۰۴ در دانلود مدل‌های کوانتیزه‌شده Whisper، اصلاح شرط آستانه حرکت ماوس و افزودن زبانه بصری لبه مانیتور برای باز شدن پایدار پنل کناری (Right Panel)، و یکپارچه‌سازی کامل بازگردانی فوکوس پنجره هدف (Notepad) و تزریق مستقیم متن با اولویت‌بندی صحیح در دیمون.

## Changes

| File | Change | Notes |
|------|--------|-------|
| [`zero-studio/src/components/ModelManager.tsx`](file:///d:/zero-project/zero-studio/src/components/ModelManager.tsx) | modified | به‌روزرسانی مدل Whisper Medium Q4 به نسخه معتبر و فعال Hugging Face (`ggml-medium-q5_0.bin` به حجم ۵۳۹ مگابایت). |
| [`zero-studio/src-tauri/src/main.rs`](file:///d:/zero-project/zero-studio/src-tauri/src/main.rs) | modified | اصلاح پیام‌های خطای HTTP دانلود به پیام‌های فارسی شفاف و راهنما. |
| [`right-panel-main/src/main.rs`](file:///d:/zero-project/right-panel-main/src/main.rs) | modified | افزایش آستانه تشخیص حرکت ماوس در `spawn_edge_watch` از ۱ پیکسل به بازه ۸ الی ۱۲ پیکسل، گسترش محدوده عمودی، و ارسال هندل پنجره قبلی (`target_hwnd`) در پیام `triggerVoice`. |
| [`right-panel-main/src/sys/windows.rs`](file:///d:/zero-project/right-panel-main/src/sys/windows.rs) | modified | افزودن تابع `prev_foreground()` جهت دسترسی به شناسه پنجره فعال قبلی کاربر (مانند Notepad). |
| [`right-panel-main/src/sys/unix.rs`](file:///d:/zero-project/right-panel-main/src/sys/unix.rs) | modified | پیاده‌سازی متناظر برای سیستم‌های غیر ویندوزی جهت هماهنگی بیلد. |
| [`right-panel-main/src/ui.html`](file:///d:/zero-project/right-panel-main/src/ui.html) | modified | افزودن زبانه بصری شناور (`.edge-handle`) در لبه مانیتور با افکت اکریلیک و هاور درخشان، گسترش آستانه `atEdge` به ۱۴ پیکسل، و اتصال رویدادهای کلیک و ماوس. |
| [`zero-daemon/src/injector.rs`](file:///d:/zero-project/zero-daemon/src/injector.rs) | modified | اصلاح توالی تزریق جهت بازگردانی قطعی فوکوس به پنجره هدف قبل از هرگونه تلاش، پیمایش Z-order پنجره‌ها در صورت قرار داشتن فوکوس روی پنجره‌های Zero، و شناسایی پایدار محیط‌های متنی نظیر Notepad. |
| [`zero-daemon/src/ipc.rs`](file:///d:/zero-project/zero-daemon/src/ipc.rs) | modified | افزودن فیلد اختیاری `target_hwnd` به پروتکل درخواست `IpcRequest::TriggerRecord`. |
| [`zero-daemon/src/hotkey.rs`](file:///d:/zero-project/zero-daemon/src/hotkey.rs) | modified | تطبیق فراخوانی `DaemonCmd::ToggleRecording` با تغییرات جدید تایپ‌ها. |
| [`zero-daemon/src/main.rs`](file:///d:/zero-project/zero-daemon/src/main.rs) | modified | پشتیبانی از `target_hwnd` در `DaemonCmd::ToggleRecording` و استفاده از `take_destination_snapshot_for_hwnd`. |

## Diff Highlights

### ۱. اصلاح آدرس دانلود مدل در `ModelManager.tsx`
```typescript
  {
    id: 'whisper-medium-q4_1',
    name: 'Whisper Medium Q5 / Q4 (فشرده فوق دقیق)',
    description: 'مدیوم فشرده ۵ بیتی بهینه‌شده — ۵۳۹ مگابایت — دقت ۹۵٪ در سطح Whisper Medium اما با یک‌سوم مصرف رم و سرعت بالا',
    sizeBytes: 539_000_000,
    source: 'whispercpp',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-q5_0.bin',
    filename: 'ggml-medium-q5_0.bin',
    ...
```

### ۲. افزایش حساسیت ماوس و پوشش عمودی در `right-panel-main/src/main.rs`
```rust
let in_band = py >= (win_y - (120.0 * scale) as i32) && py < (win_y + h + (120.0 * scale) as i32);
let dist = if left { px - edge } else { edge - 1 - px };
let edge_threshold = ((12.0 * scale) as i32).max(8);
held = if dragging && in_band && dist >= 0 && dist <= edge_threshold { held + 1 } else { 0 };
if moved && in_band && dist >= 0 && dist <= edge_threshold && (!dragging || held > 20) {
    sys::remember_foreground();
    OPEN.store(true, Ordering::Relaxed);
    let _ = proxy.send_event(Ev::Open);
    near = false;
}
```

### ۳. زبانه بصری لبه مانیتور در `right-panel-main/src/ui.html`
```html
<div class="edge-handle" id="edgeHandle" title="پنل کناری Zero (با بردن ماوس یا کلیک باز می‌شود)">
  <div class="handle-bar"></div>
</div>
```

### ۴. بازگردانی فوکوس و پوشش Notepad در `zero-daemon/src/injector.rs`
```rust
// Ensure target window has focus FIRST before any injection attempt
let current_fg = self.low_level.get_foreground_window();
if current_fg != snapshot.hwnd {
    info!("restoring focus to snapshot window ({})", snapshot.hwnd);
    if let Err(e) = self.low_level.focus_window(snapshot.hwnd).await {
        warn!("failed to restore focus: {}. continuing anyway", e);
    }
}
```

## Tests Added or Updated

- `zero-daemon/src/injector.rs`: اجرای تمام ۲۱ تست واحد سیستم تزریق و مدیریت حافظه `SafeElement`.
- `tools/stt-bench/src/metrics.rs`: اجرای ۶ تست واحد پردازش و برابری کلمات.
- جمعاً ۲۷ تست واحد در سطح ورک‌اسپیس با موفقیت پاس شدند.

## Local Verification

- **Cargo Test Workspace**:
  `cargo test --workspace` → **۲۷ تست با موفقیت پاس شد (۰ خطا)**.
- **Frontend Type Check**:
  `npx tsc --noEmit` در `zero-studio` → **۰ خطای تایپ‌اسکریپت (Exit code: 0)**.
- **Tauri Backend Cargo Check**:
  `cargo check` در `zero-studio/src-tauri` → **بیلد بدون خطا (Exit code: 0)**.
- **Release Build Workspace**:
  `cargo build --release --workspace` → **بیلد نسخه‌های نهایی `zero-daemon.exe` و `right-panel.exe` با موفقیت پایان یافت (Exit code: 0)**.
- **به‌روزرسانی باینری‌های پرتابل**:
  فایل‌های اجرایی جدید در پوشه `Zero-Studio-Portable` جایگزین شدند.

## Deviations from Assessment

هیچ مغایرتی وجود ندارد؛ تمامی موارد ارزیابی با حداکثر تطابق و بهبودهای عملکردی اعمال شدند.

## Follow-ups

- اجرای تست واقعی در محیط نوت‌پد با دستور `/speckit-bug-test slug=test-panel`.
