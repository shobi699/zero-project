# مشخصات فنی و سند ویژگی: رفع عیوب تایپ صوتی، یکپارچه‌سازی مدل طلایی، دکمه صوتی دفتر یادداشت و مدیریت پنل کناری

## Problem Statement

کاربران در تعامل روزمره با نسخه دسکتاپ نرم‌افزار `Zero` با چهار چالش و مانع جدی مواجه هستند:

۱. **عدم کارکرد دکمه تایپ صوتی در دفتر یادداشت (Notepad Voice Button):** هنگام کلیک روی آیکون میکروفون در بخش دفتر یادداشت استودیو (`Notepad`)، یا خطای عدم پشتیبانی مرورگر نمایش داده می‌شود یا فرآیند ضبط متوقف نشده و هیچ متنی به ویرایشگر یادداشت تزریق نمی‌گردد؛ زیرا استودیو به‌جای بهره‌گیری پایدار از دیمون پس‌زمینه و موتور آفلاین، به API وب‌ویو مرورگر (`SpeechRecognition`) وابسته بوده که در محیط ویندوز WebView2 فعال نیست.
۲. **نبود کنترل یکپارچه و خودکار بر پنل کناری (Right Panel Setting & Auto-launch):** هیچ کلید تنظیماتی در بخش تنظیمات استودیو برای فعال‌سازی یا غیرفعال‌سازی پنل لبه صفحه (`Right Panel`) وجود ندارد. کاربر مایل است بتواند مشخص کند که آیا پنل کناری مایع در هنگام نصب یا اجرای نرم‌افزار به‌صورت خودکار اجرا شود یا خیر، و بتواند در لحظه آن را روشن یا خاموش کند.
۳. **تایپ صوتی با کلید میانبر (Hotkey Voice Typing):** هنگام فشردن کلید میانبر سراسری (`Ctrl+Shift+Z`)، صدای کاربر ضبط نمی‌شود یا متن تبدیل‌شده در محل مکان‌نما درج نمی‌گردد. این مشکل ناشی از تنظیم پیش‌فرض یا باقی‌ماندن `stt_mode` بر روی حالت مرورگر (`browser`) در فایل پیکربندی است که باعث می‌شود دیمون به جای ضبط مستقیم سخت‌افزاری با WASAPI و پردازش مدل Whisper، منتظر هندلرهای مرورگر بماند.
۴. **عدم اعمال خودکار و یکپارچگی مدل انتخابی (Whisper Small - انتخاب طلایی فارسی):** کاربر مدل پیشنهادی و قدرتمند ۴۶۶ مگابایتی «Whisper Small» را دانلود و فعال نموده، اما به دلیل ناهمگامی میان انتخاب مدل در رابط کاربری، مسیر پوشه سفارشی مدل‌ها و فیلد `stt_mode` در دیمون، سامانه وارد چرخه استنتاج با مدل طلایی نمی‌شود.

---

## Solution

یک راه‌حل مهندسی جامع و ۴ گانه که پایداری، عملکرد آفلاین و تجربه کاربری نرم‌افزار Zero را تضمین می‌نماید:

۱. **بازطراحی ماژول ضبط صوتی در دفتر یادداشت (Notepad STT Engine Integration):**
   - حذف کامل وابستگی شکننده به `webkitSpeechRecognition` در وب‌ویو ویندوز برای حالت‌های محلی و پیش‌فرض.
   - بهره‌گیری مستقیم از پروتکل IPC و دستور `record_for_notepad` در دیمون هسته، به طوری که با کلیک اول دیمون ضبط صوتی مستقیم از طریق کارت صدا (WASAPI) را آغاز کرده و با کلیک مجدد (یا پایان گفتار توسط VAD)، صوت بلافاصله از طریق مدل محلی فعال (`ggml-small.bin`) استنتاج شده و متن استخراج‌شده مستقیماً به محتوای یادداشت اضافه شود.
