#!/usr/bin/env node
/**
 * Genera landing/manual/*.html desde landing/manual/src/*.md
 * Ejecutar: node scripts/generate-landing-manual.mjs
 */
import { writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'landing/manual/src');
const OUT_DIR = join(ROOT, 'landing/manual');
const CSS_V = '20260905a';
const SITE = 'https://telarapp.cl';

const NAV_ITEMS = [
  ['../index.html#valor', 'Funciones'],
  ['../modules/index.html', 'Módulos'],
  ['../cursos/index.html', 'Cursos'],
  ['../blog/index.html', 'Blog'],
  ['index.html', 'Manual'],
  ['../precio.html', 'Precio'],
  ['../index.html#contacto', 'Contacto'],
];

const FOOTER_ITEMS = [
  ['../index.html', 'Inicio'],
  ['../descargar.html', 'Descargar'],
  ['../modules/index.html', 'Módulos'],
  ['../cursos/index.html', 'Cursos'],
  ['../neurofeedback.html', 'Curso de neurofeedback'],
  ['../instituciones.html', 'Instituciones'],
  ['../precio.html', 'Precio'],
  ['index.html', 'Manual'],
  ['../blog/index.html', 'Blog'],
  ['../equipo.html', 'Equipo'],
  ['../privacidad.html', 'Privacidad'],
  ['../terminos.html', 'Términos'],
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[key] = key === 'order' ? Number(val) : val;
  }
  return { meta, body: m[2] };
}

