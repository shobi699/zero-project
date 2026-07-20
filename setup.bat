@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

title Zero — Full Setup Script
color 0B

echo.
echo  ===================================================
echo        Zero — System-Wide Voice Input for Windows
echo                    Full Setup Script
echo  ===================================================
echo.

set "PROJECT_ROOT=%~dp0"
set "ERRORS=0"

:: ───────────────────────────────────────────────
::  PHASE 1: Check Prerequisites
:: ───────────────────────────────────────────────
echo  [1/7] Checking prerequisites...
echo  ---------------------------------------------------

:: Git
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [X] Git is NOT installed.
    echo      Download: https://git-scm.com/download/win
    set /a ERRORS+=1
) else (
    for /f "tokens=*" %%g in ('git --version') do set "GIT_VER=%%g"
    echo  [OK] !GIT_VER!
)

:: Rust
where cargo >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [X] Rust is NOT installed.
    echo      Run: winget install Rustlang.Rustup
    echo      Or:  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    set /a ERRORS+=1
) else (
    for /f "tokens=2" %%g in ('rustc --version') do set "RUST_VER=%%g"
    echo  [OK] Rust !RUST_VER! (cargo found)
)

:: Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [X] Node.js is NOT installed.
    echo      Download: https://nodejs.org/ (LTS version)
    echo      Or: winget install OpenJS.NodeJS.LTS
    set /a ERRORS+=1
) else (
    for /f "tokens=*" %%g in ('node --version') do set "NODE_VER=%%g"
    echo  [OK] Node.js !NODE_VER!
)

:: npm
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [X] npm is NOT installed (should come with Node.js).
    set /a ERRORS+=1
) else (
    for /f "tokens=*" %%g in ('npm --version') do set "NPM_VER=%%g"
    echo  [OK] npm !NPM_VER!
)

:: Docker (optional)
set "DOCKER_AVAILABLE=0"
where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [--] Docker is NOT installed (optional — needed for local DB).
    echo       Download: https://docs.docker.com/desktop/install/windows-install/
) else (
    docker info >nul 2>&1
    if !ERRORLEVEL! neq 0 (
        echo  [OK] Docker found but daemon is not running.
        echo       Start Docker Desktop first if you want local databases.
    ) else (
        echo  [OK] Docker is running
        set "DOCKER_AVAILABLE=1"
    )
)

if !ERRORS! gtr 0 (
    echo.
    echo  [!] !ERRORS! required tool^(s^) missing. Install them and re-run this script.
    echo.
    pause
    exit /b 1
)

echo.

:: ───────────────────────────────────────────────
::  PHASE 2: Create environment files
:: ───────────────────────────────────────────────
echo  [2/7] Setting up environment files...
echo  ---------------------------------------------------

:: Server .env
if not exist "%PROJECT_ROOT%zero-server\.env" (
    (
        echo # ── Database ──
        echo DATABASE_URL="postgresql://zero:zero@localhost:5432/zero"
        echo.
        echo # ── Redis ──
        echo REDIS_URL="redis://localhost:6379"
        echo.
        echo # ── JWT Secrets (CHANGE THESE IN PRODUCTION) ──
        echo JWT_ACCESS_SECRET="dev-access-secret-change-me-in-production"
        echo JWT_REFRESH_SECRET="dev-refresh-secret-change-me-in-production"
        echo.
        echo # ── App ──
        echo NODE_ENV=development
        echo PORT=3000
        echo.
        echo # ── Admin emails (comma-separated) ──
        echo ADMIN_EMAILS=admin@zero.local
        echo.
        echo # ── STT Provider Keys (add your keys) ──
        echo OPENAI_API_KEY=
        echo GOOGLE_API_KEY=
        echo AZURE_STT_KEY=
        echo AZURE_STT_REGION=eastus
    ) > "%PROJECT_ROOT%zero-server\.env"
    echo  [OK] Created zero-server\.env (edit with your keys)
) else (
    echo  [OK] zero-server\.env already exists
)

:: STT Benchmark .env
if not exist "%PROJECT_ROOT%tools\stt-bench\.env" (
    (
        echo # OpenAI Whisper API
        echo OPENAI_API_KEY=sk-...
        echo.
        echo # Google Cloud Speech-to-Text
        echo GOOGLE_API_KEY=AIza...
        echo.
        echo # Azure Speech Services
        echo AZURE_STT_KEY=...
        echo AZURE_STT_REGION=westeurope
    ) > "%PROJECT_ROOT%tools\stt-bench\.env"
    echo  [OK] Created tools\stt-bench\.env (edit with your keys)
) else (
    echo  [OK] tools\stt-bench\.env already exists
)

echo.

