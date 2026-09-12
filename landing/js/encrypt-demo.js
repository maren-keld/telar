/** Mini demo: el toggle encripta los datos y los vuelve garabatos. */
(function encryptDemo() {
  const GLYPHS = "@Q1M3#9C&F9B0D1J1A%";
  const SPEED = 20;
  const AUTO_MS = 3000;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const randGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

  function paint(el, encrypted, until) {
    const plain = el.dataset.plain || "";
    el.textContent = Array.from(plain, (ch, idx) => {
      if (ch === " ") return " ";
      if (encrypted) return idx <= until ? randGlyph() : ch;
      return idx <= until ? ch : randGlyph();
    }).join("");
  }

  function fillPlain(root) {
    root.querySelectorAll("[data-plain]").forEach((el) => {
      el.textContent = el.dataset.plain || "";
    });
  }

  function scramble(el, encrypted) {
    const plain = el.dataset.plain || "";
    if (el._encTimer) window.clearInterval(el._encTimer);
    if (reduced) {
      paint(el, encrypted, plain.length);
      if (!encrypted) el.textContent = plain;
      return;
    }
    let i = 0;
    if (!encrypted) paint(el, true, plain.length);
    el._encTimer = window.setInterval(() => {
      paint(el, encrypted, i);
      i += 1;
      if (i >= plain.length) {
        window.clearInterval(el._encTimer);
        el._encTimer = 0;
        if (!encrypted) el.textContent = plain;
      }
    }, SPEED);
  }

  function setEncrypted(root, toggle, on) {
    root.classList.toggle("is-encrypted", on);
    toggle.setAttribute("aria-checked", on ? "true" : "false");
    root.querySelectorAll("[data-plain]").forEach((el) => scramble(el, on));
  }

  document.querySelectorAll("[data-encrypt-demo]").forEach((root) => {
    fillPlain(root);
    const toggle = root.querySelector(".encrypt-demo__toggle");
    if (!toggle) return;
    let on = false;
    let autoTimer = 0;
    let visible = false;

    const apply = (next) => {
      on = next;
      setEncrypted(root, toggle, on);
    };

    const stopAuto = () => {
      if (autoTimer) {
        window.clearInterval(autoTimer);
        autoTimer = 0;
      }
    };

    const startAuto = () => {
      stopAuto();
      if (reduced) return;
      autoTimer = window.setInterval(() => apply(!on), AUTO_MS);
    };

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      apply(!on);
    });

    const card = root.closest(".value-card") || root;

    const onVisible = () => {
      if (visible) return;
      visible = true;
      apply(true);
      startAuto();
    };

    const onHidden = () => {
      visible = false;
      stopAuto();
    };

    if (!("IntersectionObserver" in window)) {
      onVisible();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) onVisible();
          else onHidden();
        });
      },
      { threshold: 0.45 }
    );
    observer.observe(card);
  });
})();
