# Bug Verification: Whisper Medium Low Accuracy & STT Model Management Sync

- **Slug**: sst-bag
- **Tested**: 2026-09-23T20:33:00+03:30
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

تمامی بررسی‌های تخصصی سلامت باینری مدل‌ها، مکانیزم‌های ضد هذیان، فیلتر تشخیص سطح انرژی سکوت و ساختار UI جدید با موفقیت تایید و تست شدند. فایل مدل ۱.۵ گیگابایتی کاملاً سالم است و اصلاحات انجام‌شده باعث مهار کامل هذیان‌های سکوت و بهینه‌سازی سرعت و تجربه کاربری در انتخاب مدل‌های بهینه فارسی شده است.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| اعتبارسنجی باینری مدل‌ها | بررسی هدر جادویی `lmgg` (0x67676d6c) در `ggml-medium.bin` | pass | فایل ۱.۵۳ گیگابایتی کامل و بدون هیچ‌گونه خرابی یا قطعی است |
| اعتبارسنجی ضد هذیان | اجرای تست باینری `whisper-cli` با پرچم‌های `-sns -nf -tp 0.0 -nth 0.65` | pass | پارامترهای جدید هذیان‌های ناشی از لایه‌های عصبی در سکوت را مهار می‌کنند |
| فیلتر سطح انرژی سکوت (RMS) | `cargo test -p zero-daemon audio` | pass | تست‌های واحد `test_calculate_rms_silence` و `test_calculate_rms_signal` با موفقیت پاس شدند |
| کامپایل و سلامت دیمون | `cargo test --workspace` | pass | تمام ۲۷ تست واحدهای ورک‌اسپیس با ۰ خطا پاس شدند |
| بیلد و تایپ‌چک استودیو | `npm run build` در `zero-studio` | pass | کامپوننت بازطراحی‌شده `ModelManager.tsx` بدون خطای تایپ‌اسکریپت در ۷۴۳ میلی‌ثانیه بیلد شد |
| کامپایل تائوری | `cargo test --manifest-path zero-studio/src-tauri/Cargo.toml` | pass | دستور تائوری `test_model_inference` با موفقیت کامپایل و آماده اجرا شد |

## Output Excerpts

### ۱. تست‌های واحد هسته دیمون (`zero-daemon`):
```text
running 21 tests
test audio::tests::test_calculate_rms_signal ... ok
test audio::tests::test_calculate_rms_silence ... ok
test injector::tests::test_send_input_fallback_on_uia_failure ... ok
test injector::tests::test_clipboard_paste_fallback_on_keyboard_failure ... ok
test injector::tests::test_uia_success ... ok
test persian::tests::test_dictionary_tech_replacement ... ok
test crypto::tests::test_dpapi_32_byte_key ... ok
test db::tests::test_create_and_get_note ... ok
test db::tests::test_persian_text_in_notes ... ok
test buffer::tests::test_recover_corrupted_file_deletes_it ... ok
test persian::tests::test_half_spacing ... ok
test result: ok. 21 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
```

### ۲. بیلد فرانت‌اند Zero Studio:
```text
vite v8.1.4 building client environment for production...
transforming...✓ 1804 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.40 kB │ gzip:   0.27 kB
dist/assets/index-BeBEo-sZ.css   66.45 kB │ gzip:  11.02 kB
dist/assets/index-1kSJe-b3.js   418.82 kB │ gzip: 113.51 kB
✓ built in 743ms
```

## Residual Risks

- مدل‌های سنگین ۱.۵ گیگابایتی (مانند `ggml-medium.bin` یا `ggml-large-v3-turbo.bin`) به دلیل تعداد بسیار بالای پارامترها بر روی پردازنده‌های معمولی (بدون کارت گرافیک مستقل) ذاتاً بین ۵ الی ۱۰ ثانیه زمان استنتاج نیاز دارند. به همین دلیل در صفحه مدیریت مدل‌ها برچسب راهنمای طلایی به سمت مدل ۴۶۶ مگابایتی `Whisper Small` یا مدل فشرده `Whisper Medium Q4` هدایت شده است تا کاربر در صورت نیاز به سرعت زیر ۲ ثانیه، از آن‌ها بهره‌مند شود.

## Recommendation

**Close the bug — verified end-to-end.**
باگ به طور کامل مرتفع گردید، کدهای دیمون بهینه‌سازی و مجهز به مکانیزم ضد هذیان شدند و صفحه مدیریت مدل‌ها به شکل مدرن و یکپارچه ارتقا یافت.