:: ───────────────────────────────────────────────
::  PHASE 3: Start databases (Docker)
:: ───────────────────────────────────────────────
echo  [3/7] Starting local databases...
echo  ---------------------------------------------------

if "!DOCKER_AVAILABLE!"=="1" (
    docker-compose up -d
    if !ERRORLEVEL! equ 0 (
        echo  [OK] PostgreSQL and Redis started
        echo  [..] Waiting 5s for DB to initialize...
        timeout /t 5 /nobreak >nul
    ) else (
        echo  [!] Failed to start Docker containers. Continuing anyway...
    )
) else (
    echo  [--] Skipping (Docker not available)
    echo       If you need local DB, start PostgreSQL + Redis manually or install Docker.
)

echo.

:: ───────────────────────────────────────────────
::  PHASE 4: Build Rust workspace
:: ───────────────────────────────────────────────
echo  [4/7] Building Rust workspace (daemon + stt-bench)...
echo  ---------------------------------------------------

cargo build --workspace
if %ERRORLEVEL% neq 0 (
    echo  [X] Rust workspace build FAILED
    set /a ERRORS+=1
) else (
    echo  [OK] Rust workspace built successfully
)

:: Run clippy
echo  [..] Running clippy (lint check)...
cargo clippy --workspace -- -D warnings >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [!] Clippy found warnings — run: cargo clippy --workspace -- -D warnings
) else (
    echo  [OK] Clippy clean
)

:: Run tests
echo  [..] Running Rust tests...
cargo test --workspace >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [!] Some Rust tests failed — run: cargo test --workspace
) else (
    echo  [OK] All Rust tests passed
)

echo.

:: ───────────────────────────────────────────────
::  PHASE 5: Build NestJS server
:: ───────────────────────────────────────────────
echo  [5/7] Building NestJS server...
echo  ---------------------------------------------------

cd "%PROJECT_ROOT%zero-server"

echo  [..] Installing npm dependencies...
call npm ci
if %ERRORLEVEL% neq 0 (
    echo  [X] Server npm install FAILED
    set /a ERRORS+=1
    cd "%PROJECT_ROOT%"
) else (
    echo  [OK] Server dependencies installed

    echo  [..] Building server...
    call npm run build
    if !ERRORLEVEL! neq 0 (
        echo  [X] Server build FAILED
        set /a ERRORS+=1
    ) else (
        echo  [OK] Server built successfully
    )

    echo  [..] Running Prisma migration...
    npx prisma migrate dev --name init >nul 2>&1
    if !ERRORLEVEL! neq 0 (
        echo  [!] Prisma migration failed — database may not be running.
        echo       Start PostgreSQL then run: cd zero-server ^&^& npx prisma migrate dev
    ) else (
        echo  [OK] Database migrated
    )

    echo  [..] Running server tests...
    npm test >nul 2>&1
    if !ERRORLEVEL! neq 0 (
        echo  [!] Some server tests failed — run: cd zero-server ^&^& npm test
    ) else (
        echo  [OK] All server tests passed
    )
)

cd "%PROJECT_ROOT%"
echo.

:: ───────────────────────────────────────────────
::  PHASE 6: Build Tauri Studio
:: ───────────────────────────────────────────────
echo  [6/7] Building Tauri Studio...
echo  ---------------------------------------------------

cd "%PROJECT_ROOT%zero-studio"

echo  [..] Installing npm dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo  [X] Studio npm install FAILED
    set /a ERRORS+=1
    cd "%PROJECT_ROOT%"
) else (
    echo  [OK] Studio dependencies installed

    echo  [..] Building Tauri app (this may take a while on first run^)...
    call npx tauri build
    if !ERRORLEVEL! neq 0 (
        echo  [X] Tauri build FAILED
        echo       Ensure WebView2 Runtime is installed:
        echo       https://developer.microsoft.com/en-us/microsoft-edge/webview2/
        set /a ERRORS+=1
    ) else (
        echo  [OK] Tauri Studio built successfully
    )
)

cd "%PROJECT_ROOT%"
echo.

:: ───────────────────────────────────────────────
::  PHASE 7: Summary
:: ───────────────────────────────────────────────
echo  [7/7] Setup complete!
echo  ===================================================

if !ERRORS! gtr 0 (
    echo.
    echo  [!] Finished with !ERRORS! error^(s^). See messages above.
    echo  Fix the issues and re-run this script.
) else (
    echo.
    echo  Everything built successfully!
    echo.
    echo  Quick commands:
    echo    Run daemon:       cargo run -p zero-daemon
    echo    Run server:       cd zero-server ^&^& npm run start:dev
    echo    Run benchmark:    cargo run -p stt-bench -- --report
    echo    Start databases:  docker-compose up -d
)

echo.
pause
