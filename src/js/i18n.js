import { loadProfile, saveProfile } from './profile.js';

const STRINGS = {
  es: {
    'nav.agenda': 'Agenda',
    'nav.treatments': 'Tratamientos',
    'nav.reportes': 'Estadísticas',
    'nav.goals': 'Objetivos',
    'nav.modules': 'Módulos',
    'nav.settings': 'Ajustes',
    'nav.help': 'Ayuda',
    'settings.title': 'Ajustes',
    'settings.name': 'Nombre',
    'settings.gender': 'Género',
    'settings.genderSub': 'Cómo te trata al redactar emails',
    'settings.genderM': 'Masculino',
    'settings.genderF': 'Femenino',
    'settings.genderUnset': 'No especificar',
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
    'settings.fileVaultHint':
      'Cifra el disco del computador (FileVault en Mac, BitLocker en Windows). Si se pierde o se roba, nadie puede leer la ficha, Touch ID ni los respaldos en el disco.',
    'settings.privacyTitle': 'Privacidad y datos',
    'settings.privacyHint': 'Tus datos están solo en este dispositivo. Puedes exportarlos o borrarlos por completo.',
    'settings.encrypted': 'Cifrado en este dispositivo',
    'settings.encryptedSub':
      'La ficha clínica se guarda cifrada en tu equipo. Se abre con tu PIN o Touch ID; sin esa clave nadie puede leerla. Siempre activo.',
    'settings.usagePing': 'Contador anónimo de uso',
    'settings.usagePingOn': 'Activo (predeterminado) — solo versión de app 1×/día; anónimo, sin IP ni datos clínicos',
    'settings.usagePingOff': 'Desactivado — no se envía ningún ping',
    'settings.usagePingEnabled': 'Contador anónimo activado',
    'settings.usagePingDisabled': 'Contador anónimo desactivado',
    'settings.cloudBackup': 'Respaldo automático',
    'settings.cloudBackupPro': 'Plan Profesional — cifrado end-to-end en la carpeta que elijas',
    'settings.cloudBackupNotConfigured': 'Activa el interruptor para elegir carpeta y crear la primera copia',
    'settings.cloudBackupDisabled': 'Desactivado — no se crean respaldos automáticos',
    'settings.cloudBackupTurnedOn': 'Respaldo automático activado',
    'settings.cloudBackupTurnedOff': 'Respaldo automático desactivado',
    'settings.cloudBackupManage': 'Gestionar',
    'settings.cloudBackupBackingUp': 'Respaldando…',
    'settings.cloudBackupFolderMissing': 'Carpeta no accesible — usa Gestionar para elegir otra',
    'settings.cloudBackupActive': 'Último respaldo: {when} · {size}',
    'settings.cloudBackupActivePath': '{path} · archivos telar-respaldo-*.age (cifrados, visibles en Finder)',
    'settings.cloudBackupActiveDetail': '{path} · {file} · {when} · {size}',
    'settings.cloudBackupActiveEmpty': 'Activo — aún sin archivos .age en la carpeta',
    'settings.cloudBackupDesktopOnly': 'Disponible solo en la app de escritorio (Plan Pro)',
    'settings.cloudBackupHowItWorks': '¿Cómo funciona?',
    'settings.cloudBackupNow': 'Respaldar ahora',
    'settings.cloudBackupRestoreFromFile': 'Restaurar desde archivo…',
    'settings.cloudBackupChangeFolder': 'Cambiar carpeta',
    'settings.cloudBackupPickFolder': 'Elige la carpeta de respaldo (Drive, Dropbox, iCloud…)',
    'settings.cloudBackupNotSyncedTitle': 'Esta carpeta no sale de tu computador',
    'settings.cloudBackupNotSyncedMessage':
      'La carpeta que elegiste no se sincroniza con ninguna nube: los respaldos quedarán en este mismo disco. Si el computador falla o se pierde, también se pierden las copias.\n\nPara que salgan del computador, elige una carpeta dentro de Google Drive, Dropbox, OneDrive o iCloud.',
    'settings.cloudBackupNotSyncedPickOther': 'Elegir otra carpeta',
    'settings.cloudBackupNotSyncedUseAnyway': 'Usar esta igual',
    'settings.cloudBackupLocalOnlyWarn': 'Carpeta local — los respaldos no salen de este computador',
    'settings.cloudBackupPickRestore': 'Elige un archivo telar-respaldo-.age',
    'settings.cloudBackupFolderRequired': 'Debes elegir una carpeta de respaldo.',
    'settings.cloudBackupFolderUpdated': 'Carpeta de respaldo actualizada.',
    'settings.cloudBackupNeedKeyConfirm': 'Debes confirmar que guardaste la clave de recuperación.',
    'settings.cloudBackupFirstOk': 'Respaldo activado y primera copia guardada.',
    'settings.cloudBackupOk': 'Respaldo guardado en tu carpeta.',
    'settings.cloudBackupNoChanges': 'Sin cambios desde el último respaldo.',
    'settings.cloudBackupGotIt': 'Entendido',
    'settings.cloudBackupInfoTitle': 'Respaldo automático',
    'settings.cloudBackupInfoWhatTitle': 'Qué hace.',
    'settings.cloudBackupInfoWhat':
      'Cada día, Telar guarda una copia cifrada de tu consultorio en una carpeta de tu computador que tú eliges. En ella verás archivos telar-respaldo-YYYY-MM-DD.age — texto ilegible sin tu clave. Telar conserva las 7 copias más recientes. Si pierdes el computador, instalas Telar en uno nuevo y restauras todo.',
    'settings.cloudBackupInfoWhereTitle': 'Telar no guarda nada en internet.',
    'settings.cloudBackupInfoWhere':
      'La copia se escribe en tu disco, no en servidores de Telar. Si eliges una carpeta de Google Drive, Dropbox, OneDrive o iCloud, tu propia nube la sincroniza y así el respaldo sobrevive a un computador perdido o robado. Si eliges cualquier otra carpeta, las copias no salen de este equipo.',
    'settings.cloudBackupInfoPrivacyTitle': 'Nadie más puede leerlo.',
    'settings.cloudBackupInfoPrivacy':
      'La copia se cifra con age antes de salir de Telar. En la carpeta —y en tu nube, si la sincronizas— solo queda ese archivo .age indescifrable. Ni Telar, ni Google, ni Dropbox pueden abrirlo. Cifra también el disco del computador (FileVault en Mac, BitLocker en Windows): así la clave que Telar guarda en el equipo no queda a la vista.',
    'settings.cloudBackupInfoKeyTitle': 'Tu clave de recuperación.',
    'settings.cloudBackupInfoKey':
      'Al activarlo te entregamos una clave única. Es la única forma de abrir tus respaldos. Guárdala fuera del computador — impresa, o en tu gestor de contraseñas.',
    'settings.cloudBackupInfoWarn':
      'Si pierdes esa clave, los respaldos no se pueden recuperar. No hay forma de reponerla: esa es exactamente la razón por la que nadie más puede leer tus datos.',
    'settings.cloudBackupInfoExportNote':
      'Esto no reemplaza exportar tus datos. El respaldo sirve para restaurar Telar. Si quieres tus datos en Excel o PDF, usa Exportar mis datos.',
    'settings.cloudBackupRecoverySheet': 'Clave de recuperación',
    'settings.cloudBackupRecoveryTitle': 'Guarda tu clave de recuperación',
    'settings.cloudBackupRecoveryIntro':
      'Esta clave se muestra una sola vez. Es la única forma de abrir tus respaldos si cambias de computador.',
    'settings.cloudBackupCopyKey': 'Copiar clave',
    'settings.cloudBackupDownloadKey': 'Descargar .txt',
    'settings.cloudBackupPrintPdf': 'Hoja de recuperación (PDF)',
    'settings.cloudBackupPdfReady': 'PDF guardado en Documentos/Telar/exportaciones',
    'settings.cloudBackupPdfFailed': 'No se pudo generar el PDF',
    'settings.cloudBackupRecoveryPdfTitle': 'Telar — Hoja de recuperacion',
    'settings.cloudBackupRecoveryPdfSubtitle': 'Clave de recuperacion del respaldo automatico',
    'settings.cloudBackupRecoveryPdfIntro':
      'Guarde este documento fuera de su computador. Sin esta clave no podra abrir sus archivos telar-respaldo-.age en un equipo nuevo.',
    'settings.cloudBackupRecoveryPdfRage':
      'Descifrado independiente: puede usar la herramienta open-source «rage» (formato age) para abrir sus respaldos aunque Telar deje de existir.',
    'settings.cloudBackupRecoveryPdfWarn':
      'ATENCION: Si pierde esta clave, los respaldos NO se pueden recuperar. Telar no puede reponerla.',
    'settings.cloudBackupRecoveryPdfSteps':
      'Pasos para restaurar: instale Telar, elija Restaurar desde archivo, seleccione su .age e ingrese esta clave cuando se solicite.',
    'settings.cloudBackupRecoveryPdfGenerated': 'Generado',
    'settings.cloudBackupRecoveryAck': 'Guardé la clave en un lugar seguro fuera de este computador',
    'settings.cloudBackupContinue': 'Continuar',
    'settings.cloudBackupCopied': 'Clave copiada al portapapeles',
    'settings.cloudBackupCopyFailed': 'No se pudo copiar — selecciona y copia manualmente',
    'settings.cloudBackupRestoreTitle': '¿Restaurar respaldo?',
    'settings.cloudBackupRestoreConfirm':
      'Tienes {localPatients} paciente(s) en este Telar. El respaldo del {backupDate} contiene {backupPatients} paciente(s). Se creará un respaldo local automático antes de sobrescribir.',
    'settings.cloudBackupRestoreAction': 'Restaurar',
    'settings.cloudBackupRestorePin': 'Ingresa tu PIN para instalar el respaldo',
    'settings.cloudBackupRestoreOk': 'Respaldo restaurado. Tus datos están listos.',
    'settings.cloudBackupRecoveryPromptTitle': 'Clave de recuperación',
    'settings.cloudBackupRecoveryPrompt':
      'Pega la clave AGE-SECRET-KEY-… que guardaste al activar el respaldo (o la que descargaste en .txt/PDF).',
    'settings.cloudBackupForgotKey': 'Olvidé mi clave',
    'settings.cloudBackupForgotTitle': '¿Empezar de cero?',
    'settings.cloudBackupForgotMessage':
      'Sin esa clave no se pueden abrir los archivos telar-respaldo-.age que ya están en iCloud u otra carpeta.\n\nTelar va a generar una clave nueva y a seguir respaldando este consultorio. Los .age viejos se pueden dejar ahí por si encuentras la clave después, pero no se podrán restaurar. Telar conserva las 7 copias más recientes: con el tiempo las antiguas se irán reemplazando.',
    'settings.cloudBackupForgotConfirm': 'Empezar de cero',
    'settings.export': 'Descargar mis datos',
    'settings.exportSub': 'Exportar pacientes, sesiones y perfil en CSV (carpeta en Documentos)',
    'settings.exportIcs': 'Exportar calendario (.ics)',
    'settings.exportIcsSub': 'Horarios anonimizados (código TL-XXXX). Se guarda en Documentos/Telar/calendario/',
    'settings.wipe': 'Eliminar todos mis datos',
    'settings.wipeSub': 'Borra pacientes, tratamientos, notas y perfil. No se puede deshacer',
    'settings.version': 'Versión',
    'settings.chooseLanguage': 'Elegir idioma',
    'settings.cancel': 'Cancelar',
    'workspace.session': 'Sesión',
    'workspace.addSession': '+ Agregar sesión',
    'workspace.addModule': '+ Agregar módulo',
    'workspace.exportProgram': 'Exportar programa',
    'workspace.backAgenda': 'Volver a tratamientos',
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
    'asrs.subtitle': '6 ítems · escala 0–4 · últimos 6 meses · screener WHO (Parte A).',
    'asrs.progress': 'Ítems respondidos',
    'asrs.partA': 'Parte A (tamizaje)',
    'asrs.item': 'Ítem',
    'asrs.response': 'Respuesta',
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
    'asrs.note':
      'Adult ADHD Self-Report Scale (ASRS-v1.1) Screener © World Health Organization. Uso con atribución; no se requiere aprobación previa para el screener de 6 ítems. Parte A ≥4 síntomas positivos sugiere tamizaje consistente con TDAH. No sustituye evaluación clínica.',
    'toast.saved': 'Guardado',
    'toast.langChanged': 'Idioma actualizado',
  },
  en: {
    'nav.agenda': 'Schedule',
    'nav.treatments': 'Treatments',
    'nav.reportes': 'Statistics',
    'nav.goals': 'Goals',
    'nav.modules': 'Modules',
    'nav.settings': 'Settings',
    'nav.help': 'Help',
    'settings.title': 'Settings',
    'settings.name': 'Name',
    'settings.gender': 'Gender',
    'settings.genderSub': 'How the assistant addresses you in emails',
    'settings.genderM': 'Masculine',
    'settings.genderF': 'Feminine',
    'settings.genderUnset': 'Unspecified',
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
    'settings.fileVaultHint':
      'Encrypt the computer disk (FileVault on Mac, BitLocker on Windows). If it is lost or stolen, nobody can read the clinical file, Touch ID key, or on-disk backups.',
    'settings.privacyTitle': 'Privacy & data',
    'settings.privacyHint': 'Your data stays on this device only. You can export or delete it entirely.',
    'settings.encrypted': 'Encrypted on this device',
    'settings.encryptedSub':
      'The clinical file is stored encrypted on your computer. It unlocks with your PIN or Touch ID; without that key nobody can read it. Always on.',
    'settings.usagePing': 'Anonymous usage counter',
    'settings.usagePingOn': 'On by default — app version once/day only; anonymous, no IP or clinical data',
    'settings.usagePingOff': 'Off — no ping sent',
    'settings.usagePingEnabled': 'Anonymous counter enabled',
    'settings.usagePingDisabled': 'Anonymous counter disabled',
    'settings.cloudBackup': 'Automatic backup',
    'settings.cloudBackupPro': 'Professional plan — end-to-end encrypted in the folder you choose',
    'settings.cloudBackupNotConfigured': 'Turn on the switch to pick a folder and create the first copy',
    'settings.cloudBackupDisabled': 'Off — no automatic backups are created',
    'settings.cloudBackupTurnedOn': 'Automatic backup enabled',
    'settings.cloudBackupTurnedOff': 'Automatic backup disabled',
    'settings.cloudBackupManage': 'Manage',
    'settings.cloudBackupBackingUp': 'Backing up…',
    'settings.cloudBackupFolderMissing': 'Folder not accessible — use Manage to pick another',
    'settings.cloudBackupActive': 'Last backup: {when} · {size}',
    'settings.cloudBackupActivePath': '{path} · telar-respaldo-*.age files (encrypted, visible in Finder)',
    'settings.cloudBackupActiveDetail': '{path} · {file} · {when} · {size}',
    'settings.cloudBackupActiveEmpty': 'Active — no .age files in the folder yet',
    'settings.cloudBackupDesktopOnly': 'Desktop app only (Pro plan)',
    'settings.cloudBackupHowItWorks': 'How does it work?',
    'settings.cloudBackupNow': 'Back up now',
    'settings.cloudBackupRestoreFromFile': 'Restore from file…',
    'settings.cloudBackupChangeFolder': 'Change folder',
    'settings.cloudBackupPickFolder': 'Choose backup folder (Drive, Dropbox, iCloud…)',
    'settings.cloudBackupNotSyncedTitle': 'This folder never leaves your computer',
    'settings.cloudBackupNotSyncedMessage':
      'The folder you picked does not sync to any cloud: backups will stay on this same disk. If the computer fails or is lost, the copies are lost too.\n\nTo get them off this machine, pick a folder inside Google Drive, Dropbox, OneDrive, or iCloud.',
    'settings.cloudBackupNotSyncedPickOther': 'Pick another folder',
    'settings.cloudBackupNotSyncedUseAnyway': 'Use it anyway',
    'settings.cloudBackupLocalOnlyWarn': 'Local folder — backups stay on this computer',
    'settings.cloudBackupPickRestore': 'Choose a telar-respaldo-.age file',
    'settings.cloudBackupFolderRequired': 'You must choose a backup folder.',
    'settings.cloudBackupFolderUpdated': 'Backup folder updated.',
    'settings.cloudBackupNeedKeyConfirm': 'You must confirm you saved the recovery key.',
    'settings.cloudBackupFirstOk': 'Backup enabled and first copy saved.',
    'settings.cloudBackupOk': 'Backup saved to your folder.',
    'settings.cloudBackupNoChanges': 'No changes since the last backup.',
    'settings.cloudBackupGotIt': 'Got it',
    'settings.cloudBackupInfoTitle': 'Automatic backup',
    'settings.cloudBackupInfoWhatTitle': 'What it does.',
    'settings.cloudBackupInfoWhat':
      'Each day, Telar saves an encrypted copy of your practice to a folder on your computer that you choose. You will see telar-respaldo-YYYY-MM-DD.age files — unreadable without your key. Telar keeps the 7 most recent copies. If you lose your computer, install Telar on a new one and restore everything.',
    'settings.cloudBackupInfoWhereTitle': 'Telar stores nothing on the internet.',
    'settings.cloudBackupInfoWhere':
      'The copy is written to your disk, not to Telar servers. If you pick a folder inside Google Drive, Dropbox, OneDrive, or iCloud, your own cloud syncs it, so the backup survives a lost or stolen computer. Pick any other folder and the copies never leave this machine.',
    'settings.cloudBackupInfoPrivacyTitle': 'Nobody else can read it.',
    'settings.cloudBackupInfoPrivacy':
      'The copy is encrypted with age before it leaves Telar. The folder — and your cloud, if you sync it — only holds that unreadable .age file. Not Telar, not Google, not Dropbox can open it. Also encrypt the computer disk (FileVault on Mac, BitLocker on Windows) so the key Telar stores on the machine is not sitting in the clear.',
    'settings.cloudBackupInfoKeyTitle': 'Your recovery key.',
    'settings.cloudBackupInfoKey':
      'When you enable it, we give you a unique key. It is the only way to open your backups. Store it off this computer — printed or in a password manager.',
    'settings.cloudBackupInfoWarn':
      'If you lose that key, backups cannot be recovered. There is no way to replace it — that is exactly why nobody else can read your data.',
    'settings.cloudBackupInfoExportNote':
      'This does not replace exporting your data. Backup is for restoring Telar. For Excel or PDF, use Download my data.',
    'settings.cloudBackupRecoverySheet': 'Recovery key',
    'settings.cloudBackupRecoveryTitle': 'Save your recovery key',
    'settings.cloudBackupRecoveryIntro':
      'This key is shown once. It is the only way to open your backups on a new computer.',
    'settings.cloudBackupCopyKey': 'Copy key',
    'settings.cloudBackupDownloadKey': 'Download .txt',
    'settings.cloudBackupPrintPdf': 'Recovery sheet (PDF)',
    'settings.cloudBackupPdfReady': 'PDF saved to Documents/Telar/exportaciones',
    'settings.cloudBackupPdfFailed': 'Could not generate PDF',
    'settings.cloudBackupRecoveryPdfTitle': 'Telar — Recovery sheet',
    'settings.cloudBackupRecoveryPdfSubtitle': 'Automatic backup recovery key',
    'settings.cloudBackupRecoveryPdfIntro':
      'Store this document off your computer. Without this key you cannot open your telar-respaldo-.age files on a new device.',
    'settings.cloudBackupRecoveryPdfRage':
      'Independent decryption: use the open-source «rage» tool (age format) to open your backups even if Telar no longer exists.',
    'settings.cloudBackupRecoveryPdfWarn':
      'WARNING: If you lose this key, backups CANNOT be recovered. Telar cannot replace it.',
    'settings.cloudBackupRecoveryPdfSteps':
      'To restore: install Telar, choose Restore from file, select your .age file, and enter this key when prompted.',
    'settings.cloudBackupRecoveryPdfGenerated': 'Generated',
    'settings.cloudBackupRecoveryAck': 'I saved the key somewhere safe off this computer',
    'settings.cloudBackupContinue': 'Continue',
    'settings.cloudBackupCopied': 'Key copied to clipboard',
    'settings.cloudBackupCopyFailed': 'Could not copy — select and copy manually',
    'settings.cloudBackupRestoreTitle': 'Restore backup?',
    'settings.cloudBackupRestoreConfirm':
      'You have {localPatients} patient(s) in this Telar. The backup from {backupDate} contains {backupPatients} patient(s). A local backup will be created automatically before overwriting.',
    'settings.cloudBackupRestoreAction': 'Restore',
    'settings.cloudBackupRestorePin': 'Enter your PIN to install the backup',
    'settings.cloudBackupRestoreOk': 'Backup restored. Your data is ready.',
    'settings.cloudBackupRecoveryPromptTitle': 'Recovery key',
    'settings.cloudBackupRecoveryPrompt':
      'Paste the AGE-SECRET-KEY-… you saved when enabling backup (or from your .txt/PDF download).',
    'settings.cloudBackupForgotKey': 'I forgot my key',
    'settings.cloudBackupForgotTitle': 'Start from scratch?',
    'settings.cloudBackupForgotMessage':
      'Without that key, the telar-respaldo-.age files already in iCloud or another folder cannot be opened.\n\nTelar will generate a new key and keep backing up this practice. You can leave the old .age files there in case you find the key later, but they cannot be restored. Telar keeps the 7 most recent copies: over time the old ones will be replaced.',
    'settings.cloudBackupForgotConfirm': 'Start from scratch',
    'settings.export': 'Download my data',
    'settings.exportSub': 'Export patients, sessions and profile as CSV (Documents folder)',
    'settings.exportIcs': 'Export calendar (.ics)',
    'settings.exportIcsSub': 'Anonymized schedules (TL-XXXX code). Saved to Documents/Telar/calendario/',
    'settings.wipe': 'Delete all my data',
    'settings.wipeSub': 'Erases patients, treatments, notes and profile. Cannot be undone',
    'settings.version': 'Version',
    'settings.chooseLanguage': 'Choose language',
    'settings.cancel': 'Cancel',
    'workspace.session': 'Session',
    'workspace.addSession': '+ Add session',
    'workspace.addModule': '+ Add module',
    'workspace.exportProgram': 'Export program',
    'workspace.backAgenda': 'Back to treatments',
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
    'asrs.subtitle': '6 items · 0–4 scale · past 6 months · WHO screener (Part A).',
    'asrs.progress': 'Items answered',
    'asrs.partA': 'Part A (screening)',
    'asrs.item': 'Item',
    'asrs.response': 'Response',
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
    'asrs.note':
      'Adult ADHD Self-Report Scale (ASRS-v1.1) Screener © World Health Organization. Used with attribution; no prior approval is required for the 6-item screener. Part A ≥4 positive symptoms suggests ADHD-consistent screening. Not a substitute for clinical evaluation.',
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

/** Interpolación simple: tf('key', { name: 'Ana' }) con `{name}` en el string. */
export function tf(key, vars = {}, fallback = '') {
  let s = t(key, fallback);
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
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
