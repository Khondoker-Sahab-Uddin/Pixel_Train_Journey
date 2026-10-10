/* Dhaka -> Khulna pixel train. Everything is drawn in code on a 320x180 canvas. */
(() => {
  'use strict';

  // ------------------------------------------------------------------ config
  const W = 320, H = 180;
  const L = 14400;               // route length in world units
  const TRAIN_FRONT = 232;       // screen x of the loco nose
  const CENTER = 160;            // screen x where a station building is centred when stopped
  const GY = 140;                // rail top
  const HORIZON = 100;
  const CRUISE = 70;             // units/second at 1x
  const MUSIC_START = 39;        // seconds into the song
  const MUSIC_SRC = 'assets/bus-sohokari.mp3';

  const STOPS = [
    { x: 0,     name: 'DHAKA',     bn: 'ঢাকা',  tint: '#b9534a', fact: 'Kamalapur, the capital\'s main railway station. All aboard for the south-west.' },
    { x: 7300,  name: 'BHANGA JN', bn: 'ভাঙ্গা',  tint: '#c78b3a', fact: 'Bhanga Junction, the first big stop after crossing the Padma.' },
    { x: 10800, name: 'JASHORE',   bn: 'যশোর',   tint: '#4f8f5a', fact: 'Jashore, famous for its date-palm sap and molasses in winter.' },
    { x: 14400, name: 'KHULNA',    bn: 'খুলনা',   tint: '#3f7fb0', fact: 'Khulna, the gateway to the Sundarbans mangrove forest.' }
  ];
  const LANDMARK = { x: 4700, len: 700, name: 'PADMA BRIDGE', bn: 'পদ্মা সেতু', fact: 'Bangladesh\'s longest bridge. The rail link opened in 2023.' };

  const SEGS = [
    { a: 0,     b: 2000,  t: 'city'   },
    { a: 2000,  b: 4400,  t: 'kiln'   },
    { a: 4400,  b: 6900,  t: 'bridge' },
    { a: 6900,  b: 10800, t: 'paddy'  },
    { a: 10800, b: 13700, t: 'delta'  },
    { a: 13700, b: 14401, t: 'port'   }
  ];
  const BRIDGE_A = 4460, BRIDGE_B = 6840;

  // ------------------------------------------------------------------ utils
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const hsh = (i, s) => {
    let x = (Math.imul(i | 0, 374761393) + Math.imul(s | 0, 668265263)) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };
  const disc = (cx, cy, r, c) => {
    ctx.fillStyle = c;
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy + 0.5));
      ctx.fillRect((cx - w) | 0, (cy + dy) | 0, 2 * w + 1, 1);
    }
  };
  const blob = (x, base, w, h, c) => {   // chunky bush/tree-crown silhouette
    ctx.fillStyle = c;
    for (let k = 0; k < h; k++) {
      const t = k / h;
      const ww = Math.floor(w * Math.sqrt(1 - (1 - t) * (1 - t)));
      ctx.fillRect((x + (w - ww) / 2) | 0, (base - h + k) | 0, Math.max(ww, 1), 1);
    }
  };

  const themeAt = wx => {
    const x = clamp(wx, 0, L);
    for (const s of SEGS) if (x >= s.a && x < s.b) return s.t;
    return 'port';
  };

  // ------------------------------------------------------------------ sky
  const SKY = [
    { p: 0,    top: hex('#3a2f6b'), bot: hex('#ffa86b') },
    { p: 0.18, top: hex('#6fb4ec'), bot: hex('#d7f0ff') },
    { p: 0.5,  top: hex('#3f93e6'), bot: hex('#c4e8ff') },
    { p: 0.72, top: hex('#7a4fa0'), bot: hex('#ffb04d') },
    { p: 0.88, top: hex('#3a2866'), bot: hex('#e0704f') },
    { p: 1,    top: hex('#16123a'), bot: hex('#6e3468') }
  ];
  const skyAt = p => {
    p = clamp(p, 0, 1);
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i], b = SKY[i + 1];
      if (p <= b.p) { const t = (p - a.p) / (b.p - a.p); return { top: mix(a.top, b.top, t), bot: mix(a.bot, b.bot, t) }; }
    }
    return SKY[SKY.length - 1];
  };

  // ------------------------------------------------------------------ state
  const q = new URLSearchParams(location.search);
  let cam = STOPS[0].x - CENTER;
  let camI = Math.floor(cam);
  let speed = 0;
  let paused = false;
  let mult = 1;
  let boost = false;
  let started = false;
  let stopIdx = 0;                 // index of the stop we are at / just left
  let state = 'stopped';           // stopped | running
  let stopTimer = 0;
  let endShown = false;
  let T = 0;                       // animation clock (s)
  const smoke = [];

  const stopCam = i => STOPS[i].x - CENTER;

  // debug helper: ?at=5200 jumps to a world position and freezes
  if (q.has('at')) {
    cam = parseFloat(q.get('at')) - CENTER; camI = Math.floor(cam);
    started = true; state = 'running'; speed = CRUISE;
    stopIdx = Math.max(0, STOPS.findIndex(s => s.x > parseFloat(q.get('at'))));
    paused = q.get('paused') === '1';
    document.getElementById('start').classList.add('hidden');
  }

  // ------------------------------------------------------------------ audio
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = MUSIC_SRC;
  audio.volume = 0;
  let musicOn = true;

  audio.addEventListener('ended', () => {            // loop back to 0:39, not 0:00
    audio.currentTime = MUSIC_START;
    audio.play().catch(() => {});
  });

  let fadeRaf = 0;
  const fadeTo = (v, ms = 800) => {
    cancelAnimationFrame(fadeRaf);
    const v0 = audio.volume, t0 = performance.now();
    const step = now => {
      const k = clamp((now - t0) / ms, 0, 1);
      audio.volume = lerp(v0, v, k);
      if (k < 1) fadeRaf = requestAnimationFrame(step);
    };
    fadeRaf = requestAnimationFrame(step);
  };

  const startMusic = () => {
    const go = () => {
      try { audio.currentTime = MUSIC_START; } catch (e) { /* ignore */ }
      audio.play().then(() => { if (musicOn) fadeTo(0.8, 1200); }).catch(() => {});
    };
    if (audio.readyState >= 1) go();
    else { audio.addEventListener('loadedmetadata', go, { once: true }); audio.load(); }
  };

  document.addEventListener('visibilitychange', () => {
    if (!started || !musicOn) return;
    if (document.hidden) audio.pause(); else audio.play().catch(() => {});
  });

  // ------------------------------------------------------------------ HUD
  const $ = id => document.getElementById(id);
  const banner = $('banner');
  const nextEl = $('next');
  const barEl = $('bar'), markerEl = $('marker');

  (() => {                                            // build progress dots + labels
    const dots = $('dots'), labels = $('labels');
    STOPS.forEach((s, i) => {
      const left = (s.x / L) * 100 + '%';
      const d = document.createElement('span'); d.style.left = left; dots.appendChild(d);
      const l = document.createElement('span'); l.style.left = left; l.textContent = s.name; labels.appendChild(l);
    });
  })();

  const showBanner = (tag, name, bn, fact) => {
    $('banner-tag').textContent = tag;
    $('banner-name').textContent = name;
    $('banner-bn').textContent = bn;
    $('banner-fact').textContent = fact;
    banner.classList.add('show');
  };

  const bind = (id, fn) => $(id).addEventListener('click', fn);

  bind('start-btn', () => {
    if (started) return;
    started = true;
    $('start').classList.add('hidden');
    stopTimer = 3;
    startMusic();
  });
  bind('btn-pause', () => {
    paused = !paused;
    $('btn-pause').textContent = paused ? 'PLAY' : 'PAUSE';
    $('btn-pause').classList.toggle('active', paused);
  });
  bind('btn-speed', () => {
    mult = mult === 1 ? 2 : mult === 2 ? 3 : 1;
    $('btn-speed').textContent = mult + 'x';
  });
  bind('btn-next', () => {
    if (!started) return;
    if (state === 'stopped') { if (stopIdx < STOPS.length - 1) stopTimer = 0; }
    else boost = true;
  });
  bind('btn-music', () => {
    musicOn = !musicOn;
    $('btn-music').innerHTML = musicOn ? '&#9834; ON' : '&#9834; OFF';
    $('btn-music').classList.toggle('active', !musicOn);
    if (!started) return;
    if (musicOn) { audio.play().catch(() => {}); fadeTo(0.8, 500); }
    else { fadeTo(0, 300); setTimeout(() => { if (!musicOn) audio.pause(); }, 350); }
  });
  bind('again-btn', () => {
    cam = stopCam(0); camI = Math.floor(cam); speed = 0;
    stopIdx = 0; state = 'stopped'; stopTimer = 2.5; endShown = false; boost = false;
    $('end').classList.add('hidden');
    if (musicOn) { try { audio.currentTime = MUSIC_START; } catch (e) {} audio.play().catch(() => {}); fadeTo(0.8, 600); }
  });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); $('btn-pause').click(); }
    if (e.code === 'ArrowRight') $('btn-next').click();
    if (e.key === 'm' || e.key === 'M') $('btn-music').click();
  });

  // ------------------------------------------------------------------ simulation
  const update = dt => {
    if (!started) return;
    if (state === 'stopped') {
      speed = 0;
      if (stopIdx < STOPS.length - 1) {
        stopTimer -= dt;
        if (stopTimer <= 0) { state = 'running'; stopIdx++; boost = false; }
      } else if (!endShown) {
        stopTimer += dt;
        if (stopTimer > 4) { endShown = true; $('end').classList.remove('hidden'); }
      }
      return;
    }
    const target = stopCam(stopIdx);               // stopIdx already points to the next stop
    const dist = target - cam;
    const m = mult * (boost ? 4 : 1);
    const vmax = CRUISE * m;
    const BR = 18 * m * m;
    const brakeV = Math.sqrt(2 * BR * Math.max(dist, 0)) + 2;
    speed = Math.min(speed + 45 * m * dt, vmax, brakeV);
    cam += speed * dt;
    if (cam >= target - 0.4 || (dist < 4 && speed < 3)) {
      cam = target; speed = 0; state = 'stopped'; boost = false;
      stopTimer = stopIdx === STOPS.length - 1 ? 0 : 5;
    }
  };

  const updateHud = () => {
    const wx = cam + CENTER;
    const p = clamp(wx / L, 0, 1);
    barEl.style.width = p * 100 + '%';
    markerEl.style.left = p * 100 + '%';

    const atStop = started && state === 'stopped';
    if (atStop && stopIdx < STOPS.length) {
      const s = STOPS[stopIdx];
      showBanner(stopIdx === STOPS.length - 1 ? 'FINAL STOP' : (stopIdx === 0 ? 'DEPARTING FROM' : 'ARRIVED'), s.name, s.bn, s.fact);
    } else if (started && wx >= LANDMARK.x && wx <= LANDMARK.x + LANDMARK.len) {
      showBanner('NOW CROSSING', LANDMARK.name, LANDMARK.bn, LANDMARK.fact);
    } else banner.classList.remove('show');

    const nxt = state === 'running' ? STOPS[stopIdx] : STOPS[stopIdx + 1];
    nextEl.textContent = nxt ? 'NEXT: ' + nxt.name : 'TERMINUS';
  };

  // ------------------------------------------------------------------ drawing: layers
  function layer(f, cw, seed, fn) {
    const cf = Math.floor(camI * f);
    const i0 = Math.floor(cf / cw) - 2, i1 = Math.floor((cf + W) / cw) + 2;
    for (let i = i0; i <= i1; i++) {
      const sx = i * cw - cf;
      const wx = (i * cw - CENTER) / f + CENTER;       // world x when this cell is at screen centre
      fn(sx, themeAt(wx), hsh(i, seed), hsh(i, seed + 1), hsh(i, seed + 2), i, wx);
    }
  }

  let pal;   // per-frame palette

  function drawSky(p) {
    const s = skyAt(p);
    const bands = 17, bh = Math.ceil(HORIZON / bands);
    for (let i = 0; i < bands; i++) {
      const t = Math.floor((i / (bands - 1)) * 6) / 6;     // quantised -> banded pixel gradient
      R(0, i * bh, W, bh + 1, rgb(mix(s.top, s.bot, t)));
    }
    R(0, HORIZON - 2, W, H, rgb(s.bot));
    pal.skyBot = s.bot;

    // stars
    const night = clamp((p - 0.84) / 0.14, 0, 1) + clamp((0.05 - p) / 0.05, 0, 1) * 0.5;
    if (night > 0) {
      for (let i = 0; i < 46; i++) {
        const x = Math.floor(hsh(i, 7) * W), y = Math.floor(hsh(i, 8) * 70);
        if (hsh(i, 9) < night && ((Math.floor(T * 2 + i) % 5) !== 0)) R(x, y, 1, 1, '#fff6d8');
      }
    }

    // sun
    const sp = clamp(p / 0.95, 0, 1);
    const sx = 30 + sp * 260, sy = HORIZON - Math.sin(sp * Math.PI) * 82;
    const low = 1 - Math.sin(sp * Math.PI);
    const sc = rgb(mix(hex('#fff3b0'), hex('#ff6a3a'), clamp(low * 1.4, 0, 1)));
    ctx.globalAlpha = 0.18; disc(sx | 0, sy | 0, 15, sc);
    ctx.globalAlpha = 0.28; disc(sx | 0, sy | 0, 12, sc);
    ctx.globalAlpha = 1;    disc(sx | 0, sy | 0, 8, sc);

    // clouds
    layer(0.06, 90, 31, (x, th, r1, r2, r3) => {
      if (r1 > 0.6) return;
      const y = 10 + Math.floor(r2 * 42), w = 22 + Math.floor(r3 * 24);
      const c = rgb(mix([255, 255, 255], s.bot, 0.25));
      R(x + 4, y, w - 8, 3, c); R(x, y + 3, w, 3, c); R(x + 6, y - 3, w * 0.4, 3, c);
    });

    // birds
    layer(0.3, 110, 44, (x, th, r1, r2) => {
      if (th === 'city' || th === 'port' || r1 > 0.35 || p > 0.8) return;
      const y = 30 + Math.floor(r2 * 36), fl = Math.floor(T * 5 + x) % 2;
      for (let b = 0; b < 3; b++) {
        const bx = x + b * 9, by = y + (b % 2) * 5;
        R(bx, by + fl, 2, 1, '#3b2f3f'); R(bx + 2, by + (1 - fl), 2, 1, '#3b2f3f');
      }
    });
  }

  function drawFar() {
    const hz = HORIZON;
    const base = mix(pal.skyBot, [74, 92, 132], 0.5);
    const baseL = mix(pal.skyBot, [120, 140, 176], 0.5);
    const cs = rgb(base), cl = rgb(baseL);
    layer(0.12, 48, 101, (x, th, r1, r2, r3) => {
      if (th === 'city') {
        for (let b = 0; b < 2; b++) {
          const w = 12 + Math.floor(hsh(r1 * 1000 | 0, b) * 12), h = 20 + Math.floor(hsh(r2 * 1000 | 0, b + 3) * 36);
          const bx = x + b * 22;
          R(bx, hz - h, w, h, cs); R(bx, hz - h, w, 2, cl);
          for (let k = 0; k < 4; k++) R(bx + 2 + (k % 2) * 5, hz - h + 6 + Math.floor(k / 2) * 7, 2, 2, cl);
        }
      } else if (th === 'bridge') {
        R(x, hz - 3, 48, 3, cs);
        if (r1 > 0.7) { R(x + 20, hz - 24, 2, 24, cs); R(x + 14, hz - 22, 14, 2, cs); }
      } else if (th === 'port') {
        R(x, hz - 14, 24, 14, cs); R(x + 26, hz - 8, 20, 8, cs);
        if (r1 > 0.4) { R(x + 8, hz - 40, 2, 40, cs); R(x + 24, hz - 40, 2, 40, cs); R(x + 2, hz - 44, 30, 3, cs); }
      } else {
        const dark = th === 'delta' ? mix(base, [30, 70, 60], 0.4) : base;
        for (let b = 0; b < 3; b++) {
          const bw = 18 + Math.floor(hsh(r1 * 1000 | 0, b + 9) * 14), bh = 8 + Math.floor(hsh(r2 * 1000 | 0, b + 5) * (th === 'delta' ? 14 : 9));
          blob(x + b * 15, hz, bw, bh, rgb(dark));
        }
      }
    });
  }

  function drawField() {
    // land / water between horizon and the rails, built from 8px world-aligned blocks
    const bw = 8, j0 = Math.floor(camI / bw) - 1, j1 = Math.floor((camI + W) / bw) + 1;
    for (let j = j0; j <= j1; j++) {
      const wx = j * bw, sx = wx - camI, th = themeAt(wx);
      const r = hsh(j, 5);
      const top = HORIZON, h = GY - HORIZON + 2;
      if (th === 'bridge' || th === 'delta') {
        const murky = th === 'delta';
        const c1 = murky ? '#3d7a8a' : '#3f86c4', c2 = murky ? '#34697a' : '#3577b2';
        R(sx, top, bw, h, c1);
        for (let y = top + 3; y < GY; y += 5) {
          const off = Math.floor(Math.sin(T * 1.4 + j * 0.9 + y * 0.5) * 3);
          R(sx + 2 + off, y, 4, 1, c2);
          if (((j + y) & 3) === 0) R(sx + 1 - off, y + 2, 3, 1, murky ? '#6fa6aa' : '#8cc6ee');
        }
        if (murky && r > 0.45) { R(sx, top, bw, 5 + Math.floor(r * 12), '#4a8a52'); R(sx, top, bw, 2, '#3b7444'); }
      } else if (th === 'paddy') {
        R(sx, top, bw, h, (j & 1) ? '#62b44c' : '#58a845');
        for (let y = top + 4; y < GY; y += 6) R(sx, y, bw, 1, '#47923a');
        if (r > 0.9) R(sx, top + 14, bw, 4, '#6fb7d8');   // flooded plot
      } else if (th === 'kiln') {
        R(sx, top, bw, h, r > 0.5 ? '#93a24e' : '#889847');
        for (let y = top + 5; y < GY; y += 8) R(sx + ((j * 3) & 3), y, 3, 1, '#6e7e3a');
        if (r > 0.85) R(sx, top + 10, bw, 6, '#a8693c');
      } else if (th === 'port') {
        R(sx, top, bw, h, '#6b6f78');
        if ((j & 3) === 0) R(sx, top + 22, bw, 1, '#e8c547');
        if (r > 0.8) R(sx, top + 8, bw, 8, '#5a5e67');
      } else {  // city
        R(sx, top, bw, h, r > 0.5 ? '#7d7a82' : '#757279');
        if (r > 0.7) R(sx, top + 12, bw, 3, '#8f6b5a');
        R(sx, top + 30, bw, 1, '#6a676f');
      }
    }
  }

  const APT = ['#c9a27a', '#b86f5b', '#8e9aaf', '#d9c5a0', '#9a7fa3'];
  const CONT = ['#d9534f', '#4a90d9', '#e8b13a', '#5cb85c', '#9b6bd1'];

  function palm(x, base, h, dir) {
    let tx = x;
    for (let k = 0; k < h; k++) {
      tx = x + Math.floor(Math.sin((k / h) * 1.3) * 3 * dir);
      R(tx, base - k, 2, 1, '#6b4a2b');
    }
    tx += Math.floor(Math.sin(T * 1.5 + x * 0.1));
    const top = base - h;
    for (let side = -1; side <= 1; side += 2) {
      for (let t = 1; t <= 9; t++) R(tx + side * t, top + Math.floor((t * t) / 14), 1, 2, '#2f7d3a');
      for (let t = 1; t <= 6; t++) R(tx + side * t, top - 2 + Math.floor((t * t) / 10), 1, 1, '#47a352');
    }
    R(tx - 1, top - 3, 3, 3, '#47a352');
  }
  function hut(x, base) {
    R(x, base - 8, 14, 8, '#a07a52');
    R(x - 2, base - 11, 18, 3, '#8f9aa6'); R(x, base - 13, 14, 2, '#8f9aa6');
    R(x + 5, base - 5, 4, 5, '#3a2a1e');
  }
  function cow(x, base, c) {
    R(x, base - 5, 9, 4, c); R(x + 9, base - 7, 3, 3, c); R(x + 11, base - 8, 1, 2, '#3a2a1e');
    R(x + 1, base - 1, 1, 2, '#3a2a1e'); R(x + 7, base - 1, 1, 2, '#3a2a1e');
    R(x + 3, base - 4, 2, 2, c === '#f2eee6' ? '#8a6a4a' : '#3a2a1e');
  }
  function banana(x, base) {
    R(x + 3, base - 9, 2, 9, '#6b8a3a');
    R(x - 3, base - 11, 8, 2, '#3d9a4a'); R(x + 3, base - 12, 8, 2, '#3d9a4a'); R(x, base - 14, 6, 2, '#4cb25a');
  }
  function mangrove(x, base, h) {
    R(x + 3, base - 6, 1, 6, '#4a3626'); R(x + 7, base - 5, 1, 5, '#4a3626');
    blob(x - 2, base - 4, 16, h, '#2f6b45'); blob(x + 2, base - 4 - h / 2, 10, h / 2, '#3b8454');
  }
  function boat(x, y, sail) {
    y += Math.floor(Math.sin(T * 2 + x * 0.1));
    R(x, y - 3, 18, 3, '#5b3a21'); R(x + 2, y, 14, 1, '#3a2514'); R(x - 1, y - 4, 2, 1, '#5b3a21'); R(x + 17, y - 4, 2, 1, '#5b3a21');
    R(x + 9, y - 20, 1, 17, '#3a2514');
    for (let k = 0; k < 15; k++) R(x + 10, y - 19 + k, Math.floor(k * 0.55) + 1, 1, sail);
  }

  function drawMid() {
    layer(0.45, 40, 201, (x, th, r1, r2, r3, i) => {
      const base = 106;
      if (th === 'city') {
        if (r1 > 0.88) return;
        const w = 18 + Math.floor(r2 * 12), h = 26 + Math.floor(r3 * 20), c = APT[Math.floor(r1 * 50) % APT.length];
        R(x, base - h, w, h, c); R(x, base - h, w, 2, 'rgba(0,0,0,.18)');
        for (let ry = 0; ry < Math.floor((h - 6) / 7); ry++) for (let cx = 0; cx < Math.floor((w - 3) / 5); cx++) {
          R(x + 2 + cx * 5, base - h + 4 + ry * 7, 3, 3, hsh(i * 31 + ry * 7 + cx, 3) > 0.8 ? '#ffd27a' : '#2b3350');
        }
        if (r2 > 0.5) R(x + 3, base - h - 4, 6, 4, '#4a4f5c');
      } else if (th === 'kiln') {
        if (r1 < 0.34) {
          for (let k = 0; k < 40; k++) R(x + 4 + Math.floor(k / 14), base - k, 6 - Math.floor(k / 14), 1, '#a9472f');
          R(x + 4, base - 40, 4, 3, '#2b2220'); R(x + 3, base - 18, 7, 2, '#2b2220');
          for (let k = 0; k < 4; k++) {
            ctx.globalAlpha = 0.6 - k * 0.12;
            disc(x + 8 + Math.floor(Math.sin(T + k) * 2) + k * 3, base - 46 - k * 6, 3 + k, '#8d8a92');
          }
          ctx.globalAlpha = 1;
        } else if (r1 < 0.7) { hut(x + 4, base); banana(x + 22, base); }
        else { palm(x + 8, base, 20 + Math.floor(r2 * 8), r3 > 0.5 ? 1 : -1); }
      } else if (th === 'bridge') {
        if (r1 < 0.55) boat(x + Math.floor(r2 * 14), 111 + Math.floor(r3 * 4), r2 > 0.5 ? '#f2e9d8' : '#e0a050');
      } else if (th === 'paddy') {
        if (r1 < 0.34) palm(x + 10, base, 22 + Math.floor(r2 * 10), r3 > 0.5 ? 1 : -1);
        else if (r1 < 0.58) { hut(x + 4, base); if (r3 > 0.5) banana(x + 24, base); }
        else if (r1 < 0.76) { cow(x + 4, base + 1, r2 > 0.5 ? '#f2eee6' : '#8a5a3a'); if (r3 > 0.5) cow(x + 20, base + 2, '#f2eee6'); }
        else if (r1 < 0.9) { banana(x + 6, base); banana(x + 16, base); }
      } else if (th === 'delta') {
        if (r1 < 0.55) mangrove(x + 4, base + 3, 12 + Math.floor(r2 * 12));
        else if (r1 < 0.72) boat(x + 4, 111 + Math.floor(r3 * 4), '#e8d8b0');
        else if (r1 < 0.85) { R(x + 2, base - 12, 2, 12, '#4a3626'); R(x + 14, base - 12, 2, 12, '#4a3626'); R(x, base - 17, 18, 5, '#a08a52'); R(x + 3, base - 12, 12, 2, '#6b5a35'); }
      } else if (th === 'port') {
        if (r1 < 0.28) {
          R(x, base - 8, 52, 8, '#2b3040'); R(x + 40, base - 14, 4, 6, '#2b3040');
          R(x + 8, base - 16, 16, 8, '#e8e4dc'); R(x + 12, base - 20, 8, 4, '#e8e4dc');
          R(x + 14, base - 24, 3, 4, '#d9534f');
        } else if (r1 < 0.62) {
          for (let k = 0; k < 3; k++) for (let m = 0; m < 2 - (k > 1 ? 1 : 0); m++)
            R(x + m * 11, base - 6 - k * 6, 10, 5, CONT[(Math.floor(r2 * 10) + k + m) % CONT.length]);
        } else if (r1 < 0.8) {
          R(x, base - 22, 28, 22, '#a8a29a'); R(x - 2, base - 25, 32, 4, '#7e7a74'); R(x + 11, base - 11, 7, 11, '#3a3a44');
        }
      }
    });
  }

  function drawStations() {
    STOPS.forEach((s, i) => {
      const sx = Math.round(s.x - camI);
      if (Math.abs(sx - CENTER) > 260 + 100) return;
      const c = s.tint;
      // building behind the train
      const bx = sx - 76, top = 78;
      R(bx, top + 10, 152, 46, '#d9cdb8'); R(bx, top + 10, 152, 3, '#a89c86');
      R(bx - 6, top + 4, 164, 6, c); R(bx - 2, top, 156, 4, c);
      if (i === 0 || i === 3) { R(sx - 22, top - 8, 44, 8, c); R(sx - 14, top - 14, 28, 6, c); }
      for (let k = 0; k < 6; k++) R(bx + 8 + k * 24, top + 20, 10, 14, '#3a4a5c');
      // name board
      R(sx - 40, top + 14, 80, 12, '#14301f'); R(sx - 40, top + 14, 80, 1, '#fff'); R(sx - 40, top + 25, 80, 1, '#fff');
      ctx.fillStyle = '#ffffff'; ctx.font = '8px "Press Start 2P", monospace'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
      ctx.fillText(s.name, sx, top + 16);
      ctx.textAlign = 'left';
      // canopy posts
      for (let k = 0; k < 7; k++) R(bx + 4 + k * 24, top + 56, 3, 58, '#6a6270');
      R(bx - 6, top + 52, 164, 4, '#8a8392');
    });
  }

  function drawGround() {
    // ballast + embankment below the rails (column blocks so themes can change)
    const bw = 8, j0 = Math.floor(camI / bw) - 1, j1 = Math.floor((camI + W) / bw) + 1;
    for (let j = j0; j <= j1; j++) {
      const wx = j * bw, sx = wx - camI, th = themeAt(wx), r = hsh(j, 12);
      const bridge = wx >= BRIDGE_A - 8 && wx <= BRIDGE_B;
      let c = '#4a9a3e';
      if (th === 'city') c = '#5a5560'; else if (th === 'kiln') c = '#7a8a3a'; else if (th === 'paddy') c = '#4a9a3e';
      else if (th === 'port') c = '#555a63';
      if (th === 'bridge' || th === 'delta') {
        const murky = th === 'delta';
        R(sx, 150, bw, 30, murky ? '#356f94' : '#2f6aa8');
        for (let y = 154; y < H; y += 5) {
          const off = Math.floor(Math.sin(T * 1.6 + j * 1.1 + y) * 3);
          R(sx + 2 + off, y, 4, 1, murky ? '#2c5f80' : '#27598f');
          if (((j + y) & 3) === 1) R(sx + 3 - off, y + 2, 3, 1, murky ? '#5c93a8' : '#6aa8dc');
        }
        if (!bridge && th === 'bridge') { R(sx, 142, bw, 8, '#8a8680'); }   // approach embankment
      } else {
        R(sx, 150, bw, 30, c);
        R(sx, 150, bw, 2, 'rgba(0,0,0,.18)');
        if (r > 0.6) R(sx + 2, 160 + Math.floor(r * 14), 3, 1, 'rgba(255,255,255,.12)');
      }
      if (bridge) {
        R(sx, 142, bw, 9, '#9aa0aa'); R(sx, 142, bw, 1, '#c8ccd4'); R(sx, 149, bw, 2, '#6a707a');
      } else if (!(th === 'bridge')) {
        R(sx, 142, bw, 8, '#8a8680');
        R(sx + (j * 5 & 3), 144, 2, 1, '#6a6660'); R(sx + 5, 147, 1, 1, '#a8a49c');
      } else {
        R(sx, 142, bw, 8, '#8a8680');
      }
    }
    // piers
    const p0 = Math.floor((camI - 20) / 240) * 240;
    for (let wx = p0; wx < camI + W + 20; wx += 240) {
      if (wx < BRIDGE_A || wx > BRIDGE_B) continue;
      const sx = wx - camI;
      R(sx - 8, 150, 16, 30, '#b8b2a8'); R(sx + 4, 150, 4, 30, '#8f8a80'); R(sx - 10, 150, 20, 3, '#d4cfc6');
    }
    // sleepers + rails
    const s0 = Math.floor(camI / 8) * 8 - 8;
    for (let wx = s0; wx < camI + W + 8; wx += 8) R(wx - camI, 143, 5, 2, '#4a2f1e');
    R(0, GY, W, 1, '#d8dce2'); R(0, GY + 1, W, 1, '#6b6f78');
  }

  // ------------------------------------------------------------------ train
  function coach(x, y, lit) {
    R(x, y + 2, 46, 20, '#2f8f5b');          // body
    R(x, y, 46, 2, '#e4e6ea'); R(x + 1, y + 1, 44, 1, '#c3c7cd');   // roof
    R(x, y + 14, 46, 2, '#f2c14e');          // stripe
    R(x, y + 22, 46, 3, '#2a2a34');          // underframe
    for (let k = 0; k < 7; k++) {
      const wx = x + 3 + k * 6;
      R(wx, y + 5, 4, 6, lit ? '#ffd27a' : '#8fd0ff');
      R(wx, y + 5, 4, 1, 'rgba(255,255,255,.35)');
    }
    R(x + 20, y + 4, 1, 18, 'rgba(0,0,0,.25)');
    R(x - 2, y + 20, 2, 2, '#555');          // coupling
  }
  function wheel(cx, cy) {
    R(cx - 2, cy - 2, 5, 5, '#16161c');
    const a = (cam * 0.5) % (Math.PI * 2);
    R(cx + Math.round(Math.cos(a)), cy + Math.round(Math.sin(a)), 1, 1, '#8a8a95');
    R(cx - Math.round(Math.cos(a)), cy - Math.round(Math.sin(a)), 1, 1, '#8a8a95');
  }
  function loco(x, y, lit) {
    R(x, y + 2, 44, 20, '#c0392b');
    R(x, y, 30, 2, '#9a2a20');                      // cab roof
    R(x + 30, y + 4, 14, 18, '#c0392b');            // long hood slightly lower
    R(x + 30, y + 2, 14, 2, '#9a2a20');
    R(x, y + 14, 44, 2, '#f2c14e');
    R(x, y + 22, 44, 3, '#2a2a34');
    R(x + 40, y + 6, 4, 14, '#f2c14e');             // nose
    R(x + 43, y + 8, 2, 3, '#fff6c8');              // headlamp
    R(x + 3, y + 5, 8, 7, lit ? '#ffd27a' : '#8fd0ff'); R(x + 14, y + 5, 8, 7, lit ? '#ffd27a' : '#8fd0ff');
    R(x + 33, y - 1, 5, 3, '#3a3a44');              // exhaust
    R(x - 2, y + 20, 2, 2, '#555');
  }
  function drawTrain(lit) {
    const moving = speed > 8;
    const jig = moving && (Math.floor(T * 14) % 9 === 0) ? 1 : 0;
    const y = 114 + jig;
    const x0 = TRAIN_FRONT - 44;
    loco(x0, y, lit);
    for (let k = 1; k <= 3; k++) coach(x0 - 48 * k, y, lit);
    // wheels (drawn once, not part of lit pass)
    if (!lit) for (let k = 0; k <= 3; k++) {
      const bx = x0 - 48 * k;
      wheel(bx + 8, GY - 3); wheel(bx + 14, GY - 3);
      wheel(bx + (k ? 32 : 30), GY - 3); wheel(bx + (k ? 38 : 38), GY - 3);
    }
  }
  function drawSmoke(dt) {
    if (speed > 4 && !paused && Math.random() < 0.5) smoke.push({ x: TRAIN_FRONT - 8, y: 112, a: 0.7, r: 1 });
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i];
      if (!paused) { s.x -= (20 + speed * 0.8) * dt; s.y -= 12 * dt; s.a -= 0.5 * dt; s.r += 2.5 * dt; }
      if (s.a <= 0) { smoke.splice(i, 1); continue; }
      ctx.globalAlpha = s.a; disc(s.x | 0, s.y | 0, Math.floor(s.r), '#a4a2aa');
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ front-of-train scenery
  function drawTruss() {
    const k0 = Math.floor(camI / 72) - 1, k1 = Math.floor((camI + W) / 72) + 1;
    const steel = '#3d4658', steelL = '#6a758c';
    // top chord segments
    const aS = BRIDGE_A - camI, bS = BRIDGE_B - camI;
    const x0 = Math.max(0, aS), x1 = Math.min(W, bS);
    if (x1 > x0) { R(x0, 38, x1 - x0, 5, steel); R(x0, 38, x1 - x0, 1, steelL); }
    for (let k = k0; k <= k1; k++) {
      const wx = k * 72;
      if (wx < BRIDGE_A || wx > BRIDGE_B) continue;
      const sx = wx - camI;
      R(sx, 38, 4, 104, steel); R(sx, 38, 1, 104, steelL);
      if (wx + 72 <= BRIDGE_B) {
        for (let t = 0; t < 72; t++) {
          const yy = k % 2 === 0 ? 43 + Math.floor(t * 99 / 72) : 142 - Math.floor(t * 99 / 72);
          R(sx + 4 + t, yy, 1, 1, steel);
        }
      }
    }
  }

  function drawPoles() {
    const s0 = Math.floor(camI / 120) - 1;
    for (let k = s0; k <= s0 + 4; k++) {
      const wx = k * 120, sx = wx - camI;
      const th = themeAt(wx);
      if (th === 'bridge' && wx >= BRIDGE_A) continue;
      R(sx, GY - 36, 2, 36, '#3a2f2a'); R(sx - 4, GY - 36, 10, 2, '#3a2f2a'); R(sx - 3, GY - 38, 1, 2, '#8f8a90'); R(sx + 4, GY - 38, 1, 2, '#8f8a90');
    }
    // wires
    for (let sx = 0; sx < W; sx++) {
      const t = ((camI + sx) % 120 + 120) % 120 / 120;
      const wx = camI + sx, th = themeAt(wx);
      if (th === 'bridge' && wx >= BRIDGE_A) continue;
      R(sx, GY - 37 + Math.floor(Math.sin(t * Math.PI) * 5), 1, 1, '#2a2226');
    }
  }

  function drawForeground() {
    layer(1.4, 70, 301, (x, th, r1, r2, r3, i) => {
      const base = 176;
      if (th === 'city') {
        if (r1 < 0.3) { R(x + 4, base - 24, 2, 24, '#2a2a34'); R(x, base - 26, 10, 3, '#2a2a34'); R(x + 1, base - 24, 8, 1, '#ffd27a'); }
        else if (r1 < 0.55) blob(x, base, 16, 10, '#3d7a40');
        else if (r1 < 0.7) { // rickshaw
          R(x, base - 12, 10, 6, '#d9534f'); R(x + 1, base - 16, 8, 4, '#e8b13a'); disc(x + 2, base - 3, 3, '#16161c'); disc(x + 11, base - 3, 3, '#16161c'); R(x + 2, base - 3, 1, 1, '#888'); R(x + 11, base - 3, 1, 1, '#888');
        }
      } else if (th === 'bridge') {
        if (r1 < 0.2) boat(x, 172, '#f2e9d8');
      } else if (th === 'delta') {
        if (r1 < 0.5) for (let k = 0; k < 5; k++) R(x + k * 5, base - 14 - Math.floor(hsh(i * 7 + k, 2) * 10) + Math.floor(Math.sin(T * 2 + k + x * 0.1)), 2, 20, '#6b8a3a');
        else if (r1 < 0.62) boat(x, 174, '#e8d8b0');
      } else if (th === 'port') {
        if (r1 < 0.4) { R(x, base - 10, 14, 10, CONT[Math.floor(r2 * 10) % CONT.length]); R(x + 2, base - 10, 1, 10, 'rgba(0,0,0,.25)'); R(x + 6, base - 10, 1, 10, 'rgba(0,0,0,.25)'); R(x + 10, base - 10, 1, 10, 'rgba(0,0,0,.25)'); }
      } else {
        if (r1 < 0.45) for (let k = 0; k < 4; k++) R(x + k * 3, base - 8 - Math.floor(hsh(i * 5 + k, 4) * 6), 2, 10, '#3d8a3a');
        else if (r1 < 0.62) banana(x, base);
        else if (r1 < 0.78) blob(x, base, 18, 11, '#2f7d3a');
      }
    });
  }

  function drawPlatforms() {
    STOPS.forEach((s, si) => {
      const sx = Math.round(s.x - camI);
      if (Math.abs(sx - CENTER) > 360) return;
      const x0 = sx - 130;
      R(x0, 150, 260, 4, '#d6cfc3'); R(x0, 154, 260, 10, '#a39b8f'); R(x0, 150, 260, 1, '#f2c14e');
      R(x0, 162, 260, 2, '#7d766b');
      for (let k = 0; k < 8; k++) R(x0 + 6 + k * 34, 140, 1, 10, '#8a8392');
      // passengers
      for (let n = 0; n < 9; n++) {
        const px = x0 + 14 + Math.floor(hsh(si * 20 + n, 61) * 232);
        const col = ['#e8b13a', '#d9534f', '#4a90d9', '#f2eee6', '#9b6bd1', '#5cb85c'][Math.floor(hsh(si * 20 + n, 62) * 6)];
        const bob = (state === 'stopped' && Math.floor(T * 2 + n) % 3 === 0) ? 1 : 0;
        const yy = 150 - bob;
        R(px, yy - 9, 3, 2, '#c68e5a'); R(px, yy - 7, 3, 5, col); R(px, yy - 2, 1, 2, '#2a2a34'); R(px + 2, yy - 2, 1, 2, '#2a2a34');
      }
    });
  }

  // ------------------------------------------------------------------ post
  function overlay(p) {
    const night = clamp((p - 0.82) / 0.18, 0, 1) * 0.5 + clamp((0.06 - p) / 0.06, 0, 1) * 0.15;
    const warm = Math.max(0, 1 - Math.abs(p - 0.76) / 0.12) * 0.16 + Math.max(0, 1 - Math.abs(p - 0.02) / 0.1) * 0.1;
    if (warm > 0) { ctx.fillStyle = `rgba(255,140,60,${warm})`; ctx.fillRect(0, 0, W, H); }
    if (night > 0) { ctx.fillStyle = `rgba(18,10,60,${night})`; ctx.fillRect(0, 0, W, H); }
    return night;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    T += dt;
    if (!paused) update(dt);
    camI = Math.floor(cam);
    const p = clamp((cam + CENTER) / L, 0, 1);
    pal = {};

    drawSky(p);
    drawFar();
    drawField();
    drawMid();
    drawStations();
    drawGround();
    drawTrain(false);
    drawSmoke(dt);
    drawPoles();
    drawTruss();
    drawForeground();
    drawPlatforms();
    const night = overlay(p);
    if (night > 0.12) drawTrain(true);   // lit windows over the dusk tint (wheels skipped)

    updateHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // font ready -> nothing to do; canvas picks it up on next frame
  if (document.fonts && document.fonts.load) document.fonts.load('8px "Press Start 2P"');
})();
