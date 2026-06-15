/** Definiciones de módulos TCC (elaboración propia Telar). Usado por tcc-generic.js y readable-text. */

export const TCC_HANDOUT_DEFS = {
  tcc_socratico: {
    title: 'Cuestionamiento socrático',
    intro:
      'El cerebro realiza predicciones constantes; en situaciones inciertas aparece ansiedad. Registrar pensamientos por escrito reduce incertidumbre. Este módulo explora suposiciones y evidencia que sustentan un pensamiento.',
    sections: [
      {
        key: 'pensamiento',
        title: 'Pensamiento por cuestionar',
        hint: 'Escriba el pensamiento o creencia que desea examinar.',
        rows: 3,
      },
      {
        key: 'evidencia_a_favor',
        title: '¿Cuál es la evidencia que apoya este pensamiento?',
        rows: 3,
      },
      {
        key: 'evidencia_contra',
        title: '¿Cuál es la evidencia contraria a mi pensamiento?',
        rows: 3,
      },
      {
        key: 'otra_explicacion',
        title: '¿Cuál podría ser otra explicación o punto de vista de la situación?',
        rows: 3,
      },
      {
        key: 'consecuencias',
        title: '¿Cuáles son las consecuencias (buenas y malas) de este pensamiento?',
        rows: 3,
      },
      {
        key: 'amigo',
        title: '¿Qué pensaría un amigo de esta situación?',
        rows: 2,
      },
      {
        key: 'futuro',
        title: '¿Esto importará en un año más? ¿Y dentro de cinco años?',
        rows: 2,
      },
    ],
    variables: ['Reestructuración cognitiva', 'Pensamiento automático', 'Flexibilidad cognitiva'],
    searchTags: ['tcc', 'cognitivo', 'ansiedad', 'socrático', 'pensamiento'],
  },
  tcc_flexibilidad: {
    title: 'Rutinas de flexibilidad cognitiva',
    intro:
      'La flexibilidad cognitiva permite adaptarse a eventos, pensamientos y conductas. Aunque no siempre controlamos cómo nos sentimos, podemos ser flexibles con nuestros esquemas para modular la influencia de las emociones.',
    sections: [
      {
        key: 'paradojos',
        title: '¿Qué le parecen paradójicas, anormales, irracionales o inconcebibles? Fundamente.',
        rows: 3,
      },
      {
        key: 'flexible_pasado',
        title: '¿Qué momentos del pasado identifica en los que fue cognitivamente flexible?',
        rows: 3,
      },
      {
        key: 'hubiera_flexible',
        title: '¿En qué momentos del pasado se habría beneficiado de mayor flexibilidad?',
        rows: 3,
      },
      {
        key: 'area_flexible',
        title: '¿En qué área de su vida podría ser más flexible cognitivamente?',
        rows: 2,
      },
      {
        key: 'inflexibles',
        title: '¿Le resulta agradable conversar con personas cognitivamente inflexibles? Fundamente.',
        rows: 3,
      },
    ],
    activityGroups: [
      {
        title: 'Actividades',
        items: [
          'Trate de eliminar en la medida posible los «sí» y «no» de sus juicios. Elabore lo que diga y piense; postergue declaraciones al mínimo. Ponga atención en escuchar.',
          'Cambie su contexto: mueva muebles, estudie o trabaje en lugares distintos a los habituales.',
        ],
      },
    ],
    quiz: [
      {
        key: 'q0',
        prompt:
          'Estoy en una reunión y se da una opinión que me resulta insólita o inaceptable. ¿Qué debería hacer?',
        options: [
          { v: 'a', label: 'Tratar constantemente de cambiar su opinión.' },
          { v: 'b', label: 'Escuchar su opinión y reflexionar sobre qué podría haber de cierto en lo que dice.', correct: true },
          { v: 'c', label: 'Retirarme de la reunión y no escuchar sus argumentos.' },
        ],
      },
      {
        key: 'q1',
        prompt: 'Las personas no podemos cambiar porque somos lo que hicieron de nosotros desde pequeños:',
        options: [
          { v: 'a', label: 'Verdadero. Debemos aprender a vivir con lo que aprendimos de pequeños.' },
          {
            v: 'b',
            label: 'Falso. El cerebro posee plasticidad; podemos aprender hasta los 90 años y más.',
            correct: true,
          },
        ],
      },
    ],
    variables: ['Flexibilidad cognitiva', 'Adaptación', 'Esquemas cognitivos'],
    searchTags: ['tcc', 'cognitivo', 'tdah', 'flexibilidad', 'esquemas'],
  },
  tcc_probabilidades: {
    title: 'Probabilidades vs posibilidades',
    intro:
      'La ansiedad implica preocupación persistente ante situaciones potencialmente dañinas, con probabilidad baja o incierta. La probabilidad (0–100) estima qué tan posible es un evento; la posibilidad indica si puede ocurrir aunque sea poco probable. Objetivo: reajustar estimaciones para disminuir ansiedad elevada.',
    sections: [
      {
        key: 'preocupacion',
        title: 'Preocupación',
        hint: 'Anota una preocupación concreta.',
        rows: 2,
      },
      {
        key: 'posible_imposible',
        title: '¿Es posible o imposible esta preocupación?',
        type: 'radio',
        options: [
          { v: 'posible', label: 'Posible' },
          { v: 'imposible', label: 'Imposible' },
        ],
      },
      {
        key: 'probabilidad',
        title: '¿Cuán probable es? (0–100)',
        type: 'number',
        min: 0,
        max: 100,
      },
      {
        key: 'por_que_posible',
        title: '¿Por qué es posible (o imposible) esta preocupación?',
        rows: 3,
      },
      {
        key: 'ultimos_30',
        title: '¿Qué has estado haciendo estos últimos 30 días para disminuir las probabilidades?',
        rows: 3,
      },
      {
        key: 'mas_acciones',
        title: '¿Qué más podrías hacer para disminuir las probabilidades?',
        rows: 3,
      },
    ],
    variables: ['Estimación de riesgo', 'Regulación de la preocupación', 'Tolerancia a la incertidumbre'],
    searchTags: ['tcc', 'ansiedad', 'trauma', 'probabilidad', 'preocupación'],
  },
  tcc_sesgos: {
    title: 'Identificando sesgos',
    intro:
      'Un sesgo es un error sistemático al procesar información; afecta decisiones y juicios. Este ejercicio ayuda a identificar sesgos para disminuir su poder y sustituirlos por pensamientos más equilibrados.',
    sections: [
      {
        key: 'sesgos_predominantes',
        title: 'Sesgos predominantes',
        hint: 'Elija uno o más sesgos que estime predominantes en sus pensamientos (ej. catastrofismo, pensamiento todo-o-nada, lectura de mente).',
        rows: 3,
      },
      {
        key: 'pensamientos_sesgos',
        title: '¿En qué pensamientos suyos podría encontrar esos sesgos?',
        rows: 4,
      },
    ],
    quiz: [
      {
        key: 'q0',
        prompt:
          'Es mi cumpleaños y ya es casi medianoche. Ninguno de mis mejores amigos me ha llamado. Esto podría ser porque:',
        options: [
          { v: 'a', label: 'Ya nadie me quiere. Puedo dar fe de que es así.' },
          { v: 'b', label: 'Debieron haber tenido algún problema. No tengo suficiente información.', correct: true },
        ],
      },
      {
        key: 'q1',
        prompt: 'Ayer traté de hacer algo difícil y no me salió bien. Esto podría ser porque:',
        options: [
          {
            v: 'a',
            label:
              'Tomará tiempo. Tras ensayo y error todo saldrá como espero. Debo mantener expectativas acordes a la realidad.',
            correct: true,
          },
          {
            v: 'b',
            label: 'No sirvo para nada. Mis expectativas van siempre en contra de lo que espero.',
          },
        ],
      },
    ],
    variables: ['Distorsiones cognitivas', 'Autopercepción', 'Regulación emocional'],
    searchTags: ['tcc', 'cognitivo', 'sesgos', 'distorsiones'],
  },
  tcc_autoconceptos: {
    title: 'Exploración de autoconceptos',
    intro:
      '¿Cómo sería su vida en un futuro perfecto? ¿Cómo pasaría su tiempo? ¿Quiénes estarían a su lado? Imagine su mejor yo posible en dominios personal, profesional y social.',
    sections: [
      {
        key: 'dominio_personal',
        title: 'Mejor yo posible — dominio personal',
        hint: 'Habilidades, pasatiempos, personalidad, salud, logros, etc. Tómese un minuto para imaginarlo y luego escriba.',
        rows: 5,
      },
      {
        key: 'dominio_profesional',
        title: 'Mejor yo posible — dominio profesional',
        hint: 'Trabajo, educación, habilidades, jubilación, ingresos, etc.',
        rows: 5,
      },
      {
        key: 'dominio_social',
        title: 'Mejor yo posible — dominio social',
        hint: 'Relación romántica, amigos, familia, actividades sociales, etc.',
        rows: 5,
      },
    ],
    variables: ['Autoconcepto', 'Identidad', 'Esquemas de futuro'],
    searchTags: ['tcc', 'trauma', 'esquemas', 'autoconcepto', 'futuro'],
  },
  tcc_preocupaciones: {
    title: 'Exploración de preocupaciones',
    intro:
      'El cerebro predice constantemente; la incertidumbre al no registrar preocupaciones aumenta ansiedad. Este módulo ayuda a descubrir qué preocupaciones podrían estar generando síntomas.',
    activityGroups: [
      {
        title: 'Actividades',
        items: [
          'Use un medio privado (notas del celular o agenda) para registrar preocupaciones al menos 5 minutos al día.',
          'Mantenga una lista con tareas, proyectos y metas.',
        ],
      },
    ],
    sections: [
      {
        key: 'preocupaciones_significativas',
        title: 'Preocupaciones más significativas',
        hint: 'Escriba cuáles comprender o resolver a la brevedad.',
        rows: 4,
      },
      {
        key: 'pensamientos_frecuentes',
        title: 'Pensamientos más frecuentes',
        hint: 'Detalle lo más posible esos pensamientos.',
        rows: 4,
      },
    ],
    quiz: [
      {
        key: 'q0',
        prompt: 'Me siento preocupado/a y no sé por qué. ¿Qué debería hacer?',
        options: [
          { v: 'a', label: 'Tomar una siesta o salir a distraerme con amigos.' },
          {
            v: 'b',
            label: 'Detenerme y anotar en mi diario todas mis preocupaciones, inquietudes o ideas.',
            correct: true,
          },
        ],
      },
      {
        key: 'q1',
        prompt: 'Siento que tengo muchas cosas en la cabeza. ¿Qué debería hacer?',
        options: [
          {
            v: 'a',
            label: 'Detenerme y anotar en mi diario todas mis preocupaciones, inquietudes o ideas.',
            correct: true,
          },
          {
            v: 'b',
            label: 'Distraerme con película o música. Es preferible no pensar en otras cosas.',
          },
        ],
      },
    ],
    variables: ['Regulación de la preocupación', 'Rumiación', 'Atención dirigida'],
    searchTags: ['tcc', 'ansiedad', 'tdah', 'preocupación', 'diario'],
  },
  tcc_gratitud: {
    title: 'Rutinas de gratitud',
    intro:
      'El estado de ánimo refleja la disposición previa a actividades y puede fluctuar según contexto y actividades del día. Estas rutinas refuerzan conexiones con recuerdos y deseos agradables.',
    sections: [
      { key: 'lugares', title: '¿Cuáles lugares aprecia más y por qué?', rows: 3 },
      { key: 'mejor_hoy', title: '¿Qué es lo mejor que le ha pasado hoy?', rows: 2 },
      { key: 'naturaleza', title: '¿Qué aprecia de pasar tiempo en la naturaleza?', rows: 2 },
      {
        key: 'cinco_alegria',
        title: 'Liste cinco cosas que le provoquen alegría',
        hint: 'Situaciones, cosas, eventos, personas, etc.',
        rows: 4,
      },
      { key: 'cinco_suenos', title: 'Escriba cinco sueños que aún no se han hecho realidad', rows: 4 },
    ],
    variables: ['Bienestar subjetivo', 'Perspectiva positiva', 'Regulación emocional'],
    searchTags: ['tcc', 'regulación', 'trauma', 'gratitud', 'ánimo'],
  },
  tcc_estres: {
    title: 'Rutinas de reducción de estrés',
    intro:
      'El estrés es una respuesta fisiológica y psicológica ante desafíos reales o percibidos. Comparte con la ansiedad insomnio, tensión e irritabilidad; la ansiedad añade preocupación persistente. Estas rutinas buscan reducir estrés a corto plazo (SOS) y a mediano/largo plazo.',
    activityGroups: [
      {
        title: 'Actividades — corto plazo',
        items: [
          'Dos inhalaciones por la nariz y una exhalación prolongada por la boca. Repita 3 veces (exhalación más larga que las inhalaciones).',
          'Camine o siéntese al aire libre 20–30 minutos.',
          'Ejercicio suave media hora: yoga, bicicleta, meditación, etc.',
        ],
      },
      {
        title: 'Actividades — mediano/largo plazo',
        items: [
          'Sueño reparador 7–8 horas cada noche.',
          'Disminuir o redistribuir carga de trabajo/estudios (ej. técnica Pomodoro).',
          'Retomar actividades deseadas: bailar, idioma, cocina, instrumento musical, etc.',
          'Consultar con médico o farmacéutico sobre suplementos si corresponde (Ashwagandha, teanina, melatonina).',
        ],
      },
    ],
    sections: [
      {
        key: 'notas_personales',
        title: 'Notas personales / plan de acción',
        hint: 'Qué rutinas aplicará esta semana y cuándo.',
        rows: 4,
      },
    ],
    variables: ['Regulación del estrés', 'Recursos de afrontamiento', 'Psicoeducación fisiológica'],
    searchTags: ['tcc', 'estrés', 'trauma', 'tdah', 'regulación', 'respiración'],
  },
};

