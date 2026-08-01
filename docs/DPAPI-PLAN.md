# DPAPI Encryption — Upgrade Plan

## Current State

The encryption key for audio temp files is stored as a plain file at `%LOCALAPPDATA%\Zero\audio.key`. This is functional but not ideal for production.

## Target State

Use Windows DPAPI (Data Protection API) to encrypt the key file, binding it to the Windows user account. This ensures:
- Key cannot be read by other users on the same machine
- Key is automatically decrypted when the same user runs the daemon
- No master password required — tied to Windows login

## Implementation

### Phase: Hardening (deferred)

```rust
// In crypto.rs — replace plain file with DPAPI
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, DATA_BLOB,
};

fn dpapi_protect(plaintext: &[u8]) -> Vec<u8> {
    unsafe {
        let mut input = DATA_BLOB {
            cbData: plaintext.len() as u32,
            pbData: plaintext.as_ptr() as *mut u8,
        };
        let mut output = DATA_BLOB::default();
        CryptProtectData(&mut input, None, None, None, None, 0, &mut output);
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        windows::Win32::System::Memory::LocalFree(output.pbData as *mut _);
        result
    }
}

fn dpapi_unprotect(ciphertext: &[u8]) -> Vec<u8> {
    unsafe {
        let mut input = DATA_BLOB {
            cbData: ciphertext.len() as u32,
            pbData: ciphertext.as_ptr() as *mut u8,
        };
        let mut output = DATA_BLOB::default();
        CryptUnprotectData(&mut input, None, None, None, None, 0, &mut output);
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        windows::Win32::System::Memory::LocalFree(output.pbData as *mut _);
        result
    }
}
```

### Migration

1. On startup, check if `audio.key` exists and is DPAPI-encrypted
2. If plain text, encrypt with DPAPI and overwrite
3. If DPAPI-encrypted, decrypt and use

### Windows Features Required

```toml
[dependencies.windows]
features = ["Win32_Security_Cryptography"]
```

## Risk

- DPAPI key is tied to Windows user — backing up the key requires backing up DPAPI master keys
- If the user changes their Windows password, DPAPI still works (key is not derived from password hash)
- This is a standard pattern used by browsers, credential managers, etc.
