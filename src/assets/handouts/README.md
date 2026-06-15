# Handouts TCC — Telar

Material psicoeducativo de **elaboración propia** (antes Psicoterapia Lab, rebrandeado a Telar).

## Archivos

| Archivo | Uso |
|---------|-----|
| `manifest.json` | Catálogo (id, slug, título, tags, piloto) |
| `{slug}.txt` | Texto limpio para módulos JS / IA |
| `{slug}.html` | Versión imprimible / exportar al paciente |

## Regenerar desde PDFs originales

Los PDFs fuente viven en `~/Downloads` (nombres en el script). Para reimportar:

```bash
pip install pdfminer.six
python3 scripts/import-handouts-from-downloads.py
# o: python3 scripts/import-handouts-from-downloads.py /ruta/a/pdfs
```

El script reemplaza **Psicoterapia Lab → Telar** y no copia los PDFs con marca vieja al repo.

## Piloto interactivo (v0.1.1)

Módulos JS a implementar primero (ver `docs/HANDOUTS-PILOT-AGENT.md`):

1. `abc-modelo-simple` — Modelo ABC
2. `plan-seguridad-vital` — Plan Seguridad Vital
3. `activacion-conductual` — Activación conductual

El resto queda como handout HTML/txt hasta v1.1.
