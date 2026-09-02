/**
 * Motor de sesión NF (BLE Muse, grabación, feedback en vivo).
 */
import { Muse } from './Muse.js';
import { MuseNative, isNativeBleAvailable } from './muse-native.js';
import { isTauriApp } from '../js/tauri-bridge.js';
import {
  applyAudioFeedback,
  isAudioFeedbackEnabled,
  playConnectedSound,
  playDisconnectSound,
  playLowBatterySound,
  resetLowBatteryFlag,
  setNfAudioProtocol,
  stopAudioFeedback,
} from './nf-audio.js';
import {
  NF_ARTIFACT_P2P_UV,
  NF_BAR_SMOOTH_ALPHA,
  NF_EYE_CONDITION,
  NF_FEEDBACK_INTERVAL_MS,
  NF_FS_DEV_WARN,
  NF_LIVE_FFT_SIZE,
  NF_LIVE_FEEDBACK_CHANNELS,
  NF_NOMINAL_FS,
  NF_SAMPLE_RATE,
  NF_SIGNAL_WATCHDOG_MS,
} from './nf-bands.js';
import { getNfBaselineSec } from './nf-config.js';
import { FFT } from './nf-fft.js';
import {
  AdaptiveShaper,
  computeFeedbackMetrics,
  detectArtifact,
  FeedbackEma,
  LiveEegFilters,
  welchBandPowers,
} from './nf-signal.js';

const ELECTRODES = { TP9: 0, FP1: 1, FP2: 2, TP10: 3, AUX: 4 };
/** Intervalo del loop readEEGTick (ms). */
const EEG_TICK_MS = 4;
const FFT_SIZE = NF_LIVE_FFT_SIZE;

export class NeurofeedbackSession {
  constructor() {
    this.muse = null;
    this.useNativeBle = false;
    this.connectionStatus = 'disconnected';
    this.activeElectrodes = { TP9: true, FP1: true, FP2: true, TP10: true };
    this.protocol = 'relajacion';
    this.recording = false;
    this.recordedData = [];
    /** Escribe CSV (línea base y entrenamiento). Distinto de `recording` (UI de grabar). */
    this._capturing = false;
    /** @type {'idle'|'baseline'|'ready'|'training'} */
    this.sessionPhase = 'idle';
    this.baselineComplete = false;
    this._baselineStartedAt = null;
    this._baselineSkipped = false;
    this._sessionStartedAt = null;
    this._trainingStartedAt = null;
    this._liveTrace = [];
    this.sessionIncomplete = false;
    this.incompleteReason = null;
    this._signalLost = false;
    this._lastEegAt = 0;
    this._watchdogFired = false;
    this._pendingByIndex = new Map();
    this._lastPacketIndex = { TP9: null, FP1: null, FP2: null, TP10: null };
    this._packetsReceived = 0;
    this._packetsLost = 0;
    this._samplesWritten = 0;
    this._captureElapsedMs = 0;
    this._captureSliceStart = null;
    this._latestAccel = [];
    this._latestGyro = [];
    this.onSignalLost = null;
    this.onSessionInterrupted = null;
    this._handlingDisconnect = false;
    this.eegFrequencyBuffer = { TP9: [], FP1: [], FP2: [], TP10: [] };
    this.liveFilters = {
      TP9: new LiveEegFilters(),
      FP1: new LiveEegFilters(),
      FP2: new LiveEegFilters(),
      TP10: new LiveEegFilters(),
    };
    this.fft = new FFT(FFT_SIZE);
    this.frequencyChart = null;
    this.voltageChart = null;
    this.voltageHistory = { TP9: [], FP1: [], FP2: [], TP10: [] };
    this.smoothedBars = [0, 0, 0, 0];
    this.feedbackEma = new FeedbackEma();
    this.shaper = new AdaptiveShaper();
    this._lastGoodLevel = 0.38;
    this._artifactActive = false;
    this._artifactKind = null;
    this._signalQualitySamples = [];
    this.onBandsUpdate = null;
    this.onDisconnected = null;
    this.onStatusChange = null;
    this.onBatteryUpdate = null;
    this._intervals = [];
    this._batteryInterval = null;
    this._reconnectAttempts = 0;
    this._maxReconnect = 3;
    this._reconnecting = false;
    this._isConnecting = false;
    this.connectError = null;
    this._connectTimeoutId = null;
    this._userInitiatedDisconnect = false;
    this.onConnectFailed = null;
  }

