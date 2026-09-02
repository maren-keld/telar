//! BLE nativo Muse 2 (btleplug) — macOS y Windows. Solo Muse 2; Muse S no soportado.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use btleplug::api::{
    Central, Characteristic, Manager as _, Peripheral as _, ScanFilter, WriteType,
};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::StreamExt;
use once_cell::sync::Lazy;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;

const SERVICE_UUID: &str = "0000fe8d-0000-1000-8000-00805f9b34fb";
const CONTROL_CHAR: &str = "273e0001-4c4d-454d-96be-f03bac821358";
const BATTERY_CHAR: &str = "273e000b-4c4d-454d-96be-f03bac821358";
const GYRO_CHAR: &str = "273e0009-4c4d-454d-96be-f03bac821358";
const ACCEL_CHAR: &str = "273e000a-4c4d-454d-96be-f03bac821358";
const EEG_CHARS: [&str; 5] = [
    "273e0003-4c4d-454d-96be-f03bac821358",
    "273e0004-4c4d-454d-96be-f03bac821358",
    "273e0005-4c4d-454d-96be-f03bac821358",
    "273e0006-4c4d-454d-96be-f03bac821358",
    "273e0007-4c4d-454d-96be-f03bac821358",
];
const EEG_TIMEOUT: Duration = Duration::from_secs(2);
const ACCEL_SCALE: f64 = 0.000_061_035_2;
const GYRO_SCALE: f64 = 0.007_476_8;

fn decode_muse_battery(data: &[u8]) -> Option<f32> {
    let mut candidates = Vec::new();
    if data.len() >= 3 {
        let pct = data[2];
        if pct <= 100 {
            candidates.push(pct as f32 / 100.0);
        }
    }
    for off in [2usize, 4, 6] {
        if data.len() < off + 2 {
            continue;
        }
        let be = u16::from_be_bytes([data[off], data[off + 1]]) as f32 / 512.0;
        let le256 = u16::from_le_bytes([data[off], data[off + 1]]) as f32 / 256.0;
        let le512 = u16::from_le_bytes([data[off], data[off + 1]]) as f32 / 512.0;
        for v in [be, le256, le512] {
            if v > 0.0 && v <= 1.05 {
                candidates.push(v.min(1.0));
            }
        }
    }
    candidates.into_iter().reduce(f32::max)
}

static RUNNING: AtomicBool = AtomicBool::new(false);
static SESSION: Lazy<Arc<Mutex<Option<MuseSession>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));

struct MuseSession {
    peripheral: Peripheral,
    device_name: String,
}

#[derive(Clone, Serialize)]
struct MuseEegPayload {
    channel: u8,
    samples: Vec<f64>,
    timestamp_ms: u64,
    packet_index: u16,
}

#[derive(Clone, Serialize)]
struct MuseMotionPayload {
    kind: String,
    samples: Vec<[f64; 3]>,
}

#[derive(Clone, Serialize)]
struct MuseBatteryPayload {
    percent: u8,
}

fn is_supported_muse2(name: &str) -> bool {
    let n = name.to_lowercase();
    if !n.contains("muse") {
        return false;
    }
    // Muse S, Athena y variantes no soportadas (solo Muse 2).
    if n.contains("muses") || n.contains("muse-s") || n.contains("muse s") || n.contains("athena") {
        return false;
    }
    true
}

