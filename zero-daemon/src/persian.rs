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
}
