#!/usr/bin/env python3
"""
Análisis post-sesión de neurofeedback (portado desde flask_app.py).
Lee datos por stdin: timestamp,TP9,FP1,FP2,TP10 separados por @
Marcadores: __NF_MARKER__,baseline_end,<ISO8601> divide reposo vs entrenamiento.
Se espera señal filtrada (1–50 Hz) a ~256 Hz — misma cadena que nf-session.js en vivo.
Línea 1 CSV: calm_s,att_s,calm_lvl,att_lvl,relax,calm,att,baseline_calm,baseline_att,delta_calm,delta_att
Línea 2 JSON: {"post":[{"t":0,"calm":..,"att":..},...]}
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
    "Beta": (13, 30),
}

EPS = 1e-9
DELTA_WEIGHT = 0.7
WINDOW_SEC = 2.0
STEP_SEC = 1.0
EMA_ALPHA = 0.06
STATE_START_PCT = 35.0
CHANNELS_FOR_CALM = ["TP9", "TP10"]
CHANNELS_FOR_ATT = ["FP2"]
USE_ALL_CHANNELS = False
ARTIFACT_P2P_UV = 2500.0
EMG_BETA_PCT = 32.0
EMG_P2P_UV = 1100.0
PRE_FILTERED_MIN_FS = 180
MARKER_PREFIX = "__NF_MARKER__"


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


def band_powers_subset_percent(x, fs) -> Dict[str, float]:
    if fs <= 0 or len(x) < 16:
        return {k: 0.0 for k in BANDS}

    nperseg = max(16, min(len(x), int(fs * 2)))
    freqs, psd = welch(x, fs=fs, nperseg=nperseg)
    if len(freqs) < 2:
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
    return 1.0 / (1.0 + np.exp(-z))


def level_from_ratio(r):
    if r >= 0.66:
        return 2
    if r >= 0.33:
        return 1
    return 0


class EMAZ:
    def __init__(self, alpha=EMA_ALPHA):
        self.a = alpha
        self.init = False
        self.mean = 0.0
        self.var = 1.0

    def update(self, x):
        if not self.init:
            self.mean = float(x)
            self.var = 1.0
            self.init = True
            return
        a = self.a
        m_prev = self.mean
        self.mean = (1 - a) * self.mean + a * x
        self.var = (1 - a) * self.var + a * (x - m_prev) * (x - m_prev)
        self.var = max(self.var, 1e-6)

    def z(self, x):
        return (x - self.mean) / np.sqrt(self.var)


def _prepare_channel_signal(x, fs) -> Optional[np.ndarray]:
    if len(x) < int(fs * WINDOW_SEC * 0.25):
        return None
    p2p = float(np.nanmax(x) - np.nanmin(x)) if len(x) else 0.0
    if p2p > ARTIFACT_P2P_UV:
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


def segment_is_artifact(seg, channels, fs) -> bool:
    for e in channels:
        if e not in seg.columns:
            continue
        x = seg[e].dropna().to_numpy(dtype=float)
        if len(x) < 8:
            continue
        p2p = float(np.nanmax(x) - np.nanmin(x)) if len(x) else 0.0
        if p2p > ARTIFACT_P2P_UV:
            return True
    p_att = avg_band_powers_for_channels(seg, ["FP2"], fs)
    beta = (p_att or {}).get("Beta", 0.0)
    max_p2p = 0.0
    for e in channels:
        if e not in seg.columns:
            continue
        x = seg[e].dropna().to_numpy(dtype=float)
        if len(x):
            max_p2p = max(max_p2p, float(np.nanmax(x) - np.nanmin(x)))
    if beta > EMG_BETA_PCT and max_p2p > EMG_P2P_UV:
        return True
    return False


def spectral_summary(df, fs: int) -> dict:
    channels_powers: Dict[str, Dict[str, float]] = {}
    for ch in ["TP9", "FP1", "FP2", "TP10"]:
        if ch not in df.columns:
            continue
        x = df[ch].dropna().to_numpy(dtype=float)
        xf = _prepare_channel_signal(x, fs)
        if xf is None:
            continue
        channels_powers[ch] = band_powers_subset_percent(xf, fs)

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
    }


def analyze_segments(df) -> Tuple[int, int, int, int, float, float, float, List[dict], float]:
    ts = df.index
    if len(ts) < 2:
        return 0, 0, 0, 0, 0.0, 0.0, 0.0, [], 0.0

    try:
        diffs = ts.to_series().diff().dt.total_seconds().dropna()
        mean_diff = float(diffs.mean()) if len(diffs) else 0.0
    except Exception:
        time_ns = ts.astype("int64").to_numpy()
        diffs = np.diff(time_ns)
        unit = 1e9
        if len(diffs) and np.median(diffs) < 1e6:
            unit = 1e6
        mean_diff = float(np.mean(diffs) / unit) if len(diffs) else 0.0
    fs = 1.0 / mean_diff if mean_diff > 0 else 0.0
    if fs <= 0 or fs > 5000:
        return 0, 0, 0, 0, 0.0, 0.0, 0.0, [], 0.0, 0.0
    fs = int(round(fs))

    start, end = ts[0], ts[-1]
    total_duration = (end - start).total_seconds()
    if total_duration < WINDOW_SEC:
        return 0, 0, 0, 0, 0.0, 0.0, 0.0, [], 0.0

    num_steps = int(np.floor((total_duration - WINDOW_SEC) / STEP_SEC)) + 1
    if num_steps <= 0:
        return 0, 0, 0, 0, 0.0, 0.0, 0.0, [], 0.0

    ema_att = EMAZ(alpha=EMA_ALPHA)
    ema_calm = EMAZ(alpha=EMA_ALPHA)
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

        p_calm = avg_band_powers_for_channels(seg, calm_ch, fs)
        p_att = avg_band_powers_for_channels(seg, att_ch, fs)
        if p_calm is None and p_att is None:
            continue

        p_use_for_calm = p_calm if p_calm is not None else p_att
        p_use_for_att = p_att if p_att is not None else p_calm

        att_idx, _ = compute_indices_from_pct(p_use_for_att)
        _, calm_idx = compute_indices_from_pct(p_use_for_calm)

        ema_att.update(att_idx)
        ema_calm.update(calm_idx)

        attention_pct = 100.0 * sigmoid(ema_att.z(att_idx))
        calm_pct = 100.0 * sigmoid(ema_calm.z(calm_idx))

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

        if attention_pct >= STATE_START_PCT:
            att_seconds += STEP_SEC
        if calm_pct >= STATE_START_PCT:
            calm_seconds += STEP_SEC
        effective_seconds += STEP_SEC

    if effective_seconds <= 0:
        artifact_pct = round(100.0 * artifact_windows / max(total_windows, 1), 1)
        return 0, 0, 0, 0, 0.0, 0.0, 0.0, series, artifact_pct

    calm_ratio = calm_seconds / effective_seconds
    att_ratio = att_seconds / effective_seconds
    calm_level = level_from_ratio(calm_ratio)
    att_level = level_from_ratio(att_ratio)

    r_avg = relax_accum / max(relax_count, 1)
    c_avg = calm_accum / max(calm_count, 1)
    a_avg = att_accum / max(att_count, 1)
    artifact_pct = round(100.0 * artifact_windows / max(total_windows, 1), 1)

    return (
        int(round(calm_seconds)),
        int(round(att_seconds)),
        calm_level,
        att_level,
        round(r_avg, 1),
        round(c_avg, 1),
        round(a_avg, 1),
        series,
        artifact_pct,
    )


def parse_input(text_data: str) -> Tuple[pd.DataFrame, Optional[pd.Timestamp]]:
    lines = text_data.strip().split("@")
    parsed = []
    baseline_end: Optional[pd.Timestamp] = None
    for line in lines:
        if not line.strip():
            continue
        if line.startswith(MARKER_PREFIX):
            fields = [f.strip() for f in line.split(",")]
            if len(fields) >= 3 and fields[1] == "baseline_end":
                baseline_end = pd.to_datetime(fields[2], errors="coerce", utc=True)
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
        df["timestamp"] = df["timestamp"] + pd.to_timedelta(dup_rank / 256.0, unit="s")
    df.set_index("timestamp", inplace=True)
    return df, baseline_end


def split_baseline_training(
    df: pd.DataFrame, baseline_end: Optional[pd.Timestamp]
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    if baseline_end is None:
        return df.iloc[0:0], df
    df_base = df[df.index < baseline_end]
    df_train = df[df.index >= baseline_end]
    if len(df_train) < 2:
        return df.iloc[0:0], df
    return df_base, df_train


def empty_summary() -> Tuple[int, int, int, int, float, float, float, List[dict], float]:
    return 0, 0, 0, 0, 0.0, 0.0, 0.0, [], 0.0


def estimate_fs(df) -> int:
    ts = df.index
    if len(ts) < 2:
        return 0
    try:
        diffs = ts.to_series().diff().dt.total_seconds().dropna()
        mean_diff = float(diffs.mean()) if len(diffs) else 0.0
    except Exception:
        time_ns = ts.astype("int64").to_numpy()
        diffs = np.diff(time_ns)
        unit = 1e9
        if len(diffs) and np.median(diffs) < 1e6:
            unit = 1e6
        mean_diff = float(np.mean(diffs) / unit) if len(diffs) else 0.0
    fs = 1.0 / mean_diff if mean_diff > 0 else 0.0
    if fs <= 0 or fs > 5000:
        return 0
    return int(round(fs))


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--file":
        with open(sys.argv[2], encoding="utf-8") as f:
            text_data = f.read()
    else:
        text_data = sys.stdin.read()
    if not text_data.strip():
        print("0,0,0,0,0,0,0,0,0,0,0")
        print(json.dumps({"post": [], "spectral": {}}))
        return

    try:
        df, baseline_end = parse_input(text_data)
        df_base, df_train = split_baseline_training(df, baseline_end)

        if len(df_train) < 2:
            df_train = df
            df_base = df.iloc[0:0]

        b_calm_s, b_att_s, _, _, _, b_calm, b_att, _, _ = (
            analyze_segments(df_base) if len(df_base) >= 2 else empty_summary()
        )
        t_calm_s, t_att_s, t_calm_lvl, t_att_lvl, relax, calm, att, post_series, artifact_pct = (
            analyze_segments(df_train)
        )

        has_baseline = len(df_base) >= 2 and (b_calm > 0 or b_att > 0)
        delta_calm = round(calm - b_calm, 1) if has_baseline else 0.0
        delta_att = round(att - b_att, 1) if has_baseline else 0.0
        b_calm_out = round(b_calm, 1) if has_baseline else 0.0
        b_att_out = round(b_att, 1) if has_baseline else 0.0

        fs = estimate_fs(df_train)
        spectral = spectral_summary(df_train, fs) if fs > 0 else {}
        spectral["artifact_pct"] = artifact_pct

        print(
            f"{t_calm_s},{t_att_s},{t_calm_lvl},{t_att_lvl},{relax},{calm},{att},"
            f"{b_calm_out},{b_att_out},{delta_calm},{delta_att}"
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
