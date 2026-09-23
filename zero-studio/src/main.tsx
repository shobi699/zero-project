import React from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App'
import InteractivePreview from './components/InteractivePreview'
import './utils/browserPolyfill'
import './index.css'

let windowLabel = 'main';
try {
  windowLabel = getCurrentWindow().label;
} catch {
  // Fallback for non-Tauri webview environments
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {windowLabel === 'preview' ? <InteractivePreview /> : <App />}
  </React.StrictMode>,
)