  setFrequencyChart(chart) {
    this.frequencyChart = chart;
  }

  setVoltageChart(chart) {
    this.voltageChart = chart;
  }

  _pushVoltageSample(electrode, value) {
    const hist = this.voltageHistory[electrode];
    if (!hist) return;
    hist.push(value);
    const max = Math.round(NF_SAMPLE_RATE * 3);
    if (hist.length > max) this.voltageHistory[electrode] = hist.slice(-max);
  }

  updateVoltageGraph() {
    if (!this.voltageChart) return;
    const colors = { TP9: '#4B7FD1', FP1: '#2ecc71', FP2: '#e67e22', TP10: '#9b59b6' };
    const datasets = [];
    let maxLen = 0;
    for (const e of ['TP9', 'FP1', 'FP2', 'TP10']) {
      if (!this.activeElectrodes[e]) continue;
      const hist = this.voltageHistory[e];
      if (!hist.length) continue;
      maxLen = Math.max(maxLen, hist.length);
      datasets.push({
        label: e,
        data: hist,
        borderColor: colors[e],
        backgroundColor: colors[e],
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.15,
        fill: false,
      });
    }
    this.voltageChart.data.labels = Array.from({ length: maxLen }, () => '');
    this.voltageChart.data.datasets = datasets;
    this.voltageChart.update('active');
  }

  setProtocol(p) {
    this.protocol = p === 'atencion' ? 'atencion' : 'relajacion';
    setNfAudioProtocol(this.protocol);
  }

  isInBaseline() {
    return this.sessionPhase === 'baseline';
  }

  isReadyToRecord() {
    return this.baselineComplete && this.sessionPhase === 'ready' && !this.recording;
  }

  getBaselineElapsedSec() {
    if (this.sessionPhase !== 'baseline' || !this._baselineStartedAt) return 0;
    return Math.floor((Date.now() - this._baselineStartedAt) / 1000);
  }

  getBaselineRemainingSec() {
    if (this.sessionPhase !== 'baseline') return 0;
    return Math.max(0, getNfBaselineSec() - this.getBaselineElapsedSec());
  }

  checkBaselineComplete() {
    if (this.sessionPhase !== 'baseline' || !this._baselineStartedAt) return false;
    if (this.getBaselineElapsedSec() < getNfBaselineSec()) return false;
    this.completeBaseline();
    return true;
  }

  startBaseline() {
    if (this.connectionStatus !== 'connected') return false;
    if (this.baselineComplete || this.sessionPhase === 'baseline' || this.recording) return false;
    this.sessionPhase = 'baseline';
    this._baselineStartedAt = Date.now();
    this._baselineSkipped = false;
    this.sessionIncomplete = false;
    this.incompleteReason = null;
    this.recordedData = [];
    this._liveTrace = [];
    this._startedAt = new Date();
    this._sessionStartedAt = Date.now();
    this._samplesWritten = 0;
    this._packetsReceived = 0;
    this._packetsLost = 0;
    this._lastPacketIndex = { TP9: null, FP1: null, FP2: null, TP10: null };
    this._pendingByIndex = new Map();
    this._captureElapsedMs = 0;
    this.feedbackEma.reset();
    this.shaper.reset();
    this._setCapturing(true);
    this._pushMarker('session_start');
    this._pushMarker('eye_condition', NF_EYE_CONDITION);
    stopAudioFeedback();
    return true;
  }

  completeBaseline({ skipped = false } = {}) {
    if (this.sessionPhase !== 'baseline') return false;
    this._flushPendingPackets(true);
    this._pushMarker('baseline_end');
    this.feedbackEma.freeze();
    const snap = this.feedbackEma.snapshot();
    this._pushMarker(
      'baseline_stats',
      `${snap.calm_mean},${snap.calm_var},${snap.att_mean},${snap.att_var}`,
    );
    const trainedAtt = this.protocol === 'atencion';
    this.shaper.seed(
      trainedAtt ? snap.att_mean : snap.calm_mean,
      Math.sqrt(trainedAtt ? snap.att_var : snap.calm_var),
    );
    this._setCapturing(false);
    this.sessionPhase = 'ready';
    this.baselineComplete = true;
    this._baselineSkipped = Boolean(skipped);
    this._baselineStartedAt = null;
    return true;
  }

