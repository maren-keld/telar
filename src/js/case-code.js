/**
 * Código opaco de caso — identificador no reversible para material que sale de Telar.
 *
 * Se usa en la presentación de caso para supervisión y en la exportación de
 * calendario (.ics). Nunca debe acompañarse del nombre, RUT ni datos de contacto
 * del paciente: el objetivo es que un tercero (supervisor, calendario en la nube)
 * pueda referirse al caso sin poder identificarlo.
 *
 * Es determinista: el mismo tratamiento produce siempre el mismo código, de modo
 * que el clínico puede resolverlo dentro de Telar y el supervisor puede referirse
 * a "el TL-0042" semana a semana.
 */
export function caseCode(treatmentId) {
  const n = Number(treatmentId);
  if (!Number.isFinite(n) || n <= 0) return 'TL-0000';
  return `TL-${String(n).padStart(4, '0')}`;
}
