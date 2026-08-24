#!/usr/bin/env node
/**
 * Genera landing/modules/ desde metadatos de la app (module-defs + psychometrics + handouts).
 * Ejecutar: node scripts/generate-landing-modules.mjs
 */
import { writeFileSync, readFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_MODULE_DEFS } from '../src/js/config.js';
import { CATEGORY_BLURBS, CATEGORY_LABELS, CATEGORY_ORDER } from '../src/js/module-categories.js';
import { CLINICAL_MODULE_DEFS } from '../src/packs/clinical-shared/module-defs.js';
import { ANSIEDAD_DEPRESION_MODULE_DEFS } from '../src/packs/ansiedad-depresion/module-defs.js';
import { MODULE_PSYCHOMETRICS } from '../src/js/module-psychometrics.js';
import { ANSIEDAD_DEPRESION_PSYCHOMETRICS } from '../src/packs/ansiedad-depresion/psychometrics.js';
import { TCC_HANDOUT_DEFS } from '../src/js/tcc-handout-defs.js';
import { EXTRA_HANDOUT_DEFS } from '../src/js/extra-handout-defs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'landing/modules');
const CSS_V = '20260824a';

const SKIP = new Set(['selector_modulo']);

const PACK_LABELS = {
  core: 'Telar (core)',
  'clinical-shared': 'Pack clínico base',
  'ansiedad-depresion': 'Pack ansiedad y depresión',
};

const EXTRA_PSYCH = {
  neurofeedback: {
    authors: 'Telar — complemento psicoeducativo',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Biofeedback EEG de 2 canales (Muse 2); no es equipamiento diagnóstico.',
    validity:
      'Entrenamiento de autorregulación integrado al seguimiento clínico; no sustituye evaluación ni tratamiento médico.',
    learnMore: 'Protocolos Atención y Calma. Incluido en Plan Demo (en vivo) y Plan Pro (grabación y export).',
  },
  bilateral_stimulation: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Generador de estímulo bilateral visual; no es un protocolo EMDR completo.',
    validity:
      'EMDR-adjacent: estimulación bilateral integrada al registro clínico. No sustituye formación ni supervisión en EMDR.',
    learnMore: 'Velocidad configurable 0,5–2 Hz. Uso en estabilización o como apoyo a terapeutas EMDR formados.',
  },
  registro_inicial: {
    authors: 'Telar',
    ageRange: 'Todas las edades',
    reliability: 'Registro clínico estructurado; no es instrumento psicométrico.',
    validity: 'Datos demográficos y de contacto en la ficha del paciente.',
    learnMore: 'Una vez por tratamiento.',
  },
  motivo_consulta: {
    authors: 'Telar',
    ageRange: 'Todas las edades',
    reliability: 'Registro clínico estructurado; no es instrumento psicométrico.',
    validity: 'Motivo de consulta, expectativas y encuadre inicial.',
    learnMore: 'Una vez por tratamiento.',
  },
  redes_apoyo: {
    authors: 'Telar',
    ageRange: 'Todas las edades',
    reliability: 'Mapa clínico de apoyo social; no es instrumento estandarizado.',
    validity: 'Personas de referencia, tipo de vínculo y áreas de apoyo.',
    learnMore: 'Útil en trauma, TDAH y regulación emocional.',
  },
  diagnostico: {
    authors: 'Telar',
    ageRange: 'Todas las edades',
    reliability: 'Formulación clínica integrada; no es diagnóstico automatizado.',
    validity: 'Problemas, indicadores y objetivos por tratamiento.',
    learnMore: 'Soporta conceptualización e informes del programa.',
  },
  tcc_registro_pensamientos: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Registro clínico TCC; sin estandarización psicométrica.',
    validity: 'Herramienta de reestructuración cognitiva orientativa; no sustituye formulación del caso.',
    learnMore: 'Siete columnas. Se puede repetir por episodio.',
  },
  tcc_exposicion: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Jerarquía clínica de evitación; no es material psicoeducativo TCC ni un protocolo de trauma.',
    validity: 'Apoyo a exposición gradual acordada en sesión; no es un protocolo de trauma.',
    learnMore: 'Seis peldaños + primer paso. Brazo conductual de las habilidades, no un procedimiento de sala.',
  },
  tcc_experimento: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Diseño de experimento conductual; no es material psicoeducativo TCC.',
    validity: 'Pone a prueba creencias en la vida real; no sustituye exposición ni formulación.',
    learnMore: 'Se puede repetir: una hoja por experimento. Habilidad entre sesiones, no intervención de sala.',
  },
  tcc_monitoreo_actividades: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Autorregistro semanal; no es instrumento estandarizado.',
    validity: 'Complementa activación conductual y seguimiento del ánimo.',
    learnMore: 'Una hoja por semana. Ánimo 0–10 junto a las actividades del día.',
  },
  tcc_prevencion_recaida: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Plan clínico de cierre o mantenimiento.',
    validity: 'Orientativo; no reemplaza plan de seguridad si hay riesgo vital.',
    learnMore: 'Señales tempranas, alto riesgo y plan de 24–48 h.',
  },
  sig_externalizacion: {
    authors: 'Telar — elaboración propia (tradición narrativa, White)',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Conversación estructurada; no es instrumento psicométrico.',
    validity: 'Apoya separar persona y problema; no diagnostica.',
    learnMore: 'Nombre del problema, efectos, posición personal.',
  },
  sig_resultados_unicos: {
    authors: 'Telar — elaboración propia (tradición narrativa)',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Exploración de excepciones; uso clínico.',
    validity: 'Identifica momentos en que el problema no mandó.',
    learnMore: 'Un episodio concreto y qué dice de la identidad preferida.',
  },
  sig_linea_vida: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Mapa narrativo; no es línea de vida estandarizada.',
    validity: 'Distingue historia dominante e identidad preferida.',
    learnMore: 'Hitos, giros, testigos y próximo capítulo.',
  },
  sig_carta_problema: {
    authors: 'Telar — elaboración propia',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Escritura terapéutica; uso clínico.',
    validity: 'Toma de posición frente al problema; no es técnica de exposición.',
    learnMore: 'Carta con destinatario, lo que ya no se acepta y cómo sigue.',
  },
  sig_condiciones_valia: {
    authors: 'Telar — elaboración propia (tradición humanista, Rogers)',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Exploración de introyectos; no es escala de autoestima.',
    validity: 'Complementa Rosenberg u otras medidas; no las sustituye.',
    learnMore: 'Mensajes de valía condicional y momentos de congruencia.',
  },
  sig_felt_sense: {
    authors: 'Telar — elaboración propia (Focusing, Gendlin)',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Registro de proceso en sesión; no es tarea. Se puede repetir sesión a sesión.',
    validity: 'Apoya conciencia corporal del “todo eso”; no es mindfulness protocolizado.',
    learnMore: 'Registro de proceso en sesión; no es tarea. Sensación, asa, resonancia, preguntar y recibir.',
  },
  sig_pregunta_milagro: {
    authors: 'Telar — elaboración propia (centrado en soluciones, de Shazer)',
    ageRange: 'Adolescentes y adultos',
    reliability: 'Entrevista estructurada; escala 0–10 subjetiva.',
    validity: 'Orienta hacia excepciones y un paso +1; no niega el problema.',
    learnMore: 'Milagro, testigos, excepciones ya ocurridas y escalamiento.',
  },
};