  resetBaselineState() {
    this.baselineComplete = false;
    this._baselineStartedAt = null;
    this._baselineSkipped = false;
    if (!this.recording) {
      this.sessionPhase = this.connectionStatus === 'connected' ? 'idle' : 'idle';
    }
  }

  _setCapturing(on) {
    if (on && !this._capturing) this._captureSliceStart = Date.now();
    if (!on && this._capturing && this._captureSliceStart != null) {
      this._captureElapsedMs += Date.now() - this._captureSliceStart;
      this._captureSliceStart = null;
    }
    this._capturing = on;
  }

  _captureElapsedMsNow() {
    let ms = this._captureElapsedMs;
    if (this._capturing && this._captureSliceStart != null) {
      ms += Date.now() - this._captureSliceStart;
    }
    return ms;
  }

  _pushMarker(kind, extra = '') {
    const iso = new Date().toISOString();
    this.recordedData.push(
      extra
        ? `__NF_MARKER__,${kind},${iso},${extra}`
        : `__NF_MARKER__,${kind},${iso}`,
    );
  }

  _pushStreamStats() {
    const elapsedSec = this._captureElapsedMsNow() / 1000;
    const effectiveFs = elapsedSec > 0.25 ? this._samplesWritten / elapsedSec : 0;
    const expected = this._packetsReceived + this._packetsLost;
    this._pushMarker(
      'stream_stats',
      `${this._packetsLost},${Math.max(expected, this._packetsReceived)},${effectiveFs.toFixed(2)}`,
    );
  }

  _logLiveSample(percent, artifact) {
    if (!this.recording || !this._sessionStartedAt) return;
    const t = Date.now() - this._sessionStartedAt;
    const last = this._liveTrace[this._liveTrace.length - 1];
    if (last && t - last.t < 350) return;
    this._liveTrace.push({
      t,
      pct: percent != null && !artifact ? Math.round(percent * 10) / 10 : null,
      phase: this.sessionPhase,
    });
  }

  getLiveTrace() {
    return [...this._liveTrace];
  }

  _updateSignalQuality(artifact) {
    const now = Date.now();
    const windowMs = 30_000;
    this._signalQualitySamples.push({ t: now, artifact: Boolean(artifact) });
    this._signalQualitySamples = this._signalQualitySamples.filter((s) => s.t >= now - windowMs);
    const total = this._signalQualitySamples.length;
    if (!total) {
      return { level: 'unknown', artifactPct: 0 };
    }
    const artifactPct = Math.round(
      (this._signalQualitySamples.filter((s) => s.artifact).length / total) * 100,
    );
    const elapsedSec = this._captureElapsedMsNow() / 1000;
    const effFs = elapsedSec > 1 ? this._samplesWritten / elapsedSec : NF_NOMINAL_FS;
    const fsOff =
      elapsedSec > 2 && Math.abs(effFs - NF_NOMINAL_FS) / NF_NOMINAL_FS > NF_FS_DEV_WARN;
    const dropRatio =
      this._packetsReceived + this._packetsLost > 8
        ? this._packetsLost / (this._packetsReceived + this._packetsLost)
        : 0;
    let level = 'good';
    if (this._signalLost || artifactPct >= 35 || fsOff || dropRatio >= 0.08) level = 'poor';
    else if (artifactPct >= 15 || dropRatio >= 0.03) level = 'fair';
    return { level, artifactPct };
  }

  setElectrode(name, active) {
    if (name in this.activeElectrodes) this.activeElectrodes[name] = active;
  }

  _setStatus(status) {
    this.connectionStatus = status;
    this.onStatusChange?.(status);
  }

  _clearConnectTimeout() {
    if (this._connectTimeoutId) {
      clearTimeout(this._connectTimeoutId);
      this._connectTimeoutId = null;
    }
  }

  _failConnect(err) {
    this._clearConnectTimeout();
    this._isConnecting = false;
    this._reconnecting = false;
    this.connectError =
      typeof err === 'string' ? err : err?.message || 'Error al conectar al Muse';
    this.muse?.disconnect?.();
    this.muse = null;
    this._setStatus('disconnected');
    this.onConnectFailed?.(this.connectError);
  }

  cancelConnect() {
    this._reconnectAttempts = this._maxReconnect;
    this._clearConnectTimeout();
    this._isConnecting = false;
    this._reconnecting = false;
    this.muse?.disconnect?.();
    this.muse = null;
    this._setStatus('disconnected');
  }

