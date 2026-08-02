/**
 * Analítica mínima del landing — sin cookies, sin IP, sin identificadores.
 *
 * Qué envía: un nombre de evento ("view:precio", "cta:download_mac"). Nada más.
 * El servidor solo guarda un contador por (día, evento), así que no existe forma
 * de reconstruir una sesión ni un visitante desde los datos almacenados.
 *
 * Los pasos del funnel (step:*) se deduplican en sessionStorage para contar
 * "sesiones que llegaron hasta aquí" una sola vez. sessionStorage muere al
 * cerrar la pestaña y no viaja entre sitios.
 *
 * Respeta Do Not Track y Global Privacy Control: si están activos, no envía nada.
 */
(function () {
  'use strict';

  const API = window.TELAR_API || 'https://telar-api-aim8.onrender.com';
  const STORAGE_KEY = 'telar:steps';

  // Orden del funnel: alcanzar un paso implica haber alcanzado los anteriores,
  // así los conteos siempre decrecen y el embudo es legible.
  const FUNNEL = ['step:visit', 'step:explore', 'step:pricing', 'step:intent'];

  function optedOut() {
    return (
      navigator.doNotTrack === '1' ||
      window.doNotTrack === '1' ||
      navigator.globalPrivacyControl === true
    );
  }

  // text/plain es un Content-Type "safelisted": evita el preflight CORS que
  // sendBeacon no puede negociar y que haría fallar el envío en silencio.
  // El servidor parsea el cuerpo como JSON igual (get_json con force=True).
  const CONTENT_TYPE = 'text/plain;charset=UTF-8';

  function send(name) {
    const body = JSON.stringify({ name });
    const url = `${API}/api/events`;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: CONTENT_TYPE }));
        return;
      }
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE },
        body,
        keepalive: true,
        mode: 'no-cors',
      }).catch(() => {});
    } catch (e) {
      /* la analítica nunca debe romper la página */
    }
  }

  function seenSteps() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function markSeen(steps) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
    } catch (e) {
      /* modo privado sin storage: se contará de nuevo, no es grave */
    }
  }

  /** Envía el paso indicado y todos los anteriores que falten, una vez por sesión. */
  function reachStep(step) {
    const target = FUNNEL.indexOf(step);
    if (target < 0) return;
    const seen = seenSteps();
    const added = [];
    for (let i = 0; i <= target; i += 1) {
      if (seen.indexOf(FUNNEL[i]) === -1) {
        send(FUNNEL[i]);
        added.push(FUNNEL[i]);
      }
    }
    if (added.length) markSeen(seen.concat(added));
  }

  /** Nombre de página desde la ruta: /precio → precio, / → home. */
  function pageName() {
    const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
    if (!path || path === '/index') return 'home';
    const slug = path.split('/').filter(Boolean).join('_');
    return slug.replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 32) || 'home';
  }

  /** Páginas que cuentan como exploración real del producto. */
  const EXPLORE_PAGES = ['neurofeedback', 'modules', 'equipo', 'blog', 'blog_index'];

  function trackPageview() {
    const page = pageName();
    send(`view:${page}`);
    reachStep('step:visit');
    if (page === 'precio') {
      reachStep('step:pricing');
    } else if (EXPLORE_PAGES.indexOf(page) !== -1 || page.indexOf('blog') === 0) {
      reachStep('step:explore');
    }
  }

  /** Clasifica un enlace como CTA de conversión, o null si no lo es. */
  function ctaFor(href) {
    if (!href) return null;
    if (href.indexOf('wa.me') !== -1) return 'cta:whatsapp';
    if (href.indexOf('tel:') === 0) return 'cta:telefono';
    if (href.indexOf('releases/latest/download') !== -1) {
      if (/macos|\.zip/i.test(href)) return 'cta:download_mac';
      if (/windows|\.exe/i.test(href)) return 'cta:download_windows';
      return 'cta:download_other';
    }
    if (href.indexOf('/releases') !== -1) return 'cta:releases';
    return null;
  }

  function trackClicks() {
    document.addEventListener(
      'click',
      (event) => {
        const link = event.target.closest && event.target.closest('a[href]');
        if (!link) return;
        const cta = ctaFor(link.getAttribute('href') || '');
        if (!cta) return;
        send(cta);
        reachStep('step:intent');
      },
      { capture: true, passive: true }
    );
  }

  if (optedOut()) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      trackPageview();
      trackClicks();
    });
  } else {
    trackPageview();
    trackClicks();
  }
})();
