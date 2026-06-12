# Distribución — GitHub Releases y auto-actualización

## Respuesta corta: ¿Tauri se actualiza solo?

**No por defecto.** Hay que configurar el plugin `tauri-plugin-updater`, firmar los bundles y publicar un manifiesto (`latest.json`) en cada release. La app **no** descarga nada sin que el usuario lo confirme (o pulses «Actualizar»).

En Telar ya está integrado:

| Dónde | Comportamiento |
|-------|----------------|
| **Al abrir la app** | Comprueba actualizaciones; si hay una nueva, muestra un toast |
| **Pantalla Desbloquear** | Barra centrada abajo: «Actualización X disponible — Actualizar» |
| **Ajustes → Buscar actualizaciones** | Comprueba e instala si hay versión nueva |

Tras instalar, la app se reinicia sola.

---

## Publicar `Telar-macos.zip`

### Manual (desde tu Mac)

```bash
./scripts/build-app.sh
./scripts/sign-macos-app.sh
./scripts/publish-github-release.sh 0.1.0
```

El zip queda en `dist/Telar-macos.zip` y se sube a [GitHub Releases](https://github.com/maren-keld/telarapp/releases).

Opciones:

```bash
./scripts/publish-github-release.sh 0.1.0 --draft   # borrador
```

Requisitos: `brew install gh` y `gh auth login`.

### Automático (CI)

Al pushear un tag `v*`:

```bash
git tag v0.1.1
git push origin v0.1.1
```

El workflow `.github/workflows/release.yml` compila macOS + Windows, genera `latest.json` firmado y sube los assets. La release queda en **borrador** para revisar antes de publicar.

---

## Windows `.exe`

El instalador NSIS se genera solo en **Windows** (o en CI `windows-latest`):

```powershell
# En Windows, con Rust + Python + PyInstaller
.\scripts\build-app.sh
.\scripts\package-windows-installer.sh
```

Salida: `dist/Telar-windows.exe`

En CI se publica automáticamente junto al zip de macOS.

---

## Claves de firma (obligatorio para auto-actualización)

Generar una sola vez (guarda la clave privada en un lugar seguro):

```bash
cargo tauri signer generate -w ~/.tauri/telar.key
```

- **Pública** → ya está en `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`)
- **Privada** → secreto de GitHub `TAURI_SIGNING_PRIVATE_KEY` (contenido del `.key` o ruta)

Si pierdes la clave privada, **no podrás publicar actualizaciones** a usuarios que ya tienen la app instalada.

### Secretos en GitHub

En el repo → Settings → Secrets → Actions:

| Secreto | Valor |
|---------|--------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contenido de `~/.tauri/telar.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Vacío si la clave no tiene contraseña |

---

## Repo privado vs updater

El endpoint configurado es:

```
https://github.com/maren-keld/telarapp/releases/latest/download/latest.json
```

Eso **solo funciona si el release es descargable sin login**. Opciones:

1. **Repo público** (recomendado para distribución abierta AGPL)
2. Repo privado pero releases/assets públicos (GitHub no lo permite para `latest.json` anónimo)
3. Servir `latest.json` desde otro host HTTPS (CDN, gist público, API propia)

Mientras el repo sea privado, los usuarios pueden instalar manualmente el zip/exe, pero **la auto-actualización fallará** hasta que el manifiesto sea accesible.

---

## Flujo recomendado por versión

1. Subir versión en `src-tauri/tauri.conf.json` y `package.json`
2. `./scripts/finish-iteration.sh` (cambios UI)
3. Commit + tag `v0.1.x`
4. Push del tag → CI genera release borrador
5. Revisar assets: `Telar-macos.zip`, `Telar-windows.exe`, `latest.json`, `.tar.gz`/`.nsis.zip` firmados
6. Publicar release (quitar borrador)

---

## Notarización macOS (Gatekeeper)

El zip de distribución manual sigue pasando por `sign-macos-app.sh`. Sin certificado Developer ID, otros Mac verán advertencia de Gatekeeper (clic derecho → Abrir). Ver `docs/DISTRIBUCION-MACOS.md`.
