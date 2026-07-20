use std::sync::Mutex;
use std::sync::OnceLock;
use tracing::info;
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM, POINT, HINSTANCE, SIZE};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    BLENDFUNCTION, AC_SRC_ALPHA, AC_SRC_OVER
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, RegisterClassW, SetTimer, ShowWindow, SetWindowPos,
    CS_HREDRAW, CS_VREDRAW, HCURSOR, HICON, HWND_TOPMOST, SWP_NOACTIVATE,
    SW_HIDE, SW_SHOWNOACTIVATE, WM_CREATE, WM_DESTROY, WM_TIMER, WNDCLASSW,
    WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
    GetCursorPos, UpdateLayeredWindow, ULW_ALPHA, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverlayState {
    Hidden,
    Listening,  // Pulsing Blue
    Processing, // Rotating Yellow
    Success,    // Green
    Error,      // Red
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverlayMode {
    Cursor, // Follows cursor with offset
    Corner, // Fixed at bottom-right corner
}

static OVERLAY_STATE: Mutex<OverlayState> = Mutex::new(OverlayState::Hidden);
static OVERLAY_MODE: Mutex<OverlayMode> = Mutex::new(OverlayMode::Cursor);
static OVERLAY_HWND: OnceLock<HWND> = OnceLock::new();
static ANIMATION_STEP: Mutex<f32> = Mutex::new(0.0);

pub fn set_overlay_mode(mode: OverlayMode) {
    let mut m = OVERLAY_MODE.lock().unwrap();
    *m = mode;
    info!("overlay mode set to {:?}", mode);
}

pub fn init_overlay() {
    std::thread::spawn(|| {
        unsafe {
            let instance = HINSTANCE(windows::Win32::System::LibraryLoader::GetModuleHandleW(None).unwrap().0);
            
            let class_name = w!("ZeroOverlayClass");
            
            let wnd_class = WNDCLASSW {
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(overlay_wnd_proc),
                hInstance: instance,
                lpszClassName: class_name,
                hCursor: HCURSOR(0),
                hIcon: HICON(0),
                ..Default::default()
            };
            
            RegisterClassW(&wnd_class);
            
            let hwnd = CreateWindowExW(
                WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOPMOST,
                class_name,
                w!("Zero Overlay"),
                WS_POPUP,
                0, 0, 32, 32,
                None,
                None,
                instance,
                None,
            );
            
            if hwnd.0 != 0 {
                let _ = OVERLAY_HWND.set(hwnd);
                
                // Start a timer for cursor tracking and animation (30 fps = ~33ms)
                SetTimer(hwnd, 1, 33, None);
                
                // Hide initially
                ShowWindow(hwnd, SW_HIDE);
                
                let mut msg = windows::Win32::UI::WindowsAndMessaging::MSG::default();
                while windows::Win32::UI::WindowsAndMessaging::GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    windows::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
                    windows::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
                }
            }
        }
    });
}

pub fn set_overlay_state(state: OverlayState) {
    {
        let mut s = OVERLAY_STATE.lock().unwrap();
        *s = state;
    }
    
    if let Some(server) = crate::ipc::get_ipc_server() {
        server.broadcast_status(state);
    }
    
    if let Some(hwnd) = OVERLAY_HWND.get() {
        unsafe {
            match state {
                OverlayState::Hidden => {
                    ShowWindow(*hwnd, SW_HIDE);
                }
                _ => {
                    // Position immediately next to mouse
                    update_position(*hwnd);
                    ShowWindow(*hwnd, SW_SHOWNOACTIVATE);
                }
            }
        }
    }
}

unsafe fn update_position(hwnd: HWND) {
    let mut pt = POINT::default();
    if GetCursorPos(&mut pt).is_ok() {
        let mode = *OVERLAY_MODE.lock().unwrap();
        let (x, y) = match mode {
            OverlayMode::Cursor => {
                // Offset overlay by 15px right and 15px down from cursor
                (pt.x + 15, pt.y + 15)
            }
            OverlayMode::Corner => {
                // Fixed at bottom-right corner with 20px margin
                let screen_w = GetSystemMetrics(SM_CXSCREEN);
                let screen_h = GetSystemMetrics(SM_CYSCREEN);
                (screen_w - 52, screen_h - 52)
            }
        };
        let _ = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x,
            y,
            32,
            32,
            SWP_NOACTIVATE,
        );
    }
}

