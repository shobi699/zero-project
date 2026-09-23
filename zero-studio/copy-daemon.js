import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = path.resolve(__dirname, '../target/release/zero-daemon.exe');
const destDir = path.resolve(__dirname, './src-tauri/bin');
const dest = path.resolve(destDir, 'zero-daemon-x86_64-pc-windows-msvc.exe');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  console.log('Copied zero-daemon sidecar to ' + dest);
} else {
  console.warn('Warning: zero-daemon.exe not found at ' + src);
}
