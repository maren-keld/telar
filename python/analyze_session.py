#!/usr/bin/env python3
"""
Análisis post-sesión de neurofeedback (portado desde flask_app.py).
Lee datos por stdin: timestamp,TP9,FP1,FP2,TP10 separados por @
Marcadores: __NF_MARKER__,baseline_end,<ISO8601> divide reposo vs entrenamiento.
Se espera señal filtrada (1–50 Hz) — misma cadena que nf-session.js en vivo.
Línea 1 CSV: calm_s,att_s,0,0,relax,calm,att,baseline_calm,baseline_att,delta_calm,delta_att
  (slots 3–4 eran niveles 0/1/2; se dejan en 0 y no se usan)
Línea 2 JSON: {"post":[...], "spectral":{...}}
"""
from __future__ import annotations

import json
import sys
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.integrate import simpson
from scipy.signal import butter, filtfilt, iirnotch, welch

BANDS = {
    "Delta": (0.5, 4),
    "Theta": (4, 8),
    "Alpha": (8, 12),
    "Beta": (15, 20),
}

EPS = 1e-9
DELTA_WEIGHT = 0.7
WINDOW_SEC = 2.0
STEP_SEC = 1.0
# Keep in sync with src/lib/nf-bands.js
ARTIFACT_P2P_UV = 250.0
EMG_BETA_PCT = 32.0
EMG_P2P_UV = 220.0
BLINK_P2P_UV = 150.0
BLINK_WINDOW_SEC = 0.4
BLINK_RISE_SEC = 0.04
BLINK_RISE_UV = 100.0
STATE_Z = 0.0
NOMINAL_FS = 256.0
FS_DEV_WARN = 0.02
CHANNELS_FOR_CALM = ["TP9", "TP10"]
CHANNELS_FOR_ATT = ["FP1", "FP2"]
USE_ALL_CHANNELS = False
PRE_FILTERED_MIN_FS = 180
MARKER_PREFIX = "__NF_MARKER__"
EYE_CONDITION_DEFAULT = "open"


def bandpass_filter(data, lowcut, highcut, fs, order=2):
    nyq = 0.5 * fs
    highcut = min(highcut, nyq - 0.1)
    lowcut = max(lowcut, 0.01)
    if nyq <= 0 or lowcut >= highcut:
        return data
    b, a = butter(order, [lowcut / nyq, highcut / nyq], btype="band")
    return filtfilt(b, a, data)


def notch_filter(data, notch_freq, fs, Q=30):
    if fs <= 0:
        return data
    w0 = notch_freq / (fs / 2.0)
    if not (0 < w0 < 1):
        return data
    b, a = iirnotch(w0, Q)
    return filtfilt(b, a, data)


def _welch_psd(x, fs):
    if fs <= 0 or len(x) < 16:
        return None, None
    nperseg = max(16, min(len(x), int(fs * 2)))
    freqs, psd = welch(x, fs=fs, nperseg=nperseg)
    if len(freqs) < 2:
        return None, None
    return freqs, psd


def band_powers_subset_percent(x, fs) -> Dict[str, float]:
    freqs, psd = _welch_psd(x, fs)
    if freqs is None:
        return {k: 0.0 for k in BANDS}

    f_lo, f_hi = 0.5, min(30.0, fs / 2.0)
    idx_subset = (freqs >= f_lo) & (freqs <= f_hi)
    if not np.any(idx_subset):
        return {k: 0.0 for k in BANDS}

    dx = freqs[1] - freqs[0]
    total = simpson(psd[idx_subset], dx=dx)
    if total <= 0:
        return {k: 0.0 for k in BANDS}

    out: Dict[str, float] = {}
    for name, (lo, hi) in BANDS.items():
        hi_eff = min(hi, fs / 2.0)
        idx = (freqs >= lo) & (freqs <= hi_eff) & idx_subset
        if not np.any(idx):
            out[name] = 0.0
        else:
            bp = simpson(psd[idx], dx=dx)
            out[name] = (bp / total) * 100.0

    s = sum(out.values())
    if s > 0:
        for k in out:
            out[k] = out[k] * 100.0 / s
    return out


