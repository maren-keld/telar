import assert from 'node:assert/strict';
import test from 'node:test';

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};

const { addCustomTag, allTagDefs, listCustomTags } = await import('../../src/js/custom-tags.js');

test('addCustomTag persists a color label in the practitioner profile', () => {
  const created = addCustomTag({ label: 'Handoff', color: '#64748b' });
  assert.ok(created.id.startsWith('c_'));
  assert.equal(created.label, 'Handoff');
  assert.equal(listCustomTags().length, 1);
  assert.equal(allTagDefs()[created.id].label, 'Handoff');
  assert.equal(allTagDefs()[created.id].color, '#64748b');
});

test('addCustomTag reuses an existing label instead of duplicating', () => {
  const again = addCustomTag({ label: 'handoff', color: '#e05d4f' });
  assert.equal(again.existed, true);
  assert.equal(listCustomTags().length, 1);
});
