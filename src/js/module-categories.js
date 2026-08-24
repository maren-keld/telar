/**
 * Categorías del catálogo: función en la hora, no escuela.
 * Los ids internos (tcc, significado, intervencion) se conservan.
 */
export const CATEGORY_LABELS = {
  conceptualizacion: 'Conceptualización',
  pruebas: 'Pruebas psicométricas',
  tcc: 'Habilidades y tareas',
  significado: 'Significado',
  intervencion: 'Intervención en sesión',
};

/** Una línea bajo el título, igual en selector y landing. Pruebas no lleva subtítulo. */
export const CATEGORY_BLURBS = {
  conceptualizacion: 'Encuadre y formulación del caso',
  pruebas: '',
  tcc: 'Psicoeducación y práctica, recomendado para traer como tarea entre sesiones.',
  significado: 'Narrativa e identidad, se trabaja en sesión',
  intervencion: 'Entrenar habilidades en sesión',
};

export const CUSTOM_CATEGORY_LABEL = 'Mis módulos';
export const CUSTOM_CATEGORY_BLURB = 'Módulos personalizados';

export const CATEGORY_ORDER = ['conceptualizacion', 'pruebas', 'tcc', 'significado', 'intervencion'];

export const CATEGORIES = [
  {
    id: 'conceptualizacion',
    label: CATEGORY_LABELS.conceptualizacion,
    blurb: CATEGORY_BLURBS.conceptualizacion,
    types: ['registro_inicial', 'motivo_consulta', 'redes_apoyo', 'diagnostico', 'tcc_plan_seguridad'],
  },
  {
    id: 'pruebas',
    label: CATEGORY_LABELS.pruebas,
    blurb: CATEGORY_BLURBS.pruebas,
    types: [
      'dass21',
      'gad7',
      'asrs',
      'pcl5',
      'sprint_ecl',
      'iesr',
      'ades',
      'eed',
      'qols',
      'rosenberg',
      'escala_animo',
      'escala_ansiedad',
      'escala_fer',
    ],
  },
  {
    id: 'tcc',
    label: CATEGORY_LABELS.tcc,
    blurb: CATEGORY_BLURBS.tcc,
    types: [
      'tcc_abc',
      'tcc_sesgos',
      'tcc_socratico',
      'tcc_flexibilidad',
      'tcc_probabilidades',
      'tcc_preocupaciones',
      'tcc_gratitud',
      'tcc_estres',
      'tcc_activacion',
      'tcc_registro_pensamientos',
      'tcc_monitoreo_actividades',
      'tcc_exposicion',
      'tcc_experimento',
      'tcc_prevencion_recaida',
    ],
  },
  {
    id: 'significado',
    label: CATEGORY_LABELS.significado,
    blurb: CATEGORY_BLURBS.significado,
    types: [
      'sig_externalizacion',
      'sig_resultados_unicos',
      'sig_linea_vida',
      'sig_carta_problema',
      'sig_pregunta_milagro',
      'sig_condiciones_valia',
      'sig_felt_sense',
      'tcc_autoconceptos',
    ],
  },
  {
    id: 'intervencion',
    label: CATEGORY_LABELS.intervencion,
    blurb: CATEGORY_BLURBS.intervencion,
    types: ['neurofeedback', 'bilateral_stimulation'],
  },
];

export function categoryLabel(id) {
  return CATEGORY_LABELS[id] || id;
}
