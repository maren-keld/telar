/**
 * Motor de sesión NF adaptado de nf-core.js (felipeuppen/nf-psilab)
 */
import { Muse } from './Muse.js';
import { MuseNative, isNativeBleAvailable } from './muse-native.js';
import {
  applyAudioFeedback,
  enableAudioFeedback,
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
  hannWindow,
  LiveEegFilters,
} from './nf-signal.js';

const ELECTRODES = { TP9: 0, FP1: 1, FP2: 2, TP10: 3, AUX: 4 };
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
    this.onBandsUpdate = null;
    this.onDisconnected = null;
    this.onStatusChange = null;
    this.onBatteryUpdate = null;
    this._intervals = [];
    this._batteryInterval = null;
    this._reconnectAttempts = 0;
    this._maxReconnect = 3;
    this._reconnecting = false;
  }

  setFrequencyChart(chart) {
    this.frequencyChart = chart;
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

  updateNeurofeedback(spectrum) {
    const bars = computeBandPercentages(spectrum, NF_SAMPLE_RATE);
    if (this.frequencyChart) {
      this.frequencyChart.data.datasets[0].data = bars;
      this.frequencyChart.update('none');
    }
    this.onBandsUpdate?.(bars);
    applyAudioFeedback(bars);
  }

  computeSpectrum256(arr) {
    const windowed = hannWindow(arr);
    return Array.from(this.fft.forward(windowed));
  }

  readEEGTick() {
    if (!this.muse || this.muse.state !== 2) return;
    const timestamp = new Date().toISOString();
    const tp9 = this.muse.eeg[ELECTRODES.TP9].read();
    const fp1 = this.muse.eeg[ELECTRODES.FP1].read();
    const fp2 = this.muse.eeg[ELECTRODES.FP2].read();
    const tp10 = this.muse.eeg[ELECTRODES.TP10].read();
    if ([tp9, fp1, fp2, tp10].some((v) => v === null)) return;

    const vals = {
      TP9: this.liveFilters.TP9.process(tp9),
      FP1: this.liveFilters.FP1.process(fp1),
      FP2: this.liveFilters.FP2.process(fp2),
      TP10: this.liveFilters.TP10.process(tp10),
    };

    for (const e of ['TP9', 'FP1', 'FP2', 'TP10']) {
      if (this.activeElectrodes[e]) {
        this.eegFrequencyBuffer[e].push(vals[e]);
        if (this.eegFrequencyBuffer[e].length > FFT_SIZE * 2) {
          this.eegFrequencyBuffer[e] = this.eegFrequencyBuffer[e].slice(-FFT_SIZE * 2);
        }
      }
    }

    if (this.recording) {
      this.recordedData.push(
        `${timestamp},${this.activeElectrodes.TP9 ? tp9 : ''},${this.activeElectrodes.FP1 ? fp1 : ''},${this.activeElectrodes.FP2 ? fp2 : ''},${this.activeElectrodes.TP10 ? tp10 : ''}`,
      );
    }
  }

  updateFrequencyGraph() {
    const spectra = [];
    for (const e of ['TP9', 'FP1', 'FP2', 'TP10']) {
      if (!this.activeElectrodes[e]) continue;
      const buf = this.eegFrequencyBuffer[e];
      if (buf.length >= FFT_SIZE) {
        spectra.push(this.computeSpectrum256(buf));
        this.eegFrequencyBuffer[e] = buf.slice(-FFT_SIZE);
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
    this.stopRecording();
    this.stopLoops();
    this.muse = null;
    this._setStatus('disconnected');
    if (!userInitiated) {
      playDisconnectSound();
      this.onDisconnected?.();
      this._tryReconnect();
    }
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
        this._setStatus('disconnected');
      }
    }
    this._reconnecting = false;
  }

  async connect(opts = {}) {
    if (!opts.isReconnect) this._reconnectAttempts = 0;
    this._setStatus('connecting');

    const nativeOk = await isNativeBleAvailable();
    if (nativeOk) {
      try {
        this.muse = new MuseNative();
        this.useNativeBle = true;
        this._wireMuseCallbacks();
        await this.muse.connect();
        this._setStatus('connected');
        enableAudioFeedback();
        playConnectedSound();
        resetLowBatteryFlag();
        this.startLoops();
        this._startBatteryMonitor();
        return this.muse;
      } catch (e) {
        console.warn('BLE nativo falló, intentando Web Bluetooth', e);
        this.muse = null;
        this.useNativeBle = false;
      }
    }

    if (!navigator.bluetooth) {
      throw new Error('Bluetooth no disponible. Usa la app de escritorio en macOS.');
    }
    this.muse = new Muse();
    this.useNativeBle = false;
    this._wireMuseCallbacks();
    await this.muse.connect();
    if (this.muse.state !== 2) {
      throw new Error('No se pudo conectar al Muse.');
    }
    this._setStatus('connected');
    enableAudioFeedback();
    playConnectedSound();
    resetLowBatteryFlag();
    this.startLoops();
    this._startBatteryMonitor();
    return this.muse;
  }

  disconnect() {
    this._reconnectAttempts = this._maxReconnect;
    this._reconnecting = false;
    stopAudioFeedback();
    this.stopRecording();
    this.stopLoops();
    this._stopBatteryMonitor();
    if (this.muse) {
      const m = this.muse;
      this.muse = null;
      m.disconnect?.();
    }
    this._setStatus('disconnected');
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
    this._intervals.push(setInterval(() => this.updateFrequencyGraph(), NF_FEEDBACK_INTERVAL_MS));
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