def band_powers_absolute(x, fs) -> Dict[str, float]:
    """Potencia absoluta por banda (µV²), integral de la PSD Welch."""
    freqs, psd = _welch_psd(x, fs)
    if freqs is None:
        return {k: 0.0 for k in BANDS}
    dx = freqs[1] - freqs[0]
    out: Dict[str, float] = {}
    for name, (lo, hi) in BANDS.items():
        hi_eff = min(hi, fs / 2.0)
        idx = (freqs >= lo) & (freqs <= hi_eff)
        if not np.any(idx):
            out[name] = 0.0
        else:
            out[name] = float(simpson(psd[idx], dx=dx))
    return out


def compute_indices_from_pct(p) -> Tuple[float, float]:
    d = max(p.get("Delta", 0.0), EPS)
    t = max(p.get("Theta", 0.0), EPS)
    a = max(p.get("Alpha", 0.0), EPS)
    b = max(p.get("Beta", 0.0), EPS)

    D, T, A, B = np.log(d), np.log(t), np.log(a), np.log(b)
    att_idx = B - np.log(np.exp(T) + DELTA_WEIGHT * np.exp(D) + EPS)
    calm_idx = np.log(np.exp(A) + np.exp(T) + EPS) - B
    return float(att_idx), float(calm_idx)


def sigmoid(z):
    z = np.clip(z, -40.0, 40.0)
    return 1.0 / (1.0 + np.exp(-z))


class RefZ:
    """Media/varianza por lote de la línea base (no EMA)."""

    def __init__(self):
        self.samples: List[float] = []
        self.init = False
        self.frozen = False
        self.mean = 0.0
        self.var = 1.0

    def update(self, x):
        if self.frozen:
            return
        self.samples.append(float(x))

    def z(self, x):
        return (x - self.mean) / np.sqrt(self.var)

    def freeze(self):
        n = len(self.samples)
        if n == 0:
            self.mean = 0.0
            self.var = 1.0
            self.init = False
        elif n == 1:
            self.mean = self.samples[0]
            self.var = 1.0
            self.init = True
        else:
            arr = np.asarray(self.samples, dtype=float)
            self.mean = float(arr.mean())
            self.var = max(float(arr.var(ddof=1)), 1e-6)
            self.init = True
        self.frozen = True


EMAZ = RefZ  # alias for older tests / snapshot helper


def ema_from_snapshot(stats: Optional[dict]) -> Optional[Tuple[RefZ, RefZ]]:
    if not stats:
        return None
    try:
        calm = RefZ()
        att = RefZ()
        calm.mean = float(stats["calm_mean"])
        calm.var = max(float(stats["calm_var"]), 1e-6)
        calm.init = True
        calm.frozen = True
        att.mean = float(stats["att_mean"])
        att.var = max(float(stats["att_var"]), 1e-6)
        att.init = True
        att.frozen = True
        return att, calm
    except (KeyError, TypeError, ValueError):
        return None


def _prepare_channel_signal(x, fs) -> Optional[np.ndarray]:
    if len(x) < int(fs * WINDOW_SEC * 0.25):
        return None
    try:
        if fs >= PRE_FILTERED_MIN_FS:
            return x
        xf = bandpass_filter(x, 1.0, 50.0, fs, order=2)
        xf = notch_filter(xf, 50.0, fs, Q=30)
        xf = notch_filter(xf, 60.0, fs, Q=30)
        return xf
    except Exception:
        return None


def avg_band_powers_for_channels(seg, channels, fs) -> Optional[Dict[str, float]]:
    per: List[Dict[str, float]] = []
    for e in channels:
        if e not in seg.columns:
            continue
        x = seg[e].dropna().to_numpy(dtype=float)
        xf = _prepare_channel_signal(x, fs)
        if xf is None:
            continue
        per.append(band_powers_subset_percent(xf, fs))
    if not per:
        return None
    return {k: float(np.mean([d.get(k, 0.0) for d in per])) for k in BANDS}


