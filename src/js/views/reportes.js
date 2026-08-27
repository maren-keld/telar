import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { getAgendaGroups, getDashboardStats, getPatientDemographicsStats, getTreatmentReport } from '../db.js';
import { breakdownModel, isEmptyBreakdown, newPatientsModel } from '../reportes-charts.js';
import { escapeHtml, formatDate, parseJsonSafe } from '../utils.js';

function newPatientsCardHtml(model) {
  const trendCls =
    model.delta > 0 ? 'stat-card__trend--up' : model.delta < 0 ? 'stat-card__trend--down' : '';
  const trendText =
    model.delta > 0
      ? `+${model.delta} este mes`
      : model.delta < 0
        ? `${model.delta} este mes`
        : 'Sin cambio este mes';

  return `
    <div class="card stat-card">
      <div class="stat-card__head">
        <div>
          <p class="stat-card__kicker">Pacientes nuevos</p>
          <p class="stat-card__value">${model.total}</p>
          <p class="stat-card__trend ${trendCls}">${trendText}</p>
        </div>
        <span class="badge badge--info">Últimos 12 meses</span>
      </div>
      <div class="stat-bars" role="img" aria-label="Pacientes nuevos por mes. Media mensual ${model.mean.toFixed(1)}">
        <div class="stat-bars__plot">
          <div class="stat-bars__mean" style="bottom:${model.meanPct.toFixed(1)}%" title="Media mensual: ${model.mean.toFixed(1)}"></div>
          ${model.bars
            .map((b) => {
              const h = Math.max(b.count ? 10 : 4, b.pct);
              const n = b.count ? `<span class="stat-bars__n">${b.count}</span>` : '';
              return `<div class="stat-bars__col" title="${escapeHtml(b.label)}: ${b.count}">
                <div class="stat-bars__bar" style="height:${h}%">${n}</div>
              </div>`;
            })
            .join('')}
        </div>
        <div class="stat-bars__axis">
          ${model.bars.map((b) => `<span class="stat-bars__label">${escapeHtml(b.label)}</span>`).join('')}
        </div>
        <p class="stat-bars__mean-legend">Media mensual · ${model.mean.toFixed(1)}</p>
      </div>
    </div>`;
}

function breakdownCardHtml(title, slices) {
  if (isEmptyBreakdown(slices)) {
    return `
      <div class="card stat-card stat-card--break">
        <h2 class="stat-card__title">${escapeHtml(title)}</h2>
        <p class="reportes-empty">Sin datos aún.</p>
      </div>`;
  }
  const model = breakdownModel(slices);
  return `
    <div class="card stat-card stat-card--break">
      <h2 class="stat-card__title">${escapeHtml(title)}</h2>
      <div class="stat-seg" aria-hidden="true">
        ${model.rows
          .map(
            (r) =>
              `<span class="stat-seg__pill" style="flex:${Math.max(r.count, 0.2)};background:${r.color}"></span>`,
          )
          .join('')}
      </div>
      <ul class="stat-legend">
        ${model.rows
          .map(
            (r) => `
          <li>
            <span class="stat-legend__swatch" style="background:${r.color}"></span>
            <span class="stat-legend__label">${escapeHtml(r.label)}</span>
            <span class="stat-legend__pct">${r.pct.toFixed(1)}%</span>
            <strong class="stat-legend__n">${r.count}</strong>
          </li>`,
          )
          .join('')}
      </ul>
    </div>`;
}

function renderGlobalDashboard(dash, groups) {
  const enTx = (groups.en_tratamiento || []).length;
  const patients = newPatientsModel(dash.new_patients_by_month || []);

  return `
    <section class="reportes-section">
      <h2 class="reportes-section__title">Tratamientos</h2>
      <div class="report-grid report-grid--stats">
        <div class="card report-card"><h3>${enTx}</h3><p>En tratamiento</p></div>
        <div class="card report-card"><h3>${(groups.completado || []).length}</h3><p>Completados</p></div>
        <div class="card report-card"><h3>${(groups.en_pausa || []).length}</h3><p>En pausa</p></div>
        <div class="card report-card"><h3>${(groups.abandonado || []).length}</h3><p>Abandonados</p></div>
      </div>
    </section>

    <div class="report-grid report-grid--stats">
      <div class="card report-card"><h3>${dash.total_patients}</h3><p>Pacientes</p></div>
      <div class="card report-card"><h3>${dash.total_treatments}</h3><p>Tratamientos</p></div>
      <div class="card report-card"><h3>${enTx}</h3><p>En tratamiento activo</p></div>
    </div>

    ${newPatientsCardHtml(patients)}`;
}

function renderDemographicsSection(demo) {
  return `
    <section class="reportes-section">
      <h2 class="reportes-section__title">Perfil de pacientes</h2>
      <div class="report-grid report-grid--pies">
        ${breakdownCardHtml('Rangos de edad', demo.age_ranges)}
        ${breakdownCardHtml('Género', demo.gender)}
        ${breakdownCardHtml('Estado marital', demo.marital_status)}
        ${breakdownCardHtml('Previsión', demo.prevision)}
        ${breakdownCardHtml('Fuente', demo.source)}
      </div>
    </section>`;
}

export async function renderReportes(container, { treatmentId, onNavigate }) {
  const groups = await getAgendaGroups();
  const dash = await getDashboardStats();
  const demo = await getPatientDemographicsStats();

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
        ${renderDemographicsSection(demo)}
        ${extraHtml}
      </div>
    </div>`;

  bindAppSidebar(container, { onNavigate });
}