fn parse_uuid(s: &str) -> Result<Uuid, String> {
    Uuid::parse_str(s).map_err(|e| format!("UUID inválido: {e}"))
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn decode_12bit_eeg(data: &[u8]) -> (u16, Vec<f64>) {
    if data.len() < 4 {
        return (0, vec![]);
    }
    let packet_index = u16::from_be_bytes([data[0], data[1]]);
    let samples = &data[2..];
    let mut out = Vec::new();
    let mut i = 0;
    while i < samples.len() {
        if i % 3 == 0 {
            if i + 1 >= samples.len() {
                break;
            }
            let v = ((samples[i] as u16) << 4) | ((samples[i + 1] as u16) >> 4);
            out.push(v);
        } else {
            if i + 1 >= samples.len() {
                break;
            }
            let v = (((samples[i] & 0x0f) as u16) << 8) | samples[i + 1] as u16;
            out.push(v);
            i += 1;
        }
        i += 1;
    }
    let uv = out
        .iter()
        .map(|x| 0.488_281_25 * (*x as f64 - 2048.0))
        .collect();
    (packet_index, uv)
}

fn decode_motion(data: &[u8], scale: f64) -> Vec<[f64; 3]> {
    if data.len() < 8 {
        return vec![];
    }
    let mut out = Vec::new();
    let mut ofs = 2usize;
    for _ in 0..3 {
        if ofs + 6 > data.len() {
            break;
        }
        let x = i16::from_be_bytes([data[ofs], data[ofs + 1]]) as f64 * scale;
        let y = i16::from_be_bytes([data[ofs + 2], data[ofs + 3]]) as f64 * scale;
        let z = i16::from_be_bytes([data[ofs + 4], data[ofs + 5]]) as f64 * scale;
        out.push([x, y, z]);
        ofs += 6;
    }
    out
}

fn encode_command(cmd: &str) -> Vec<u8> {
    let mut body: Vec<u8> = format!("X{cmd}\n").into_bytes();
    let len = body.len().saturating_sub(1);
    body[0] = len as u8;
    body
}

async fn adapter_or_err() -> Result<Adapter, String> {
    let manager = Manager::new().await.map_err(|e| e.to_string())?;
    let adapters = manager.adapters().await.map_err(|e| e.to_string())?;
    adapters
        .into_iter()
        .next()
        .ok_or_else(|| "No hay adaptador Bluetooth en este equipo.".to_string())
}

async fn find_muse(adapter: &Adapter) -> Result<Peripheral, String> {
    adapter
        .start_scan(ScanFilter {
            services: vec![parse_uuid(SERVICE_UUID)?],
        })
        .await
        .map_err(|e| e.to_string())?;

    let deadline = tokio::time::Instant::now() + Duration::from_secs(12);
    let mut found: Option<Peripheral> = None;

    while tokio::time::Instant::now() < deadline {
        let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;
        for p in peripherals {
            let props = p.properties().await.map_err(|e| e.to_string())?;
            let name = props
                .as_ref()
                .and_then(|p| p.local_name.as_ref())
                .map(|n| n.to_lowercase())
                .unwrap_or_default();
            if name.is_empty() || is_supported_muse2(&name) {
                found = Some(p);
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }

    adapter.stop_scan().await.ok();
    found.ok_or_else(|| {
        "No se encontró un Muse. Enciéndelo y acércalo al Mac.".to_string()
    })
}

fn char_map(chars: &[Characteristic]) -> HashMap<Uuid, Characteristic> {
    chars.iter().map(|c| (c.uuid, c.clone())).collect()
}

async fn write_cmd(peripheral: &Peripheral, control: &Characteristic, cmd: &str) -> Result<(), String> {
    peripheral
        .write(control, &encode_command(cmd), WriteType::WithoutResponse)
        .await
        .map_err(|e| format!("Comando Muse «{cmd}»: {e}"))
}

async fn muse_start_stream(peripheral: &Peripheral, control: &Characteristic) -> Result<(), String> {
    write_cmd(peripheral, control, "h").await?;
    tokio::time::sleep(Duration::from_millis(50)).await;
    write_cmd(peripheral, control, "p50").await?;
    tokio::time::sleep(Duration::from_millis(50)).await;
    write_cmd(peripheral, control, "s").await?;
    tokio::time::sleep(Duration::from_millis(50)).await;
    write_cmd(peripheral, control, "d").await?;
    tokio::time::sleep(Duration::from_millis(50)).await;
    write_cmd(peripheral, control, "v1").await?;
    Ok(())
}

async fn subscribe_eeg(
    app: AppHandle,
    peripheral: Peripheral,
    chars: HashMap<Uuid, Characteristic>,
) {
    let eeg_uuids: Vec<Uuid> = EEG_CHARS
        .iter()
        .filter_map(|s| parse_uuid(s).ok())
        .collect();

    for uuid in &eeg_uuids {
        let Some(ch) = chars.get(uuid) else {
            continue;
        };
        let _ = peripheral.subscribe(ch).await;
    }
    if let Ok(gyro) = parse_uuid(GYRO_CHAR) {
        if let Some(ch) = chars.get(&gyro) {
            let _ = peripheral.subscribe(ch).await;
        }
    }
    if let Ok(accel) = parse_uuid(ACCEL_CHAR) {
        if let Some(ch) = chars.get(&accel) {
            let _ = peripheral.subscribe(ch).await;
        }
    }

    let mut stream = match peripheral.notifications().await {
        Ok(s) => s,
        Err(_) => return,
    };

    let battery_uuid = parse_uuid(BATTERY_CHAR).ok();
    let gyro_uuid = parse_uuid(GYRO_CHAR).ok();
    let accel_uuid = parse_uuid(ACCEL_CHAR).ok();
    let eeg_index: HashMap<Uuid, u8> = eeg_uuids
        .into_iter()
        .enumerate()
        .map(|(i, u)| (u, i as u8))
        .collect();

    let mut last_eeg = tokio::time::Instant::now();

    while RUNNING.load(Ordering::SeqCst) {
        let notification = match tokio::time::timeout(EEG_TIMEOUT, stream.next()).await {
            Ok(Some(n)) => n,
            Ok(None) => break,
            Err(_) => {
                if last_eeg.elapsed() >= EEG_TIMEOUT {
                    RUNNING.store(false, Ordering::SeqCst);
                    break;
                }
                continue;
            }
        };
        let data = notification.value;
        let uuid = notification.uuid;

        if Some(uuid) == battery_uuid {
            if let Some(level) = decode_muse_battery(&data) {
                let percent = (level * 100.0).round() as u8;
                let _ = app.emit("muse-battery", MuseBatteryPayload { percent });
            }
        } else if Some(uuid) == gyro_uuid {
            let samples = decode_motion(&data, GYRO_SCALE);
            if !samples.is_empty() {
                let _ = app.emit(
                    "muse-motion",
                    MuseMotionPayload {
                        kind: "gyro".into(),
                        samples,
                    },
                );
            }
        } else if Some(uuid) == accel_uuid {
            let samples = decode_motion(&data, ACCEL_SCALE);
            if !samples.is_empty() {
                let _ = app.emit(
                    "muse-motion",
                    MuseMotionPayload {
                        kind: "accel".into(),
                        samples,
                    },
                );
            }
        } else if let Some(&ch) = eeg_index.get(&uuid) {
            let (packet_index, samples) = decode_12bit_eeg(&data);
            if !samples.is_empty() {
                last_eeg = tokio::time::Instant::now();
                let _ = app.emit(
                    "muse-eeg",
                    MuseEegPayload {
                        channel: ch,
                        samples,
                        timestamp_ms: epoch_ms(),
                        packet_index,
                    },
                );
            }
        }

        if last_eeg.elapsed() >= EEG_TIMEOUT {
            RUNNING.store(false, Ordering::SeqCst);
            break;
        }
    }
    let _ = app.emit("muse-disconnected", ());
}

#[tauri::command]
pub async fn muse_connect(app: AppHandle) -> Result<String, String> {
    muse_disconnect().await.ok();

    let adapter = adapter_or_err().await?;
    let peripheral = find_muse(&adapter).await?;

    peripheral.connect().await.map_err(|e| e.to_string())?;
    peripheral
        .discover_services()
        .await
        .map_err(|e| e.to_string())?;

    let service_uuid = parse_uuid(SERVICE_UUID)?;
    let chars = peripheral
        .characteristics()
        .into_iter()
        .filter(|c| c.service_uuid == service_uuid)
        .collect::<Vec<_>>();
    let map = char_map(&chars);

    let control_uuid = parse_uuid(CONTROL_CHAR)?;
    let control = map
        .get(&control_uuid)
        .ok_or("Característica de control no encontrada")?;

    let battery_uuid = parse_uuid(BATTERY_CHAR)?;
    if let Some(b) = map.get(&battery_uuid) {
        peripheral.subscribe(b).await.map_err(|e| e.to_string())?;
    }

    muse_start_stream(&peripheral, control).await?;

    let device_name = peripheral
        .properties()
        .await
        .ok()
        .flatten()
        .and_then(|p| p.local_name)
        .unwrap_or_else(|| "Muse".to_string());

    RUNNING.store(true, Ordering::SeqCst);
    let app_clone = app.clone();
    let peripheral_clone = peripheral.clone();
    let map_clone = map.clone();
    tokio::spawn(async move {
        subscribe_eeg(app_clone, peripheral_clone, map_clone).await;
    });

    *SESSION.lock().await = Some(MuseSession {
        peripheral: peripheral.clone(),
        device_name: device_name.clone(),
    });

    let _ = app.emit("muse-connected", serde_json::json!({ "name": device_name }));
    Ok(device_name)
}

#[tauri::command]
pub async fn muse_disconnect() -> Result<(), String> {
    RUNNING.store(false, Ordering::SeqCst);
    let mut guard = SESSION.lock().await;
    if let Some(session) = guard.take() {
        session.peripheral.disconnect().await.ok();
    }
    Ok(())
}

#[tauri::command]
pub async fn muse_is_native_available() -> bool {
    adapter_or_err().await.is_ok()
}
