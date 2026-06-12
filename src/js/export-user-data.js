import { query } from './db.js';
import { loadProfile } from './profile.js';
import { getInvoke } from './tauri-bridge.js';

const UTF8_BOM = '\uFEFF';

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows, columns) {
  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(cols.map((c) => csvEscape(row[c])).join(','));
  }
  return UTF8_BOM + lines.join('\n');
}

function profileToCsv(profile) {
  const row = {
    nombre: profile.name || '',
    correo: profile.email || '',
    celular: profile.phone || '',
    direccion: profile.address || '',
    plan: profile.plan || 'free',
    modo_oscuro: profile.darkMode ? '1' : '0',
    modo_presentacion: profile.presentationMode ? '1' : '0',
    modulos_personalizados_json: JSON.stringify(profile.customModules || []),
  };
  return rowsToCsv([row], Object.keys(row));
}

function formatExportFolderName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `datos-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * Exporta todos los datos locales a CSV en Documentos/Telar/exportaciones/.
 * @returns {Promise<string>} Ruta de la carpeta exportada
 */
export async function exportAllUserData() {
  const [
    patients,
    treatments,
    sessions,
    sessionModules,
    clinicalNotes,
    nfRecordings,
    convenios,
    spaceChecks,
    practiceGoals,
  ] = await Promise.all([
    query('SELECT * FROM patients ORDER BY id'),
    query(
      `SELECT t.*, p.name AS patient_name
       FROM treatments t
       JOIN patients p ON p.id = t.patient_id
       ORDER BY t.id`,
    ),
    query(
      `SELECT s.*, t.number AS treatment_number, p.name AS patient_name
       FROM sessions s
       JOIN treatments t ON t.id = s.treatment_id
       JOIN patients p ON p.id = t.patient_id
       ORDER BY s.id`,
    ),
    query(
      `SELECT sm.*, s.number AS session_number, t.number AS treatment_number, p.name AS patient_name
       FROM session_modules sm
       JOIN sessions s ON s.id = sm.session_id
       JOIN treatments t ON t.id = s.treatment_id
       JOIN patients p ON p.id = t.patient_id
       ORDER BY sm.id`,
    ),
    query(
      `SELECT n.*, t.number AS treatment_number, p.name AS patient_name
       FROM clinical_notes n
       JOIN treatments t ON t.id = n.treatment_id
       JOIN patients p ON p.id = t.patient_id
       ORDER BY n.id`,
    ),
    query(
      `SELECT nr.id, nr.session_module_id, nr.device, nr.locations, nr.protocol,
              nr.started_at, nr.ended_at, nr.duration_sec, nr.results_json, nr.created_at,
              CASE WHEN nr.raw_data IS NOT NULL AND length(nr.raw_data) > 0 THEN 1 ELSE 0 END AS tiene_datos_crudos,
              length(nr.raw_data) AS raw_data_bytes
       FROM neurofeedback_recordings nr
       ORDER BY nr.id`,
    ),
    query('SELECT * FROM convenios ORDER BY id'),
    query(
      `SELECT sc.*, t.number AS treatment_number, p.name AS patient_name
       FROM treatment_space_checks sc
       JOIN treatments t ON t.id = sc.treatment_id
       JOIN patients p ON p.id = t.patient_id
       ORDER BY sc.id`,
    ),
    query('SELECT * FROM practice_goals WHERE id = 1'),
  ]);

  const nfRawFiles = await query(
    `SELECT id, raw_data FROM neurofeedback_recordings
     WHERE raw_data IS NOT NULL AND length(raw_data) > 0
     ORDER BY id`,
  );

  const profile = loadProfile();
  const exportedAt = new Date().toISOString();
  const readme = `Telar — exportación de datos
Fecha: ${exportedAt}

Archivos incluidos:
- profesional.csv — datos del profesional y preferencias locales
- pacientes.csv — fichas de pacientes
- tratamientos.csv — tratamientos por paciente
- sesiones.csv — sesiones clínicas
- modulos_sesion.csv — módulos completados en cada sesión
- notas_clinicas.csv — notas del tratamiento
- neurofeedback.csv — metadatos de grabaciones NF (sin señal en bruto)
- neurofeedback_raw/ — señal EEG en bruto por grabación (si existe)
- convenios.csv — convenios institucionales
- espacio_terapeutico.csv — checklist del espacio terapéutico
- objetivos_practica.csv — metas de la práctica

Estos archivos CSV pueden abrirse en Excel, Numbers o Google Sheets.
Los datos permanecen en su dispositivo; Telar no recibe esta exportación.
`;

  const files = [
    { name: 'LEEME.txt', content: readme },
    { name: 'profesional.csv', content: profileToCsv(profile) },
    { name: 'pacientes.csv', content: rowsToCsv(patients) },
    { name: 'tratamientos.csv', content: rowsToCsv(treatments) },
    { name: 'sesiones.csv', content: rowsToCsv(sessions) },
    { name: 'modulos_sesion.csv', content: rowsToCsv(sessionModules) },
    { name: 'notas_clinicas.csv', content: rowsToCsv(clinicalNotes) },
    { name: 'neurofeedback.csv', content: rowsToCsv(nfRecordings) },
    { name: 'convenios.csv', content: rowsToCsv(convenios) },
    { name: 'espacio_terapeutico.csv', content: rowsToCsv(spaceChecks) },
    { name: 'objetivos_practica.csv', content: rowsToCsv(practiceGoals) },
  ];

  for (const row of nfRawFiles) {
    files.push({
      name: `neurofeedback_raw/grabacion-${row.id}.txt`,
      content: String(row.raw_data),
    });
  }

  const folderName = formatExportFolderName();
  const folderPath = await getInvoke()('save_data_export', { folderName, files });
  return folderPath;
}
