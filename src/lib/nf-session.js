/**
 * Motor de sesión NF (BLE Muse, grabación, feedback en vivo).
 */
import { Muse } from './Muse.js';
import { MuseNative, isNativeBleAvailable } from './muse-native.js';
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
  NF_FEEDBACK_INTERVAL_MS,
  NF_LIVE_FFT_SIZE,
  NF_LIVE_FEEDBACK_CHANNELS,
  NF_SAMPLE_RATE,
} from './nf-bands.js';
import { getNfWarmupMs } from './nf-config.js';
import { FFT } from './nf-fft.js';
import {
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
    /** @type {'idle'|'baseline'|'training'} */
    this.sessionPhase = 'idle';
    this._baselineSkipped = false;
    this._sessionStartedAt = null;
    this._trainingStartedAt = null;
    this._liveTrace = [];
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
    this._lastGoodLevel = 0.38;
    this._artifactActive = false;
    this._artifactKind = null;
    /** Inicio calibración EMA al pulsar Grabar (NF-17). */
    this._warmupStartedAt = null;
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

  isWarmingUp() {
    if (this.sessionPhase !== 'training' || !this.recording || !this._warmupStartedAt) return false;
    return Date.now() - this._warmupStartedAt < getNfWarmupMs();
  }

  isInBaseline() {
    return this.recording && this.sessionPhase === 'baseline';
  }

  getBaselineElapsedSec() {
    if (!this.isInBaseline() || !this._sessionStartedAt) return 0;
    return Math.floor((Date.now() - this._sessionStartedAt) / 1000);
  }

  _pushMarker(kind) {
    this.recordedData.push(`__NF_MARKER__,${kind},${new Date().toISOString()}`);
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

  getWarmupRemainingSec() {
    if (!this.isWarmingUp()) return 0;
    return Math.ceil((getNfWarmupMs() - (Date.now() - this._warmupStartedAt)) / 1000);
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
    let level = 'good';
    if (artifactPct >= 35) level = 'poor';
    else if (artifactPct >= 15) level = 'fair';
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

    const warming = this.isWarmingUp();
    const inBaseline = this.isInBaseline();
    const training =
      this.recording && this.sessionPhase === 'training' && !warming && !inBaseline;
    const { level, percent } = computeFeedbackMetrics(
      this.protocol,
      this.smoothedBars,
      this.feedbackEma,
      { updateEma: this.recording && !artifact },
    );

    if (training && !artifact) {
      this._lastGoodLevel = level;
    }
    const outLevel =
      !this.recording || warming || inBaseline ? 0.38 : artifact ? this._lastGoodLevel : level;

    const signalQuality = this._updateSignalQuality(artifact);
    const showPct = training && !artifact ? percent : null;
    this._logLiveSample(showPct, artifact);

    this.onBandsUpdate?.({
      bars: [...this.smoothedBars],
      level: outLevel,
      percent: showPct,
      warming,
      artifact,
      artifactKind: kind,
      recording: this.recording,
      sessionPhase: this.sessionPhase,
      baselineElapsedSec: this.getBaselineElapsedSec(),
      warmupRemainingSec: this.getWarmupRemainingSec(),
      signalQuality: signalQuality.level,
      signalArtifactPct: signalQuality.artifactPct,
    });

    if (training) {
      applyAudioFeedback(artifact ? this._lastGoodLevel : level);
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

  readEEGTick() {
    if (!this.muse || this.muse.state !== 2) return;
    const channels = {
      TP9: this.muse.eeg[ELECTRODES.TP9].drain?.() ?? [],
      FP1: this.muse.eeg[ELECTRODES.FP1].drain?.() ?? [],
      FP2: this.muse.eeg[ELECTRODES.FP2].drain?.() ?? [],
      TP10: this.muse.eeg[ELECTRODES.TP10].drain?.() ?? [],
    };
    if (!channels.TP9.length && !channels.FP1.length && !channels.FP2.length && !channels.TP10.length) {
      return;
    }

    const maxLen = Math.max(
      channels.TP9.length,
      channels.FP1.length,
      channels.FP2.length,
      channels.TP10.length,
    );

    for (let i = 0; i < maxLen; i++) {
      const raw = {
        TP9: channels.TP9[i],
        FP1: channels.FP1[i],
        FP2: channels.FP2[i],
        TP10: channels.TP10[i],
      };
      const vals = {};
      for (const e of ['TP9', 'FP1', 'FP2', 'TP10']) {
        if (raw[e] === undefined) continue;
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

      if (this.recording) {
        const seq = this._recordSeq ?? 0;
        const tMs =
          (this._startedAt?.getTime() ?? Date.now()) + seq * (1000 / NF_SAMPLE_RATE);
        this._recordSeq = seq + 1;
        const ts = new Date(tMs).toISOString();
        const cell = (e) => {
          if (!this.activeElectrodes[e]) return '';
          const v = vals[e];
          return v !== undefined ? String(v) : '';
        };
        if (vals.TP9 !== undefined || vals.FP1 !== undefined || vals.FP2 !== undefined || vals.TP10 !== undefined) {
          this.recordedData.push(
            `${ts},${cell('TP9')},${cell('FP1')},${cell('FP2')},${cell('TP10')}`,
          );
        }
      }
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
    if (this._userInitiatedDisconnect) return;
    this.stopRecording();
    this.stopLoops();
    this.muse = null;
    this._setStatus('disconnected');
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
      this._lastGoodLevel = 0.38;
      this._signalQualitySamples = [];
      if (isAudioFeedbackEnabled()) {
        playConnectedSound();
      }
      resetLowBatteryFlag();
      this.startLoops();
      this._startBatteryMonitor();
    };

    const nativeOk = await isNativeBleAvailable();
    if (nativeOk) {
      try {
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
    this._warmupStartedAt = null;
    this._signalQualitySamples = [];
    this._artifactActive = false;
    this._artifactKind = null;
    this.sessionPhase = 'idle';
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
    this._intervals.push(setInterval(() => this.readEEGTick(), EEG_TICK_MS));
    this._intervals.push(setInterval(() => this.updateFrequencyGraph(), NF_FEEDBACK_INTERVAL_MS));
    this._intervals.push(setInterval(() => this.updateVoltageGraph(), 80));
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

  startRecording(opts = {}) {
    const useBaseline = opts.withBaseline !== false;
    this.recordedData = [];
    this.recording = true;
    this._startedAt = new Date();
    this._recordSeq = 0;
    this._sessionStartedAt = Date.now();
    this._trainingStartedAt = null;
    this._warmupStartedAt = null;
    this._baselineSkipped = false;
    this._lastGoodLevel = 0.38;
    this._liveTrace = [];
    this.feedbackEma.reset();
    stopAudioFeedback();
    if (useBaseline) {
      this.sessionPhase = 'baseline';
    } else {
      this.sessionPhase = 'training';
      this._warmupStartedAt = Date.now();
      this._trainingStartedAt = this._warmupStartedAt;
    }
  }

  startTraining({ skipped = false } = {}) {
    if (!this.recording || this.sessionPhase !== 'baseline') return;
    this._pushMarker('baseline_end');
    this.sessionPhase = 'training';
    this._trainingStartedAt = Date.now();
    this._warmupStartedAt = Date.now();
    this._baselineSkipped = Boolean(skipped);
    if (skipped) {
      this.feedbackEma.reset();
    }
    stopAudioFeedback();
  }

  stopRecording() {
    this.recording = false;
    this._warmupStartedAt = null;
    this._endedAt = new Date();
    this.sessionPhase = 'idle';
    stopAudioFeedback();
    return this.recordedData.join('@');
  }

  getRecordingMeta() {
    const activeLocs = Object.keys(this.activeElectrodes).filter((k) => this.activeElectrodes[k]);
    const dur =
      this._startedAt && this._endedAt
        ? Math.round((this._endedAt - this._startedAt) / 1000)
        : 0;
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
    };
  }
}