  updateNeurofeedback(bars) {
    const feedbackChannels =
      NF_LIVE_FEEDBACK_CHANNELS[this.protocol] || NF_LIVE_FEEDBACK_CHANNELS.relajacion;
    const { artifact, kind } = detectArtifact(
      this.eegFrequencyBuffer,
      feedbackChannels,
      bars,
      NF_ARTIFACT_P2P_UV,
      FFT_SIZE,
      { accelSamples: this._latestAccel, gyroSamples: this._latestGyro },
    );
    this._artifactActive = artifact;
    this._artifactKind = kind;

    const smoothAlpha = NF_BAR_SMOOTH_ALPHA;
    for (let i = 0; i < 4; i++) {
      this.smoothedBars[i] =
        this.smoothedBars[i] * (1 - smoothAlpha) + bars[i] * smoothAlpha;
    }
    if (this.frequencyChart?.data?.datasets?.[0]) {
      this.frequencyChart.data.datasets[0].data = [...this.smoothedBars];
      this.frequencyChart.update();
    }

    const inBaseline = this.isInBaseline();
    const connected = this.muse?.state === 2;
    const livePreview = connected && !this.recording && !inBaseline;
    const inTrainingRecording = this.recording && this.sessionPhase === 'training';
    const frozen = this.feedbackEma.isFrozen();
    const metrics = computeFeedbackMetrics(
      this.protocol,
      this.smoothedBars,
      this.feedbackEma,
      { updateEma: inBaseline && !artifact },
    );
    const { percent, attIdx, calmIdx } = metrics;
    const idx = this.protocol === 'atencion' ? attIdx : calmIdx;

    let outLevel = 0.38;
    if (this._signalLost || !connected) {
      outLevel = 0.38;
    } else if (inBaseline) {
      outLevel = 0.38;
    } else if (artifact && (inTrainingRecording || livePreview)) {
      outLevel = this._lastGoodLevel;
    } else if (inTrainingRecording && frozen) {
      this.shaper.update(idx);
      outLevel = this.shaper.level(idx);
    } else if (frozen) {
      outLevel = metrics.level;
    }

    if ((inTrainingRecording || livePreview) && !artifact) {
      this._lastGoodLevel = outLevel;
    }

    const signalQuality = this._updateSignalQuality(artifact);
    const showPct =
      frozen && (livePreview || inTrainingRecording) && !artifact && !this._signalLost
        ? percent
        : null;
    this._logLiveSample(showPct, artifact);

    this.onBandsUpdate?.({
      bars: [...this.smoothedBars],
      level: outLevel,
      percent: showPct,
      calibrated: frozen,
      artifact,
      artifactKind: kind,
      recording: this.recording,
      sessionPhase: this.sessionPhase,
      baselineElapsedSec: this.getBaselineElapsedSec(),
      baselineRemainingSec: this.getBaselineRemainingSec(),
      baselineComplete: this.baselineComplete,
      signalQuality: this._signalLost ? 'poor' : signalQuality.level,
      signalArtifactPct: signalQuality.artifactPct,
      signalLost: this._signalLost,
    });

    if (inTrainingRecording && frozen) {
      applyAudioFeedback(artifact ? this._lastGoodLevel : outLevel);
    }
  }

  _welchForward(windowed) {
    return this.fft.forward(windowed);
  }

  updateFrequencyGraph() {
    const feedbackChannels =
      NF_LIVE_FEEDBACK_CHANNELS[this.protocol] || NF_LIVE_FEEDBACK_CHANNELS.relajacion;
    const bandSets = [];
    for (const e of feedbackChannels) {
      if (!this.activeElectrodes[e]) continue;
      const buf = this.eegFrequencyBuffer[e];
      if (buf.length >= FFT_SIZE) {
        bandSets.push(
          welchBandPowers(buf.slice(-FFT_SIZE), (w) => this._welchForward(w), NF_SAMPLE_RATE, FFT_SIZE),
        );
      }
    }
    if (!bandSets.length) return;
    const avg = [0, 0, 0, 0];
    for (const b of bandSets) {
      for (let i = 0; i < 4; i++) avg[i] += b[i];
    }
    for (let i = 0; i < 4; i++) avg[i] /= bandSets.length;
    this.updateNeurofeedback(avg);
  }

