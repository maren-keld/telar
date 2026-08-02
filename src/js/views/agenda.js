import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import {
  listScheduledSessions,
  getUnscheduledSessions,
  getSessionById,
  scheduleSession,
  unscheduleSession,
  setSessionAttendance,
  setSessionBilling,
  createAgendaAppointment,
  listPatients,
} from '../db.js';
import {
  opaqueCode,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  isSameDay,
  isToday,
  toLocalISO,
  parseLocalISO,
  toDateISO,
  parseDateISO,
  monthGrid,
  formatMonthYear,
  formatWeekRange,
  formatDayLong,
  formatTime,
} from '../agenda-utils.js';
import { loadProfile } from '../profile.js';
import { openTreatmentWorkspace } from '../navigate.js';
import { toast, escapeHtml } from '../utils.js';

const TABS = [
  { id: 'mes', label: 'Mes' },
  { id: 'semana', label: 'Semana' },
  { id: 'dia', label: 'Día' },
  { id: 'lista', label: 'Lista' },
];

const DAY_START_H = 8;
const DAY_END_H = 21;
const SLOT_MIN = 30;
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const ATTENDANCE_OPTS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'asistio', label: 'Asistió' },
  { value: 'no_asistio', label: 'No asistió' },
  { value: 'cancelada', label: 'Cancelada' },
];

const PAYMENT_OPTS = [
  { value: 'por_pagar', label: 'Por pagar' },
  { value: 'pagado', label: 'Pagado' },
  { value: 'exento', label: 'Exento' },
];

const METHOD_OPTS = [
  { value: '', label: '—' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'convenio', label: 'Convenio' },
];

function defaultTab() {
  return window.matchMedia('(max-width: 768px)').matches ? 'lista' : 'mes';
}

function resolveDate(dateStr) {
  return parseDateISO(dateStr) || new Date();
}

function displayName(session, presentationMode) {
  if (presentationMode) return opaqueCode(session.treatment_id);
  return session.patient_name || opaqueCode(session.treatment_id);
}

function sessionTimeLabel(session) {
  const d = parseLocalISO(session.scheduled_at);
  return d ? formatTime(d) : '';
}

function attendanceClass(att) {
  if (att === 'asistio') return 'badge--success';
  if (att === 'no_asistio') return 'badge--warning';
  if (att === 'cancelada') return 'badge--muted';
  return '';
}

function rangeForTab(tab, focusDate) {
  if (tab === 'mes') {
    const s = startOfMonth(focusDate);
    const e = addDays(endOfMonth(focusDate), 1);
    return { from: toLocalISO(new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0)), to: toLocalISO(new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0, 0)) };
  }
  if (tab === 'semana') {
    const s = startOfWeek(focusDate);
    const e = addDays(endOfWeek(focusDate), 1);
    return { from: toLocalISO(new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0)), to: toLocalISO(new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0, 0)) };
  }
  if (tab === 'dia') {
    const ds = toDateISO(focusDate);
    return { from: `${ds}T00:00`, to: `${ds}T23:59` };
  }
  const today = new Date();
  const end = addDays(today, 30);
  return { from: toLocalISO(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0)), to: toLocalISO(new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59)) };
}

function headerTitle(tab, focusDate) {
  if (tab === 'mes') return formatMonthYear(focusDate);
  if (tab === 'semana') return formatWeekRange(focusDate);
  if (tab === 'dia') return formatDayLong(focusDate);
  return 'Próximos 30 días';
}

function renderSessionChip(session, presentationMode, extra = '') {
  const name = escapeHtml(displayName(session, presentationMode));
  const sens = presentationMode ? '' : ' data-sensitive';
  const time = sessionTimeLabel(session);
  const cancelled = session.attendance === 'cancelada' ? ' agenda-chip--cancelled' : '';
  return `<button type="button" class="agenda-chip${cancelled}${extra}" data-session-id="${session.id}">
    ${time ? `<span class="agenda-chip__time">${time}</span>` : ''}
    <span${sens}>${name}</span>
  </button>`;
}

