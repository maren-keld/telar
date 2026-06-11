/**
 * Muse 2 vía BLE nativo (Rust/btleplug). API compatible con Muse.js para nf-session.
 */
import { getInvoke, isTauriApp } from '../js/tauri-bridge.js';

class MuseCircularBuffer {
  constructor(size) {
    this.memory = new Array(size);
    for (let i = 0; i < size; i++) this.memory[i] = 0;
    this.head = 0;
    this.tail = 0;
    this.isFull = false;
    this.length = 0;
  }
  read() {
    if (this.tail === this.head && !this.isFull) return null;
    this.tail = this.next(this.tail);
    this.isFull = false;
    this.length -= 1;
    return this.memory[this.tail];
  }
  write(value) {
    if (this.isFull) return;
    this.head = this.next(this.head);
    this.memory[this.head] = value;
    if (this.head === this.tail) this.isFull = true;
    this.length += 1;
  }
  next(n) {
    const nxt = n + 1;
    return nxt === this.memory.length ? 0 : nxt;
  }
}

export class MuseNative {
  constructor() {
    this.state = 0;
    this.batteryLevel = null;
    this.eeg = Array.from({ length: 5 }, () => new MuseCircularBuffer(256));
    this._unlisten = [];
    this._deviceName = 'Muse';
  }

  async _setupListeners() {
    const { listen } = window.__TAURI__.event;
    this._unlisten.push(
      await listen('muse-eeg', ({ payload }) => {
        const ch = payload.channel;
        if (ch < 0 || ch > 4) return;
        for (const v of payload.samples) this.eeg[ch].write(v);
      }),
    );
    this._unlisten.push(
      await listen('muse-battery', ({ payload }) => {
        this.batteryLevel = payload.percent / 100;
      }),
    );
    this._unlisten.push(
      await listen('muse-disconnected', () => {
        this.onDisconnected?.();
      }),
    );
  }

  async connect() {
    if (!isTauriApp()) throw new Error('BLE nativo solo en la app de escritorio.');
    this.state = 1;
    await this._setupListeners();
    const invoke = getInvoke();
    const name = await invoke('muse_connect');
    this._deviceName = name || 'Muse';
    this.state = 2;
    return this;
  }

  disconnect() {
    this.state = 0;
    this.batteryLevel = null;
    for (const fn of this._unlisten) fn?.();
    this._unlisten = [];
    if (isTauriApp()) {
      getInvoke()('muse_disconnect').catch(() => {});
    }
  }

  onDisconnected() {
    this.state = 0;
  }
}

export async function isNativeBleAvailable() {
  if (!isTauriApp()) return false;
  try {
    return await getInvoke()('muse_is_native_available');
  } catch {
    return false;
  }
}
