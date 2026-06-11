#!/usr/bin/env python3
"""
Análisis post-sesión de neurofeedback (portado desde flask_app.py).
Lee datos por stdin en formato: timestamp,TP9,FP1,FP2,TP10 separados por @
Imprime CSV: calm_seconds,attention_seconds,calm_level,attention_level,relax_pct,calm_pct,attent_pct
"""
from __future__ import annotations

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
WINDOW_SEC = 4.0
STEP_SEC = 2.0
EMA_ALPHA = 0.06
STATE_START_PCT = 60.0
CHANNELS_FOR_CALM = ["TP9", "TP10"]
CHANNELS_FOR_ATT = ["FP2"]
USE_ALL_CHANNELS = False
ARTIFACT_P2P_UV = 800.0


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


def avg_band_powers_for_channels(seg, channels, fs) -> Optional[Dict[str, float]]:
    per: List[Dict[str, float]] = []
    for e in channels:
        if e not in seg.columns:
            continue
        x = seg[e].dropna().to_numpy(dtype=float)
        if len(x) < int(fs * WINDOW_SEC * 0.5):
            continue
        p2p = float(np.nanmax(x) - np.nanmin(x)) if len(x) else 0.0
        if p2p > ARTIFACT_P2P_UV:
            continue
        try:
            xf = bandpass_filter(x, 1.0, 50.0, fs, order=2)
            xf = notch_filter(xf, 50.0, fs, Q=30)
            xf = notch_filter(xf, 60.0, fs, Q=30)
        except Exception:
            continue
        per.append(band_powers_subset_percent(xf, fs))
    if not per:
        return None
    return {k: float(np.mean([d.get(k, 0.0) for d in per])) for k in BANDS}


def analyze_segments(df) -> Tuple[int, int, int, int, float, float, float]:
    ts = df.index
    if len(ts) < 2:
        return 0, 0, 0, 0, 0.0, 0.0, 0.0

    try:
        time_ns = ts.astype("int64").to_numpy()
    except Exception:
        time_ns = ts.view("int64")

    diffs = np.diff(time_ns) / 1e9
    mean_diff = float(np.mean(diffs)) if len(diffs) else 0.0
    fs = 1.0 / mean_diff if mean_diff > 0 else 0.0
    if fs <= 0 or fs > 5000:
        return 0, 0, 0, 0, 0.0, 0.0, 0.0
    fs = int(round(fs))

    start, end = ts[0], ts[-1]
    total_duration = (end - start).total_seconds()
    if total_duration < WINDOW_SEC:
        return 0, 0, 0, 0, 0.0, 0.0, 0.0

    num_steps = int(np.floor((total_duration - WINDOW_SEC) / STEP_SEC)) + 1
    if num_steps <= 0:
        return 0, 0, 0, 0, 0.0, 0.0, 0.0

    ema_att = EMAZ(alpha=EMA_ALPHA)
    ema_calm = EMAZ(alpha=EMA_ALPHA)
    calm_seconds = att_seconds = effective_seconds = 0.0
    relax_accum = calm_accum = att_accum = 0.0
    relax_count = calm_count = att_count = 0

    calm_ch = ["TP9", "FP1", "FP2", "TP10"] if USE_ALL_CHANNELS else CHANNELS_FOR_CALM
    att_ch = ["TP9", "FP1", "FP2", "TP10"] if USE_ALL_CHANNELS else CHANNELS_FOR_ATT

    for i in range(num_steps):
        seg_start = start + pd.Timedelta(seconds=i * STEP_SEC)
        seg_end = seg_start + pd.Timedelta(seconds=WINDOW_SEC)
        seg = df[(df.index >= seg_start) & (df.index < seg_end)]
        if seg.empty:
            continue

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

        if attention_pct >= STATE_START_PCT:
            att_seconds += STEP_SEC
        if calm_pct >= STATE_START_PCT:
            calm_seconds += STEP_SEC
        effective_seconds += STEP_SEC

    if effective_seconds <= 0:
        return 0, 0, 0, 0, 0.0, 0.0, 0.0

    calm_ratio = calm_seconds / effective_seconds
    att_ratio = att_seconds / effective_seconds
    calm_level = level_from_ratio(calm_ratio)
    att_level = level_from_ratio(att_ratio)

    r_pct = relax_accum / max(relax_count, 1)
    c_pct = calm_accum / max(calm_count, 1)
    a_pct = att_accum / max(att_count, 1)
    total = r_pct + c_pct + a_pct
    if total > 0:
        r_pct, c_pct, a_pct = (r_pct * 100 / total, c_pct * 100 / total, a_pct * 100 / total)

    return (
        int(round(calm_seconds)),
        int(round(att_seconds)),
        calm_level,
        att_level,
        round(r_pct, 1),
        round(c_pct, 1),
        round(a_pct, 1),
    )


def parse_input(text_data: str) -> pd.DataFrame:
    lines = text_data.strip().split("@")
    parsed = []
    for line in lines:
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
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    df.dropna(subset=["timestamp"], inplace=True)
    df.sort_values("timestamp", inplace=True)
    df.set_index("timestamp", inplace=True)
    return df


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--file":
        with open(sys.argv[2], encoding="utf-8") as f:
            text_data = f.read()
    else:
        text_data = sys.stdin.read()
    if not text_data.strip():
        print("0,0,0,0,0,0,0")
        return

    try:
        df = parse_input(text_data)
        calm_s, att_s, calm_lvl, att_lvl, relax, calm, att = analyze_segments(df)
        print(f"{calm_s},{att_s},{calm_lvl},{att_lvl},{relax},{calm},{att}")
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
