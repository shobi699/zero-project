use std::path::Path;

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::{Context, Result};
use rand::RngCore;
use tracing::info;

use windows::Win32::Foundation::{LocalFree, HLOCAL};
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
};

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

            // Try DPAPI decryption first (new format — not 32 bytes)
            if bytes.len() != 32 {
                match dpapi_unprotect(&bytes) {
                    Ok(plaintext) if plaintext.len() == 32 => {
                        info!("loaded DPAPI-protected audio key");
                        let mut key = [0u8; 32];
                        key.copy_from_slice(&plaintext);
                        key
                    }
                    _ => {
                        anyhow::bail!("corrupt key file: expected 32 bytes or DPAPI blob, got {}", bytes.len());
                    }
                }
            } else {
                // Plain 32-byte key — migrate to DPAPI
                info!("migrating plain-text audio key to DPAPI");
                let mut key = [0u8; 32];
                key.copy_from_slice(&bytes);
                let protected = dpapi_protect(&key)?;
                std::fs::write(&key_path, protected)?;
                key
            }
        } else {
            // Generate new key and protect with DPAPI
            let mut key = [0u8; 32];
            OsRng.fill_bytes(&mut key);
            std::fs::create_dir_all(data_dir)?;
            let protected = dpapi_protect(&key)?;
            std::fs::write(&key_path, protected).context("writing DPAPI-protected key file")?;
            info!("created new DPAPI-protected audio key");
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

/// Encrypt data using Windows DPAPI (bound to current Windows user account)
fn dpapi_protect(plaintext: &[u8]) -> Result<Vec<u8>> {
    unsafe {
        let input = CRYPT_INTEGER_BLOB {
            cbData: plaintext.len() as u32,
            pbData: plaintext.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();

        CryptProtectData(
            &input,
            None,
            None,
            None,
            None,
            0, // CRYPTPROTECT_UI_FORBIDDEN | user scope
            &mut output,
        )?;

        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(HLOCAL(output.pbData as *mut _));
        Ok(result)
    }
}

/// Decrypt data using Windows DPAPI
fn dpapi_unprotect(ciphertext: &[u8]) -> Result<Vec<u8>> {
    unsafe {
        let input = CRYPT_INTEGER_BLOB {
            cbData: ciphertext.len() as u32,
            pbData: ciphertext.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();

        CryptUnprotectData(
            &input,
            None,
            None,
            None,
            None,
            0, // CRYPTPROTECT_UI_FORBIDDEN
            &mut output,
        )?;

        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(HLOCAL(output.pbData as *mut _));
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dpapi_roundtrip() {
        let data = b"hello dpapi world";
        let protected = dpapi_protect(data).expect("dpapi_protect failed");
        assert_ne!(protected, data.to_vec());
        let decrypted = dpapi_unprotect(&protected).expect("dpapi_unprotect failed");
        assert_eq!(decrypted, data.to_vec());
    }

    #[test]
    fn test_dpapi_32_byte_key() {
        let key = [42u8; 32];
        let protected = dpapi_protect(&key).expect("dpapi_protect failed");
        let decrypted = dpapi_unprotect(&protected).expect("dpapi_unprotect failed");
        assert_eq!(decrypted.len(), 32);
        assert_eq!(decrypted, key.to_vec());
    }
}
