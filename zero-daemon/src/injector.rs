use std::sync::Arc;
use std::collections::VecDeque;
use anyhow::{Context, Result};
use async_trait::async_trait;
use tokio::sync::{Mutex, oneshot};
use tracing::{info, warn, error};

use windows::core::{Interface, BSTR};
use windows::Win32::Foundation::{CloseHandle, HWND};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationValuePattern,
    UIA_TextPatternId, UIA_ValuePatternId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId, IsWindow, SetForegroundWindow,
    GetWindow, GW_HWNDNEXT, IsWindowVisible,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_UNICODE, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    KEYBD_EVENT_FLAGS,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum InjectionStrategy {
    Uia,
    SendInput,
    ClipboardPaste,
    ClipboardOnly,
}

#[derive(Clone)]
pub struct SafeElement(pub std::mem::ManuallyDrop<IUIAutomationElement>);
unsafe impl Send for SafeElement {}
unsafe impl Sync for SafeElement {}

impl Drop for SafeElement {
    fn drop(&mut self) {
        unsafe {
            // In unit tests the element is a fabricated sentinel pointer
            // (see tests below) that must never be Release()d as a real COM
            // object. Production always holds a genuine IUIAutomationElement.
            #[cfg(test)]
            {
                let raw_ptr: *mut std::ffi::c_void = std::mem::transmute_copy(&self.0);
                if raw_ptr as usize == 0x12345678 || raw_ptr as usize == 0 {
                    return;
                }
            }
            std::mem::ManuallyDrop::drop(&mut self.0);
        }
    }
}

