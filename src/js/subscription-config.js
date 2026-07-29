/**
 * Tras desplegar la API de suscripciones (Render u otro host HTTPS):
 * 1. Copia la URL que te da Render (ej. https://telar-api.onrender.com)
 * 2. Pégala abajo SIN barra final
 * 3. Ejecuta ./scripts/finish-iteration.sh
 */
// Tras deploy en Render: 'https://telar-api.onrender.com' (./scripts/deploy-subscription-api.sh)
// Vacío = la .app usa API local en 127.0.0.1:5001 (python app.py en server/)
export const SUBSCRIPTION_API_PRODUCTION = 'https://telar-api-aim8.onrender.com';

/** Pacientes distintos con ≥1 tratamiento en estado en_tratamiento (plan Demo). */
export const FREE_ACTIVE_PATIENT_LIMIT = 3;
