import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenMs, setToggle, clampTooltipBox } from '../../src/js/transitions.js';

test('tokenMs cae al fallback si la variable no está', () => {
  assert.equal(tokenMs('--no-existe-esta-var', 150), 150);
});

test('setToggle escribe data-on y is-init', () => {
  const el = {
    classList: {
      added: [],
      add(name) {
        this.added.push(name);
      },
    },
    dataset: {},
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
  };
  setToggle(el, true);
  assert.equal(el.dataset.on, 'true');
  assert.equal(el.attrs['aria-checked'], 'true');
  assert.ok(el.classList.added.includes('is-init'));
});

test('clampTooltipBox no deja el tooltip fuera por la izquierda', () => {
  const box = clampTooltipBox(-40, 100, 160, 32, 1280, 800);
  assert.equal(box.left, 8);
  assert.equal(box.top, 100);
});

test('clampTooltipBox mantiene el tooltip bajo un botón del header', () => {
  const box = clampTooltipBox(4, 48, 180, 32, 400, 800);
  assert.ok(box.left >= 8);
  assert.ok(box.left + 180 <= 400 - 8);
  assert.equal(box.top, 48);
});
