use std::process::Command;
use std::time::Duration;
use tracing::{info, warn};

pub fn run_watchdog() {
    info!("watchdog starting, spawning worker process...");
    let exe = std::env::current_exe().expect("failed to get current executable path");
    
    loop {
        info!("spawning {:?}", exe);
        let mut cmd = Command::new(&exe);
        cmd.arg("--worker");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let mut child = cmd
            .spawn()
            .expect("failed to spawn worker process");
            
        let status = child.wait().expect("failed to wait on worker");
        warn!("worker process exited with status: {}", status);
        
        // Wait a bit before restarting to avoid tight loop on instant crash
        std::thread::sleep(Duration::from_secs(3));
    }
}
