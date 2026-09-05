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

  const mistral = preset.id === 'mistral' && !isLocalhost;

  return {
    provider,
    serverCountry: isLocalhost ? 'Este equipo (localhost)' : serverCountry,
    dataSent: AI_API_DATA_SENT,
    legalNote: mistral
      ? 'Mistral es una empresa europea. Telar no almacena el envío (no pasa por telarapp.cl). Un resumen del caso sale de tu computador a Francia. No es un diagnóstico. El dato de salud es tu responsabilidad (Ley 19.628).'
      : 'Telar no guarda estos envíos (no pasan por telarapp.cl). El destino es el proveedor que eliges. La responsabilidad del dato de salud es tuya, conforme a la Ley 19.628.',
  };
}

export function requireAiApiConsent(profile = {}) {
  if (hasAiApiConsent(profile)) return;
  throw new Error(
    'Antes de enviar un caso a la nube, acepta el aviso de transferencia (Francia / el proveedor que elijas) en Ajustes → Asistente IA.',
  );
}
