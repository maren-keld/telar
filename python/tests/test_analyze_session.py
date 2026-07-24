import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import analyze_session


def deterministic_recording(frequency_hz: float, seconds: int = 4, fs: int = 256) -> str:
    start = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    rows = []
    for index in range(seconds * fs):
        timestamp = (start + timedelta(seconds=index / fs)).isoformat(timespec="microseconds")
        value = 100 * np.sin((2 * np.pi * frequency_hz * index) / fs)
        channels = [value, value * 0.95, value * 1.05, value]
        rows.append(f"{timestamp}," + ",".join(f"{channel:.6f}" for channel in channels))
    return "@".join(rows)


class AnalyzeSessionGoldenRecordingTests(unittest.TestCase):
    def test_deterministic_recording_preserves_256_hz_sampling(self):
        frame, marker = analyze_session.parse_input(deterministic_recording(10))

        self.assertIsNone(marker)
        self.assertEqual(len(frame), 1024)
        self.assertEqual(analyze_session.estimate_fs(frame), 256)

    def test_deterministic_alpha_recording_has_alpha_dominance(self):
        frame, _ = analyze_session.parse_input(deterministic_recording(10))
        powers = analyze_session.avg_band_powers_for_channels(
            frame,
            ["TP9", "FP1", "FP2", "TP10"],
            256,
        )

        self.assertIsNotNone(powers)
        self.assertGreater(powers["Alpha"], 90)
        self.assertGreater(powers["Alpha"], powers["Beta"])

    def test_deterministic_beta_recording_has_beta_dominance(self):
        frame, _ = analyze_session.parse_input(deterministic_recording(20))
        powers = analyze_session.avg_band_powers_for_channels(
            frame,
            ["TP9", "FP1", "FP2", "TP10"],
            256,
        )

        self.assertIsNotNone(powers)
        self.assertGreater(powers["Beta"], 90)
        self.assertGreater(powers["Beta"], powers["Alpha"])

    def test_large_motion_is_rejected_as_artifact(self):
        frame, _ = analyze_session.parse_input(deterministic_recording(10))
        frame.iloc[100, frame.columns.get_loc("TP9")] = 4000
        frame.iloc[101, frame.columns.get_loc("TP9")] = -4000

        self.assertTrue(
            analyze_session.segment_is_artifact(
                frame,
                ["TP9", "FP1", "FP2", "TP10"],
                256,
            )
        )
