use std::process::Command;

#[cfg(target_os = "macos")]
fn escape_swift(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}

#[cfg(target_os = "windows")]
fn escape_ps(value: &str) -> String {
    value.replace('\'', "''")
}

/// Aviso nativo al responder un test o handout. Sin crate extra.
///
/// macOS: usa UNUserNotificationCenter vía `swift` inline para que el clic en
/// la notificación traiga Telar al frente (osascript la atribuye a Script Editor).
#[tauri::command]
pub fn show_desktop_notification(title: String, body: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let t = escape_swift(&title);
        let b = escape_swift(&body);
        let swift = format!(
            r#"
import UserNotifications
import Foundation

let sem = DispatchSemaphore(value: 0)
let center = UNUserNotificationCenter.current()
center.requestAuthorization(options: [.alert, .sound]) {{ _, _ in sem.signal() }}
sem.wait()

let content = UNMutableNotificationContent()
content.title = "{t}"
content.body  = "{b}"
content.sound = .default

let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
let sem2 = DispatchSemaphore(value: 0)
center.add(req) {{ _ in sem2.signal() }}
sem2.wait()
"#
        );
        let status = Command::new("swift")
            .args(["-e", &swift])
            .status()
            .map_err(|e| format!("No se pudo mostrar la notificación: {e}"))?;
        if !status.success() {
            // Fallback a osascript si swift falla (p.ej. Xcode no instalado).
            let osa = format!(
                "display notification \"{}\" with title \"{}\"",
                body.replace('\\', "\\\\").replace('"', "\\\""),
                title.replace('\\', "\\\\").replace('"', "\\\""),
            );
            Command::new("osascript")
                .args(["-e", &osa])
                .status()
                .map_err(|e| format!("Notificación fallback falló: {e}"))?;
        }
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let title = escape_ps(&title);
        let body = escape_ps(&body);
        let script = format!(
            r#"
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$nodes = $xml.GetElementsByTagName('text')
$nodes.Item(0).AppendChild($xml.CreateTextNode('{title}')) | Out-Null
$nodes.Item(1).AppendChild($xml.CreateTextNode('{body}')) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Telar').Show($toast)
"#
        );
        Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .status()
            .map_err(|e| format!("No se pudo mostrar la notificación: {e}"))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (title, body);
    }
    Ok(())
}
