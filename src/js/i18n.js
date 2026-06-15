import { loadProfile, saveProfile } from './profile.js';

const STRINGS = {
  es: {
    'nav.agenda': 'Agenda',
    'nav.reportes': 'Estadísticas',
    'nav.goals': 'Objetivos',
    'nav.modules': 'Módulos',
    'nav.settings': 'Ajustes',
    'nav.help': 'Ayuda',
    'settings.title': 'Ajustes',
    'settings.name': 'Nombre',
    'settings.email': 'Correo electrónico',
    'settings.phone': 'Celular',
    'settings.address': 'Dirección de atención',
    'settings.darkMode': 'Modo oscuro',
    'settings.language': 'Idioma',
    'settings.languageSub': 'Interfaz de la aplicación',
    'settings.lang.es': 'Español',
    'settings.lang.en': 'English',
    'settings.presentationMode': 'Modo presentación',
    'settings.presentationOn': 'Activo: datos sensibles ocultos en la app',
    'settings.presentationOff': 'Oculta nombre, RUT, teléfono y correo hasta desactivarlo',
    'settings.lock': 'Bloquear app',
    'settings.lockSub': 'Requerir PIN o Touch ID al abrir',
    'settings.touchId': 'Desbloquear con Touch ID',
    'settings.touchIdOn': 'Activo en este Mac (desbloquea con huella tras configurar PIN)',
    'settings.touchIdOff': 'Usar huella en lugar del PIN cuando esté configurado',
    'settings.touchIdLinux': 'No disponible para Linux todavía',
    'settings.privacyTitle': 'Privacidad y datos',
    'settings.privacyHint': 'Tus datos están solo en este dispositivo. Puedes exportarlos o borrarlos por completo.',
    'settings.usagePing': 'Contador anónimo de uso',
    'settings.usagePingOn': 'Activo (predeterminado) — solo versión de app 1×/día; anónimo, sin IP ni datos clínicos',
    'settings.usagePingOff': 'Desactivado — no se envía ningún ping',
    'settings.usagePingEnabled': 'Contador anónimo activado',
    'settings.usagePingDisabled': 'Contador anónimo desactivado',
    'settings.backup': 'Respaldar base de datos',
    'settings.backupSub': 'Copia telar.enc.db cifrada a Documentos/Telar/respaldos',
    'settings.export': 'Descargar mis datos',
    'settings.exportSub': 'Exportar pacientes, sesiones y perfil en CSV (carpeta en Documentos)',
    'settings.wipe': 'Eliminar todos mis datos',
    'settings.wipeSub': 'Borra pacientes, tratamientos, notas y perfil. No se puede deshacer',
    'settings.version': 'Versión',
    'settings.chooseLanguage': 'Elegir idioma',
    'settings.cancel': 'Cancelar',
    'workspace.session': 'Sesión',
    'workspace.addSession': '+ Agregar sesión',
    'workspace.addModule': '+ Agregar módulo',
    'workspace.exportProgram': 'Exportar programa',
    'workspace.backAgenda': 'Volver a agenda',
    'workspace.noModules': 'Sin módulos',
    'module.gad7.label': 'GAD-7 — Ansiedad generalizada',
    'gad7.title': 'GAD-7 — Ansiedad generalizada',
    'gad7.subtitle': '7 ítems · escala 0–3 · últimas 2 semanas · una vez por sesión.',
    'gad7.progress': 'Ítems respondidos',
    'gad7.total': 'Puntuación total',
    'gad7.item': 'Ítem',
    'gad7.response': 'Respuesta',
    'gad7.opt0': 'Para nada',
    'gad7.opt1': 'Varios días',
    'gad7.opt2': 'Más de la mitad de los días',
    'gad7.opt3': 'Casi todos los días',
    'gad7.q1': 'Sentirse nervioso/a, ansioso/a o con los nervios de punta',
    'gad7.q2': 'No poder dejar de preocuparse o no poder controlar la preocupación',
    'gad7.q3': 'Preocuparse demasiado por diferentes cosas',
    'gad7.q4': 'Dificultad para relajarse',
    'gad7.q5': 'Estar tan inquieto/a que es difícil quedarse quieto/a',
    'gad7.q6': 'Molestarse o irritarse fácilmente',
    'gad7.q7': 'Sentir miedo como si algo horrible fuera a suceder',
    'gad7.band.minimal': 'Ansiedad mínima',
    'gad7.band.mild': 'Ansiedad leve',
    'gad7.band.moderate': 'Ansiedad moderada',
    'gad7.band.severe': 'Ansiedad severa',
    'gad7.note':
      'Tamizaje de trastorno de ansiedad generalizada (Spitzer et al., 2006). No sustituye evaluación clínica integral.',
    'module.asrs.label': 'ASRS v1.1 — TDAH en adultos',
    'asrs.title': 'ASRS v1.1 — TDAH en adultos',
    'asrs.subtitle': '18 ítems · escala 0–4 · últimos 6 meses · tamizaje WHO (Parte A).',
    'asrs.progress': 'Ítems respondidos',
    'asrs.partA': 'Parte A (tamizaje)',
    'asrs.total': 'Suma total',
    'asrs.totalMax': 'máx. 72',
    'asrs.item': 'Ítem',
    'asrs.response': 'Respuesta',
    'asrs.sectionA': 'Parte A — Tamizaje (ítems 1–6)',
    'asrs.sectionB': 'Parte B — Síntomas adicionales (ítems 7–18)',
    'asrs.opt0': 'Nunca',
    'asrs.opt1': 'Raramente',
    'asrs.opt2': 'A veces',
    'asrs.opt3': 'A menudo',
    'asrs.opt4': 'Muy a menudo',
    'asrs.q1':
      '¿Con qué frecuencia tienes dificultad para terminar los últimos detalles de un proyecto, una vez que los más difíciles ya están completos?',
    'asrs.q2':
      '¿Con qué frecuencia tienes dificultad para poner las cosas en orden cuando tienes que hacer una tarea que requiere organización?',
    'asrs.q3': '¿Con qué frecuencia tienes problemas para recordar citas y obligaciones?',
    'asrs.q4':
      'Cuando tienes una tarea que requiere mucha concentración, ¿con qué frecuencia evitas o retrasas comenzarla?',
    'asrs.q5':
      '¿Con qué frecuencia te mueves inquieto/a o te retuerces las manos o los pies cuando tienes que estar sentado/a por mucho tiempo?',
    'asrs.q6':
      '¿Con qué frecuencia te sientes demasiado activo/a y te sientes impulsado/a a hacer cosas, como si estuvieras accionado/a por un motor?',
    'asrs.q7':
      '¿Con qué frecuencia cometes errores de descuido cuando tienes que trabajar en un proyecto aburrido o difícil?',
    'asrs.q8':
      '¿Con qué frecuencia tienes dificultad para mantener la atención cuando haces un trabajo aburrido o repetitivo?',
    'asrs.q9':
      '¿Con qué frecuencia tienes dificultad para concentrarte en lo que la gente te dice, incluso cuando te hablan directamente?',
    'asrs.q10':
      '¿Con qué frecuencia pierdes cosas o tienes dificultad para encontrarlas en casa o en el trabajo?',
    'asrs.q11': '¿Con qué frecuencia te distraes con la actividad o ruido a tu alrededor?',
    'asrs.q12':
      '¿Con qué frecuencia te levantas de tu asiento en reuniones u otras situaciones en las que se espera que permanezcas sentado/a?',
    'asrs.q13': '¿Con qué frecuencia te sientes inquieto/a o agitado/a?',
    'asrs.q14':
      '¿Con qué frecuencia tienes dificultad para relajarte y desconectar cuando tienes tiempo para ti mismo/a?',
    'asrs.q15':
      '¿Con qué frecuencia te das cuenta de que hablas demasiado cuando estás en situaciones sociales?',
    'asrs.q16':
      'Cuando estás en una conversación, ¿con qué frecuencia terminas las frases de las personas con las que hablas, antes de que ellas terminen?',
    'asrs.q17':
      '¿Con qué frecuencia tienes dificultad para esperar tu turno en situaciones en las que hay que hacerlo?',
    'asrs.q18': '¿Con qué frecuencia interrumpes a los demás cuando están ocupados?',
    'asrs.note':
      'Adult ADHD Self-Report Scale (Kessler et al., WHO). Parte A ≥4 síntomas positivos sugiere tamizaje consistente con TDAH. No sustituye evaluación clínica.',
    'toast.saved': 'Guardado',
    'toast.langChanged': 'Idioma actualizado',
  },
  en: {
    'nav.agenda': 'Schedule',
    'nav.reportes': 'Statistics',
    'nav.goals': 'Goals',
    'nav.modules': 'Modules',
    'nav.settings': 'Settings',
    'nav.help': 'Help',
    'settings.title': 'Settings',
    'settings.name': 'Name',
    'settings.email': 'Email',
    'settings.phone': 'Phone',
    'settings.address': 'Practice address',
    'settings.darkMode': 'Dark mode',
    'settings.language': 'Language',
    'settings.languageSub': 'Application interface',
    'settings.lang.es': 'Español',
    'settings.lang.en': 'English',
    'settings.presentationMode': 'Presentation mode',
    'settings.presentationOn': 'On: sensitive data hidden in the app',
    'settings.presentationOff': 'Hide name, ID, phone and email until turned off',
    'settings.lock': 'Lock app',
    'settings.lockSub': 'Require PIN or Touch ID on launch',
    'settings.touchId': 'Unlock with Touch ID',
    'settings.touchIdOn': 'Active on this Mac (unlock with fingerprint after PIN setup)',
    'settings.touchIdOff': 'Use fingerprint instead of PIN when configured',
    'settings.touchIdLinux': 'Not available on Linux yet',
    'settings.privacyTitle': 'Privacy & data',
    'settings.privacyHint': 'Your data stays on this device only. You can export or delete it entirely.',
    'settings.usagePing': 'Anonymous usage counter',
    'settings.usagePingOn': 'On by default — app version once/day only; anonymous, no IP or clinical data',
    'settings.usagePingOff': 'Off — no ping sent',
    'settings.usagePingEnabled': 'Anonymous counter enabled',
    'settings.usagePingDisabled': 'Anonymous counter disabled',
    'settings.backup': 'Back up database',
    'settings.backupSub': 'Copy encrypted telar.enc.db to Documents/Telar/backups',
    'settings.export': 'Download my data',
    'settings.exportSub': 'Export patients, sessions and profile as CSV (Documents folder)',
    'settings.wipe': 'Delete all my data',
    'settings.wipeSub': 'Erases patients, treatments, notes and profile. Cannot be undone',
    'settings.version': 'Version',
    'settings.chooseLanguage': 'Choose language',
    'settings.cancel': 'Cancel',
    'workspace.session': 'Session',
    'workspace.addSession': '+ Add session',
    'workspace.addModule': '+ Add module',
    'workspace.exportProgram': 'Export program',
    'workspace.backAgenda': 'Back to schedule',
    'workspace.noModules': 'No modules',
    'module.gad7.label': 'GAD-7 — Generalized anxiety',
    'gad7.title': 'GAD-7 — Generalized anxiety',
    'gad7.subtitle': '7 items · 0–3 scale · past 2 weeks · once per session.',
    'gad7.progress': 'Items answered',
    'gad7.total': 'Total score',
    'gad7.item': 'Item',
    'gad7.response': 'Response',
    'gad7.opt0': 'Not at all',
    'gad7.opt1': 'Several days',
    'gad7.opt2': 'More than half the days',
    'gad7.opt3': 'Nearly every day',
    'gad7.q1': 'Feeling nervous, anxious, or on edge',
    'gad7.q2': 'Not being able to stop or control worrying',
    'gad7.q3': 'Worrying too much about different things',
    'gad7.q4': 'Trouble relaxing',
    'gad7.q5': 'Being so restless that it is hard to sit still',
    'gad7.q6': 'Becoming easily annoyed or irritable',
    'gad7.q7': 'Feeling afraid as if something awful might happen',
    'gad7.band.minimal': 'Minimal anxiety',
    'gad7.band.mild': 'Mild anxiety',
    'gad7.band.moderate': 'Moderate anxiety',
    'gad7.band.severe': 'Severe anxiety',
    'gad7.note':
      'Screening for generalized anxiety disorder (Spitzer et al., 2006). Not a substitute for full clinical evaluation.',
    'module.asrs.label': 'ASRS v1.1 — Adult ADHD',
    'asrs.title': 'ASRS v1.1 — Adult ADHD',
    'asrs.subtitle': '18 items · 0–4 scale · past 6 months · WHO screening (Part A).',
    'asrs.progress': 'Items answered',
    'asrs.partA': 'Part A (screening)',
    'asrs.total': 'Total sum',
    'asrs.totalMax': 'max. 72',
    'asrs.item': 'Item',
    'asrs.response': 'Response',
    'asrs.sectionA': 'Part A — Screening (items 1–6)',
    'asrs.sectionB': 'Part B — Additional symptoms (items 7–18)',
    'asrs.opt0': 'Never',
    'asrs.opt1': 'Rarely',
    'asrs.opt2': 'Sometimes',
    'asrs.opt3': 'Often',
    'asrs.opt4': 'Very often',
    'asrs.q1':
      'How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?',
    'asrs.q2':
      'How often do you have difficulty getting things in order when you have to do a task that requires organization?',
    'asrs.q3': 'How often do you have problems remembering appointments or obligations?',
    'asrs.q4':
      'When you have a task that requires a lot of thought, how often do you avoid or delay getting started?',
    'asrs.q5':
      'How often do you fidget or squirm when you have to sit down for a long time?',
    'asrs.q6':
      'How often do you feel overly active and compelled to do things, like you were driven by a motor?',
    'asrs.q7':
      'How often do you make careless mistakes when you have to work on a boring or difficult project?',
    'asrs.q8':
      'How often do you have difficulty keeping your attention when you are doing boring or repetitive work?',
    'asrs.q9':
      'How often do you have difficulty concentrating on what people say to you, even when they are speaking to you directly?',
    'asrs.q10':
      'How often do you misplace or have difficulty finding things at home or at work?',
    'asrs.q11': 'How often are you distracted by activity or noise around you?',
    'asrs.q12':
      'How often do you leave your seat in meetings or other situations in which you are expected to remain seated?',
    'asrs.q13': 'How often do you feel restless or fidgety?',
    'asrs.q14':
      'How often do you have difficulty unwinding and relaxing when you have time to yourself?',
    'asrs.q15':
      'How often do you find yourself talking too much when you are in social situations?',
    'asrs.q16':
      'When you are in a conversation, how often do you find yourself finishing the sentences of the people you are talking to?',
    'asrs.q17':
      'How often do you have difficulty waiting your turn in situations when turn taking is required?',
    'asrs.q18': 'How often do you interrupt others when they are busy?',
    'asrs.note':
      'Adult ADHD Self-Report Scale (Kessler et al., WHO). Part A ≥4 positive symptoms suggests ADHD-consistent screening. Not a substitute for clinical evaluation.',
    'toast.saved': 'Saved',
    'toast.langChanged': 'Language updated',
  },
};

let currentLocale = 'es';

export function getLocale() {
  return currentLocale;
}

export function localeLabel(code) {
  return t(`settings.lang.${code}`, code === 'es' ? 'Español' : 'English');
}

export function t(key, fallback = '') {
  const table = STRINGS[currentLocale] || STRINGS.es;
  return table[key] ?? STRINGS.es[key] ?? fallback ?? key;
}

export function applyLocale(locale) {
  const next = locale === 'en' ? 'en' : 'es';
  currentLocale = next;
  document.documentElement.lang = next;
}

export function initLocaleFromProfile() {
  const profile = loadProfile();
  applyLocale(profile.locale || 'es');
}

export function setLocale(locale) {
  const next = locale === 'en' ? 'en' : 'es';
  saveProfile({ locale: next });
  applyLocale(next);
  return next;
}

export function moduleLabelI18n(type, fallback) {
  return t(`module.${type}.label`, fallback);
}
