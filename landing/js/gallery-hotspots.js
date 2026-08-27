/** Círculos sobre la captura: clic abre una descripción; uno a la vez. */
(function initGalleryHotspots() {
  document.querySelectorAll('[data-shot-map]').forEach((map) => {
    const pins = [...map.querySelectorAll('[data-shot-pin]')];
    if (!pins.length) return;

    function setOpen(next) {
      pins.forEach((pin) => {
        const on = pin === next;
        pin.setAttribute('aria-expanded', String(on));
        pin.closest('.shot-pin')?.classList.toggle('is-open', on);
        const card = document.getElementById(pin.getAttribute('aria-controls'));
        if (card) card.hidden = !on;
      });
    }

    pins.forEach((pin) => {
      pin.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = pin.getAttribute('aria-expanded') === 'true';
        setOpen(open ? null : pin);
      });
    });

    map.addEventListener('click', (event) => {
      if (!event.target.closest('[data-shot-pin], .shot-pin__card')) setOpen(null);
    });

    document.addEventListener('click', (event) => {
      if (!map.contains(event.target)) setOpen(null);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(null);
    });
  });
})();