  _drainMotion() {
    const acc = [];
    const gyr = [];
    const ax = this.muse?.accelerometer;
    const gx = this.muse?.gyroscope;
    if (ax?.[0]?.drain) {
      const x = ax[0].drain();
      const y = ax[1]?.drain?.() ?? [];
      const z = ax[2]?.drain?.() ?? [];
      const n = Math.max(x.length, y.length, z.length);
      for (let i = 0; i < n; i++) acc.push([x[i] ?? 0, y[i] ?? 0, z[i] ?? 0]);
    }
    if (gx?.[0]?.drain) {
      const x = gx[0].drain();
      const y = gx[1]?.drain?.() ?? [];
      const z = gx[2]?.drain?.() ?? [];
      const n = Math.max(x.length, y.length, z.length);
      for (let i = 0; i < n; i++) gyr.push([x[i] ?? 0, y[i] ?? 0, z[i] ?? 0]);
    }
    if (acc.length) this._latestAccel = acc;
    if (gyr.length) this._latestGyro = gyr;
  }

  _notePacketIndex(ch, idx) {
    if (idx == null || Number.isNaN(Number(idx))) return;
    const i = Number(idx) & 0xffff;
    const prev = this._lastPacketIndex[ch];
    if (prev != null) {
      const expected = (prev + 1) & 0xffff;
      if (i !== expected) {
        const gap = (i - expected) & 0xffff;
        if (gap > 0 && gap < 4000) this._packetsLost += gap;
      }
    }
    this._lastPacketIndex[ch] = i;
    this._packetsReceived += 1;
  }

  _commitSample(raw, timestampMs) {
    const vals = {};
    for (const e of ['TP9', 'FP1', 'FP2', 'TP10']) {
      if (raw[e] === undefined || raw[e] === null) continue;
      vals[e] = this.liveFilters[e].process(raw[e]);
    }
    for (const e of ['TP9', 'FP1', 'FP2', 'TP10']) {
      if (!this.activeElectrodes[e] || vals[e] === undefined) continue;
      this._pushVoltageSample(e, vals[e]);
      this.eegFrequencyBuffer[e].push(vals[e]);
      const maxBuf = FFT_SIZE * 2;
      if (this.eegFrequencyBuffer[e].length > maxBuf) {
        this.eegFrequencyBuffer[e] = this.eegFrequencyBuffer[e].slice(-maxBuf);
      }
    }
    if (this._capturing) {
      const ts = new Date(timestampMs).toISOString();
      const cell = (e) => {
        if (!this.activeElectrodes[e]) return '';
        const v = vals[e];
        return v !== undefined ? String(v) : '';
      };
      if (vals.TP9 !== undefined || vals.FP1 !== undefined || vals.FP2 !== undefined || vals.TP10 !== undefined) {
        this.recordedData.push(`${ts},${cell('TP9')},${cell('FP1')},${cell('FP2')},${cell('TP10')}`);
        this._samplesWritten += 1;
      }
    }
  }

  _flushPendingPackets(force = false) {
    const active = ['TP9', 'FP1', 'FP2', 'TP10'].filter((e) => this.activeElectrodes[e]);
    const ready = [];
    for (const [key, g] of this._pendingByIndex) {
      const haveAll = active.every((e) => g.channels[e]);
      const age = Date.now() - (g.timestampMs || 0);
      if (haveAll || force || age > 45) {
        ready.push(g);
        this._pendingByIndex.delete(key);
      }
    }
    ready.sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
    const dt = 1000 / NF_SAMPLE_RATE;
    for (const g of ready) {
      let n = 0;
      for (const samples of Object.values(g.channels)) n = Math.max(n, samples.length);
      for (let i = 0; i < n; i++) {
        const raw = {};
        for (const e of ['TP9', 'FP1', 'FP2', 'TP10']) {
          const samples = g.channels[e];
          if (samples && samples[i] !== undefined) raw[e] = samples[i];
        }
        this._commitSample(raw, (g.timestampMs || Date.now()) + i * dt);
      }
    }
    if (this._pendingByIndex.size > 48) {
      const oldest = [...this._pendingByIndex.keys()].slice(0, this._pendingByIndex.size - 32);
      for (const k of oldest) this._pendingByIndex.delete(k);
    }
  }

