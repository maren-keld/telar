/**
 * @name MuseJS
 * @version 1.0 | June 2022
 * @author Respiire Health Systems Inc.
 * @license MIT
 * @see https://c86405ffad19a6265b95230b2818f733.cdn.bubble.io/f1712687056037x412629362840832640/Muse.js
 */

class MuseCircularBuffer {
  constructor(size) {
    this.memory = new Array(size);
    for (let i = 0; i < size; i++) this.memory[i] = 0;
    this.head = 0;
    this.tail = 0;
    this.isFull = false;
    this.lastwrite = 0;
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
    this.lastwrite = Date.now();
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

export class Muse {
  constructor() {
    const BUFFER_SIZE = 256;
    this.SERVICE = 0xfe8d;
    this.CONTROL_CHARACTERISTIC = '273e0001-4c4d-454d-96be-f03bac821358';
    this.BATTERY_CHARACTERISTIC = '273e000b-4c4d-454d-96be-f03bac821358';
    this.GYROSCOPE_CHARACTERISTIC = '273e0009-4c4d-454d-96be-f03bac821358';
    this.ACCELEROMETER_CHARACTERISTIC = '273e000a-4c4d-454d-96be-f03bac821358';
    this.PPG1_CHARACTERISTIC = '273e000f-4c4d-454d-96be-f03bac821358';
    this.PPG2_CHARACTERISTIC = '273e0010-4c4d-454d-96be-f03bac821358';
    this.PPG3_CHARACTERISTIC = '273e0011-4c4d-454d-96be-f03bac821358';
    this.EEG1_CHARACTERISTIC = '273e0003-4c4d-454d-96be-f03bac821358';
    this.EEG2_CHARACTERISTIC = '273e0004-4c4d-454d-96be-f03bac821358';
    this.EEG3_CHARACTERISTIC = '273e0005-4c4d-454d-96be-f03bac821358';
    this.EEG4_CHARACTERISTIC = '273e0006-4c4d-454d-96be-f03bac821358';
    this.EEG5_CHARACTERISTIC = '273e0007-4c4d-454d-96be-f03bac821358';
    this.state = 0;
    this.dev = null;
    this.controlChar = null;
    this.batteryLevel = null;
    this.info = {};
    this.infoFragment = '';
    this.eeg = Array.from({ length: 5 }, () => new MuseCircularBuffer(BUFFER_SIZE));
    this.ppg = Array.from({ length: 3 }, () => new MuseCircularBuffer(BUFFER_SIZE));
    this.accelerometer = Array.from({ length: 3 }, () => new MuseCircularBuffer(BUFFER_SIZE));
    this.gyroscope = Array.from({ length: 3 }, () => new MuseCircularBuffer(BUFFER_SIZE));
  }

  decodeInfo(bytes) {
    return new TextDecoder().decode(bytes.subarray(1, 1 + bytes[0]));
  }

  decodeUnsigned24BitData(samples) {
    const samples24Bit = [];
    for (let i = 0; i < samples.length; i += 3) {
      samples24Bit.push((samples[i] << 16) | (samples[i + 1] << 8) | samples[i + 2]);
    }
    return samples24Bit;
  }

  decodeUnsigned12BitData(samples) {
    const samples12Bit = [];
    for (let i = 0; i < samples.length; i++) {
      if (i % 3 === 0) {
        samples12Bit.push((samples[i] << 4) | (samples[i + 1] >> 4));
      } else {
        samples12Bit.push(((samples[i] & 0xf) << 8) | samples[i + 1]);
        i++;
      }
    }
    return samples12Bit;
  }

  encodeCommand(cmd) {
    const encoded = new TextEncoder().encode(`X${cmd}\n`);
    encoded[0] = encoded.length - 1;
    return encoded;
  }

  batteryData(event) {
    let data = event.target.value;
    data = data.buffer ? data : new DataView(data);
    this.batteryLevel = data.getUint16(2) / 512;
  }

  motionData(dv, scale, ofs) {
    return [scale * dv.getInt16(ofs), scale * dv.getInt16(ofs + 2), scale * dv.getInt16(ofs + 4)];
  }

  accelerometerData(event) {
    const scale = 0.0000610352;
    let data = event.target.value;
    data = data.buffer ? data : new DataView(data);
    let ofs = 2;
    for (let i = 0; i < 3; i++) {
      const vals = this.motionData(data, scale, ofs);
      this.accelerometer[0].write(vals[0]);
      this.accelerometer[1].write(vals[1]);
      this.accelerometer[2].write(vals[2]);
      ofs += 6;
    }
  }

  gyroscopeData(event) {
    const scale = 0.0074768;
    let data = event.target.value;
    data = data.buffer ? data : new DataView(data);
    let ofs = 2;
    for (let i = 0; i < 3; i++) {
      const vals = this.motionData(data, scale, ofs);
      this.gyroscope[0].write(vals[0]);
      this.gyroscope[1].write(vals[1]);
      this.gyroscope[2].write(vals[2]);
      ofs += 6;
    }
  }

  controlData(event) {
    let data = event.target.value;
    data = data.buffer ? data : new DataView(data);
    const buf = new Uint8Array(data.buffer);
    const str = this.decodeInfo(buf);
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      this.infoFragment += c;
      if (c === '}') {
        try {
          const tmp = JSON.parse(this.infoFragment);
          Object.assign(this.info, tmp);
        } catch {
          // mensaje de control malformado — ignorar fragmento
        }
        this.infoFragment = '';
      }
    }
  }

  eegData(n, event) {
    let data = event.target.value;
    data = data.buffer ? data : new DataView(data);
    let samples = this.decodeUnsigned12BitData(new Uint8Array(data.buffer).subarray(2));
    samples = samples.map((x) => 0.48828125 * (x - 0x800));
    for (let i = 0; i < samples.length; i++) this.eeg[n].write(samples[i]);
  }

  ppgData(n, event) {
    let data = event.target.value;
    data = data.buffer ? data : new DataView(data);
    const samples = this.decodeUnsigned24BitData(new Uint8Array(data.buffer).subarray(2));
    for (let i = 0; i < samples.length; i++) this.ppg[n].write(samples[i]);
  }

  async sendCommand(cmd) {
    await this.controlChar.writeValue(this.encodeCommand(cmd));
  }

  async pause() {
    await this.sendCommand('h');
  }

  async resume() {
    await this.sendCommand('d');
  }

  async start() {
    await this.pause();
    await this.sendCommand('p50');
    await this.sendCommand('s');
    await this.resume();
  }

  disconnect() {
    if (this.dev) this.dev.gatt.disconnect();
    this.dev = null;
    this.state = 0;
  }

  onDisconnected() {
    this.dev = null;
    this.state = 0;
  }

  async connectChar(service, cid, hook) {
    const c = await service.getCharacteristic(cid);
    c.oncharacteristicvaluechanged = hook;
    await c.startNotifications();
    return c;
  }

  async connect() {
    if (this.dev || this.state !== 0) return;
    this.state = 1;
    try {
      this.dev = await navigator.bluetooth.requestDevice({
        filters: [{ services: [this.SERVICE] }],
      });
    } catch (e) {
      this.dev = null;
      this.state = 0;
      throw new Error(`No se pudo seleccionar el dispositivo Muse: ${e.message ?? e}`);
    }
    let gatt;
    try {
      gatt = await this.dev.gatt.connect();
    } catch (e) {
      this.dev = null;
      this.state = 0;
      throw new Error(`No se pudo conectar al GATT del Muse: ${e.message ?? e}`);
    }
    const service = await gatt.getPrimaryService(this.SERVICE);
    const that = this;
    this.dev.addEventListener('gattserverdisconnected', () => that.onDisconnected());
    this.controlChar = await this.connectChar(service, this.CONTROL_CHARACTERISTIC, (e) =>
      that.controlData(e),
    );
    await this.connectChar(service, this.BATTERY_CHARACTERISTIC, (e) => that.batteryData(e));
    await this.connectChar(service, this.GYROSCOPE_CHARACTERISTIC, (e) => that.gyroscopeData(e));
    await this.connectChar(service, this.ACCELEROMETER_CHARACTERISTIC, (e) =>
      that.accelerometerData(e),
    );
    await this.connectChar(service, this.PPG1_CHARACTERISTIC, (e) => that.ppgData(0, e));
    await this.connectChar(service, this.PPG2_CHARACTERISTIC, (e) => that.ppgData(1, e));
    await this.connectChar(service, this.PPG3_CHARACTERISTIC, (e) => that.ppgData(2, e));
    await this.connectChar(service, this.EEG1_CHARACTERISTIC, (e) => that.eegData(0, e));
    await this.connectChar(service, this.EEG2_CHARACTERISTIC, (e) => that.eegData(1, e));
    await this.connectChar(service, this.EEG3_CHARACTERISTIC, (e) => that.eegData(2, e));
    await this.connectChar(service, this.EEG4_CHARACTERISTIC, (e) => that.eegData(3, e));
    await this.connectChar(service, this.EEG5_CHARACTERISTIC, (e) => that.eegData(4, e));
    await this.start();
    await this.sendCommand('v1');
    this.state = 2;
  }
}
