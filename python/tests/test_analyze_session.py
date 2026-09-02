import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from io import StringIO
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import analyze_session


def deterministic_recording(frequency_hz: float, seconds: int = 4, fs: int = 256, amplitude: float = 100) -> str:
    start = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    rows = []
    for index in range(seconds * fs):
        timestamp = (start + timedelta(seconds=index / fs)).isoformat(timespec="microseconds")
        value = amplitude * np.sin((2 * np.pi * frequency_hz * index) / fs)
        channels = [value, value * 0.95, value * 1.05, value]
        rows.append(f"{timestamp}," + ",".join(f"{channel:.6f}" for channel in channels))
    return "@".join(rows)


def recording_with_baseline(freq_base: float, freq_train: float, seconds: int = 4, fs: int = 256) -> str:
    start = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    rows = []
    n = seconds * fs
    for index in range(n):
        timestamp = (start + timedelta(seconds=index / fs)).isoformat(timespec="microseconds")
        value = 100 * np.sin((2 * np.pi * freq_base * index) / fs)
        channels = [value, value * 0.95, value * 1.05, value]
        rows.append(f"{timestamp}," + ",".join(f"{channel:.6f}" for channel in channels))
    marker_t = start + timedelta(seconds=seconds)
    rows.append(f"__NF_MARKER__,baseline_end,{marker_t.isoformat()}")
    for index in range(n):
        timestamp = (marker_t + timedelta(seconds=index / fs)).isoformat(timespec="microseconds")
        value = 100 * np.sin((2 * np.pi * freq_train * index) / fs)
        channels = [value, value * 0.95, value * 1.05, value]
        rows.append(f"{timestamp}," + ",".join(f"{channel:.6f}" for channel in channels))
    return "@".join(rows)


def blink_segment(fs: int = 256, seconds: int = 2, p2p_uv: float = 200) -> str:
    start = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    n = seconds * fs
    pulse_n = int(fs * 0.15)
    pulse_at = n - pulse_n - 8
    rows = []
    for index in range(n):
        timestamp = (start + timedelta(seconds=index / fs)).isoformat(timespec="microseconds")
        fp = 0.0
        if pulse_at <= index < pulse_at + pulse_n:
            fp = p2p_uv * np.sin(np.pi * (index - pulse_at) / pulse_n)
        rows.append(f"{timestamp},10.0,{fp:.6f},{fp:.6f},10.0")
    return "@".join(rows)


def run_analyzer(text: str) -> tuple[str, dict]:
    buf_in = StringIO(text)
    buf_out = StringIO()
    old_in, old_out = sys.stdin, sys.stdout
    sys.stdin, sys.stdout = buf_in, buf_out
    try:
        analyze_session.main()
    finally:
        sys.stdin, sys.stdout = old_in, old_out
    lines = [ln for ln in buf_out.getvalue().strip().splitlines() if ln]
    payload = json.loads(lines[1]) if len(lines) > 1 else {}
    return lines[0], payload


class AnalyzeSessionGoldenRecordingTests(unittest.TestCase):
    def test_deterministic_recording_preserves_256_hz_sampling(self):
        frame, marker, *_ = analyze_session.parse_input(deterministic_recording(10))

        self.assertIsNone(marker)
        self.assertEqual(len(frame), 1024)
        self.assertAlmostEqual(analyze_session.estimate_fs(frame), 256, delta=0.5)

    def test_fs_off_nominal_is_reported_not_forced_to_256(self):
        start = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
        fs = 200
        rows = []
        for index in range(4 * fs):
            timestamp = (start + timedelta(seconds=index / fs)).isoformat(timespec="microseconds")
            rows.append(f"{timestamp},20,20,20,20")
        csv, payload = run_analyzer("@".join(rows))
        spec = payload["spectral"]
        self.assertTrue(spec["fs_off_nominal"])
        self.assertAlmostEqual(spec["fs_hz"], 200, delta=1)

    def test_deterministic_alpha_recording_has_alpha_dominance(self):
        frame, *_ = analyze_session.parse_input(deterministic_recording(10))
        powers = analyze_session.avg_band_powers_for_channels(
            frame,
            ["TP9", "FP1", "FP2", "TP10"],
            256,
        )

        self.assertIsNotNone(powers)
        self.assertGreater(powers["Alpha"], 90)
        self.assertGreater(powers["Alpha"], powers["Beta"])

    def test_deterministic_beta_recording_has_beta_dominance(self):
        frame, *_ = analyze_session.parse_input(deterministic_recording(20))
        powers = analyze_session.avg_band_powers_for_channels(
            frame,
            ["TP9", "FP1", "FP2", "TP10"],
            256,
        )

        self.assertIsNotNone(powers)
        self.assertGreater(powers["Beta"], 90)
        self.assertGreater(powers["Beta"], powers["Alpha"])

    def test_realistic_motion_is_rejected_as_artifact(self):
        frame, *_ = analyze_session.parse_input(deterministic_recording(10, amplitude=40))
        frame.iloc[100, frame.columns.get_loc("TP9")] = 300
        frame.iloc[101, frame.columns.get_loc("TP9")] = -300

        self.assertTrue(
            analyze_session.segment_is_artifact(
                frame.iloc[50:200],
                ["TP9", "FP1", "FP2", "TP10"],
                256,
            )
        )

    def test_blink_200uv_is_artifact_clean_alpha_is_not(self):
        blink, *_ = analyze_session.parse_input(blink_segment(p2p_uv=200))
        alpha, *_ = analyze_session.parse_input(deterministic_recording(10, seconds=2, amplitude=40))
        self.assertTrue(analyze_session.segment_has_blink(blink, 256))
        self.assertFalse(analyze_session.segment_has_blink(alpha, 256))
        self.assertFalse(
            analyze_session.segment_is_artifact(alpha, ["TP9", "FP1", "FP2", "TP10"], 256)
        )

    def test_baseline_end_marker_produces_real_deltas(self):
        text = recording_with_baseline(10, 20)
        frame, marker, *_ = analyze_session.parse_input(text)
        self.assertIsNotNone(marker)
        base, train = analyze_session.split_baseline_training(frame, marker)
        self.assertGreater(len(base), 100)
        self.assertGreater(len(train), 100)

        csv, payload = run_analyzer(text)
        spec = payload["spectral"]
        self.assertTrue(spec["has_baseline"])
        delta_calm = float(csv.split(",")[9])
        self.assertNotAlmostEqual(delta_calm, 0.0, delta=0.5)
        self.assertLess(delta_calm, 0)

    def test_no_baseline_does_not_fake_zero_delta(self):
        _, payload = run_analyzer(deterministic_recording(10))
        spec = payload["spectral"]
        self.assertFalse(spec["has_baseline"])
        self.assertIsNone(spec.get("delta_calm_pct"))
