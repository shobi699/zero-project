/**
 * Persian Text Normalizer & Placeholder Utility
 * Inspired by PromptPad & optimized for Zero Studio
 */

// Arabic to Persian character map
const ARABIC_TO_PERSIAN_MAP: Record<string, string> = {
  'ي': 'ی',
  'ك': 'ک',
  'دِ': 'د',
  'بِ': 'ب',
  'زِ': 'ز',
  'ذِ': 'ذ',
  'شِ': 'ش',
  'سِ': 'س',
  'ى': 'ی',
  'ٱ': 'ا',
  'إ': 'ا',
  'أ': 'ا',
  'ؤ': 'و',
  'ئ': 'ئ',
};

// English digits to Persian digits
const EN_TO_FA_DIGITS: Record<string, string> = {
  '0': '۰',
  '1': '۱',
  '2': '۲',
  '3': '۳',
  '4': '۴',
  '5': '۵',
  '6': '۶',
  '7': '۷',
  '8': '۸',
  '9': '۹',
};

// Arabic digits to Persian digits
const AR_TO_FA_DIGITS: Record<string, string> = {
  '٠': '۰',
  '١': '۱',
  '٢': '۲',
  '٣': '۳',
  '٤': '۴',
  '٥': '۵',
  '٦': '۶',
  '٧': '۷',
  '٨': '۸',
  '٩': '۹',
};

const ZERO_WIDTH_NON_JOINER = '\u200C'; // Half-space / نیم‌فاصله

/**
 * Normalizes Persian text:
 * - Fixes Arabic characters (ی / ک)
 * - Standardizes half-spaces (می‌شود,‌ها,‌ تر,‌ ترین)
 * - Fixes spacing around punctuation
 * - Removes duplicate blank lines and trailing spaces
 */
export function normalizePersianText(text: string, options = { convertDigits: false }): string {
  if (!text) return '';

  let result = text;

  // 1. Replace Arabic letters with Persian letters
  for (const [ar, fa] of Object.entries(ARABIC_TO_PERSIAN_MAP)) {
    result = result.replaceAll(ar, fa);
  }

  // 2. Convert digits if enabled
  if (options.convertDigits) {
    for (const [en, fa] of Object.entries(EN_TO_FA_DIGITS)) {
      result = result.replaceAll(en, fa);
    }
  }
  for (const [ar, fa] of Object.entries(AR_TO_FA_DIGITS)) {
    result = result.replaceAll(ar, fa);
  }

  // 3. Fix half-spaces for "می" and "نمی" prefixes
  result = result.replace(/\b(می|نمی)\s+/g, `$1${ZERO_WIDTH_NON_JOINER}`);

  // 4. Fix half-spaces for "ها", "تر", "ترین", "ان", "ام", "ات", "اش", "ای" suffixes
  result = result.replace(/\s+(ها|تر|ترین|ام|ات|اش|ای)\b/g, `${ZERO_WIDTH_NON_JOINER}$1`);

  // 5. Fix spacing around punctuation Marks (، : . ؛ ! ؟)
  result = result.replace(/\s+([،:؛!؟\.\?])/g, '$1');
  result = result.replace(/([،:؛!؟\?])([^\s\d])/g, '$1 $2');

  // 6. Clean up duplicate blank lines (max 2 newlines)
  result = result.replace(/\n{3,}/g, '\n\n');

  // 7. Clean trailing whitespace per line
  result = result.split('\n').map(l => l.trimEnd()).join('\n');

  return result.trim();
}

export interface PlaceholderItem {
  raw: string; // e.g. "[نام]" or "{موضوع}"
  label: string; // e.g. "نام" or "موضوع"
  type: 'bracket' | 'brace';
}

/**
 * Extracts placeholders like [name] or {topic} from template text
 */
export function extractPlaceholders(text: string): PlaceholderItem[] {
  if (!text) return [];

  // Match [placeholder] or {placeholder}
  const PLACEHOLDER_RE = /\[[^\[\]\r\n]+\]|\{[^{}\r\n]+\}/g;
  const matches = text.match(PLACEHOLDER_RE) || [];

  const seen = new Set<string>();
  const items: PlaceholderItem[] = [];

  for (const match of matches) {
    if (seen.has(match)) continue;
    seen.add(match);

    const isBracket = match.startsWith('[');
    const label = match.slice(1, -1).trim();

    // Ignore markdown links [label](url)
    if (label && !label.startsWith('http')) {
      items.push({
        raw: match,
        label,
        type: isBracket ? 'bracket' : 'brace',
      });
    }
  }

  return items;
}

/**
 * Replaces placeholders in text with provided values
 */
export function fillPlaceholders(templateText: string, values: Record<string, string>): string {
  let filled = templateText;
  for (const [raw, value] of Object.entries(values)) {
    if (value && value.trim()) {
      filled = filled.replaceAll(raw, value.trim());
    }
  }
  return filled;
}
