# PROGRESS.md

هر فاز پس از اتمام، یک ورودی اینجا اضافه می‌کند:
- فاز و تاریخ
- چه ساخته شد
- انحراف از سند مشخصات (اگر بود)
- مسائل باز

---

## فاز ۰ — Repo scaffold & Persian STT benchmark harness
- تاریخ: 2026-07-13
- **ساخته شد:**
  - ساختار مونوریپو: `zero-daemon/` (Cargo)، `zero-studio/` (Tauri v2)، `zero-server/` (NestJS)، `tools/stt-bench/`
  - فضای کاری Cargo با اعضا: zero-daemon + tools/stt-bench
  - CI: GitHub Actions — Rust build+clippy+test، NestJS build+test، Tauri build
  - هارنس بنچمارک STT با trait `SttProvider` و ۳ آداپتور (Whisper API، Google STT، Azure STT) + dummy برای تست
  - محاسبه WER/CER با ۶ تست واحد
  - گزارش مارک‌داون مقایسه‌ای با `cargo run -p stt-bench -- --report`
  - مشخصات corpus: `docs/CORPUS-SPEC.md` (۴ دسته: محاوره، رسمی، مخلوط، اسامی خاص)
  - CLAUDE.md به‌روز شده با دستورات build/test و معماری
- **انحراف از سند:** ندارد
- **مسائل باز:**
  - فایل‌های صوتی corpus باید دستی ضبط شوند (هارنس آماده است)
  - Rust روی D: نصب شد (فضای C: کم بود) — `RUSTUP_HOME=D:\rustup` و `CARGO_HOME=D:\cargo`

---

