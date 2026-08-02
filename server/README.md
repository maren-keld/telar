# API de suscripciones — Plan Profesional

Backend mínimo para cobrar **$19.990 CLP/mes** con **Mercado Pago** (Chile).

## Qué necesitas de Mercado Pago

Ya tienes cuenta; falta crear la **aplicación** y sacar las credenciales:

1. Entra a [Mercado Pago Developers](https://www.mercadopago.cl/developers/panel/app).
2. **Crear aplicación** → nombre: `Telar`.
3. En **Credenciales de prueba** (para desarrollo):
   - Copia el **Access Token** de prueba → `MP_ACCESS_TOKEN` en `.env`.
4. En **Credenciales de producción** (cuando vayas live):
   - Activa producción (MP puede pedir datos del negocio).
   - Usa el **Access Token de producción** en el servidor desplegado.

No necesitas Public Key en este flujo: el checkout es **redirect** a la página de Mercado Pago (`init_point`).

## Configuración local

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edita .env con tu MP_ACCESS_TOKEN
python app.py
```

Prueba: `curl http://localhost:5001/api/health`

## Desplegar (HTTPS obligatorio para webhooks)

Mercado Pago exige URL **HTTPS** para notificaciones. Opciones baratas:

| Servicio | Costo | Notas |
|----------|-------|-------|
| [Render](https://render.com) | Gratis (tier free) | Fácil, duerme tras inactividad |
| [Railway](https://railway.app) | ~USD 5/mes | Siempre activo |
| [PythonAnywhere](https://www.pythonanywhere.com) | Gratis limitado | Solo HTTPS en plan de pago |

Tras desplegar, pon la URL en `BACKEND_URL` (ej. `https://telar-api.onrender.com`).

## Webhook en Mercado Pago

1. Developers → tu app → **Webhooks**.
2. URL de producción:
   ```
   https://TU-BACKEND/api/webhooks/mercadopago?secret=TU_WEBHOOK_SECRET
   ```
3. Eventos: **Planes y suscripciones** / `subscription_preapproval`.

El `WEBHOOK_SECRET` lo defines tú en `.env` (cualquier string largo).

## Flujo completo

```
App escritorio → POST /api/subscriptions/checkout { email }
              ← { checkout_url }
Usuario paga en Mercado Pago
MP → webhook → actualiza status en SQLite
App → GET /api/subscriptions/status?email= → { active: true }
App guarda plan: "pro" en perfil local
```

## Conectar la app de escritorio

En `src/js/subscription.js` cambia `SUBSCRIPTION_API_BASE` a tu URL desplegada, o define en consola:

```js
window.TELAR_SUBSCRIPTION_API = 'https://tu-api.onrender.com';
```

La app abre el checkout en el navegador y, al volver, puede consultar el estado con el email del perfil (Ajustes).

## Analítica del landing (funnel)

Endpoints agregados para medir el embudo de `telarapp.cl`:

| Endpoint | Uso |
|----------|-----|
| `POST /api/events` | Recibe `{"name": "view:precio"}` desde `landing/js/track.js`. Responde 204 siempre. |
| `GET /api/admin/funnel?secret=…&days=30` | Devuelve funnel, serie diaria y totales. Requiere `WEBHOOK_SECRET`. |

Se guarda **solo un contador por (día, evento)** en la tabla `landing_events`: sin
IP, sin user-agent, sin cookies y sin sesión. El navegador deduplica los pasos
`step:*` en `sessionStorage`, así que el servidor nunca sabe de quién viene un evento.

Nombres válidos: `view:*`, `cta:*` y `step:*` (regex `EVENT_NAME_RE`), con un techo
de `MAX_DISTINCT_EVENTS` nombres distintos para que nadie infle la tabla.

El dashboard vive en `landing/stats.html?secret=TU_WEBHOOK_SECRET` (página con
`noindex`).

> **Requisito de despliegue:** `ALLOWED_ORIGINS` debe incluir `https://telarapp.cl`
> para que `stats.html` pueda leer `/api/admin/funnel`. Ya viene en el valor por
> defecto; si lo defines a mano en Render, no lo omitas.

> **Persistencia:** en el plan free de Render el filesystem es efímero y no admite
> disco persistente, así que `subscriptions.db` (suscripciones **y** contadores) se
> pierde en cada deploy o reinicio. Para conservar histórico hace falta un disco
> persistente (plan de pago) o mover la base a Postgres gestionado.

## Checklist antes de cobrar en producción

- [ ] Access Token de **producción** en el servidor
- [ ] `BACKEND_URL` y webhook HTTPS configurados
- [ ] Probar un pago de prueba con tarjetas de test MP
- [ ] Política de cancelación visible en la landing
- [ ] Actualizar precio en modal si cambia (hoy: 19.990 CLP)
