@echo off
chcp 65001 >nul
title Zero - Voice Dictation & Smart Edge Panel
cd /d "%~dp0"

echo ========================================================
echo   سیستم هوشمند تایپ صوتی Zero و پنل لبه صفحه
echo   Zero Intelligent Voice Input & Liquid Edge Panel
echo ========================================================
echo.
echo در حال راه‌اندازی سرویس‌های محلی...

start "" "right-panel.exe"

echo پنل در لبه مانیتور شما فعال شد.
timeout /t 2 >nul
exit
