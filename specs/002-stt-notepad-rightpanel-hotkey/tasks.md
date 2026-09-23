# Tasks: STT Notepad Integration, Right Panel Lifecycle & Golden Model

برنامه اجرایی، وظایف و وضعیت تکمیل قابلیت‌های ویژگی `002-stt-notepad-rightpanel-hotkey`.

---

## Phase 1: Setup & Foundational Infrastructure

- [X] T001 [P] افزودن کلید پیکربندی `enable_right_panel: bool` به ساختار `DaemonConfig` در [zero-daemon/src/config.rs](file:///d:/zero-project/zero-daemon/src/config.rs) و مقدار پیش‌فرض `true`.
- [X] T002 [P] پیاده‌سازی و ثبت توابع کنترل پروسه `is_right_panel_running`، `set_right_panel_enabled`، `start_right_panel` و `stop_right_panel` در [zero-studio/src-tauri/src/main.rs](file:///d:/zero-project/zero-studio/src-tauri/src/main.rs).
- [X] T003 [P] پیاده‌سازی لایه پلی‌فیل مرورگر [zero-studio/src/utils/browserPolyfill.ts](file:///d:/zero-project/zero-studio/src/utils/browserPolyfill.ts) جهت تست مستقل و بدون خطای استودیو در مرورگرها.

---

## Phase 2: User Story 1 (P1) - تایپ صوتی مستقیم در دفتر یادداشت (Notepad STT Integration)

* **هدف:** حذف وب‌اسپیچ و اتصال پایدار دکمه میکروفون در یادداشت‌ها به دیمون صوتی آفلاین.
- [X] T004 [US1] بازنویسی توابع `startListening` و `stopListening` در [zero-studio/src/components/Notepad.tsx](file:///d:/zero-project/zero-studio/src/components/Notepad.tsx) برای فراخوانی مستقیم `record_for_notepad`.
- [X] T005 [US1] طراحی بازخورد انیمیشنی امواج صوتی (Waveform) و پیام‌های وضعیت فارسی («در حال گوش دادن...»، «در حال پردازش...») در [zero-studio/src/components/Notepad.tsx](file:///d:/zero-project/zero-studio/src/components/Notepad.tsx).
- [X] T006 [US1] هندل کردن پاسخ متن رونویسی‌شده و الحاق خودکار به متن یادداشت در [zero-studio/src/components/Notepad.tsx](file:///d:/zero-project/zero-studio/src/components/Notepad.tsx).
- [X] T007 [US1] هندل کردن دستور IPC `record_for_notepad` در دیمون هسته و ارتباط با موتور محلی Whisper.

---

## Phase 3: User Story 2 (P2) - کنترل و چرخه حیات پنل کناری در تنظیمات (Right Panel Lifecycle)

* **هدف:** مدیریت اجرای خودکار، استارت/استاپ دستی و نمایش وضعیت پنل کناری در استودیو.
- [X] T008 [US2] طراحی کارت رابط کاربری «پنل کناری مایع» با بج وضعیت زنده، سوئیچ فعال‌سازی خودکار و دکمه راه‌اندازی مجدد در [zero-studio/src/components/Settings.tsx](file:///d:/zero-project/zero-studio/src/components/Settings.tsx).
- [X] T009 [US2] مدیریت پروسه `right-panel.exe` با پرچم `CREATE_NO_WINDOW` در [zero-studio/src-tauri/src/main.rs](file:///d:/zero-project/zero-studio/src-tauri/src/main.rs).
- [X] T010 [US2] بستن و خاتمه فوری پروسه `right-panel.exe` هنگام خاموش کردن سوئیچ در تنظیمات.

---

## Phase 4: User Story 3 (P3) - پایپ‌لاین کلید میانبر و مدل طلایی Whisper Small

* **هدف:** عملکرد بدون وقفه کلید میانبر سراسری و استنتاج سریع مدل Whisper Small.
- [X] T011 [US3] تنظیم پیش‌فرض تضمینی `stt_mode: "local"` در دیمون جهت جلوگیری از افتادن در تله حالت مرورگر.
- [X] T012 [US3] ارتقای تقدم جستجوی پوشه مدل‌های کاربر (`models_dir`) در [zero-daemon/src/local_engine.rs](file:///d:/zero-project/zero-daemon/src/local_engine.rs) برای مدل `ggml-small.bin`.
- [X] T013 [US3] بهینه‌سازی استراتژی تزریق متن در [zero-daemon/src/injector.rs](file:///d:/zero-project/zero-daemon/src/injector.rs) با ۶ تست واحد پاس‌شده.

---

## Phase 5: Python Server Optimization & Browser Audit

* **هدف:** استارت آنی سرور پایتون Faster-Whisper و تست جامع استودیو در مرورگر.
- [X] T014 انتقال لود مدل در [tools/faster-whisper-server/server.py](file:///d:/zero-project/tools/faster-whisper-server/server.py) به ترد پس‌زمینه برای استارت فوری زیر ۱ ثانیه.
- [X] T015 ارتقای تابع `start_fw_server` در [zero-studio/src-tauri/src/main.rs](file:///d:/zero-project/zero-studio/src-tauri/src/main.rs) به پولینگ هوشمند ۱۵ ثانیه‌ای و شناسایی مسیرهای متعدد فایل.
- [X] T016 بازرسی کامل استودیو در مرورگر استاندارد و ضبط ویدیوی تعامل با Notepad، پنل کناری و مدل‌ها.

---

## Phase 6: Verification & Git Sync

- [X] T017 اجرای تست‌های کامل ورک‌اسپیس با `cargo test --workspace` (۲۷ تست پاس شده، ۰ خطا).
- [X] T018 بیلد کلاینت با `npm run build` در `zero-studio` (تایید نهایی بدون هشدار تایپ‌اسکریپت).
- [X] T019 همگام‌سازی و پوش تمام تغییرات روی شاخه `master` گیت‌هاب پروژه.
