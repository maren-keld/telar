#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn notify_macos(title: &str, body: &str) {
    // `osascript display notification` makes macOS attribute the notification
    // to Script Editor/osascript. That is why clicking it opened an editor and
    // why it showed the wrong icon. Creating it from the app process associates
    // it with Telar's bundle, so Notification Center activates Telar on click
    // and uses the app icon.
    use objc2::rc::Retained;
    use objc2_foundation::{NSString, NSUserNotification, NSUserNotificationCenter};

    let notification: Retained<NSUserNotification> = NSUserNotification::new();
    let title = NSString::from_str(title);
    let body = NSString::from_str(body);
    notification.setTitle(Some(&title));
    notification.setInformativeText(Some(&body));
    NSUserNotificationCenter::defaultUserNotificationCenter().deliverNotification(&notification);
}

#[cfg(target_os = "windows")]
fn escape_ps(value: &str) -> String {
    value.replace('\'', "''")
}

fn notify_blocking(title: String, body: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        notify_macos(&title, &body);
        Ok(())
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
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (title, body);
        Ok(())
    }
}

/// Aviso nativo al responder un test o handout. Sin crate extra.
///
/// macOS: API nativa de Cocoa; Windows: toast nativo vía PowerShell.
#[tauri::command]
pub async fn show_desktop_notification(title: String, body: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || notify_blocking(title, body))
        .await
        .map_err(|e| format!("Error interno al notificar: {e}"))?
}
