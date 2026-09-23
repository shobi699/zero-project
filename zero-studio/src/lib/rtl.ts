/**
 * RTL (Right-to-Left) utilities for text direction in Zero Studio.
 * Derived & enhanced from Handy-main RTL handling.
 */

export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageInfo> = {
  fa: { code: 'fa', name: 'Persian', nativeName: 'فارسی', direction: 'rtl' },
  en: { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
};

/**
 * Check if a language code is RTL (Right-to-Left)
 */
export const isRTLLanguage = (langCode: string): boolean => {
  if (!langCode) return true; // Persian default
  const code = langCode.split('-')[0].toLowerCase();
  const lang = SUPPORTED_LANGUAGES[code];
  if (lang) {
    return lang.direction === 'rtl';
  }
  return code === 'fa' || code === 'ar' || code === 'he' || code === 'ur';
};

/**
 * Get the text direction ('ltr' or 'rtl') for a language
 */
export const getLanguageDirection = (langCode: string): 'ltr' | 'rtl' => {
  return isRTLLanguage(langCode) ? 'rtl' : 'ltr';
};

/**
 * Update the HTML document's dir attribute
 */
export const updateDocumentDirection = (dir: 'ltr' | 'rtl'): void => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('dir', dir);
  }
};

/**
 * Update the HTML document's lang attribute
 */
export const updateDocumentLanguage = (lang: string): void => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', lang);
  }
};

/**
 * Initialize RTL support for the application document
 */
export const initializeRTL = (langCode: string = 'fa'): void => {
  const dir = getLanguageDirection(langCode);
  updateDocumentDirection(dir);
  updateDocumentLanguage(langCode);
};