function mergeModules() {
  const merged = {};
  const assign = (defs, packId) => {
    for (const [id, def] of Object.entries(defs)) {
      if (SKIP.has(id)) continue;
      merged[id] = { ...def, packId };
    }
  };
  assign(CORE_MODULE_DEFS, 'core');
  assign(CLINICAL_MODULE_DEFS, 'clinical-shared');
  assign(ANSIEDAD_DEPRESION_MODULE_DEFS, 'ansiedad-depresion');
  for (const [id, handout] of Object.entries(EXTRA_HANDOUT_DEFS)) {
    if (SKIP.has(id) || merged[id]) continue;
    const intro = String(handout.intro || '').trim();
    const first = intro.split('.')[0];
    const knownCat = handout.category && CATEGORY_LABELS[handout.category] ? handout.category : 'tcc';
    merged[id] = {
      label: handout.title,
      category: knownCat,
      description: first ? `${first}.` : 'Material de trabajo clínico.',
      oncePerTreatment: handout.oncePerTreatment === true,
      allowMultipleInSession: false,
      packId: 'clinical-shared',
    };
  }
  return merged;
}

const PSYCH = { ...MODULE_PSYCHOMETRICS, ...ANSIEDAD_DEPRESION_PSYCHOMETRICS, ...EXTRA_PSYCH };

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const NAV_ITEMS = [
  ['index.html#funciones', 'Funciones'],
  ['modules/index.html', 'Módulos'],
  ['neurofeedback.html', 'Neurofeedback'],
  ['ia.html', 'IA'],
  ['blog/index.html', 'Blog'],
  ['precio.html', 'Precio'],
  ['index.html#contacto', 'Contacto'],
];

