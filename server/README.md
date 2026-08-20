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
| `GET /api/admin/landing?days=14` | Origen, dispositivo, tiempo en página y comuna, agregados. Requiere la sesión de `/panel`. |

Se guarda **solo un contador por (día, evento)** en la tabla `landing_events`: sin
IP, sin user-agent, sin cookies y sin sesión. El navegador deduplica los pasos
`step:*` en `sessionStorage`, así que el servidor nunca sabe de quién viene un evento.

Nombres válidos: `view:*`, `cta:*`, `step:*`, `src:*`, `dev:*`, `dwell:*` y
`geo:*` (regex `EVENT_NAME_RE`), con un techo de `MAX_DISTINCT_EVENTS` nombres
distintos para que nadie infle la tabla. Los tres rasgos de sesión solo aceptan
valores de una lista cerrada (`ALLOWED_TRAIT_VALUES`); `geo:*` lo escribe el
servidor y se **rechaza** si viene del cliente.

### Comuna del visitante

`geo_event()` traduce la IP a un nombre de comuna **en memoria** al recibir el
primer paso del funnel, guarda `geo:providencia` y descarta la IP: no se
almacena, ni siquiera truncada. Fuera de Chile todo cae en un único
`geo:otro_pais`.

La base es [DB-IP City Lite](https://db-ip.com/db/download/ip-to-city-lite)
(CC BY 4.0), que **no está en git** (~124 MB, se publica una versión nueva cada
mes). La baja `server/fetch-geoip.sh` en el `buildCommand` de Render. Sin ella
la API arranca igual y el panel muestra la sección de comuna apagada — útil en
desarrollo local, donde nunca hace falta.

La atribución a DB-IP que pide la licencia está en `landing/privacidad.html`.

Los cuatro contadores son independientes: no se pueden cruzar entre sí ni
atribuir a una persona. Esa es la razón de que el panel muestre distribuciones
y no una tabla de visitas.

El dashboard vive en `landing/stats.html?secret=TU_WEBHOOK_SECRET` (página con
`noindex`).

### CRM del panel (`/panel`)

La pestaña **Hoy** es un CRM chico para el outreach: grupos de WhatsApp (por
crear o ya activos), personas interesadas, un registro de alcances, y un
objetivo diario deliberadamente pequeño — tres mensajes personales, una cosa
útil publicada, y una demo corta si alguien responde. Los días no cumplidos
quedan marcados en el calendario (zona horaria de Chile).

| Endpoint | Uso |
|----------|-----|
| `GET /api/admin/crm` | Estado: objetivo, historial, grupos, personas, alcances. Sesión de `/panel`. |
| `PATCH /api/admin/crm/today` | Marca el objetivo del día (`messages`, `posted`, `demo` / `demo_na`). |
| `POST/PATCH/DELETE /api/admin/crm/groups` | Grupos de WhatsApp. |
| `POST/PATCH/DELETE /api/admin/crm/people` | Personas interesadas. |
| `POST/DELETE /api/admin/crm/reaches` | Registro de alcances. |

> **Requisito de despliegue:** `ALLOWED_ORIGINS` debe incluir `https://telarapp.cl`
> para que `stats.html` pueda leer `/api/admin/funnel`. Ya viene en el valor por
> defecto; si lo defines a mano en Render, no lo omitas.

## Base de datos

| `DATABASE_URL` | Motor | Cuándo |
|----------------|-------|--------|
| definida | Postgres | Producción |
| vacía | SQLite en `SUBSCRIPTION_DB_PATH` | Desarrollo y tests |

El código escribe SQL con `?` como placeholder y `_Conn` lo traduce; el único
lugar donde los dialectos difieren es el `AUTOINCREMENT` de `_create_schema()`.

### Por qué Postgres

En el plan free de Render el filesystem es efímero y **el servicio se duerme tras
~15 minutos sin tráfico**, volviendo como contenedor nuevo. Con SQLite eso borra
la base cada vez que hay un hueco de tráfico, así que los contadores del funnel
nunca acumulan más que unas horas.

Las suscripciones toleraban ese borrado (Mercado Pago es la fuente de verdad y
`status()` reconstruye la fila), pero los contadores no tienen de dónde
recuperarse: sin Postgres, se pierden y ya.

### Configurar Neon

1. Crea un proyecto en [Neon](https://neon.tech) (capa gratuita).
2. Copia la cadena de conexión y pégala en `DATABASE_URL` en Render.
3. Usa el host **con `-pooler`** (pgbouncer): cada request abre su propia
   conexión y el pooler evita agotar el límite de la capa gratuita.

Las tablas se crean solas al arrancar. `init_db()` reintenta 3 veces porque Neon
suspende el cómputo cuando no hay tráfico y la primera conexión tras dormir puede
fallar; sin reintento, esa falla mataría al worker de gunicorn al importar.

### Tests

```bash
cd server && pytest                      # solo SQLite
TEST_DATABASE_URL=postgresql://… pytest  # SQLite y Postgres
```

Cada test corre una vez por motor. Sin `TEST_DATABASE_URL` la variante Postgres
se omite en vez de fallar.

## Checklist antes de cobrar en producción

- [ ] Access Token de **producción** en el servidor
- [ ] `BACKEND_URL` y webhook HTTPS configurados
- [ ] Probar un pago de prueba con tarjetas de test MP
- [ ] Política de cancelación visible en la landing
- [ ] Actualizar precio en modal si cambia (hoy: 19.990 CLP)
