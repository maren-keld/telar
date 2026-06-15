/**
 * Motor de sesión NF adaptado de nf-core.js (felipeuppen/nf-psilab)
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
import { NF_FEEDBACK_INTERVAL_MS, NF_FFT_SIZE, NF_SAMPLE_RATE } from './nf-bands.js';
import {
  computeBandPercentages,
  computeFeedbackMetrics,
  hannWindow,
  LiveEegFilters,
  attenuateHighFrequencySpectrum,
} from './nf-signal.js';

const ELECTRODES = { TP9: 0, FP1: 1, FP2: 2, TP10: 3, AUX: 4 };
/** Intervalo del loop readEEGTick (ms). */
const EEG_TICK_MS = 4;
/** Una fila cada N ticks (~4 ms) → ~16 ms, suficiente para análisis y IPC Tauri. */
const RECORD_EVERY_N_TICKS = 4;
const FFT_SIZE = NF_FFT_SIZE;

class FFT {
  constructor(bufferSize) {
    this.bufferSize = bufferSize;
    this.spectrum = new Float32Array(bufferSize / 2);
    this.real = new Float32Array(bufferSize);
    this.imag = new Float32Array(bufferSize);
    this.reverseTable = new Uint32Array(bufferSize);
    this.sinTable = new Float32Array(bufferSize);
    this.cosTable = new Float32Array(bufferSize);
    let limit = 1;
    let bit = bufferSize >> 1;
    this.reverseTable[0] = 0;
    while (limit < bufferSize) {
      for (let i = 0; i < limit; i++) this.reverseTable[i + limit] = this.reverseTable[i] + bit;
      limit <<= 1;
      bit >>= 1;
    }
    for (let i = 0; i < bufferSize; i++) {
      if (i === 0) {
        this.sinTable[0] = 0;
        this.cosTable[0] = 1;
      } else {
        this.sinTable[i] = Math.sin(-Math.PI / i);
        this.cosTable[i] = Math.cos(-Math.PI / i);
      }
    }
  }

  forward(buffer) {
    const { real, imag, reverseTable, sinTable, cosTable, spectrum, bufferSize } = this;
    for (let i = 0; i < bufferSize; i++) {
      real[i] = buffer[reverseTable[i]];
      imag[i] = 0;
    }
    let halfSize = 1;
    while (halfSize < bufferSize) {
      const phaseShiftStepReal = this.cosTable[halfSize];
      const phaseShiftStepImag = this.sinTable[halfSize];
      let currentPhaseShiftReal = 1.0;
      let currentPhaseShiftImag = 0.0;
      for (let fftStep = 0; fftStep < halfSize; fftStep++) {
        for (let i = fftStep; i < bufferSize; i += halfSize << 1) {
          const off = i + halfSize;
          const tr = currentPhaseShiftReal * real[off] - currentPhaseShiftImag * imag[off];
          const ti = currentPhaseShiftReal * imag[off] + currentPhaseShiftImag * real[off];
          real[off] = real[i] - tr;
          imag[off] = imag[i] - ti;
          real[i] += tr;
          imag[i] += ti;
        }
        const tmpReal = currentPhaseShiftReal;
        currentPhaseShiftReal =
          tmpReal * phaseShiftStepReal - currentPhaseShiftImag * phaseShiftStepImag;
        currentPhaseShiftImag =
          tmpReal * phaseShiftStepImag + currentPhaseShiftImag * phaseShiftStepReal;
      }
      halfSize <<= 1;
    }
    for (let i = 0; i < bufferSize / 2; i++) {
      spectrum[i] = (2 * Math.hypot(real[i], imag[i])) / bufferSize;
    }
    return spectrum;
  }
}

export class NeurofeedbackSession {
  constructor() {
    this.muse = null;
    this.useNativeBle = false;
    this.connectionStatus = 'disconnected';
    this.activeElectrodes = { TP9: true, FP1: true, FP2: true, TP10: true };
    this.protocol = 'relajacion';
    this.recording = false;
    this.recordedData = [];
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
    this.smoothAlpha = 0.28;
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

  updateNeurofeedback(spectrum) {
    const filtered = attenuateHighFrequencySpectrum(spectrum, NF_SAMPLE_RATE);
    const bars = computeBandPercentages(filtered, NF_SAMPLE_RATE);
    for (let i = 0; i < 4; i++) {
      this.smoothedBars[i] =
        this.smoothedBars[i] * (1 - this.smoothAlpha) + bars[i] * this.smoothAlpha;
    }
    if (this.frequencyChart?.data?.datasets?.[0]) {
      this.frequencyChart.data.datasets[0].data = [...this.smoothedBars];
      this.frequencyChart.update();
    }
    this.onBandsUpdate?.([...this.smoothedBars]);
    applyAudioFeedback(this.smoothedBars);
  }

  computeSpectrum256(arr) {
    const windowed = hannWindow(arr);
    return Array.from(this.fft.forward(windowed));
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
        if (this.eegFrequencyBuffer[e].length > FFT_SIZE * 2) {
          this.eegFrequencyBuffer[e] = this.eegFrequencyBuffer[e].slice(-FFT_SIZE * 2);
        }
      }

      if (this.recording && maxLen > 0) {
        this._recordTickCount = (this._recordTickCount ?? 0) + 1;
        if (this._recordTickCount % RECORD_EVERY_N_TICKS === 0) {
          const li = maxLen - 1;
          const tMs =
            (this._startedAt?.getTime() ?? Date.now()) +
            (this._recordSeq ?? 0) * (EEG_TICK_MS * RECORD_EVERY_N_TICKS);
          this._recordSeq = (this._recordSeq ?? 0) + 1;
          const ts = new Date(tMs).toISOString();
          const cell = (e) => {
            if (!this.activeElectrodes[e]) return '';
            const v = raw[e]?.[li];
            return v !== undefined ? String(v) : '';
          };
          this.recordedData.push(
            `${ts},${cell('TP9')},${cell('FP1')},${cell('FP2')},${cell('TP10')}`,
          );
        }
      }
    }
  }

  updateFrequencyGraph() {
    const spectra = [];
    for (const e of ['TP9', 'FP1', 'FP2', 'TP10']) {
      if (!this.activeElectrodes[e]) continue;
      const buf = this.eegFrequencyBuffer[e];
      if (buf.length >= FFT_SIZE) {
        spectra.push(this.computeSpectrum256(buf.slice(-FFT_SIZE)));
      }
    }
    if (!spectra.length) return;
    const L = spectra[0].length;
    const avg = new Array(L).fill(0);
    for (const s of spectra) for (let i = 0; i < L; i++) avg[i] += s[i];
    for (let i = 0; i < L; i++) avg[i] /= spectra.length;
    this.updateNeurofeedback(avg);
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
    this._intervals.push(setInterval(() => this.readEEGTick(), 4));
    this._intervals.push(setInterval(() => this.updateFrequencyGraph(), 150));
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

  startRecording() {
    this.recordedData = [];
    this.recording = true;
    this._startedAt = new Date();
    this._recordTickCount = 0;
    this._recordSeq = 0;
  }

  stopRecording() {
    this.recording = false;
    this._endedAt = new Date();
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
      protocol: this.protocol === 'atencion' ? 'Atención' : 'Relajación',
      started_at: this._startedAt?.toISOString(),
      ended_at: this._endedAt?.toISOString(),
      duration_sec: dur,
    };
  }
}
