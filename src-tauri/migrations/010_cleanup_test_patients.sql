-- 010 ya no borra pacientes.
-- «Paciente sin nombre» es el nombre por defecto al crear ficha o cita, no un marcador de prueba.
-- Las DB que ya aplicaron el DELETE anterior no reejecutan esta migración.
SELECT 1;