const FOOTER_ITEMS = [
  ['index.html', 'Inicio'],
  ['modules/index.html', 'Módulos'],
  ['neurofeedback.html', 'Neurofeedback'],
  ['ia.html', 'IA'],
  ['instituciones.html', 'Instituciones'],
  ['precio.html', 'Precio'],
  ['blog/index.html', 'Blog'],
  ['equipo.html', 'Equipo'],
  ['privacidad.html', 'Privacidad'],
];

function navHtml(depth) {
  const p = depth ? '../'.repeat(depth) : '';
  const links = NAV_ITEMS.map(([href, label]) => `        <a href="${p}${href}">${label}</a>`).join(
    '\n        <span class="nav-divider" aria-hidden="true"></span>\n'
  );
  return `
  <a class="skip-link" href="#contenido">Saltar al contenido</a>
  <header class="nav">
    <div class="nav-inner">
      <a href="${p}index.html" class="brand">
        <img src="${p}assets/icon.png" alt="" width="28" height="28">
        Telar
      </a>
      <button class="nav-toggle" type="button" aria-label="Abrir menú" aria-controls="nav-links" aria-expanded="false" id="nav-toggle">
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <nav class="nav-links" id="nav-links" aria-label="Navegación principal">
${links}
      </nav>
      <div class="nav-actions">
        <a data-download href="https://github.com/maren-keld/telar/releases/latest" class="btn btn-primary btn-nav">
          <span class="btn-label">Descargar Telar</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
      </div>
    </div>
  </header>`;
}

function footerHtml(depth) {
  const p = depth ? '../'.repeat(depth) : '';
  const links = FOOTER_ITEMS.map(([href, label]) => `        <a href="${p}${href}">${label}</a>`).join('\n');
  return `
  <footer class="footer">
    <div class="container footer-grid">
      <div>
        <strong>Telar</strong><br>
        Software de código libre · Datos clínicos 100% locales<br>
        2026
      </div>
      <nav class="footer-links" aria-label="Enlaces del pie">
${links}
        <a href="tel:+56945383084">+56 9 4538 3084</a>
        <a href="https://wa.me/56945383084" target="_blank" rel="noopener">WhatsApp</a>
        <a href="https://github.com/maren-keld/telar" target="_blank" rel="noopener">GitHub</a>
        <a href="https://github.com/maren-keld/telar/blob/main/LICENSE" target="_blank" rel="noopener">Licencia AGPL-3.0</a>
      </nav>
    </div>
  </footer>
  <script src="${p}js/download.js?v=${CSS_V}"></script>
  <script src="${p}js/track.js?v=${CSS_V}"></script>
  <script src="${p}js/nav.js?v=${CSS_V}"></script>`;
}

function pageShell({ title, description, canonical, depth, body, schema }) {
  const p = depth ? '../'.repeat(depth) : '';
  // JSON.stringify no escapa «<», así que un «</script>» en cualquier label o
  // descripción cerraría el bloque antes de tiempo. < es JSON válido y el
  // parser lo lee igual.
  const ld = schema
    ? `\n  <script type="application/ld+json">\n${JSON.stringify(schema, null, 2)
        .replace(/</g, '\\u003c')
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n')}\n  </script>`
    : '';
  return `<!DOCTYPE html>
<html lang="es-CL">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="es_CL">
  <meta property="og:url" content="${escapeHtml(canonical)}">${ld}
  <link rel="icon" href="${p}assets/icon.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <!-- La hoja de Inter no debe bloquear el primer pintado: se pide como
       media="print" y se activa al terminar de bajar. Hasta entonces se ve
       la tipografía del sistema, que es el fallback de --font. -->
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap"></noscript>
  <link rel="stylesheet" href="${p}css/style.css?v=${CSS_V}">
</head>
<body>
${navHtml(depth)}
<main id="contenido">
${body}
</main>
${footerHtml(depth)}
</body>
</html>`;
}

function psychBlock(psych) {
  if (!psych) return '';
  return `
        <dl class="module-psych">
          <div class="module-psych-item">
            <dt>Autor/es</dt>
            <dd>${escapeHtml(psych.authors)}</dd>
          </div>
          <div class="module-psych-item">
            <dt>Rango etario</dt>
            <dd>${escapeHtml(psych.ageRange)}</dd>
          </div>
          <div class="module-psych-item">
            <dt>Confiabilidad</dt>
            <dd>${escapeHtml(psych.reliability)}</dd>
          </div>
          <div class="module-psych-item">
            <dt>Validez (Chile)</dt>
            <dd>${escapeHtml(psych.validity)}</dd>
          </div>
        </dl>
        ${psych.learnMore ? `<p class="module-learn-more">${escapeHtml(psych.learnMore)}</p>` : ''}`;
}

