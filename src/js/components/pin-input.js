/** 6 casillas de PIN reutilizables (desbloqueo, Touch ID, etc.) */

export function pinBoxesHtml(id, label) {
  const boxes = Array.from({ length: 6 })
    .map(
      (_, i) =>
        `<input class="pinbox" type="password" inputmode="numeric" pattern="[0-9]*" data-pin="${id}" data-idx="${i}" maxlength="1" autocomplete="off" aria-label="Dígito ${i + 1} de 6" />`,
    )
    .join('');

  return `
    <div class="field">
      ${label ? `<div class="field__label">${label}</div>` : ''}
      <div class="pinbox-row" data-pin-row="${id}">${boxes}</div>
    </div>
  `;
}

export function readPin(root, id) {
  const inputs = Array.from(root.querySelectorAll(`input.pinbox[data-pin="${id}"]`));
  return inputs.map((el) => (el.value || '').trim()).join('');
}

export function setPin(root, id, pin) {
  const inputs = Array.from(root.querySelectorAll(`input.pinbox[data-pin="${id}"]`));
  const s = String(pin || '');
  inputs.forEach((el, i) => {
    el.value = s[i] && /\d/.test(s[i]) ? s[i] : '';
  });
}

export function focusFirstEmpty(root, id) {
  const inputs = Array.from(root.querySelectorAll(`input.pinbox[data-pin="${id}"]`));
  const target = inputs.find((el) => !el.value) || inputs[0];
  target?.focus();
}

export function bindPinBoxes(root, id) {
  const inputs = Array.from(root.querySelectorAll(`input.pinbox[data-pin="${id}"]`));
  const clampDigit = (v) => (/\d/.test(v) ? v : '');

  inputs.forEach((el, idx) => {
    const advance = () => {
      if (el.value && idx < inputs.length - 1) inputs[idx + 1].focus();
    };

    el.addEventListener('input', () => {
      const digit = clampDigit((el.value || '').replace(/\D/g, '').slice(-1));
      el.value = digit;
      if (digit) advance();
    });

    el.addEventListener('keyup', () => {
      if (el.value && idx < inputs.length - 1 && document.activeElement === el) {
        advance();
      }
    });

    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Backspace') {
        if (el.value) {
          el.value = '';
          return;
        }
        if (idx > 0) {
          inputs[idx - 1].focus();
          inputs[idx - 1].value = '';
        }
      }
      if (ev.key === 'ArrowLeft' && idx > 0) inputs[idx - 1].focus();
      if (ev.key === 'ArrowRight' && idx < inputs.length - 1) inputs[idx + 1].focus();
    });

    el.addEventListener('paste', (ev) => {
      const txt = (ev.clipboardData || window.clipboardData)?.getData('text') || '';
      const digits = txt.replace(/\D/g, '').slice(0, 6);
      if (digits.length) {
        ev.preventDefault();
        setPin(root, id, digits);
        const next = inputs[Math.min(digits.length, 5)];
        next?.focus();
      }
    });
  });
}

export function isValidPin(s) {
  return /^\d{6}$/.test(s);
}
