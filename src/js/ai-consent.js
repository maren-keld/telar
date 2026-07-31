import { getApiPreset } from './ai-config.js';

/** Datos que pueden salir del equipo en modo API (contexto clínico armado por Telar). */
export const AI_API_DATA_SENT = [
  'Nombre del paciente y número de tratamiento',
  'Puntajes psicométricos (escalas aplicadas)',
  'Respuestas de módulos clínicos (texto legible por sesión)',
  'Notas clínicas registradas en el caso',
  'Tu pregunta o instrucción al asistente',
];

export function hasAiApiConsent(profile = {}) {
  return Boolean(profile.aiApiConsentAt);
}

export function getApiTransferNotice(profile = {}) {
  const preset = getApiPreset(profile.aiApiProvider);
  const provider = preset.label || 'Proveedor API configurado';
  const serverCountry =
    preset.serverCountry ||
    (preset.id === 'mistral' ? 'Francia (Unión Europea)' : 'depende del proveedor');
  const isLocalhost =
    (profile.aiApiBase || preset.baseUrl || '').includes('127.0.0.1') ||
    (profile.aiApiBase || preset.baseUrl || '').includes('localhost');

  return {
    provider,
    serverCountry: isLocalhost ? 'Este equipo (localhost)' : serverCountry,
    dataSent: AI_API_DATA_SENT,
    legalNote:
      'La transferencia internacional de datos sensibles de salud es responsabilidad del profesional tratante, conforme a la Ley 19.628. Telar no almacena estos envíos en sus servidores.',
  };
}

export function requireAiApiConsent(profile = {}) {
  if (hasAiApiConsent(profile)) return;
  throw new Error(
    'Debes aceptar el aviso de transferencia de datos en Ajustes → Proveedor de IA antes de enviar contexto clínico a una API externa.',
  );
}
