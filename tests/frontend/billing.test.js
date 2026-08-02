import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeBillingRows } from '../../src/js/billing-utils.js';

test('summarizeBillingRows aggregates totals and counts', () => {
  const rows = [
    { fee_amount: 50000, payment_status: 'pagado' },
    { fee_amount: 45000, payment_status: 'pagado' },
    { fee_amount: 50000, payment_status: 'por_pagar' },
    { fee_amount: 30000, payment_status: 'por_pagar' },
    { fee_amount: 0, payment_status: 'exento' },
  ];
  const summary = summarizeBillingRows(rows);
  assert.equal(summary.totalCobrado, 95000);
  assert.equal(summary.totalPorPagar, 80000);
  assert.equal(summary.countPagadas, 2);
  assert.equal(summary.countPorPagar, 2);
  assert.equal(summary.totalSesiones, 5);
});

test('summarizeBillingRows handles empty rows', () => {
  const summary = summarizeBillingRows([]);
  assert.equal(summary.totalCobrado, 0);
  assert.equal(summary.totalPorPagar, 0);
  assert.equal(summary.countPagadas, 0);
  assert.equal(summary.countPorPagar, 0);
  assert.equal(summary.totalSesiones, 0);
});

test('summarizeBillingRows treats missing fee_amount as zero', () => {
  const summary = summarizeBillingRows([{ payment_status: 'pagado' }]);
  assert.equal(summary.totalCobrado, 0);
  assert.equal(summary.countPagadas, 1);
});