def avg_abs_powers_for_channels(df, channels, fs) -> Dict[str, Dict[str, float]]:
    out: Dict[str, Dict[str, float]] = {}
    for e in channels:
        if e not in df.columns:
            continue
        x = df[e].dropna().to_numpy(dtype=float)
        xf = _prepare_channel_signal(x, fs)
        if xf is None:
            continue
        out[e] = {k: round(v, 4) for k, v in band_powers_absolute(xf, fs).items()}
    return out


def _p2p(x: np.ndarray) -> float:
    if len(x) == 0:
        return 0.0
    return float(np.nanmax(x) - np.nanmin(x))


def _zero_crossings(x: np.ndarray) -> int:
    n = 0
    for i in range(1, len(x)):
        a, b = float(x[i - 1]), float(x[i])
        if (a < 0 and b >= 0) or (a > 0 and b <= 0):
            n += 1
    return n


def segment_has_blink(seg, fs) -> bool:
    n_win = max(8, int(round(fs * BLINK_WINDOW_SEC)))
    n_rise = max(2, int(round(fs * BLINK_RISE_SEC)))
    for e in ("FP1", "FP2"):
        if e not in seg.columns:
            continue
        x = seg[e].dropna().to_numpy(dtype=float)
        if len(x) < 8:
            continue

        def window_is_blink(win) -> bool:
            if _p2p(win) < BLINK_P2P_UV:
                return False
            if _zero_crossings(win) > 3:
                return False
            max_rise = 0.0
            nr = min(n_rise, max(1, len(win) - 1))
            for i in range(nr, len(win)):
                max_rise = max(max_rise, abs(float(win[i] - win[i - nr])))
            return max_rise >= BLINK_RISE_UV

        if len(x) < n_win:
            if window_is_blink(x):
                return True
            continue
        for start in range(0, len(x) - n_win + 1, max(1, n_win // 4)):
            if window_is_blink(x[start : start + n_win]):
                return True
    return False


def segment_is_artifact(seg, channels, fs) -> bool:
    if segment_has_blink(seg, fs):
        return True
    max_p2p = 0.0
    for e in channels:
        if e not in seg.columns:
            continue
        x = seg[e].dropna().to_numpy(dtype=float)
        if len(x) < 8:
            continue
        p2p = _p2p(x)
        max_p2p = max(max_p2p, p2p)
        if p2p > ARTIFACT_P2P_UV:
            return True
    p_att = avg_band_powers_for_channels(seg, CHANNELS_FOR_ATT, fs)
    beta = (p_att or {}).get("Beta", 0.0)
    if beta > EMG_BETA_PCT and max_p2p > EMG_P2P_UV:
        return True
    return False


def spectral_summary(df, fs: float) -> dict:
    channels_powers: Dict[str, Dict[str, float]] = {}
    channels_abs: Dict[str, Dict[str, float]] = {}
    for ch in ["TP9", "FP1", "FP2", "TP10"]:
        if ch not in df.columns:
            continue
        x = df[ch].dropna().to_numpy(dtype=float)
        xf = _prepare_channel_signal(x, fs)
        if xf is None:
            continue
        channels_powers[ch] = band_powers_subset_percent(xf, fs)
        channels_abs[ch] = {k: round(v, 4) for k, v in band_powers_absolute(xf, fs).items()}

    fp2 = channels_powers.get("FP2", {})
    fp1 = channels_powers.get("FP1", {})
    theta = fp2.get("Theta", 0.0)
    beta = max(fp2.get("Beta", 0.0), EPS)
    a1 = fp1.get("Alpha", 0.0)
    a2 = fp2.get("Alpha", 0.0)
    psd_out = {
        ch: {band: round(float(val), 1) for band, val in powers.items()}
        for ch, powers in channels_powers.items()
    }
    return {
        "theta_beta_fp2": round(theta / beta, 2),
        "alpha_asym_fp": round(a1 - a2, 1),
        "psd_channels": psd_out,
        "psd_abs_uv2": channels_abs,
    }


def _mean_sample_interval_sec(ts) -> float:
    if len(ts) < 2:
        return 0.0
    try:
        diffs = ts.to_series().diff().dt.total_seconds().dropna()
        return float(diffs.mean()) if len(diffs) else 0.0
    except Exception:
        time_ns = ts.astype("int64").to_numpy()
        diffs = np.diff(time_ns)
        unit = 1e9
        if len(diffs) and np.median(diffs) < 1e6:
            unit = 1e6
        return float(np.mean(diffs) / unit) if len(diffs) else 0.0


def estimate_fs(df) -> float:
    """fs efectivo desde timestamps reales. No redondea a 256."""
    mean_diff = _mean_sample_interval_sec(df.index)
    fs = 1.0 / mean_diff if mean_diff > 0 else 0.0
    if fs <= 0 or fs > 5000:
        return 0.0
    return float(fs)


def analyze_segments(
    df,
    ema_att: Optional[RefZ] = None,
    ema_calm: Optional[RefZ] = None,
    *,
    update_ema: bool = True,
    skip_artifacts: bool = True,
) -> Tuple[int, int, float, float, float, List[dict], float]:
    ts = df.index
    if len(ts) < 2:
        return 0, 0, 0.0, 0.0, 0.0, [], 0.0

    fs = estimate_fs(df)
    if fs <= 0:
        return 0, 0, 0.0, 0.0, 0.0, [], 0.0

    start, end = ts[0], ts[-1]
    total_duration = (end - start).total_seconds()
    if total_duration < WINDOW_SEC:
        return 0, 0, 0.0, 0.0, 0.0, [], 0.0

    num_steps = int(np.floor((total_duration - WINDOW_SEC) / STEP_SEC)) + 1
    if num_steps <= 0:
        return 0, 0, 0.0, 0.0, 0.0, [], 0.0

    if ema_att is None:
        ema_att = RefZ()
    if ema_calm is None:
        ema_calm = RefZ()

    calm_seconds = att_seconds = effective_seconds = 0.0
    relax_accum = calm_accum = att_accum = 0.0
    relax_count = calm_count = att_count = 0
    series: List[dict] = []
    artifact_windows = 0
    total_windows = 0

    calm_ch = ["TP9", "FP1", "FP2", "TP10"] if USE_ALL_CHANNELS else CHANNELS_FOR_CALM
    att_ch = ["TP9", "FP1", "FP2", "TP10"] if USE_ALL_CHANNELS else CHANNELS_FOR_ATT
    check_ch = list(dict.fromkeys(calm_ch + att_ch))

    for i in range(num_steps):
        seg_start = start + pd.Timedelta(seconds=i * STEP_SEC)
        seg_end = seg_start + pd.Timedelta(seconds=WINDOW_SEC)
        seg = df[(df.index >= seg_start) & (df.index < seg_end)]
        if seg.empty:
            continue
        total_windows += 1
        if segment_is_artifact(seg, check_ch, fs):
            artifact_windows += 1
            if skip_artifacts:
                continue

        p_calm = avg_band_powers_for_channels(seg, calm_ch, fs)
        p_att = avg_band_powers_for_channels(seg, att_ch, fs)
        if p_calm is None and p_att is None:
            continue

        p_use_for_calm = p_calm if p_calm is not None else p_att
        p_use_for_att = p_att if p_att is not None else p_calm

        att_idx, _ = compute_indices_from_pct(p_use_for_att)
        _, calm_idx = compute_indices_from_pct(p_use_for_calm)

        if update_ema:
            ema_att.update(att_idx)
            ema_calm.update(calm_idx)

        z_att = ema_att.z(att_idx)
        z_calm = ema_calm.z(calm_idx)
        attention_pct = 100.0 * sigmoid(z_att)
        calm_pct = 100.0 * sigmoid(z_calm)

        p_avg = p_use_for_calm or p_use_for_att or {}
        alpha = p_avg.get("Alpha", 0.0)
        theta = p_avg.get("Theta", 0.0)
        relax_pct = alpha + theta * 0.5
        relax_accum += relax_pct
        calm_accum += calm_pct
        att_accum += attention_pct
        relax_count += 1
        calm_count += 1
        att_count += 1

        series.append(
            {
                "t": round(i * STEP_SEC, 2),
                "calm": round(calm_pct, 1),
                "att": round(attention_pct, 1),
            }
        )

        if z_att > STATE_Z:
            att_seconds += STEP_SEC
        if z_calm > STATE_Z:
            calm_seconds += STEP_SEC
        effective_seconds += STEP_SEC

    artifact_pct = round(100.0 * artifact_windows / max(total_windows, 1), 1)
    if effective_seconds <= 0:
        return 0, 0, 0.0, 0.0, 0.0, series, artifact_pct

    r_avg = relax_accum / max(relax_count, 1)
    c_avg = calm_accum / max(calm_count, 1)
    a_avg = att_accum / max(att_count, 1)

    return (
        int(round(calm_seconds)),
        int(round(att_seconds)),
        round(r_avg, 1),
        round(c_avg, 1),
        round(a_avg, 1),
        series,
        artifact_pct,
    )


def parse_input(
    text_data: str,
) -> Tuple[pd.DataFrame, Optional[pd.Timestamp], Optional[dict], Optional[dict], Optional[str]]:
    lines = text_data.strip().split("@")
    parsed = []
    baseline_end: Optional[pd.Timestamp] = None
    baseline_stats: Optional[dict] = None
    stream_stats: Optional[dict] = None
    eye_condition: Optional[str] = None
    for line in lines:
        if not line.strip():
            continue
        if line.startswith(MARKER_PREFIX):
            fields = [f.strip() for f in line.split(",")]
            if len(fields) >= 3 and fields[1] == "baseline_end":
                baseline_end = pd.to_datetime(fields[2], errors="coerce", utc=True)
            elif len(fields) >= 7 and fields[1] == "baseline_stats":
                try:
                    baseline_stats = {
                        "calm_mean": float(fields[3]),
                        "calm_var": float(fields[4]),
                        "att_mean": float(fields[5]),
                        "att_var": float(fields[6]),
                    }
                except ValueError:
                    baseline_stats = None
            elif len(fields) >= 6 and fields[1] == "stream_stats":
                try:
                    stream_stats = {
                        "packets_lost": int(float(fields[3])),
                        "packets_expected": int(float(fields[4])),
                        "effective_fs": float(fields[5]),
                    }
                except ValueError:
                    stream_stats = None
            elif len(fields) >= 4 and fields[1] == "eye_condition":
                eye_condition = fields[3] or None
            continue
        if "," not in line:
            continue
        fields = [f.strip() for f in line.split(",")]
        if len(fields) >= 5:
            parsed.append(fields[:5])
    if not parsed:
        raise ValueError("Sin datos válidos")

    df = pd.DataFrame(parsed, columns=["timestamp", "TP9", "FP1", "FP2", "TP10"])
    for e in ["TP9", "FP1", "FP2", "TP10"]:
        df[e] = pd.to_numeric(df[e], errors="coerce")
        if df[e].notna().any():
            df[e] = df[e].ffill().bfill()
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    df.dropna(subset=["timestamp"], inplace=True)
    df.sort_values("timestamp", inplace=True)
    if df["timestamp"].duplicated().any():
        dup_rank = df.groupby("timestamp", sort=False).cumcount()
        df["timestamp"] = df["timestamp"] + pd.to_timedelta(dup_rank / NOMINAL_FS, unit="s")
    df.set_index("timestamp", inplace=True)
    return df, baseline_end, baseline_stats, stream_stats, eye_condition


def split_baseline_training(
    df: pd.DataFrame, baseline_end: Optional[pd.Timestamp]
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    if baseline_end is None:
        return df.iloc[0:0], df
    df_base = df[df.index < baseline_end]
    df_train = df[df.index >= baseline_end]
    if len(df_train) < 2:
        return df_base, df.iloc[0:0]
    return df_base, df_train


def empty_summary() -> Tuple[int, int, float, float, float, List[dict], float]:
    return 0, 0, 0.0, 0.0, 0.0, [], 0.0


def _fs_meta(fs: float) -> dict:
    if fs <= 0:
        return {"fs_hz": 0, "fs_nominal": NOMINAL_FS, "fs_off_nominal": False}
    dev = abs(fs - NOMINAL_FS) / NOMINAL_FS
    meta = {
        "fs_hz": round(fs, 2),
        "fs_nominal": NOMINAL_FS,
        "fs_deviation_pct": round(dev * 100, 2),
        "fs_off_nominal": bool(dev > FS_DEV_WARN),
    }
    return meta


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--file":
        with open(sys.argv[2], encoding="utf-8") as f:
            text_data = f.read()
    else:
        text_data = sys.stdin.read()
    if not text_data.strip():
        print("0,0,0,0,0,0,0,,,,")
        print(json.dumps({"post": [], "spectral": {"has_baseline": False}}))
        return

    try:
        df, baseline_end, baseline_stats, stream_stats, eye_condition = parse_input(text_data)
        df_base, df_train = split_baseline_training(df, baseline_end)

        if len(df_base) >= 2:
            ema_att, ema_calm = RefZ(), RefZ()
            analyze_segments(df_base, ema_att, ema_calm, update_ema=True, skip_artifacts=True)
            ema_att.freeze()
            ema_calm.freeze()
        else:
            ema_pair = ema_from_snapshot(baseline_stats)
            if ema_pair is not None:
                ema_att, ema_calm = ema_pair
            else:
                ema_att, ema_calm = RefZ(), RefZ()

        has_baseline = bool(ema_att.init and ema_calm.init and (len(df_base) >= 2 or baseline_stats))

        if len(df_base) >= 2:
            b_calm_s, b_att_s, _, b_calm, b_att, _, _ = analyze_segments(
                df_base, ema_att, ema_calm, update_ema=False, skip_artifacts=True
            )
        else:
            b_calm_s, b_att_s, b_calm, b_att = 0, 0, 0.0, 0.0

        if len(df_train) >= 2:
            t_calm_s, t_att_s, relax, calm, att, post_series, artifact_pct = analyze_segments(
                df_train, ema_att, ema_calm, update_ema=False, skip_artifacts=True
            )
        else:
            t_calm_s, t_att_s, relax, calm, att, post_series, artifact_pct = empty_summary()

        if has_baseline:
            delta_calm = round(calm - b_calm, 1)
            delta_att = round(att - b_att, 1)
            b_calm_out = round(b_calm, 1)
            b_att_out = round(b_att, 1)
            delta_calm_csv, delta_att_csv = str(delta_calm), str(delta_att)
            b_calm_csv, b_att_csv = str(b_calm_out), str(b_att_out)
        else:
            delta_calm = delta_att = None
            b_calm_out = b_att_out = None
            delta_calm_csv = delta_att_csv = ""
            b_calm_csv = b_att_csv = ""

        fs_train = estimate_fs(df_train) if len(df_train) >= 2 else 0.0
        fs_all = estimate_fs(df)
        fs_use = fs_train if fs_train > 0 else fs_all
        spectral = spectral_summary(df_train if len(df_train) >= 2 else df, fs_use) if fs_use > 0 else {}
        spectral["artifact_pct"] = artifact_pct
        spectral["has_baseline"] = has_baseline
        spectral["eye_condition"] = eye_condition or EYE_CONDITION_DEFAULT
        spectral.update(_fs_meta(fs_all if fs_all > 0 else fs_use))
        if has_baseline and len(df_base) >= 2 and fs_use > 0:
            spectral["psd_abs_baseline_uv2"] = avg_abs_powers_for_channels(
                df_base, ["TP9", "FP1", "FP2", "TP10"], estimate_fs(df_base) or fs_use
            )
        if len(df_train) >= 2 and fs_use > 0:
            spectral["psd_abs_training_uv2"] = avg_abs_powers_for_channels(
                df_train, ["TP9", "FP1", "FP2", "TP10"], fs_use
            )
        if stream_stats:
            spectral["packets_lost"] = stream_stats.get("packets_lost")
            spectral["packets_expected"] = stream_stats.get("packets_expected")
            if stream_stats.get("effective_fs"):
                spectral["effective_fs"] = round(float(stream_stats["effective_fs"]), 2)
        if not has_baseline:
            spectral["delta_calm_pct"] = None
            spectral["delta_attentive_pct"] = None

        print(
            f"{t_calm_s},{t_att_s},0,0,{relax},{calm},{att},"
            f"{b_calm_csv},{b_att_csv},{delta_calm_csv},{delta_att_csv}"
        )
        print(json.dumps({"post": post_series, "spectral": spectral}))
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"Error en análisis: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
