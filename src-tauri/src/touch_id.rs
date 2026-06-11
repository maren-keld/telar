use std::fs;
use std::path::Path;

#[cfg(target_os = "macos")]
mod macos {
    use std::sync::mpsc::{Receiver, SyncSender, TryRecvError};
    use std::time::{Duration, Instant};

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::Bool;
    use objc2_foundation::{NSDate, NSDefaultRunLoopMode, NSError, NSRunLoop, NSString};
    use objc2_local_authentication::{LAContext, LAPolicy};

    fn policy_available(policy: LAPolicy) -> bool {
        unsafe {
            let ctx = LAContext::new();
            ctx.canEvaluatePolicy_error(policy).is_ok()
        }
    }

    pub fn is_available() -> bool {
        policy_available(LAPolicy::DeviceOwnerAuthenticationWithBiometrics)
            || policy_available(LAPolicy::DeviceOwnerAuthentication)
    }

    /// Diálogo nativo Touch ID. Debe ejecutarse en el hilo principal y mantener `LAContext` vivo.
    pub fn authenticate_on_main_thread(reason: &str) -> Result<(), String> {
        if !is_available() {
            return Err("Touch ID no está disponible en este Mac".to_string());
        }

        let policy = if policy_available(LAPolicy::DeviceOwnerAuthenticationWithBiometrics) {
            LAPolicy::DeviceOwnerAuthenticationWithBiometrics
        } else if policy_available(LAPolicy::DeviceOwnerAuthentication) {
            LAPolicy::DeviceOwnerAuthentication
        } else {
            return Err("Touch ID no está disponible en este Mac".to_string());
        };

        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        start_evaluate(policy, reason, tx);
        wait_with_run_loop(rx)
    }

    fn start_evaluate(policy: LAPolicy, reason: &str, tx: SyncSender<Result<(), String>>) {
        use std::sync::{Arc, Mutex};

        let ctx_holder: Arc<Mutex<Option<Retained<LAContext>>>> =
            Arc::new(Mutex::new(Some(unsafe { LAContext::new() })));
        let reason_ns = NSString::from_str(reason);
        let ctx_arc = Arc::clone(&ctx_holder);

        let block = RcBlock::new(move |success: Bool, _err: *mut NSError| {
            let _keep_ctx = ctx_arc.lock().ok().and_then(|mut g| g.take());
            if success.as_bool() {
                let _ = tx.send(Ok(()));
            } else {
                let _ = tx.send(Err("Touch ID cancelado o no reconocido".to_string()));
            }
        });

        let la_ctx = ctx_holder
            .lock()
            .ok()
            .and_then(|g| g.as_ref().cloned())
            .expect("LAContext");
        unsafe {
            la_ctx.setLocalizedFallbackTitle(Some(&NSString::from_str("Usar código")));
            la_ctx.evaluatePolicy_localizedReason_reply(policy, &reason_ns, &block);
        }
    }

    fn wait_with_run_loop(rx: Receiver<Result<(), String>>) -> Result<(), String> {
        let run_loop = NSRunLoop::mainRunLoop();
        let mode = unsafe { &*NSDefaultRunLoopMode };
        let deadline = Instant::now() + Duration::from_secs(120);

        loop {
            match rx.try_recv() {
                Ok(r) => return r,
                Err(TryRecvError::Disconnected) => {
                    return Err("Touch ID no respondió".to_string());
                }
                Err(TryRecvError::Empty) => {}
            }
            if Instant::now() >= deadline {
                return Err("Touch ID no respondió".to_string());
            }
            let until = NSDate::dateWithTimeIntervalSinceNow(0.05);
            run_loop.runMode_beforeDate(mode, &until);
        }
    }
}

#[cfg(target_os = "macos")]
pub use macos::authenticate_on_main_thread;

#[cfg(target_os = "macos")]
pub use macos::is_available;

#[cfg(not(target_os = "macos"))]
pub fn is_available() -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
pub fn authenticate_on_main_thread(_reason: &str) -> Result<(), String> {
    Err("Touch ID solo está disponible en macOS".to_string())
}

/// Clave de desbloqueo guardada en AppConfig (no usa Keychain del sistema → sin popup de login).
pub fn has_stored_key(path: &Path) -> bool {
    path.is_file() && fs::metadata(path).map(|m| m.len() > 0).unwrap_or(false)
}

pub fn save_db_key(path: &Path, key: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("No se pudo crear carpeta: {e}"))?;
    }
    fs::write(path, key.as_bytes()).map_err(|e| format!("No se pudo guardar clave Touch ID: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

pub fn load_db_key(path: &Path) -> Result<String, String> {
    if !has_stored_key(path) {
        return Err("Touch ID no está registrado. Actívalo en Ajustes con tu PIN.".to_string());
    }
    let bytes = fs::read(path).map_err(|e| format!("No se pudo leer clave Touch ID: {e}"))?;
    String::from_utf8(bytes).map_err(|_| "Clave Touch ID corrupta".to_string())
}

pub fn clear_db_key(path: &Path) {
    let _ = fs::remove_file(path);
}
