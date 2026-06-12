# Landing page — despliegue en Vercel + GitHub

La landing está en `landing/` (HTML estático, sin build). Mensaje alineado al [plan de marketing junio 2026](https://github.com/maren-keld/psicoterapialab).

---

## Qué incluye

- Hero con propuesta de valor (datos locales + NF + psicometría Chile)
- Comparación problema / solución
- Grid de funciones (sin prometer IA como feature)
- Planes Gratis vs Pro ($15.000 CLP/mes)
- Requisitos Mac/Windows + Muse 2
- Guía instalación Mac (Gatekeeper — S1.2)
- CTA demo por correo (mailto)
- Enlaces a GitHub y términos/privacidad

---

## Desplegar en Vercel (gratis)

1. Sube el repo a **GitHub** (`maren-keld/psicoterapialab`)
2. Entra a [vercel.com](https://vercel.com) → **Add New Project**
3. Importa el repositorio
4. En **Root Directory** escribe: `landing`
5. Framework Preset: **Other** (sin build command)
6. Deploy

Cada `git push` a `main` redeploya automáticamente.

### Dominio propio (opcional)

En Vercel → Project → **Domains** → agrega `psicoterapialab.cl` (o el que tengas). Configura DNS según indique Vercel. Costo dominio .cl ~$10.000–15.000 CLP/año en NIC Chile.

---

## Personalizar antes de publicar

| Archivo | Qué cambiar |
|---------|-------------|
| `landing/index.html` | Email en CTA (`hola@psicoterapialab.cl` → tu correo real) |
| `landing/index.html` | Oferta fundador junio (fechas/precio) |
| `landing/assets/` | Agregar capturas reales de la app (sustituir mockup CSS) |

---

## Alternativa: GitHub Pages

Si prefieres no usar Vercel:

1. Repo → **Settings** → **Pages**
2. Source: branch `main`, folder `/landing`
3. URL: `https://maren-keld.github.io/psicoterapialab/`

Vercel suele ser más rápido para dominio custom y previews por PR.

---

## Arquitectura

```
GitHub (repo)          Vercel (hosting gratis)
     │                        │
     └── landing/  ──────────►│  HTML estático
                              │  CDN global
                              │
Render (ya configurado)       │
     └── server/  ───────────►│  API suscripciones MP
                               │  (datos clínicos NO van aquí)
```

La landing **no** comparte código con la app Tauri; vive en su carpeta para no mezclar el build de escritorio.
