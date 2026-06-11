#!/usr/bin/env python3
"""Comprueba que el frontend nuevo quedó embebido (assets brotli de Tauri)."""
from __future__ import annotations

import sys
from pathlib import Path

REQUIRED = (
    b"workspace-sidebar",
    b"btn-add-module",
    b"btn-add-session",
)


def decompress_assets(assets_dir: Path) -> list[bytes]:
    try:
        import brotli
    except ImportError:
        import subprocess

        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "brotli", "-q"],
            stdout=subprocess.DEVNULL,
        )
        import brotli

    out: list[bytes] = []
    for path in assets_dir.glob("*"):
        if not path.is_file():
            continue
        raw = path.read_bytes()
        try:
            out.append(brotli.decompress(raw))
        except Exception:
            pass
    return out


def main() -> int:
    if len(sys.argv) != 2:
        print("Uso: verify-frontend-embedded.py <tauri-codegen-assets-dir>", file=sys.stderr)
        return 2

    assets_dir = Path(sys.argv[1])
    if not assets_dir.is_dir():
        print(f"Error: no existe {assets_dir}", file=sys.stderr)
        return 1

    blobs = decompress_assets(assets_dir)
    if not blobs:
        print("Error: no se pudieron leer assets embebidos", file=sys.stderr)
        return 1

    combined = b"\n".join(blobs)
    missing = [m.decode() for m in REQUIRED if m not in combined]
    if missing:
        print("Error: el build no incluye el frontend esperado. Falta:", ", ".join(missing), file=sys.stderr)
        print("Ejecuta de nuevo: ./scripts/build-app.sh", file=sys.stderr)
        return 1

    print("✓ Frontend verificado (workspace + botones nuevos embebidos)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