impl SafeElement {
    pub unsafe fn set_value(&self, text: &str) -> Result<()> {
        let pattern_obj = self.0.GetCurrentPattern(UIA_ValuePatternId)?;
        let val_pattern: IUIAutomationValuePattern = pattern_obj.cast()?;
        val_pattern.SetValue(&BSTR::from(text))?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct DestinationSnapshot {
    pub hwnd: isize,
    pub process_name: String,
    pub is_editable: bool,
    pub uia_element: Option<SafeElement>,
}

impl Default for DestinationSnapshot {
    fn default() -> Self {
        Self {
            hwnd: 0,
            process_name: "unknown".to_string(),
            is_editable: false,
            uia_element: None,
        }
    }
}

// Low level traits to allow mock unit-testing
#[async_trait]
pub trait LowLevelInjector: Send + Sync {
    fn is_window_valid(&self, hwnd: isize) -> bool;
    fn get_foreground_window(&self) -> isize;
    async fn focus_window(&self, hwnd: isize) -> Result<()>;
    async fn try_uia_insert(&self, element: &Option<SafeElement>, text: &str) -> Result<()>;
    async fn try_send_input(&self, text: &str) -> Result<()>;
    async fn try_clipboard_paste(&self, text: &str) -> Result<()>;
}

// Main Injector Orchestrator
pub struct TextInjector {
    low_level: Arc<dyn LowLevelInjector>,
}

impl TextInjector {
    pub fn new(low_level: Arc<dyn LowLevelInjector>) -> Self {
        Self { low_level }
    }

    pub async fn inject(&self, text: &str, snapshot: &DestinationSnapshot) -> InjectionStrategy {
        let cfg = crate::config::get_config();
        let mut final_text = text.to_string();

        if cfg.append_trailing_space && !final_text.ends_with(' ') {
            final_text.push(' ');
        }

        info!(
            hwnd = snapshot.hwnd,
            process = %snapshot.process_name,
            editable = snapshot.is_editable,
            "starting text injection cascade"
        );

        let strategy = self.perform_injection(&final_text, snapshot).await;

        // Auto-submit key simulation if enabled in config
        if cfg.auto_submit && strategy != InjectionStrategy::ClipboardOnly {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            let is_ctrl = cfg.auto_submit_key == "ctrl_enter";
            send_auto_submit_key(is_ctrl);
        }

        strategy
    }

    async fn perform_injection(&self, text: &str, snapshot: &DestinationSnapshot) -> InjectionStrategy {
        // Cascade Strategy:
        // 1. Check window validity
        if !self.low_level.is_window_valid(snapshot.hwnd) {
            warn!("snapshot window is invalid or closed. falling back to ClipboardOnly");
            let _ = self.low_level.try_clipboard_paste(text).await;
            return InjectionStrategy::ClipboardOnly;
        }

        // 2. Ensure target window has focus FIRST before any injection attempt
        let current_fg = self.low_level.get_foreground_window();
        if current_fg != snapshot.hwnd {
            info!("restoring focus to snapshot window ({})", snapshot.hwnd);
            if let Err(e) = self.low_level.focus_window(snapshot.hwnd).await {
                warn!("failed to restore focus: {}. continuing anyway", e);
            }
        }

        // 3. Fallback to ClipboardOnly if snapshot was not editable
        if !snapshot.is_editable {
            info!("snapshot target is not editable. falling back to ClipboardOnly");
            let _ = self.low_level.try_clipboard_paste(text).await;
            return InjectionStrategy::ClipboardOnly;
        }

        // 4. Strategy 1: UI Automation
        if snapshot.uia_element.is_some() {
            match self.low_level.try_uia_insert(&snapshot.uia_element, text).await {
                Ok(_) => {
                    info!("successfully injected text via UI Automation");
                    return InjectionStrategy::Uia;
                }
                Err(e) => {
                    warn!("UI Automation injection failed: {}. falling back to SendInput", e);
                }
            }
        }

        // 5. Strategy 2: SendInput (Keyboard Simulation)
        match self.low_level.try_send_input(text).await {
            Ok(_) => {
                info!("successfully injected text via SendInput");
                return InjectionStrategy::SendInput;
            }
            Err(e) => {
                warn!("SendInput injection failed: {}. falling back to ClipboardPaste", e);
            }
        }

        // 6. Strategy 3: Clipboard + Paste
        match self.low_level.try_clipboard_paste(text).await {
            Ok(_) => {
                info!("successfully injected text via ClipboardPaste");
                InjectionStrategy::ClipboardPaste
            }
            Err(e) => {
                error!("all text injection strategies failed: {}", e);
                InjectionStrategy::ClipboardOnly
            }
        }
    }
}

// Win32 implementation of the low-level injector
pub struct Win32LowLevelInjector;

#[async_trait]
impl LowLevelInjector for Win32LowLevelInjector {
    fn is_window_valid(&self, hwnd: isize) -> bool {
        unsafe { IsWindow(HWND(hwnd)).as_bool() }
    }

    fn get_foreground_window(&self) -> isize {
        unsafe { GetForegroundWindow().0 }
    }

    async fn focus_window(&self, hwnd: isize) -> Result<()> {
        unsafe {
            let win = HWND(hwnd);
            let _ = SetForegroundWindow(win);
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            Ok(())
        }
    }

    async fn try_uia_insert(&self, element: &Option<SafeElement>, text: &str) -> Result<()> {
        let safe_el = element.as_ref().context("no UIA element provided")?.clone();
        let text = text.to_string();

        tokio::task::spawn_blocking(move || {
            // The element was marshaled from an MTA snapshot; initialize this
            // worker thread into the MTA too so the interface pointer stays
            // valid across the call. Do NOT CoUninitialize while `safe_el` is
            // still alive — that would tear down the apartment out from under it.
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }
            let res = unsafe { safe_el.set_value(&text) };
            drop(safe_el);
            unsafe {
                CoUninitialize();
            }
            res
        })
        .await?
    }

    async fn try_send_input(&self, text: &str) -> Result<()> {
        let text = text.to_string();
        tokio::task::spawn(async move {
            // Throttled typing rate: ~300 chars/s = 3ms delay per char
            let delay = tokio::time::Duration::from_millis(3);
            for ch in text.chars() {
                unsafe {
                    let mut inputs = [INPUT::default(); 2];
                    
                    // Key down
                    inputs[0].r#type = INPUT_KEYBOARD;
                    inputs[0].Anonymous.ki = KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0),
                        wScan: ch as u16,
                        dwFlags: KEYEVENTF_UNICODE,
                        time: 0,
                        dwExtraInfo: 0,
                    };
                    
                    // Key up
                    inputs[1].r#type = INPUT_KEYBOARD;
                    inputs[1].Anonymous.ki = KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0),
                        wScan: ch as u16,
                        dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    };
                    
                    SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
                }
                tokio::time::sleep(delay).await;
            }
            Ok::<(), anyhow::Error>(())
        })
        .await?
    }

    async fn try_clipboard_paste(&self, text: &str) -> Result<()> {
        let text = text.to_string();
        tokio::task::spawn_blocking(move || {
            let mut cb = arboard::Clipboard::new().context("failed to open clipboard")?;
            let old_text = cb.get_text().ok();
            
            cb.set_text(text).context("failed to set clipboard text")?;
            
            // Send Ctrl+V
            unsafe {
                let mut inputs = [INPUT::default(); 4];
                
                // Ctrl down
                inputs[0].r#type = INPUT_KEYBOARD;
                inputs[0].Anonymous.ki = KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0x11), // VK_CONTROL
                    wScan: 0,
                    dwFlags: KEYBD_EVENT_FLAGS(0),
                    time: 0,
                    dwExtraInfo: 0,
                };
                
                // V down
                inputs[1].r#type = INPUT_KEYBOARD;
                inputs[1].Anonymous.ki = KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0x56), // 'V'
                    wScan: 0,
                    dwFlags: KEYBD_EVENT_FLAGS(0),
                    time: 0,
                    dwExtraInfo: 0,
                };
                
                // V up
                inputs[2].r#type = INPUT_KEYBOARD;
                inputs[2].Anonymous.ki = KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0x56),
                    wScan: 0,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                };
                
                // Ctrl up
                inputs[3].r#type = INPUT_KEYBOARD;
                inputs[3].Anonymous.ki = KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0x11),
                    wScan: 0,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                };
                
                SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
            }
            
            // Give the target application 300ms to register paste before restoring clipboard
            std::thread::sleep(std::time::Duration::from_millis(300));
            
            if let Some(prev) = old_text {
                let _ = cb.set_text(prev);
            }
            Ok(())
        })
        .await?
    }
}

