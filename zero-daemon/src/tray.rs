use anyhow::{Context, Result};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_ICON, NIF_INFO, NIF_MESSAGE, NIF_TIP, NIIF_INFO,
    NIM_ADD, NIM_DELETE, NIM_MODIFY, NOTIFYICONDATAW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu,
    DestroyWindow, GetCursorPos, LoadIconW, PostQuitMessage, RegisterClassExW,
    SetForegroundWindow, TrackPopupMenu, IDI_APPLICATION, MF_STRING,
    TPM_BOTTOMALIGN, TPM_LEFTALIGN, WINDOW_EX_STYLE, WM_COMMAND, WM_DESTROY,
    WM_USER, WNDCLASSEXW, WS_OVERLAPPED,
};

pub const WM_TRAY: u32 = WM_USER + 1;
pub const WM_DAEMON_EVENT: u32 = WM_USER + 2;
const IDM_EXIT: u16 = 1001;

static CLASS_NAME: &[u16] = &[
    b'Z' as u16, b'e' as u16, b'r' as u16, b'o' as u16,
    b'D' as u16, b'a' as u16, b'e' as u16, b'm' as u16,
    b'o' as u16, b'n' as u16, 0,
];

pub struct TrayIcon {
    hwnd: HWND,
    nid: NOTIFYICONDATAW,
}

impl TrayIcon {
    pub fn hwnd(&self) -> HWND {
        self.hwnd
    }
}

pub fn create_window_and_tray() -> Result<TrayIcon> {
    unsafe {
        let hmodule = windows::Win32::System::LibraryLoader::GetModuleHandleW(None)
            .context("GetModuleHandleW failed")?;
        let hinstance = windows::Win32::Foundation::HINSTANCE(hmodule.0);

        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(wnd_proc),
            lpszClassName: PCWSTR(CLASS_NAME.as_ptr()),
            hInstance: hinstance,
            ..Default::default()
        };
        RegisterClassExW(&wc);

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            PCWSTR(CLASS_NAME.as_ptr()),
            PCWSTR::null(),
            WS_OVERLAPPED,
            0, 0, 0, 0,
            HWND::default(),
            None,
            hinstance,
            None,
        );

        if hwnd.0 == 0 {
            anyhow::bail!("CreateWindowExW failed for tray window");
        }

        let hicon = LoadIconW(None, IDI_APPLICATION)?;

        let mut nid = NOTIFYICONDATAW {
            cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
            hWnd: hwnd,
            uID: 1,
            uFlags: NIF_MESSAGE | NIF_ICON | NIF_TIP,
            uCallbackMessage: WM_TRAY,
            hIcon: hicon,
            ..Default::default()
        };

        let tip = "Zero — Voice Input";
        let tip_wide: Vec<u16> = tip.encode_utf16().collect();
        let len = tip_wide.len().min(nid.szTip.len() - 1);
        nid.szTip[..len].copy_from_slice(&tip_wide[..len]);

        Shell_NotifyIconW(NIM_ADD, &nid);

        Ok(TrayIcon { hwnd, nid })
    }
}

pub fn show_balloon(tray: &mut TrayIcon, title: &str, text: &str) {
    unsafe {
        tray.nid.uFlags = NIF_INFO;
        tray.nid.dwInfoFlags = NIIF_INFO;

        let title_wide: Vec<u16> = title.encode_utf16().collect();
        let text_wide: Vec<u16> = text.encode_utf16().collect();

        tray.nid.szInfoTitle = [0u16; 64];
        let tl = title_wide.len().min(63);
        tray.nid.szInfoTitle[..tl].copy_from_slice(&title_wide[..tl]);

        tray.nid.szInfo = [0u16; 256];
        let tl = text_wide.len().min(255);
        tray.nid.szInfo[..tl].copy_from_slice(&text_wide[..tl]);

        Shell_NotifyIconW(NIM_MODIFY, &tray.nid);
    }
}

impl Drop for TrayIcon {
    fn drop(&mut self) {
        unsafe {
            Shell_NotifyIconW(NIM_DELETE, &self.nid);
            let _ = DestroyWindow(self.hwnd);
        }
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_DESTROY => {
            PostQuitMessage(0);
            LRESULT(0)
        }
        x if x == WM_TRAY => {
            let event = lparam.0 as u32;
            if event == 0x0205 {
                show_context_menu(hwnd);
            }
            LRESULT(0)
        }
        WM_COMMAND => {
            let id = (wparam.0 & 0xFFFF) as u16;
            if id == IDM_EXIT {
                PostQuitMessage(0);
            }
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

unsafe fn show_context_menu(hwnd: HWND) {
    let menu = CreatePopupMenu().unwrap();

    let exit_text: Vec<u16> = "Exit".encode_utf16().chain(std::iter::once(0)).collect();
    let _ = AppendMenuW(menu, MF_STRING, IDM_EXIT as usize, PCWSTR(exit_text.as_ptr()));

    let mut pt = windows::Win32::Foundation::POINT::default();
    let _ = GetCursorPos(&mut pt);

    SetForegroundWindow(hwnd);
    TrackPopupMenu(menu, TPM_LEFTALIGN | TPM_BOTTOMALIGN, pt.x, pt.y, 0, hwnd, None);
    let _ = DestroyMenu(menu);
}
