/** Modelos puros para la vista Estadísticas (sin Chart.js). */

export const STAT_COLORS = [
  '#4A86F7',
  '#34A853',
  '#46ABE1',
  '#F97316',
  '#8b5cf6',
  '#e6a800',
  '#e87a9a',
  '#3d9b6e',
  '#94a3b8',
  '#64748b',
];

const MONTH_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

export function monthShortLabel(ym) {
  const [, m] = String(ym || '').split('-').map(Number);
  return MONTH_SHORT[(m || 1) - 1] || ym;
}

export function newPatientsModel(rows = []) {
  const values = rows.map((r) => Number(r.count || 0));
  const total = values.reduce((a, b) => a + b, 0);
  const last = values.length ? values[values.length - 1] : 0;
  const prev = values.length > 1 ? values[values.length - 2] : 0;
  const max = Math.max(1, ...values, 1);
  const mean = values.length ? total / values.length : 0;
  return {
    total,
    last,
    prev,
    delta: last - prev,
    mean,
    meanPct: (mean / max) * 100,
    bars: rows.map((r, i) => ({
      ym: r.ym,
      label: monthShortLabel(r.ym),
      count: values[i],
      pct: (values[i] / max) * 100,
    })),
  };
}

export function breakdownModel(slices = [], colors = STAT_COLORS) {
  const total = slices.reduce((a, s) => a + Number(s.count || 0), 0);
  return {
    total,
    rows: slices.map((s, i) => {
      const count = Number(s.count || 0);
      return {
        label: s.label || '—',
        count,
        pct: total ? (count / total) * 100 : 0,
        color: colors[i % colors.length],
      };
    }),
  };
}

export function isEmptyBreakdown(slices) {
  return !slices?.length || (slices.length === 1 && slices[0].label === 'Sin dato');
}