function inlineMd(text) {
  let s = escapeHtml(text);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = href.replace(/"/g, '&quot;');
    const external = /^https?:\/\//i.test(href);
    const rel = external ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${safeHref}"${rel}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Minimal Markdown → HTML (headings, lists, tables, paragraphs, blockquotes). */
function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let skippedH1 = false;

  const flushPara = (buf) => {
    const t = buf.join(' ').trim();
    if (t) out.push(`<p>${inlineMd(t)}</p>`);
    buf.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      if (level === 1 && !skippedH1) {
        skippedH1 = true;
        i += 1;
        continue;
      }
      const id = slugifyHeading(text);
      out.push(`<h${level} id="${id}">${inlineMd(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        buf.push(lines[i].slice(2));
        i += 1;
      }
      out.push(`<aside class="manual-callout">${inlineMd(buf.join(' '))}</aside>`);
      continue;
    }

    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        const cells = lines[i]
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
        rows.push(cells);
        i += 1;
        if (i < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i].trim())) {
          i += 1; // separator
        }
      }
      const [header, ...body] = rows;
      const thead = `<thead><tr>${header.map((c) => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${body
        .map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      out.push(`<div class="manual-table-wrap"><table class="manual-table">${thead}${tbody}</table></div>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      out.push('<ul>');
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        out.push(`<li>${inlineMd(lines[i].replace(/^[-*]\s+/, ''))}</li>`);
        i += 1;
      }
      out.push('</ul>');
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      out.push('<ol>');
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        out.push(`<li>${inlineMd(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      out.push('</ol>');
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    const buf = [line];
    i += 1;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,3}\s|[-*]\s|\d+\.\s|>\s|\|)/.test(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    flushPara(buf);
  }

  return out.join('\n');
}

function loadChapters() {
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.md'));
  const chapters = files.map((file) => {
    const raw = readFileSync(join(SRC_DIR, file), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    if (!meta.slug || !meta.title) {
      throw new Error(`Frontmatter incompleto en ${file} (title, slug)`);
    }
    return {
      file,
      title: meta.title,
      slug: meta.slug,
      order: Number(meta.order) || 0,
      summary: meta.summary || '',
      bodyMd: body,
      bodyHtml: mdToHtml(body),
    };
  });
  chapters.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'es'));
  return chapters;
}

function tocNav(chapters, currentSlug) {
  const items = [
    `<li><a href="index.html"${currentSlug == null ? ' aria-current="page"' : ''}>Índice</a></li>`,
    ...chapters.map(
      (c) =>
        `<li><a href="${escapeHtml(c.slug)}.html"${
          c.slug === currentSlug ? ' aria-current="page"' : ''
        }>${escapeHtml(c.title)}</a></li>`
    ),
  ];
  return `<nav class="manual-toc" aria-label="Capítulos del manual">
  <p class="manual-toc__label">Manual</p>
  <ol class="manual-toc__list">
    ${items.join('\n    ')}
  </ol>
</nav>`;
}

function navHtml(activeManual) {
  const links = NAV_ITEMS.map(([href, label]) => {
    const current =
      label === 'Manual' && activeManual ? ' aria-current="page"' : '';
    return `        <a href="${href}"${current}>${label}</a>`;
  }).join('\n        <span class="nav-divider" aria-hidden="true"></span>\n');
  return `
  <a class="skip-link" href="#contenido">Saltar al contenido</a>
  <header class="nav">
    <div class="nav-inner">
      <a href="../index.html" class="brand">
        <img src="../assets/icon.png" alt="" width="28" height="28">
        Telar
      </a>
      <button class="nav-toggle" type="button" aria-label="Abrir menú" aria-controls="nav-links" aria-expanded="false" id="nav-toggle">
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <nav class="nav-links" id="nav-links" aria-label="Navegación principal">
${links}
      </nav>
      <div class="nav-actions">
        <a href="../descargar.html" class="btn btn-primary btn-nav">Probar gratis</a>
      </div>
    </div>
  </header>`;
}

function footerHtml() {
  const links = FOOTER_ITEMS.map(([href, label]) => `        <a href="${href}">${label}</a>`).join('\n');
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
        <a href="mailto:contacto@telarapp.cl">contacto@telarapp.cl</a>
        <a href="https://github.com/maren-keld/telar" target="_blank" rel="noopener">GitHub</a>
        <a href="https://github.com/maren-keld/telar/blob/main/LICENSE" target="_blank" rel="noopener">Licencia AGPL-3.0</a>
      </nav>
    </div>
  </footer>
  <script src="../js/download.js?v=${CSS_V}"></script>
  <script src="../js/track.js?v=${CSS_V}"></script>
  <script src="../js/nav.js?v=${CSS_V}"></script>`;
}

function pageShell({ title, description, canonical, body, schema }) {
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
  <meta property="og:type" content="article">
  <meta property="og:locale" content="es_CL">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="Telar">${ld}
  <link rel="icon" href="../assets/icon.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap"></noscript>
  <link rel="stylesheet" href="../css/style.css?v=${CSS_V}">
</head>
<body class="manual-page">
${navHtml(true)}
<main id="contenido">
${body}
</main>
${footerHtml()}
</body>
</html>
`;
}

function chapterNav(chapters, index) {
  const prev = chapters[index - 1];
  const next = chapters[index + 1];
  return `<nav class="manual-pager" aria-label="Capítulo anterior y siguiente">
  ${
    prev
      ? `<a class="manual-pager__prev" href="${escapeHtml(prev.slug)}.html"><span class="manual-pager__dir">Anterior</span><span class="manual-pager__title">${escapeHtml(prev.title)}</span></a>`
      : `<span class="manual-pager__prev manual-pager__prev--empty"></span>`
  }
  ${
    next
      ? `<a class="manual-pager__next" href="${escapeHtml(next.slug)}.html"><span class="manual-pager__dir">Siguiente</span><span class="manual-pager__title">${escapeHtml(next.title)}</span></a>`
      : `<span class="manual-pager__next manual-pager__next--empty"></span>`
  }
</nav>`;
}

function writeChapter(chapter, chapters, index) {
  const canonical = `${SITE}/manual/${chapter.slug}`;
  const body = `
  <div class="manual-layout">
    ${tocNav(chapters, chapter.slug)}
    <article class="manual-article">
      <header class="manual-article__header">
        <p class="manual-breadcrumb"><a href="index.html">Manual</a> / ${escapeHtml(chapter.title)}</p>
        <p class="section-label">Capítulo ${chapter.order}</p>
        <h1>${escapeHtml(chapter.title)}</h1>
        ${chapter.summary ? `<p class="manual-lead">${escapeHtml(chapter.summary)}</p>` : ''}
      </header>
      <div class="manual-prose">
${chapter.bodyHtml}
      </div>
      ${chapterNav(chapters, index)}
    </article>
  </div>`;

  const html = pageShell({
    title: `${chapter.title} — Manual Telar`,
    description: chapter.summary || `${chapter.title} en el manual de Telar.`,
    canonical,
    body,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'TechArticle',
          headline: chapter.title,
          description: chapter.summary || chapter.title,
          inLanguage: 'es-CL',
          url: canonical,
          isPartOf: {
            '@type': 'CreativeWork',
            name: 'Manual de Telar',
            url: `${SITE}/manual`,
          },
          author: { '@type': 'Organization', name: 'Telar' },
          publisher: {
            '@type': 'Organization',
            name: 'Telar',
            url: `${SITE}/`,
            logo: { '@type': 'ImageObject', url: `${SITE}/assets/icon.png` },
          },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Telar', item: `${SITE}/` },
            { '@type': 'ListItem', position: 2, name: 'Manual', item: `${SITE}/manual` },
            { '@type': 'ListItem', position: 3, name: chapter.title, item: canonical },
          ],
        },
      ],
    },
  });

  writeFileSync(join(OUT_DIR, `${chapter.slug}.html`), html, 'utf8');
}

function writeIndex(chapters) {
  const cards = chapters
    .map(
      (c) => `
        <li class="manual-index-card">
          <a href="${escapeHtml(c.slug)}.html">
            <span class="manual-index-card__num">${String(c.order).padStart(2, '0')}</span>
            <span class="manual-index-card__body">
              <span class="manual-index-card__title">${escapeHtml(c.title)}</span>
              ${c.summary ? `<span class="manual-index-card__summary">${escapeHtml(c.summary)}</span>` : ''}
            </span>
          </a>
        </li>`
    )
    .join('');

  const body = `
  <div class="manual-layout">
    ${tocNav(chapters, null)}
    <div class="manual-article">
      <header class="manual-article__header">
        <p class="section-label">Documentación</p>
        <h1>Manual de Telar</h1>
        <p class="manual-lead">Guía de uso de la aplicación de escritorio: instalación, pacientes, workspace, módulos, neurofeedback, IA y privacidad.</p>
        <div class="hero-actions">
          <a href="../descargar.html" class="btn btn-primary btn-lg">Descargar Telar</a>
          <a href="${escapeHtml(chapters[0]?.slug || 'que-es-telar')}.html" class="btn btn-secondary btn-lg">Empezar a leer</a>
        </div>
      </header>
      <ol class="manual-index-list">
${cards}
      </ol>
    </div>
  </div>`;

  const html = pageShell({
    title: 'Manual de Telar — Guía de uso para psicólogos',
    description:
      'Manual de usuario de Telar: instalación, pacientes, workspace, escalas, neurofeedback Muse 2, IA opcional, privacidad y planes Demo/Pro.',
    canonical: `${SITE}/manual`,
    body,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          name: 'Manual de Telar',
          url: `${SITE}/manual`,
          inLanguage: 'es-CL',
          description:
            'Manual de usuario de la aplicación clínica Telar para psicólogos.',
          isPartOf: { '@type': 'WebSite', name: 'Telar', url: `${SITE}/` },
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: chapters.length,
            itemListElement: chapters.map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: c.title,
              url: `${SITE}/manual/${c.slug}`,
            })),
          },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Telar', item: `${SITE}/` },
            { '@type': 'ListItem', position: 2, name: 'Manual', item: `${SITE}/manual` },
          ],
        },
      ],
    },
  });

  writeFileSync(join(OUT_DIR, 'index.html'), html, 'utf8');
}