function renderMonthView(focusDate, sessions, presentationMode) {
  const grid = monthGrid(focusDate);
  const byDay = {};
  for (const s of sessions) {
    const d = parseLocalISO(s.scheduled_at);
    if (!d) continue;
    const key = toDateISO(d);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(s);
  }

  const rows = grid
    .map(
      (week) => `
    <div class="agenda-month__row">
      ${week
        .map((cell) => {
          const key = toDateISO(cell.date);
          const daySessions = byDay[key] || [];
          const today = isToday(cell.date) ? ' agenda-month__cell--today' : '';
          const out = !cell.inMonth ? ' agenda-month__cell--out' : '';
          const chips = daySessions.slice(0, 3).map((s) => renderSessionChip(s, presentationMode)).join('');
          const more = daySessions.length > 3 ? `<span class="agenda-month__more">+${daySessions.length - 3} más</span>` : '';
          return `
          <div class="agenda-month__cell${today}${out}" data-goto-day="${key}">
            <span class="agenda-month__daynum">${cell.date.getDate()}</span>
            <div class="agenda-month__chips">${chips}${more}</div>
          </div>`;
        })
        .join('')}
    </div>`,
    )
    .join('');

  return `
    <div class="agenda-month">
      <div class="agenda-month__head">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
      ${rows}
    </div>`;
}

function slotCount() {
  return ((DAY_END_H - DAY_START_H) * 60) / SLOT_MIN;
}

function renderTimeGrid(sessions, focusDate, { multiDay = false, weekDates = [], presentationMode = false } = {}) {
  const slots = slotCount();
  const totalMin = (DAY_END_H - DAY_START_H) * 60;
  const now = new Date();
  const showNow = multiDay
    ? weekDates.some((d) => isSameDay(d, now))
    : isSameDay(focusDate, now);
  const nowTop =
    showNow && now.getHours() >= DAY_START_H && now.getHours() < DAY_END_H
      ? ((now.getHours() - DAY_START_H) * 60 + now.getMinutes()) / totalMin
      : null;

  const dates = multiDay ? weekDates : [focusDate];
  const columns = dates
    .map((d) => {
      const key = toDateISO(d);
      const daySessions = sessions.filter((s) => {
        const sd = parseLocalISO(s.scheduled_at);
        return sd && isSameDay(sd, d);
      });
      const blocks = daySessions
        .map((s) => {
          const start = parseLocalISO(s.scheduled_at);
          const topMin = (start.getHours() - DAY_START_H) * 60 + start.getMinutes();
          const heightMin = s.duration_min || 50;
          const top = (topMin / totalMin) * 100;
          const height = (heightMin / totalMin) * 100;
          return `<div class="agenda-block" style="top:${top}%;height:${height}%" data-session-id="${s.id}">
            ${renderSessionChip(s, presentationMode, ' agenda-chip--block')}
          </div>`;
        })
        .join('');
      const today = isToday(d) ? ' agenda-week__col--today' : '';
      return `
        <div class="agenda-week__col${today}" data-date="${key}">
          <div class="agenda-week__colhead">${WEEKDAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getDate()}</div>
          <div class="agenda-week__grid">
            ${Array.from({ length: slots }, (_, i) => `<div class="agenda-week__slot" style="height:${100 / slots}%"></div>`).join('')}
            ${blocks}
            ${nowTop !== null && isSameDay(d, now) ? `<div class="agenda-now-line" style="top:${nowTop * 100}%"></div>` : ''}
          </div>
        </div>`;
    })
    .join('');

  const labels = Array.from({ length: slots + 1 }, (_, i) => {
    const min = DAY_START_H * 60 + i * SLOT_MIN;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `<span style="height:${100 / slots}%">${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}</span>`;
  }).join('');

  return `
    <div class="agenda-timegrid${multiDay ? ' agenda-timegrid--week' : ''}">
      <div class="agenda-timegrid__labels">${labels}</div>
      <div class="agenda-timegrid__cols">${columns}</div>
    </div>`;
}

