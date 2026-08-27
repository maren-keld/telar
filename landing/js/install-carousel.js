/** Carruseles de instalación macOS/Windows — auto 7s, pausa al hover, respeta reduced motion. */
(function initInstallCarousels() {
  const AUTO_MS = 7000;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-install-carousel]').forEach((root) => {
    const slides = [...root.querySelectorAll('.install-carousel__slide')];
    const dots = [...root.querySelectorAll('.install-carousel__dot')];
    const prevBtns = [...root.querySelectorAll('.install-carousel__prev')];
    const nextBtns = [...root.querySelectorAll('.install-carousel__next')];
    if (!slides.length) return;

    let index = slides.findIndex((s) => s.classList.contains('is-active'));
    if (index < 0) index = 0;
    let timer = null;
    let paused = false;
    // Los carruseles viven dentro de un <details> plegado: no vale rotar imágenes
    // que nadie está mirando.
    const disclosure = root.closest('details');

    function closeHotspots() {
      root.querySelectorAll('[data-shot-pin]').forEach((pin) => {
        pin.setAttribute('aria-expanded', 'false');
        pin.closest('.shot-pin')?.classList.remove('is-open');
        const card = document.getElementById(pin.getAttribute('aria-controls'));
        if (card) card.hidden = true;
      });
    }

    function show(nextIndex) {
      index = (nextIndex + slides.length) % slides.length;
      closeHotspots();
      slides.forEach((slide, i) => {
        const active = i === index;
        slide.classList.toggle('is-active', active);
        slide.hidden = !active;
      });
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-selected', String(i === index));
      });
    }

    function stopAuto() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function startAuto() {
      stopAuto();
      if (reducedMotion || paused || slides.length < 2) return;
      if (root.hasAttribute('data-carousel-static')) return;
      if (disclosure && !disclosure.open) return;
      timer = setInterval(() => {
        if (root.querySelector('[data-shot-pin][aria-expanded="true"]')) return;
        show(index + 1);
      }, AUTO_MS);
    }

    disclosure?.addEventListener('toggle', () => {
      if (disclosure.open) startAuto();
      else stopAuto();
    });

    prevBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        show(index - 1);
        startAuto();
      });
    });
    nextBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        show(index + 1);
        startAuto();
      });
    });
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        show(i);
        startAuto();
      });
    });

    root.addEventListener('mouseenter', () => {
      paused = true;
      stopAuto();
    });
    root.addEventListener('mouseleave', () => {
      paused = false;
      startAuto();
    });
    root.addEventListener('focusin', stopAuto);
    root.addEventListener('focusout', () => {
      if (!root.matches(':hover')) startAuto();
    });

    show(index);
    startAuto();
  });
})();