function writeLlmsFull(chapters) {
  const parts = [
    '# Manual de Telar (texto completo para LLMs)',
    '',
    `Fuente: ${SITE}/manual`,
    'Idioma: es-CL',
    '',
    '---',
    '',
  ];
  for (const c of chapters) {
    parts.push(`# ${c.title}`);
    parts.push(`URL: ${SITE}/manual/${c.slug}`);
    if (c.summary) parts.push(c.summary);
    parts.push('');
    parts.push(c.bodyMd.trim());
    parts.push('');
    parts.push('---');
    parts.push('');
  }
  writeFileSync(join(OUT_DIR, 'llms-full.txt'), parts.join('\n'), 'utf8');
}

// --- main ---
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(SRC_DIR, { recursive: true });

for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith('.html') || f === 'llms-full.txt') {
    rmSync(join(OUT_DIR, f));
  }
}

const chapters = loadChapters();
if (!chapters.length) {
  console.error('No hay capítulos en landing/manual/src/');
  process.exit(1);
}

writeIndex(chapters);
chapters.forEach((c, i) => writeChapter(c, chapters, i));
writeLlmsFull(chapters);

console.log(`Manual: ${chapters.length} capítulos → landing/manual/`);
for (const c of chapters) {
  console.log(`  ${String(c.order).padStart(2, '0')}. ${c.slug}`);
}
