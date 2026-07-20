use anyhow::{Context, Result};
use arboard::Clipboard;

pub fn set_clipboard_text(text: &str) -> Result<()> {
    let mut cb = Clipboard::new().context("opening clipboard")?;
    cb.set_text(text).context("setting clipboard text")?;
    Ok(())
}
