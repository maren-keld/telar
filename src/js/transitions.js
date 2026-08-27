/**
 * Motion Telar — recetas de transitions.dev enganchadas al DOM existente.
 * No hay runtime npm: CSS en transitions.css + esta orquestación.
 */

function reducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

export function tokenMs(name, fallback) {
  if (typeof getComputedStyle === 'undefined') return fallback;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

function findBackdrop(scope) {
  if (!scope?.querySelector) return null;
  if (scope.matches?.('.modal-backdrop, .dropdown-backdrop')) return scope;
  return scope.querySelector('.modal-backdrop, .dropdown-backdrop');
}

function findMenu(scope) {
  if (!scope?.querySelector) return null;
  if (scope.matches?.('.dropdown-menu, .occupation-picker__menu')) return scope;
  return scope.querySelector('.dropdown-menu, .occupation-picker__menu');
}

function findModal(scope) {
  if (!scope?.querySelector) return null;
  const sels =
    '.modal-card, .subscribe-pro-modal, .workspace-tools-menu, .create-module-modal, .goals-modal, .ref-docs-modal, .agenda-modal, .agenda-detail-modal, .backup-recovery-modal';
  if (scope.matches?.(sels)) return scope;
  return scope.querySelector(sels);
}

export function playOverlayOpen(scope) {
  if (!scope) return;
  const backdrop = findBackdrop(scope);
  const menu = findMenu(scope);
  const modal = findModal(scope);
  if (menu) {
    menu.classList.add('t-dropdown');
    if (!menu.dataset.origin) menu.dataset.origin = 'top-left';
  }
  if (modal) modal.classList.add('t-modal');
  if (backdrop) backdrop.classList.add('t-overlay');
  const open = () => {
    menu?.classList.remove('is-closing');
    modal?.classList.remove('is-closing');
    backdrop?.classList.remove('is-closing');
    menu?.classList.add('is-open');
    modal?.classList.add('is-open');
    backdrop?.classList.add('is-open');
  };
  if (reducedMotion()) {
    open();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(open));
}

export function playOverlayClose(scope) {
  if (!scope) return Promise.resolve();
  const backdrop = findBackdrop(scope);
  const menu = findMenu(scope) || scope.querySelector('.t-dropdown');
  const modal = findModal(scope) || scope.querySelector('.t-modal');
  if (reducedMotion()) return Promise.resolve();
  const closeMs = Math.max(
    menu ? tokenMs('--dropdown-close-dur', 150) : 0,
    modal ? tokenMs('--modal-close-dur', 150) : tokenMs('--modal-close-dur', 150),
  );
  menu?.classList.remove('is-open');
  menu?.classList.add('is-closing');
  modal?.classList.remove('is-open');
  modal?.classList.add('is-closing');
  backdrop?.classList.remove('is-open');
  backdrop?.classList.add('is-closing');
  return new Promise((resolve) => setTimeout(resolve, closeMs));
}

export function animateAndRemove(el) {
  if (!el) return Promise.resolve();
  return playOverlayClose(el).then(() => el.remove());
}

export function installOverlayMotion(root) {
  if (!root || root.dataset.overlayMotion === '1') return;
  root.dataset.overlayMotion = '1';
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (!desc?.get || !desc?.set) return;
  let generation = 0;

  Object.defineProperty(root, 'innerHTML', {
    configurable: true,
    enumerable: true,
    get() {
      return desc.get.call(this);
    },
    set(html) {
      const value = html == null ? '' : String(html);
      if (value) {
        generation += 1;
        desc.set.call(this, value);
        playOverlayOpen(this);
        return;
      }
      if (!this.firstElementChild) {
        desc.set.call(this, '');
        return;
      }
      const gen = generation;
      playOverlayClose(this).then(() => {
        if (gen !== generation) return;
        desc.set.call(this, '');
      });
    },
  });
}

export function shakeEl(el, { wrap = null, hold = true } = {}) {
  if (!el) return;
  const host = wrap || el.closest('.t-input-wrap') || el;
  host.classList.add('is-error');
  el.classList.add('is-error');
  el.classList.remove('is-shaking');
  void el.offsetWidth;
  el.classList.add('is-shaking');
  const shakeMs = tokenMs('--shake-dur-a', 80) * 2 + tokenMs('--shake-dur-b', 60) * 2;
  setTimeout(() => el.classList.remove('is-shaking'), shakeMs + 20);
  if (!hold) return;
  if (host._revertTimer) clearTimeout(host._revertTimer);
  host._revertTimer = setTimeout(() => {
    host._revertTimer = null;
    host.classList.remove('is-error');
    el.classList.remove('is-error');
  }, shakeMs + tokenMs('--revert-hold', 3000));
}

export function setToggle(el, on) {
  if (!el) return;
  el.classList.add('is-init');
  el.dataset.on = on ? 'true' : 'false';
  el.setAttribute('aria-checked', on ? 'true' : 'false');
}

export function bindSlidingTabs(bar) {
  if (!bar) return () => {};
  let pill = bar.querySelector('.t-tabs-pill');
  if (!pill) {
    pill = document.createElement('span');
    pill.className = 't-tabs-pill';
    pill.setAttribute('aria-hidden', 'true');
    bar.prepend(pill);
  }
  const tabs = () => [...bar.querySelectorAll('[role="tab"], .space-tab2, .t-tab')];
  const moveTo = (tab, animate) => {
    if (!tab || !pill) return;
    const x = tab.offsetLeft;
    const w = tab.offsetWidth;
    if (!animate || reducedMotion()) {
      const prev = pill.style.transition;
      pill.style.transition = 'none';
      pill.style.transform = `translateX(${x}px)`;
      pill.style.width = `${w}px`;
      void pill.offsetWidth;
      pill.style.transition = prev;
    } else {
      pill.style.transform = `translateX(${x}px)`;
      pill.style.width = `${w}px`;
    }
  };
  const active = () =>
    tabs().find((t) => t.getAttribute('aria-selected') === 'true' || t.classList.contains('active')) ||
    tabs()[0];

  requestAnimationFrame(() => moveTo(active(), false));
  const onResize = () => moveTo(active(), false);
  window.addEventListener('resize', onResize);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => onResize()) : null;
  ro?.observe(bar);
  bar._moveTabsPill = (animate = true) => moveTo(active(), animate);
  return () => {
    window.removeEventListener('resize', onResize);
    ro?.disconnect();
  };
}