  _ingestPackets() {
    let any = false;
    for (const e of ['TP9', 'FP1', 'FP2', 'TP10']) {
      const pkts = this.muse.drainPackets?.(ELECTRODES[e]) ?? [];
      for (const pkt of pkts) {
        any = true;
        this._notePacketIndex(e, pkt.packetIndex);
        const key = pkt.packetIndex != null ? String(pkt.packetIndex) : `t:${pkt.timestampMs}`;
        let g = this._pendingByIndex.get(key);
        if (!g) {
          g = { timestampMs: pkt.timestampMs, channels: {} };
          this._pendingByIndex.set(key, g);
        }
        g.channels[e] = pkt.samples;
        g.timestampMs = Math.min(g.timestampMs ?? pkt.timestampMs, pkt.timestampMs);
      }
    }
    if (any) this._lastEegAt = Date.now();
    this._flushPendingPackets();
    return any;
  }

  readEEGTick() {
    if (!this.muse || this.muse.state !== 2) return;
    this._drainMotion();
    if (typeof this.muse.drainPackets === 'function') {
      this._ingestPackets();
      return;
    }
    const channels = {
      TP9: this.muse.eeg[ELECTRODES.TP9].drain?.() ?? [],
      FP1: this.muse.eeg[ELECTRODES.FP1].drain?.() ?? [],
      FP2: this.muse.eeg[ELECTRODES.FP2].drain?.() ?? [],
      TP10: this.muse.eeg[ELECTRODES.TP10].drain?.() ?? [],
    };
    if (!channels.TP9.length && !channels.FP1.length && !channels.FP2.length && !channels.TP10.length) {
      return;
    }
    this._lastEegAt = Date.now();
    const maxLen = Math.max(
      channels.TP9.length,
      channels.FP1.length,
      channels.FP2.length,
      channels.TP10.length,
    );
    const tickTs = Date.now();
    const dt = 1000 / NF_SAMPLE_RATE;
    for (let i = 0; i < maxLen; i++) {
      this._commitSample(
        {
          TP9: channels.TP9[i],
          FP1: channels.FP1[i],
          FP2: channels.FP2[i],
          TP10: channels.TP10[i],
        },
        tickTs + i * dt,
      );
    }
  }

  _checkSignalWatchdog() {
    if (this.connectionStatus !== 'connected' || this._reconnecting || this._isConnecting) return;
    if (!this._lastEegAt) return;
    const silent = Date.now() - this._lastEegAt > NF_SIGNAL_WATCHDOG_MS;
    if (silent && !this._signalLost) {
      this._signalLost = true;
      this.onSignalLost?.();
      this._handleDisconnect(false);
    } else if (!silent) {
      this._signalLost = false;
    }
  }

  _wireMuseCallbacks() {
    const prevOnDisc = this.muse.onDisconnected?.bind(this.muse);
    this.muse.onDisconnected = () => {
      prevOnDisc?.();
      this._handleDisconnect(false);
    };
  }

  _handleDisconnect(userInitiated) {
    if (this._userInitiatedDisconnect || this._handlingDisconnect) return;
    this._handlingDisconnect = true;
    const phase = this.sessionPhase;
    const wasCapturing =
      this._capturing || phase === 'baseline' || (this.recording && phase === 'training');
    if (wasCapturing) {
      this.sessionIncomplete = true;
      this.incompleteReason = phase === 'baseline' ? 'disconnect_baseline' : 'disconnect_training';
    }
    const payload = this.stopRecording();
    const meta = this.getRecordingMeta();
    this.resetBaselineState();
    this.stopLoops();
    const m = this.muse;
    this.muse = null;
    if (m) {
      m.onDisconnected = () => {};
      void m.disconnect?.();
    }
    this._signalLost = true;
    this._setStatus('disconnected');
    if (wasCapturing) {
      this.onSessionInterrupted?.({
        reason: this.incompleteReason,
        payload,
        meta,
      });
    }
    this._handlingDisconnect = false;
    if (userInitiated || this._isConnecting) return;
    playDisconnectSound();
    this.onDisconnected?.();
    this._tryReconnect();
  }

  async _tryReconnect() {
    if (this._reconnecting || this._reconnectAttempts >= this._maxReconnect) return;
    this._reconnecting = true;
    this._reconnectAttempts += 1;
    this._setStatus('connecting');
    try {
      await this.connect({ isReconnect: true });
      this._reconnectAttempts = 0;
    } catch {
      if (this._reconnectAttempts < this._maxReconnect) {
        setTimeout(() => {
          this._reconnecting = false;
          this._tryReconnect();
        }, 2000);
        return;
      } else {
        this.connectError = 'No se pudo reconectar al Muse.';
        this._isConnecting = false;
        this._setStatus('disconnected');
        this.onConnectFailed?.(this.connectError);
      }
    }
    this._reconnecting = false;
  }

