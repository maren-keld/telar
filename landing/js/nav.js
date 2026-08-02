/**
 * Menú responsive del header. Antes estaba copiado inline en cada página.
 */
(() => {
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  if (!navToggle || !navLinks) return;

  function setMenu(open) {
    navLinks.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  }

  navToggle.addEventListener('click', () => {
    setMenu(navToggle.getAttribute('aria-expanded') !== 'true');
  });
  navLinks.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false);
  });

  /** Marca el link de la página actual para lectores de pantalla y estilo. */
  const here = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  navLinks.querySelectorAll('a').forEach((a) => {
    const target = new URL(a.getAttribute('href'), location.href).pathname
      .replace(/\/index\.html$/, '/')
      .replace(/\.html$/, '');
    if (target === here) a.setAttribute('aria-current', 'page');
  });
})();
