import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import {
  deleteConvenio,
  getGoalsProgress,
  getPracticeGoals,
  listConvenios,
  savePracticeGoals,
  upsertConvenio,
} from '../db.js';
import { escapeHtml, toast } from '../utils.js';

const ORG_TYPES = [
  { value: 'empresa', label: 'Empresa' },
  { value: 'colegio', label: 'Colegio' },
  { value: 'institucion', label: 'Institución' },
  { value: 'otro', label: 'Otro' },
];

function goalProgressHtml(actual, target) {
  if (target == null || target === '' || Number.isNaN(Number(target))) {
    return `<span class="goals-progress goals-progress--open">${actual} actuales</span>`;
  }
  const t = Number(target);
  const pct = t > 0 ? Math.min(100, Math.round((actual / t) * 100)) : 0;
  const done = actual >= t;
  return `
    <span class="goals-progress ${done ? 'goals-progress--done' : ''}">${actual} / ${t}</span>
    <div class="goals-progress-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>`;
}

function goalCard({ key, title, sub, actual, target, fields }) {
  const inputs = fields
    .map(
      (f) => `
    <label class="goals-field">
      <span class="goals-field__label">${escapeHtml(f.label)}</span>
      <input type="number" min="0" step="1" inputmode="numeric"
        name="${f.name}" data-goal-key="${key}" data-goal-field="${f.field}"
        value="${target?.[f.field] != null ? escapeHtml(String(target[f.field])) : ''}"
        placeholder="—" />
    </label>`,
    )
    .join('');

  return `
    <article class="card goals-card" data-goal-card="${key}">
      <h2 class="goals-card__title">${escapeHtml(title)}</h2>
      ${sub ? `<p class="goals-card__sub">${escapeHtml(sub)}</p>` : ''}
      <div class="goals-card__progress">${goalProgressHtml(actual, fields.length === 1 ? target?.[fields[0].field] : null)}</div>
      <div class="goals-card__fields">${inputs}</div>
    </article>`;
}

function contactRowHtml(c, i) {
  return `
    <div class="convenio-contact" data-contact-idx="${i}">
      <div class="convenio-contact__grid">
        <input type="text" name="c_name" value="${escapeHtml(c.name || '')}" placeholder="Nombre" />
        <input type="email" name="c_email" value="${escapeHtml(c.email || '')}" placeholder="Email" />
        <input type="tel" name="c_phone" value="${escapeHtml(c.phone || '')}" placeholder="Teléfono" />
        <textarea name="c_note" rows="2" placeholder="Nota">${escapeHtml(c.note || '')}</textarea>
      </div>
      <button type="button" class="btn btn-ghost btn-sm convenio-contact__remove" title="Quitar contacto">×</button>
    </div>`;
}

function convenioCardHtml(c) {
  const typeLabel = ORG_TYPES.find((t) => t.value === c.org_type)?.label || c.org_type || '—';
  const contacts = Array.isArray(c.contacts) ? c.contacts : [];
  return `
    <article class="card convenio-card" data-convenio-id="${c.id}">
      <div class="convenio-card__head">
        <div>
          <h3 class="convenio-card__name">${escapeHtml(c.name)}</h3>
          <p class="convenio-card__meta">${escapeHtml(typeLabel)}</p>
        </div>
        <div class="convenio-card__actions">
          <button type="button" class="btn btn-ghost btn-sm" data-edit-convenio title="Editar">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm" data-delete-convenio title="Eliminar">Eliminar</button>
        </div>
      </div>
      ${c.notes ? `<p class="convenio-card__notes">${escapeHtml(c.notes)}</p>` : ''}
      ${
        contacts.length
          ? `<ul class="convenio-card__contacts">
          ${contacts
            .map(
              (p) =>
                `<li><strong>${escapeHtml(p.name || 'Sin nombre')}</strong>${p.email ? ` · ${escapeHtml(p.email)}` : ''}${p.phone ? ` · ${escapeHtml(p.phone)}` : ''}${p.note ? `<br><span class="text-muted">${escapeHtml(p.note)}</span>` : ''}</li>`,
            )
            .join('')}
        </ul>`
          : '<p class="text-muted convenio-card__empty-contacts">Sin contactos registrados.</p>'
      }
    </article>`;
}