function detailPage(id, def, psych, handout) {
  const label = def.label;
  const intro = handout?.intro || def.description;
  const vars = handout?.variables?.length
    ? `<p class="module-variables"><strong>Variables clínicas:</strong> ${handout.variables.map(escapeHtml).join(' · ')}</p>`
    : '';
  const once = def.oncePerTreatment ? '<span class="module-badge">Una vez por tratamiento</span>' : '';
  const pack = PACK_LABELS[def.packId] || def.packId;

  const extraLink =
    id === 'neurofeedback'
      ? `<p class="module-extra-link"><a href="../neurofeedback.html">Guía completa de Neurofeedback →</a></p>`
      : '';

  const body = `
    <article class="module-detail">
      <section class="page-hero">
        <div class="container">
          <p class="module-breadcrumb"><a href="index.html">Módulos</a> · ${escapeHtml(CATEGORY_LABELS[def.category] || def.category)}</p>
          <p class="post-meta"><span>${escapeHtml(pack)}</span><span>${escapeHtml(CATEGORY_LABELS[def.category] || def.category)}</span></p>
          <h1>${escapeHtml(label)}</h1>
          <p class="page-hero-lead">${escapeHtml(intro)}</p>
          ${once}
        </div>
      </section>
      <section>
        <div class="container module-detail-body">
          <h2 class="section-title section-title--sm">Ficha clínica</h2>
          <p>${escapeHtml(def.description)}</p>
          ${psychBlock(psych)}
          ${vars}
          ${extraLink}
          <p class="module-footer-note">Telar es una herramienta de registro y seguimiento clínico. Este módulo no diagnostica ni prescribe; las decisiones clínicas son responsabilidad del profesional tratante.</p>
          <p><a href="index.html" class="btn btn-secondary">← Volver al catálogo</a></p>
        </div>
      </section>
    </article>`;

  const desc = `${def.description} Autor/es: ${psych?.authors || 'Telar'}.`;
  const canonical = `https://telarapp.cl/modules/${id}`;
  const category = CATEGORY_LABELS[def.category] || def.category;

  return pageShell({
    title: `${label} — Módulos Telar`,
    description: desc.slice(0, 155),
    canonical,
    depth: 1,
    body,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          name: `${label} — Módulos Telar`,
          url: canonical,
          inLanguage: 'es-CL',
          description: intro,
          isPartOf: { '@type': 'WebSite', name: 'Telar', url: 'https://telarapp.cl/' },
          about: {
            '@type': 'Thing',
            name: label,
            description: psych
              ? `${category}. Autor/es: ${psych.authors}. Rango etario: ${psych.ageRange}.`
              : `${category}. Módulo de ${pack} en Telar.`,
          },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://telarapp.cl/' },
            { '@type': 'ListItem', position: 2, name: 'Módulos', item: 'https://telarapp.cl/modules' },
            { '@type': 'ListItem', position: 3, name: label, item: canonical },
          ],
        },
      ],
    },
  });
}

