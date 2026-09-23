# Implementation Plan: STT Notepad Integration, Right Panel Lifecycle & Golden Model

برنامه مهندسی و اجرایی پیاده‌سازی و یکپارچه‌سازی ویژگی `002-stt-notepad-rightpanel-hotkey`.

---

## ۱. بستر فنی و چارچوب مهندسی (Technical Context)

* **ماژول‌های تحت تاثیر:**
  * [`zero-studio/`](file:///d:/zero-project/zero-studio) (بخش فرانت‌اند React و وب‌ویو Tauri v2)
  * [`zero-daemon/`](file:///d:/zero-project/zero-daemon) (دیمون سیستم‌عامل، ارتباط صوتی WASAPI و موتور Whisper)
  * [`right-panel-main/`](file:///d:/zero-project/right-panel-main) (پنل لبه صفحه و ارتباط با دیمون)
* **زبان‌ها و فریم‌ورک‌ها:**
  * Rust (ورژن 1.75+)، Tauri v2
  * React 19، TypeScript، Tailwind CSS
  * SQLite محلی با پشتیبانی از فارسی (FTS5)
  * کتابخانه‌های سیستمی: `windows-sys`، `reqwest`، `tokio`

---

## ۲. گیت‌های معماری (Architectural Gates)

- [x] **عدم اتکا به Web Speech API:** فرآیند ضبط و رونویسی مستقل از قابلیت‌های مرورگر و کاملاً آفلاین انجام می‌شود.
- [x] **مدیریت تمیز پروسه و جلوگیری از پنجره‌های اضافی:** راه‌اندازی `right-panel.exe` با فلگ `CREATE_NO_WINDOW` بدون نمایش خط فرمان CMD.
- [x] **تک‌منبعی بودن تنظیمات:** کانفیگ `enable_right_panel` و `active_model` به صورت همگام در فایل `config.json` و رم ذخیره می‌شوند.
- [x] **پشتیبانی کامل از زبان فارسی و نیم‌فاصله:** حفظ ساختار RTL و کاراکتر نیم‌فاصله (Zero-Width Non-Joiner).

---

## ۳. مراحل اجرایی (Phases of Implementation)

### فاز ۱: بازطراحی ماژول تایپ صوتی در دفتر یادداشت
- ارتقای [zero-studio/src/components/Notepad.tsx](file:///d:/zero-project/zero-studio/src/components/Notepad.tsx) جهت فراخوانی مستقیم `record_for_notepad`.
- نمایش بازخورد بصری، امواج ضبط و پیام‌های وضعیت خطا یا پردازش به زبان فارسی.
- پیاده‌سازی هندلر `record_for_notepad` در دیمون هسته.

### فاز ۲: سیستم مدیریت پروسه و تنظیمات پنل کناری
- افزودن `enable_right_panel: bool` به ساختار `DaemonConfig` در [zero-daemon/src/config.rs](file:///d:/zero-project/zero-daemon/src/config.rs).
- ایجاد کارت تنظیمات پنل در زبانه «تم و ظاهر» در [zero-studio/src/components/Settings.tsx](file:///d:/zero-project/zero-studio/src/components/Settings.tsx).
- پیاده‌سازی متدهای کنترل پروسه `start_right_panel`، `stop_right_panel`، `is_right_panel_running` و `set_right_panel_enabled` در [zero-studio/src-tauri/src/main.rs](file:///d:/zero-project/zero-studio/src-tauri/src/main.rs).

### فاز ۳: پایپ‌لاین کلید میانبر و مدل طلایی Whisper Small
- تثبیت `stt_mode: "local"` و پیش‌فرض کردن مدل `ggml-small.bin`.
- اطمینان از تقدم مسیر پوشه مدل‌ها (`models_dir`) در [zero-daemon/src/local_engine.rs](file:///d:/zero-project/zero-daemon/src/local_engine.rs).
- تست تزریق متن در ویرایشگرهای گوناگون ویندوز.

### فاز ۴: سرور تکمیلی پایتون (Faster-Whisper) و پلی‌فیل تست مرورگر
- بهینه‌سازی لود پس‌زمینه در [tools/faster-whisper-server/server.py](file:///d:/zero-project/tools/faster-whisper-server/server.py).
- ایجاد [zero-studio/src/utils/browserPolyfill.ts](file:///d:/zero-project/zero-studio/src/utils/browserPolyfill.ts) جهت تست مستقل و بیلد در مرورگرهای خارجی.

---

## ۴. برنامه راستی‌آزمایی (Verification Plan)

* **تست‌های خودکار:** اجرای `cargo test --workspace` (۲۷ تست موفق).
* **تایپ‌چک و بیلد کلاینت:** اجرای `npm run build` در `zero-studio` (بیلد موفق بدون خطا).
* **تست محیطی:** بازرسی در مرورگر استاندارد و ضبط ویدیویی سناریوهای Notepad، پنل کناری و مدل‌ها.
