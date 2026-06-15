/** Plantillas de programa prearmadas — foco TDAH / trauma. */

export const TREATMENT_TEMPLATES = {
  tdah_adulto: {
    id: 'tdah_adulto',
    label: 'TDAH adulto',
    description:
      'Evaluación inicial (ASRS, GAD-7), seguimiento psicométrico, neurofeedback atención y escalas subjetivas.',
    sessions: [
      { label: 'Evaluación inicial', modules: ['asrs', 'gad7', 'diagnostico'] },
      { label: 'Perfil emocional', modules: ['dass21', 'tcc_preocupaciones', 'escala_fer'] },
      { label: 'TCC — flexibilidad y activación', modules: ['tcc_flexibilidad', 'tcc_activacion'] },
      { label: 'NF atención + ánimo', modules: ['neurofeedback', 'tcc_activacion', 'escala_animo'] },
      { label: 'Reevaluación', modules: ['asrs', 'gad7'] },
      { label: 'NF + cierre parcial', modules: ['neurofeedback', 'escala_animo'] },
    ],
  },
  trauma_regulacion: {
    id: 'trauma_regulacion',
    label: 'Trauma + regulación (adulto)',
    description:
      'Tamizaje trauma en dos sesiones (PCL-5 + SPRINT; luego IES-R), regulación con estimulación bilateral/NF. Añade A-DES manualmente si el paciente es adolescente.',
    sessions: [
      { label: 'Tamizaje trauma (1/2)', modules: ['pcl5', 'sprint_ecl'] },
      { label: 'Tamizaje trauma (2/2)', modules: ['iesr', 'diagnostico'] },
      { label: 'Plan de seguridad', modules: ['tcc_plan_seguridad'] },
      { label: 'Regulación + apoyo', modules: ['tcc_abc', 'bilateral_stimulation', 'neurofeedback', 'escala_ansiedad', 'redes_apoyo'] },
      { label: 'Seguimiento trauma', modules: ['iesr', 'sprint_ecl'] },
      { label: 'NF relajación', modules: ['neurofeedback', 'escala_ansiedad'] },
      { label: 'Reevaluación', modules: ['pcl5'] },
    ],
  },
};

export function listTreatmentTemplates() {
  return Object.values(TREATMENT_TEMPLATES);
}

export function getTreatmentTemplate(id) {
  return TREATMENT_TEMPLATES[id] || null;
}