function indexPage(grouped, total) {
  const sections = CATEGORY_ORDER.map((cat) => {
    const items = grouped[cat];
    if (!items?.length) return '';
    const cards = items
      .map(
        ([id, def]) => `
          <a href="${id}.html" class="module-card">
            <h3>${escapeHtml(def.label)}</h3>
            <p>${escapeHtml(def.description)}</p>
          </a>`
      )
      .join('');
    const blurb = CATEGORY_BLURBS[cat]
      ? `<p class="modules-category__blurb">${escapeHtml(CATEGORY_BLURBS[cat])}</p>`
      : '';
    return `
        <section class="modules-category" id="cat-${cat}">
          <h2 class="section-title">${escapeHtml(CATEGORY_LABELS[cat])}</h2>
          ${blurb}
          <div class="modules-grid">${cards}</div>
        </section>`;
  }).join('');

  const body = `
    <section class="page-hero">
      <div class="container">
        <p class="section-label">Catálogo clínico</p>
        <h1 class="section-title">Módulos incluidos en Telar</h1>
        <p class="page-hero-lead">${total} módulos con metadatos clínicos: escalas, habilidades y tareas, significado, conceptualización e intervención en sesión. Misma ficha que ves al seleccionar un módulo en la app.</p>
      </div>
    </section>
    <section class="modules-index">
      <div class="container">
        <nav class="module-category-nav" aria-label="Saltar a categoría">
          ${CATEGORY_ORDER.filter((c) => grouped[c]?.length)
            .map((c) => `<a href="#cat-${c}">${escapeHtml(CATEGORY_LABELS[c])}</a>`)
            .join('')}
        </nav>
        ${sections}
      </div>
    </section>
    <section class="cta-section">
      <div class="cta-box">
        <div>
          <h2>Prueba los módulos en un caso de ejemplo</h2>
          <p>Plan Demo gratis, hasta 3 pacientes activos (los archivados y en pausa no cuentan).</p>
        </div>
        <div class="cta-actions">
          <a data-download href="https://github.com/maren-keld/telar/releases/latest" class="btn btn-primary btn-lg"><span class="btn-label">Descargar Telar</span></a>
        </div>
      </div>
    </section>`;

  return pageShell({
    title: 'Módulos clínicos — Telar | Escalas, TCC, trauma, TDAH',
    description: `Catálogo de ${total} módulos clínicos en Telar: GAD-7, PCL-5, ASRS, habilidades y tareas, significado, estimulación bilateral y Neurofeedback. Con autor, confiabilidad y validez.`,
    canonical: 'https://telarapp.cl/modules',
    depth: 1,
    body,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          name: 'Módulos clínicos incluidos en Telar',
          url: 'https://telarapp.cl/modules',
          inLanguage: 'es-CL',
          description: `Catálogo de ${total} módulos clínicos con autor, rango etario, confiabilidad y validez en Chile.`,
          isPartOf: { '@type': 'WebSite', name: 'Telar', url: 'https://telarapp.cl/' },
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: total,
            itemListElement: CATEGORY_ORDER.filter((c) => grouped[c]?.length).flatMap((c) =>
              grouped[c].map(([id, def]) => ({
                '@type': 'ListItem',
                name: def.label,
                url: `https://telarapp.cl/modules/${id}`,
              }))
            ),
          },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://telarapp.cl/' },
            { '@type': 'ListItem', position: 2, name: 'Módulos', item: 'https://telarapp.cl/modules' },
          ],
        },
      ],
    },
  });
}

// --- main ---
const modules = mergeModules();
const ids = Object.keys(modules).sort((a, b) =>
  modules[a].label.localeCompare(modules[b].label, 'es')
);

mkdirSync(OUT_DIR, { recursive: true });

// Remove old generated pages (keep nothing stale)
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith('.html')) rmSync(join(OUT_DIR, f));
}

const grouped = {};
for (const id of ids) {
  const def = modules[id];
  const cat = def.category || 'otros';
  if (!grouped[cat]) grouped[cat] = [];
  grouped[cat].push([id, def]);
}
for (const cat of Object.keys(grouped)) {
  grouped[cat].sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'));
}

writeFileSync(join(OUT_DIR, 'index.html'), indexPage(grouped, ids.length), 'utf8');

for (const id of ids) {
  const def = modules[id];
  const psych = PSYCH[id] || null;
  const handout = EXTRA_HANDOUT_DEFS[id] || TCC_HANDOUT_DEFS[id] || null;
  writeFileSync(join(OUT_DIR, `${id}.html`), detailPage(id, def, psych, handout), 'utf8');
}

// Nada de stub en landing/modules.html: con cleanUrls, ese archivo y
// modules/index.html compiten por la URL /modules y su meta refresh producía
// un bucle infinito (/modules → /modules/index.html → /modules → …).
// Los enlaces antiguos a /modules.html los cubre el redirect de vercel.json.

// Sitemap: reescribe solo el bloque de módulos, entre marcadores.
const SITEMAP = join(ROOT, 'landing/sitemap.xml');
const MARK_START = '<!-- modules:start -->';
const MARK_END = '<!-- modules:end -->';
const today = new Date().toISOString().slice(0, 10);
const moduleUrls = ids
  .map(
    (id) => `  <url>
    <loc>https://telarapp.cl/modules/${id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`
  )
  .join('\n');

const sitemap = readFileSync(SITEMAP, 'utf8');
const from = sitemap.indexOf(MARK_START);
const to = sitemap.indexOf(MARK_END);
if (from === -1 || to === -1) {
  console.warn(`⚠ ${SITEMAP} sin marcadores ${MARK_START}/${MARK_END}: no se actualizaron las URLs de módulos.`);
} else {
  writeFileSync(
    SITEMAP,
    `${sitemap.slice(0, from + MARK_START.length)}\n${moduleUrls}\n  ${sitemap.slice(to)}`,
    'utf8'
  );
  console.log(`Sitemap: ${ids.length} URLs de módulos actualizadas.`);
}

console.log(`Generated ${ids.length} module pages + index in landing/modules/`);
