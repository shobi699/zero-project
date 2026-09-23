use std::sync::LazyLock;
use regex::Regex;

static RE_ARABIC_YEH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"ي").unwrap());
static RE_ARABIC_KAF: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"ك").unwrap());

static RE_PUNCTUATION: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    vec![
        (Regex::new(r" علامت سوال").unwrap(), "؟"),
        (Regex::new(r" علامت تعجب").unwrap(), "!"),
        (Regex::new(r" ویرگول").unwrap(), "،"),
        (Regex::new(r" دونقطه").unwrap(), ":"),
        (Regex::new(r" دو نقطه").unwrap(), ":"),
        (Regex::new(r" نقطه").unwrap(), "."),
        (Regex::new(r" پرانتز باز").unwrap(), " ("),
        (Regex::new(r" پرانتز بسته").unwrap(), ") "),
        (Regex::new(r" ،").unwrap(), "،"),
        (Regex::new(r" \.").unwrap(), "."),
        (Regex::new(r" ؟").unwrap(), "؟"),
    ]
});

static RE_PREFIXES: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    vec![
        (Regex::new(r"(^|\s)می\s+").unwrap(), "${1}می‌"),
        (Regex::new(r"(^|\s)نمی\s+").unwrap(), "${1}نمی‌"),
        (Regex::new(r"(^|\s)بی\s+").unwrap(), "${1}بی‌"),
    ]
});

static RE_SUFFIXES: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    vec![
        (Regex::new(r"\s+ها(\s|$)").unwrap(), "‌ها${1}"),
        (Regex::new(r"\s+های(\s|$)").unwrap(), "‌های${1}"),
        (Regex::new(r"\s+تر(\s|$)").unwrap(), "‌تر${1}"),
        (Regex::new(r"\s+تری(\s|$)").unwrap(), "‌تری${1}"),
        (Regex::new(r"\s+ترین(\s|$)").unwrap(), "‌ترین${1}"),
        (Regex::new(r"\s+شناسی(\s|$)").unwrap(), "شناسی${1}"),
        (Regex::new(r"\s+مند(\s|$)").unwrap(), "‌مند${1}"),
        (Regex::new(r"\s+گر(\s|$)").unwrap(), "‌گر${1}"),
    ]
});

pub fn normalize_persian_text(text: &str) -> String {
    let mut normalized = RE_ARABIC_YEH.replace_all(text, "ی").to_string();
    normalized = RE_ARABIC_KAF.replace_all(&normalized, "ک").to_string();

    for (re, repl) in RE_PUNCTUATION.iter() {
        normalized = re.replace_all(&normalized, *repl).to_string();
    }

    for (re, repl) in RE_PREFIXES.iter() {
        normalized = re.replace_all(&normalized, *repl).to_string();
    }

    for (re, repl) in RE_SUFFIXES.iter() {
        normalized = re.replace_all(&normalized, *repl).to_string();
    }

    normalized
}

/// Pre-populated Persian tech vocabulary replacements
pub fn get_default_persian_dictionary() -> Vec<(String, String)> {
    vec![
        ("پایتون".to_string(), "Python".to_string()),
        ("ری اکت".to_string(), "React".to_string()),
        ("ری‌اکت".to_string(), "React".to_string()),
        ("توری".to_string(), "Tauri".to_string()),
        ("تایپ اسکریپت".to_string(), "TypeScript".to_string()),
        ("تایپ‌اسکریپت".to_string(), "TypeScript".to_string()),
        ("جاوا اسکریپت".to_string(), "JavaScript".to_string()),
        ("جاوااسکریپت".to_string(), "JavaScript".to_string()),
        ("ای پی ای".to_string(), "API".to_string()),
        ("ای‌پی‌آی".to_string(), "API".to_string()),
        ("گیت هاب".to_string(), "GitHub".to_string()),
        ("گیت‌هاب".to_string(), "GitHub".to_string()),
        ("دیتابیس".to_string(), "Database".to_string()),
        ("وسکو".to_string(), "VS Code".to_string()),
        ("وی اس کد".to_string(), "VS Code".to_string()),
        ("نود جی اس".to_string(), "Node.js".to_string()),
        ("نودجی‌اس".to_string(), "Node.js".to_string()),
        ("فرانت اند".to_string(), "Frontend".to_string()),
        ("فرانت‌اند".to_string(), "Frontend".to_string()),
        ("بک اند".to_string(), "Backend".to_string()),
        ("بک‌اند".to_string(), "Backend".to_string()),
    ]
}


