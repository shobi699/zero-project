# IPC Contract: Unified Right Panel & Zero Daemon Protocol

ارتباط میان پنل لبه (`right-panel`)، استودیو (`zero-studio`) و دیمون (`zero-daemon`) از طریق لوله نام‌گذاری‌شده ویندوز به آدرس `\\.\pipe\zero-ipc` به صورت پیام‌های تک‌خطی JSON (Newline-Delimited JSON) صورت می‌پذیرد.

---

## ۱. درخواست‌ها و پاسخ‌ها (Request / Reply)

### ۱.۱. کنترل تایپ صوتی
* **شروع/توقف ضبط (TriggerRecord):**
  * درخواست: `{"type": "TriggerRecord"}`
  * پاسخ: `{"type": "Ack", "success": true}`
* **دریافت وضعیت زنده دیمون (GetStatus):**
  * درخواست: `{"type": "GetStatus"}`
  * پاسخ:
    ```json
    {
      "type": "StatusUpdate",
      "status": "idle", // "idle" | "listening" | "processing" | "error"
      "active_model": "ggml-small.bin",
      "engine_mode": "local",
      "hotkey": "Ctrl + Shift + Z"
    }
    ```

### ۱.۲. مدیریت یادداشت‌ها (Notes API)
* **دریافت لیست یادداشت‌ها (GetNotes):**
  * درخواست: `{"type": "GetNotes"}`
  * پاسخ:
    ```json
    {
      "type": "Notes",
      "notes": [
        {
          "id": "n_1780001",
          "title": "جلسه فنی",
          "body": "بررسی سناریوهای ادغام داک",
          "is_pinned": true,
          "updated_at": 1780001234
        }
      ]
    }
    ```
* **ایجاد یادداشت جدید (CreateNote):**
  * درخواست: `{"type": "CreateNote", "title": "یادداشت جدید", "body": "متن یادداشت", "tags": "کار"}`
  * پاسخ: `{"type": "Note", "id": "n_1780002"}`

### ۱.۳. همگام‌سازی تنظیمات (Settings API)
* **دریافت تنظیمات جامع (GetConfig):**
  * درخواست: `{"type": "GetConfig"}`
  * پاسخ: `{"type": "Config", "data": { ... }}`
* **ذخیره تنظیمات (UpdateSettings):**
  * درخواست: `{"type": "UpdateSettings", "settings": "{...}"}`
  * پاسخ: `{"type": "Ack", "success": true}`

---

## ۲. رخدادهای انتشاری (Realtime Broadcasts)

کلاینت با ارسال پیام `{"type": "Subscribe"}` در صف انتشار رخدادها ثبت‌نام می‌کند:

1. **پیش‌نمایش زنده صوت (TranscriptionPreview):**
   ```json
   {
     "type": "TranscriptionPreview",
     "text": "سلام و درود، متن در حال تایپ...",
     "x": 1200,
     "y": 650
   }
   ```
2. **تغییر وضعیت موتور (StatusUpdate):**
   ```json
   {
     "type": "StatusUpdate",
     "status": "listening"
   }
   ```
3. **دامنه فرکانسی صدا برای انیمیشن موجی (AudioWaveform):**
   ```json
   {
     "type": "AudioWaveform",
     "amplitude": 0.65
   }
   ```
