#!/usr/bin/env python3
"""Genera las variantes WebP del landing desde los PNG originales.

Ejecutar: python3 scripts/optimize-landing-images.py

Los PNG de landing/assets/ son la fuente (y siguen sirviendo de fallback y de
og:image). Este script escribe al lado un WebP por cada ancho que el layout
puede pedir, para que <picture> baje solo el que corresponde: la captura del
hero pesaba 421 KiB para mostrarse a 920 px de ancho.

Requiere Pillow (pip install pillow). Solo se corre cuando cambia una imagen;
el resultado se versiona en git.
"""
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "landing" / "assets"

# (archivo, anchos) — el ancho mayor es 2x del ancho CSS máximo en que se
# muestra la imagen; nunca más que el original, ampliar no agrega detalle.
# square=True recorta cuadrado desde arriba, igual que el object-fit de
# .team-photo: así el WebP ya viene con el encuadre final.
TARGETS = [
    # Hero de la portada: .app-shot--hero llega a 920 px CSS.
    ("telar-app-screenshot.png", [920, 1840]),
    # Ficha de neurofeedback (920 px CSS) y tarjeta de la portada (~400 px).
    ("telar-neurofeedback.png", [660, 1318]),
    # Banda ancha superior de /neurofeedback y foto del curso.
    ("muse-headband-hero.png", [512, 1024]),
    # Miniatura del destacado: ya está a medida, solo cambia de formato.
    ("muse-headband-thumb.png", [224, 448]),
    # Home: LCP y galería. 800 = móvil 1x/2x chico; 1600 = desktop; 2400 = retina ancha.
    ("gallery-significado.png", [800, 1600, 2400]),
    ("gallery-puntajes.png", [800, 1600, 2400]),
    ("gallery-neurofeedback.png", [800, 1600, 2400]),
    # Fotos del equipo: se muestran a 150 px, recortadas en cuadrado.
    ("team-felipe.png", [150, 300], True),
    ("team-debbie.png", [150, 300], True),
]

QUALITY = 82
# Las capturas de UI (texto chico) se destrozan a 82; el carrusel de la home va a 90.
QUALITY_UI = 90


def variants(name: str, widths: list[int], square: bool = False) -> None:
    source = ASSETS / name
    if not source.exists():
        print(f"skip {name} (no está)")
        return
    original = Image.open(source)
    if square:
        side = min(original.size)
        left = (original.width - side) // 2
        original = original.crop((left, 0, left + side, side))
    stem = source.stem
    for width in widths:
        if width > original.width:
            continue
        height = round(original.height * width / original.width)
        resized = original.resize((width, height), Image.LANCZOS)
        out = ASSETS / f"{stem}-{width}.webp"
        quality = QUALITY_UI if stem.startswith("gallery-") else QUALITY
        resized.save(out, "WEBP", quality=quality, method=6)
        print(f"{out.name:38} {width}x{height}  {out.stat().st_size / 1024:6.1f} KiB")


def main() -> None:
    for target in TARGETS:
        variants(*target)


if __name__ == "__main__":
    main()
