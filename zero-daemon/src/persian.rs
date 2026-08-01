pub fn normalize_persian_text(text: &str) -> String {
    let mut normalized = text.to_string();

    // 1. Correct Arabic letters to Persian (kheh/yeh)
    normalized = normalized.replace('ي', "ی");
    normalized = normalized.replace('ك', "ک");

    // 2. Map spoken punctuation marks to characters
    normalized = normalized.replace(" علامت سوال", "؟");
    normalized = normalized.replace(" علامت تعجب", "!");
    normalized = normalized.replace(" ویرگول", "،");
    normalized = normalized.replace(" دونقطه", ":");
    normalized = normalized.replace(" دو نقطه", ":");
    normalized = normalized.replace(" نقطه", ".");

    // 3. Half-spacing (نیم‌فاصله) rules
    // Prefixes (می, نمی)
    normalized = normalized.replace(" می ", " می‌");
    normalized = normalized.replace(" نمی ", " نمی‌");
    if normalized.starts_with("می ") {
        normalized = normalized.replacen("می ", "می‌", 1);
    }
    if normalized.starts_with("نمی ") {
        normalized = normalized.replacen("نمی ", "نمی‌", 1);
    }

    // Suffixes (ها, های, تر, ترین, تری, ام, ات, اش, مان, تان, شان)
    normalized = normalized.replace(" ها ", "‌ها ");
    normalized = normalized.replace(" های ", "‌های ");
    normalized = normalized.replace(" تر ", "‌تر ");
    normalized = normalized.replace(" تری ", "‌تری ");
    normalized = normalized.replace(" ترین ", "‌ترین ");
    
    if normalized.ends_with(" ها") {
        normalized = normalized.replace(" ها", "‌ها");
    }
    if normalized.ends_with(" های") {
        normalized = normalized.replace(" های", "‌های");
    }
    if normalized.ends_with(" تر") {
        normalized = normalized.replace(" تر", "‌تر");
    }
    if normalized.ends_with(" تری") {
        normalized = normalized.replace(" تری", "‌تری");
    }
    if normalized.ends_with(" ترین") {
        normalized = normalized.replace(" ترین", "‌ترین");
    }

    normalized
}

/// Apply personal dictionary replacements (word_wrong → word_correct)
pub fn apply_dictionary(text: &str, pairs: &[(String, String)]) -> String {
    let mut result = text.to_string();
    for (wrong, correct) in pairs {
        // Replace whole-word matches only (with word boundaries)
        let pattern = format!(" {} ", wrong);
        let replacement = format!(" {} ", correct);
        result = result.replace(&pattern, &replacement);

        // Also handle start and end of text
        if result.starts_with(&format!("{} ", wrong)) {
            result = result.replacen(&format!("{} ", wrong), &format!("{} ", correct), 1);
        }
        if result.ends_with(&format!(" {}", wrong)) {
            let len = result.len();
            result.truncate(len - wrong.len());
            result.push_str(correct);
        }
        // Exact match (single word)
        if result == *wrong {
            result = correct.clone();
        }
    }
    result
}

/// Check for voice snippets in text and return replacement if found.
/// Snippets are triggered by exact phrase match at the end of text.
pub fn check_snippets(text: &str, pairs: &[(String, String)]) -> Option<String> {
    for (trigger, replacement) in pairs {
        if text.trim().ends_with(trigger.as_str()) {
            // Remove the trigger from the end and append the replacement
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
/// Commands operate on the pre-insert text buffer.
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
        let input = "من می روم به مدرسه ها";
        let expected = "من می‌روم به مدرسه‌ها";
        assert_eq!(normalize_persian_text(input), expected);
    }

    #[test]
    fn test_dictionary_replacement() {
        let pairs = vec![
            ("غلط".to_string(), "درست".to_string()),
            (" علي ".to_string(), " علی ".to_string()),
        ];
        assert_eq!(apply_dictionary("این غلط است", &pairs), "این درست است");
        assert_eq!(apply_dictionary("سلام", &pairs), "سلام");
    }

    #[test]
    fn test_snippet_detection() {
        let pairs = vec![
            ("امضای من".to_string(), "با احترام، علی".to_string()),
            ("خداحافظ".to_string(), "روز خوبی داشته باشید".to_string()),
        ];
        assert_eq!(check_snippets("امضای من", &pairs), Some("با احترام، علی".to_string()));
        assert_eq!(check_snippets("سلام دنیا", &pairs), None);
        assert_eq!(check_snippets("خداحافظ", &pairs), Some("روز خوبی داشته باشید".to_string()));
    }

    #[test]
    fn test_voice_command_delete_last_word() {
        assert_eq!(apply_voice_commands("سلام دنیا پاکش کن"), Some("سلام".to_string()));
        assert_eq!(apply_voice_commands("تک کلمه پاکش کن"), Some("تک".to_string()));
        assert_eq!(apply_voice_commands("تک پاکش کن"), Some("".to_string()));
        assert_eq!(apply_voice_commands("بدون دستور"), None);
    }

    #[test]
    fn test_voice_command_newline() {
        assert_eq!(apply_voice_commands("متن اول خط جدید"), Some("متن اول\n".to_string()));
    }

    #[test]
    fn test_voice_command_clear_all() {
        assert_eq!(apply_voice_commands("هر چیزی همه‌اش را پاک کن"), Some("".to_string()));
        assert_eq!(apply_voice_commands("متنی که باید پاک شود همه اش را پاک کن"), Some("".to_string()));
    }
}
