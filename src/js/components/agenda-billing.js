import {
  getBillingRows,
  getBillingSummary,
} from '../db.js';
import {
  opaqueCode,
  parseLocalISO,
  toDateISO,
  toLocalISO,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  formatMonthYear,
  formatCLP,
} from '../agenda-utils.js';
import { escapeHtml } from '../utils.js';
import { getInvoke } from '../tauri-bridge.js';
import { toast } from '../utils.js';

const PAYMENT_OPTS = [
  { value: 'por_pagar', label: 'Por pagar' },
  { value: 'pagado', label: 'Pagado' },
  { value: 'exento', label: 'Exento' },
];

function paymentClass(st) {
  if (st === 'pagado') return 'badge--success';
  if (st === 'por_pagar') return 'badge--warning';
  return '';
}

function displayName(row, presentationMode) {
  if (presentationMode) return opaqueCode(row.treatment_id);
  return row.patient_name || opaqueCode(row.treatment_id);
}

function monthRange(focusDate) {
  const s = startOfMonth(focusDate);
  const e = addDays(endOfMonth(focusDate), 1);
  return {
    from: toLocalISO(new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0)),
    to: toLocalISO(new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0, 0)),
  };
}

export function renderCobrosHtml(rows, summary, filter, presentationMode) {
  const cards = `
    <div class="agenda-billing__cards">
      <div class="card agenda-billing__card">
        <span class="text-muted">Cobrado</span>
        <strong>${formatCLP(summary.totalCobrado)}</strong>
        <span class="text-muted">${summary.countPagadas} pagadas</span>
      </div>
      <div class="card agenda-billing__card">
        <span class="text-muted">Por pagar</span>
        <strong>${formatCLP(summary.totalPorPagar)}</strong>
        <span class="text-muted">${summary.countPorPagar} pendientes</span>
      </div>
      <div class="card agenda-billing__card">
        <span class="text-muted">Sesiones del período</span>
        <strong>${summary.totalSesiones}</strong>
      </div>
    </div>`;

  const filters = ['todos', 'pagado', 'por_pagar']
    .map(
      (f) =>
        `<button type="button" class="btn btn-secondary${filter === f ? ' active' : ''}" data-billing-filter="${f}">${
          f === 'todos' ? 'Todos' : f === 'pagado' ? 'Pagado' : 'Por pagar'
        }</button>`,
    )
    .join('');

  const tableRows = rows.length
    ? rows
        .map((r) => {
          const d = parseLocalISO(r.scheduled_at);
          const dateStr = d ? `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}` : '—';
          const name = escapeHtml(displayName(r, presentationMode));
          const sens = presentationMode ? '' : ' data-sensitive';
          return `<tr>
          <td>${dateStr}</td>
          <td><span${sens}>${name}</span> · ${opaqueCode(r.treatment_id)}</td>
          <td>${formatCLP(r.fee_amount)}</td>
          <td><span class="badge ${paymentClass(r.payment_status)}">${r.payment_status.replace('_', ' ')}</span></td>
          <td>${escapeHtml(r.payment_method || '—')}</td>
          <td>${escapeHtml(r.receipt_number || '—')}</td>
        </tr>`;
        })
        .join('')
    : '<tr><td colspan="6" class="text-muted">Sin sesiones en este período.</td></tr>';

  return `
    ${cards}
    <div class="agenda-billing__toolbar">
      <div class="segmented agenda-billing__filters">${filters}</div>
      <button type="button" class="btn btn-secondary" id="btn-export-billing">Exportar CSV</button>
    </div>
    <div class="agenda-billing__table-wrap">
      <table class="agenda-billing__table">
        <thead><tr><th>Fecha</th><th>Paciente</th><th>Monto</th><th>Estado</th><th>Método</th><th>Folio</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

export async function loadCobrosData(focusDate, billingFilter) {
  const range = monthRange(focusDate);
  const [rows, summary] = await Promise.all([
    getBillingRows({ ...range, status: billingFilter }),
    getBillingSummary(range),
  ]);
  return { rows, summary, range };
}

export function bindCobrosPanel(container, { focusDate, billingFilter, presentationMode, onFilterChange }) {
  container.querySelectorAll('[data-billing-filter]').forEach((btn) => {
    btn.addEventListener('click', () => onFilterChange(btn.dataset.billingFilter));
  });

  container.querySelector('#btn-export-billing')?.addEventListener('click', async () => {
    try {
      const range = monthRange(focusDate);
      const rows = await getBillingRows({ ...range, status: billingFilter });
      const UTF8_BOM = '\uFEFF';
      const cols = ['fecha', 'codigo', 'paciente', 'monto', 'estado', 'metodo', 'folio'];
      const lines = [cols.join(',')];
      for (const r of rows) {
        const d = parseLocalISO(r.scheduled_at);
        const dateStr = d ? toDateISO(d) : '';
        lines.push(
          [dateStr, opaqueCode(r.treatment_id), r.patient_name, r.fee_amount, r.payment_status, r.payment_method, r.receipt_number]
            .map((v) => {
              const s = String(v ?? '');
              return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(','),
        );
      }
      const content = UTF8_BOM + lines.join('\n');
      const folderName = `cobros-${toDateISO(focusDate).slice(0, 7)}`;
      await getInvoke()('save_data_export', {
        folderName,
        files: [{ name: 'cobros.csv', content }],
      });
      toast('CSV exportado');
    } catch (err) {
      toast(err.message || 'No se pudo exportar');
    }
  });
}

export function cobrosSectionHeader(focusDate) {
  return formatMonthYear(focusDate);
}

export { PAYMENT_OPTS, paymentClass, monthRange, addMonths };