function renderListView(sessions, presentationMode) {
  const byDay = {};
  for (const s of sessions) {
    const d = parseLocalISO(s.scheduled_at);
    if (!d) continue;
    const key = toDateISO(d);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(s);
  }
  const keys = Object.keys(byDay).sort();
  if (!keys.length) return '<p class="text-muted agenda-empty-inline">Sin sesiones agendadas en los próximos 30 días.</p>';

  return keys
    .map((key) => {
      const d = parseDateISO(key);
      const label = formatDayLong(d);
      const items = byDay[key].map((s) => renderSessionChip(s, presentationMode, ' agenda-chip--list')).join('');
      return `<section class="agenda-list__day"><h3>${label}</h3><div class="agenda-list__items">${items}</div></section>`;
    })
    .join('');
}

function renderUnscheduledPanel(unscheduled, presentationMode) {
  if (!unscheduled.length) return '';
  const items = unscheduled
    .slice(0, 20)
    .map(
      (s) => `
    <div class="agenda-unscheduled__item" data-unscheduled-id="${s.id}">
      <span${presentationMode ? '' : ' data-sensitive'}>${escapeHtml(displayName(s, presentationMode))}</span>
      <span class="text-muted">Sesión ${s.session_number || s.number}</span>
      <button type="button" class="btn btn-secondary btn-sm" data-schedule-quick="${s.id}">Agendar</button>
    </div>`,
    )
    .join('');
  return `
    <aside class="agenda-unscheduled card" id="agenda-unscheduled">
      <h3>Por agendar <span class="badge">${unscheduled.length}</span></h3>
      <div class="agenda-unscheduled__list">${items}</div>
    </aside>`;
}

