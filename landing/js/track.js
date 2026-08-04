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
 * Además se envían cuatro rasgos de la sesión, ya reducidos a una categoría de
 * una lista cerrada antes de salir del navegador — nunca la URL de origen,
 * nunca el user-agent, nunca una marca de tiempo:
 *   src:instagram   de dónde llegó (dominio del referrer o utm_source)
 *   dev:movil       tipo de dispositivo
 *   os:android      sistema operativo
 *   dwell:30_60     tramo de segundos con la pestaña visible
 * Como son contadores independientes, no se pueden cruzar entre sí: "42 desde
 * Instagram" y "61% en móvil" no dicen qué dispositivo usó nadie en particular.
 * El user-agent se lee en el navegador para elegir una de siete etiquetas de SO
 * y se descarta ahí mismo: al servidor solo llega la etiqueta, que no distingue
 * versiones ni sirve para fingerprinting.
 *
 * Respeta Do Not Track y Global Privacy Control: si están activos, no envía nada.
 */
(function () {
  'use strict';

  const API = window.TELAR_API || 'https://telar-api-aim8.onrender.com';
  const STORAGE_KEY = 'telar:steps';
  const ONCE_KEY = 'telar:once';

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

  /** Envía un nombre una sola vez por sesión del navegador. */
  function sendOnce(name) {
    let seen;
    try {
      seen = JSON.parse(sessionStorage.getItem(ONCE_KEY) || '[]');
    } catch (e) {
      // Modo privado sin storage: se envía en cada página. Infla el conteo de
      // esas sesiones, no revela nada nuevo.
      send(name);
      return;
    }
    if (seen.indexOf(name) !== -1) return;
    send(name);
    try {
      sessionStorage.setItem(ONCE_KEY, JSON.stringify(seen.concat([name])));
    } catch (e) {
      /* ídem */
    }
  }

  // --- De dónde viene la sesión ---------------------------------------------
  // Del referrer se mira solo el dominio, y solo para elegir una etiqueta de
  // esta lista. La URL completa (que puede llevar términos de búsqueda o el hilo
  // exacto de Reddit) nunca sale del navegador.
  const SOURCES = [
    [/(^|\.)google\./, 'google'],
    [/(^|\.)bing\./, 'bing'],
    [/duckduckgo\./, 'duckduckgo'],
    [/(^|\.)ecosia\.|(^|\.)brave\./, 'otro_buscador'],
    [/facebook\.|fb\.me|fb\.com/, 'facebook'],
    [/instagram\./, 'instagram'],
    [/tiktok\./, 'tiktok'],
    [/reddit\./, 'reddit'],
    [/(^|\.)(twitter|x)\.com/, 'x'],
    [/linkedin\.|lnkd\.in/, 'linkedin'],
    [/youtube\.|youtu\.be/, 'youtube'],
    [/whatsapp\./, 'whatsapp'],
    [/t\.me|telegram/, 'telegram'],
    [/chatgpt\.|openai\.|perplexity\.|claude\.ai|copilot\./, 'ia'],
    [/mail\.|outlook\.|gmail/, 'email'],
  ];

  // utm_source solo puede tomar uno de estos valores; cualquier otro cae en
  // "otro", así que un enlace con utm inventado no crea etiquetas nuevas.
  const UTM_ALLOWED = SOURCES.map((pair) => pair[1]).concat([
    'newsletter', 'qr', 'flyer', 'colega', 'evento',
  ]);

  function sourceLabel() {
    let utm = '';
    try {
      utm = (new URLSearchParams(location.search).get('utm_source') || '')
        .trim().toLowerCase();
    } catch (e) {
      /* navegador sin URLSearchParams: seguimos con el referrer */
    }
    if (utm) return UTM_ALLOWED.indexOf(utm) !== -1 ? utm : 'otro';

    const ref = document.referrer || '';
    if (!ref) return 'directo';
    let host = '';
    try {
      host = new URL(ref).hostname.toLowerCase();
    } catch (e) {
      return 'otro';
    }
    // Navegación dentro del propio sitio: no es una fuente de tráfico.
    if (host === location.hostname) return null;
    for (let i = 0; i < SOURCES.length; i += 1) {
      if (SOURCES[i][0].test(host)) return SOURCES[i][1];
    }
    return 'otro';
  }

  // --- Sistema operativo y tipo de dispositivo ------------------------------
  // El user-agent se mira solo para elegir una de estas etiquetas y no se envía
  // ni se guarda: no hay versión, ni build, ni arquitectura.
  const OS_RULES = [
    [/windows|win32|win64/, 'windows'],
    [/android/, 'android'],
    [/iphone|ipad|ipod/, 'ios'],
    [/cros/, 'chromeos'],
    [/mac os x|macintel|macintosh/, 'macos'],
    [/linux|x11|ubuntu|fedora/, 'linux'],
  ];

  // userAgentData.platform (Chromium) es la fuente limpia: una palabra, sin
  // versiones. Los demás navegadores caen al user-agent clásico.
  const UA_DATA_OS = {
    windows: 'windows', macos: 'macos', android: 'android',
    linux: 'linux', 'chrome os': 'chromeos', chromeos: 'chromeos',
  };

  /** Puntero grueso: dedo en vez de mouse. iPadOS se declara Mac, esto lo delata. */
  function coarsePointer() {
    try {
      return window.matchMedia('(pointer: coarse)').matches;
    } catch (e) {
      return navigator.maxTouchPoints > 1;
    }
  }

  function osLabel() {
    const data = navigator.userAgentData;
    let os = '';
    if (data && data.platform) {
      os = UA_DATA_OS[data.platform.toLowerCase()] || '';
    }
    if (!os) {
      const ua = (navigator.userAgent || '').toLowerCase();
      for (let i = 0; i < OS_RULES.length; i += 1) {
        if (OS_RULES[i][0].test(ua)) { os = OS_RULES[i][1]; break; }
      }
    }
    // Un iPad con iPadOS 13+ se presenta como Mac de escritorio; el puntero
    // grueso es lo único que lo separa de un MacBook.
    if (os === 'macos' && coarsePointer() && navigator.maxTouchPoints > 1) return 'ios';
    return os || 'otro';
  }

  /** Tipo de dispositivo: ancho de pantalla corregido con el SO y el puntero. */
  function deviceLabel(os) {
    const width = Math.min(
      window.screen && window.screen.width ? window.screen.width : 1024,
      window.innerWidth || 1024
    );
    const data = navigator.userAgentData;
    const coarse = coarsePointer();
    // El navegador declara si es un teléfono: más fiable que cualquier ancho,
    // porque una tablet en horizontal mide lo mismo que un portátil chico.
    if (data && typeof data.mobile === 'boolean') {
      if (data.mobile) return 'movil';
      if (os === 'android' || os === 'ios') return 'tablet';
      if (!coarse) return 'escritorio';
    }
    if (os === 'ios') return width < 768 ? 'movil' : 'tablet';
    if (os === 'android') return width < 600 || !coarse ? 'movil' : 'tablet';
    if (!coarse) return 'escritorio';
    if (width < 640) return 'movil';
    return width < 1280 ? 'tablet' : 'escritorio';
  }

  // --- Tiempo con la pestaña visible ----------------------------------------
  // Se acumulan solo los segundos en que la página estuvo de verdad a la vista
  // y se envía el tramo, no el número exacto: "entre 30 s y 1 min".
  const DWELL_BUCKETS = [
    [10, '0_10'],
    [30, '10_30'],
    [60, '30_60'],
    [180, '1_3min'],
    [600, '3_10min'],
    [Infinity, '10min_mas'],
  ];

  function dwellBucket(seconds) {
    for (let i = 0; i < DWELL_BUCKETS.length; i += 1) {
      if (seconds < DWELL_BUCKETS[i][0]) return DWELL_BUCKETS[i][1];
    }
    return '10min_mas';
  }

  function trackDwell() {
    let visibleMs = 0;
    let since = document.visibilityState === 'visible' ? Date.now() : 0;
    let sent = false;

    function accumulate() {
      if (since) visibleMs += Date.now() - since;
      since = 0;
    }

    function flush() {
      if (sent) return;
      accumulate();
      if (visibleMs < 1000) return; // rebotes instantáneos y prerender: no cuentan
      sent = true;
      send(`dwell:${dwellBucket(visibleMs / 1000)}`);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!since) since = Date.now();
      } else {
        // En móvil el navegador puede matar la pestaña sin pagehide: este es el
        // último momento seguro para enviar.
        flush();
      }
    });
    // pagehide cubre el cierre y la navegación normal en escritorio.
    window.addEventListener('pagehide', flush);
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
    // Antes del paso 1: el servidor resuelve la comuna al ver "step:visit", así
    // que los rasgos de la sesión ya están contados cuando eso ocurre.
    const source = sourceLabel();
    if (source) sendOnce(`src:${source}`);
    const os = osLabel();
    sendOnce(`os:${os}`);
    sendOnce(`dev:${deviceLabel(os)}`);
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

  /** Corre cuando el navegador ya no tiene nada urgente que hacer.
   *
   * deviceLabel() consulta el ancho de la ventana, y hacerlo mientras el
   * navegador todavía está montando la página lo obliga a recalcular el layout
   * en medio del primer pintado (reflow forzado). En un hueco de inactividad el
   * layout ya está calculado y la medición sale gratis. El timeout garantiza que
   * el evento igual se envíe en una pestaña que nunca queda inactiva.
   */
  function whenIdle(fn) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn, { timeout: 1000 });
    } else {
      setTimeout(fn, 200);
    }
  }

  if (optedOut()) return;

  // El cronómetro parte antes del DOMContentLoaded: si no, una página lenta
  // regalaría segundos de lectura que el visitante sí estuvo mirando.
  trackDwell();

  let pageviewSent = false;

  function sendPageviewOnce() {
    if (pageviewSent) return;
    pageviewSent = true;
    trackPageview();
  }

  // Los clics se escuchan de inmediato (no miden nada del layout); la vista de
  // página espera al primer hueco libre, o al cierre si la visita fue tan corta
  // que ese hueco nunca llegó.
  function boot() {
    trackClicks();
    whenIdle(sendPageviewOnce);
    window.addEventListener('pagehide', sendPageviewOnce);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
