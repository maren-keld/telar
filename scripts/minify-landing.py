#!/usr/bin/env python3
"""Minifica CSS/JS del landing para PageSpeed.

Uso: python3 scripts/minify-landing.py

Escribe landing/css/style.min.css, landing/js/track.min.js y
landing/js/hero-camera.min.js. Las fuentes se editan a mano; este script
se corre al publicar.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANDING = ROOT / "landing"


def minify_css(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*([{}:;,])\s*", r"\1", text)
    return text.strip()


def minify_js_with_terser(src: Path, dest: Path) -> bool:
    try:
        subprocess.run(
            [
                "npx",
                "--yes",
                "terser",
                str(src),
                "-o",
                str(dest),
                "-c",
                "-m",
                "--comments",
                "false",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def minify_js_fallback(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"(^|[^:\\])//.*?$", r"\1", text, flags=re.M)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip() + "\n"


def main() -> None:
    css_src = LANDING / "css" / "style.css"
    css_dest = LANDING / "css" / "style.min.css"
    css_dest.write_text(minify_css(css_src.read_text()), encoding="utf-8")
    print(f"{css_dest.relative_to(ROOT)}  {css_src.stat().st_size / 1024:.1f} → {css_dest.stat().st_size / 1024:.1f} KiB")

    for name in ("track.js", "hero-camera.js"):
        src = LANDING / "js" / name
        dest = LANDING / "js" / name.replace(".js", ".min.js")
        if not minify_js_with_terser(src, dest):
            dest.write_text(minify_js_fallback(src.read_text()), encoding="utf-8")
            print(f"{dest.relative_to(ROOT)}  fallback minify  {src.stat().st_size / 1024:.1f} → {dest.stat().st_size / 1024:.1f} KiB")
        else:
            print(f"{dest.relative_to(ROOT)}  terser  {src.stat().st_size / 1024:.1f} → {dest.stat().st_size / 1024:.1f} KiB")


if __name__ == "__main__":
    main()
