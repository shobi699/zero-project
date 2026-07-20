use std::path::Path;

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::{Context, Result};
use rand::RngCore;

const NONCE_LEN: usize = 12;

#[derive(Clone)]
pub struct AudioCrypto {
    cipher: Aes256Gcm,
}

impl AudioCrypto {
    pub fn load_or_create(data_dir: &Path) -> Result<Self> {
        let key_path = data_dir.join("audio.key");
        let key = if key_path.exists() {
            let bytes = std::fs::read(&key_path).context("reading key file")?;
            let mut key = [0u8; 32];
            if bytes.len() != 32 {
                anyhow::bail!("corrupt key file");
            }
            key.copy_from_slice(&bytes);
            key
        } else {
            let mut key = [0u8; 32];
            OsRng.fill_bytes(&mut key);
            std::fs::create_dir_all(data_dir)?;
            std::fs::write(&key_path, key).context("writing key file")?;
            key
        };
        let cipher = Aes256Gcm::new_from_slice(&key).context("creating cipher")?;
        Ok(Self { cipher })
    }

    pub fn encrypt_chunk(&self, plaintext: &[u8]) -> Result<Vec<u8>> {
        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = self
            .cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| anyhow::anyhow!("encryption failed: {}", e))?;

        let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&ciphertext);
        Ok(out)
    }

    pub fn decrypt_chunk(&self, data: &[u8]) -> Result<Vec<u8>> {
        if data.len() < NONCE_LEN {
            anyhow::bail!("encrypted chunk too short");
        }
        let nonce = Nonce::from_slice(&data[..NONCE_LEN]);
        let ciphertext = &data[NONCE_LEN..];
        self.cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| anyhow::anyhow!("decryption failed: {}", e))
    }
}
