use std::sync::Mutex;
use std::sync::OnceLock;
use anyhow::{Context, Result};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, SetWindowsHookExW, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, WH_KEYBOARD_LL,
    WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_BACK, VK_CAPITAL, VK_CONTROL, VK_ESCAPE, VK_F1, VK_F10, VK_F11, VK_F12,
    VK_F2, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7, VK_F8, VK_F9, VK_LCONTROL, VK_LMENU, VK_LSHIFT,
    VK_MENU, VK_OEM_3, VK_RCONTROL, VK_RETURN, VK_RMENU, VK_RSHIFT, VK_SHIFT, VK_SPACE, VK_TAB,
};
use crate::DaemonCmd;
use tracing::{info, debug};


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
// Removed IS_RECORDING_PTT
static HOTKEY_PRESSED: Mutex<bool> = Mutex::new(false);

fn parse_key_to_vk(part: &str) -> Result<u32> {
    let lower = part.to_lowercase();
    let trimmed = lower.trim();
    match trimmed {
        "space" | "spacebar" => Ok(VK_SPACE.0 as u32),
        "enter" | "return" => Ok(VK_RETURN.0 as u32),
        "tab" => Ok(VK_TAB.0 as u32),
        "esc" | "escape" => Ok(VK_ESCAPE.0 as u32),
        "backspace" => Ok(VK_BACK.0 as u32),
        "tilde" | "`" | "~" => Ok(VK_OEM_3.0 as u32),
        "capslock" | "caps" => Ok(VK_CAPITAL.0 as u32),
        "f1" => Ok(VK_F1.0 as u32),
        "f2" => Ok(VK_F2.0 as u32),
        "f3" => Ok(VK_F3.0 as u32),
        "f4" => Ok(VK_F4.0 as u32),
        "f5" => Ok(VK_F5.0 as u32),
        "f6" => Ok(VK_F6.0 as u32),
        "f7" => Ok(VK_F7.0 as u32),
        "f8" => Ok(VK_F8.0 as u32),
        "f9" => Ok(VK_F9.0 as u32),
        "f10" => Ok(VK_F10.0 as u32),
        "f11" => Ok(VK_F11.0 as u32),
        "f12" => Ok(VK_F12.0 as u32),
        other if other.len() == 1 => {
            let ch = other.chars().next().unwrap();
            Ok(ch.to_ascii_uppercase() as u32)
        }
        other => anyhow::bail!("Unsupported key in hotkey: {}", other),
    }
}

pub fn update_hotkey_from_string(hotkey_str: &str) -> Result<()> {
    let parts: Vec<&str> = hotkey_str.split('+').collect();
    let mut ctrl = false;
    let mut shift = false;
    let mut alt = false;
    let mut vk_code = 0;

    for part in parts {
        match part.to_lowercase().trim() {
            "ctrl" | "control" => ctrl = true,
            "shift" => shift = true,
            "alt" => alt = true,
            other => {
                vk_code = parse_key_to_vk(other)?;
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
            let h_mod = windows::Win32::System::LibraryLoader::GetModuleHandleW(None).unwrap_or_default();
            let hook = SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(keyboard_hook_proc),
                h_mod,
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

            // Check if modifiers are held down (supporting generic and L/R variants)
            let ctrl_down = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(VK_LCONTROL.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(VK_RCONTROL.0 as i32) as u16 & 0x8000 != 0);

            let shift_down = (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(VK_LSHIFT.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(VK_RSHIFT.0 as i32) as u16 & 0x8000 != 0);

            let alt_down = (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(VK_LMENU.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(VK_RMENU.0 as i32) as u16 & 0x8000 != 0);
            
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
                    let mut pressed = HOTKEY_PRESSED.lock().unwrap();
                    if !*pressed {
                        *pressed = true;
                        let mode = crate::config::get_config().hotkey_mode;
                        if let Some(tx) = CMD_TX.get() {
                            if mode == "hold" {
                                let _ = tx.send(DaemonCmd::StartRecording);
                            } else if mode == "modal" {
                                let _ = tx.send(DaemonCmd::ToggleWidget);
                            } else {
                                let _ = tx.send(DaemonCmd::ToggleRecording { target_hwnd: None });
                            }
                        }
                    }
                    // Suppress key event to prevent typing
                    return LRESULT(1);
                } else if event == WM_KEYUP || event == WM_SYSKEYUP {
                    *HOTKEY_PRESSED.lock().unwrap() = false;
                    let mode = crate::config::get_config().hotkey_mode;
                    if mode == "hold" {
                        if let Some(tx) = CMD_TX.get() {
                            let _ = tx.send(DaemonCmd::StopRecording);
                        }
                    }
                    // Ignore key up in toggle mode, but still suppress the trigger key to prevent typing
                    return LRESULT(1);
                }
            }
        }
    }
    
    CallNextHookEx(None, code, wparam, lparam)
}
