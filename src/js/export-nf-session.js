import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { formatDate } from './utils.js';

const UTF8_BOM = '\uFEFF';

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

export async function exportNfSessionCsv({ results, meta, sessionNotes, patientName, sessionNumber }) {
  if (!results) throw new Error('Sin resultados de neurofeedback para exportar.');
  const row = {
    paciente: patientName || '',
    sesion: sessionNumber ?? '',
    protocolo: meta?.protocol || '',
    dispositivo: meta?.device || 'Muse 2',
    inicio: meta?.started_at ? formatDate(meta.started_at) : '',
    fin: meta?.ended_at ? formatDate(meta.ended_at) : '',
    duracion_seg: meta?.duration_sec ?? '',
    calma_pct: results.calm_pct ?? '',
    atencion_pct: results.attentive_pct ?? '',
    relajacion_pct: results.relaxation_pct ?? '',
    calma_seg: results.calm_seconds ?? '',
    atencion_seg: results.attention_seconds ?? '',
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
  y += 4;
  line(`Paciente: ${patientName || '—'}`);
  line(`Sesión: ${sessionNumber ?? '—'}`);
  line(`Protocolo: ${meta?.protocol || '—'}`);
  line(`Duración: ${meta?.duration_sec != null ? `${meta.duration_sec} s` : '—'}`);
  y += 4;
  line('Resultados', { size: 12, style: 'bold' });
  y += 2;
  line(`Calma: ${results.calm_pct ?? '—'}%`);
  line(`Atención: ${results.attentive_pct ?? '—'}%`);
  line(`Relajación: ${results.relaxation_pct ?? '—'}%`);
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
    });
    return filename;
  }

  doc.save(filename);
  return filename;
}
