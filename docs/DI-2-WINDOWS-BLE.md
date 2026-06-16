# DI-2 — Validación BLE Muse 2 en Windows

Checklist para probar neurofeedback con **Muse 2** en hardware Windows real. La CI genera `Telar-windows.exe` (ver `.github/workflows/release.yml`).

## Requisitos previos

| Ítem | Detalle |
|------|---------|
| PC | Windows 10/11 x64, Bluetooth LE activo |
| Muse 2 | Cargado, banda ajustada, único dispositivo Muse encendido cerca |
| Build | `Telar-windows.exe` de GitHub Releases o build local (`./scripts/build-app.sh` en Windows) |
| Sidecar | Incluido en el instalador (PyInstaller); no requiere Python instalado |

## 1. Instalación y arranque

- [ ] Ejecutar `Telar-windows.exe` (SmartScreen: «Más información» → «Ejecutar de todas formas» si aplica)
- [ ] Desbloquear con PIN o contraseña de la app
- [ ] Verificar versión en **Ajustes → Versión** (anotar build/tag)

## 2. Permisos Bluetooth

- [ ] **Configuración → Bluetooth y dispositivos → Bluetooth** activado
- [ ] Primera conexión NF: Windows puede pedir permiso de Bluetooth para Telar — aceptar
- [ ] Si falla: **Configuración → Privacidad y seguridad → Bluetooth** → permitir acceso a apps de escritorio

## 3. Conexión Muse 2

Abrir un tratamiento → sesión → módulo **Neurofeedback**.

- [ ] Estado inicial: orb azul, texto «Desconectado», botón **Conectar Muse 2** visible
- [ ] Pulsar **Conectar Muse 2** → escaneo (≤30 s)
- [ ] Conexión exitosa: orb con actividad, nombre/dispositivo visible, nivel de batería si aplica
- [ ] **Desconectar** manual → vuelve a estado idle azul
- [ ] Reconectar sin reiniciar la app (segunda conexión estable)

### Fallos comunes

| Síntoma | Acción |
|---------|--------|
| No aparece Muse | Apagar otros Muse; reiniciar banda; alejar interferencias USB 3.0 |
| Timeout escaneo | Cerrar app, olvidar Muse en Bluetooth de Windows, reintentar |
| Conecta y se cae | Anotar segundos hasta desconexión; revisar logs si hay consola debug |

## 4. Grabación y análisis

- [ ] Seleccionar protocolo (p. ej. Atención Beta)
- [ ] **Grabar** ≥60 s con banda bien colocada
- [ ] **Detener** → Muse se desconecta automáticamente; tab **Resultados** activa
- [ ] Estado «Analizando…» → resultados con % calma/atención/relajación (o mensaje de error claro)
- [ ] Notas de sesión se guardan al escribir

## 5. Sidecar Python (Windows)

- [ ] Tras detener grabación, no queda proceso `analyze_session` colgado (Administrador de tareas)
- [ ] Segunda grabación en la misma sesión analiza correctamente (sin reiniciar app)

## 6. Export y datos

- [ ] **Exportar programa** PDF incluye bloque NF si hubo grabación
- [ ] Base de datos en `%APPDATA%\cl.telarapp.desktop\` (o ruta equivalente post-rebrand)

## 7. Registro de prueba

Completar al ejecutar la checklist:

```
Fecha:
Tester:
Windows build:
Telar versión:
Muse 2 firmware (si conocido):
Resultado global: PASS / FAIL
Notas:
```

## Referencias en repo

- BLE Rust: `src-tauri/src/muse_ble.rs`
- UI NF: `src/js/modules/neurofeedback.js`
- Sidecar: `python/analyze_session.py`, `scripts/build-sidecar.sh`
- Release Windows: `.github/workflows/release.yml` → artefacto `Telar-windows.exe`
