#!/usr/bin/env python3
"""Render an isometric dotted lightning bolt over drifting words, lock-GIF style."""
from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "landing" / "assets" / "telar-bolt.gif"
SIZE = 640
FPS = 12
DURATION = 3.0
CELL = 10
WORDS = [
    "informe", "email", "resumen", "pdf", "sesión",
    "correo", "tarea", "nota", "plan", "foco",
]


def mix3(t: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    c0 = np.array([255.0, 236.0, 130.0])
    c1 = np.array([255.0, 210.0, 52.0])
    c2 = np.array([226.0, 90.0, 48.0])
    t = np.clip(t, 0.0, 1.0)
    lo = t < 0.5
    u = np.where(lo, t * 2.0, (t - 0.5) * 2.0)
    rgb = np.empty(t.shape + (3,))
    rgb[lo] = (1 - u[lo, None]) * c0 + u[lo, None] * c1
    rgb[~lo] = (1 - u[~lo, None]) * c1 + u[~lo, None] * c2
    return rgb[..., 0], rgb[..., 1], rgb[..., 2]


def sd_capsule(px, py, ax, ay, bx, by, r):
    pax, pay = px - ax, py - ay
    bax, bay = bx - ax, by - ay
    h = np.clip((pax * bax + pay * bay) / (bax * bax + bay * bay), 0.0, 1.0)
    return np.hypot(pax - bax * h, pay - bay * h) - r


def sd_bolt(px, py):
    segs = (
        (-0.1, -0.86, 0.32, -0.2, 0.08),
        (0.32, -0.2, -0.26, -0.04, 0.075),
        (-0.26, -0.04, 0.36, 0.4, 0.08),
        (0.36, 0.4, -0.16, 0.54, 0.07),
        (-0.16, 0.54, 0.08, 0.9, 0.065),
    )
    d = np.full(px.shape, 9.0)
    for ax, ay, bx, by, rad in segs:
        d = np.minimum(d, sd_capsule(px, py, ax, ay, bx, by, rad))
    return d


def draw_words(img: Image.Image, t_ms: float) -> None:
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 15)
    except OSError:
        font = ImageFont.load_default()
    drift = (t_ms * 0.016) % 88
    n = 0
    for y in range(-18, SIZE + 36, 30):
        for x in range(-52, SIZE + 90, 98):
            word = WORDS[n % len(WORDS)]
            a = 18 + (n % 4) * 6
            color = (232, 214, 120, a)
            draw.text(
                (x - drift + (n % 3) * 8, y + (n % 2) * 5),
                word,
                fill=color,
                font=font,
            )
            n += 1


def frame(t_ms: float) -> Image.Image:
    base = Image.new("RGBA", (SIZE, SIZE), (5, 5, 6, 255))
    draw_words(base, t_ms)
    img = np.array(base.convert("RGB"), dtype=np.uint8)

    cols = math.ceil(SIZE / CELL)
    rows = math.ceil(SIZE / CELL)
    i = np.arange(cols)[None, :]
    j = np.arange(rows)[:, None]
    px = ((i + 0.5) / cols - 0.5) * 2.15
    py = ((j + 0.48) / rows - 0.5) * 2.2
    d = sd_bolt(px, py)
    e = 0.012
    nx = sd_bolt(px + e, py) - sd_bolt(px - e, py)
    ny = sd_bolt(px, py + e) - sd_bolt(px, py - e)
    nz = np.full_like(d, 0.48)
    nlen = np.hypot(nx, np.hypot(ny, nz))
    nlen = np.where(nlen == 0, 1.0, nlen)
    nx, ny, nz = nx / nlen, ny / nlen, nz / nlen

    ang = t_ms * 0.0009
    lx = math.cos(ang) * 0.55
    ly = -0.28 + math.sin(ang * 0.8) * 0.12
    lz = 0.78
    llen = math.hypot(lx, ly, lz) or 1.0
    ndot = np.maximum(0.0, (nx * lx + ny * ly + nz * lz) / llen)
    spec = ndot**12 * 0.85
    rim = (1.0 - np.maximum(0.0, nz)) ** 2.2 * 0.28
    lum = 0.12 + ndot * 0.78 + spec + rim
    lum = np.where(d > 0, lum * np.maximum(0.0, 1.0 - d / 0.05), lum)
    r = lum * CELL * 0.52

    axis_x = math.cos(t_ms * 0.00034)
    axis_y = math.sin(t_ms * 0.00029)
    travel = t_ms * 0.0022
    along = px * axis_x + py * axis_y
    pulse = (np.sin(along * 2.4 - travel) + 1.0) * 0.5
    flash = 0.55 + 0.45 * pulse
    cr, cg, cb = mix3(pulse)
    cr = np.minimum(255.0, cr * lum * flash)
    cg = np.minimum(255.0, cg * lum * flash)
    cb = np.minimum(255.0, cb * lum * flash)

    for cj in range(rows):
        for ci in range(cols):
            rad = float(r[cj, ci])
            if rad < 0.4 or float(d[cj, ci]) > 0.05:
                continue
            cx = (ci + 0.5) * CELL
            cy = (cj + 0.5) * CELL
            rad_i = int(math.ceil(rad)) + 1
            x0 = max(0, int(cx) - rad_i)
            x1 = min(SIZE, int(cx) + rad_i + 1)
            y0 = max(0, int(cy) - rad_i)
            y1 = min(SIZE, int(cy) + rad_i + 1)
            yy = np.arange(y0, y1)[:, None]
            xx = np.arange(x0, x1)[None, :]
            mask = (xx - cx) ** 2 + (yy - cy) ** 2 <= rad * rad
            color = (int(cr[cj, ci]), int(cg[cj, ci]), int(cb[cj, ci]))
            patch = img[y0:y1, x0:x1]
            patch[mask] = color
    return Image.fromarray(img, "RGB")


def main() -> None:
    n = int(FPS * DURATION)
    tmp = Path(tempfile.mkdtemp(prefix="telar-bolt-"))
    try:
        pattern = str(tmp / "f%03d.png")
        for k in range(n):
            t_ms = k * (DURATION * 1000.0 / n)
            im = frame(t_ms)
            im.save(tmp / f"f{k:03d}.png")
            print(f"frame {k + 1}/{n}", flush=True)
        palette = tmp / "palette.png"
        subprocess.check_call(
            ["ffmpeg", "-y", "-framerate", str(FPS), "-i", pattern, "-vf", "palettegen=stats_mode=diff", str(palette)]
        )
        OUT.parent.mkdir(parents=True, exist_ok=True)
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-framerate",
                str(FPS),
                "-i",
                pattern,
                "-i",
                str(palette),
                "-lavfi",
                "paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
                "-loop",
                "0",
                str(OUT),
            ]
        )
        print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
