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
2. During one stream, turn the Muse off and verify the UI reports disconnect.
3. Turn it on again and verify automatic reconnection without duplicate charts
   or duplicate samples.
4. Leave a session streaming for 20 minutes.

Pass criteria:

- 10/10 clean connections and disconnects.
- Reconnection completes within 30 s.
- No crash, frozen controls, duplicate event stream, or memory growth visible
  in Activity Monitor.

## Signal and channel checks

Record 60 s for each condition:

1. Device resting on a table (noise floor).
2. Normal wear, eyes open and still.
3. Eyes closed and still.
4. Five deliberate blinks.
5. Five jaw clenches.
6. Head movement for 5 s.

Pass criteria:

- Effective sample rate is 256 Hz ±2% per channel.
- TP9, FP1, FP2, TP10 all produce continuous data.
- Blinks are strongest frontally (FP1/FP2).
- Jaw clench is flagged as EMG; head movement is flagged as motion.
- Clean eyes-open/eyes-closed windows are not systematically marked as
  artifacts.
- Eyes-closed alpha does not decrease unexpectedly across both temporal
  channels; investigate electrode fit if it does.

## Recording and analysis

1. Record a 2-minute baseline and a 5-minute training phase.
2. Stop recording and wait for post-session analysis.
3. Export CSV and PDF, then reopen the treatment and results.
4. Compare timestamps, duration, protocol, channel names, artifact percentage,
   and baseline/training split across the live UI, export, and reopened result.

Pass criteria:

- Duration differs from wall-clock time by at most 2%.
- No channel swaps, NaN/Infinity values, negative durations, or missing
  baseline marker.
- Exported and reopened summaries match the on-screen result.
- Disconnecting during recording yields an explicit incomplete-session result,
  never a silently successful empty recording.

## Sign-off

Two people review the completed CSV. Any failed criterion blocks release until
the failure is reproduced, fixed, and this entire protocol passes again.
