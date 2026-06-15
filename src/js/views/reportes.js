import { renderPatientHeatMap } from '../chile-map.js';
import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { getAgendaGroups, getDashboardStats, getPatientDemographicsStats, getTreatmentReport } from '../db.js';
import { escapeHtml, formatDate, parseJsonSafe } from '../utils.js';

const PIE_COLORS = [
  '#2f6fed',
  '#5b8ef7',
  '#8b5cf6',
  '#3d9b6e',
  '#e6a800',
  '#e87a9a',
  '#4ecdc4',
  '#ff8c69',
  '#94a3b8',
  '#64748b',
];

function formatMonth(ym) {
  const [, m] = ym.split('-').map(Number);
  const names = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  return names[(m || 1) - 1] || ym;
}

function pieCardHtml(id, title) {
  return `
    <div class="card reportes-chart-card reportes-chart-card--pie">
      <h2 class="reportes-chart-card__title">${escapeHtml(title)}</h2>
      <div class="reportes-pie-wrap">
        <canvas id="${id}" height="200"></canvas>
      </div>
    </div>`;
}

function renderGlobalDashboard(dash, groups) {
  const enTx = (groups.en_tratamiento || []).length;

  return `
    <div class="report-grid report-grid--stats">
      <div class="card report-card"><h3>${dash.total_patients}</h3><p>Pacientes</p></div>
      <div class="card report-card"><h3>${dash.total_treatments}</h3><p>Tratamientos</p></div>
      <div class="card report-card"><h3>${enTx}</h3><p>En tratamiento activo</p></div>
    </div>

    <div class="card reportes-chart-card">
      <div class="reportes-chart-card__head">
        <h2>Pacientes nuevos por mes</h2>
        <span class="badge badge--info">Últimos 12 meses</span>
      </div>
      <canvas id="chart-new-patients" height="140"></canvas>
    </div>

    <section class="reportes-section">
      <h2 class="reportes-section__title">Tratamientos</h2>
      <div class="report-grid report-grid--stats">
        <div class="card report-card"><h3>${enTx}</h3><p>En tratamiento</p></div>
        <div class="card report-card"><h3>${(groups.completado || []).length}</h3><p>Completados</p></div>
        <div class="card report-card"><h3>${(groups.en_pausa || []).length}</h3><p>En pausa</p></div>
        <div class="card report-card"><h3>${(groups.abandonado || []).length}</h3><p>Abandonados</p></div>
      </div>
    </section>`;
}

function renderDemographicsSection() {
  return `
    <section class="reportes-section">
      <h2 class="reportes-section__title">Perfil de pacientes</h2>
      <div class="report-grid report-grid--pies">
        ${pieCardHtml('chart-age', 'Rangos de edad')}
        ${pieCardHtml('chart-gender', 'Género')}
        ${pieCardHtml('chart-marital', 'Estado marital')}
        ${pieCardHtml('chart-prevision', 'Previsión')}
        ${pieCardHtml('chart-source', 'Fuente')}
      </div>
      <div class="card reportes-chart-card reportes-chart-card--map">
        <div id="patient-heat-map" class="patient-heat-map"></div>
        <h2 class="reportes-map-footer__title">Geolocalización de pacientes —</h2>
        <p class="reportes-map-footer__desc">Descubre a través de mapas de calor el predominio de locaciones para potenciar objetivos publicitarios o investigativos.</p>
      </div>
    </section>`;
}

function mountPieChart(canvas, slices, title) {
  if (!canvas || !window.Chart || !slices.length) return;
  const prev = Chart.getChart(canvas);
  if (prev) prev.destroy();
  // eslint-disable-next-line no-new
  new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: slices.map((s) => s.label),
      datasets: [
        {
          data: slices.map((s) => s.count),
          backgroundColor: slices.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
          borderWidth: 2,
          borderColor: 'var(--bg-card)',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        title: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
              return `${ctx.label}: ${ctx.raw} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

export async function renderReportes(container, { treatmentId, onNavigate }) {
  const groups = await getAgendaGroups();
  const dash = await getDashboardStats();
  const demo = await getPatientDemographicsStats();

  const chartLabels = dash.new_patients_by_month.map((m) => formatMonth(m.ym));
  const chartValues = dash.new_patients_by_month.map((m) => m.count);

  let extraHtml = '';
  if (treatmentId) {
    const recordings = await getTreatmentReport(treatmentId);
    extraHtml = `
      <section class="reportes-section">
        <div class="card reportes-chart-card">
          <h2 class="reportes-section__title">Neurofeedback — este tratamiento</h2>
          ${
            recordings.length
              ? `<table class="reportes-table">
          <thead><tr><th>Sesión</th><th>Protocolo</th><th>Fecha</th><th>Resultados</th></tr></thead>
          <tbody>
          ${recordings
            .map((r) => {
              const res = parseJsonSafe(r.results_json, {});
              const relPct = escapeHtml(String(res.relaxation_pct ?? '—'));
              const calmPct = escapeHtml(String(res.calm_pct ?? '—'));
              return `<tr>
                <td>${escapeHtml(String(r.session_number))}</td>
                <td>${escapeHtml(r.protocol || '—')}</td>
                <td>${formatDate(r.started_at)}</td>
                <td>${relPct}% relaj · ${calmPct}% calma</td>
              </tr>`;
            })
            .join('')}
          </tbody></table>`
              : '<p class="reportes-empty">Sin grabaciones de neurofeedback en este tratamiento.</p>'
          }
        </div>
      </section>`;
  }

  container.innerHTML = `
    ${renderAppSidebar('reportes')}
    <div class="app-main" id="statistics">
      <div class="app-content reportes-page">
        <h1 class="reportes-page__title">Estadísticas</h1>
        ${renderGlobalDashboard(dash, groups)}
        ${renderDemographicsSection()}
        ${extraHtml}
      </div>
    </div>`;

  bindAppSidebar(container, { onNavigate });

  const lineCanvas = container.querySelector('#chart-new-patients');
  if (lineCanvas && window.Chart) {
    const prev = Chart.getChart(lineCanvas);
    if (prev) prev.destroy();
    // eslint-disable-next-line no-new
    new Chart(lineCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'Pacientes nuevos',
            data: chartValues,
            borderColor: '#2f6fed',
            backgroundColor: 'rgba(47, 111, 237, 0.14)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12,
            },
          },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  const pieData = {
    'chart-age': demo.age_ranges,
    'chart-gender': demo.gender,
    'chart-marital': demo.marital_status,
    'chart-prevision': demo.prevision.length ? demo.prevision : [{ label: 'Sin dato', count: 1 }],
    'chart-source': demo.source,
  };

  for (const [id, slices] of Object.entries(pieData)) {
    const canvas = container.querySelector(`#${id}`);
    if (slices.length) mountPieChart(canvas, slices);
    else if (canvas?.parentElement) {
      canvas.parentElement.innerHTML = '<p class="reportes-empty">Sin datos aún.</p>';
    }
  }

  const mapHost = container.querySelector('#patient-heat-map');
  if (mapHost) renderPatientHeatMap(mapHost, demo.addresses);
}
