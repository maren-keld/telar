/** Decodifica nivel de batería Muse (Classic BE/512, Athena LE/256, varios offsets). */
export function decodeMuseBatteryLevel(dataView) {
  if (!dataView || dataView.byteLength < 2) return null;

  const candidates = [];
  const add = (v) => {
    if (Number.isFinite(v) && v > 0 && v <= 1.05) candidates.push(Math.min(1, v));
  };

  if (dataView.byteLength >= 3) {
    const u8 = dataView.getUint8(2);
    if (u8 <= 100) add(u8 / 100);
  }

  for (const off of [2, 4, 6]) {
    if (dataView.byteLength < off + 2) continue;
    add(dataView.getUint16(off, false) / 512);
    add(dataView.getUint16(off, true) / 256);
    add(dataView.getUint16(off, true) / 512);
  }

  if (!candidates.length) return null;
  return Math.max(...candidates);
}