  async connect(opts = {}) {
    if (this._isConnecting && !opts.isReconnect) {
      this.cancelConnect();
    }
    if (!opts.isReconnect) this._reconnectAttempts = 0;
    this.connectError = null;
    this._isConnecting = true;
    this._setStatus('connecting');

    this._clearConnectTimeout();
    this._connectTimeoutId = setTimeout(() => {
      if (!this._isConnecting) return;
      this.connectError = 'Tiempo agotado. Enciende el Muse, activa Bluetooth e intenta de nuevo.';
      this.cancelConnect();
      this.onConnectFailed?.(this.connectError);
    }, 35000);

    let didFinish = false;
    const finishConnect = () => {
      if (didFinish) return;
      didFinish = true;
      this._clearConnectTimeout();
      this._isConnecting = false;
      this.connectError = null;
      this._setStatus('connected');
      if (!opts.isReconnect) {
        this.resetBaselineState();
        this.sessionIncomplete = false;
        this.incompleteReason = null;
      }
      this._lastGoodLevel = 0.38;
      this._signalQualitySamples = [];
      this._signalLost = false;
      this._lastEegAt = Date.now();
      if (isAudioFeedbackEnabled()) {
        playConnectedSound();
      }
      resetLowBatteryFlag();
      this.startLoops();
      this._startBatteryMonitor();
    };

    const connectNative = async () => {
      this.muse = new MuseNative();
      this.useNativeBle = true;
      this._wireMuseCallbacks();
      this.muse.onConnected = () => {
        if (this.muse?.state === 2) finishConnect();
      };
      await this.muse.connect();
      if (this.muse.state === 2) {
        finishConnect();
        return this.muse;
      }
      throw new Error('Conexión incompleta con el Muse.');
    };

    const nativeOk = await isNativeBleAvailable();
    if (isTauriApp()) {
      if (!nativeOk) {
        const err = new Error(
          'Bluetooth no disponible. Actívalo en Ajustes del sistema y concede permiso a Telar en Privacidad → Bluetooth.',
        );
        this._failConnect(err);
        throw err;
      }
      try {
        return await connectNative();
      } catch (e) {
        console.warn('BLE nativo falló', e);
        this._failConnect(e);
        throw e;
      }
    }

    if (nativeOk) {
      try {
        return await connectNative();
      } catch (e) {
        console.warn('BLE nativo falló', e);
        this._failConnect(e);
        throw e;
      }
    }

    if (!navigator.bluetooth) {
      const err = new Error('Bluetooth no disponible. Actívalo en Ajustes del sistema e intenta de nuevo.');
      this._failConnect(err);
      throw err;
    }
    this.muse = new Muse();
    this.useNativeBle = false;
    this._wireMuseCallbacks();
    try {
      await this.muse.connect();
      if (this.muse.state !== 2) {
        throw new Error('No se pudo conectar al Muse.');
      }
      finishConnect();
      return this.muse;
    } catch (e) {
      this._failConnect(e);
      throw e;
    }
  }

  async disconnect() {
    this._userInitiatedDisconnect = true;
    this._clearConnectTimeout();
    this._reconnectAttempts = this._maxReconnect;
    this._reconnecting = false;
    this._isConnecting = false;
    this.connectError = null;
    stopAudioFeedback();
    this.stopRecording();
    this.stopLoops();
    this._stopBatteryMonitor();
    for (const e of ['TP9', 'FP1', 'FP2', 'TP10']) {
      this.voltageHistory[e] = [];
      this.eegFrequencyBuffer[e] = [];
      this.liveFilters[e].reset();
    }
    if (this.frequencyChart) {
      this.smoothedBars = [0, 0, 0, 0];
      this.frequencyChart.data.datasets[0].data = [0, 0, 0, 0];
      this.frequencyChart.update('none');
    }
    if (this.voltageChart) {
      this.voltageChart.data.datasets = [];
      this.voltageChart.update('none');
    }
    if (this.muse) {
      const m = this.muse;
      this.muse = null;
      m.onDisconnected = () => {};
      await Promise.resolve(m.disconnect?.());
    }
    this.feedbackEma.reset();
    this.shaper.reset();
    this._signalQualitySamples = [];
    this._artifactActive = false;
    this._artifactKind = null;
    this.sessionPhase = 'idle';
    this.baselineComplete = false;
    this._baselineStartedAt = null;
    this._liveTrace = [];
    this._setStatus('disconnected');
    this._userInitiatedDisconnect = false;
  }

