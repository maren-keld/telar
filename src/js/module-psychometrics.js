/** Metadatos psicométricos para el selector de módulos (Chile / uso clínico). */

export const MODULE_PSYCHOMETRICS = {
  dass21: {
    authors: 'Lovibond & Lovibond (1995)',
    ageRange: 'Desde 12 años',
    reliability: 'Alta consistencia interna (α ≈ 0,91–0,97 en validación internacional).',
    validity:
      'Adecuada para detección de malestar emocional. En Chile se usan normas adaptadas; los puntajes DASS-21 se multiplican por 2 (DASS-42).',
    learnMore: 'No sustituye evaluación clínica integral.',
  },
  eed: {
    authors: 'Psicoterapia Lab (basado en DSQ)',
    ageRange: '16 años en adelante',
    reliability:
      'Instrumento de elaboración propia; sin estandarización publicada. Uso exploratorio.',
    validity:
      'No validado formalmente en Chile. Interpretación orientativa del perfil defensivo; no es diagnóstico independiente.',
    learnMore: 'Ver manual: Escala de Estilos Defensivos.',
  },
  escala_animo: {
    authors: 'Psicoterapia Lab',
    ageRange: 'Todas las edades',
    reliability: '—',
    validity: 'Registro subjetivo VAS 1–100; sin estandarización en Chile.',
    learnMore: '1 = ánimo muy bajo, 100 = muy alto (últimos 7 días).',
  },
  escala_ansiedad: {
    authors: 'Psicoterapia Lab',
    ageRange: 'Todas las edades',
    reliability: '—',
    validity: 'Registro subjetivo VAS 1–100; sin estandarización en Chile.',
    learnMore: '1 = ansiedad muy baja, 100 = muy alta (últimos 7 días).',
  },
  rosenberg: {
    authors: 'Rosenberg (1965)',
    ageRange: 'Adolescentes y adultos (≥ 12 años)',
    reliability:
      'Alta consistencia interna (α ≈ 0,77–0,88) y fiabilidad test-retest en múltiples estudios.',
    validity:
      'Validado en población chilena (Rojas-Barahona et al., 2009). Normas locales disponibles para adolescentes y adultos.',
    learnMore:
      '5 ítems directos + 5 invertidos. Puntaje 10–40: bajo (10–25), medio (26–29), alto (30–40). No sustituye evaluación clínica integral.',
  },
  qols: {
    authors: 'Flanagan (1978); adaptación Burckhardt et al.',
    ageRange: 'Adolescentes y adultos',
    reliability:
      'Consistencia interna α ≈ 0,82–0,92 en estudios con enfermedad crónica; uso clínico amplio.',
    validity:
      'Validada en múltiples poblaciones; en Chile se usa en investigación y seguimiento de calidad de vida.',
    learnMore: 'Puntaje total 16–112 (mayor = mejor). Dominios orientativos, no diagnóstico.',
  },
  escala_fer: {
    authors: 'Psicoterapia Lab',
    ageRange: 'Adolescentes y adultos (≥ 14 años)',
    reliability: 'Instrumento de elaboración propia; sin estandarización publicada. Uso exploratorio.',
    validity:
      'No validado formalmente. Aporta una panorámica clínica rápida de recursos protectores y factores de riesgo; no es diagnóstico independiente.',
    learnMore:
      '12 ítems Likert 0–4 (6 fortalezas + 6 riesgos). Incluye alerta automática ante ideación de daño.',
  },
};

export function psychometricsFor(type) {
  return MODULE_PSYCHOMETRICS[type] || null;
}
