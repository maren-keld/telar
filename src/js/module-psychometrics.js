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
    authors: 'Telar (basado en DSQ)',
    ageRange: '16 años en adelante',
    reliability:
      'Instrumento de elaboración propia; sin estandarización publicada. Uso exploratorio.',
    validity:
      'No validado formalmente en Chile. Interpretación orientativa del perfil defensivo; no es diagnóstico independiente.',
    learnMore: 'Ver manual: Escala de Estilos Defensivos.',
  },
  escala_animo: {
    authors: 'Telar',
    ageRange: 'Todas las edades',
    reliability: '—',
    validity: 'Registro subjetivo VAS 1–100; sin estandarización en Chile.',
    learnMore: '1 = ánimo muy bajo, 100 = muy alto (últimos 7 días).',
  },
  escala_ansiedad: {
    authors: 'Telar',
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
  gad7: {
    authors: 'Spitzer, Kroenke, Williams & Löwe (2006)',
    ageRange: 'Adultos (≥ 18 años)',
    reliability:
      'Alta consistencia interna (α ≈ 0,92) y buena fiabilidad test-retest en estudios internacionales.',
    validity:
      'Validado como tamizaje de trastorno de ansiedad generalizada. En Chile se usa en atención primaria y salud mental.',
    learnMore:
      'Puntaje 0–21: mínima (0–4), leve (5–9), moderada (10–14), severa (15–21). No sustituye evaluación clínica integral.',
  },
  asrs: {
    authors: 'Kessler et al. (2005); WHO',
    ageRange: 'Adultos (≥ 18 años)',
    reliability:
      'Buena consistencia interna y validez de constructo en estudios internacionales con adultos.',
    validity:
      'Tamizaje de TDAH en adultos (ASRS v1.1). Parte A: ≥4 de 6 síntomas positivos sugiere consistencia con TDAH.',
    learnMore:
      'Escala 0–4 (Nunca → Muy a menudo). Parte B aporta contexto clínico adicional. No sustituye evaluación diagnóstica.',
  },
  pcl5: {
    authors: 'Weathers et al. (2013); DSM-5',
    ageRange: 'Adultos (≥ 18 años)',
    reliability: 'Alta consistencia interna (α ≈ 0,94) en validaciones internacionales.',
    validity:
      'Tamizaje TEPT DSM-5. Versión en español ampliamente usada. Punto de corte orientativo ≥31 (probable TEPT).',
    learnMore: 'Escala 0–4 (Nada → Extremadamente). Requiere confirmación clínica (p. ej. entrevista estructurada).',
  },
  sprint_ecl: {
    authors: 'Norris et al.; validación chilena Leiva-Bianchi & Gallardo (2013)',
    ageRange: 'Adolescentes y adultos expuestos a eventos traumáticos',
    reliability: 'α ≈ 0,916 en muestra chilena post 27-F.',
    validity:
      'Tamizaje breve de estrés postraumático. Ítems 1–11 suman 0–44; ítem 12 (ideación suicida) no suma.',
    learnMore: 'Validado en Chile tras terremoto/tsunami 2010. No sustituye evaluación clínica integral.',
  },
  iesr: {
    authors: 'Weiss & Marmar (1997)',
    ageRange: 'Adultos expuestos a eventos estresantes',
    reliability: 'Alta consistencia interna en validaciones internacionales (α ≈ 0,79–0,92).',
    validity:
      'IES-R: intrusión, evitación e hiperactivación. Total 0–88; umbral orientativo ≥33 para impacto clínico elevado.',
    learnMore: 'Escala 0–4 (últimos 7 días). Complementa PCL-5 y SPRINT-E-CL en seguimiento trauma.',
  },
  ades: {
    authors: 'Armstrong, Putnam & Carlson (1997)',
    ageRange: 'Adolescentes 10–21 años',
    reliability: 'Buena consistencia interna y validez en estudios con adolescentes disociativos.',
    validity:
      'Tamizaje de disociación (amnesia, absorción, influencia pasiva, despersonalización). Media total 0–10; ≥4 sugiere evaluación clínica.',
    learnMore: 'Dominio público. Subescala A-DES-T (8 ítems taxon). No sustituye evaluación diagnóstica integral.',
  },
  escala_fer: {
    authors: 'Telar',
    ageRange: 'Adolescentes y adultos (≥ 14 años)',
    reliability: 'Instrumento de elaboración propia; sin estandarización publicada. Uso exploratorio.',
    validity:
      'No validado formalmente. Aporta una panorámica clínica rápida de recursos protectores y factores de riesgo; no es diagnóstico independiente.',
    learnMore:
      '12 ítems Likert 0–4 (6 fortalezas + 6 riesgos). Incluye alerta automática ante ideación de daño.',
  },
  tcc_abc: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Material psicoeducativo TCC; sin estandarización psicométrica.',
    validity: 'Herramienta de registro clínico orientativa; no sustituye evaluación ni formulación del caso.',
    learnMore: 'Modelo ABC simplificado: activador, creencias y consecuencias.',
  },
  tcc_plan_seguridad: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos en riesgo o estrés elevado',
    reliability: 'Material de apoyo clínico; no es un instrumento estandarizado.',
    validity:
      'Plan de seguridad orientativo. La evaluación de riesgo vital y las decisiones de contención son responsabilidad del profesional.',
    learnMore: 'Basado en prácticas habituales de planificación de crisis; no reemplaza protocolos institucionales.',
  },
  tcc_activacion: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Material psicoeducativo TCC; casos prácticos sin baremo normativo.',
    validity: 'Promueve rutinas de activación conductual; uso orientativo en tratamiento de ánimo bajo.',
    learnMore: 'Recomendación: al menos 3 actividades semanales. Casos prácticos con retroalimentación al profesional.',
  },
  tcc_socratico: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Material psicoeducativo TCC; sin estandarización psicométrica.',
    validity: 'Herramienta de reestructuración cognitiva orientativa; no sustituye terapia.',
    learnMore: 'Basado en cuestionamiento socrático clásico en TCC.',
  },
  tcc_flexibilidad: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Material psicoeducativo; uso exploratorio.',
    validity: 'Fortalece flexibilidad cognitiva; no es instrumento estandarizado.',
    learnMore: 'Incluye casos prácticos con retroalimentación al profesional.',
  },
  tcc_probabilidades: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Ejercicio clínico orientativo.',
    validity: 'Diferencia probabilidad vs posibilidad en manejo de ansiedad.',
    learnMore: 'Escala subjetiva 0–100; interpretación clínica contextual.',
  },
  tcc_sesgos: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Material psicoeducativo sobre distorsiones cognitivas.',
    validity: 'Identificación orientativa de sesgos; no sustituye formulación del caso.',
    learnMore: 'Casos prácticos incluidos.',
  },
  tcc_autoconceptos: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Ejercicio de visualización del mejor yo posible.',
    validity: 'Uso en regulación emocional y planificación de metas.',
    learnMore: 'Dominios personal, profesional y social.',
  },
  tcc_preocupaciones: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Registro clínico de preocupaciones.',
    validity: 'Complementa tamizaje de ansiedad (GAD-7, escalas subjetivas).',
    learnMore: 'Fomenta externalización escrita de preocupaciones.',
  },
  tcc_gratitud: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Todas las edades',
    reliability: 'Rutina psicoeducativa de gratitud.',
    validity: 'Apoyo a regulación del ánimo; no es terapia independiente.',
    learnMore: 'Uso semanal recomendado.',
  },
  tcc_estres: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Material de manejo de estrés.',
    validity: 'Estrategias corto y largo plazo; consultar médico para suplementos.',
    learnMore: 'Incluye técnicas de respiración y activación física.',
  },
};

export function psychometricsFor(type) {
  return MODULE_PSYCHOMETRICS[type] || null;
}