// Take a snapshot of the destination window and focused element
pub fn take_destination_snapshot() -> DestinationSnapshot {
    take_destination_snapshot_for_hwnd(0)
}

pub fn take_destination_snapshot_for_hwnd(target_hwnd: isize) -> DestinationSnapshot {
    unsafe {
        // Use the MTA so the captured IUIAutomationElement can be used later
        // from a tokio worker thread (which also joins the MTA).
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let mut hwnd = if target_hwnd != 0 && IsWindow(HWND(target_hwnd)).as_bool() {
            HWND(target_hwnd)
        } else {
            GetForegroundWindow()
        };

        if hwnd.0 == 0 {
            return DestinationSnapshot::default();
        }

        let mut pid = 0;
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let mut process_name = get_process_name(pid);

        // If the captured window is zero-studio, zero-daemon, or right-panel,
        // and target_hwnd was not explicitly given, automatically walk the Z-order
        // to find the previous user application window (e.g. Notepad.exe)
        if target_hwnd == 0 && (process_name == "zero-studio.exe" || process_name == "right-panel.exe" || process_name == "zero-daemon.exe") {
            let mut next = GetWindow(hwnd, GW_HWNDNEXT);
            while next.0 != 0 {
                if IsWindowVisible(next).as_bool() {
                    let mut next_pid = 0;
                    let _ = GetWindowThreadProcessId(next, Some(&mut next_pid));
                    let next_name = get_process_name(next_pid);
                    if next_name != "zero-studio.exe" && next_name != "right-panel.exe" && next_name != "zero-daemon.exe" && !next_name.is_empty() && next_name != "unknown" {
                        hwnd = next;
                        process_name = next_name;
                        break;
                    }
                }
                next = GetWindow(next, GW_HWNDNEXT);
            }
        }

        // Fetch UI Automation element
        let mut uia_element = None;
        let mut is_editable = false;

        if let Ok(automation) = CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
            let el_res = if hwnd == GetForegroundWindow() {
                automation.GetFocusedElement()
            } else {
                automation.ElementFromHandle(hwnd)
            };

            if let Ok(element) = el_res {
                // Check if element is editable
                if let Ok(pattern_obj) = element.GetCurrentPattern(UIA_ValuePatternId) {
                    if let Ok(val_pattern) = pattern_obj.cast::<IUIAutomationValuePattern>() {
                        if let Ok(read_only) = val_pattern.CurrentIsReadOnly() {
                            is_editable = !read_only.as_bool();
                        }
                    }
                }

                // Fallback check on TextPattern
                if !is_editable && element.GetCurrentPattern(UIA_TextPatternId).is_ok() {
                    is_editable = true;
                }

                uia_element = Some(SafeElement(std::mem::ManuallyDrop::new(element)));
            }
        }

        // Standard Windows text editors (Notepad, WordPad, code editors) are editable
        let proc_lower = process_name.to_lowercase();
        if !is_editable && (proc_lower.contains("notepad") || proc_lower.contains("wordpad") || proc_lower.contains("code") || proc_lower.contains("devenv")) {
            is_editable = true;
        }

        DestinationSnapshot {
            hwnd: hwnd.0,
            process_name,
            is_editable,
            uia_element,
        }
    }
}

