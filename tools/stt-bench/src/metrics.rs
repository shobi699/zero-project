pub fn word_error_rate(reference: &str, hypothesis: &str) -> f64 {
    let ref_words: Vec<&str> = reference.split_whitespace().collect();
    let hyp_words: Vec<&str> = hypothesis.split_whitespace().collect();

    if ref_words.is_empty() {
        return if hyp_words.is_empty() { 0.0 } else { 1.0 };
    }

    let distance = edit_distance(&ref_words, &hyp_words);
    (distance as f64 / ref_words.len() as f64).min(1.0)
}

pub fn char_error_rate(reference: &str, hypothesis: &str) -> f64 {
    let ref_chars: Vec<char> = reference.chars().filter(|c| !c.is_whitespace()).collect();
    let hyp_chars: Vec<char> = hypothesis.chars().filter(|c| !c.is_whitespace()).collect();

    if ref_chars.is_empty() {
        return if hyp_chars.is_empty() { 0.0 } else { 1.0 };
    }

    let distance = edit_distance(&ref_chars, &hyp_chars);
    (distance as f64 / ref_chars.len() as f64).min(1.0)
}

fn edit_distance<T: PartialEq>(a: &[T], b: &[T]) -> usize {
    let m = a.len();
    let n = b.len();

    let mut prev = (0..=n).collect::<Vec<_>>();
    let mut curr = vec![0; n + 1];

    for i in 1..=m {
        curr[0] = i;
        for j in 1..=n {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1)
                .min(curr[j - 1] + 1)
                .min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    prev[n]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_strings() {
        assert_eq!(word_error_rate("سلام دنیا", "سلام دنیا"), 0.0);
        assert_eq!(char_error_rate("سلام دنیا", "سلام دنیا"), 0.0);
    }

    #[test]
    fn completely_wrong() {
        assert_eq!(word_error_rate("سلام", "خداحافظ"), 1.0);
    }

    #[test]
    fn empty_reference() {
        assert_eq!(word_error_rate("", ""), 0.0);
        assert_eq!(word_error_rate("", "something"), 1.0);
    }

    #[test]
    fn partial_match() {
        let wer = word_error_rate("یک دو سه چهار", "یک دو پنج چهار");
        assert!((wer - 0.25).abs() < 0.01);
    }

    #[test]
    fn insertion_error() {
        let wer = word_error_rate("سلام دنیا", "سلام خوب دنیا");
        assert!((wer - 0.5).abs() < 0.01);
    }

    #[test]
    fn deletion_error() {
        let wer = word_error_rate("سلام خوب دنیا", "سلام دنیا");
        assert!((wer - 0.333).abs() < 0.01);
    }
}
