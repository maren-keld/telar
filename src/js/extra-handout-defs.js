/** 12 módulos de trabajo clínico (TCC de práctica + significado). */
export const EXTRA_HANDOUT_DEFS = {
  tcc_registro_pensamientos: {
    title: 'Registro de pensamientos',
    subtitle: 'Material TCC Telar — elaboración propia',
    category: 'tcc',
    oncePerTreatment: false,
    intro:
      'Registro de siete columnas para una situación concreta. Se puede repetir: cada hoja es un episodio, no un resumen de toda la semana.',
    sections: [
      {
        key: 'situacion',
        title: '1. Situación',
        hint: '¿Qué ocurrió, dónde, con quién? Hechos observables, no interpretaciones.',
        rows: 3,
      },
      {
        key: 'emocion',
        title: '2. Emoción',
        hint: 'Nombre la emoción (p. ej. ansiedad, rabia, vergüenza, tristeza).',
        rows: 2,
      },
      {
        key: 'intensidad',
        title: 'Intensidad de la emoción (0–100)',
        type: 'number',
        min: 0,
        max: 100,
      },
      {
        key: 'pensamiento',
        title: '3. Pensamiento automático',
        hint: 'La frase que pasó por la mente. Si hay varias, elija la más cargada.',
        rows: 3,
      },
      {
        key: 'evidencia_favor',
        title: '4. Evidencia a favor',
        hint: 'Hechos que apoyan ese pensamiento, no sensaciones ni “porque lo siento”.',
        rows: 3,
      },
      {
        key: 'evidencia_contra',
        title: '5. Evidencia en contra',
        hint: 'Hechos que no encajan, excepciones, lo que un testigo vería.',
        rows: 3,
      },
      {
        key: 'alternativo',
        title: '6. Pensamiento alternativo o equilibrado',
        hint: 'Una formulación que integre ambas evidencias, no un pensamiento “positivo”.',
        rows: 3,
      },
      {
        key: 'resultado_emocion',
        title: 'Intensidad de la emoción ahora (0–100)',
        type: 'number',
        min: 0,
        max: 100,
      },
      {
        key: 'resultado',
        title: '7. Resultado',
        hint: 'Qué cambió en el cuerpo, en lo que hizo o en lo que se cree ahora.',
        rows: 3,
      },
    ],
    variables: ['Pensamiento automático', 'Reestructuración cognitiva', 'Regulación emocional'],
    searchTags: ['tcc', 'registro', 'pensamientos', 'siete columnas', 'reestructuración'],
  },

  tcc_exposicion: {
    title: 'Jerarquía de exposición',
    subtitle: 'Habilidades y tareas Telar — elaboración propia',
    category: 'tcc',
    intro:
      'Lista ordenada de situaciones evitadas, de menor a mayor malestar (SUDS 0–100). Se usa para diseñar exposiciones graduales acordadas en sesión.',
    warning:
      'La exposición se planifica con el profesional. No use este módulo para trauma no procesado ni para ejercicios que no se hayan acordado.',
    activityGroups: [
      {
        title: 'Cómo puntuar SUDS',
        items: [
          '0 = nada de malestar; 50 = molesto pero manejable; 100 = el peor malestar imaginable.',
          'Puntúe la anticipación (antes de entrar), no solo “si ya estuviera en medio”.',
          'El primer paso suele estar entre 30 y 50: desafiante y todavía posible.',
        ],
      },
    ],
    sections: [
      {
        key: 'evitacion',
        title: 'Qué se está evitando',
        hint: 'Lugares, sensaciones, recuerdos, conversaciones, tareas.',
        rows: 3,
      },
      { key: 's1', title: '1. Más tolerable — situación', rows: 2 },
      { key: 'suds1', title: 'SUDS (0–100)', type: 'number', min: 0, max: 100 },
      { key: 's2', title: '2. Situación', rows: 2 },
      { key: 'suds2', title: 'SUDS (0–100)', type: 'number', min: 0, max: 100 },
      { key: 's3', title: '3. Situación', rows: 2 },
      { key: 'suds3', title: 'SUDS (0–100)', type: 'number', min: 0, max: 100 },
      { key: 's4', title: '4. Situación', rows: 2 },
      { key: 'suds4', title: 'SUDS (0–100)', type: 'number', min: 0, max: 100 },
      { key: 's5', title: '5. Situación', rows: 2 },
      { key: 'suds5', title: 'SUDS (0–100)', type: 'number', min: 0, max: 100 },
      { key: 's6', title: '6. Más temida — situación', rows: 2 },
      { key: 'suds6', title: 'SUDS (0–100)', type: 'number', min: 0, max: 100 },
      {
        key: 'primer_paso',
        title: 'Primera exposición acordada',
        hint: 'Qué, cuándo, cuánto dura, qué cuenta como completar, qué no se permite (p. ej. escapar a los 30 segundos).',
        rows: 4,
      },
    ],
    variables: ['Evitación', 'Exposición gradual', 'SUDS'],
    searchTags: ['tcc', 'exposición', 'suds', 'ansiedad', 'evitación', 'jerarquía'],
  },

  tcc_experimento: {
    title: 'Experimento conductual',
    subtitle: 'Habilidades y tareas Telar — elaboración propia',
    category: 'tcc',
    oncePerTreatment: false,
    intro:
      'Se pone a prueba una creencia en la vida real. No es “pensar distinto”: se diseña una acción, se predice el resultado y se compara con lo ocurrido.',
    sections: [
      {
        key: 'creencia',
        title: 'Creencia a poner a prueba',
        hint: 'Una frase específica (p. ej. “si digo que no, la otra persona se aleja”).',
        rows: 3,
      },
      {
        key: 'conviccion_antes',
        title: 'Cuánto la cree ahora (0–100)',
        type: 'number',
        min: 0,
        max: 100,
      },
      {
        key: 'prediccion',
        title: 'Predicción',
        hint: '¿Qué pasará, qué sentirá, qué hará la otra persona? Sea concreto.',
        rows: 3,
      },
      {
        key: 'experimento',
        title: 'El experimento',
        hint: 'Qué hará, cuándo, durante cuánto tiempo, cómo sabrá que lo hizo.',
        rows: 4,
      },
      {
        key: 'seguridad',
        title: 'Conductas de seguridad a suspender',
        hint: 'Lo que suele hacer para “no arriesgar” (ensayar frases, evitar el silencio, irse temprano).',
        rows: 3,
      },
      {
        key: 'resultado',
        title: 'Qué ocurrió realmente',
        hint: 'Hechos, no la interpretación inmediata.',
        rows: 4,
      },
      {
        key: 'aprendizaje',
        title: 'Qué aprendió / creencia ajustada',
        rows: 3,
      },
      {
        key: 'conviccion_despues',
        title: 'Cuánto cree ahora la creencia original (0–100)',
        type: 'number',
        min: 0,
        max: 100,
      },
    ],
    variables: ['Creencias', 'Experimentos conductuales', 'Aprendizaje experiencial'],
    searchTags: ['tcc', 'experimento', 'conductual', 'creencia', 'predicción'],
  },

  tcc_monitoreo_actividades: {
    title: 'Monitoreo semanal de actividades',
    subtitle: 'Material TCC Telar — elaboración propia',
    category: 'tcc',
    oncePerTreatment: false,
    intro:
      'Mapa de una semana: qué hizo y cómo se sintió. Sirve para ver el vínculo entre actividad y ánimo, y para planificar activación (no para “rendir más”).',
    sections: [
      {
        key: 'semana',
        title: 'Semana (fechas)',
        hint: 'P. ej. 12–18 agosto.',
        rows: 1,
      },
      { key: 'lunes', title: 'Lunes — actividades y ánimo (0–10)', rows: 3 },
      { key: 'martes', title: 'Martes — actividades y ánimo (0–10)', rows: 3 },
      { key: 'miercoles', title: 'Miércoles — actividades y ánimo (0–10)', rows: 3 },
      { key: 'jueves', title: 'Jueves — actividades y ánimo (0–10)', rows: 3 },
      { key: 'viernes', title: 'Viernes — actividades y ánimo (0–10)', rows: 3 },
      { key: 'sabado', title: 'Sábado — actividades y ánimo (0–10)', rows: 3 },
      { key: 'domingo', title: 'Domingo — actividades y ánimo (0–10)', rows: 3 },
      {
        key: 'patron',
        title: 'Qué patrón ve entre actividad y ánimo',
        rows: 3,
      },
      {
        key: 'proteger',
        title: 'Una actividad a proteger la próxima semana',
        hint: 'Pequeña, concreta, con día y hora si es posible.',
        rows: 2,
      },
    ],
    variables: ['Activación conductual', 'Monitoreo de actividades', 'Ánimo'],
    searchTags: ['tcc', 'actividades', 'ánimo', 'semana', 'monitoreo', 'depresión'],
  },

  tcc_prevencion_recaida: {
    title: 'Prevención de recaída',
    subtitle: 'Material TCC Telar — elaboración propia',
    category: 'tcc',
    intro:
      'Plan para cuando el avance se tambalea. Una recaída es un tropiezo, no el borrado del trabajo hecho. Se completa hacia el cierre o en un momento de alta.',
    sections: [
      {
        key: 'logros',
        title: 'Qué quiero mantener',
        hint: 'Cambios, rutinas, formas de hablarme, vínculos.',
        rows: 3,
      },
      {
        key: 'senales',
        title: 'Señales tempranas',
        hint: 'Sueño, aislamiento, rumiación, irritabilidad, dejar de hacer lo que ayudaba.',
        rows: 3,
      },
      {
        key: 'riesgo',
        title: 'Situaciones de alto riesgo',
        rows: 3,
      },
      {
        key: 'afrontamiento',
        title: 'Plan de afrontamiento (primeras 24–48 h)',
        hint: 'Qué hago, qué no hago, a quién aviso.',
        rows: 4,
      },
      {
        key: 'apoyo',
        title: 'Personas y recursos',
        hint: 'Nombres, cómo contactarlos, qué pedirles.',
        rows: 3,
      },
      {
        key: 'si_recaigo',
        title: 'Si ya recaí',
        hint: 'Un paso mínimo para volver (sesión extra, retomar una rutina, reabrir un handout).',
        rows: 3,
      },
    ],
    variables: ['Prevención de recaída', 'Señales tempranas', 'Plan de afrontamiento'],
    searchTags: ['tcc', 'recaída', 'cierre', 'prevención', 'alta'],
  },

  sig_externalizacion: {
    title: 'Externalización del problema',
    subtitle: 'Material de significado Telar — elaboración propia',
    category: 'significado',
    intro:
      'El problema se nombra como algo que actúa sobre la persona, no como lo que la persona “es”. Preguntas narrativas (White): qué hace el problema y qué posición toma usted.',
    sections: [
      {
        key: 'nombre',
        title: 'Nombre del problema',
        hint: 'Cómo lo llamaríamos si no fuera usted (p. ej. La Culpa, El Silencio, La Prisa).',
        rows: 2,
      },
      {
        key: 'como_actua',
        title: 'Cómo actúa el problema en su vida',
        hint: 'Qué dice, qué obliga, qué impide, en qué momentos aparece.',
        rows: 4,
      },
      {
        key: 'efectos',
        title: 'Efectos',
        hint: 'En el ánimo, el cuerpo, las relaciones, el trabajo, los proyectos.',
        rows: 4,
      },
      {
        key: 'posicion',
        title: 'Su posición',
        hint: '¿Está de acuerdo con lo que el problema le hace hacer? ¿En qué no?',
        rows: 3,
      },
      {
        key: 'resistente',
        title: 'Lo que el problema no ha podido tomar',
        hint: 'Valores, habilidades, relaciones, momentos en que usted hizo otra cosa.',
        rows: 3,
      },
      {
        key: 'paso',
        title: 'Un paso para tomar distancia',
        hint: 'Pequeño, concreto, de los próximos días.',
        rows: 3,
      },
    ],
    variables: ['Externalización', 'Identidad preferida', 'Posición personal'],
    searchTags: ['narrativa', 'externalización', 'white', 'problema', 'significado', 'constructivista'],
  },

  sig_resultados_unicos: {
    title: 'Resultados únicos',
    subtitle: 'Material de significado Telar — elaboración propia',
    category: 'significado',
    intro:
      'Momentos en que el problema no estuvo, o estuvo menos. No son “excepciones irrelevantes”: son evidencia de otra historia posible.',
    sections: [
      {
        key: 'momento',
        title: 'Un momento en que el problema no mandó',
        hint: 'Reciente si es posible. Qué pasaba, dónde, con quién.',
        rows: 4,
      },
      {
        key: 'distinto',
        title: 'Qué hizo distinto (aunque haya sido mínimo)',
        rows: 3,
      },
      {
        key: 'testigo',
        title: 'Quién lo notaría y qué vería',
        rows: 3,
      },
      {
        key: 'dice_de_ti',
        title: 'Qué dice eso de usted / de lo que le importa',
        rows: 3,
      },
      {
        key: 'mas',
        title: 'Cómo podría hacer un poco más de eso',
        rows: 3,
      },
    ],
    variables: ['Resultados únicos', 'Historia preferida', 'Agencia'],
    searchTags: ['narrativa', 'resultados únicos', 'excepciones', 'white', 'significado'],
  },

  sig_linea_vida: {
    title: 'Línea de vida / identidad preferida',
    subtitle: 'Material de significado Telar — elaboración propia',
    category: 'significado',
    intro:
      'Mapa de hitos, no una biografía completa. Distingue la historia que más se cuenta de la historia que quiere habitar.',
    sections: [
      {
        key: 'hitos',
        title: 'Hitos que me constituyeron',
        hint: 'Encuentros, pérdidas, decisiones, lugares. Unos pocos, no todos.',
        rows: 5,
      },
      {
        key: 'giros',
        title: 'Giros',
        hint: 'Momentos en que la historia podría haber tomado otro rumbo.',
        rows: 4,
      },
      {
        key: 'dominante',
        title: 'Historia dominante',
        hint: 'La que más se cuenta (propia o de otros) sobre quién es usted.',
        rows: 4,
      },
      {
        key: 'preferida',
        title: 'Historia preferida',
        hint: 'La que quiere habitar: valores, vínculos, oficios de sí.',
        rows: 4,
      },
      {
        key: 'testigos',
        title: 'Personas testigo de la historia preferida',
        rows: 3,
      },
      {
        key: 'capitulo',
        title: 'Próximo capítulo (pequeño)',
        rows: 3,
      },
    ],
    variables: ['Identidad narrativa', 'Historia preferida', 'Continuidad'],
    searchTags: ['constructivista', 'línea de vida', 'identidad', 'narrativa', 'significado'],
  },

  sig_carta_problema: {
    title: 'Carta al problema',
    subtitle: 'Material de significado Telar — elaboración propia',
    category: 'significado',
    intro:
      'Escribirle al problema (o a una parte, o a un yo anterior) para tomar posición. No es un ensayo: es una carta, con destinatario y tono propio.',
    sections: [
      {
        key: 'destinatario',
        title: 'Destinatario',
        hint: 'El problema, una parte, un yo de otra época.',
        rows: 2,
      },
      {
        key: 'quiero_que_sepas',
        title: 'Lo que quiero que sepas',
        rows: 5,
      },
      {
        key: 'ya_no',
        title: 'Lo que ya no acepto',
        rows: 4,
      },
      {
        key: 'agradezco',
        title: 'Si hay algo que agradezco (aunque duela)',
        hint: 'Opcional. A veces el problema también protegió.',
        rows: 3,
      },
      {
        key: 'sigue',
        title: 'Cómo sigue esta relación',
        rows: 3,
      },
    ],
    variables: ['Externalización', 'Posición personal', 'Escritura terapéutica'],
    searchTags: ['carta', 'narrativa', 'problema', 'escritura', 'significado'],
  },

  sig_condiciones_valia: {
    title: 'Condiciones de valía',
    subtitle: 'Material de significado Telar — elaboración propia',
    category: 'significado',
    intro:
      'Enfoque humanista (Rogers): cuándo aprendí que valía solo si cumplía ciertas condiciones, y cómo me trato hoy cuando no las cumplo.',
    sections: [
      {
        key: 'mensajes',
        title: 'Mensajes que recibí sobre cuándo era aceptable',
        hint: 'Familia, escuela, pareja, cultura. Frases o gestos.',
        rows: 4,
      },
      {
        key: 'hoy',
        title: 'Cómo me trato hoy cuando no cumplo eso',
        rows: 4,
      },
      {
        key: 'organismo',
        title: 'Lo que siento o necesito vs. lo que “debería”',
        hint: 'Experiencia actual frente al self ideal.',
        rows: 4,
      },
      {
        key: 'congruencia',
        title: 'Un momento de congruencia',
        hint: 'Cuando pude ser sin actuar el “debería”.',
        rows: 3,
      },
      {
        key: 'sin_condiciones',
        title: 'Qué necesitaría para valer sin esas condiciones',
        rows: 3,
      },
    ],
    variables: ['Condiciones de valía', 'Congruencia', 'Self ideal'],
    searchTags: ['humanista', 'rogers', 'valía', 'aceptación', 'congruencia', 'significado'],
  },

  sig_felt_sense: {
    title: 'Felt sense',
    subtitle: 'Material de significado Telar — elaboración propia',
    category: 'significado',
    oncePerTreatment: false,
    intro:
      'Focusing (Gendlin): una sensación corporal de “todo eso”, todavía no verbal. Registro de proceso en sesión; no es tarea. Se puede repetir: cada sesión puede tener un felt sense distinto.',
    activityGroups: [
      {
        title: 'Antes de escribir',
        items: [
          'Siéntese un momento. Note el cuerpo, sin resolver nada.',
          'Pregunte en silencio: «¿qué es todo esto, ahora?» Espere una sensación, no una explicación.',
          'Si aparece una palabra o imagen, compruebe si el cuerpo dice “sí” o se queda igual.',
        ],
      },
    ],
    sections: [
      {
        key: 'situacion',
        title: 'Situación o “algo” presente',
        hint: 'No hace falta el relato completo. Un título basta.',
        rows: 2,
      },
      {
        key: 'sensacion',
        title: 'Felt sense',
        hint: 'Dónde en el cuerpo, calidad (apretado, vago, caliente, hundido…).',
        rows: 3,
      },
      {
        key: 'handle',
        title: 'Asa (palabra, imagen, frase)',
        hint: 'Lo que nombra la sensación, no lo que la explica.',
        rows: 2,
      },
      {
        key: 'resuena',
        title: '¿Resuena?',
        hint: 'Al decir el asa, ¿el cuerpo se acomoda un poco, se cierra, o no cambia?',
        rows: 3,
      },
      {
        key: 'preguntar',
        title: 'Preguntar a la sensación',
        hint: '¿Qué necesita? ¿Hacia dónde se mueve? ¿Qué haría falta para que se alivie un milímetro?',
        rows: 3,
      },
      {
        key: 'recibir',
        title: 'Recibir',
        hint: 'Qué cambió, aunque sea poco. No fuerce un insight.',
        rows: 3,
      },
    ],
    variables: ['Felt sense', 'Focusing', 'Conciencia corporal'],
    searchTags: ['humanista', 'gendlin', 'focusing', 'felt sense', 'cuerpo', 'significado'],
  },

  sig_pregunta_milagro: {
    title: 'Pregunta milagro y excepciones',
    subtitle: 'Material de significado Telar — elaboración propia',
    category: 'significado',
    intro:
      'Enfoque centrado en soluciones (de Shazer): si el problema no estuviera, ¿qué sería distinto? Luego se buscan excepciones que ya ocurrieron.',
    sections: [
      {
        key: 'milagro',
        title: 'El milagro',
        hint: 'Mientras duerme, ocurre un milagro y el problema ya no está. Al despertar, ¿qué es lo primero que nota?',
        rows: 4,
      },
      {
        key: 'senales',
        title: 'Otras señales ese día',
        hint: 'En el cuerpo, en casa, en el trabajo, en cómo habla.',
        rows: 3,
      },
      {
        key: 'otros',
        title: 'Quién más lo notaría y cómo',
        rows: 3,
      },
      {
        key: 'excepciones',
        title: 'Excepciones ya ocurridas',
        hint: 'Momentos en que ya fue un poco así, aunque el milagro “no haya llegado”.',
        rows: 4,
      },
      {
        key: 'escala',
        title: 'Hoy, en una escala 0–10 (0 = peor; 10 = el día después del milagro)',
        type: 'number',
        min: 0,
        max: 10,
      },
      {
        key: 'paso',
        title: 'Un paso hacia +1',
        hint: 'Pequeño, observable esta semana.',
        rows: 3,
      },
    ],
    variables: ['Pregunta milagro', 'Excepciones', 'Escalamiento'],
    searchTags: [
      'soluciones',
      'milagro',
      'de shazer',
      'excepciones',
      'significado',
      'constructivista',
    ],
  },
};