function openConvenioModal(convenio, { onSaved }) {
  const root = document.getElementById('modal-root');
  const isNew = !convenio?.id;
  const contacts = Array.isArray(convenio?.contacts) ? [...convenio.contacts] : [];
  if (!contacts.length) contacts.push({ name: '', email: '', phone: '', note: '' });

  root.innerHTML = `
    <div class="modal-backdrop" id="convenio-modal-backdrop">
      <div class="modal modal--wide goals-modal" role="dialog" aria-labelledby="convenio-modal-title">
        <header class="modal__head">
          <h2 id="convenio-modal-title">${isNew ? 'Nuevo convenio' : 'Editar convenio'}</h2>
          <button type="button" class="btn btn-ghost" id="convenio-modal-close" aria-label="Cerrar">×</button>
        </header>
        <form id="convenio-form" class="convenio-form">
          <div class="form-group">
            <label>Nombre (empresa, colegio, etc.)</label>
            <input type="text" name="name" required value="${escapeHtml(convenio?.name || '')}" placeholder="Ej. Colegio San José" />
          </div>
          <div class="form-group">
            <label>Tipo</label>
            <select name="org_type">
              ${ORG_TYPES.map(
                (t) =>
                  `<option value="${t.value}" ${convenio?.org_type === t.value ? 'selected' : ''}>${escapeHtml(t.label)}</option>`,
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Notas</label>
            <textarea name="notes" rows="2" placeholder="Detalles del convenio…">${escapeHtml(convenio?.notes || '')}</textarea>
          </div>
          <div class="convenio-form__contacts-head">
            <label>Contactos directos</label>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-add-contact">+ Contacto</button>
          </div>
          <div id="convenio-contacts">${contacts.map(contactRowHtml).join('')}</div>
          <footer class="modal__foot">
            <button type="button" class="btn btn-ghost" id="convenio-modal-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">${isNew ? 'Crear convenio' : 'Guardar'}</button>
          </footer>
        </form>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };

  const contactsEl = root.querySelector('#convenio-contacts');

  const reindexContacts = () => {
    contactsEl.querySelectorAll('.convenio-contact').forEach((block, i) => {
      block.dataset.contactIdx = String(i);
    });
  };

  root.querySelector('#convenio-modal-close')?.addEventListener('click', close);
  root.querySelector('#convenio-modal-cancel')?.addEventListener('click', close);
  root.querySelector('#convenio-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'convenio-modal-backdrop') close();
  });

  root.querySelector('#btn-add-contact')?.addEventListener('click', () => {
    contactsEl.insertAdjacentHTML('beforeend', contactRowHtml({}, contactsEl.children.length));
    reindexContacts();
  });

  contactsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.convenio-contact__remove');
    if (!btn) return;
    const block = btn.closest('.convenio-contact');
    if (contactsEl.querySelectorAll('.convenio-contact').length <= 1) {
      block.querySelectorAll('input, textarea').forEach((el) => {
        el.value = '';
      });
      return;
    }
    block.remove();
    reindexContacts();
  });

  root.querySelector('#convenio-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const nextContacts = [...contactsEl.querySelectorAll('.convenio-contact')]
      .map((block) => ({
        name: block.querySelector('[name="c_name"]')?.value?.trim() || '',
        email: block.querySelector('[name="c_email"]')?.value?.trim() || '',
        phone: block.querySelector('[name="c_phone"]')?.value?.trim() || '',
        note: block.querySelector('[name="c_note"]')?.value?.trim() || '',
      }))
      .filter((c) => c.name || c.email || c.phone || c.note);

    const name = fd.get('name')?.toString().trim();
    if (!name) {
      toast('Indica el nombre del convenio');
      return;
    }

    try {
      await upsertConvenio({
        id: convenio?.id,
        name,
        org_type: fd.get('org_type')?.toString() || '',
        notes: fd.get('notes')?.toString().trim() || '',
        contacts: nextContacts,
      });
      close();
      toast(isNew ? 'Convenio creado' : 'Convenio actualizado');
      onSaved?.();
    } catch (err) {
      toast(err.message || 'No se pudo guardar el convenio');
    }
  });
}

function parseGoalValue(raw) {
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function renderGoals(container, { onNavigate }) {
  const [goals, progress, convenios] = await Promise.all([
    getPracticeGoals(),
    getGoalsProgress(),
    listConvenios(),
  ]);

  container.innerHTML = `
    ${renderAppSidebar('goals')}
    <div class="app-main" id="goals">
      <div class="app-content goals-page">
        <header class="goals-page__head">
          <div>
            <h1 class="goals-page__title">Objetivos</h1>
            <p class="goals-page__sub">Metas de tu práctica y convenios institucionales.</p>
          </div>
        </header>

        <section class="goals-section">
          <h2 class="goals-section__title">Metas</h2>
          <div class="goals-grid" id="goals-grid">
            ${goalCard({
              key: 'convenios',
              title: 'Convenios',
              sub: 'Acuerdos activos con empresas, colegios u otras instituciones.',
              actual: progress.convenios,
              target: goals,
              fields: [{ label: 'Meta total', name: 'goal_convenios', field: 'convenios' }],
            })}
            ${goalCard({
              key: 'patients',
              title: 'Pacientes nuevos',
              sub: 'Altas de pacientes en la app.',
              actual: progress.new_patients_monthly,
              target: goals,
              fields: [
                { label: 'Por semana', name: 'goal_np_week', field: 'new_patients_weekly' },
                { label: 'Por mes', name: 'goal_np_month', field: 'new_patients_monthly' },
              ],
            })}
            ${goalCard({
              key: 'sessions',
              title: 'Sesiones',
              sub: 'Sesiones marcadas como completadas.',
              actual: progress.sessions_monthly,
              target: goals,
              fields: [
                { label: 'Por semana', name: 'goal_sess_week', field: 'sessions_weekly' },
                { label: 'Por mes', name: 'goal_sess_month', field: 'sessions_monthly' },
              ],
            })}
          </div>
          <p class="goals-hint">Los objetivos se guardan automáticamente. El progreso semanal considera los últimos 7 días.</p>
        </section>

        <section class="goals-section">
          <div class="goals-section__head">
            <h2 class="goals-section__title">Convenios</h2>
            <button type="button" class="btn btn-primary" id="btn-new-convenio">+ Nuevo convenio</button>
          </div>
          <div class="convenios-list" id="convenios-list">
            ${
              convenios.length
                ? convenios.map(convenioCardHtml).join('')
                : '<p class="text-muted goals-empty">Aún no hay convenios. Crea uno para asociarlo a tratamientos.</p>'
            }
          </div>
        </section>
      </div>
    </div>`;

  bindAppSidebar(container, { onNavigate });

  const refreshProgress = async () => {
    const next = await getGoalsProgress();
    const cards = container.querySelectorAll('[data-goal-card]');
    const map = {
      convenios: ['convenios'],
      patients: ['new_patients_weekly', 'new_patients_monthly'],
      sessions: ['sessions_weekly', 'sessions_monthly'],
    };
    cards.forEach((card) => {
      const key = card.dataset.goalCard;
      if (key === 'convenios') {
        card.querySelector('.goals-card__progress')?.replaceChildren();
        card.querySelector('.goals-card__progress')?.insertAdjacentHTML(
          'beforeend',
          goalProgressHtml(next.convenios, parseGoalValue(card.querySelector('[data-goal-field="convenios"]')?.value)),
        );
      }
      if (key === 'patients') {
        const week = parseGoalValue(card.querySelector('[data-goal-field="new_patients_weekly"]')?.value);
        const month = parseGoalValue(card.querySelector('[data-goal-field="new_patients_monthly"]')?.value);
        card.querySelector('.goals-card__progress')?.replaceChildren();
        card.querySelector('.goals-card__progress')?.insertAdjacentHTML(
          'beforeend',
          `<div class="goals-dual-progress">
            <div><span class="goals-dual-progress__label">Semana</span> ${goalProgressHtml(next.new_patients_weekly, week)}</div>
            <div><span class="goals-dual-progress__label">Mes</span> ${goalProgressHtml(next.new_patients_monthly, month)}</div>
          </div>`,
        );
      }
      if (key === 'sessions') {
        const week = parseGoalValue(card.querySelector('[data-goal-field="sessions_weekly"]')?.value);
        const month = parseGoalValue(card.querySelector('[data-goal-field="sessions_monthly"]')?.value);
        card.querySelector('.goals-card__progress')?.replaceChildren();
        card.querySelector('.goals-card__progress')?.insertAdjacentHTML(
          'beforeend',
          `<div class="goals-dual-progress">
            <div><span class="goals-dual-progress__label">Semana</span> ${goalProgressHtml(next.sessions_weekly, week)}</div>
            <div><span class="goals-dual-progress__label">Mes</span> ${goalProgressHtml(next.sessions_monthly, month)}</div>
          </div>`,
        );
      }
    });
  };

  // Initial dual-progress for patients/sessions cards
  container.querySelector('[data-goal-card="patients"] .goals-card__progress')?.replaceChildren();
  container.querySelector('[data-goal-card="patients"] .goals-card__progress')?.insertAdjacentHTML(
    'beforeend',
    `<div class="goals-dual-progress">
      <div><span class="goals-dual-progress__label">Semana</span> ${goalProgressHtml(progress.new_patients_weekly, goals.new_patients_weekly)}</div>
      <div><span class="goals-dual-progress__label">Mes</span> ${goalProgressHtml(progress.new_patients_monthly, goals.new_patients_monthly)}</div>
    </div>`,
  );
  container.querySelector('[data-goal-card="sessions"] .goals-card__progress')?.replaceChildren();
  container.querySelector('[data-goal-card="sessions"] .goals-card__progress')?.insertAdjacentHTML(
    'beforeend',
    `<div class="goals-dual-progress">
      <div><span class="goals-dual-progress__label">Semana</span> ${goalProgressHtml(progress.sessions_weekly, goals.sessions_weekly)}</div>
      <div><span class="goals-dual-progress__label">Mes</span> ${goalProgressHtml(progress.sessions_monthly, goals.sessions_monthly)}</div>
    </div>`,
  );

  let saveTimer;
  const scheduleGoalsSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const inputs = container.querySelectorAll('[data-goal-field]');
      const next = { ...goals };
      inputs.forEach((input) => {
        next[input.dataset.goalField] = parseGoalValue(input.value);
      });
      try {
        await savePracticeGoals(next);
        Object.assign(goals, next);
      } catch (err) {
        toast(err.message || 'No se pudieron guardar los objetivos');
      }
    }, 400);
  };

  container.querySelectorAll('[data-goal-field]').forEach((input) => {
    input.addEventListener('input', () => {
      scheduleGoalsSave();
      void refreshProgress();
    });
  });

  const rerenderConvenios = async () => {
    const list = await listConvenios();
    const el = container.querySelector('#convenios-list');
    el.innerHTML = list.length
      ? list.map(convenioCardHtml).join('')
      : '<p class="text-muted goals-empty">Aún no hay convenios. Crea uno para asociarlo a tratamientos.</p>';
    bindConvenioCards();
    await refreshProgress();
  };

  const bindConvenioCards = () => {
    container.querySelectorAll('[data-convenio-id]').forEach((card) => {
      card.querySelector('[data-edit-convenio]')?.addEventListener('click', async () => {
        const id = Number(card.dataset.convenioId);
        const list = await listConvenios();
        const c = list.find((x) => x.id === id);
        if (c) openConvenioModal(c, { onSaved: rerenderConvenios });
      });
      card.querySelector('[data-delete-convenio]')?.addEventListener('click', async () => {
        const id = Number(card.dataset.convenioId);
        const name = card.querySelector('.convenio-card__name')?.textContent || 'este convenio';
        const ok = await openConfirmModal({
          title: 'Eliminar convenio',
          message: `¿Eliminar «${name}»? Los tratamientos asociados quedarán sin convenio.`,
          confirmLabel: 'Eliminar',
        });
        if (!ok) return;
        try {
          await deleteConvenio(id);
          toast('Convenio eliminado');
          await rerenderConvenios();
        } catch (err) {
          toast(err.message || 'No se pudo eliminar');
        }
      });
    });
  };

  container.querySelector('#btn-new-convenio')?.addEventListener('click', () => {
    openConvenioModal(null, { onSaved: rerenderConvenios });
  });

  bindConvenioCards();
}
