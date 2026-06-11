# Suscripciones Plan Profesional — Opción B

App **local** + mini API en internet **solo para cobrar**. No usa psicoterapialab.com ni Bubble.

---

## Qué va dónde

| Dónde | Qué guarda |
|-------|------------|
| Tu Mac (app) | Pacientes, sesiones, todo lo clínico |
| Render (gratis) | Solo `email → ¿pagó la suscripción?` |
| Mercado Pago | El cobro de $15.000 CLP/mes |

---

## Paso 1 — Probar en tu Mac (30 min)

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edita `server/.env`:

```env
MP_ACCESS_TOKEN=TEST-tu-token-de-prueba
BACKEND_URL=http://localhost:5001
FRONTEND_RETURN_URL=http://localhost:5001/gracias
PLAN_AMOUNT_CLP=15000
WEBHOOK_SECRET=mi-secreto-local
PORT=5001
```

El token **TEST-** lo sacas de: MP Developers → Credenciales de **prueba**.

Arranca:

```bash
python app.py
```

Otra terminal:

```bash
curl http://localhost:5001/api/health
# → {"mp_configured": true, "ok": true}
```

Prueba en la app (`./scripts/dev.sh`):

1. **Ajustes** → configura **email**
2. En consola del navegador (Cmd+Option+I): no hace falta override; localhost es el default
3. **Plan** → Suscribirse → paga con tarjeta test Chile, titular **`APRO`**
4. **Ya pagué — verificar suscripción**

---

## Paso 2 — Subir a Render (15 min)

1. Sube el repo a **GitHub** (si no está)
2. [render.com](https://render.com) → **New +** → **Blueprint**
3. Conecta el repo → Render detecta `render.yaml`
4. Te pedirá **MP_ACCESS_TOKEN** manualmente → pega el token **TEST-** primero
5. Deploy → anota la URL, ej. `https://psicoterapia-lab-api.onrender.com`
6. En Render → **Environment**:
   - `BACKEND_URL` = esa misma URL
   - `FRONTEND_RETURN_URL` = `https://psicoterapia-lab-api.onrender.com/gracias`

Verifica:

```bash
curl https://psicoterapia-lab-api.onrender.com/api/health
```

---

## Paso 3 — Webhook Mercado Pago (5 min)

1. [MP Developers](https://www.mercadopago.cl/developers/panel/app) → **Webhooks**
2. **Configurar notificaciones**
3. Ambiente: **Prueba** (mientras uses token TEST)
4. URL (copia `WEBHOOK_SECRET` de Render → Environment):

```
https://TU-URL.onrender.com/api/webhooks/mercadopago?secret=EL_SECRETO_DE_RENDER
```

5. Eventos: **Planes y suscripciones**
6. Guardar

---

## Paso 4 — Conectar la app de escritorio (2 min)

1. Abre `src/js/subscription-config.js`
2. Pega tu URL de Render:

```js
export const SUBSCRIPTION_API_PRODUCTION = 'https://psicoterapia-lab-api.onrender.com';
```

3. Recompila:

```bash
./scripts/finish-iteration.sh
./scripts/open-app.sh
```

4. Prueba de nuevo: Ajustes → Plan → Suscribirse → Verificar

---

## Paso 5 — Producción real (cuando todo funcione en prueba)

1. Render → cambia `MP_ACCESS_TOKEN` al de **Credenciales de producción**
2. MP Webhooks → repite la misma URL en ambiente **Productivo**
3. Prueba un pago real contigo mismo ($15.000)

---

## Tarjetas de prueba (Chile)

| Campo | Valor |
|-------|-------|
| Visa | `4168 8188 4444 7115` |
| CVV | `123` |
| Vence | `11/30` |
| Titular | `APRO` = aprobado |

---

## Problemas frecuentes

| Síntoma | Solución |
|---------|----------|
| "Mercado Pago no configurado" | Falta `MP_ACCESS_TOKEN` en Render |
| "Configura tu email" | Ajustes → Correo electrónico |
| Verificar no activa Pro | Espera 1 min; revisa webhook en MP; usa mismo email que en Ajustes |
| Render lento al primer request | Plan free "duerme"; el primer click tarda ~30 s |
| No quiero psicoterapialab.com | Correcto, no lo necesitas; `/gracias` vive en el mismo Render |
