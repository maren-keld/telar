# Muse 2 release validation

Run this protocol on every supported OS before promoting a release. It is a
release gate, not a diagnostic or medical-device validation.

## Setup

- Muse 2 charged above 50%, clean dry electrodes, firmware version recorded.
- Quiet room, participant seated, no personally identifying information.
- Telar release build (not hot reload), OS and app version recorded in
  `muse2-validation-template.csv`.
- Run `npm run test:frontend`, the Python golden-recording tests, and
  `./scripts/qa-nf.sh` first.

## Connection and lifecycle

1. Repeat connect → stream 30 s → disconnect ten times.
2. During one stream, turn the Muse off and verify the UI reports **sin señal**
   (not a frozen «(conectado)» orb) within ~2 s, then disconnect / reconnect.
3. Turn it on again and verify automatic reconnection without duplicate charts
   or duplicate samples.
4. Leave a session streaming for 20 minutes.
5. Disconnect mid-baseline and mid-training: the result must be an **explicit
   incomplete session**, never a silently successful empty recording.

Pass criteria:

- 10/10 clean connections and disconnects.
- Reconnection completes within 30 s.
- No crash, frozen controls, duplicate event stream, or memory growth visible
  in Activity Monitor.
- Watchdog: 2 s without EEG → «sin señal».

## Signal and channel checks

Record 60 s for each condition:

1. Device resting on a table (noise floor).
2. Normal wear, eyes open and still.
3. Eyes closed and still (channel check only — **protocol baseline is eyes-open** looking at the static orb).
4. Five deliberate blinks.
5. Five jaw clenches.
6. Head movement for 5 s.

Pass criteria:

- Effective sample rate is measured from **real packet timestamps** or
  wall-clock vs `n_samples` (never from synthetic `seq/256` CSV times).
  It must be 256 Hz ±2% per channel; if it is not, the UI/export must
  report the deviation (do not pretend 256).
- TP9, FP1, FP2, TP10 all produce continuous data.
- Blinks (~200 µV frontal) **are marked** as blink artifacts.
- Jaw clench is flagged as EMG; head movement is flagged as motion (EEG
  p2p and/or IMU).
- Clean eyes-open/eyes-closed windows are **not** systematically marked as
  artifacts.
- Table / electrode-off noise must **not** be labelled «Buena señal».
- Eyes-closed alpha does not decrease unexpectedly across both temporal
  channels; investigate electrode fit if it does.

## Recording and analysis

1. Record a 2-minute **eyes-open baseline looking at the static orb** that is
   written to the CSV (not a UI-only timer), then a 5-minute training phase
   **without wiping** the baseline. Baseline and training must use the **same
   eye condition**.
2. Confirm `baseline_end` and `eye_condition,open` in `raw_data` and that
   results include `baseline_*` plus `delta_*` that are **not trivially 0**
   when the trained state differs from rest. Baseline stats must be the
   **batch mean/variance of the whole rest**, not an EMA of the last ~20 s.
3. After baseline, the **on-screen %** is vs that frozen reference (a held
   calmer/more attentive state must **not** drift back to ~50%). The **orb
   and audio** may adapt (shaping); they are not the same number as the %.
4. Live orb latency should track ~1 s windows (not 2 s Welch + heavy smoothing).
5. Export CSV and PDF, then reopen the treatment and results.
6. Compare timestamps, duration, protocol, channel names, artifact percentage,
   packets lost / effective fs, and baseline/training split across the live
   UI, export, and reopened result.

Pass criteria:

- Duration differs from wall-clock time by at most 2%.
- No channel swaps, NaN/Infinity values, negative durations, or missing
  baseline marker.
- CSV timestamps are packet/receive times, not `_startedAt + seq/256`.
- Lost packets and effective fs appear in Resultados, CSV, and PDF.
- Levels 0/1/2 are **not** shown or exported.
- Exported and reopened summaries match the on-screen result.
- Disconnecting during recording yields an explicit incomplete-session result,
  never a silently successful empty recording.

## Sign-off

Two people review the completed CSV. Any failed criterion blocks release until
the failure is reproduced, fixed, and this entire protocol passes again.