fn get_process_name(pid: u32) -> String {
    unsafe {
        let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(h) => h,
            Err(_) => return "unknown".to_string(),
        };
        let mut len = 260;
        let mut buffer = vec![0u16; 260];
        let res = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            windows::core::PWSTR(buffer.as_mut_ptr()),
            &mut len,
        );
        let _ = CloseHandle(handle);
        if res.is_ok() {
            let path = String::from_utf16_lossy(&buffer[..len as usize]);
            if let Some(name) = std::path::Path::new(&path).file_name() {
                return name.to_string_lossy().into_owned();
            }
        }
        "unknown".to_string()
    }
}

/// Simulate pressing Enter or Ctrl+Enter key
pub fn send_auto_submit_key(ctrl_enter: bool) {
    unsafe {
        if ctrl_enter {
            let mut inputs = [INPUT::default(); 4];
            // Ctrl down
            inputs[0].r#type = INPUT_KEYBOARD;
            inputs[0].Anonymous.ki = KEYBDINPUT {
                wVk: VIRTUAL_KEY(0x11), // VK_CONTROL
                wScan: 0,
                dwFlags: KEYBD_EVENT_FLAGS(0),
                time: 0,
                dwExtraInfo: 0,
            };
            // Enter down
            inputs[1].r#type = INPUT_KEYBOARD;
            inputs[1].Anonymous.ki = KEYBDINPUT {
                wVk: VIRTUAL_KEY(0x0D), // VK_RETURN
                wScan: 0,
                dwFlags: KEYBD_EVENT_FLAGS(0),
                time: 0,
                dwExtraInfo: 0,
            };
            // Enter up
            inputs[2].r#type = INPUT_KEYBOARD;
            inputs[2].Anonymous.ki = KEYBDINPUT {
                wVk: VIRTUAL_KEY(0x0D),
                wScan: 0,
                dwFlags: KEYEVENTF_KEYUP,
                time: 0,
                dwExtraInfo: 0,
            };
            // Ctrl up
            inputs[3].r#type = INPUT_KEYBOARD;
            inputs[3].Anonymous.ki = KEYBDINPUT {
                wVk: VIRTUAL_KEY(0x11),
                wScan: 0,
                dwFlags: KEYEVENTF_KEYUP,
                time: 0,
                dwExtraInfo: 0,
            };
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        } else {
            let mut inputs = [INPUT::default(); 2];
            // Enter down
            inputs[0].r#type = INPUT_KEYBOARD;
            inputs[0].Anonymous.ki = KEYBDINPUT {
                wVk: VIRTUAL_KEY(0x0D), // VK_RETURN
                wScan: 0,
                dwFlags: KEYBD_EVENT_FLAGS(0),
                time: 0,
                dwExtraInfo: 0,
            };
            // Enter up
            inputs[1].r#type = INPUT_KEYBOARD;
            inputs[1].Anonymous.ki = KEYBDINPUT {
                wVk: VIRTUAL_KEY(0x0D),
                wScan: 0,
                dwFlags: KEYEVENTF_KEYUP,
                time: 0,
                dwExtraInfo: 0,
            };
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }
}

// Queue request structures
#[allow(dead_code)]
pub struct InjectionRequest {
    pub text: String,
    pub snapshot: DestinationSnapshot,
    pub reply: oneshot::Sender<InjectionStrategy>,
}

// Injector Queue Manager (Actor pattern)
#[allow(dead_code)]
pub struct InjectorQueueManager {
    queue: Arc<Mutex<VecDeque<InjectionRequest>>>,
    injector: Arc<TextInjector>,
}

#[allow(dead_code)]
impl InjectorQueueManager {
    pub fn new(injector: Arc<TextInjector>) -> Self {
        let queue = Arc::new(Mutex::new(VecDeque::<InjectionRequest>::new()));
        
        // Spawn active processor loop
        let q_clone = queue.clone();
        let inj_clone = injector.clone();
        tokio::spawn(async move {
            loop {
                let req = {
                    let mut q = q_clone.lock().await;
                    q.pop_front()
                };

                if let Some(r) = req {
                    let strategy = inj_clone.inject(&r.text, &r.snapshot).await;
                    let _ = r.reply.send(strategy);
                } else {
                    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                }
            }
        });

        Self { queue, injector }
    }

    pub async fn push(&self, text: String, snapshot: DestinationSnapshot) -> oneshot::Receiver<InjectionStrategy> {
        let (tx, rx) = oneshot::channel();
        let mut q = this_queue(&self.queue).await;
        
        // Enforce FIFO depth 3: if queue is full (length >= 3), pop the oldest request
        if q.len() >= 3 {
            if let Some(oldest) = q.pop_front() {
                warn!("FIFO injection queue limit (3) exceeded, dropping oldest request to clipboard/history");
                // Fallback the oldest request to clipboard directly
                let _ = oldest.reply.send(InjectionStrategy::ClipboardOnly);
                let _ = self.injector.low_level.try_clipboard_paste(&oldest.text).await;
            }
        }

        q.push_back(InjectionRequest {
            text,
            snapshot,
            reply: tx,
        });

        rx
    }
}

#[allow(dead_code)]
async fn this_queue(q: &Arc<Mutex<VecDeque<InjectionRequest>>>) -> tokio::sync::MutexGuard<'_, VecDeque<InjectionRequest>> {
    q.lock().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    struct MockLowLevelInjector {
        window_valid: bool,
        foreground_window: isize,
        uia_success: bool,
        send_input_success: bool,
        clipboard_paste_success: bool,
        focused_hwnd: Arc<StdMutex<Option<isize>>>,
    }

    #[async_trait]
    impl LowLevelInjector for MockLowLevelInjector {
        fn is_window_valid(&self, _hwnd: isize) -> bool {
            self.window_valid
        }

        fn get_foreground_window(&self) -> isize {
            self.foreground_window
        }

        async fn focus_window(&self, hwnd: isize) -> Result<()> {
            let mut focused = self.focused_hwnd.lock().unwrap();
            *focused = Some(hwnd);
            Ok(())
        }

        async fn try_uia_insert(&self, _element: &Option<SafeElement>, _text: &str) -> Result<()> {
            if self.uia_success {
                Ok(())
            } else {
                anyhow::bail!("mock uia error")
            }
        }

        async fn try_send_input(&self, _text: &str) -> Result<()> {
            if self.send_input_success {
                Ok(())
            } else {
                anyhow::bail!("mock send_input error")
            }
        }

        async fn try_clipboard_paste(&self, _text: &str) -> Result<()> {
            if self.clipboard_paste_success {
                Ok(())
            } else {
                anyhow::bail!("mock clipboard error")
            }
        }
    }

    #[tokio::test]
    async fn test_invalid_window_falls_back_to_clipboard_only() {
        let focused = Arc::new(StdMutex::new(None));
        let mock = Arc::new(MockLowLevelInjector {
            window_valid: false,
            foreground_window: 100,
            uia_success: true,
            send_input_success: true,
            clipboard_paste_success: true,
            focused_hwnd: focused.clone(),
        });
        let injector = TextInjector::new(mock);
        let snapshot = DestinationSnapshot {
            hwnd: 100,
            process_name: "test.exe".to_string(),
            is_editable: true,
            uia_element: None,
        };

        let strategy = injector.inject("hello", &snapshot).await;
        assert_eq!(strategy, InjectionStrategy::ClipboardOnly);
        assert_eq!(*focused.lock().unwrap(), None); // Focus not attempted
    }

    #[tokio::test]
    async fn test_non_editable_target_falls_back_to_clipboard_only() {
        let focused = Arc::new(StdMutex::new(None));
        let mock = Arc::new(MockLowLevelInjector {
            window_valid: true,
            foreground_window: 100,
            uia_success: true,
            send_input_success: true,
            clipboard_paste_success: true,
            focused_hwnd: focused.clone(),
        });
        let injector = TextInjector::new(mock);
        let snapshot = DestinationSnapshot {
            hwnd: 100,
            process_name: "test.exe".to_string(),
            is_editable: false,
            uia_element: None,
        };

        let strategy = injector.inject("hello", &snapshot).await;
        assert_eq!(strategy, InjectionStrategy::ClipboardOnly);
    }

    #[tokio::test]
    async fn test_restores_focus_if_foreground_window_changed() {
        let focused = Arc::new(StdMutex::new(None));
        let mock = Arc::new(MockLowLevelInjector {
            window_valid: true,
            foreground_window: 200, // Different foreground
            uia_success: false,
            send_input_success: true,
            clipboard_paste_success: true,
            focused_hwnd: focused.clone(),
        });
        let injector = TextInjector::new(mock);
        let snapshot = DestinationSnapshot {
            hwnd: 100,
            process_name: "test.exe".to_string(),
            is_editable: true,
            uia_element: None,
        };

        let strategy = injector.inject("hello", &snapshot).await;
        assert_eq!(strategy, InjectionStrategy::SendInput);
        assert_eq!(*focused.lock().unwrap(), Some(100)); // Focus restored
    }

    #[tokio::test]
    async fn test_uia_success() {
        let focused = Arc::new(StdMutex::new(None));
        let mock_uia_element = unsafe { std::mem::transmute::<isize, windows::Win32::UI::Accessibility::IUIAutomationElement>(0x12345678isize) };
        let mock = Arc::new(MockLowLevelInjector {
            window_valid: true,
            foreground_window: 100,
            uia_success: true,
            send_input_success: true,
            clipboard_paste_success: true,
            focused_hwnd: focused.clone(),
        });
        let injector = TextInjector::new(mock);
        let snapshot = DestinationSnapshot {
            hwnd: 100,
            process_name: "test.exe".to_string(),
            is_editable: true,
            uia_element: Some(SafeElement(std::mem::ManuallyDrop::new(mock_uia_element))),
        };

        let strategy = injector.inject("hello", &snapshot).await;
        assert_eq!(strategy, InjectionStrategy::Uia);
    }

    #[tokio::test]
    async fn test_send_input_fallback_on_uia_failure() {
        let focused = Arc::new(StdMutex::new(None));
        let mock_uia_element = unsafe { std::mem::transmute::<isize, windows::Win32::UI::Accessibility::IUIAutomationElement>(0x12345678isize) };
        let mock = Arc::new(MockLowLevelInjector {
            window_valid: true,
            foreground_window: 100,
            uia_success: false, // UIA fails
            send_input_success: true,
            clipboard_paste_success: true,
            focused_hwnd: focused.clone(),
        });
        let injector = TextInjector::new(mock);
        let snapshot = DestinationSnapshot {
            hwnd: 100,
            process_name: "test.exe".to_string(),
            is_editable: true,
            uia_element: Some(SafeElement(std::mem::ManuallyDrop::new(mock_uia_element))),
        };

        let strategy = injector.inject("hello", &snapshot).await;
        assert_eq!(strategy, InjectionStrategy::SendInput);
    }

    #[tokio::test]
    async fn test_clipboard_paste_fallback_on_keyboard_failure() {
        let focused = Arc::new(StdMutex::new(None));
        let mock = Arc::new(MockLowLevelInjector {
            window_valid: true,
            foreground_window: 100,
            uia_success: false,
            send_input_success: false, // SendInput fails
            clipboard_paste_success: true,
            focused_hwnd: focused.clone(),
        });
        let injector = TextInjector::new(mock);
        let snapshot = DestinationSnapshot {
            hwnd: 100,
            process_name: "test.exe".to_string(),
            is_editable: true,
            uia_element: None,
        };

        let strategy = injector.inject("hello", &snapshot).await;
        assert_eq!(strategy, InjectionStrategy::ClipboardPaste);
    }
}
