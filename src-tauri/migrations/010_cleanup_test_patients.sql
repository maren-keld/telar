-- Mantener solo el paciente «Paciente sin nombre» más reciente (si existe alguno).
DELETE FROM patients
WHERE EXISTS (
  SELECT 1 FROM patients WHERE lower(trim(name)) = 'paciente sin nombre'
)
AND id != (
  SELECT id FROM patients
  WHERE lower(trim(name)) = 'paciente sin nombre'
  ORDER BY datetime(created_at) DESC, id DESC
  LIMIT 1
);
