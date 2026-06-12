# Distribuir Telar en otros Mac (DI-1)

## Resumen

macOS **Gatekeeper** bloquea apps no firmadas o no notarizadas. Para que un colega abra la app **sin clic derecho → Abrir**, necesitas:

1. **Apple Developer Program** (cuenta de pago)
2. Certificado **Developer ID Application** en el llavero
3. Firma con **hardened runtime** + **notarización** de Apple

## Build + firma en un paso

```bash
export APPLE_DEVELOPER_ID="Developer ID Application: Tu Nombre (TEAMID)"
export APPLE_ID=tu@email.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=TEAMID

SIGN_MACOS=1 ./scripts/build-app.sh
```

O sobre una build ya hecha:

```bash
./scripts/sign-macos-app.sh "dist/Telar.app"
```

Genera también `dist/Telar-macos.zip` para compartir.

Para publicar en GitHub Releases:

```bash
./scripts/publish-github-release.sh 0.1.0
```

Ver `docs/DISTRIBUCION-RELEASES.md` (Windows `.exe`, auto-actualización).

## Sin certificado (solo pruebas internas)

```bash
./scripts/sign-macos-app.sh
```

Firma ad-hoc: el receptor debe **clic derecho → Abrir** la primera vez, o ir a **Ajustes del Sistema → Privacidad y seguridad → Abrir de todas formas**.

## Entitlements

`src-tauri/entitlements.plist` incluye JIT y Bluetooth (Muse NF). Si Apple rechaza la notarización, revisa el log:

```bash
xcrun notarytool log <submission-id> --apple-id ... --password ... --team-id ...
```
