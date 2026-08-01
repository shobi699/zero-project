use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use anyhow::{Context, Result};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::data_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

static DB: OnceLock<Arc<Mutex<rusqlite::Connection>>> = OnceLock::new();

fn db_path() -> PathBuf {
    data_dir().join("notes.db")
}

pub fn init_db() -> Result<()> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let conn = rusqlite::Connection::open(&path)
        .with_context(|| format!("failed to open notes db at {}", path.display()))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '[]',
            pinned INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            title, body, tags,
            content='notes',
            content_rowid='rowid'
        );

        -- Triggers to keep FTS in sync
        CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
            INSERT INTO notes_fts(rowid, title, body, tags)
            VALUES (new.rowid, new.title, new.body, new.tags);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, title, body, tags)
            VALUES ('delete', old.rowid, old.title, old.body, old.tags);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, title, body, tags)
            VALUES ('delete', old.rowid, old.title, old.body, old.tags);
            INSERT INTO notes_fts(rowid, title, body, tags)
            VALUES (new.rowid, new.title, new.body, new.tags);
        END;

        -- Personal dictionary: word_wrong → word_correct
        CREATE TABLE IF NOT EXISTS dictionary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wrong TEXT NOT NULL UNIQUE,
            correct TEXT NOT NULL
        );

        -- Voice snippets: trigger phrase → ready text
        CREATE TABLE IF NOT EXISTS snippets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trigger_text TEXT NOT NULL UNIQUE,
            replacement TEXT NOT NULL
        );"
    )?;

    let _ = DB.set(Arc::new(Mutex::new(conn)));
    info!("notes database initialized at {}", path.display());
    Ok(())
}

fn with_db<F, T>(f: F) -> Result<T>
where
    F: FnOnce(&rusqlite::Connection) -> Result<T>,
{
    let db = DB.get().context("notes database not initialized")?;
    let conn = db.lock().map_err(|e| anyhow::anyhow!("db lock poisoned: {}", e))?;
    f(&conn)
}

pub fn create_note(title: &str, body: &str, tags: &[String]) -> Result<Note> {
    let now = chrono_now();
    let id = format!("note_{}", now.replace(['/', ':', ' '], ""));
    let tags_json = serde_json::to_string(tags)?;

    with_db(|conn| {
        conn.execute(
            "INSERT INTO notes (id, title, body, tags, pinned, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)",
            params![id, title, body, tags_json, now, now],
        )?;

        Ok(Note {
            id,
            title: title.to_string(),
            body: body.to_string(),
            tags: tags.to_vec(),
            pinned: false,
            created_at: now.clone(),
            updated_at: now,
        })
    })
}

pub fn get_all_notes() -> Result<Vec<Note>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, title, body, tags, pinned, created_at, updated_at
             FROM notes ORDER BY pinned DESC, updated_at DESC"
        )?;

        let notes = stmt.query_map([], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                tags,
                pinned: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(notes)
    })
}

pub fn get_note(id: &str) -> Result<Option<Note>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, title, body, tags, pinned, created_at, updated_at
             FROM notes WHERE id = ?1"
        )?;

        let mut rows = stmt.query_map(params![id], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                tags,
                pinned: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;

        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    })
}

pub fn update_note(id: &str, title: &str, body: &str, tags: &[String]) -> Result<()> {
    let now = chrono_now();
    let tags_json = serde_json::to_string(tags)?;

    with_db(|conn| {
        conn.execute(
            "UPDATE notes SET title = ?1, body = ?2, tags = ?3, updated_at = ?4
             WHERE id = ?5",
            params![title, body, tags_json, now, id],
        )?;
        Ok(())
    })
}

pub fn pin_note(id: &str, pinned: bool) -> Result<()> {
    with_db(|conn| {
        conn.execute(
            "UPDATE notes SET pinned = ?1, updated_at = ?2 WHERE id = ?3",
            params![pinned as i32, chrono_now(), id],
        )?;
        Ok(())
    })
}

pub fn delete_note(id: &str) -> Result<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
        Ok(())
    })
}

