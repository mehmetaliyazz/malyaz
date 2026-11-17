/* Malyaz — ebru (kâğıt marmorlama) üreticisi.
   Damla ve tarak hareketleri, Jaffer'in "Mathematical Marbling" formülleriyle hesaplanır.
   Aynı tohum her zaman aynı deseni verir. */
(function (g) {
  'use strict';
  const MW = 1000, MH = 1500; // model alanı (2:3)

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const PALETTES = {
    terennum: { base: '#1b2a4e', inks: ['#2d4782', '#ebe3cf', '#b8903c', '#4a6ca6', '#0f1934', '#d9c9a3', '#2d4782', '#ebe3cf'] },
    tinilar:  { base: '#11575b', inks: ['#e9e3d3', '#9a2c3b', '#2a8986', '#0b383b', '#d3ad57', '#e9e3d3', '#5ea8a1', '#9a2c3b'] },
    malyaz:   { base: '#16223f', inks: ['#e9e1cb', '#2b447c', '#b48b3a', '#11575b', '#ebe3cf', '#3f62a0', '#d8c69c', '#0e1730'] }
  };
  const STYLES = { terennum: 'gelgit', tinilar: 'tarak', malyaz: 'dalga' };

  function circle(cx, cy, r) {
    const n = Math.max(120, Math.round(r * 1.2)); const pts = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts[i * 2] = cx + Math.cos(a) * r; pts[i * 2 + 1] = cy + Math.sin(a) * r; }
    return pts;
  }
  function applyDrop(pts, cx, cy, r) {
    const r2 = r * r;
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i] - cx, dy = pts[i + 1] - cy; const m2 = dx * dx + dy * dy || 1e-6;
      const s = Math.sqrt(1 + r2 / m2); pts[i] = cx + dx * s; pts[i + 1] = cy + dy * s;
    }
  }
  // kenarları sık örnekle ki tarak sonrası çizgiler kırılmasın
  function resample(pts, maxLen) {
    const out = []; const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const x0 = pts[i * 2], y0 = pts[i * 2 + 1], j = (i + 1) % n, x1 = pts[j * 2], y1 = pts[j * 2 + 1];
      const d = Math.hypot(x1 - x0, y1 - y0); const k = Math.max(1, Math.ceil(d / maxLen));
      for (let t = 0; t < k; t++) { out.push(x0 + (x1 - x0) * t / k, y0 + (y1 - y0) * t / k); }
    }
    return Float64Array.from(out);
  }

  function build(name) {
    const pal = PALETTES[name] || PALETTES.malyaz; const R = rng(hash('malyaz:' + name));
    const drops = [];
    const count = 44;
    for (let k = 0; k < count; k++) {
      const big = k < 7;
      const r = (big ? 150 + R() * 170 : 40 + R() * 110);
      const cx = -80 + R() * (MW + 160), cy = -80 + R() * (MH + 160);
      for (const d of drops) applyDrop(d.pts, cx, cy, r);
      drops.push({ pts: circle(cx, cy, r), color: pal.inks[k % pal.inks.length] });
    }
    // yuvarlak "taş" damlaları en sonda, desene küçük benekler
    for (let k = 0; k < 26; k++) {
      const r = 8 + R() * 26; const cx = R() * MW, cy = R() * MH;
      for (const d of drops) applyDrop(d.pts, cx, cy, r);
      drops.push({ pts: circle(cx, cy, r), color: pal.inks[(k * 3 + 1) % pal.inks.length] });
    }
    for (const d of drops) d.pts = resample(d.pts, 6);
    const tines = makeTines(STYLES[name] || 'dalga', R);
    return { name, pal, drops, tines };
  }

  function makeTines(style, R) {
    const t = [];
    if (style === 'gelgit') { // yatay gidip gelen tarak
      const gap = MH / 9; for (let i = 0; i < 10; i++) t.push({ kind: 'h', at: i * gap + R() * 20, dir: i % 2 ? 1 : -1, a: 170, l: 26 });
      t.push({ kind: 'wave', at: MW * 0.5, amp: 120, per: 520, a: 0 });
    } else if (style === 'tarak') { // dikey ince tarak
      const gap = MW / 12; for (let i = 0; i < 13; i++) t.push({ kind: 'v', at: i * gap + R() * 14, dir: i % 2 ? 1 : -1, a: 210, l: 20 });
      const gap2 = MH / 6; for (let i = 0; i < 7; i++) t.push({ kind: 'h', at: i * gap2, dir: i % 2 ? 1 : -1, a: 60, l: 40 });
    } else { // dalga
      t.push({ kind: 'wave', at: 0, amp: 70, per: 380, a: 0 });
      const gap = MH / 7; for (let i = 0; i < 8; i++) t.push({ kind: 'h', at: i * gap, dir: i % 2 ? 1 : -1, a: 140, l: 34 });
    }
    return t;
  }

  function applyTines(src, tines, f) {
    const pts = Float64Array.from(src);
    for (const tn of tines) {
      if (tn.kind === 'h') {
        const A = tn.a * f * tn.dir, L = tn.l;
        for (let i = 0; i < pts.length; i += 2) { const d = Math.abs(pts[i + 1] - tn.at); pts[i] += A * L / (d + L); }
      } else if (tn.kind === 'v') {
        const A = tn.a * f * tn.dir, L = tn.l;
        for (let i = 0; i < pts.length; i += 2) { const d = Math.abs(pts[i] - tn.at); pts[i + 1] += A * L / (d + L); }
      } else if (tn.kind === 'wave') {
        const amp = tn.amp * f;
        for (let i = 0; i < pts.length; i += 2) { pts[i] += amp * Math.sin(pts[i + 1] / tn.per * Math.PI * 2); }
      }
    }
    return pts;
  }

  const cache = {};
  function model(name) { return cache[name] || (cache[name] = build(name)); }

  /* Tuvale çizer. fit: 'cover'; ox/oy: 0..1 kırpma konumu; f: tarak oranı (0..1) */
  function draw(canvas, name, opt) {
    opt = opt || {};
    const m = model(name); const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height; const f = opt.f == null ? 1 : opt.f;
    const s = Math.max(W / MW, H / MH) * (opt.zoom || 1);
    const ox = (W - MW * s) * (opt.ox == null ? 0.5 : opt.ox), oy = (H - MH * s) * (opt.oy == null ? 0.5 : opt.oy);
    ctx.save(); ctx.fillStyle = m.pal.base; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(s, 0, 0, s, ox, oy);
    for (const d of m.drops) {
      const p = f === 0 ? d.pts : applyTines(d.pts, m.tines, f);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.closePath(); ctx.fillStyle = d.color; ctx.fill();
    }
    ctx.restore();
    if (opt.grain !== false) grain(ctx, W, H, name);
  }
  function grain(ctx, W, H, name) {
    const R = rng(hash('grain' + name)); ctx.save(); ctx.globalAlpha = 0.06;
    const n = Math.round(W * H / 90);
    for (let i = 0; i < n; i++) { ctx.fillStyle = R() > 0.5 ? '#fff' : '#000'; ctx.fillRect(R() * W, R() * H, 1, 1); }
    ctx.restore();
  }

  g.Ebru = { draw, model, PALETTES };
})(window);