۲. **سیستم مدیریت چرخه حیات پنل کناری در تنظیمات (Right Panel Lifecycle & Settings):**
   - افزودن کلید پیکربندی `enable_right_panel: boolean` به ساختار `DaemonConfig` (با مقدار پیش‌فرض `true`).
   - اضافه کردن سوئیچ شکیل، خوانا و مدرن در زبانه «تنظیمات» استودیو جهت فعال/غیرفعال کردن داک پنل لبه.
   - پیاده‌سازی مکانیزم مدیریت پروسه در سمت Tauri/Rust (`ensure_right_panel_started` و `ensure_right_panel_stopped`)؛ هنگام اجرای نرم‌افزار، در صورت فعال بودن این گزینه، فایل `right-panel.exe` به صورت پس‌زمینه راه‌اندازی می‌شود و با خاموش کردن آن، پروسه بلافاصله خاتمه می‌یابد.
۳. **اصلاح پایپ‌لاین کلید میانبر سراسری و قطع اتکای اشتباه به حالت مرورگر:**
   - تغییر پیش‌فرض قطعی `stt_mode` به `"local"`؛ به نحوی که فشردن شورت‌کی در هر محیطی از ویندوز، پایپ‌لاین پایدار WASAPI -> WAV -> Whisper-CLI -> Text Injection را اجرا کند.
   - اطمینان از اینکه در صورت فعال‌سازی هر مدل محلی (مانند Whisper Small)، وضعیت `stt_mode` بلافاصله و به صورت تضمینی به `"local"` تغییر یافته و در فایل `config.json` ذخیره شود.
۴. **اعتبارسنجی و تست زنده مدل Whisper Small (انتخاب طلایی فارسی):**
   - تست واقعی موتور `whisper-cli.exe` با فایل وزن‌های `ggml-small.bin` دانلودشده در مسیر سفارشی سیستم (`D:\New folder (6)\ggml-small.bin`).
   - تصحیح منطق جستجوی مدل در `resolve_model_path()` تا مسیر پوشه سفارشی تعیین‌شده توسط کاربر (`models_dir`) در اولویت کامل باشد و مدل طلایی به درستی در کش حافظه بارگذاری شود.

---

## User Stories

1. As a user, I want clicking the microphone button in Notepad to reliably record my voice via the system microphone, so that I can dictate my notes without browser API errors.
2. As a user, I want clicking the microphone button a second time in Notepad to immediately stop recording and append the transcribed text to my active note, so that note dictation feels fluid and responsive.
3. As a user, I want the Notepad voice typing to leverage the active local Persian model (`Whisper Small`), so that I get high-accuracy Persian transcription without needing an internet connection.
4. As a user, I want a toggle switch in the Settings page to enable or disable the Right Panel dock, so that I have full control over whether the edge dock appears on my screen.
5. As a user, I want the Right Panel to automatically start when Zero Studio or the installer runs if enabled in settings, so that I don't have to manually hunt for `right-panel.exe` to launch it.
6. As a user, I want turning off the Right Panel toggle in Settings to immediately terminate the running `right-panel.exe` process, so that it leaves my screen instantly without remaining as a background zombie process.
7. As a user, I want turning on the Right Panel toggle in Settings to immediately spawn `right-panel.exe`, so that I don't have to restart the entire application to see the change take effect.
8. As a user, I want pressing the global hotkey (`Ctrl+Shift+Z`) anywhere in Windows to trigger real microphone capture and inject transcribed text at the cursor, so that quick dictation works across all third-party software (Notepad, Word, Telegram, browsers).
9. As a user, I want selecting and activating the "Whisper Small (انتخاب طلایی فارسی)" model in the Model Manager to automatically configure the STT mode to "local", so that the system immediately begins using this model without getting stuck in web speech mode.
10. As a user, I want the daemon to correctly locate models downloaded to custom directories (such as `D:\New folder (6)`), so that my disk space preference is respected and models are recognized.
11. As a user, I want informative visual feedback (listening, processing, error, success) both in the overlay and in the Notepad UI during voice input, so that I always know the current state of speech recognition.
12. As a user, I want Persian punctuation and normalizations (half-space, character unification) automatically applied to note dictation, so that the transcribed notes conform to standard Persian orthography.
13. As an administrator/user, I want all configuration changes made in Settings to persist in `config.json` and sync in real time across Studio, Daemon, and Right Panel via IPC, so that settings remain consistent everywhere.
14. As a user, I want offline voice input to work even if no network connection exists, ensuring privacy and zero dependency on cloud servers.

---

## Implementation Decisions