pub fn search_notes(query: &str) -> Result<Vec<Note>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT n.id, n.title, n.body, n.tags, n.pinned, n.created_at, n.updated_at
             FROM notes n
             JOIN notes_fts f ON n.rowid = f.rowid
             WHERE notes_fts MATCH ?1
             ORDER BY n.pinned DESC, n.updated_at DESC"
        )?;

        let notes = stmt.query_map(params![query], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                tags,
                pinned: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(notes)
    })
}

fn chrono_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{:04}/{:02}/{:02} {:02}:{:02}:{:02}",
        1400 + (now / 31536000) % 100,
        (now / 2592000) % 12 + 1,
        (now / 86400) % 30 + 1,
        (now / 3600) % 24,
        (now / 60) % 60,
        now % 60,
    )
}

// ===== Dictionary =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictEntry {
    pub id: i64,
    pub wrong: String,
    pub correct: String,
}

pub fn get_all_dict_entries() -> Result<Vec<DictEntry>> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT id, wrong, correct FROM dictionary ORDER BY id")?;
        let entries = stmt.query_map([], |row| {
            Ok(DictEntry {
                id: row.get(0)?,
                wrong: row.get(1)?,
                correct: row.get(2)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(entries)
    })
}

pub fn add_dict_entry(wrong: &str, correct: &str) -> Result<()> {
    with_db(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO dictionary (wrong, correct) VALUES (?1, ?2)",
            params![wrong, correct],
        )?;
        Ok(())
    })
}

pub fn remove_dict_entry(id: i64) -> Result<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM dictionary WHERE id = ?1", params![id])?;
        Ok(())
    })
}

/// Get all dictionary entries as a Vec of (wrong, correct) for pipeline use
pub fn get_dict_pairs() -> Result<Vec<(String, String)>> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT wrong, correct FROM dictionary")?;
        let pairs = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(pairs)
    })
}

// ===== Snippets =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: i64,
    pub trigger_text: String,
    pub replacement: String,
}

pub fn get_all_snippets() -> Result<Vec<Snippet>> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT id, trigger_text, replacement FROM snippets ORDER BY id")?;
        let snippets = stmt.query_map([], |row| {
            Ok(Snippet {
                id: row.get(0)?,
                trigger_text: row.get(1)?,
                replacement: row.get(2)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(snippets)
    })
}

pub fn add_snippet(trigger_text: &str, replacement: &str) -> Result<()> {
    with_db(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO snippets (trigger_text, replacement) VALUES (?1, ?2)",
            params![trigger_text, replacement],
        )?;
        Ok(())
    })
}

pub fn remove_snippet(id: i64) -> Result<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM snippets WHERE id = ?1", params![id])?;
        Ok(())
    })
}

/// Get all snippet trigger→replacement pairs for pipeline use
pub fn get_snippet_pairs() -> Result<Vec<(String, String)>> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT trigger_text, replacement FROM snippets")?;
        let pairs = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?.collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(pairs)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() {
        let _ = std::fs::remove_file("test_notes.db");
        // Each test gets a fresh in-memory DB
    }

    #[test]
    fn test_create_and_get_note() {
        test_db();
        // Initialize with in-memory DB for testing
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY, title TEXT, body TEXT, tags TEXT,
                pinned INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT
            );"
        ).unwrap();

        let now = "1404/01/01 00:00:00";
        conn.execute(
            "INSERT INTO notes (id, title, body, tags, pinned, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)",
            params!["test1", "Title", "Body", "[]", now, now],
        ).unwrap();

        let title: String = conn.query_row(
            "SELECT title FROM notes WHERE id = ?1", params!["test1"], |r| r.get(0)
        ).unwrap();

        assert_eq!(title, "Title");
    }

    #[test]
    fn test_persian_text_in_notes() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY, title TEXT, body TEXT, tags TEXT,
                pinned INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT
            );"
        ).unwrap();

        let now = "1404/01/01 00:00:00";
        let body = "متن فارسی با نیم\u{200C}فاصله و حروف ی و ک";
        conn.execute(
            "INSERT INTO notes (id, title, body, tags, pinned, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)",
            params!["test2", "فارسی", body, "[\"تگ\"]", now, now],
        ).unwrap();

        let result: String = conn.query_row(
            "SELECT body FROM notes WHERE id = ?1", params!["test2"], |r| r.get(0)
        ).unwrap();

        assert_eq!(result, body);
        assert!(result.contains('\u{200C}'));
    }
}