function renderDetailModalBody(session, presentationMode) {
  if (!session) return '';
  const name = escapeHtml(displayName(session, presentationMode));
  const sens = presentationMode ? '' : ' data-sensitive';
  const time = session.scheduled_at ? session.scheduled_at.replace('T', ' ') : 'Sin fecha';

  return `
      <h3><span${sens}>${name}</span></h3>
      <p class="text-muted">${opaqueCode(session.treatment_id)} · Sesión ${session.session_number || session.number}</p>
      <p><strong>${time}</strong> · ${session.duration_min || 50} min</p>

      <div class="form-group">
        <label>Asistencia</label>
        <select id="detail-attendance">
          ${ATTENDANCE_OPTS.map((o) => `<option value="${o.value}"${session.attendance === o.value ? ' selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>

      <fieldset class="agenda-detail__billing">
        <legend>Cobro</legend>
        <div class="form-group">
          <label>Monto (CLP)</label>
          <input type="number" id="detail-fee" min="0" step="1000" value="${session.fee_amount || 0}" />
        </div>
        <div class="form-group">
          <label>Estado</label>
          <select id="detail-payment-status">
            ${PAYMENT_OPTS.map((o) => `<option value="${o.value}"${session.payment_status === o.value ? ' selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Método</label>
          <select id="detail-payment-method">
            ${METHOD_OPTS.map((o) => `<option value="${o.value}"${session.payment_method === o.value ? ' selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Folio BHE (manual)</label>
          <input type="text" id="detail-receipt" value="${escapeHtml(session.receipt_number || '')}" placeholder="Ej. 12345" />
        </div>
        <button type="button" class="btn btn-secondary" id="detail-save-billing">Guardar cobro</button>
      </fieldset>

      <div class="agenda-detail-modal__actions">
        <button type="button" class="btn btn-primary" id="detail-open-treatment">Abrir ficha</button>
        ${session.scheduled_at ? '<button type="button" class="btn btn-secondary" id="detail-unschedule">Quitar fecha</button>' : ''}
        <button type="button" class="btn btn-ghost" id="detail-close">Cerrar</button>
      </div>`;
}

function renderDetailModal() {
  return `
    <dialog class="agenda-detail-modal" id="agenda-detail-modal">
      <div class="agenda-detail-modal__body" id="agenda-detail-body">
        <p class="text-muted">Selecciona una sesión para ver detalle.</p>
      </div>
    </dialog>`;
}

function renderScheduleModal() {
  return `
    <dialog class="agenda-modal" id="agenda-schedule-modal">
      <form method="dialog" class="agenda-modal__body">
        <h3>Agendar sesión</h3>
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="schedule-date" required />
        </div>
        <div class="form-group">
          <label>Hora</label>
          <input type="time" id="schedule-time" value="10:00" required />
        </div>
        <div class="form-group">
          <label>Duración (min)</label>
          <input type="number" id="schedule-duration" min="15" step="5" value="50" />
        </div>
        <div class="agenda-modal__actions">
          <button type="button" class="btn btn-secondary" id="schedule-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    </dialog>`;
}

function renderNewAppointmentModal() {
  return `
    <dialog class="agenda-modal" id="agenda-new-appointment-modal">
      <form method="dialog" class="agenda-modal__body" id="agenda-new-appointment-form">
        <h3>Nueva sesión</h3>
        <p class="text-muted" style="margin:0 0 12px;font-size:0.85rem">Crea un tratamiento nuevo y agenda la primera sesión.</p>
        <div class="agenda-new-apt__mode">
          <label><input type="radio" name="apt-mode" value="new" checked /> Paciente nuevo</label>
          <label><input type="radio" name="apt-mode" value="existing" /> Paciente existente</label>
        </div>
        <div class="form-group" id="apt-new-name-group">
          <label>Nombre del paciente</label>
          <input type="text" id="apt-new-name" class="input" placeholder="Nombre completo" />
        </div>
        <div class="form-group" id="apt-existing-group" hidden>
          <label>Paciente</label>
          <select id="apt-existing-patient"></select>
        </div>
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="apt-date" required />
        </div>
        <div class="form-group">
          <label>Hora</label>
          <input type="time" id="apt-time" value="10:00" required />
        </div>
        <div class="form-group">
          <label>Duración (min)</label>
          <input type="number" id="apt-duration" min="15" step="5" value="50" />
        </div>
        <div class="agenda-modal__actions">
          <button type="button" class="btn btn-secondary" id="apt-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Agendar</button>
        </div>
      </form>
    </dialog>`;
}

export async function renderAgenda(container, { tab, date, sessionId, onNavigate }) {
  const activeTab = tab || defaultTab();
  const focusDate = resolveDate(date);
  const profile = loadProfile();
  const presentationMode = Boolean(profile.presentationMode);
  const range = rangeForTab(activeTab, focusDate);

  const [sessions, unscheduled, patients] = await Promise.all([
    listScheduledSessions(range),
    getUnscheduledSessions(),
    listPatients(),
  ]);

  let selectedSession = sessionId ? await getSessionById(sessionId) : null;
  if (sessionId && !selectedSession) selectedSession = sessions.find((s) => String(s.id) === String(sessionId)) || null;

  const weekDates =
    activeTab === 'semana'
      ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(focusDate), i))
      : [];

  const tabBar = TABS.map(
    (t) =>
      `<button type="button" class="${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`,
  ).join('');

  let bodyHtml = '';
  if (activeTab === 'mes') bodyHtml = renderMonthView(focusDate, sessions, presentationMode);
  else if (activeTab === 'semana') bodyHtml = renderTimeGrid(sessions, focusDate, { multiDay: true, weekDates, presentationMode });
  else if (activeTab === 'dia') bodyHtml = `<div class="agenda-day-layout">${renderTimeGrid(sessions, focusDate, { presentationMode })}</div>`;
  else if (activeTab === 'lista') bodyHtml = renderListView(sessions, presentationMode);

  container.innerHTML = `
    ${renderAppSidebar('agenda')}
    <div class="app-main agenda-view">
      <div class="app-content">
        <div class="agenda-header">
          <div class="agenda-header__nav">
            <button type="button" class="btn btn-secondary btn-icon-only" id="agenda-prev" title="Anterior">‹</button>
            <button type="button" class="btn btn-secondary" id="agenda-today">Hoy</button>
            <button type="button" class="btn btn-secondary btn-icon-only" id="agenda-next" title="Siguiente">›</button>
            <h1 class="agenda-header__title">${headerTitle(activeTab, focusDate)}</h1>
          </div>
          <div class="agenda-header__actions">
            <button type="button" class="btn btn-secondary" id="btn-unscheduled-toggle">Por agendar (${unscheduled.length})</button>
          </div>
        </div>

        <div class="segmented agenda-tabs">${tabBar}</div>

        <div class="agenda-body">
          ${bodyHtml}
        </div>

        ${renderUnscheduledPanel(unscheduled, presentationMode)}
        ${renderScheduleModal()}
        ${renderNewAppointmentModal()}
        ${renderDetailModal()}
      </div>
    </div>`;

  bindAppSidebar(container, { onNavigate });

  const nav = (patch) => onNavigate({ view: 'agenda', tab: activeTab, date: toDateISO(focusDate), sessionId, ...patch });

  const detailModal = container.querySelector('#agenda-detail-modal');
  let detailSession = selectedSession;

  const bindDetailModal = (session) => {
    detailSession = session;
    const body = container.querySelector('#agenda-detail-body');
    if (!body) return;
    if (!session) {
      body.innerHTML = '<p class="text-muted">Selecciona una sesión para ver detalle.</p>';
      return;
    }
    body.innerHTML = renderDetailModalBody(session, presentationMode);

    body.querySelector('#detail-close')?.addEventListener('click', () => detailModal?.close());
    body.querySelector('#detail-attendance')?.addEventListener('change', async (e) => {
      try {
        await setSessionAttendance(session.id, e.target.value);
        toast('Asistencia actualizada');
        nav({ sessionId: session.id });
      } catch (err) {
        toast(err.message || 'Error');
      }
    });
    body.querySelector('#detail-save-billing')?.addEventListener('click', async () => {
      try {
        await setSessionBilling(session.id, {
          feeAmount: Number(body.querySelector('#detail-fee').value) || 0,
          paymentStatus: body.querySelector('#detail-payment-status').value,
          paymentMethod: body.querySelector('#detail-payment-method').value,
          receiptNumber: body.querySelector('#detail-receipt').value,
        });
        toast('Cobro guardado');
        nav({ sessionId: session.id });
      } catch (err) {
        toast(err.message || 'Error');
      }
    });
    body.querySelector('#detail-open-treatment')?.addEventListener('click', () => {
      detailModal?.close();
      openTreatmentWorkspace(session.treatment_id, onNavigate);
    });
    body.querySelector('#detail-unschedule')?.addEventListener('click', async () => {
      try {
        await unscheduleSession(session.id);
        toast('Fecha eliminada');
        detailModal?.close();
        nav({ sessionId: '' });
      } catch (err) {
        toast(err.message || 'Error');
      }
    });
  };

  const openDetailModal = async (sid) => {
    const session = await getSessionById(sid);
    if (!session) return;
    bindDetailModal(session);
    detailModal?.showModal();
  };

  if (selectedSession) {
    bindDetailModal(selectedSession);
    detailModal?.showModal();
  }

  container.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => nav({ tab: btn.dataset.tab, sessionId: '' }));
  });

  container.querySelector('#agenda-today')?.addEventListener('click', () => nav({ date: toDateISO(new Date()) }));
  container.querySelector('#agenda-prev')?.addEventListener('click', () => {
    if (activeTab === 'mes') nav({ date: toDateISO(addMonths(focusDate, -1)) });
    else if (activeTab === 'semana') nav({ date: toDateISO(addWeeks(focusDate, -1)) });
    else if (activeTab === 'dia') nav({ date: toDateISO(addDays(focusDate, -1)) });
  });
  container.querySelector('#agenda-next')?.addEventListener('click', () => {
    if (activeTab === 'mes') nav({ date: toDateISO(addMonths(focusDate, 1)) });
    else if (activeTab === 'semana') nav({ date: toDateISO(addWeeks(focusDate, 1)) });
    else if (activeTab === 'dia') nav({ date: toDateISO(addDays(focusDate, 1)) });
  });

  const newAptModal = container.querySelector('#agenda-new-appointment-modal');
  const openNewAppointmentModal = (dateISO) => {
    newAptModal.querySelector('#apt-date').value = dateISO;
    newAptModal.querySelector('#apt-time').value = '10:00';
    newAptModal.querySelector('#apt-new-name').value = '';
    const existingSelect = newAptModal.querySelector('#apt-existing-patient');
    existingSelect.innerHTML = patients.length
      ? patients.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')
      : '<option value="">— Sin pacientes —</option>';
    newAptModal.querySelector('input[name="apt-mode"][value="new"]').checked = true;
    newAptModal.querySelector('#apt-new-name-group').hidden = false;
    newAptModal.querySelector('#apt-existing-group').hidden = true;
    newAptModal.showModal();
  };

  newAptModal?.querySelectorAll('input[name="apt-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isNew = newAptModal.querySelector('input[name="apt-mode"]:checked')?.value === 'new';
      newAptModal.querySelector('#apt-new-name-group').hidden = !isNew;
      newAptModal.querySelector('#apt-existing-group').hidden = isNew;
    });
  });

  container.querySelectorAll('[data-goto-day]').forEach((cell) => {
    cell.addEventListener('click', (e) => {
      if (e.target.closest('[data-session-id]')) return;
      if (activeTab === 'mes') {
        openNewAppointmentModal(cell.dataset.gotoDay);
        return;
      }
      nav({ tab: 'dia', date: cell.dataset.gotoDay });
    });
  });

  container.querySelectorAll('[data-session-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetailModal(Number(el.dataset.sessionId));
    });
  });

  container.querySelector('#btn-unscheduled-toggle')?.addEventListener('click', () => {
    const panel = container.querySelector('#agenda-unscheduled');
    panel?.classList.toggle('agenda-unscheduled--open');
  });

  const modal = container.querySelector('#agenda-schedule-modal');
  let scheduleTargetId = null;

  const openScheduleModal = (sessionId) => {
    scheduleTargetId = sessionId;
    modal.querySelector('#schedule-date').value = toDateISO(focusDate);
    modal.showModal();
  };

  container.querySelectorAll('[data-schedule-quick]').forEach((btn) => {
    btn.addEventListener('click', () => openScheduleModal(Number(btn.dataset.scheduleQuick)));
  });

  modal?.querySelector('#schedule-cancel')?.addEventListener('click', () => modal.close());
  modal?.addEventListener('close', () => {
    scheduleTargetId = null;
  });
  modal?.querySelector('form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!scheduleTargetId) return;
    const dateVal = modal.querySelector('#schedule-date').value;
    const timeVal = modal.querySelector('#schedule-time').value;
    const dur = Number(modal.querySelector('#schedule-duration').value) || 50;
    try {
      await scheduleSession(scheduleTargetId, {
        scheduledAt: `${dateVal}T${timeVal}`,
        durationMin: dur,
      });
      toast('Sesión agendada');
      modal.close();
      nav({ tab: activeTab });
    } catch (err) {
      toast(err.message || 'No se pudo agendar');
    }
  });

  newAptModal?.querySelector('#apt-cancel')?.addEventListener('click', () => newAptModal.close());
  newAptModal?.querySelector('#agenda-new-appointment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dateVal = newAptModal.querySelector('#apt-date').value;
    const timeVal = newAptModal.querySelector('#apt-time').value;
    const dur = Number(newAptModal.querySelector('#apt-duration').value) || 50;
    const isNew = newAptModal.querySelector('input[name="apt-mode"]:checked')?.value === 'new';
    const patientName = newAptModal.querySelector('#apt-new-name').value.trim();
    const patientId = isNew ? null : Number(newAptModal.querySelector('#apt-existing-patient').value) || null;
    if (isNew && !patientName) {
      toast('Indica el nombre del paciente');
      return;
    }
    if (!isNew && !patientId) {
      toast('Selecciona un paciente');
      return;
    }
    try {
      const { treatmentId } = await createAgendaAppointment({
        patientId,
        patientName,
        scheduledAt: `${dateVal}T${timeVal}`,
        durationMin: dur,
      });
      toast('Sesión agendada');
      newAptModal.close();
      openTreatmentWorkspace(treatmentId, onNavigate);
    } catch (err) {
      toast(err.message || 'No se pudo agendar');
    }
  });
}