/// Apply personal dictionary replacements (word_wrong → word_correct)
pub fn apply_dictionary(text: &str, pairs: &[(String, String)]) -> String {
    let mut result = text.to_string();

    // Combine user dictionary with tech vocabulary
    let default_dict = get_default_persian_dictionary();
    let combined_pairs: Vec<(&str, &str)> = pairs
        .iter()
        .map(|(w, c)| (w.as_str(), c.as_str()))
        .chain(default_dict.iter().map(|(w, c)| (w.as_str(), c.as_str())))
        .collect();

    for (wrong, correct) in combined_pairs {
        // Replace whole-word matches only
        let pattern = format!(" {} ", wrong);
        let replacement = format!(" {} ", correct);
        result = result.replace(&pattern, &replacement);

        if result.starts_with(&format!("{} ", wrong)) {
            result = result.replacen(&format!("{} ", wrong), &format!("{} ", correct), 1);
        }
        if result.ends_with(&format!(" {}", wrong)) {
            let len = result.len();
            result.truncate(len - wrong.len());
            result.push_str(correct);
        }
        if result == wrong {
            result = correct.to_string();
        }
    }
    result
}

/// Check for voice snippets in text and return replacement if found.
pub fn check_snippets(text: &str, pairs: &[(String, String)]) -> Option<String> {
    for (trigger, replacement) in pairs {
        if text.trim().ends_with(trigger.as_str()) {
            let prefix = text.trim_end_matches(trigger.as_str()).trim();
            if prefix.is_empty() {
                return Some(replacement.clone());
            }
            return Some(format!("{} {}", prefix, replacement));
        }
    }
    None
}

/// Voice edit commands — returns the edited text or None if no command matched.
pub fn apply_voice_commands(text: &str) -> Option<String> {
    let trimmed = text.trim();

    // "پاکش کن" — delete last word
    if trimmed.ends_with("پاکش کن") || trimmed.ends_with("پاکش کن.") {
        let prefix = trimmed.trim_end_matches("پاکش کن").trim_end_matches("پاکش کن.").trim();
        let words: Vec<&str> = prefix.split_whitespace().collect();
        if words.len() > 1 {
            return Some(words[..words.len() - 1].join(" "));
        }
        return Some(String::new());
    }

    // "خط جدید" — insert newline
    if trimmed.ends_with("خط جدید") || trimmed.ends_with("خط جدید.") {
        let prefix = trimmed.trim_end_matches("خط جدید").trim_end_matches("خط جدید.").trim();
        return Some(format!("{}\n", prefix));
    }

    // "همه‌اش را پاک کن" — clear all
    if trimmed.contains("همه‌اش را پاک کن") || trimmed.contains("همه اش را پاک کن") {
        return Some(String::new());
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_arabic_conversion() {
        let input = "علي كافي است";
        let expected = "علی کافی است";
        assert_eq!(normalize_persian_text(input), expected);
    }

    #[test]
    fn test_punctuation_mapping() {
        let input = "چطور هستید علامت سوال فردا می‌آیم نقطه";
        let expected = "چطور هستید؟ فردا می‌آیم.";
        assert_eq!(normalize_persian_text(input), expected);
    }

    #[test]
    fn test_half_spacing() {
        let input = "من می روم به مدرسه ها و بی نظیر";
        let expected = "من می‌روم به مدرسه‌ها و بی‌نظیر";
        assert_eq!(normalize_persian_text(input), expected);
    }

    #[test]
    fn test_dictionary_tech_replacement() {
        let pairs = vec![];
        assert_eq!(apply_dictionary("کد با پایتون نوشته شد", &pairs), "کد با Python نوشته شد");
    }

    #[test]
    fn test_voice_command_delete_last_word() {
        assert_eq!(apply_voice_commands("سلام دنیا پاکش کن"), Some("سلام".to_string()));
    }
}
