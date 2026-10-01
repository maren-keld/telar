/** Suggested practices from docs/mapa-habilidades-modulos.md; never evidence of mastery. */
const SKILL_DESCRIPTIONS = [
  "Observar situaciones, pensamientos, emociones y conductas para reconocer patrones propios.",
  "Reconocer y nombrar emociones, diferenciando sus señales y los contextos en que aparecen.",
  "Contrastar interpretaciones con la evidencia disponible y construir alternativas plausibles.",
  "Cambiar de perspectiva y ensayar respuestas distintas ante situaciones cotidianas.",
  "Distinguir lo posible de lo probable y estimar resultados con la información disponible.",
  "Elegir actividades significativas, organizarlas en pasos y comenzar a realizarlas.",
  "Atravesar situaciones difíciles y tolerar el malestar mientras se eligen acciones útiles.",
  "Reconocer impulsos emocionales y elegir una respuesta acorde con los propios objetivos.",
  "Considerar otras perspectivas y reconocer la experiencia propia y la de otras personas.",
  "Identificar apoyos disponibles, comunicar una necesidad y solicitar ayuda concreta.",
  "Reconocer señales de dificultad y preparar respuestas y apoyos para afrontarlas.",
  "Definir lo que se quiere lograr y traducirlo en pasos concretos y alcanzables.",
  "Identificar experiencias apreciadas y reconocer qué aporta valor a la vida cotidiana.",
  "Reconocer acciones, decisiones y capacidades propias que han ayudado ante dificultades.",
  "Comunicar necesidades y establecer límites de forma clara y respetuosa.",
  "Distinguir necesidades personales de exigencias aprendidas y revisar expectativas rígidas.",
  "Prestar atención a sensaciones corporales y poner en palabras su significado personal."
];

export const SKILL_LIBRARY = [
  ['Autoobservación y registro de patrones', ['tcc_abc', 'tcc_sesgos', 'tcc_preocupaciones', 'tcc_monitoreo_actividades', 'tcc_tdah_organizacion', 'dbt_diary_card']],
  ['Identificación emocional', ['tcc_registro_pensamientos', 'dbt_regulacion_emocional']],
  ['Evaluación de evidencia e interpretaciones alternativas', ['tcc_socratico', 'tcc_registro_pensamientos', 'tcc_experimento']],
  ['Flexibilidad cognitiva en situaciones cotidianas', ['tcc_flexibilidad', 'tcc_probabilidades', 'tcc_sesgos', 'tcc_experimento', 'dbt_camino_del_medio']],
  ['Estimación de probabilidades', ['tcc_probabilidades']],
  ['Planificación e inicio de actividades', ['tcc_activacion', 'tcc_monitoreo_actividades', 'tcc_tdah_organizacion', 'tcc_estres']],
  ['Afrontamiento del malestar', ['tcc_exposicion', 'tcc_estres']],
  ['Elección de respuestas ante emociones intensas', ['dbt_regulacion_emocional']],
  ['Toma de perspectiva y validación', ['dbt_camino_del_medio', 'tcc_socratico', 'sig_externalizacion']],
  ['Petición de ayuda y uso de apoyos', ['tcc_plan_seguridad', 'tcc_prevencion_recaida']],
  ['Reconocimiento de señales y planificación de respuestas', ['tcc_plan_seguridad', 'tcc_prevencion_recaida']],
  ['Formulación de metas y pasos concretos', ['tcc_autoconceptos', 'sig_pregunta_milagro']],
  ['Reconocimiento de experiencias valoradas', ['tcc_gratitud']],
  ['Exploración de recursos y acciones propias', ['sig_resultados_unicos']],
  ['Expresión de necesidades y límites', ['sig_carta_problema']],
  ['Reconocimiento de necesidades y autoexigencias', ['sig_condiciones_valia']],
  ['Descripción de la experiencia corporal sentida', ['sig_felt_sense']],
].map(([title, modules], index) => ({ title, modules, description: SKILL_DESCRIPTIONS[index] }));
// Línea de vida conserva su sentido narrativo, sin habilidad obligatoria.
