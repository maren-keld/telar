/** Cámara del hero: encuadra cards con zoom y pinta ASCII / dither / CAD. */
(function initHeroCamera() {
  const AUTO_MS = 4800;
  const ZOOM = 1.34;
  const CHARSET = " .:-=+*#%@";
  const CHARSET_ORB = " .'`^*+=#%@";
  const BAYER = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ];

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpColor(a, b, t) {
    return [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t)),
    ];
  }

  function mix3(c0, c1, c2, t) {
    if (t < 0.5) return lerpColor(c0, c1, t * 2);
    return lerpColor(c1, c2, (t - 0.5) * 2);
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function project(x, y, z, ox, oy, s) {
    return [ox + (x - z) * s, oy + (x + z) * s * 0.5 - y * s];
  }

  function pathFace(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function drawCube(ctx, x, y, z, w, h, d, ox, oy, s, fill, stroke) {
    const p = (ix, iy, iz) => project(ix, iy, iz, ox, oy, s);
    const top = [p(x, y + h, z), p(x + w, y + h, z), p(x + w, y + h, z + d), p(x, y + h, z + d)];
    const left = [p(x, y, z + d), p(x, y + h, z + d), p(x + w, y + h, z + d), p(x + w, y, z + d)];
    const right = [p(x + w, y, z + d), p(x + w, y + h, z + d), p(x + w, y + h, z), p(x + w, y, z)];
    ctx.fillStyle = fill.top;
    pathFace(ctx, top);
    ctx.fill();
    ctx.fillStyle = fill.left;
    pathFace(ctx, left);
    ctx.fill();
    ctx.fillStyle = fill.right;
    pathFace(ctx, right);
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(0.6, s * 0.04);
      [top, left, right].forEach((face) => {
        pathFace(ctx, face);
        ctx.stroke();
      });
    }
  }

  function drawIsoGrid(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    const step = Math.max(10, Math.floor(w / 14));
    ctx.beginPath();
    for (let x = -h; x < w + h; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h * 0.6, h);
      ctx.moveTo(x, 0);
      ctx.lineTo(x - h * 0.6, h);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawNeurons(ctx, w, h, t) {
    ctx.fillStyle = "#070809";
    ctx.fillRect(0, 0, w, h);
    drawIsoGrid(ctx, w, h);

    function hash(n) {
      const s = Math.sin(n * 127.1) * 43758.5453;
      return s - Math.floor(s);
    }

    const cols = Math.max(7, Math.round(w / 52));
    const rows = Math.max(5, Math.round(h / 48));
    const nodes = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const id = j * cols + i + 1;
        nodes.push({
          x: ((i + 0.5) / cols) * w + (hash(id) - 0.5) * (w / cols) * 0.72,
          y: ((j + 0.5) / rows) * h + (hash(id + 17) - 0.5) * (h / rows) * 0.72,
          id,
        });
      }
    }

    const angA = t * 0.00021 + Math.sin(t * 0.00007) * 0.8;
    const angB = t * 0.00013 + 2.1 + Math.cos(t * 0.00005) * 1.1;
    const angC = t * 0.00009 + 4.0;
    const dAx = Math.cos(angA);
    const dAy = Math.sin(angA);
    const dBx = Math.cos(angB);
    const dBy = Math.sin(angB);
    const dCx = Math.cos(angC);
    const dCy = Math.sin(angC);
    const travelA = t * 0.0026;
    const travelB = t * 0.0018;
    const travelC = t * 0.0031;

    function waveAt(x, y) {
      const a = (Math.sin((x * dAx + y * dAy) * 0.016 - travelA) + 1) * 0.5;
      const b = (Math.sin((x * dBx + y * dBy) * 0.011 + travelB) + 1) * 0.5;
      const c = (Math.sin((x * dCx + y * dCy) * 0.022 - travelC) + 1) * 0.5;
      return Math.max(0, Math.min(1, a * 0.5 + b * 0.32 + c * 0.18));
    }

    const maxDist = Math.min(w, h) * 0.3;
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const dx = nodes[b].x - nodes[a].x;
        const dy = nodes[b].y - nodes[a].y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist || dist < 10) continue;
        if (hash(nodes[a].id * 31 + nodes[b].id) < 0.42) continue;
        const mx = (nodes[a].x + nodes[b].x) * 0.5;
        const my = (nodes[a].y + nodes[b].y) * 0.5;
        const p = waveAt(mx, my);
        const rgb = mix3([46, 196, 104], [230, 205, 48], [226, 58, 58], p);
        ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.1 + p * 0.62})`;
        ctx.lineWidth = 0.7 + p * 1.6;
        ctx.beginPath();
        ctx.moveTo(nodes[a].x, nodes[a].y);
        ctx.quadraticCurveTo(
          mx + (hash(a + b) - 0.5) * 22,
          my + (hash(a + b + 5) - 0.5) * 22,
          nodes[b].x,
          nodes[b].y
        );
        ctx.stroke();
      }
    }

    nodes.forEach((n) => {
      const p = waveAt(n.x, n.y);
      const rgb = mix3([46, 196, 104], [230, 205, 48], [226, 58, 58], p);
      const soma = 2.1 + p * 3.4;
      const dendrites = 3 + Math.floor(hash(n.id) * 4);
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.18 + p * 0.45})`;
      ctx.lineWidth = 0.7;
      for (let k = 0; k < dendrites; k++) {
        const ang = hash(n.id * 9 + k) * Math.PI * 2;
        const len = 6 + hash(n.id + k + 8) * 11;
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(n.x + Math.cos(ang) * len, n.y + Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.1 + p * 0.22})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, soma * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, soma, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const BRICKS = [
    { x: 0, y: 0, z: 0, w: 2, h: 1, d: 1, c: 0 },
    { x: 2, y: 0, z: 0, w: 2, h: 1, d: 1, c: 1 },
    { x: 0, y: 0, z: 1, w: 2, h: 1, d: 1, c: 1 },
    { x: 2, y: 0, z: 1, w: 1, h: 1, d: 1, c: 2 },
    { x: 0, y: 1, z: 0, w: 2, h: 1, d: 1, c: 2 },
    { x: 2, y: 1, z: 0.5, w: 1, h: 1, d: 1, c: 0 },
    { x: 0.5, y: 2, z: 0.2, w: 2, h: 1, d: 1, c: 1 },
    { x: 1, y: 3, z: 0.4, w: 1, h: 1, d: 1, c: 0 },
  ];
  const PALETTE = [
    { top: "#f0c27a", left: "#d9893b", right: "#a85a22" },
    { top: "#ecece8", left: "#b9b9b4", right: "#7d7d78" },
    { top: "#7ad0a0", left: "#3d9a68", right: "#246646" },
  ];

  function drawLego(ctx, w, h, t) {
    ctx.fillStyle = "#070809";
    ctx.fillRect(0, 0, w, h);
    drawIsoGrid(ctx, w, h);
    const cycle = 5200;
    const u = (t % cycle) / cycle;
    let n;
    if (u < 0.55) n = smooth(u / 0.55) * BRICKS.length;
    else if (u < 0.72) n = BRICKS.length;
    else n = (1 - smooth((u - 0.72) / 0.28)) * BRICKS.length;

    const s = Math.min(w, h) * 0.2;
    const ox = w * 0.46;
    const oy = h * 0.8;
    const visible = BRICKS.map((b, i) => {
      const appear = Math.max(0, Math.min(1, n - i));
      const drop = (1 - appear) * 2.4;
      return { ...b, y: b.y + drop, a: appear };
    })
      .filter((b) => b.a > 0.04)
      .sort((a, b) => a.x + a.z - (b.x + b.z) || a.y - b.y);

    visible.forEach((b) => {
      ctx.globalAlpha = b.a;
      drawCube(ctx, b.x, b.y, b.z, b.w, b.h, b.d, ox, oy, s, PALETTE[b.c], "rgba(0,0,0,0.35)");
      ctx.fillStyle = PALETTE[b.c].top;
      for (let iz = 0; iz < b.d; iz++) {
        for (let ix = 0; ix < b.w; ix++) {
          const [px, py] = project(b.x + ix + 0.5, b.y + b.h, b.z + iz + 0.5, ox, oy, s);
          ctx.beginPath();
          ctx.ellipse(px, py, s * 0.16, s * 0.09, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.25)";
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    });
  }

  function sdCapsule(px, py, ax, ay, bx, by, r) {
    const pax = px - ax;
    const pay = py - ay;
    const bax = bx - ax;
    const bay = by - ay;
    const denom = bax * bax + bay * bay || 1;
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / denom));
    return Math.hypot(pax - bax * h, pay - bay * h) - r;
  }

  function sdRoundBox(px, py, cx, cy, hw, hh, rad) {
    const dx = Math.abs(px - cx) - hw + rad;
    const dy = Math.abs(py - cy) - hh + rad;
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - rad;
  }

  function sdLock(px, py) {
    const tube = 0.1;
    const half = 0.3;
    const arcY = -0.22;
    const body = sdRoundBox(px, py, 0, 0.3, 0.46, 0.36, 0.12);
    const left = sdCapsule(px, py, -half, arcY, -half, 0.2, tube);
    const right = sdCapsule(px, py, half, arcY, half, 0.2, tube);
    let arc = Math.abs(Math.hypot(px, py - arcY) - half) - tube;
    if (py > arcY + 0.01) arc = 9;
    const metal = Math.min(body, left, right, arc);
    const hole = Math.min(
      Math.hypot(px, py - 0.18) - 0.07,
      sdCapsule(px, py, 0, 0.2, 0, 0.44, 0.03)
    );
    return Math.max(metal, -hole);
  }

  function drawLock(ctx, w, h, t) {
    ctx.fillStyle = "#050506";
    ctx.fillRect(0, 0, w, h);
    const cell = Math.max(5, Math.round(Math.min(w, h) / 40));
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    const aspect = w / h;
    const ang = t * 0.00075;
    const Lx = Math.cos(ang) * 0.55;
    const Ly = -0.32 + Math.sin(ang * 0.8) * 0.12;
    const Lz = 0.78;
    const llen = Math.hypot(Lx, Ly, Lz) || 1;
    const axisX = Math.cos(t * 0.00031);
    const axisY = Math.sin(t * 0.00027);
    const travel = t * 0.00105;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const px = ((i + 0.5) / cols - 0.5) * 2.2 * aspect;
        const py = ((j + 0.48) / rows - 0.5) * 2.2;
        const d = sdLock(px, py);
        if (d > 0.05) continue;
        const e = 0.012;
        let nx = sdLock(px + e, py) - sdLock(px - e, py);
        let ny = sdLock(px, py + e) - sdLock(px, py - e);
        let nz = 0.48;
        const nlen = Math.hypot(nx, ny, nz) || 1;
        nx /= nlen;
        ny /= nlen;
        nz /= nlen;
        const ndot = Math.max(0, (nx * Lx + ny * Ly + nz * Lz) / llen);
        const spec = Math.pow(ndot, 14) * 0.7;
        const rim = Math.pow(1 - Math.max(0, nz), 2.2) * 0.28;
        let lum = 0.1 + ndot * 0.72 + spec + rim;
        if (d > 0) lum *= Math.max(0, 1 - d / 0.05);
        const r = lum * cell * 0.5;
        if (r < 0.4) continue;
        const along = px * axisX + py * axisY;
        const phase = (Math.sin(along * 1.85 - travel) + 1) * 0.5;
        const rgb = mix3([46, 196, 104], [230, 205, 48], [226, 58, 58], phase);
        ctx.fillStyle = `rgb(${Math.min(255, rgb[0] * lum)},${Math.min(255, rgb[1] * lum)},${Math.min(255, rgb[2] * lum)})`;
        ctx.beginPath();
        ctx.arc((i + 0.5) * cell, (j + 0.5) * cell, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const BOLT_WORDS = [
    "informe", "email", "resumen", "pdf", "sesión",
    "correo", "tarea", "nota", "plan", "foco",
  ];

  function sdBolt(px, py) {
    const segs = [
      [-0.1, -0.86, 0.32, -0.2, 0.08],
      [0.32, -0.2, -0.26, -0.04, 0.075],
      [-0.26, -0.04, 0.36, 0.4, 0.08],
      [0.36, 0.4, -0.16, 0.54, 0.07],
      [-0.16, 0.54, 0.08, 0.9, 0.065],
    ];
    let d = 9;
    for (let s = 0; s < segs.length; s++) {
      const [ax, ay, bx, by, rad] = segs[s];
      d = Math.min(d, sdCapsule(px, py, ax, ay, bx, by, rad));
    }
    return d;
  }

  function drawBolt(ctx, w, h, t) {
    ctx.fillStyle = "#050506";
    ctx.fillRect(0, 0, w, h);
    drawIsoGrid(ctx, w, h);

    const drift = (t * 0.016) % 88;
    ctx.font = `500 ${Math.max(11, Math.round(w * 0.034))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    let n = 0;
    for (let y = -18; y < h + 36; y += 30) {
      for (let x = -52; x < w + 90; x += 98) {
        const word = BOLT_WORDS[n % BOLT_WORDS.length];
        const a = 0.045 + (n % 4) * 0.018;
        ctx.fillStyle = `rgba(232, 214, 120, ${a})`;
        ctx.fillText(word, x - drift + (n % 3) * 8, y + (n % 2) * 5);
        n += 1;
      }
    }

    const cell = Math.max(5, Math.round(Math.min(w, h) / 38));
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    const aspect = w / h;
    const ang = t * 0.0009;
    const Lx = Math.cos(ang) * 0.55;
    const Ly = -0.28 + Math.sin(ang * 0.8) * 0.12;
    const Lz = 0.78;
    const llen = Math.hypot(Lx, Ly, Lz) || 1;
    const axisX = Math.cos(t * 0.00034);
    const axisY = Math.sin(t * 0.00029);
    const travel = t * 0.0022;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const px = ((i + 0.5) / cols - 0.5) * 2.15 * aspect;
        const py = ((j + 0.48) / rows - 0.5) * 2.2;
        const d = sdBolt(px, py);
        if (d > 0.05) continue;
        const e = 0.012;
        let nx = sdBolt(px + e, py) - sdBolt(px - e, py);
        let ny = sdBolt(px, py + e) - sdBolt(px, py - e);
        let nz = 0.48;
        const nlen = Math.hypot(nx, ny, nz) || 1;
        nx /= nlen;
        ny /= nlen;
        nz /= nlen;
        const ndot = Math.max(0, (nx * Lx + ny * Ly + nz * Lz) / llen);
        const spec = Math.pow(ndot, 12) * 0.85;
        const rim = Math.pow(1 - Math.max(0, nz), 2.2) * 0.28;
        let lum = 0.12 + ndot * 0.78 + spec + rim;
        if (d > 0) lum *= Math.max(0, 1 - d / 0.05);
        const rad = lum * cell * 0.52;
        if (rad < 0.4) continue;
        const along = px * axisX + py * axisY;
        const pulse = (Math.sin(along * 2.4 - travel) + 1) * 0.5;
        const flash = 0.55 + 0.45 * pulse;
        const rgb = mix3([255, 236, 130], [255, 210, 52], [226, 90, 48], pulse);
        ctx.fillStyle = `rgb(${Math.min(255, rgb[0] * lum * flash)},${Math.min(255, rgb[1] * lum * flash)},${Math.min(255, rgb[2] * lum * flash)})`;
        ctx.beginPath();
        ctx.arc((i + 0.5) * cell, (j + 0.5) * cell, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function ellipse(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  }

  function drawCylinder(ctx, x, y, r, height, color, fill) {
    const ry = r * 0.32;
    ctx.save();
    ctx.fillStyle = color.side;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x - r, y - height * fill);
    ctx.ellipse(x, y - height * fill, r, ry, 0, Math.PI, 0, true);
    ctx.lineTo(x + r, y);
    ctx.ellipse(x, y, r, ry, 0, 0, Math.PI, false);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color.stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = color.top;
    ellipse(ctx, x, y - height * fill, r, ry);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawScore(ctx, w, h, t) {
    ctx.fillStyle = "#070809";
    ctx.fillRect(0, 0, w, h);
    const step = 22;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    const cx = w * 0.38;
    const base = h * 0.82;
    const gap = h * 0.055;
    const tick = (t % 4200) / 4200;
    const grow = reduced ? 1 : smooth(Math.min(1, tick / 0.45));
    const layers = [
      { label: "asrs", h: h * 0.13, fill: 0.7 * grow, accent: false, n: "18" },
      { label: "gad-7", h: h * 0.18, fill: 0.86 * grow, accent: true, n: "11" },
      { label: "pcl-5", h: h * 0.15, fill: 0.6 * grow, accent: false, n: "22" },
    ];
    let y = base;
    const r = Math.min(w, h) * 0.11;
    ctx.font = `${Math.max(9, w * 0.038)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = "middle";

    layers.forEach((layer, i) => {
      y -= layer.h + gap;
      const color = layer.accent
        ? { top: "rgba(232,146,58,0.95)", side: "rgba(232,146,58,0.38)", stroke: "#e8923a" }
        : { top: "rgba(210,210,210,0.18)", side: "rgba(210,210,210,0.08)", stroke: "rgba(220,220,220,0.45)" };
      drawCylinder(ctx, cx, y + layer.h, r, layer.h, color, Math.max(0.18, layer.fill));

      const lx = w * 0.62;
      const ly = y + layer.h * 0.35;
      ctx.strokeStyle = layer.accent ? "#e8923a" : "rgba(255,255,255,0.28)";
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(cx + r + 6, ly);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = layer.accent ? "#e8923a" : "rgba(230,230,230,0.7)";
      ctx.textAlign = "left";
      ctx.fillText(layer.label, lx + 6, ly);
      if (layer.accent) {
        const shown = reduced ? 11 : Math.round(11 * grow);
        ctx.fillStyle = "#fff";
        ctx.font = `700 ${Math.max(12, w * 0.055)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillText(String(shown), lx + 6, ly + Math.max(14, h * 0.07));
        ctx.font = `${Math.max(8, w * 0.032)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillText("moderada", lx + 6, ly + Math.max(26, h * 0.12));
        ctx.font = `${Math.max(9, w * 0.038)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      } else if (i === 0 && grow > 0.3) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillText(layer.n, lx + 6, ly + Math.max(12, h * 0.055));
      }
    });

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.font = `${Math.max(8, w * 0.03)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = "left";
    ctx.fillText("scoring.local", 16, 20);
  }

  const DRAW = { orb: drawNeurons, neurons: drawNeurons, lego: drawLego, lock: drawLock, score: drawScore, bolt: drawBolt };

  function postAscii(src, dst, t, charset) {
    const sw = src.width;
    const sh = src.height;
    const dw = dst.canvas.width;
    const dh = dst.canvas.height;
    const cell = Math.max(6, Math.round(dw / sw));
    const sctx = src.getContext("2d", { willReadFrequently: true });
    const pixels = sctx.getImageData(0, 0, sw, sh).data;
    dst.fillStyle = "#070809";
    dst.fillRect(0, 0, dw, dh);
    dst.font = `700 ${cell * 1.02}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    dst.textBaseline = "top";
    dst.textAlign = "left";
    const glyphs = charset || CHARSET;
    const last = glyphs.length - 1;
    for (let j = 0; j < sh; j++) {
      for (let i = 0; i < sw; i++) {
        const p = (j * sw + i) * 4;
        const a = pixels[p + 3];
        if (a < 12) continue;
        const r = pixels[p];
        const g = pixels[p + 1];
        const b = pixels[p + 2];
        let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (lum < 0.045) continue;
        const wobble = (Math.sin(t * 0.003 + i * 0.33 + j * 0.29) + 1) * 0.035;
        const ci = Math.max(0, Math.min(last, Math.floor((lum + wobble) * last)));
        dst.fillStyle = `rgb(${r},${g},${b})`;
        dst.fillText(glyphs[ci], i * cell, j * cell);
      }
    }
  }

  function postDither(src, dst) {
    const w = src.width;
    const h = src.height;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    const img = sctx.getImageData(0, 0, w, h);
    const out = dst.createImageData(w, h);
    const srcD = img.data;
    const dstD = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const lum = (0.2126 * srcD[i] + 0.7152 * srcD[i + 1] + 0.0722 * srcD[i + 2]) * (srcD[i + 3] / 255);
        const thr = ((BAYER[y & 7][x & 7] + 0.5) / 64) * 255;
        dstD[i + 3] = 255;
        if (lum > thr * 0.82 + 6) {
          dstD[i] = srcD[i];
          dstD[i + 1] = srcD[i + 1];
          dstD[i + 2] = srcD[i + 2];
        }
      }
    }
    dst.putImageData(out, 0, 0);
  }

  function makeVisual(canvas) {
    const type = canvas.dataset.visual;
    const post = canvas.dataset.post || "cad";
    const draw = DRAW[type];
    if (!draw) return null;
    const off = document.createElement("canvas");
    const octx = off.getContext("2d", { willReadFrequently: true });
    let active = false;
    let last = 0;
    let sized = false;
    let cssW = 0;
    let cssH = 0;

    function sizeScene(dw, dh) {
      if (post === "ascii") {
        const cell = 7;
        off.width = Math.max(28, Math.floor(dw / cell));
        off.height = Math.max(18, Math.floor(dh / cell));
      } else {
        off.width = dw;
        off.height = dh;
      }
      sized = true;
    }

    function readCssSize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = Math.max(1, Math.round(canvas.clientWidth * dpr));
      cssH = Math.max(1, Math.round(canvas.clientHeight * dpr));
    }

    function render(now, force) {
      if (!force && !active) return;
      if (!cssW || !cssH) readCssSize();
      const dw = cssW;
      const dh = cssH;
      if (!sized || canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw;
        canvas.height = dh;
        sizeScene(dw, dh);
      }
      last = now;
      octx.clearRect(0, 0, off.width, off.height);
      draw(octx, off.width, off.height, now);
      const ctx = canvas.getContext("2d");
      if (post === "ascii") postAscii(off, ctx, now, type === "orb" ? CHARSET_ORB : CHARSET);
      else if (post === "dither") postDither(off, ctx);
      else {
        ctx.clearRect(0, 0, dw, dh);
        ctx.drawImage(off, 0, 0, dw, dh);
      }
    }

    const ro = new ResizeObserver(() => {
      readCssSize();
      sized = false;
    });
    ro.observe(canvas);

    return {
      canvas,
      render,
      setActive(v) {
        active = v;
      },
    };
  }

  document.querySelectorAll("[data-hero-camera]").forEach((root) => {
    const viewport = root.querySelector(".hero-camera__viewport");
    const scene = root.querySelector(".hero-camera__scene");
    const cards = [...root.querySelectorAll(".hero-cam-card")];
    const dots = [...root.querySelectorAll(".hero-camera__dot")];
    const visuals = cards
      .map((card) => {
        const canvas = card.querySelector("canvas[data-visual]");
        const visual = canvas ? makeVisual(canvas) : null;
        return visual;
      })
      .filter(Boolean);

    if (!viewport || !scene || !cards.length) return;

    let index = Math.max(0, cards.findIndex((c) => c.classList.contains("is-active")));
    let timer = null;
    let paused = false;
    let boxes = [];
    let intro = !reduced;

    function measure() {
      boxes = cards.map((card) => ({
        x: card.offsetLeft + card.offsetWidth / 2,
        y: card.offsetTop + card.offsetHeight / 2,
        w: card.offsetWidth,
        h: card.offsetHeight,
      }));
    }

    function apply(cx, cy, zoom) {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const tx = vw / 2 - cx * zoom;
      const ty = vh / 2 - cy * zoom;
      scene.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
    }

    function currentZoom(i = index) {
      const desired = viewport.clientWidth < 560 ? 1.14 : ZOOM;
      const b = boxes[i];
      const vh = viewport.clientHeight;
      if (!b || vh < 1) return desired;
      const maxZoom = (vh - 20) / b.h;
      return Math.min(desired, Math.max(0.5, maxZoom));
    }

    function frameCard(i, zoom = currentZoom(i)) {
      const b = boxes[i];
      if (!b) return;
      apply(b.x, b.y, zoom);
    }

    function overview() {
      if (boxes.length < 2) return frameCard(0, 1);
      const first = boxes[0];
      const last = boxes[boxes.length - 1];
      const cx = (first.x + last.x) / 2;
      const cy = (first.y + last.y) / 2;
      const span = last.x + last.w / 2 - (first.x - first.w / 2) + 64;
      const zoom = Math.min(
        viewport.clientWidth / span,
        viewport.clientHeight / (first.h + 96),
        0.82
      );
      apply(cx, cy, Math.max(0.42, zoom));
    }

    function syncUi() {
      cards.forEach((card, i) => {
        const on = i === index;
        card.classList.toggle("is-active", on);
      });
      dots.forEach((dot, i) => {
        const on = i === index;
        dot.classList.toggle("is-active", on);
        dot.setAttribute("aria-selected", String(on));
      });
      visuals.forEach((v, i) => v.setActive(i === index));
    }

    function go(next) {
      index = (next + cards.length) % cards.length;
      intro = false;
      frameCard(index);
      syncUi();
    }

    function stopAuto() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function startAuto() {
      stopAuto();
      if (reduced || paused || cards.length < 2) return;
      timer = setInterval(() => go(index + 1), AUTO_MS);
    }

    cards.forEach((card, i) => {
      card.addEventListener("click", (e) => {
        if (i === index) return;
        e.preventDefault();
        go(i);
        startAuto();
      });
    });
    dots.forEach((dot, i) => {
      dot.addEventListener("click", () => {
        go(i);
        startAuto();
      });
    });
    root.querySelectorAll("[data-cam-dir]").forEach((btn) => {
      btn.addEventListener("click", () => {
        go(index + Number(btn.dataset.camDir));
        startAuto();
      });
    });

    let touchX = null;
    viewport.addEventListener("touchstart", (e) => {
      touchX = e.changedTouches[0].clientX;
    }, { passive: true });
    viewport.addEventListener("touchend", (e) => {
      if (touchX == null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 40) {
        go(index + (dx < 0 ? 1 : -1));
        startAuto();
      }
      touchX = null;
    });

    root.addEventListener("mouseenter", () => {
      paused = true;
      stopAuto();
    });
    root.addEventListener("mouseleave", () => {
      paused = false;
      startAuto();
    });
    root.addEventListener("focusin", stopAuto);
    root.addEventListener("focusout", () => {
      if (!root.matches(":hover")) startAuto();
    });
    root.tabIndex = 0;
    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(index + 1);
        startAuto();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
        startAuto();
      }
    });

    const ro = new ResizeObserver(() => {
      measure();
      if (intro) overview();
      else frameCard(index);
    });
    ro.observe(viewport);

    let running = true;
    const io = new IntersectionObserver(
      (entries) => {
        running = entries.some((e) => e.isIntersecting);
        if (running) startAuto();
        else stopAuto();
      },
      { threshold: 0.2 }
    );
    io.observe(root);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAuto();
      else if (running) startAuto();
    });

    root.classList.add("is-armed");
    measure();
    syncUi();
    if (intro) {
      scene.style.transition = "none";
      overview();
      requestAnimationFrame(() => {
        scene.style.transition = "";
      });
      window.setTimeout(() => {
        if (intro) {
          intro = false;
          frameCard(index);
        }
        startAuto();
      }, 700);
    } else {
      scene.style.transition = "none";
      frameCard(index);
      requestAnimationFrame(() => {
        scene.style.transition = "";
      });
      startAuto();
    }

    const firstNow = performance.now();
    visuals.forEach((v) => v.render(firstNow, true));

    let frameN = 0;
    function loop(now) {
      frameN += 1;
      if (running && !document.hidden) {
        visuals.forEach((v, i) => {
          const live = i === index;
          if (reduced) {
            if (frameN === 1) v.render(now, true);
            return;
          }
          if (live || frameN % 7 === i % 7) v.render(now, live);
        });
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  });

  const isoVisuals = [...document.querySelectorAll("canvas[data-visual]")]
    .filter((canvas) => !canvas.closest("[data-hero-camera]"))
    .map(makeVisual)
    .filter(Boolean);

  if (isoVisuals.length) {
    const seen = new Map();
    isoVisuals.forEach((v) => {
      v.setActive(false);
      seen.set(v.canvas, v);
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const v = seen.get(entry.target);
          if (v) v.setActive(entry.isIntersecting && entry.intersectionRatio > 0.08);
        });
      },
      { threshold: [0, 0.08, 0.25] }
    );
    isoVisuals.forEach((v) => io.observe(v.canvas));
    const firstNow = performance.now();
    isoVisuals.forEach((v) => v.render(firstNow, true));
    function isoLoop(now) {
      if (!document.hidden) {
        isoVisuals.forEach((v) => v.render(now));
      }
      requestAnimationFrame(isoLoop);
    }
    requestAnimationFrame(isoLoop);
  }
})();
