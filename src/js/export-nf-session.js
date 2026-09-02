import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { formatDate } from './utils.js';

const UTF8_BOM = '\uFEFF';
const BAND_ORDER = ['Delta', 'Theta', 'Alpha', 'Beta'];
const BAND_COLORS = {
  Delta: [100, 116, 181],
  Theta: [79, 143, 217],
  Alpha: [75, 192, 168],
  Beta: [230, 167, 23],
};

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function saveTextExport(filename, content) {
  if (isTauriApp()) {
    await getInvoke()('save_data_export', {
      folderName: 'nf-sesiones',
      files: [{ name: filename, content: UTF8_BOM + content }],
    });
    return;
  }
  const blob = new Blob([UTF8_BOM + content], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function drawPsdBars(doc, psdChannels, startY) {
  const M = 18;
  let y = startY;
  const channels = Object.keys(psdChannels || {});
  if (!channels.length) return y;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Potencia relativa por electrodo (%)', M, y);
  y += 6;

  const barW = 28;
  const barMaxH = 14;
  const groupW = 44;

  channels.forEach((ch, ci) => {
    const powers = psdChannels[ch] || {};
    const gx = M + ci * groupW;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(ch, gx, y);
    BAND_ORDER.forEach((band, bi) => {
      const val = Number(powers[band]) || 0;
      const h = Math.max(0.5, (val / 100) * barMaxH);
      const [r, g, b] = BAND_COLORS[band];
      doc.setFillColor(r, g, b);
      doc.rect(gx + bi * 7, y + 2 + (barMaxH - h), 6, h, 'F');
    });
    y = Math.max(y, y + barMaxH + 4);
  });
  return y + 6;
}

export async function exportNfSessionCsv({ results, meta, sessionNotes, patientName, sessionNumber }) {
  if (!results) throw new Error('Sin resultados de neurofeedback para exportar.');
  const spec = results.spectral || {};
  const row = {
    paciente: patientName || '',
    sesion: sessionNumber ?? '',
    protocolo: meta?.protocol || '',
    ojos: meta?.eye_condition || spec.eye_condition || 'open',
    dispositivo: meta?.device || 'Muse 2',
    inicio: meta?.started_at ? formatDate(meta.started_at) : '',
    fin: meta?.ended_at ? formatDate(meta.ended_at) : '',
    duracion_seg: meta?.duration_sec ?? '',
    calma_pct: results.calm_pct ?? '',
    atencion_pct: results.attentive_pct ?? '',
    relajacion_pct: results.relaxation_pct ?? '',
    calma_seg: results.calm_seconds ?? '',
    atencion_seg: results.attention_seconds ?? '',
    baseline_calma_pct: results.has_baseline ? results.baseline_calm_pct ?? '' : '',
    baseline_atencion_pct: results.has_baseline ? results.baseline_attentive_pct ?? '' : '',
    delta_calma_pct: results.has_baseline ? results.delta_calm_pct ?? '' : '',
    delta_atencion_pct: results.has_baseline ? results.delta_attentive_pct ?? '' : '',
    theta_beta_fp2: spec.theta_beta_fp2 ?? '',
    alpha_asym_fp: spec.alpha_asym_fp ?? '',
    artefacto_pct: spec.artifact_pct ?? '',
    fs_hz: spec.effective_fs ?? spec.fs_hz ?? meta?.effective_fs ?? '',
    fs_desvio: spec.fs_off_nominal ? 'si' : '',
    paquetes_perdidos: spec.packets_lost ?? meta?.packets_lost ?? '',
    paquetes_esperados: spec.packets_expected ?? meta?.packets_expected ?? '',
    incompleta: meta?.incomplete ? 'si' : '',
    notas: sessionNotes || '',
  };
  const cols = Object.keys(row);
  const csv = cols.join(',') + '\n' + cols.map((c) => csvEscape(row[c])).join(',');
  const safe = (patientName || 'paciente').replace(/[^\w\s-áéíóúñ]/gi, '').trim() || 'paciente';
  await saveTextExport(`nf-${safe}-s${sessionNumber || 'x'}.csv`, csv);
}

export async function exportNfSessionPdf({ results, meta, sessionNotes, patientName, sessionNumber }) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error('Biblioteca PDF no disponible.');
  if (!results) throw new Error('Sin resultados de neurofeedback para exportar.');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 18;
  let y = M;
  const line = (text, { size = 10, style = 'normal' } = {}) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    const lines = doc.splitTextToSize(String(text || ''), 174);
    doc.text(lines, M, y);
    y += lines.length * (size * 0.42);
  };

  line('Neurofeedback — sesión', { size: 14, style: 'bold' });
  y += 2;
  line('Bienestar y autorregulación — no es dispositivo médico.', { size: 9 });
  y += 4;
  line(`Paciente: ${patientName || '—'}`);
  line(`Sesión: ${sessionNumber ?? '—'}`);
  line(`Protocolo: ${meta?.protocol || '—'}`);
  line(`Ojos: ${meta?.eye_condition === 'closed' ? 'cerrados' : 'abiertos (mirando el orbe)'}`);
  line(`Duración: ${meta?.duration_sec != null ? `${meta.duration_sec} s` : '—'}`);
  y += 4;
  line('Resultados', { size: 12, style: 'bold' });
  y += 2;
  line(`Calma: ${results.calm_pct ?? '—'}%`);
  line(`Atención: ${results.attentive_pct ?? '—'}%`);
  line(`Relajación: ${results.relaxation_pct ?? '—'}%`);
  if (results.has_baseline) {
    line(`Δ calma vs línea base: ${results.delta_calm_pct ?? '—'}`);
    line(`Δ atención vs línea base: ${results.delta_attentive_pct ?? '—'}`);
  } else {
    line('Sin línea base grabada — no hay delta.');
  }

  const spec = results.spectral || {};
  if (spec.theta_beta_fp2 != null) {
    y += 4;
    line('Análisis espectral (orientativo)', { size: 11, style: 'bold' });
    y += 2;
    line(`Theta/Beta FP2: ${spec.theta_beta_fp2}`);
    line(`Asimetría alpha FP1−FP2: ${spec.alpha_asym_fp ?? '—'} pp`);
    if (spec.artifact_pct != null) line(`Ventanas con artefacto: ${spec.artifact_pct}%`);
    const fsHz = spec.effective_fs ?? spec.fs_hz ?? meta?.effective_fs;
    if (fsHz != null) {
      line(
        `fs efectiva: ${fsHz} Hz${spec.fs_off_nominal ? ' (desvío >2 % de 256 Hz)' : ''}`,
      );
    }
    const lost = spec.packets_lost ?? meta?.packets_lost;
    if (lost != null) {
      line(`Paquetes perdidos: ${lost}${spec.packets_expected != null ? ` / ${spec.packets_expected}` : ''}`);
    }
    if (spec.psd_channels && Object.keys(spec.psd_channels).length) {
      y += 2;
      y = drawPsdBars(doc, spec.psd_channels, y);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text('δ θ α β por columna', M, y);
      y += 5;
    }
  }

  if (sessionNotes) {
    y += 4;
    line('Notas', { size: 11, style: 'bold' });
    y += 2;
    line(sessionNotes);
  }

  const filename = `nf-${(patientName || 'paciente').replace(/[^\w\s-áéíóúñ]/gi, '').trim() || 'paciente'}-s${sessionNumber || 'x'}.pdf`;

  if (isTauriApp()) {
    const bytes = doc.output('arraybuffer');
    await getInvoke()('open_pdf_export', {
      filename,
      data: Array.from(new Uint8Array(bytes)),
      destination: null,
    });
    return filename;
  }

  doc.save(filename);
  return filename;
}