unsafe extern "system" fn overlay_wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_CREATE => {
            LRESULT(0)
        }
        WM_TIMER => {
            let state = *OVERLAY_STATE.lock().unwrap();
            if state != OverlayState::Hidden {
                // Update position to stick to cursor
                update_position(hwnd);
                
                // Increment animation step
                let mut step = ANIMATION_STEP.lock().unwrap();
                *step = (*step + 0.15) % (2.0 * std::f32::consts::PI);
                
                // Redraw overlay graphics
                draw_overlay(hwnd, state, *step);
            }
            LRESULT(0)
        }
        WM_DESTROY => {
            windows::Win32::UI::WindowsAndMessaging::PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

unsafe fn draw_overlay(hwnd: HWND, state: OverlayState, anim_step: f32) {
    let (r, g, b) = match state {
        OverlayState::Listening => (0, 120, 255),  // Vivid Blue
        OverlayState::Processing => (255, 180, 0),  // Vivid Yellow
        OverlayState::Success => (0, 200, 80),     // Vivid Green
        OverlayState::Error => (255, 50, 50),      // Vivid Red
        OverlayState::Hidden => return,
    };

    let width = 32;
    let height = 32;
    
    // Generate pixels
    let mut pixels = vec![0u32; width * height];
    let cx = width as f32 / 2.0;
    let cy = height as f32 / 2.0;
    
    // Set radius or sweep based on state
    let radius = match state {
        OverlayState::Listening => {
            // Pulse: radius fluctuates between 8.0 and 12.0
            8.0 + (anim_step.sin() + 1.0) * 2.0
        }
        OverlayState::Processing => {
            // Processing: outer ring spinner
            10.0
        }
        _ => {
            // Success / Error: solid static circle
            10.0
        }
    };
    
    for y in 0..height {
        for x in 0..width {
            let dx = (x as f32 + 0.5) - cx;
            let dy = (y as f32 + 0.5) - cy;
            let dist = (dx*dx + dy*dy).sqrt();
            
            let alpha = if state == OverlayState::Processing {
                // Spinning gradient ring
                if (7.0..=11.0).contains(&dist) {
                    let angle = dy.atan2(dx);
                    let mut angle = if angle < 0.0 { angle + 2.0 * std::f32::consts::PI } else { angle };
                    // Rotate
                    angle = (angle - anim_step) % (2.0 * std::f32::consts::PI);
                    if angle < 0.0 { angle += 2.0 * std::f32::consts::PI; }
                    
                    let intensity = angle / (2.0 * std::f32::consts::PI);
                    (intensity * 255.0) as u8
                } else {
                    0
                }
            } else {
                // Pulse or solid circle
                if dist < radius - 0.5 {
                    255
                } else if dist > radius + 0.5 {
                    0
                } else {
                    ((radius + 0.5 - dist) * 255.0) as u8
                }
            };
            
            if alpha > 0 {
                // Premultiply alpha
                let a_f = alpha as f32 / 255.0;
                let pr = (r as f32 * a_f) as u32;
                let pg = (g as f32 * a_f) as u32;
                let pb = (b as f32 * a_f) as u32;
                let pixel = (alpha as u32) << 24 | pr << 16 | pg << 8 | pb;
                pixels[y * width + x] = pixel;
            }
        }
    }
    
    // Update layered window GDI calls
    let screen_dc = windows::Win32::Graphics::Gdi::GetDC(None);
    let mem_dc = CreateCompatibleDC(screen_dc);
    
    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32), // Top-down
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    
    let mut bits = std::ptr::null_mut();
    let bitmap = CreateDIBSection(
        screen_dc,
        &bmi,
        DIB_RGB_COLORS,
        &mut bits,
        None,
        0,
    ).unwrap();

    if !bits.is_null() {
        std::ptr::copy_nonoverlapping(pixels.as_ptr(), bits as *mut u32, pixels.len());
    }

    let old_bitmap = SelectObject(mem_dc, bitmap);

    let blend = BLENDFUNCTION {
        BlendOp: AC_SRC_ALPHA as u8,
        BlendFlags: 0,
        SourceConstantAlpha: 255,
        AlphaFormat: AC_SRC_OVER as u8,
    };

    let size = SIZE { cx: width as i32, cy: height as i32 };
    let zero_pt = POINT { x: 0, y: 0 };

    let _ = UpdateLayeredWindow(
        hwnd,
        screen_dc,
        None,
        Some(&size),
        mem_dc,
        Some(&zero_pt),
        None,
        Some(&blend),
        ULW_ALPHA,
    );
    
    SelectObject(mem_dc, old_bitmap);
    DeleteObject(bitmap);
    DeleteDC(mem_dc);
    windows::Win32::Graphics::Gdi::ReleaseDC(None, screen_dc);
}
