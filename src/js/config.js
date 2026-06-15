export const TREATMENT_STATUS = {
  en_tratamiento: { label: 'En tratamiento', order: 0 },
  en_pausa: { label: 'En pausa', order: 1 },
  completado: { label: 'Completado', order: 2 },
  abandonado: { label: 'Abandonados', order: 3 },
  archivado: { label: 'Archivado', order: 4 },
};

export const TREATMENT_TAG_DEFS = {
  derivado: { label: 'Derivado', legacyReferral: true },
  necesita_supervision: { label: 'Necesita supervisión', legacySupervised: true },
  estudiar_caso: { label: 'Estudiar más el caso' },
};

export const PREVISION_OPTIONS = [
  'Fonasa',
  'Isapre Colmena',
  'Isapre Consalud',
  'Isapre Cruz Blanca',
  'Isapre Nueva Masvida',
  'Isapre Vida Tres',
  'Isapre Banmédica',
  'Particular',
  'Otro',
];

export const NOTE_COLORS = [
  { id: 'teal', label: 'Verde agua', short: 'Ve', class: 'note--teal' },
  { id: 'yellow', label: 'Amarillo', short: 'Am', class: 'note--yellow' },
  { id: 'lavender', label: 'Lavanda', short: 'La', class: 'note--lavender' },
  { id: 'pink', label: 'Rosa', short: 'Ro', class: 'note--pink' },
  { id: 'blue', label: 'Azul', short: 'Az', class: 'note--blue' },
];

