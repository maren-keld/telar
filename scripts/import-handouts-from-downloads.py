#!/usr/bin/env python3
"""Importa handouts TCC desde PDFs locales → src/assets/handouts/ (marca Telar).

Uso:
  python3 scripts/import-handouts-from-downloads.py
  python3 scripts/import-handouts-from-downloads.py /ruta/a/Downloads

Requisito: pip install pdfminer.six
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pdfminer.high_level import extract_text

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "assets" / "handouts"
DEFAULT_SRC = Path.home() / "Downloads"

HANDOUTS = [
    {
        "id": "abc_modelo_simple",
        "slug": "abc-modelo-simple",
        "title": "Modelo ABC (Versión Simple)",
        "source": "modelo-abc-version-simple-docx.pdf",
        "category": "tcc",
        "tags": ["tcc", "cognitivo", "tdah", "trauma"],
        "pilot": True,
    },
    {
        "id": "activacion_conductual",
        "slug": "activacion-conductual",
        "title": "Activación conductual",
        "source": "activacion-conductualdocx.pdf",
        "category": "tcc",
        "tags": ["tcc", "conductual", "tdah", "animo"],
        "pilot": True,
    },
    {
        "id": "plan_seguridad_vital",
        "slug": "plan-seguridad-vital",
        "title": "Plan Seguridad Vital",
        "source": "plan-seguridad-vital.pdf",
        "category": "tcc",
        "tags": ["tcc", "trauma", "crisis", "seguridad"],
        "pilot": True,
    },
    {
        "id": "cuestionamiento_socratico",
        "slug": "cuestionamiento-socratico",
        "title": "Cuestionamiento socrático",
        "source": "cuestionamiento-socratico.pdf",
        "category": "tcc",
        "tags": ["tcc", "cognitivo", "ansiedad"],
        "pilot": False,
    },
    {
        "id": "flexibilidad_cognitiva",
        "slug": "flexibilidad-cognitiva",
        "title": "Rutinas de flexibilidad cognitiva",
        "source": "rutinas-de-flexibilidad-cognitivadocx.pdf",
        "category": "tcc",
        "tags": ["tcc", "cognitivo", "tdah"],
        "pilot": False,
    },
    {
        "id": "probabilidades_posibilidades",
        "slug": "probabilidades-vs-posibilidades",
        "title": "Probabilidades vs Posibilidades",
        "source": "probabilidades-vs-posibilidadesdocx.pdf",
        "category": "tcc",
        "tags": ["tcc", "ansiedad", "trauma"],
        "pilot": False,
    },
    {
        "id": "identificando_sesgos",
        "slug": "identificando-sesgos",
        "title": "Identificando sesgos",
        "source": "identificando-sesgosdocx.pdf",
        "category": "tcc",
        "tags": ["tcc", "cognitivo"],
        "pilot": False,
    },
    {
        "id": "exploracion_autoconceptos",
        "slug": "exploracion-autoconceptos",
        "title": "Exploración de autoconceptos",
        "source": "exploracion-de-autoconceptosdocx.pdf",
        "category": "tcc",
        "tags": ["tcc", "trauma", "esquemas"],
        "pilot": False,
    },
    {
        "id": "exploracion_preocupaciones",
        "slug": "exploracion-preocupaciones",
        "title": "Exploración de preocupaciones",
        "source": "exploracion-de-preocupacionesdocx.pdf",
        "category": "tcc",
        "tags": ["tcc", "ansiedad", "tdah"],
        "pilot": False,
    },
    {
        "id": "rutinas_gratitud",
        "slug": "rutinas-gratitud",
        "title": "Rutinas de gratitud",
        "source": "rutinas-de-gratituddocx.pdf",
        "category": "tcc",
        "tags": ["tcc", "regulacion", "trauma"],
        "pilot": False,
    },
    {
        "id": "rutinas_reduccion_estres",
        "slug": "rutinas-reduccion-estres",
        "title": "Rutinas de reducción de estrés",
        "source": "rutinas-de-reduccion-de-estresdocx.pdf",
        "category": "tcc",
        "tags": ["tcc", "estres", "trauma", "tdah"],
        "pilot": False,
    },
]

CSS = """
body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:40px auto;padding:0 24px 48px;color:#1a1a1a;line-height:1.55}
.brand{color:#2f6fed;font-size:.85rem;font-weight:600;margin-bottom:4px}
h1{font-size:1.35rem;margin:0 0 16px}
p{margin:0 0 12px}
.intro{color:#444}
.section{margin:24px 0 16px}
.section h2{font-size:1rem;margin:0 0 10px}
.prompt{margin:16px 0 8px;font-weight:600}
.field{border-bottom:1px solid #bbb;min-height:1.5em;margin:8px 0 16px}
.quiz{margin:12px 0;padding-left:0;list-style:none}
.quiz li{margin:8px 0}
.footer{margin-top:40px;font-size:.75rem;color:#888;border-top:1px solid #eee;padding-top:16px}
@media print{body{margin:16px}}
"""


def clean_text(raw: str) -> str:
    text = raw.replace("\r", "\n")
    text = re.sub(r"Psicoterapia Lab", "Telar", text)
    text = re.sub(r"Psicoterapia lab", "Telar", text)
    text = re.sub(r"\n-- \d+ of \d+ --\n", "\n", text)
    lines = []
    for ln in text.splitlines():
        stripped = ln.strip()
        if not stripped:
            lines.append("")
            continue
        # líneas de relleno del PDF (guiones bajos)
        if re.match(r"^[_\s\-]+$", stripped):
            continue
        if stripped.count("_") > 10:
            continue
        lines.append(stripped)
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def strip_header(text: str, title: str) -> str:
    lines = text.splitlines()
    out = []
    for ln in lines:
        s = ln.strip()
        if not s:
            out.append("")
            continue
        if s.startswith("Telar —"):
            continue
        if s == title or s.replace(" ", "") == title.replace(" ", ""):
            continue
        out.append(s)
    return "\n".join(out).strip()


def is_prompt(line: str) -> bool:
    if line.endswith("?"):
        return True
    if line.startswith("¿"):
        return True
    if re.match(r"^\d+\.", line):
        return True
    if line in ("Preguntas", "Actividades", "Actividades – Corto plazo", "Actividades – Mediano/largo plazo"):
        return True
    if line.startswith("Casos prácticos"):
        return True
    if line.startswith("Evento activador") or line.startswith("Creencias —") or line.startswith("Consecuencias —"):
        return True
    return False


def text_to_html(title: str, body: str) -> str:
    parts = [
        "<!DOCTYPE html>",
        '<html lang="es">',
        "<head>",
        f"<meta charset=\"UTF-8\"><title>{title} — Telar</title>",
        f"<style>{CSS}</style>",
        "</head>",
        "<body>",
        '<p class="brand">Telar · Material psicoeducativo TCC</p>',
        f"<h1>{title}</h1>",
    ]
    lines = body.splitlines()
    i = 0
    while i < len(lines):
        ln = lines[i].strip()
        i += 1
        if not ln:
            continue
        if ln in ("Preguntas", "Actividades", "Actividades – Corto plazo", "Actividades – Mediano/largo plazo"):
            parts.append(f'<div class="section"><h2>{ln}</h2></div>')
            continue
        if ln.startswith("Casos prácticos"):
            parts.append(f'<div class="section"><h2>{ln}</h2><ul class="quiz">')
            while i < len(lines):
                q = lines[i].strip()
                i += 1
                if not q:
                    continue
                if q.startswith("Casos prácticos") or q in ("Preguntas", "Actividades"):
                    i -= 1
                    break
                parts.append(f"<li>{q}</li>")
            parts.append("</ul></div>")
            continue
        if is_prompt(ln):
            parts.append(f'<p class="prompt">{ln}</p>')
            parts.append('<div class="field">&nbsp;</div>' * 3)
            continue
        parts.append(f'<p class="intro">{ln}</p>' if parts[-1] == f"<h1>{title}</h1>" else f"<p>{ln}</p>")
    parts.append('<p class="footer">Telar · telarapp.cl · Material de elaboración propia · Uso clínico profesional</p>')
    parts.append("</body></html>")
    return "\n".join(parts)


def main() -> int:
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []

    for item in HANDOUTS:
        pdf_path = src_dir / item["source"]
        if not pdf_path.exists():
            print(f"SKIP missing: {pdf_path}", file=sys.stderr)
            continue
        raw = extract_text(str(pdf_path))
        text = clean_text(raw)
        text = strip_header(text, item["title"])
        slug = item["slug"]
        (OUT / f"{slug}.txt").write_text(text + "\n", encoding="utf-8")
        (OUT / f"{slug}.html").write_text(text_to_html(item["title"], text), encoding="utf-8")
        manifest.append({k: item[k] for k in ("id", "slug", "title", "category", "tags", "pilot")})
        manifest[-1]["txt"] = f"{slug}.txt"
        manifest[-1]["html"] = f"{slug}.html"
        print(f"OK {slug}")

    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(manifest)} handouts → {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