### ۱. معماری و تفکیک مسئولیت‌ها (Module Boundaries & Architecture)
- **Zero Studio (Frontend / React + TypeScript):**
  - بازنویسی توابع `startListening` و `stopListening` در کامپوننت `Notepad.tsx`؛ حذف اتکا به مرورگر و فراخوانی سیستماتیک `invoke('record_for_notepad')` و ارسال دستور لغو یا توقف کنترل‌شده.
  - افزودن کامپوننت کارت تنظیمات پنل کناری (`RightPanelSettingsCard`) در `Settings.tsx` با کنترل دوطرفه سوئیچ، نمایش وضعیت اجرای پروسه و دکمه بازنشانی.
- **Zero Studio (Backend / Tauri v2 Rust - `src-tauri/src/main.rs`):**
  - پیاده‌سازی و ثبت دستورات `record_for_notepad`، `get_right_panel_status`، و `set_right_panel_enabled`.
  - افزودن تابع ناظر پروسه `ensure_right_panel_started` و `ensure_right_panel_stopped` با قابلیت ردیابی مسیرهای باینری در کنار برنامه، پوشه `bin/` و مسیر پرتابل.
  - اصلاح متد `set_active_model` تا به صورت همزمان `stt_mode = "local"` را در دیمون تنظیم کند.
- **Zero Daemon (`zero-daemon/src/`):**
  - به‌روزرسانی ساختار `DaemonConfig` در `config.rs` با افزودن فیلد `enable_right_panel: bool` (پیش‌فرض: `true`).
  - ارتقای فرآیند مدیریت `RecordForNotepad` در `main.rs` و `ipc.rs` برای پاسخ‌دهی غیرمسدودکننده و بازگرداندن بدون تاخیر نتیجه رونویسی به استودیو.
  - اطمینان از تقدم مطلق `resolve_models_dir()` در لودر محلی `local_engine.rs` به منظور خواندن بی‌نقص مدل `ggml-small.bin` از مسیرهای سفارشی دیسک کاربر.

### ۲. رابط‌های IPC و قرارداد داده‌ها (Data Contracts & Schemas)
- **پیکربندی دیمون (`config.json`):**
```json
{
  "enable_right_panel": true,
  "stt_mode": "local",
  "active_model": "ggml-small.bin",
  "models_dir": "D:\\New folder (6)"
}
```
- **دستورات جدید Tauri:**
```rust
#[tauri::command]
async fn is_right_panel_running() -> Result<bool, String>;

#[tauri::command]
async fn set_right_panel_enabled(enabled: bool) -> Result<bool, String>;
```

---

## Testing Decisions

- **تست جعبه‌سیاه رفتاری (External Behavior Testing):**
  - تست اجرای `whisper-cli.exe` با وزن‌های محلی `ggml-small.bin` روی فایل‌های ورودی صوتی واقعی ۱۶ کیلوهرتز مونو و اندازه‌گیری زمان پاسخگویی (زیر ۲ ثانیه).
  - تست سناریوی کلیک دکمه میکروفون دفتر یادداشت در استودیو و اطمینان از تزریق مستقیم متن بدون خطای وب‌ویو.
  - تست سوئیچ تنظیمات پنل کناری: بررسی اجرای پروسه `right-panel.exe` در ویندوز Task Manager پس از روشن کردن، و بسته شدن کامل پروسه پس از خاموش کردن.
  - تست فشردن کلید میانبر سراسری و مشاهده ثبت رویداد در لاگ دیمون و اجرای موفق استنتاج آفلاین.
- **تست‌های واحد و یکپارچگی ریشه (Workspace Cargo Tests):**
  - اجرای موفق تمامی تست‌های خودکار موجود در دیمون و ورک‌اسپیس با دستور `cargo test --workspace`.
  - اعتبارسنجی بیلد فرانت‌اند استودیو با `npm run build`.

---

## Out of Scope

- ایجاد مدل‌های کوانتیزه‌شده اختصاصی جدید خارج از فرمت استاندارد GGML / GGUF.
- بازنویسی معماری گرافیکی پنل کناری بر پایه‌ای غیر از Tao/Wry.
- تغییر در پروتکل پایه لوله نام‌گذاری‌شده ویندوز (`\\.\pipe\zero-ipc`).

---

## Further Notes

- این مشخصات فنی دقیقاً بر مبنای یافته‌های عینی وضعیت زنده سیستم و لاگ‌های تست واقعی موتور Whisper Small تدوین شده است و مبنای پیاده‌سازی سریع و بدون نقص کدها در گام بعدی خواهد بود.