  _startBatteryMonitor() {
    this._stopBatteryMonitor();
    this._batteryInterval = setInterval(() => {
      const pct = this.getBatteryPercent();
      if (pct != null) {
        this.onBatteryUpdate?.(pct);
        if (pct <= 20) playLowBatterySound();
      }
    }, 5000);
  }

  _stopBatteryMonitor() {
    if (this._batteryInterval) {
      clearInterval(this._batteryInterval);
      this._batteryInterval = null;
    }
  }

  startLoops() {
    this.stopLoops();
    this._lastEegAt = Date.now();
    this._signalLost = false;
    this._intervals.push(setInterval(() => this.readEEGTick(), EEG_TICK_MS));
    this._intervals.push(setInterval(() => this.updateFrequencyGraph(), NF_FEEDBACK_INTERVAL_MS));
    this._intervals.push(setInterval(() => this.updateVoltageGraph(), 80));
    this._intervals.push(setInterval(() => this._checkSignalWatchdog(), 250));
  }

  stopLoops() {
    this._intervals.forEach(clearInterval);
    this._intervals = [];
  }

  getBatteryPercent() {
    if (this.muse?.batteryLevel == null) return null;
    return Math.round(this.muse.batteryLevel * 100);
  }

  getDeviceLabel() {
    if (this.muse?.state === 2) {
      return this.useNativeBle ? this.muse._deviceName || 'Muse' : 'Muse 2';
    }
    return 'Sin dispositivo';
  }

  startRecording() {
    if (!this.baselineComplete) {
      throw new Error('Completa la línea base antes de grabar.');
    }
    this.recording = true;
    this._setCapturing(true);
    this._trainingStartedAt = Date.now();
    this._lastGoodLevel = 0.38;
    this._pushMarker('training_start');
    stopAudioFeedback();
    this.sessionPhase = 'training';
  }

  /** @deprecated Usar completeBaseline() — conservado por compatibilidad interna. */
  startTraining({ skipped = false } = {}) {
    if (this.sessionPhase === 'baseline') {
      this.completeBaseline({ skipped });
    }
  }

  stopRecording() {
    if (this._capturing) this._pushStreamStats();
    this._flushPendingPackets(true);
    this._setCapturing(false);
    this.recording = false;
    this._endedAt = new Date();
    if (this.baselineComplete && this.sessionPhase !== 'idle') {
      this.sessionPhase = 'ready';
    } else {
      this.sessionPhase = 'idle';
    }
    stopAudioFeedback();
    return this.recordedData.join('@');
  }

  getRecordingMeta() {
    const activeLocs = Object.keys(this.activeElectrodes).filter((k) => this.activeElectrodes[k]);
    const dur =
      this._startedAt && this._endedAt
        ? Math.round((this._endedAt - this._startedAt) / 1000)
        : 0;
    const elapsedSec = this._captureElapsedMsNow() / 1000;
    const effectiveFs = elapsedSec > 0.25 ? this._samplesWritten / elapsedSec : 0;
    const expected = this._packetsReceived + this._packetsLost;
    return {
      device: this.useNativeBle ? 'Muse (BLE nativo)' : 'Muse 2',
      locations: activeLocs,
      protocol: this.protocol === 'atencion' ? 'Atención' : 'Calma',
      started_at: this._startedAt?.toISOString(),
      ended_at: this._endedAt?.toISOString(),
      duration_sec: dur,
      baseline_skipped: this._baselineSkipped,
      training_started_at: this._trainingStartedAt
        ? new Date(this._trainingStartedAt).toISOString()
        : null,
      live_trace: this.getLiveTrace(),
      incomplete: Boolean(this.sessionIncomplete),
      incomplete_reason: this.incompleteReason,
      packets_lost: this._packetsLost,
      packets_expected: expected,
      packets_received: this._packetsReceived,
      effective_fs: Math.round(effectiveFs * 100) / 100,
      samples_written: this._samplesWritten,
      eye_condition: NF_EYE_CONDITION,
    };
  }
}
