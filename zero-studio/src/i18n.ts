// i18n.ts — Single source of truth for all user-facing strings (fa primary, en fallback)
// Rule: Persian copy first, English fallback. All UI strings MUST come from here.

const strings = {
  // App
  appTitle: { fa: 'پنل استودیو Zero', en: 'Zero Studio Panel' },
  appSubtitle: { fa: 'سرویس تبدیل گفتار هوشمند', en: 'Smart Speech Conversion' },

  // Navigation
  navSettings: { fa: 'تنظیمات پیکربندی', en: 'Settings' },
  navHistory: { fa: 'تاریخچه ضبط\u200cها', en: 'Recording History' },
  navNotepad: { fa: 'دفتر یادداشت', en: 'Notepad' },
  navBlacklist: { fa: 'لیست سیاه', en: 'Blacklist' },
  navMeeting: { fa: 'حالت جلسه', en: 'Meeting Mode' },
  navStats: { fa: 'آمار استفاده', en: 'Usage Stats' },
  navTextTools: { fa: 'ابزارهای متنی', en: 'Text Tools' },

  // Daemon
  daemonIdle: { fa: 'آماده (Idle)', en: 'Ready (Idle)' },
  daemonStatus: { fa: 'وضعیت دیمون:', en: 'Daemon status:' },
  triggerRecord: { fa: 'شبیه\u200cسازی ضبط (PTT)', en: 'Simulate Recording (PTT)' },
  deleteAllData: { fa: 'پاک\u200cکردن همه داده\u200cها', en: 'Delete All Data' },
  deleteAllDataConfirm: { fa: 'آیا از حذف تمام داده\u200cها اطمینان دارید؟\n\nاین عمل غیرقابل بازگشت است:\n- تاریخچه ضبط\u200cها\n- لیست سیاه\n- فایل\u200cهای موقت\n- تنظیمات', en: 'Are you sure you want to delete all data?\n\nThis action cannot be undone.' },
  logout: { fa: 'خروج از حساب کاربری', en: 'Logout' },

  // Settings
  sttModeTitle: { fa: 'حالت تبدیل گفتار', en: 'STT Mode' },
  sttBrowser: { fa: 'مرورگر (رایگان)', en: 'Browser (Free)' },
  sttLocal: { fa: 'محلی (whisper.cpp)', en: 'Local (whisper.cpp)' },
  sttFasterWhisper: { fa: 'Faster-Whisper', en: 'Faster-Whisper' },
  hotkeyTitle: { fa: 'میانبر و حافظه موقت', en: 'Hotkey & Memory' },
  hotkeyLabel: { fa: 'کلید میانبر ضبط (Push-to-Talk)', en: 'Recording Hotkey (Push-to-Talk)' },
  unloadTimeout: { fa: 'مدت زمان آزادسازی رم مدل محلی (دقیقه)', en: 'Local model unload timeout (minutes)' },
  overlayTitle: { fa: 'حالت اورلی', en: 'Overlay Mode' },
  overlayDesc: { fa: 'نحوه نمایش نشانگر وضعیت صوتی را انتخاب کنید', en: 'Choose how the audio status indicator is displayed' },
  overlayCursor: { fa: 'دنبال\u200cکننده مکان\u200cنما', en: 'Cursor Follower' },
  overlayCursorDesc: { fa: 'دایره کنار مکان\u200cنما', en: 'Circle next to cursor' },
  overlayCorner: { fa: 'ویجت گوشه', en: 'Corner Widget' },
  overlayCornerDesc: { fa: 'ثابت در گوشه صفحه', en: 'Fixed at screen corner' },
  translateTitle: { fa: 'ترجمه همزمان', en: 'Simultaneous Translation' },
  translateDesc: { fa: 'متن ترجمه\u200cشده به\u200cجای متن اصلی درج شود', en: 'Translated text inserted instead of original' },
  translateOff: { fa: 'غیرفعال', en: 'Off' },
  translateFaEn: { fa: 'فارسی → انگلیسی', en: 'Persian → English' },
  translateEnFa: { fa: 'انگلیسی → فارسی', en: 'English → Persian' },
  save: { fa: 'ذخیره', en: 'Save' },
  saved: { fa: 'ذخیره شد', en: 'Saved' },
  reset: { fa: 'بازنشانی', en: 'Reset' },

  // History
  historyTitle: { fa: 'تاریخچه ضبط\u200cها', en: 'Recording History' },
  historyDesc: { fa: 'تاریخچه تبدیل\u200cهای قبلی و روش\u200cهای درج متن', en: 'Previous conversions and text insertion methods' },
  historySearch: { fa: 'جستجو در میان متن\u200cها...', en: 'Search texts...' },
  historyEmpty: { fa: 'هیچ سابقه ضبطی یافت نشد.', en: 'No recording history found.' },
  historyDeleteAll: { fa: 'حذف همه', en: 'Delete All' },
  historyCopy: { fa: 'کپی متن', en: 'Copy Text' },
  historyCopied: { fa: 'کپی شد', en: 'Copied' },
  historySeconds: { fa: 'ثانیه', en: 'seconds' },
  engineCloud: { fa: 'ابری', en: 'Cloud' },
  engineLocal: { fa: 'محلی آفلاین', en: 'Local Offline' },
  engineDeferred: { fa: 'صف تأخیری', en: 'Deferred Queue' },

  // Notepad
  notepadTitle: { fa: 'دفتر یادداشت', en: 'Notepad' },
  notepadDesc: { fa: 'یادداشت\u200cهای صوتی و متنی با جستجوی تمام\u200cمتن', en: 'Voice and text notes with full-text search' },
  notepadNew: { fa: 'جدید', en: 'New' },
  notepadSearch: { fa: 'جستجو در یادداشت\u200cها...', en: 'Search notes...' },
  notepadUntitled: { fa: 'بدون عنوان', en: 'Untitled' },
  notepadEmpty: { fa: 'هیچ یادداشتی وجود ندارد.', en: 'No notes found.' },
  notepadTitlePlaceholder: { fa: 'عنوان یادداشت...', en: 'Note title...' },
  notepadBodyPlaceholder: { fa: 'متن یادداشت را اینجا بنویسید یا دکمه میکروفن را بزنید...', en: 'Write your note here or tap the mic button...' },
  notepadVoiceType: { fa: 'تایپ صوتی', en: 'Voice Type' },
  notepadPin: { fa: 'سنجاق', en: 'Pin' },
  notepadUnpin: { fa: 'سنجاق', en: 'Unpin' },
  notepadExportMd: { fa: 'Markdown', en: 'Markdown' },
  notepadDelete: { fa: 'حذف', en: 'Delete' },
  notepadListening: { fa: 'در حال گوش دادن...', en: 'Listening...' },

  // Blacklist
  blacklistTitle: { fa: 'لیست سیاه', en: 'Blacklist' },
  blacklistDesc: { fa: 'برنامه\u200cهایی که میانبر در آنها غیرفعال است', en: 'Apps where the hotkey is disabled' },
  blacklistInfo: { fa: 'وقتی نام یک برنامه در لیست سیاه باشد، میانبر ضبط در آن برنامه کاملاً بی\u200cاثر می\u200cشود.', en: 'When an app is blacklisted, the recording hotkey is completely disabled in it.' },
  blacklistPlaceholder: { fa: 'نام پروسه (مثال: chrome.exe)', en: 'Process name (e.g. chrome.exe)' },
  blacklistAdd: { fa: 'افزودن', en: 'Add' },
  blacklistEmpty: { fa: 'لیست سیاه خالی است.', en: 'Blacklist is empty.' },

  // Meeting
  meetingTitle: { fa: 'حالت جلسه', en: 'Meeting Mode' },
  meetingDesc: { fa: 'ضبط طولانی و ترنسکریپت کامل جلسات', en: 'Long recording and full meeting transcript' },
  meetingReady: { fa: 'آماده ضبط', en: 'Ready to record' },
  meetingRecording: { fa: 'در حال ضبط...', en: 'Recording...' },
  meetingProcessing: { fa: 'در حال ترنسکریپت...', en: 'Transcribing...' },
  meetingStopHint: { fa: 'برای توقف و ترنسکریپت، دکمه را دوباره بزنید', en: 'Tap again to stop and transcribe' },
  meetingMaxDuration: { fa: 'حداکثر ۶۰ دقیقه', en: 'Max 60 minutes' },
  meetingTranscript: { fa: 'ترنسکریپت', en: 'Transcript' },
  meetingSaveToNotes: { fa: 'ذخیره در یادداشت', en: 'Save to Notes' },
  meetingSaved: { fa: 'ذخیره شد', en: 'Saved' },
  meetingEmpty: { fa: 'برای شروع ضبط جلسه، دکمه بالا را بزنید.', en: 'Tap the button above to start recording.' },
  meetingEmptyHint: { fa: 'ضبط تا ۶۰ دقیقه پشتیبانی می\u200cشود.', en: 'Recording up to 60 minutes is supported.' },

  // Stats
  statsTitle: { fa: 'آمار استفاده', en: 'Usage Stats' },
  statsDesc: { fa: 'گزارش استفاده از تبدیل گفتار', en: 'Speech conversion usage report' },
  statsEntries: { fa: 'تعداد ضبط', en: 'Recordings' },
  statsDuration: { fa: 'مدت کل', en: 'Total Duration' },
  statsWords: { fa: 'تعداد کلمات', en: 'Total Words' },
  statsAvgDuration: { fa: 'میانگین مدت', en: 'Avg Duration' },
  statsEngineBreakdown: { fa: 'توزیع موتور تبدیل', en: 'Engine Breakdown' },
  statsEmpty: { fa: 'هنوز داده\u200cای ثبت نشده است.', en: 'No data recorded yet.' },
  statsEmptyHint: { fa: 'پس از اولین ضبط، آمار اینجا نمایش داده می\u200cشود.', en: 'Stats will appear after your first recording.' },

  // Text Tools
  textToolsTitle: { fa: 'ابزارهای متنی', en: 'Text Tools' },
  textToolsDesc: { fa: 'فرمان\u200cهای صوتی، دیکشنری شخصی و اسنیپت\u200cها', en: 'Voice commands, personal dictionary, and snippets' },
  dictTab: { fa: 'دیکشنری', en: 'Dictionary' },
  snippetTab: { fa: 'اسنیپت\u200cها', en: 'Snippets' },
  voiceCommands: { fa: 'فرمان\u200cهای صوتی ویرایش', en: 'Voice Edit Commands' },
  voiceCmdDelete: { fa: 'حذف آخرین کلمه', en: 'Delete last word' },
  voiceCmdNewline: { fa: 'اضافه کردن سطر جدید', en: 'Insert new line' },
  voiceCmdClear: { fa: 'پاک\u200cسازی کامل', en: 'Clear all' },
  dictWrong: { fa: 'کلمه غلط...', en: 'Wrong word...' },
  dictCorrect: { fa: 'کلمه درست...', en: 'Correct word...' },
  dictDesc: { fa: 'کلمات غلط را به درست تبدیل کنید. اصلاح خودکار قبل از درج اعمال می\u200cشود.', en: 'Replace wrong words with correct ones. Auto-correction applied before injection.' },
  dictEmpty: { fa: 'دیکشنری خالی است.', en: 'Dictionary is empty.' },
  snippetTrigger: { fa: 'عبارت تریگر...', en: 'Trigger phrase...' },
  snippetReplacement: { fa: 'متن جایگزین...', en: 'Replacement text...' },
  snippetDesc: { fa: 'عبارت تریگر بگویید تا متن آماده درج شود.', en: 'Say the trigger phrase to insert ready text.' },
  snippetEmpty: { fa: 'هیچ اسنیپتی تعریف نشده.', en: 'No snippets defined.' },
  add: { fa: 'افزودن', en: 'Add' },

  // General
  loading: { fa: 'در حال بارگذاری...', en: 'Loading...' },
  error: { fa: 'خطا', en: 'Error' },
  cancel: { fa: 'لغو', en: 'Cancel' },
  confirm: { fa: 'تأیید', en: 'Confirm' },
  close: { fa: 'بستن', en: 'Close' },
  stop: { fa: 'توقف', en: 'Stop' },
} as const;

type Lang = 'fa' | 'en';
type StringKey = keyof typeof strings;

let currentLang: Lang = 'fa';

export function setLang(lang: Lang) {
  currentLang = lang;
}

export function t(key: StringKey): string {
  return strings[key][currentLang] || strings[key]['fa'];
}

export default strings;
