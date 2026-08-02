import assert from 'node:assert/strict';
import test from 'node:test';

test('likertAnswers distributes total across items', async () => {
  const { likertAnswers } = await import('../../src/js/demo-case-seed.js');
  assert.deepEqual(likertAnswers(13, 7, 3), [2, 2, 2, 2, 2, 2, 1]);
  assert.deepEqual(likertAnswers(5, 7, 3), [1, 1, 1, 1, 1, 0, 0]);
  assert.equal(likertAnswers(21, 7, 3).reduce((a, b) => a + b, 0), 21);
});

test('DEMO_PATIENT_SOURCE is a stable marker', async () => {
  const { DEMO_PATIENT_SOURCE } = await import('../../src/js/demo-case-seed.js');
  assert.equal(DEMO_PATIENT_SOURCE, '__telar_demo__');
});
