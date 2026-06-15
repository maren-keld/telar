# Suscripciones Plan Profesional — Opción B

App **local** + mini API en internet **solo para cobrar**. No usa telarapp.cl ni Bubble.

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

**Atajo:** tras el Blueprint, verifica todo con:

```bash
./scripts/deploy-subscription-api.sh
```

(Requiere que el servicio `telar-api` esté desplegado y `MP_ACCESS_TOKEN` real en Render.)


1. Sube el repo a **GitHub** (si no está)
2. [render.com](https://render.com) → **New +** → **Blueprint**
3. Conecta el repo → Render detecta `render.yaml`
4. Te pedirá **MP_ACCESS_TOKEN** manualmente → pega el token **TEST-** primero
5. Deploy → anota la URL, ej. `https://telar-api.onrender.com`
6. En Render → **Environment**:
   - `BACKEND_URL` = esa misma URL
   - `FRONTEND_RETURN_URL` = `https://telar-api.onrender.com/gracias`

Verifica:

```bash
curl https://telar-api.onrender.com/api/health
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
export const SUBSCRIPTION_API_PRODUCTION = 'https://telar-api.onrender.com';
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

### Probar Pro sin pagar (desarrollo local)

Si MP sandbox o tu tarjeta no cooperan:

```env
SUBSCRIPTION_DEV_BYPASS=1
BACKEND_URL=http://localhost:5001
```

Reinicia `python app.py`. En Telar → Plan → **Activar Pro (solo desarrollo)**.

**No** uses `SUBSCRIPTION_DEV_BYPASS` en Render ni en builds que distribuyas.

## Suscripciones en modo prueba (limitación MP Chile)

Las **Credenciales de prueba** de la app (menú → Pruebas → **Credenciales de prueba**) son las que van en `MP_ACCESS_TOKEN` para desarrollo. Terminan en tu user ID real (ej. `…321938991`).

La tarjeta **Vendedor** en **Cuentas de prueba** da usuario/contraseña para **iniciar sesión** en mercadopago.cl, **no** un Access Token distinto para la API.

Por eso, suscripción + comprador test a veces falla con *«Una de las partes es de prueba»*: vendedor = tu cuenta real, comprador = test.

### Probar el flujo completo (recomendado cuando sandbox falle)

1. Panel → **Credenciales de producción** → activar → copiar `APP_USR-…` a `server/.env`
2. Telar → Ajustes → **tu email real**
3. Suscribirse → pagar $15.000 (pago real; puedes cancelar la suscripción en MP después)

### Probar sin cobrar (solo funciones Pro en dev)

Mientras MP sandbox falle, puedes activar Pro manualmente en la base local o pedir un bypass de desarrollo.

### Comprador test (si quieres seguir intentando sandbox)

1. **Cuentas de prueba** → **Comprador** → copia email y contraseña
2. Telar → Ajustes → Correo = email del comprador test
3. Ventana privada → checkout → login comprador test + tarjeta `4168 8188 4444 7115`, titular `APRO`

---

## Tarjetas de prueba (Chile)

Copia **exacto** (cuidado: es `8188`, no `8818`):

| Campo | Valor |
|-------|-------|
| Visa | `4168 8188 4444 7115` |
| CVV | `123` |
| Vence | `11/30` |
| Titular | `APRO` |
| Documento | Tipo **Otro** · número `123456789` (no uses tu RUT real en pruebas) |

| Titular | Resultado |
|---------|-----------|
| `APRO` | Pago aprobado |
| `OTHE` | Rechazado (prueba de error) |

---

## Problemas frecuentes

| Síntoma | Solución |
|---------|----------|
| "Mercado Pago no configurado" | Falta `MP_ACCESS_TOKEN` en Render |
| "Configura tu email" | Ajustes → Correo electrónico |
| Verificar no activa Pro | Espera 1 min; revisa webhook en MP; usa mismo email que en Ajustes |
| «No puedes pagar con esta tarjeta» | Número correcto: <code>4168 8188 4444 7115</code> (8188, no 8818); doc. Otro 123456789 |
| «Una de las partes es de prueba» | Ventana privada; cierra sesión de tu MP real; entra solo con el comprador test (mismo email que Ajustes) |
| Render lento al primer request | Plan free "duerme"; el primer click tarda ~30 s |
| No quiero telarapp.cl | Correcto, no lo necesitas; `/gracias` vive en el mismo Render |
