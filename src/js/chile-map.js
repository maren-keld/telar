/** Geocodificación local + mapa de calor (Leaflet). Sin envío de direcciones a servicios externos. */

export const CHILE_LOCATIONS = [
  { label: 'Arica, Arica y Parinacota, Chile', keywords: ['arica', 'parinacota', 'putre'], lat: -18.4783, lng: -70.3126 },
  { label: 'Iquique, Tarapacá, Chile', keywords: ['iquique', 'tarapacá', 'tarapaca', 'alto hospicio', 'pozo almonte'], lat: -20.2307, lng: -70.1357 },
  { label: 'Antofagasta, Chile', keywords: ['antofagasta', 'mejillones', 'tocopilla'], lat: -23.6509, lng: -70.3975 },
  { label: 'Calama, Antofagasta, Chile', keywords: ['calama', 'san pedro de atacama'], lat: -22.4569, lng: -68.9237 },
  { label: 'Copiapó, Atacama, Chile', keywords: ['copiapó', 'copiapo', 'vallenar', 'caldera', 'tierra amarilla'], lat: -27.3668, lng: -70.3322 },
  { label: 'La Serena, Coquimbo, Chile', keywords: ['la serena', 'coquimbo', 'ovalle', 'illapel'], lat: -29.9027, lng: -71.2519 },
  { label: 'Valparaíso, Chile', keywords: ['valparaíso', 'valparaiso', 'quilpué', 'quilpue', 'san antonio', 'quillota'], lat: -33.0472, lng: -71.6127 },
  { label: 'Viña del Mar, Valparaíso, Chile', keywords: ['viña del mar', 'vina del mar', 'viña', 'vina'], lat: -33.0245, lng: -71.5518 },
  { label: 'Rancagua, O\'Higgins, Chile', keywords: ['rancagua', 'ohiggins', "o'higgins", 'san fernando', 'pichilemu'], lat: -34.1701, lng: -70.7406 },
  { label: 'Talca, Maule, Chile', keywords: ['talca', 'curicó', 'curico', 'maule', 'linares'], lat: -35.4264, lng: -71.6554 },
  { label: 'Chillán, Ñuble, Chile', keywords: ['chillán', 'chillan', 'ñuble', 'nuble', 'san carlos'], lat: -36.6063, lng: -72.1034 },
  { label: 'Concepción, Biobío, Chile', keywords: ['concepción', 'concepcion', 'talcahuano', 'biobío', 'biobio', 'coronel', 'los ángeles'], lat: -36.8201, lng: -73.0444 },
  { label: 'Temuco, Araucanía, Chile', keywords: ['temuco', 'araucanía', 'araucania', 'villarrica', 'angol'], lat: -38.7359, lng: -72.5904 },
  { label: 'Valdivia, Los Ríos, Chile', keywords: ['valdivia', 'los ríos', 'los rios', 'la unión', 'rio bueno'], lat: -39.8142, lng: -73.2459 },
  { label: 'Puerto Montt, Los Lagos, Chile', keywords: ['puerto montt', 'osorno', 'los lagos', 'castro', 'chiloe', 'chiloé'], lat: -41.4693, lng: -72.9424 },
  { label: 'Coyhaique, Aysén, Chile', keywords: ['coyhaique', 'aysén', 'aysen', 'puerto aysén'], lat: -45.5752, lng: -72.0662 },
  { label: 'Punta Arenas, Magallanes, Chile', keywords: ['punta arenas', 'magallanes', 'puerto natales', 'porvenir'], lat: -53.1638, lng: -70.9171 },
  { label: 'Santiago, Región Metropolitana, Chile', keywords: ['santiago', 'metropolitana', 'rm'], lat: -33.4489, lng: -70.6693 },
  { label: 'Providencia, Santiago, Chile', keywords: ['providencia'], lat: -33.4314, lng: -70.6093 },
  { label: 'Las Condes, Santiago, Chile', keywords: ['las condes'], lat: -33.4172, lng: -70.5506 },
  { label: 'Ñuñoa, Santiago, Chile', keywords: ['ñuñoa', 'nunoa'], lat: -33.4569, lng: -70.5975 },
  { label: 'Maipú, Santiago, Chile', keywords: ['maipú', 'maipu'], lat: -33.5112, lng: -70.7585 },
  { label: 'Puente Alto, Santiago, Chile', keywords: ['puente alto'], lat: -33.6111, lng: -70.5757 },
  { label: 'La Florida, Santiago, Chile', keywords: ['la florida'], lat: -33.5225, lng: -70.5955 },
  { label: 'San Bernardo, Santiago, Chile', keywords: ['san bernardo'], lat: -33.5922, lng: -70.7006 },
  { label: 'Peñalolén, Santiago, Chile', keywords: ['peñalolén', 'penalolen'], lat: -33.4833, lng: -70.5333 },
  { label: 'Vitacura, Santiago, Chile', keywords: ['vitacura'], lat: -33.3928, lng: -70.5678 },
  { label: 'La Reina, Santiago, Chile', keywords: ['la reina'], lat: -33.4444, lng: -70.5361 },
  { label: 'Macul, Santiago, Chile', keywords: ['macul'], lat: -33.5000, lng: -70.5667 },
  { label: 'Cerrillos, Santiago, Chile', keywords: ['cerrillos'], lat: -33.5000, lng: -70.7167 },
  { label: 'Quilicura, Santiago, Chile', keywords: ['quilicura'], lat: -33.3667, lng: -70.7333 },
  { label: 'Recoleta, Santiago, Chile', keywords: ['recoleta'], lat: -33.4167, lng: -70.6500 },
  { label: 'Independencia, Santiago, Chile', keywords: ['independencia'], lat: -33.4167, lng: -70.6667 },
  { label: 'Estación Central, Santiago, Chile', keywords: ['estación central', 'estacion central'], lat: -33.4500, lng: -70.6833 },
];