export function tccHandoutDef(moduleType) {
  return TCC_HANDOUT_DEFS[moduleType] || null;
}

export function formatTccHandoutReadable(moduleType, data) {
  const def = tccHandoutDef(moduleType);
  if (!def) return '';
  const d = data || {};
  const parts = [];

  for (const s of def.sections || []) {
    const v = d[s.key];
    if (v == null || v === '') continue;
    if (s.type === 'radio') parts.push(`${s.title}: ${v}`);
    else if (s.type === 'number') parts.push(`${s.title}: ${v}`);
    else parts.push(`${s.title}:\n${String(v).trim()}`);
  }

  const quiz = d.quiz || {};
  const quizKeys = def.quiz || [];
  if (quizKeys.length) {
    let correct = 0;
    let answered = 0;
    for (const q of quizKeys) {
      const v = quiz[q.key];
      if (v == null || v === '') continue;
      answered += 1;
      const opt = q.options.find((o) => o.v === v);
      if (opt?.correct) correct += 1;
    }
    if (answered > 0) parts.push(`Casos prácticos: ${correct}/${quizKeys.length} aciertos`);
  }

  return parts.join('\n\n');
}

export const TCC_VARIABLES = {
  tcc_abc: ['Registro cognitivo', 'Activador–creencias–consecuencias', 'Conciencia situacional'],
  tcc_plan_seguridad: ['Regulación de crisis', 'Red de apoyo', 'Seguridad vital'],
  tcc_activacion: ['Activación conductual', 'Regulación del ánimo', 'Rutinas funcionales'],
};

const MODULE_SEARCH_EXTRA = {
  tcc_abc: 'abc cognitivo activador creencias consecuencias',
  tcc_plan_seguridad: 'seguridad vital crisis suicidio estrés',
  tcc_activacion: 'activación conductual ánimo rutina',
  neurofeedback: 'muse eeg nf beta atención',
  bilateral_stimulation: 'emdr bilateral trauma bls',
  gad7: 'ansiedad gad tamizaje',
  asrs: 'tdah asrs who',
  pcl5: 'tept trauma pcl',
  dass21: 'depresión ansiedad estrés dass',
};

export function moduleSearchBlob(type, def, psych) {
  const handout = tccHandoutDef(type);
  const tags = handout?.searchTags || [];
  const chunks = [
    def?.label,
    def?.description,
    def?.category,
    psych?.authors,
    psych?.learnMore,
    MODULE_SEARCH_EXTRA[type],
    ...tags,
  ];
  return chunks.filter(Boolean).join(' ').toLowerCase();
}
