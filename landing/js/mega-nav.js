/** Mega menú de index2: hover en escritorio, click/tap para abrir. */
(() => {
  const items = [...document.querySelectorAll('.i2-mega')];
  if (!items.length) return;

  const closeAll = () =>
    items.forEach((el) => {
      el.classList.remove('is-open');
      el.querySelector(':scope > button')?.setAttribute('aria-expanded', 'false');
    });

  items.forEach((el) => {
    const btn = el.querySelector(':scope > button');
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      const open = !el.classList.contains('is-open');
      closeAll();
      el.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.i2-mega')) closeAll();
  });
})();
