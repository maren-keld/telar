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

/** Precios de suscripción en CLP (deben coincidir con la API). */
export const SUBSCRIPTION_PRICE_CLP = 11990;
export const SUBSCRIPTION_ANNUAL_PRICE_CLP = 129990;

export const SUBSCRIPTION_PLANS = {
  monthly: {
    key: 'monthly',
    label: 'Pro mensual',
    amount: SUBSCRIPTION_PRICE_CLP,
    period: 'mes',
  },
  annual: {
    key: 'annual',
    label: 'Pro anual',
    amount: SUBSCRIPTION_ANNUAL_PRICE_CLP,
    period: 'año',
  },
};

export function formatSubscriptionPriceCLP(amount = SUBSCRIPTION_PRICE_CLP) {
  return `$${amount.toLocaleString('es-CL')} CLP`;
}
