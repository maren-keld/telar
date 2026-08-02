/** Agregación pura de filas de cobros (testeable sin DB). */

export function summarizeBillingRows(rows) {
  let totalCobrado = 0;
  let totalPorPagar = 0;
  let countPagadas = 0;
  let countPorPagar = 0;

  for (const row of rows) {
    const amount = Number(row.fee_amount) || 0;
    if (row.payment_status === 'pagado') {
      totalCobrado += amount;
      countPagadas += 1;
    } else if (row.payment_status === 'por_pagar') {
      totalPorPagar += amount;
      countPorPagar += 1;
    }
  }

  return {
    totalCobrado,
    totalPorPagar,
    countPagadas,
    countPorPagar,
    totalSesiones: rows.length,
  };
}