export const MODULE_DEFS = {
  selector_modulo: {
    label: 'Seleccionar módulo',
    category: 'meta',
    description: 'Elige qué módulo añadir a esta sesión.',
    allowMultipleInSession: false,
  },
  registro_inicial: {
    label: 'Registro inicial',
    category: 'conceptualizacion',
    description: 'Datos demográficos y de contacto del paciente.',
    oncePerTreatment: true,
  },
  motivo_consulta: {
    label: 'Motivo de consulta',
    category: 'conceptualizacion',
    description: 'Razón principal de consulta y expectativas.',
    oncePerTreatment: true,
  },
  redes_apoyo: {
    label: 'Redes de apoyo',
    category: 'conceptualizacion',
    description: 'Mapa de personas, tipo de vínculo y áreas de apoyo.',
  },
  diagnostico: {
    label: 'Diagnósticos',
    category: 'conceptualizacion',
    description: 'Problemas, indicadores y objetivos por tratamiento.',
  },
  neurofeedback: {
    label: 'Neurofeedback',
    category: 'intervencion',
    description: 'Sesión en vivo con Muse, FFT y análisis local.',
  },
  bilateral_stimulation: {
    label: 'Estimulación bilateral',
    category: 'intervencion',
    description: 'Estímulo visual alternado para procesamiento trauma (EMDR-adjacent).',
    allowMultipleInSession: false,
  },
  tcc_abc: {
    label: 'Modelo ABC (versión simple)',
    category: 'tcc',
    description: 'Registro activador–creencias–consecuencias para situaciones difíciles.',
    allowMultipleInSession: false,
  },
  tcc_plan_seguridad: {
    label: 'Plan de seguridad vital',
    category: 'tcc',
    description: 'Seis secciones para crisis, apoyo y ambiente seguro (una vez por tratamiento).',
    oncePerTreatment: true,
    allowMultipleInSession: false,
  },
  tcc_activacion: {
    label: 'Activación conductual',
    category: 'tcc',
    description: 'Rutinas de ánimo, actividades sugeridas y casos prácticos TCC.',
    allowMultipleInSession: false,
  },
  tcc_socratico: {
    label: 'Cuestionamiento socrático',
    category: 'tcc',
    description: 'Explorar evidencia a favor y en contra de un pensamiento.',
    allowMultipleInSession: false,
  },
  tcc_flexibilidad: {
    label: 'Rutinas de flexibilidad cognitiva',
    category: 'tcc',
    description: 'Preguntas reflexivas, actividades y casos prácticos de flexibilidad.',
    allowMultipleInSession: false,
  },
  tcc_probabilidades: {
    label: 'Probabilidades vs posibilidades',
    category: 'tcc',
    description: 'Reajustar estimaciones de preocupación (0–100) y plan de acción.',
    allowMultipleInSession: false,
  },
  tcc_sesgos: {
    label: 'Identificando sesgos',
    category: 'tcc',
    description: 'Identificar distorsiones cognitivas y casos prácticos.',
    allowMultipleInSession: false,
  },
  tcc_autoconceptos: {
    label: 'Exploración de autoconceptos',
    category: 'tcc',
    description: 'Mejor yo posible en dominios personal, profesional y social.',
    allowMultipleInSession: false,
  },
  tcc_preocupaciones: {
    label: 'Exploración de preocupaciones',
    category: 'tcc',
    description: 'Registrar preocupaciones significativas y pensamientos frecuentes.',
    allowMultipleInSession: false,
  },
  tcc_gratitud: {
    label: 'Rutinas de gratitud',
    category: 'tcc',
    description: 'Preguntas orientadas a recuerdos y deseos agradables.',
    allowMultipleInSession: false,
  },
  tcc_estres: {
    label: 'Rutinas de reducción de estrés',
    category: 'tcc',
    description: 'Actividades corto y largo plazo; plan personal de manejo de estrés.',
    allowMultipleInSession: false,
  },
  dass21: {
    label: 'Escala de estrés, ansiedad y depresión (DASS 21)',
    category: 'pruebas',
    description: 'Cuestionario DASS-21 (una vez por sesión).',
    allowMultipleInSession: false,
  },
  eed: {
    label: 'Escala de estilos defensivos (EED)',
    category: 'pruebas',
    description: 'Perfil defensivo: adaptativos, intermedios y desadaptativos (una vez por tratamiento).',
    oncePerTreatment: true,
    allowMultipleInSession: false,
  },
  escala_animo: {
    label: 'Escala subjetiva de ánimo',
    category: 'pruebas',
    description: 'Estimación subjetiva de ánimo (1–100), últimos 7 días.',
    allowMultipleInSession: false,
  },
  escala_ansiedad: {
    label: 'Escala subjetiva de ansiedad',
    category: 'pruebas',
    description: 'Estimación subjetiva de ansiedad (1–100), últimos 7 días.',
    allowMultipleInSession: false,
  },
  rosenberg: {
    label: 'Escala de Autoestima de Rosenberg (EAR)',
    category: 'pruebas',
    description: 'Mide autoestima global con 10 ítems (5 directos, 5 invertidos); puntaje 10–40.',
    allowMultipleInSession: false,
  },
  escala_fer: {
    label: 'Escala de Fortalezas y Riesgos (EFR)',
    category: 'pruebas',
    description: 'Detecta recursos protectores y factores de riesgo clínico (12 ítems, Likert 0–4).',
    allowMultipleInSession: false,
  },
  qols: {
    label: 'Escala de calidad de vida (QOLS)',
    category: 'pruebas',
    description: 'Satisfacción con áreas de la vida (16 ítems, escala 1–7; total 16–112).',
    allowMultipleInSession: false,
  },
  gad7: {
    label: 'GAD-7 — Ansiedad generalizada',
    category: 'pruebas',
    description: 'Tamizaje de ansiedad generalizada (7 ítems, escala 0–3; últimas 2 semanas).',
    allowMultipleInSession: false,
  },
  asrs: {
    label: 'ASRS v1.1 — TDAH en adultos',
    category: 'pruebas',
    description: 'Tamizaje de TDAH en adultos (18 ítems, escala 0–4; scoring WHO Parte A).',
    allowMultipleInSession: false,
  },
  pcl5: {
    label: 'PCL-5 — Tamizaje TEPT (DSM-5)',
    category: 'pruebas',
    description: 'Cuestionario TEPT DSM-5 (20 ítems, escala 0–4; último mes).',
    allowMultipleInSession: false,
  },
  sprint_ecl: {
    label: 'SPRINT-E-CL — Trauma breve',
    category: 'pruebas',
    description: 'Tamizaje breve de estrés postraumático (validación Chile 27-F).',
    allowMultipleInSession: false,
  },
  iesr: {
    label: 'IES-R — Impacto del evento',
    category: 'pruebas',
    description: 'Escala revisada de impacto de eventos (22 ítems, 0–4; subescalas intrusión, evitación, hiperactivación).',
    allowMultipleInSession: false,
  },
  ades: {
    label: 'A-DES — Disociación adolescente',
    category: 'pruebas',
    description: 'Tamizaje de disociación en adolescentes (30 ítems, 0–10; media total 0–10).',
    allowMultipleInSession: false,
  },
};

export const MARITAL_OPTIONS = [
  'Soltero/a',
  'En una relación',
  'Casado/a',
  'Divorciado/a',
  'Viudo/a',
];

export const EDUCATION_OPTIONS = [
  'Sin estudios formales',
  'Educación básica incompleta',
  'Educación básica completa',
  'Educación media incompleta',
  'Educación media completa',
  'Educación técnica / profesional incompleta',
  'Educación técnica / profesional completa',
  'Educación universitaria incompleta',
  'Educación universitaria completa',
  'Postgrado',
  'Otro',
];

export const SOURCE_OPTIONS = [
  'Recomendación de otro cliente',
  'Redes sociales',
  'Búsqueda web',
  'Derivación profesional',
  'Otro',
];
