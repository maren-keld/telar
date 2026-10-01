/** Nombres genéricos para registrar medicación; los usos son pistas, no indicaciones individuales. */
export const PSYCHIATRIC_MEDICATIONS = [
  { name: 'Metilfenidato', use: 'TDAH' },
  { name: 'Lisdexanfetamina', use: 'TDAH' },
  { name: 'Atomoxetina', use: 'TDAH' },
  { name: 'Guanfacina', use: 'TDAH' },
  { name: 'Sertralina', use: 'Depresión, ansiedad, TEPT' },
  { name: 'Fluoxetina', use: 'Depresión, ansiedad' },
  { name: 'Escitalopram', use: 'Depresión, ansiedad' },
  { name: 'Paroxetina', use: 'Depresión, ansiedad, TEPT' },
  { name: 'Venlafaxina', use: 'Depresión, ansiedad, TEPT' },
  { name: 'Duloxetina', use: 'Depresión, ansiedad' },
  { name: 'Bupropión', use: 'Depresión' },
  { name: 'Mirtazapina', use: 'Depresión' },
  { name: 'Trazodona', use: 'Depresión' },
  { name: 'Buspirona', use: 'Ansiedad' },
  { name: 'Clonazepam', use: 'Ansiedad, uso según prescripción' },
  { name: 'Lorazepam', use: 'Ansiedad, uso según prescripción' },
  { name: 'Litio', use: 'Trastorno bipolar' },
  { name: 'Lamotrigina', use: 'Trastorno bipolar' },
  { name: 'Ácido valproico', use: 'Trastorno bipolar' },
  { name: 'Quetiapina', use: 'Trastorno bipolar; otros usos según prescripción' },
  { name: 'Aripiprazol', use: 'Trastorno bipolar; irritabilidad asociada al TEA' },
  { name: 'Risperidona', use: 'Irritabilidad asociada al TEA; otros usos según prescripción' },
];

export function medicationCountryLabel(country) {
  return ({ CL: 'Chile', AR: 'Argentina', UY: 'Uruguay', MX: 'México', PE: 'Perú', CO: 'Colombia', ES: 'España' })[country] || 'tu país';
}

export function medicationRegistry(country) {
  return ({
    CL: { label: 'ISP', url: 'https://registrosanitario.ispch.gob.cl/' },
    AR: { label: 'ANMAT', url: 'https://portal.anmat.gob.ar/' },
    MX: { label: 'COFEPRIS', url: 'https://registros.cofepris.gob.mx/BRSDM/default.aspx' },
    PE: { label: 'DIGEMID', url: 'https://www.digemid.minsa.gob.pe/rsProductosFarmaceuticos/' },
    CO: { label: 'INVIMA', url: 'https://www.invima.gov.co/consulta-registros-sanitarios' },
  })[country] || null;
}

export function findMedications(term, selected = []) {
  const query = String(term || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const taken = new Set(selected.map((item) => String(item.name || item).toLowerCase()));
  return PSYCHIATRIC_MEDICATIONS.filter((item) =>
    !taken.has(item.name.toLowerCase()) &&
    (!query || `${item.name} ${item.use}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query))
  );
}
