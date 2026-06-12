# API de suscripciones — Plan Profesional

Backend mínimo para cobrar **$15.000 CLP/mes** con **Mercado Pago** (Chile).

## Qué necesitas de Mercado Pago

Ya tienes cuenta; falta crear la **aplicación** y sacar las credenciales:

1. Entra a [Mercado Pago Developers](https://www.mercadopago.cl/developers/panel/app).
2. **Crear aplicación** → nombre: `Psicoterapia Lab`.
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

Tras desplegar, pon la URL en `BACKEND_URL` (ej. `https://psicoterapia-lab-api.onrender.com`).

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
window.PSICOTERAPIA_SUBSCRIPTION_API = 'https://tu-api.onrender.com';
```

La app abre el checkout en el navegador y, al volver, puede consultar el estado con el email del perfil (Ajustes).

## Checklist antes de cobrar en producción

- [ ] Access Token de **producción** en el servidor
- [ ] `BACKEND_URL` y webhook HTTPS configurados
- [ ] Probar un pago de prueba con tarjetas de test MP
- [ ] Política de cancelación visible en la landing
- [ ] Actualizar precio en modal si cambia (hoy: 15.000 CLP)
