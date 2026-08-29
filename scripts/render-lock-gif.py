#!/usr/bin/env python3
"""Render the Telar hero lock as a looping GIF for X."""
from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "landing" / "assets" / "telar-lock-x.gif"
SIZE = 720
FPS = 16
DURATION = 4.0  # seconds; travel wave almost loops
CELL = 10


def mix3(t: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    c0 = np.array([46.0, 196.0, 104.0])
    c1 = np.array([230.0, 205.0, 48.0])
    c2 = np.array([226.0, 58.0, 58.0])
    t = np.clip(t, 0.0, 1.0)
    lo = t < 0.5
    u = np.where(lo, t * 2.0, (t - 0.5) * 2.0)
    rgb = np.empty(t.shape + (3,))
    rgb[lo] = (1 - u[lo, None]) * c0 + u[lo, None] * c1
    rgb[~lo] = (1 - u[~lo, None]) * c1 + u[~lo, None] * c2
    return rgb[..., 0], rgb[..., 1], rgb[..., 2]


def sd_round_box(px, py, cx, cy, hw, hh, rad):
    dx = np.abs(px - cx) - hw
    dy = np.abs(py - cy) - hh
    return np.minimum(np.maximum(dx, dy), 0.0) + np.hypot(np.maximum(dx, 0.0), np.maximum(dy, 0.0)) - rad


def sd_capsule(px, py, ax, ay, bx, by, r):
    pax, pay = px - ax, py - ay
    bax, bay = bx - ax, by - ay
    h = np.clip((pax * bax + pay * bay) / (bax * bax + bay * bay), 0.0, 1.0)
    return np.hypot(pax - bax * h, pay - bay * h) - r


def sd_lock(px, py):
    tube = 0.1
    half = 0.3
    arc_y = -0.22
    body = sd_round_box(px, py, 0.0, 0.3, 0.46, 0.36, 0.12)
    left = sd_capsule(px, py, -half, arc_y, -half, 0.2, tube)
    right = sd_capsule(px, py, half, arc_y, half, 0.2, tube)
    arc = np.abs(np.hypot(px, py - arc_y) - half) - tube
    arc = np.where(py > arc_y + 0.01, 9.0, arc)
    metal = np.minimum(np.minimum(body, left), np.minimum(right, arc))
    hole = np.minimum(np.hypot(px, py - 0.18) - 0.07, sd_capsule(px, py, 0.0, 0.2, 0.0, 0.44, 0.03))
    return np.maximum(metal, -hole)


def frame(t_ms: float) -> Image.Image:
    cols = math.ceil(SIZE / CELL)
    rows = math.ceil(SIZE / CELL)
    aspect = 1.0
    i = np.arange(cols)[None, :]
    j = np.arange(rows)[:, None]
    px = ((i + 0.5) / cols - 0.5) * 2.2 * aspect
    py = ((j + 0.48) / rows - 0.5) * 2.2
    d = sd_lock(px, py)
    e = 0.012
    nx = sd_lock(px + e, py) - sd_lock(px - e, py)
    ny = sd_lock(px, py + e) - sd_lock(px, py - e)
    nz = np.full_like(d, 0.48)
    nlen = np.hypot(nx, np.hypot(ny, nz))
    nlen = np.where(nlen == 0, 1.0, nlen)
    nx, ny, nz = nx / nlen, ny / nlen, nz / nlen

    ang = t_ms * 0.00075
    lx = math.cos(ang) * 0.55
    ly = -0.32 + math.sin(ang * 0.8) * 0.12
    lz = 0.78
    llen = math.hypot(lx, ly, lz) or 1.0
    ndot = np.maximum(0.0, (nx * lx + ny * ly + nz * lz) / llen)
    spec = ndot**14 * 0.7
    rim = (1.0 - np.maximum(0.0, nz)) ** 2.2 * 0.28
    lum = 0.1 + ndot * 0.72 + spec + rim
    lum = np.where(d > 0, lum * np.maximum(0.0, 1.0 - d / 0.05), lum)
    r = lum * CELL * 0.5

    axis_x = math.cos(t_ms * 0.00031)
    axis_y = math.sin(t_ms * 0.00027)
    travel = t_ms * 0.00105
    along = px * axis_x + py * axis_y
    phase = (np.sin(along * 1.85 - travel) + 1.0) * 0.5
    cr, cg, cb = mix3(phase)
    cr = np.minimum(255.0, cr * lum)
    cg = np.minimum(255.0, cg * lum)
    cb = np.minimum(255.0, cb * lum)

    img = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
    img[:] = (5, 5, 6)
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
    tmp = Path(tempfile.mkdtemp(prefix="telar-lock-"))
    try:
        paths = []
        for k in range(n):
            t_ms = k * (DURATION * 1000.0 / n)
            im = frame(t_ms)
            p = tmp / f"f{k:03d}.png"
            im.save(p)
            paths.append(p)
            print(f"frame {k + 1}/{n}", flush=True)
        palette = tmp / "palette.png"
        pattern = str(tmp / "f%03d.png")
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-framerate",
                str(FPS),
                "-i",
                pattern,
                "-vf",
                "palettegen=stats_mode=diff",
                str(palette),
            ]
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
