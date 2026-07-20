# Zero — لایه ورودی گفتاری سراسری برای ویندوز

<div align="center">

![Zero Logo](https://img.shields.io/badge/Zero-Voice_Input-FF6B35?style=for-the-badge&logo=microsoft&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-1.70+-000000?style=for-the-badge&logo=rust&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri_v2-WebView-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-Server-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**هرجا می‌توانی تایپ کنی، می‌توانی صحبت کنی.**

</div>

---

## خلاصه

Zero یک لایه ورودی گفتاری سراسری برای ویندوز است: کاربر در هر برنامه‌ای که Cursor داشته باشد، با یک میانبر صحبت می‌کند و متن همان‌جا درج می‌شود. محصول از دو پروسه دسکتاپ (Daemon همیشه‌روشن و Studio بنابه‌نیاز)، یک موتور تبدیل هیبرید (ابری با پشتیبان محلی) و یک سرور Gateway چندتأمین‌کننده تشکیل شده است.

---

## قول‌های غیرقابل مذاکره

| قول | سنجه |
|-----|-------|
| **نامرئی بودن** | مصرف رم Daemon در حالت بیکار < ۵۰ مگابایت (هدف: ۲۰) |
| **فوری بودن** | از پایان صحبت تا ظهور متن < ۱ ثانیه (P95) |
| **گم‌نشدن گفتار** | هیچ صحبت ضبط‌شده‌ای تحت هیچ شرایطی از بین نمی‌رود |
| **رازداری** | حالت Local هیچ بایتی به شبکه نمی‌فرستد |
| **فارسی حرفه‌ای** | نیم‌فاصله، رسم‌الخط و نگارش صحیح به‌عنوان مزیت رقابتی اصلی |

---

## معماری

```
┌────────────────────────── کلاینت ویندوز ──────────────────────────┐
│                                                                    │
│  Zero Daemon (Rust خالص، همیشه‌روشن)                               │
│  ├── Hotkey Listener        (نگهبان)                               │
│  ├── Audio Capture          (گوش)                                  │
│  ├── Engine Router          (داور: ابری/محلی)                      │
│  │     ├── Cloud Client ──── WebSocket ──► Gateway                 │
│  │     └── Local Engine ──── whisper.cpp (اختیاری)                 │
│  ├── Text Injector          (قلم: سه استراتژی)                     │
│  ├── Overlay Renderer       (چهره: دایره زبان بدن)                 │
│  └── State Store            (SQLite محلی: تنظیمات، History)        │
│                                                                    │
│  Zero Studio (Tauri WebView، بنابه‌نیاز)                            │
│  └── تنظیمات، Onboarding، History UI، مدیریت حساب                  │
│                                                                    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ TLS
┌──────────────────────────────▼─────────────────────────────────────┐
│                        سرور (NestJS)                                │
│  ├── Auth & Licensing        (حساب، اشتراک، JWT)                    │
│  ├── Quota Service           (شمارش ثانیه‌های ابری، Redis)          │
│  ├── STT Gateway             (چند Provider + Failover + صف)         │
│  └── PostgreSQL + Redis                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### چرا دو پروسه؟

- **Daemon** هیچ WebView ندارد؛ فقط Rust و APIهای Win32. نتیجه: رم زیر ۲۰ مگابایت، راه‌اندازی زیر ۱۵۰ میلی‌ثانیه، و پایداری بالا
- **Studio** یک اپ Tauri کامل است که فقط با کلیک کاربر روی آیکون Tray باز می‌شود و با بسته‌شدن، کامل از رم خارج می‌شود
- ارتباط این دو از طریق IPC محلی (Named Pipe ویندوز) با پروتکل JSON انجام می‌شود

---

## ساختار پروژه

```
zero-project/
├── zero-daemon/          ← Rust خالص، همیشه‌روشن، بدون WebView
├── zero-studio/          ← Tauri v2 (تنظیمات، Onboarding، History)
│   ├── src-tauri/        ← Rust backend (خارج از workspace)
│   └── src/              ← TypeScript (RTL-first)
├── zero-server/          ← NestJS (auth, quota, STT gateway)
├── tools/
│   └── stt-bench/        ← CLI بنچمارک برای ارزیابی Providerهای STT
└── docs/                 ← مستندات فنی، تصمیمات معماری
```

---

## پیش‌نیازها

### سیستم عامل
- **Windows 10/11** (x64)
- WebView2 Runtime (معمولاً روی ویندوز ۱۱ نصب است)

### ابزارهای توسعه

| ابزار | نسخه | توضیح |
|-------|------|-------|
| **Rust** | stable + MSVC | `rustup` نصب کنید |
| **Node.js** | LTS (20+) | برای سرور و Studio |
| **pnpm** | latest | مدیریت پکیج |
| **Docker** | latest | برای PostgreSQL و Redis |
| **Git** | latest | کنترل ورژن |

---

## نصب و راه‌اندازی

### ۱. کلون کردن ریپازیتوری

```bash
git clone https://github.com/your-username/zero-project.git
cd zero-project
```

### ۲. راه‌اندازی زیرساخت (سرور)

```bash
# اجرای PostgreSQL و Redis از طریق Docker
docker-compose up -d
```

### ۳. نصب وابستگی‌های سرور

```bash
cd zero-server
npm ci
cp .env.example .env   # تنظیم متغیرهای محیطی
npm run build
npm test
```

### ۴. کامپایل Daemon (Rust)

```bash
# تنظیم متغیرهای محیطی Rust (اگر Rust روی درایو دیگری است)
$env:RUSTUP_HOME = "D:\rustup"
$env:CARGO_HOME = "D:\cargo"
$env:PATH = "D:\cargo\bin;$env:PATH"

# کامپایل و تست
cargo build --workspace
cargo clippy --workspace -- -D warnings
cargo test --workspace
```

### ۵. نصب و کامپایل Studio (Tauri)

```bash
cd zero-studio
npm install
npx tauri build
```

### ۶. اجرای محیط توسعه

```bash
# روش پیشنهادی (جایگزین npx tauri dev که مشکل دارد):
cd zero-studio
node node_modules/vite/bin/vite.js   # در ترمینال اول
.\src-tauri\target\release\zero-studio.exe   # در ترمینال دوم
```

---

## دستورات مفید

### Rust Workspace
```bash
cargo build --workspace              # کامپایل همه
cargo clippy --workspace -- -D warnings  # بررسی کیفیت کد
cargo test --workspace               # اجرای تست‌ها
cargo test -p stt-bench              # تست یک کرات خاص
```

### STT Benchmark
```bash
# نیاز به کلیدهای Provider در فایل .env
cd tools/stt-bench
cargo run -p stt-bench -- --report                           # همه Providerها
cargo run -p stt-bench -- --report --provider whisper-api    # یک Provider خاص
cargo run -p stt-bench -- --report --output report.md        # ذخیره در فایل
```

### NestJS Server
```bash
cd zero-server
npm ci
npm run build
npm test
npm run start:dev    # حالت توسعه
```

### Tauri Studio
```bash
cd zero-studio
npm install
npx tauri build      # کامپایل نهایی
```

---

## CI/CD

GitHub Actions در `.github/workflows/ci.yml` روی هر push/PR به main اجرا می‌شود:

| Job | محیط | دستورات |
|-----|------|---------|
| **Rust** | windows-latest | build + clippy + test |
| **Server** | ubuntu-latest | npm ci + build + test |
| **Studio** | windows-latest | npm install + tauri build |

---

## تنظیمات

### فایل پیکربندی Daemon
مسیر: `%LOCALAPPDATA%\Zero\config.json`

```json
{
  "openai_api_key": "sk-...",
  "active_model": "ggml-base",
  "engine_mode": "cloud",
  "hotkey": "Ctrl+Shift+V",
  "unload_timeout": 300,
  "models_dir": ""
}
```

### متغیرهای محیطی سرور
```bash
# zero-server/.env
DATABASE_URL=postgresql://zero:zero@localhost:5432/zero
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
```

---

## مدل STT

### ابری (پیش‌فرض)
- OpenAI Whisper API
- نیاز به کلید API در سمت سرور (کلاین هرگز کلید ندارد)

### محلی (اختیاری)
- whisper.cpp از طریق whisper-rs
- مدل‌ها در پوشه قابل تنظیم (پیش‌فرض: `%USERPROFILE%\Zero\models`)
- مدل‌های پشتیبانی‌شده:
  - `ggml-tiny` (75MB) - سریع‌ترین
  - `ggml-base` (142MB) - پیشنهادی
  - `ggml-small` (466MB) - بهتر
  - `ggml-medium` (1.5GB) - بهترین

---

## قابلیت‌های کلیدی

### درج هوشمند متن
سه استراتژی با سقوط خودکار:
1. **UI Automation** - درج مستقیم در فیلدهای متنی
2. **SendInput** - شبیه‌سازی تایپ با سرعت ۲۰۰-۴۰۰ کاراکتر در ثانیه
3. **Clipboard** - کپی + Ctrl+V + بازگردانی کلیپبورد

### زبان بدن (Overlay)
- دایره ۳۶ پیکسلی کنار Cursor
- آبی نبض‌دار: در حال شنیدن
- زرد چرخان: در حال تبدیل
- سبز: موفقیت
- قرمز: خطا

### حالت‌های تعامل
- **Tap-to-Talk**: زدن میانبر = شروع، زدن دوباره = پایان
- **Push-to-Talk**: نگه‌داشتن = ضبط

### لیست سیاه
- اعمال در سطح Hotkey قبل از باز شدن میکروفون
- غیرقابل دورزدن

---

## قوانین فارسی

- **نیم‌فاصله (U+200C)**: استفاده صحیح در ترکیبات
- **تبدیل حروف**: ی عربی → ی فارسی، ک عربی → ک فارسی
- **ارسال متن**: SendInput با KEYEVENTF_UNICODE
- **هیچ‌وقت**: معکوس‌سازی RTL دستی

---

## تست دستی

فایل `docs/MANUAL-TESTS.md` شامل چک‌لیست تست‌هایی است که نیاز به سخت‌افزار دارند:
- تست در Word، Telegram Desktop، Chrome، VS Code، Notepad
- تست نیم‌فاصله و RTL
- تست حالت آفلاین
- تست لیست سیاه

---

## مستندات

| فایل | توضیح |
|------|-------|
| `docs/TECH-SPEC.md` | مشخصات فنی کامل |
| `docs/PRODUCT-STORY.md` | چشم‌انداز محصول |
| `docs/DECISIONS.md` | ثبت تصمیمات معماری |
| `docs/PROGRESS.md` | پیشرفت پروژه |
| `docs/CORPUS-SPEC.md` | مشخصات فایل‌های صوتی بنچمارک |
| `docs/MANUAL-TESTS.md` | چک‌لیست تست‌های دستی |
| `TASKS.md` | برنامه ساخت مرحله‌ای |

---

## مشارکت

### قوانین شاخه‌ها
- هر فاز یک شاخه جداگانه
- Conventional commits: `feat/`، `fix/`، `chore/`
- پایان فاز = تیک‌های TASKS.md + به‌روزرسانی PROGRESS.md

### پیش‌نیازهای کد
- `cargo clippy --workspace -- -D warnings` بدون خطا
- `cargo test --workspace` همه سبز
- `npm test` در zero-server سبز

---

## لایسنس

MIT License - جزئیات در فایل LICENSE

---

<div align="center">

**ساخته شده با عشق به زبان فارسی**

[![Rust](https://img.shields.io/badge/Rust-Community-000000?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-Community-24C8DB?style=for-the-badge&logo=tauri)](https://tauri.app/)
[![NestJS](https://img.shields.io/badge/NestJS-Community-E0234E?style=for-the-badge&logo=nestjs)](https://nestjs.com/)

</div>
