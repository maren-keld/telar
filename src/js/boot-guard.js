// Manejador de arranque (script clásico, permitido por CSP 'self').
// Muestra errores de carga/JS en pantalla y vigila que la app deje de "Cargando…".
(function () {
  function show(title, msg) {
    var app = document.getElementById('app');
    if (!app) return;
    app.className = 'app-shell';
    app.innerHTML =
      '<div class="boot-splash boot-splash--error">' +
      '<p class="boot-splash__title">Telar</p>' +
      '<p class="boot-splash__sub">' +
      String(title || 'Error al cargar') +
      '</p>' +
      '<p class="boot-splash__hint">' +
      String(msg || '').replace(/</g, '&lt;') +
      '</p>' +
      '<p class="boot-splash__hint">Cierra con Cmd+Q y vuelve a abrir Telar. Si persiste, comparte este mensaje.</p>' +
      '</div>';
  }

  window.__telarBooted = false;

  window.addEventListener('error', function (ev) {
    var detail = ev && ev.message ? ev.message : 'Error desconocido';
    if (ev && ev.filename) detail += ' (' + ev.filename + ':' + (ev.lineno || '?') + ')';
    show('Error de JavaScript al iniciar', detail);
  });

  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    show('Error al iniciar', (r && r.message) || String(r || 'Promesa rechazada'));
  });

  // Watchdog: si tras 8 s sigue el splash inicial, algo se colgó.
  window.setTimeout(function () {
    if (window.__telarBooted) return;
    var splash = document.getElementById('boot-splash');
    if (splash) {
      show(
        'La app tardó demasiado en cargar',
        'Etapa: ' + (window.__telarStage || 'desconocida') + '. No se completó el arranque.',
      );
    }
  }, 8000);
})();
