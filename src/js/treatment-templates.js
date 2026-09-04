/** Plantillas de programa — motor delega a pack-registry; fallback legacy embebido. */
import { listPrograms, getProgram as getPackProgram } from './pack-registry.js';

/** Fallback si ningún pack cargó programas (dev sin packs / transición). */
const LEGACY_TREATMENT_TEMPLATES = {
  tdah_8: {
    id: 'tdah_8',
    label: 'TDAH adulto (8 sesiones)',
    description:
      'Programa base: ASRS/GAD-7, TCC (organización, activación, sesgos), redes y reevaluación. Sin neurofeedback.',
    featured: true,
    sessions: [
      { label: 'Evaluación inicial', modules: ['asrs', 'gad7', 'diagnostico'] },
      { label: 'Perfil y redes', modules: ['dass21', 'redes_apoyo', 'escala_fer'] },
      { label: 'Organización cognitiva', modules: ['tcc_flexibilidad', 'tcc_abc', 'escala_ansiedad'] },
      { label: 'Activación y rutinas', modules: ['tcc_activacion', 'tcc_estres', 'escala_animo'] },
      { label: 'Pensamientos y sesgos', modules: ['tcc_socratico', 'tcc_sesgos', 'tcc_preocupaciones'] },
      { label: 'Autoconcepto', modules: ['tcc_autoconceptos', 'rosenberg', 'tcc_gratitud'] },
      { label: 'Probabilidades y seguimiento', modules: ['tcc_probabilidades', 'asrs', 'escala_animo'] },
      { label: 'Reevaluación y cierre', modules: ['asrs', 'gad7', 'qols', 'escala_animo'] },
    ],
  },
  tdah_nf_8: {
    id: 'tdah_nf_8',
    label: 'TDAH + Neurofeedback (8 sesiones)',
    description:
      'Misma estructura de 8 sesiones con Muse intercalado (atención/regulación) junto a escalas y TCC.',
    featured: true,
    sessions: [
      { label: 'Evaluación inicial', modules: ['asrs', 'gad7', 'diagnostico'] },
      { label: 'Baseline NF + perfil', modules: ['neurofeedback', 'dass21', 'escala_ansiedad'] },
      { label: 'Organización cognitiva', modules: ['tcc_flexibilidad', 'tcc_abc', 'redes_apoyo'] },
      { label: 'NF atención + activación', modules: ['neurofeedback', 'tcc_activacion', 'escala_animo'] },
      { label: 'Pensamientos y sesgos', modules: ['tcc_socratico', 'tcc_sesgos', 'tcc_preocupaciones'] },
      { label: 'NF + estrés', modules: ['neurofeedback', 'tcc_estres', 'escala_ansiedad'] },
      { label: 'Autoconcepto + NF', modules: ['neurofeedback', 'tcc_autoconceptos', 'rosenberg'] },
      { label: 'Reevaluación y cierre', modules: ['asrs', 'gad7', 'neurofeedback', 'qols'] },
    ],
  },
  trauma_regulacion: {
    id: 'trauma_regulacion',
    label: 'Trauma + regulación (adulto)',
    description:
      'Tamizaje trauma (PCL-5), plan de seguridad, regulación bilateral/NF. Añade A-DES manualmente si el paciente es adolescente.',
    featured: false,
    sessions: [
      { label: 'Tamizaje trauma', modules: ['pcl5', 'diagnostico'] },
      { label: 'Plan de seguridad', modules: ['tcc_plan_seguridad'] },
      {
        label: 'Regulación + apoyo',
        modules: ['tcc_abc', 'bilateral_stimulation', 'neurofeedback', 'escala_ansiedad', 'redes_apoyo'],
      },
      { label: 'Seguimiento trauma', modules: ['pcl5', 'escala_ansiedad'] },
      { label: 'NF relajación', modules: ['neurofeedback', 'escala_ansiedad'] },
      { label: 'Reevaluación', modules: ['pcl5'] },
    ],
  },
};

export function listTreatmentTemplates() {
  const fromPacks = listPrograms();
  if (fromPacks.length) return fromPacks;
  return Object.values(LEGACY_TREATMENT_TEMPLATES).sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return a.label.localeCompare(b.label, 'es');
  });
}

export function getTreatmentTemplate(id) {
  const fromPack = getPackProgram(id);
  if (fromPack) return fromPack;
  return LEGACY_TREATMENT_TEMPLATES[id] || null;
}

/** @deprecated — usar listTreatmentTemplates() */
export const TREATMENT_TEMPLATES = LEGACY_TREATMENT_TEMPLATES;