export function suggestAddresses(query, limit = 8) {
  const q = String(query || '').toLowerCase().trim();
  if (q.length < 2) return [];
  const matches = [];
  for (const loc of CHILE_LOCATIONS) {
    const hit =
      loc.label.toLowerCase().includes(q) || loc.keywords.some((kw) => kw.includes(q) || q.includes(kw));
    if (hit) matches.push(loc.label);
    if (matches.length >= limit) break;
  }
  return matches;
}

export function geocodeAddress(address) {
  const text = String(address || '').toLowerCase();
  if (!text.trim()) return null;
  let best = null;
  let bestLen = 0;
  for (const loc of CHILE_LOCATIONS) {
    for (const kw of loc.keywords) {
      if (text.includes(kw) && kw.length > bestLen) {
        best = loc;
        bestLen = kw.length;
      }
    }
  }
  return best ? { lat: best.lat, lng: best.lng } : null;
}

function hashJitter(seed, i) {
  let h = 0;
  const s = `${seed}-${i}`;
  for (let c = 0; c < s.length; c++) h = (h * 31 + s.charCodeAt(c)) | 0;
  const angle = ((h % 360) * Math.PI) / 180;
  const dist = 0.006 + (Math.abs(h) % 80) / 10000;
  return { dlat: Math.sin(angle) * dist, dlng: Math.cos(angle) * dist };
}

export function buildHeatPoints(addresses) {
  const points = [];
  const seen = new Map();

  for (const addr of addresses) {
    const geo = geocodeAddress(addr);
    if (!geo) continue;
    const key = `${geo.lat.toFixed(3)}:${geo.lng.toFixed(3)}`;
    const n = seen.get(key) || 0;
    seen.set(key, n + 1);
    const jitter = hashJitter(addr, n);
    points.push([geo.lat + jitter.dlat, geo.lng + jitter.dlng, 1]);
  }
  return points;
}

let mapInstance = null;

export function renderPatientHeatMap(host, addresses) {
  if (!host || !window.L) {
    host.innerHTML = '<p class="reportes-empty">Mapa no disponible.</p>';
    return;
  }

  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  const points = buildHeatPoints(addresses);
  host.innerHTML = '<div id="patient-heat-map-canvas" class="patient-heat-map__canvas"></div>';

  const canvas = host.querySelector('#patient-heat-map-canvas');
  const map = window.L.map(canvas, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,
  });
  mapInstance = map;

  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  }).addTo(map);

  if (points.length) {
    window.L.heatLayer(points, {
      radius: 28,
      blur: 22,
      maxZoom: 12,
      minOpacity: 0.35,
      gradient: {
        0.2: '#3d9b6e',
        0.45: '#e6c200',
        0.65: '#ff8c00',
        0.85: '#e74c3c',
        1: '#c0392b',
      },
    }).addTo(map);

    const bounds = window.L.latLngBounds(points.map((p) => [p[0], p[1]]));
    map.fitBounds(bounds.pad(0.35));
  } else {
    map.setView([-35.5, -71.5], 5);
  }

  requestAnimationFrame(() => map.invalidateSize());
}