export function revealStreaming(container) {
  if (!container) return;
  const kids = [...container.children];
  kids.forEach((kid, i) => {
    kid.classList.add('t-stream-chunk');
    kid.style.animationDelay = `calc(${i} * var(--stream-gap))`;
  });
}

/** Caja del tooltip dentro del viewport (sin translate CSS que lo recorte). */
export function clampTooltipBox(left, top, width, height, vw, vh, pad = 8) {
  const maxLeft = Math.max(pad, vw - pad - width);
  const maxTop = Math.max(pad, vh - pad - height);
  return {
    left: Math.min(Math.max(left, pad), maxLeft),
    top: Math.min(Math.max(top, pad), maxTop),
  };
}

function initTooltips() {
  if (document.getElementById('telar-tooltip')) return;
  const tip = document.createElement('span');
  tip.id = 'telar-tooltip';
  tip.className = 't-tt t-tt--fixed';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);

  let hideTimer = 0;
  let active = null;

  const hide = () => {
    tip.classList.remove('is-open');
    active = null;
  };

  const show = (el, text) => {
    clearTimeout(hideTimer);
    active = el;
    tip.textContent = text;
    tip.classList.remove('is-open');
    tip.style.transform = 'none';
    tip.style.left = '0px';
    tip.style.top = '0px';
    const tw = Math.max(tip.offsetWidth, 1);
    const th = Math.max(tip.offsetHeight, 1);
    const r = el.getBoundingClientRect();
    const gap = 8;
    const sidebarLink = el.classList.contains('module-link') && el.closest('#leftsidebar');
    const headerBtn = el.closest('.workspace-sidebar__header');
    const footerBtn = el.closest('.workspace-sidebar__footer');

    let left;
    let top;
    if (sidebarLink) {
      left = r.right + gap;
      top = r.top + r.height / 2 - th / 2;
      tip.style.transformOrigin = '0 50%';
    } else if (footerBtn) {
      left = r.left;
      top = r.top - gap - th;
      tip.style.transformOrigin = '0 100%';
    } else if (headerBtn || r.top < 72) {
      left = r.left + r.width / 2 - tw / 2;
      top = r.bottom + gap;
      tip.style.transformOrigin = headerBtn && r.left < 80 ? '0 0' : '50% 0';
    } else {
      left = r.left + r.width / 2 - tw / 2;
      top = r.top - gap - th;
      tip.style.transformOrigin = '50% 100%';
    }

    const box = clampTooltipBox(left, top, tw, th, window.innerWidth, window.innerHeight);
    tip.style.left = `${box.left}px`;
    tip.style.top = `${box.top}px`;
    tip.style.bottom = 'auto';
    tip.style.transform = '';
    requestAnimationFrame(() => tip.classList.add('is-open'));
  };

  document.addEventListener(
    'pointerover',
    (e) => {
      const el = e.target.closest?.('[title], [data-tooltip]');
      if (!el || el === tip) return;
      if (el.classList.contains('ai-dock__chip') || el.closest('.ai-dock__chip')) return;
      if (el.closest('textarea, select, option, .kindle-note__comment')) return;
      const raw = el.getAttribute('data-tooltip') || el.getAttribute('title') || '';
      const text = raw.trim();
      if (!text) return;
      const labelEl = el.querySelector('.module-link__label') || el;
      const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const truncated = labelEl.scrollWidth > labelEl.clientWidth + 1;
      if (el.hasAttribute('title')) {
        el.setAttribute('data-tooltip', text);
        el.removeAttribute('title');
      }
      if (label && label === text && !truncated) return;
      show(el, text);
    },
    true,
  );

  document.addEventListener(
    'pointerout',
    (e) => {
      if (!active) return;
      const to = e.relatedTarget;
      if (to && (active.contains(to) || to === tip)) return;
      hideTimer = window.setTimeout(hide, 40);
    },
    true,
  );

  document.addEventListener(
    'pointerdown',
    () => {
      hide();
    },
    true,
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
}

export function initMotion() {
  installOverlayMotion(document.getElementById('modal-root'));
  initTooltips();
}
