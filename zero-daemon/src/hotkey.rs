use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use anyhow::{Context, Result};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, SetWindowsHookExW, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, WH_KEYBOARD_LL,
    WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_MENU, VK_RCONTROL,
    VK_RMENU, VK_RSHIFT, VK_SHIFT,
};
use crate::DaemonCmd;
use tracing::{info, debug};

const DEBOUNCE: Duration = Duration::from_millis(150);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HotkeyConfig {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub vk_code: u32,
}

static HOTKEY_CONFIG: Mutex<HotkeyConfig> = Mutex::new(HotkeyConfig {
    ctrl: true,
    shift: true,
    alt: false,
    vk_code: 0x5A, // Z
});

static CMD_TX: OnceLock<std::sync::mpsc::Sender<DaemonCmd>> = OnceLock::new();
static HHOOK_HANDLE: Mutex<Option<HHOOK>> = Mutex::new(None);
static IS_RECORDING_PTT: Mutex<bool> = Mutex::new(false);
static LAST_TRANSITION: Mutex<Option<Instant>> = Mutex::new(None);

/// Returns true when the transition should be accepted, false when it falls
/// inside the 150 ms debounce window after the previous start/stop.
fn debounce_ok() -> bool {
    let mut last = LAST_TRANSITION.lock().unwrap();
    let now = Instant::now();
    if last.is_some_and(|t| now.duration_since(t) < DEBOUNCE) {
        return false;
    }
    *last = Some(now);
    true
}

pub fn update_hotkey_from_string(hotkey_str: &str) -> Result<()> {
    let parts: Vec<&str> = hotkey_str.split('+').collect();
    let mut ctrl = false;
    let mut shift = false;
    let mut alt = false;
    let mut vk_code = 0;

    for part in parts {
        match part.to_lowercase().trim() {
            "ctrl" => ctrl = true,
            "shift" => shift = true,
            "alt" => alt = true,
            other => {
                if other.len() == 1 {
                    let ch = other.chars().next().unwrap();
                    vk_code = ch.to_ascii_uppercase() as u32;
                } else {
                    anyhow::bail!("Unsupported key in hotkey: {}", other);
                }
            }
        }
    }

    if vk_code == 0 {
        anyhow::bail!("No main key specified in hotkey: {}", hotkey_str);
    }

    let mut config = HOTKEY_CONFIG.lock().unwrap();
    *config = HotkeyConfig {
        ctrl,
        shift,
        alt,
        vk_code,
    };
    info!("Hotkey configuration updated: {:?}", *config);
    Ok(())
}

pub struct HotkeyManager;

impl HotkeyManager {
    pub fn new() -> Self {
        Self
    }

    pub fn register(&self, cmd_tx: std::sync::mpsc::Sender<DaemonCmd>) -> Result<()> {
        let _ = CMD_TX.set(cmd_tx);
        
        unsafe {
            let hook = SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(keyboard_hook_proc),
                None,
                0,
            ).context("Failed to register low-level keyboard hook")?;
            
            let mut handle = HHOOK_HANDLE.lock().unwrap();
            *handle = Some(hook);
        }
        
        Ok(())
    }

    pub fn unregister(&self) {
        let mut handle = HHOOK_HANDLE.lock().unwrap();
        if let Some(hook) = handle.take() {
            unsafe {
                let _ = UnhookWindowsHookEx(hook);
            }
        }
    }
}

impl Drop for HotkeyManager {
    fn drop(&mut self) {
        self.unregister();
    }
}

unsafe extern "system" fn keyboard_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let kbd_struct = lparam.0 as *const KBDLLHOOKSTRUCT;
        if !kbd_struct.is_null() {
            let vk_code = (*kbd_struct).vkCode;
            
            let config = {
                let cfg = HOTKEY_CONFIG.lock().unwrap();
                *cfg
            };

            // Check if modifiers are held down
            let ctrl_down = GetAsyncKeyState(VK_CONTROL.0 as i32) < 0;
            let shift_down = GetAsyncKeyState(VK_SHIFT.0 as i32) < 0;
            let alt_down = GetAsyncKeyState(VK_MENU.0 as i32) < 0;
            
            let modifiers_match = (ctrl_down == config.ctrl)
                && (shift_down == config.shift)
                && (alt_down == config.alt);

            debug!(
                "keyboard_hook_proc: vk_code=0x{:X}, ctrl={}, shift={}, alt={}, match={}",
                vk_code, ctrl_down, shift_down, alt_down, modifiers_match && vk_code == config.vk_code
            );

            if modifiers_match && vk_code == config.vk_code {
                let event = wparam.0 as u32;
                if event == WM_KEYDOWN || event == WM_SYSKEYDOWN {
                    let mut recording = IS_RECORDING_PTT.lock().unwrap();
                    if !*recording && debounce_ok() {
                        *recording = true;
                        if let Some(tx) = CMD_TX.get() {
                            let _ = tx.send(DaemonCmd::StartRecording);
                        }
                    }
                    // Suppress key event to prevent typing
                    return LRESULT(1);
                } else if event == WM_KEYUP || event == WM_SYSKEYUP {
                    let mut recording = IS_RECORDING_PTT.lock().unwrap();
                    if *recording {
                        *recording = false;
                        *LAST_TRANSITION.lock().unwrap() = Some(Instant::now());
                        if let Some(tx) = CMD_TX.get() {
                            let _ = tx.send(DaemonCmd::StopRecording);
                        }
                    }
                    // Suppress key event to prevent typing
                    return LRESULT(1);
                }
            } else {
                // If the key event is keyup, and it is one of the modifiers in our config, and we are recording, stop recording.
                // Note: WH_KEYBOARD_LL reports left/right-specific virtual keys
                // (VK_LCONTROL/VK_RCONTROL, ...), never the generic VK_CONTROL,
                // so both forms must be matched here.
                let event = wparam.0 as u32;
                if event == WM_KEYUP || event == WM_SYSKEYUP {
                    let is_modifier_release = (config.ctrl
                        && (vk_code == VK_CONTROL.0 as u32
                            || vk_code == VK_LCONTROL.0 as u32
                            || vk_code == VK_RCONTROL.0 as u32))
                        || (config.shift
                            && (vk_code == VK_SHIFT.0 as u32
                                || vk_code == VK_LSHIFT.0 as u32
                                || vk_code == VK_RSHIFT.0 as u32))
                        || (config.alt
                            && (vk_code == VK_MENU.0 as u32
                                || vk_code == VK_LMENU.0 as u32
                                || vk_code == VK_RMENU.0 as u32));

                    if is_modifier_release {
                        let mut recording = IS_RECORDING_PTT.lock().unwrap();
                        if *recording {
                            *recording = false;
                            *LAST_TRANSITION.lock().unwrap() = Some(Instant::now());
                            if let Some(tx) = CMD_TX.get() {
                                let _ = tx.send(DaemonCmd::StopRecording);
                            }
                        }
                    }
                }
            }
        }
    }
    
    CallNextHookEx(None, code, wparam, lparam)
}