## فاز ۱ — Minimal daemon (ugly but real)
- تاریخ: 2026-07-13
- **ساخته شد:**
  - میانبر سراسری Ctrl+Shift+Z با RegisterHotKey و دیبانس ۱۵۰ms (`hotkey.rs`)
  - ضبط صدا با cpal (WASAPI) → ری‌سمپلینگ به 16kHz mono PCM (`audio.rs`)
  - بافرینگ رمزشده فایل موقت AES-256-GCM در `%LOCALAPPDATA%\Zero\tmp\` (`buffer.rs`, `crypto.rs`)
  - بازیابی فایل‌های یتیم هنگام راه‌اندازی مجدد
  - کلاینت WebSocket: ارسال باینری PCM + پیام‌های JSON start/stop (`ws_client.rs`, `protocol.rs`)
  - تحویل متن به clipboard با کتابخانه arboard (`clipboard.rs`)
  - آیکون tray با بالن اعلان و منوی راست‌کلیک Exit (`tray.rs`)
  - ارکستراتور: حلقه پیام Win32 در ترد اصلی، tokio runtime در ترد پس‌زمینه، ارتباط با mpsc + PostMessageW (`main.rs`)
  - dev-gateway: سرور Node.js WebSocket پراکسی به OpenAI Whisper API (`tools/dev-gateway/`)
  - چک‌لیست تست دستی اضافه شد به `docs/MANUAL-TESTS.md`
- **انحراف از سند:**
  - فعلاً clipboard-only (بدون SendInput/UIA) — طبق طرح فاز ۱
  - کلید رمز به‌صورت فایل ساده ذخیره می‌شود (DPAPI در فاز hardening)
  - cpal به‌جای WASAPI مستقیم استفاده شد (ADR-004)
- **مسائل باز:**
  - تست end-to-end نیاز به میکروفون واقعی و کلید OpenAI API دارد
  - استریم real-time چانک‌ها هنوز پیاده نشده (فعلاً batch ارسال می‌شود بعد از stop) — قابل بهبود در فاز بعد

---

## فاز ۲ — Server: auth, quota, gateway
- تاریخ: 2026-07-14
- **ساخته شد:**
  - فایل `docker-compose.yml` در ریشه پروژه برای راه‌اندازی آسان Postgres و Redis در توسعه محلی.
  - مدل دیتابیس با Prisma v5 شامل جداول: User، SttProvider، Setting، UsageLog، AuditLog.
  - ماژول و سرویس Prisma برای ارتباط با پایگاه‌داده به صورت نوع‌امن.
  - سیستم احراز هویت با ایمیل/OTP و توکن‌های JWT (اکسس و رفرش توکن) به همراه دکوراتورها و گاردهای JWT و Roles.
  - مدیریت سهمیه کاربران در Redis با کلیدهای تفکیک‌شده ماهانه (`quota:{userId}:{yyyymm}`) و ذخیره و کسر در دیتابیس + درگاه‌های Fallback در صورت عدم دسترسی به ردیس.
  - موتور درگاه STT با آداپتورهای Whisper API، Google STT، Azure STT و Dummy.
  - گیت‌وی WebSocket برای پذیرش اتصالات دیمون، بافر کردن چانک‌های صوتی PCM و ارسال پاسخ نهایی یا خطاها.
  - حلقه Failover خودکار در درگاه STT برای ارائه‌دهندگان دارای اولویت بالاتر و ذخیره‌سازی لاگ‌های استفاده.
  - سیستم مدیریت تنظیمات سراسری توسط مدیر با قابلیت Audit Log برای تمام ویرایش‌ها.
  - ۱۶ تست واحد و ادغام برای اعتبارسنجی فرآیند Auth، Quota و مکانیزم Failover.
- **انحراف از سند:** ندارد.
- **مسائل باز:** ندارد.

---

## بازبینی کد و رفع اشکال — 2026-07-19
- **رفع شد (دیمن):**
  - `local_engine.rs`: حذف ساخت فایل‌های مدل/اجرایی ساختگی و متن آفلاین جعلی — اکنون در نبود مدل، خطا برمی‌گردد و صوت به صف deferred می‌رود
  - `main.rs`: نوشتن چانک‌های صوتی به بافر رمزشده هم‌زمان با ضبط (تسک writer) — کرش وسط ضبط دیگر باعث از دست رفتن صوت نمی‌شود
  - `router.rs` + `audio.rs`: ساخت WAV واقعی از PCM برای موتور محلی و صف deferred (قبلاً فایل رمزشده .enc به‌جای WAV استفاده می‌شد)
  - `main.rs`: فایل .enc فقط پس از تحویل موفق حذف می‌شود؛ در خطای کامل برای بازیابی نگه داشته می‌شود
  - `hotkey.rs`: تشخیص رهاسازی مدیفایرها با کدهای چپ/راست (VK_LCONTROL و…) + دیبانس ۱۵۰ms
  - `ipc.rs` + `src-tauri/main.rs`: فریم‌بندی newline-delimited JSON، پاسخ Ack برای هر درخواست، حذف try_lock panic؛ TriggerRecord واقعاً ضبط را راه می‌اندازد
  - `injector.rs`: COM با MTA سازگار با فراخوانی بین‌تردی؛ هک اشاره‌گر تست (0x12345678) فقط زیر cfg(test)
  - `tray.rs`: hInstance صحیح با GetModuleHandleW + بررسی موفقیت CreateWindowExW
  - `Cargo.toml`: خروج src-tauri از workspace طبق CLAUDE.md
  - رفع تمام خطاهای clippy -D warnings
- **رفع شد (سرور):**
  - `auth.service.ts`: حذف بک‌دور admin@zero.ir (اکنون ADMIN_EMAILS از env)، محدودیت ۵ تلاش OTP با باطل‌شدن کد، عدم لاگ کد OTP در production، حذف secret پیش‌فرض JWT (خطا اگر env نباشد)
  - `schema.prisma`: فیلد `otpAttempts` به User اضافه شد (نیاز به `prisma migrate dev`)
  - تست‌های lockout به auth.service.spec.ts اضافه شد
- **مسائل باز:**
  - رشته‌های کاربرروی هنوز در فایل i18n واحد جمع نشده‌اند (قانون CLAUDE.md)
  - `GATEWAY_URL` هاردکد است (باید به config برود)
  - injector/overlay/local_engine/ipc/studio متعلق به فازهای ۳–۶ هستند که زودتر از برنامه ساخته شده‌اند — TASKS.md باید هم‌راستا شود

---

## فاز ۳ — Full text injector
- تاریخ: 2026-07-20
- **ساخته شد:**
  - `injector.rs` (۶۷۰ خط): انژکتور سه‌استراتژیه با کسکید فال‌بک
  - Snapshot مقصد: `take_destination_snapshot()` — تشخیص پنجره جلو، عنصر UIA فوکوس‌شده، قابلیت ویرایش، نام پروسه
  - استراتژی ۱: UI Automation — `IUIAutomationValuePattern::SetValue` با COM/MTA
  - استراتژی ۲: SendInput — `KEYEVENTF_UNICODE` با تأخیر 3ms/کاراکتر (~300 کاراکتر/ثانیه)
  - استراتژی ۳: Clipboard + Ctrl+V — ذخیره و بازیابی clipboard قبلی بعد از 300ms
  - فال‌بک خاموش: پنجره بسته → ClipboardOnly؛ غیرقابل ویرایش → ClipboardOnly
  - صف درخواست: `InjectorQueueManager` — الگوی Actor، FIFO عمق 3
  - ۶ تست واحد با MockLowLevelInjector: تمام مسیرهای فال‌بک پوشش داده شده
- **انحراف از سند:** ندارد
- **مسائل باز:** چک‌لیست تست دستی در `docs/MANUAL-TESTS.md` ثبت شده (نیاز به سخت‌افزار واقعی)

---

## فاز ۴ — Overlay & body language
- تاریخ: 2026-07-20
- **ساخته شد:**
  - `overlay.rs` (۳۱۱ خط): پنجره لایه‌ای با `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOPMOST`
  - چهار حالت: Listening (آبی نبض‌دار)، Processing (زرد چرخان)، Success (سبز)، Error (قرمز)
  - رندرینگ GDI با DIB Section و پری‌مولتیپلای آلفا
  - ردیابی مکان‌نما با ۳۰ فریم بر ثانیه (تایمر ۳۳ms)
  - حالت‌های نمایش:
    - **Cursor**: دایره ۳۲px با فاصله ۱۵px از مکان‌نما
    - **Corner**: ثابت در گوشه پایین-راست صفحه با حاشیه ۲۰px
  - `OverlayMode` enum در config (`overlay_mode: "cursor" | "corner"`)
  - تنظیم از طریق Studio → Settings → حالت اورلی
  - اعمال حالت ذخیره‌شده هنگام راه‌اندازی دیمن
- **انحراف از سند:** ندارد
- **مسائل باز:** تست دستی overlay در `docs/MANUAL-TESTS.md` ثبت شده

---

## فاز ۵ — Local engine & router
- تاریخ: 2026-07-20
- **ساخته شد:**
  - `local_engine.rs` (۱۹۲ خط): موتور محلی whisper-cli از طریق subprocess
    - بارگذاری تنبل (lazy load) با تأیید وجود مدل و اجراکننده
    - ترنسکریپت از طریق `tokio::process::Command` با آرگومان‌های `-m`, `-f`, `-nt`
    - Watchdog خودکار: تخلیه مدل بعد از ۵ دقیقه بیکاری
  - `router.rs` (۲۶۲ خط): مسیریابی سه‌سطحی
    - سطح ۱: Cloud WebSocket با تایمر ۸ ثانیه
    - سطح ۲: موتور محلی whisper-cli (ساخت WAV واقعی از PCM)
    - سطح ۳: صف تأخیری (ذخیره WAV در `%LOCALAPPDATA%\Zero\deferred\`)
    - پردازشگر صف در پس‌زمینه (هر ۳۰ ثانیه بررسی اتصال gateway)
    - نتایج تأخیری فقط به clipboard (هرگز درج خودکار — طبق §3.4)
  - `audio.rs` (۱۵۹ خط): ضبط صدا با cpal + ری‌سمپلینگ به 16kHz mono + ساخت WAV
  - ۲ تست واحد: مسیرهای خطا در بارگذاری مدل و ترنسکریپت
- **انحراف از سند:** از whisper-cli subprocess به‌جای whisper-rs FFI استفاده شد (عملکرد مشابه، سادگی بیشتر)
- **مسائل باز:** تست حالت آفلاین نیاز به سخت‌افزار واقعی دارد

---

## فاز ۶ — Studio
- تاریخ: 2026-07-20
- **ساخته شد:**
  - پروتکل IPC: فریم‌بندی newline-delimited JSON روی Named Pipe (`ipc.rs`)
  - فرانت: Tauri v2 + TypeScript با Tailwind CSS، RTL-first
  - **آنبوردینگ**: ویزارد ۴ مرحله‌ای (میانبر → اتصال سرور → دانلود مدل → تست میکروفون)
  - **تنظیمات**: حالت STT، میانبر، تایمر تخلیه مدل، حالت اورلی (cursor/corner)، کلید API
  - **تاریخچه**: اتصال به daemon IPC — جستجو، کپی، حذف تکی، حذف همه
  - **لیست سیاه**: افزودن/حذف نام پروسه، بنر راهنما
  - **دکمه «پاک‌کردن همه داده‌ها»** در سایدبار
  - فرانت بیلد: `vite build` موفق
- **انحراف از سند:** ندارد
- **مسائل باز:** تست دستی کامل نیاز به اجرای daemon دارد

---

## فاز ۷ — Persian rules & hardening (بخش اول)
- تاریخ: 2026-07-20
- **ساخته شد:**
  - `persian.rs` (۷۷ خط): پایپ‌لاین پردازش متن فارسی
    - نرمال‌سازی حروف عربی → فارسی (ي→ی، ك→ک)
    - نگاشت نشانه‌های گفتاری (علامت سوال→؟، نقطه→.، ویرگول→،)
    - نیم‌فاصله: پیشوندها (می، نمی) و پسوندها (ها، تر، ترین، ام، ات، اش)
    - ۳ تست واحد
  - `GATEWAY_URL` از hardcoded به config منتقل شد (`config.rs:gateway_url`)
  - استریم real-time چانک‌ها: ارسال همزمان بایت‌های صوتی به WebSocket حین ضبط (نه batch بعد از stop)
    - `stream_tx` channel از writer task به streaming task
    - Streaming task چانک‌ها را هنگام دریافت ارسال می‌کند
    - اتصال مجزا برای دریافت نتیجه ترنسکریپت
- **انحراف از سند:** ندارد
- **مسائل باقی‌مانده (غیر بحرانی):**
  - i18n واحد fa/en
  - DPAPI برای کلید رمز
  - Performance harness در CI
  - Watchdog / silent updater / remote config
  - Code-signing

---

## فاز ۸ — Zero Notes (دفتر یادداشت)
- تاریخ: 2026-07-20
- **ساخته شد:**
  - `db.rs` (۲۹۷ خط): ماژول SQLite با rusqlite (bundled)
    - جدول `notes`: id, title, body, tags (JSON), pinned, created_at, updated_at
    - FTS5 برای جستجوی تمام‌متن فارسی
    - Triggers خودکار برای همگام‌سازی FTS
    - توابع: create_note, get_all_notes, get_note, update_note, pin_note, delete_note, search_notes
    - ۲ تست واحد: ایجاد/خواندن یادداشت، متن فارسی با نیم‌فاصله
  - `ipc.rs`: ۷ درخواست IPC جدید (GetNotes, GetNote, CreateNote, UpdateNote, PinNote, DeleteNote, SearchNotes)
  - `src-tauri/main.rs`: ۷ Tauri command جدید برای اتصال فرانت به daemon
  - `Notepad.tsx` بازنویسی کامل:
    - اتصال به daemon IPC به‌جای localStorage
    - لیست یادداشت‌ها با جستجو و نمایش تگ‌ها
    - ویرایشگر عنوان + متن + تگ‌ها
    - سنجاق/سنجاق‌برداری یادداشت‌ها
    - خروجی Markdown
    - تایپ صوتی (Web Speech API + daemon IPC)
- **انحراف از سند:** Word export (.docx) فعلاً پیاده نشده (فقط Markdown)
- **مسائل باز:** ندارد

---

## فاز ۹ — Simultaneous Translation (ترجمه همزمان)
- تاریخ: 2026-07-20
- **ساخته شد:**
  - **سرور** — ماژول `translation/`:
    - `TranslationProvider` interface (الگوی مشابه STT)
    - `MyMemoryProvider`: API رایگان ترجمه بدون کلید (محدودیت ~5000 کاراکتر/روز)
    - `TranslationService`: ترجمه با failover
    - `TranslationController`: REST endpoint `POST /translation` با JWT auth
    - سهمیه جداگانه ترجمه (10000 کاراکتر/ماه)
    - ثبت در `AppModule`
  - **دیمن** — پشتیبانی ترجمه:
    - فیلد `translate_mode` در config ("off" | "fa-en" | "en-fa")
    - تابع `translate_text()`: HTTP POST به سرور gateway با تایمر 5 ثانیه
    - اعمال ترجمه بعد از نرمال‌سازی فارسی و قبل از درج متن
  - **استودیو** — تنظیمات:
    - سوییچ ترجمه ۳حالته: غیرفعال / فارسی→انگلیسی / انگلیسی→فارسی
    - ذخیره و بازیابی از config
- **انحراف از سند:** ندارد
- **مسائل باز:** تست end-to-end نیاز به سرور واقعی دارد

---

## فاز ۱۰ — Meeting Mode & Transcript (حالت جلسه)
- تاریخ: 2026-07-20
- **ساخته شد:**
  - **دیمن** — حالت ضبط مداوم جلسه:
    - فرمان‌های جدید `DaemonCmd::StartMeeting` / `StopMeeting`
    - `stop_and_transcribe_meeting()`: ترنسکریپت کامل با تایمر ۱۲۰ ثانیه
    - `format_srt()`: تبدیل متن به فرمت زیرنویس SRT
    - `chrono_now_simple()`: تاریخ شمسی ساده
    - بازیابی صوت از بافر رمزشده بعد از کرش (ویژگی موجود buffer.rs)
  - **IPC** — درخواست‌های جدید:
    - `StartMeeting` / `StopMeeting` با پاسخ TranscriptionResult
    - Tauri commands: `start_meeting()` / `stop_meeting()` با تایمر ۱۲۵ ثانیه
  - **استودیو** — `MeetingMode.tsx` (۱۷۵ خط):
    - دکمه شروع/توقف ضبط با تایمر زنده
    - نمایش ترنسکریپت کامل با فرمت SRT
    - ذخیره در یادداشت‌ها (وابسته به فاز ۸)
    - کپی متن و خروجی Markdown
    - نوار پیشرفت حین پردازش
- **انحراف از سند:** LLM summarization فعلاً پیاده نشده (نیاز به ADR-007)
- **مسائل باز:** ندارد

---

## فاز ۱۱ — Text Intelligence: Dictionary, Snippets, Voice Commands
- تاریخ: 2026-07-20
- **ساخته شد:**
  - **پایگاه‌داده** — جداول جدید در `db.rs`:
    - `dictionary`: id, wrong (غلط), correct (درست) — اصلاح خودکار کلمات
    - `snippets`: id, trigger_text (عبارت تریگر), replacement (متن جایگزین)
    - توابع CRUD: get/add/remove برای هر دو جدول
  - **پایپ‌لاین متن** — توابع جدید در `persian.rs`:
    - `apply_dictionary()`: جایگزینی کلمات غلط با درست (تطبیق کلمه کامل)
    - `check_snippets()`: تشخیص عبارت تریگر در انتهای متن و جایگزینی
    - `apply_voice_commands()`: پردازش فرمان‌های صوتی:
      - "پاکش کن" → حذف آخرین کلمه
      - "خط جدید" → اضافه کردن newline
      - "همه‌اش را پاک کن" → پاک‌سازی کامل متن
  - **IPC** — درخواست‌های جدید:
    - `GetDictionary` / `AddDictionary` / `RemoveDictionary`
    - `GetSnippets` / `AddSnippet` / `RemoveSnippet`
    - Tauri commands متناظر
  - **تست‌ها** — ۵ تست جدید (مجموع: ۱۸ تست):
    - تطبیق فرهنگ لغت
    - تشخیص اسنیپت
    - ۳ فرمان صوتی
- **انحراف از سند:** ندارد
- **مسائل باز:** مدیریت فرانت (UI فرانت برای دیکشنری و اسنیپت‌ها فعلاً ساخته نشده)

---

## فاز ۱۲ — Usage Stats & LLM Polish Layer
- تاریخ: 2026-07-20
- **ساخته شد:**
  - **آمار استفاده** — `config.rs`:
    - `UsageStats` struct: total_entries, total_duration_secs, total_words, avg_duration_secs, by_engine
    - `compute_usage_stats()`: محاسبه از تاریخچه محلی (بدون تله‌متری)
  - **IPC** — درخواست جدید: `GetUsageStats` → `UsageStats` response
  - **Tauri** — command: `get_usage_stats()`
  - **استودیو** — `Stats.tsx` (۱۶۵ خط):
    - ۴ کارت خلاصه: تعداد ضبط، مدت کل، تعداد کلمات، میانگین مدت
    - نمودار میله‌ای توزیع موتور تبدیل (ابری/محلی/تأخیری)
    - نمایش با فرمت فارسی (اعداد fa-IR)
    - حالت خالی با راهنمای کاربر
  - تب جدید «آمار استفاده» در سایدبار استودیو
- **انحراف از سند:** LLM Polish فعلاً پیاده نشده (نیاز به سرویس سمت سرور + ADR)
- **مسائل باز:** ندارد


## 2026-09-24 — Maintenance: clippy `-D warnings` gate restored

Baseline: server 37/37 tests pass, Studio `tsc` clean; `cargo clippy -D warnings` failed in 3 crates (CI breaker).

| File | Issue | Fix |
|---|---|---|
| zero-daemon/src/injector.rs (tests, ~730/754) | `missing_transmute_annotations` | explicit `transmute::<isize, IUIAutomationElement>` |
| zero-daemon/src/local_engine.rs:158 | `manual_clamp` | `.clamp(4, 8)` |
| zero-studio/src-tauri/src/main.rs:481, 1040, 1175 | `manual_clamp`, `redundant_pattern_matching` | `.clamp`, `.is_ok()` |
| right-panel-main/src/main.rs:45-47, 112 | `type_complexity`, `collapsible_if` | `ClipImage` alias, let-chain |
| right-panel-main/src/sys/windows.rs:499 | `unnecessary_mut_passed` | `&bi` |

Verified: workspace + Tauri clippy exit 0, `cargo test --workspace` all pass, server tests pass.
