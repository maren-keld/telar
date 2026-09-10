import { escapeHtml } from '../utils.js';
import { bindPinBoxes, focusFirstEmpty, isValidPin, pinBoxesHtml, readPin } from './pin-input.js';
import { shakeEl } from '../transitions.js';

/** Un solo envío a la vez: Enter repetido no relanza onSubmit. */
export function createExclusiveSubmit() {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    async run(fn) {
      if (busy) return { started: false };
      busy = true;
      try {
        return { started: true, value: await fn() };
      } catch (err) {
        busy = false;
        throw err;
      }
    },
  };
}

/**
 * Modal para pedir PIN de 6 dígitos.
 * @returns {void}
 */
export function openPinModal({ title, submitLabel = 'Confirmar', onSubmit, onCancel }) {
  const root = document.getElementById('modal-root');
  const pinId = 'modal-pin';
  const exclusive = createExclusiveSubmit();

  root.innerHTML = `
    <div class="modal-backdrop" data-close>
      <div class="modal-card" role="dialog" aria-labelledby="pin-modal-title">
        <h2 id="pin-modal-title" class="modal-card__title">${escapeHtml(title)}</h2>
        ${pinBoxesHtml(pinId, '')}
        <div class="modal-card__actions">
          <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button type="button" class="btn btn-primary" id="pin-modal-submit">${escapeHtml(submitLabel)}</button>
        </div>
      </div>
    </div>`;

  const card = root.querySelector('.modal-card');
  bindPinBoxes(card, pinId);

  const close = () => {
    root.innerHTML = '';
  };

  root.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target === el) {
        close();
        onCancel?.();
      }
    });
  });

  const submit = root.querySelector('#pin-modal-submit');
  const doSubmit = async () => {
    const pin = readPin(card, pinId);
    if (!isValidPin(pin)) {
      shakeEl(card.querySelector('.pinbox-row'));
      focusFirstEmpty(card, pinId);
      return;
    }
    try {
      const { started } = await exclusive.run(async () => {
        if (submit) submit.disabled = true;
        await onSubmit(pin);
        close();
      });
      if (!started) return;
    } catch {
      if (submit) submit.disabled = false;
    }
  };

  submit?.addEventListener('click', doSubmit);
  card.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    void doSubmit();
  });

  focusFirstEmpty(card, pinId);
}
