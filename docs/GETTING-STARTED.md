# GETTING-STARTED.md — راه‌اندازی با Claude Code

۱. این پوشه را ریشه ریپازیتوری گیت کنید (`git init`).
۲. Claude Code را در همین ریشه اجرا کنید؛ فایل CLAUDE.md خودکار خوانده می‌شود.
۳. اولین پرامپت پیشنهادی:

   «فایل‌های CLAUDE.md و docs/TECH-SPEC.md و TASKS.md را بخوان و فاز ۰ را شروع کن.»

۴. پیش‌نیازهای سیستم توسعه (ویندوز): Rust stable + msvc toolchain، Node LTS، pnpm، Tauri v2 prerequisites (WebView2)، Docker برای Postgres/Redis سرور.
۵. کلیدهای Provider برای بنچمارک فاز ۰ را در `.env` بگذارید (نمونه در tools/stt-bench پس از ساخت).
۶. قانون طلایی: هر فاز یک برنچ؛ پایان فاز = تیک‌های TASKS.md + به‌روزرسانی PROGRESS.md.
