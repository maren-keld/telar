import { CHILE_LOCATIONS } from './chile-map.js';

/** Sugerencias iniciales sin conexión; la búsqueda online amplía las localidades. */
const CITY_NAMES = {
  AR: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'La Plata', 'Mar del Plata', 'Salta', 'San Miguel de Tucumán'],
  UY: ['Montevideo', 'Salto', 'Paysandú', 'Maldonado', 'Rivera', 'Colonia del Sacramento', 'Las Piedras'],
  MX: ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'Mérida', 'Querétaro', 'León'],
  PE: ['Lima', 'Arequipa', 'Trujillo', 'Cusco', 'Chiclayo', 'Piura', 'Huancayo', 'Iquitos'],
  CO: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira', 'Manizales'],
  BO: ['La Paz', 'Santa Cruz de la Sierra', 'Cochabamba', 'Sucre', 'El Alto', 'Oruro', 'Potosí', 'Tarija'],
  EC: ['Quito', 'Guayaquil', 'Cuenca', 'Ambato', 'Manta', 'Loja', 'Machala', 'Santo Domingo'],
  PY: ['Asunción', 'Ciudad del Este', 'Encarnación', 'San Lorenzo', 'Luque', 'Capiatá', 'Pedro Juan Caballero'],
  VE: ['Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto', 'Maracay', 'Mérida', 'San Cristóbal', 'Puerto La Cruz'],
  CR: ['San José', 'Alajuela', 'Cartago', 'Heredia', 'Liberia', 'Puntarenas', 'Limón'],
  PA: ['Ciudad de Panamá', 'San Miguelito', 'David', 'Colón', 'La Chorrera', 'Santiago de Veraguas'],
  GT: ['Ciudad de Guatemala', 'Quetzaltenango', 'Antigua Guatemala', 'Escuintla', 'Cobán', 'Huehuetenango'],
  SV: ['San Salvador', 'Santa Ana', 'San Miguel', 'Santa Tecla', 'Sonsonate', 'Apopa'],
  HN: ['Tegucigalpa', 'San Pedro Sula', 'La Ceiba', 'Choloma', 'Comayagua', 'El Progreso'],
  NI: ['Managua', 'León', 'Granada', 'Masaya', 'Matagalpa', 'Estelí', 'Chinandega'],
  DO: ['Santo Domingo', 'Santiago de los Caballeros', 'La Romana', 'San Pedro de Macorís', 'San Cristóbal', 'Puerto Plata'],
  CU: ['La Habana', 'Santiago de Cuba', 'Camagüey', 'Holguín', 'Santa Clara', 'Cienfuegos', 'Matanzas'],
  PR: ['San Juan', 'Bayamón', 'Ponce', 'Carolina', 'Caguas', 'Mayagüez', 'Arecibo'],
  ES: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Murcia', 'Bilbao'],
  US: ['Miami, Florida', 'Los Angeles, California', 'New York, New York', 'Houston, Texas', 'Chicago, Illinois', 'San Antonio, Texas', 'San Diego, California', 'Phoenix, Arizona'],
};

function searchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function suggestCities(query, country = 'CL', limit = 8) {
  const code = String(country || '').toUpperCase();
  const names = code === 'CL' ? CHILE_LOCATIONS.map((place) => place.label) : CITY_NAMES[code] || [];
  const term = searchText(query);
  return names.filter((name) => !term || searchText(name).includes(term)).slice(0, limit);
}
