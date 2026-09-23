use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use anyhow::{Context, Result};
use tracing::info;

use crate::crypto::AudioCrypto;

pub struct TempBuffer {
    path: PathBuf,
    file: fs::File,
    crypto: AudioCrypto,
}

impl TempBuffer {
    pub fn create(tmp_dir: &Path, crypto: AudioCrypto) -> Result<Self> {
        fs::create_dir_all(tmp_dir)?;
        let ts = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let path = tmp_dir.join(format!("rec_{}.enc", ts));
        let file = fs::File::create(&path).context("creating temp buffer file")?;
        info!(path = %path.display(), "temp buffer created");
        Ok(Self {
            path,
            file,
            crypto,
        })
    }

    pub fn write_chunk(&mut self, pcm_bytes: &[u8]) -> Result<()> {
        let encrypted = self.crypto.encrypt_chunk(pcm_bytes)?;
        let len = (encrypted.len() as u32).to_le_bytes();
        self.file.write_all(&len)?;
        self.file.write_all(&encrypted)?;
        Ok(())
    }

    pub fn finish(self) -> PathBuf {
        drop(self.file);
        self.path
    }

    #[allow(dead_code)]
    pub fn delete(self) -> Result<()> {
        let path = self.finish();
        fs::remove_file(&path).context("deleting temp buffer")?;
        info!(path = %path.display(), "temp buffer deleted");
        Ok(())
    }
}

pub fn recover_temp_files(tmp_dir: &Path, crypto: &AudioCrypto) -> Vec<(PathBuf, Vec<u8>)> {
    let mut recovered = Vec::new();

    let entries = match fs::read_dir(tmp_dir) {
        Ok(e) => e,
        Err(_) => return recovered,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "enc") {
            continue;
        }

        let mut is_stale = false;
        if let Ok(metadata) = entry.metadata() {
            if let Ok(modified) = metadata.modified() {
                if let Ok(elapsed) = modified.elapsed() {
                    if elapsed.as_secs() > 24 * 3600 {
                        is_stale = true;
                    }
                }
            }
        }

        if is_stale {
            tracing::warn!(path = %path.display(), "deleting stale temp file older than 24h");
            let _ = fs::remove_file(&path);
            continue;
        }

        match read_encrypted_file(&path, crypto) {
            Ok(pcm) => {
                info!(path = %path.display(), bytes = pcm.len(), "recovered temp file");
                recovered.push((path, pcm));
            }
            Err(e) => {
                tracing::warn!(path = %path.display(), error = %e, "deleting corrupted temp file");
                let _ = fs::remove_file(&path);
            }
        }
    }

    recovered
}

fn read_encrypted_file(path: &Path, crypto: &AudioCrypto) -> Result<Vec<u8>> {
    let data = fs::read(path)?;
    let mut pcm = Vec::new();
    let mut offset = 0;

    while offset + 4 <= data.len() {
        let len =
            u32::from_le_bytes(data[offset..offset + 4].try_into().unwrap()) as usize;
        offset += 4;

        if offset + len > data.len() {
            break;
        }

        let chunk = crypto.decrypt_chunk(&data[offset..offset + len])?;
        pcm.extend_from_slice(&chunk);
        offset += len;
    }

    Ok(pcm)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_recover_corrupted_file_deletes_it() {
        let dir = tempdir().unwrap();
        let crypto = AudioCrypto::load_or_create(dir.path()).unwrap();
        
        let file_path = dir.path().join("corrupted.enc");
        // write a 4-byte length (e.g. 16) followed by 16 bytes of garbage
        let mut data = vec![16, 0, 0, 0];
        data.extend_from_slice(&[0u8; 16]);
        fs::write(&file_path, &data).unwrap();
        
        assert!(file_path.exists());
        
        let recovered = recover_temp_files(dir.path(), &crypto);
        
        assert!(recovered.is_empty());
        assert!(!file_path.exists(), "Corrupted file should have been deleted");
    }
}
