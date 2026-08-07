import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOllamaPullStatus } from '../../src/js/ollama-client.js';

test('formatOllamaPullStatus muestra porcentaje cuando hay total', () => {
  assert.equal(
    formatOllamaPullStatus({ status: 'downloading', completed: 500, total: 1000 }),
    'Descargando… 50%',
  );
});

test('formatOllamaPullStatus reconoce éxito', () => {
  assert.equal(formatOllamaPullStatus({ status: 'success' }), 'Descarga completa');
});
