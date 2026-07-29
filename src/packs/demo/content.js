/** Pack demo público — escala subjetiva + ABC mínimo. */
export const DEMO_MODULE_DEFS = {
  escala_animo: {
    label: 'Escala subjetiva de ánimo (demo)',
    category: 'pruebas',
    description: 'Estimación subjetiva de ánimo (1–100). Versión demo del motor Telar.',
    allowMultipleInSession: false,
  },
  tcc_abc: {
    label: 'Modelo ABC — demo',
    category: 'tcc',
    description: 'Registro activador–creencias–consecuencias (ejemplo genérico).',
    allowMultipleInSession: false,
  },
};

export const DEMO_HANDOUTS = {
  tcc_abc: {
    title: 'Modelo ABC (demo)',
    intro: 'Ejemplo genérico del motor Telar. El contenido clínico completo está en el instalador oficial.',
    sections: [
      {
        key: 'activador',
        title: 'Evento activador',
        hint: '¿Qué situación disparó la respuesta?',
        rows: 3,
      },
      {
        key: 'creencias',
        title: 'Pensamientos',
        hint: '¿Qué pensaste en ese momento?',
        rows: 3,
      },
      {
        key: 'consecuencias',
        title: 'Consecuencias',
        hint: 'Emoción y conducta resultante.',
        rows: 3,
      },
    ],
    variables: ['Demo', 'Registro cognitivo'],
    searchTags: ['demo', 'tcc', 'abc'],
  },
};

export const DEMO_PSYCHOMETRICS = {
  escala_animo: {
    authors: 'Telar (demo)',
    ageRange: 'Todas las edades',
    reliability: '—',
    validity: 'Registro subjetivo demo; sin uso clínico.',
    learnMore: 'Instala Telar desde Releases para packs clínicos completos.',
  },
};
