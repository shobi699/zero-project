# Code Signing — Zero Release Pipeline

## Overview

Code signing is **mandatory** from the first public release. Without it, SmartScreen blocks the installer and erodes user trust.

## Requirements

| Item | Value |
|------|-------|
| Certificate | EV Code Signing (for SmartScreen reputation) |
| Provider | DigiCert, Sectigo, or SSL.com |
| Cost | ~$200–400/year for EV |
| Key storage | HSM or cloud HSM (Azure Key Vault, AWS CloudHSM) |

## Windows Signing (NSIS Installer)

### Step 1: Obtain Certificate

1. Purchase EV Code Signing certificate from a CA
2. Complete Organization Validation (OV) — takes 1–3 business days
3. Receive certificate on USB token or upload to cloud HSM

### Step 2: Sign the Installer

```powershell
# Sign the NSIS installer after `tauri build`
signtool sign /f zero.pfx /p <password> /tr http://timestamp.digicert.com /td sha256 /fd sha256 zero-studio-setup.exe

# Or with Azure Key Vault
az keyvault certificate download --vault-name zero-signing --name code-signing --file zero.cer
signtool sign /sha1 <thumbprint> /tr http://timestamp.digicert.com /td sha256 /fd sha256 zero-studio-setup.exe
```

### Step 3: Verify

```powershell
signtool verify /pa zero-studio-setup.exe
```

## Tauri Integration

Tauri supports code signing via `tauri.conf.json`:

```json
{
  "bundle": {
    "windows": {
      "nsis": {
        "signCommand": "signtool sign /f {{certificate}} /p {{password}} /tr http://timestamp.digicert.com /td sha256 /fd sha256 {{path}}"
      }
    }
  }
}
```

Environment variables for CI:
- `WINDOWS_CERTIFICATE` — path to .pfx file
- `WINDOWS_CERTIFICATE_PASSWORD` — password

## CI Pipeline

In `.github/workflows/ci.yml`:

```yaml
- name: Sign Windows installer
  if: startsWith(github.ref, 'refs/tags/')
  env:
    WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
    WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
  run: |
    # tauri build with signing
    cd zero-studio && npx tauri build
```

## Notes

- EV certificates require hardware token or cloud HSM — cannot be stored as plain files
- Timestamp server is required for long-term validity
- Self-signed certificates do NOT work for SmartScreen reputation
- Start the signing process early — OV validation takes days
