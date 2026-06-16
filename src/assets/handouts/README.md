# Handouts TCC — Telar

Material psicoeducativo de elaboración propia para módulos de terapia cognitivo-conductual.

## Archivos

| Archivo | Uso |
|---------|-----|
| `manifest.json` | Catálogo (id, slug, título, tags) |
| `{slug}.txt` | Texto para módulos JS |
| `{slug}.html` | Versión imprimible / exportar al paciente |

## Regenerar desde PDFs originales

```bash
pip install pdfminer.six
python3 scripts/import-handouts-from-downloads.py
# o: python3 scripts/import-handouts-from-downloads.py /ruta/a/pdfs
```

El script normaliza la marca **Telar** en el texto importado.

## Módulos interactivos

Los handouts con módulo JS en `src/js/modules/` están listados en `manifest.json` (`interactive: true`).
