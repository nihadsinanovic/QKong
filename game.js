/* ==========================================================================
   QKong — a Game & Watch style "Donkey Kong" for the browser.

   Everything moves on a fixed set of LCD "segments": the hero hops between
   predefined positions, barrels (Qvantum logos) advance one position per
   game tick, exactly like the original multi-screen handheld.
   ========================================================================== */
(() => {
  'use strict';

  // ------------------------------------------------------------------ setup
  const W = 340, H = 200, RES = 4;

  function makeScreen(id) {
    const cv = document.getElementById(id);
    cv.width = W * RES;
    cv.height = H * RES;
    const ctx = cv.getContext('2d');
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    return { cv, ctx };
  }
  const SCR = { up: makeScreen('cv-top'), lo: makeScreen('cv-bot') };

  function fitDevice() {
    const s = Math.min(window.innerWidth / 820, (window.innerHeight - 8) / 1060);
    document.documentElement.style.setProperty('--scale', Math.max(0.2, s).toFixed(4));
  }
  window.addEventListener('resize', fitDevice);
  fitDevice();

  // ---------------------------------------------------------------- palette
  const LCD = '#1c1e19';
  const LCD_SHADOW = 'rgba(50, 52, 40, 0.20)';
  const GIRDER_RED = '#d8483a';
  const GIRDER_RED_DARK = '#b8352a';
  const Q_NAVY = '#002656';
  const Q_RED = '#c41230';

  // ------------------------------------------------------------- geometry
  // Girders: y of the walking surface is interpolated between the two ends.
  const GIRDERS = {
    U1: { scr: 'up', x1: 54, x2: 292, y1: 124, y2: 129 },
    U0: { scr: 'up', x1: 4, x2: 336, y1: 187, y2: 181 },
    G2: { scr: 'lo', x1: 54, x2: 336, y1: 67, y2: 61 },
    G1: { scr: 'lo', x1: 12, x2: 312, y1: 120, y2: 128 },
    G0: { scr: 'lo', x1: 4, x2: 336, y1: 191, y2: 184 },
  };
  const gy = (g, x) => {
    const G = GIRDERS[g];
    return G.y1 + (G.y2 - G.y1) * (x - G.x1) / (G.x2 - G.x1);
  };
  const COLS6 = [70, 118, 166, 214, 262, 302];
  const COLS5 = [70, 118, 166, 214, 262];

  // ---------------------------------------------------------- hero graph
  // Each node: screen, x, feet-y, pose kind, collision slot & neighbours.
  const NODES = {};
  function node(id, scr, x, y, kind, links) {
    NODES[id] = Object.assign({ id, scr, x, y, kind, slot: kind === 'walk' ? id : null }, links || {});
  }
  function girderNodes(g, cols) {
    cols.forEach((x, i) => {
      node(`${g}_${i}`, GIRDERS[g].scr, x, gy(g, x), 'walk', {
        left: i > 0 ? `${g}_${i - 1}` : null,
        right: i < cols.length - 1 ? `${g}_${i + 1}` : null,
        col: i,
      });
    });
  }
  girderNodes('G0', COLS6);
  girderNodes('G1', COLS6);
  girderNodes('G2', COLS6);
  girderNodes('U0', COLS6);
  girderNodes('U1', COLS5);

  const mid = (a, b) => (a + b) / 2;
  // ladders
  node('L01', 'lo', 302, mid(gy('G0', 302), gy('G1', 302)) + 2, 'climb', { up: 'G1_5', down: 'G0_5' });
  node('L12', 'lo', 70, mid(gy('G1', 70), gy('G2', 70)) + 2, 'climb', { up: 'G2_0', down: 'G1_0' });
  node('L2U', 'lo', 302, 34, 'climb', { up: 'U0_5', down: 'G2_5' });
  node('LU', 'up', 70, mid(gy('U0', 70), gy('U1', 70)) + 2, 'climb', { up: 'U1_0', down: 'U0_0' });
  NODES.G0_5.up = 'L01';
  NODES.G1_5.down = 'L01';
  NODES.G1_0.up = 'L12';
  NODES.G2_0.down = 'L12';
  NODES.G2_5.up = 'L2U';
  NODES.U0_5.down = 'L2U';
  NODES.U0_0.up = 'LU';
  NODES.U1_0.down = 'LU';

  const START_NODE = 'G0_0';
  const CRANE_NODE = 'U1_4';
  // the "forward" route, used by the demo (TIME mode) autopilot
  const ROUTE = [
    'G0_0', 'G0_1', 'G0_2', 'G0_3', 'G0_4', 'G0_5', 'L01',
    'G1_5', 'G1_4', 'G1_3', 'G1_2', 'G1_1', 'G1_0', 'L12',
    'G2_0', 'G2_1', 'G2_2', 'G2_3', 'G2_4', 'G2_5', 'L2U',
    'U0_5', 'U0_4', 'U0_3', 'U0_2', 'U0_1', 'U0_0', 'LU',
    'U1_0', 'U1_1', 'U1_2', 'U1_3', 'U1_4',
  ];

  // -------------------------------------------------------- barrel path
  // Every position a barrel can occupy, in order. `slot` = hero node it hits.
  const R = 8.5; // barrel radius
  const PATH = [];
  const bp = (scr, x, y, slot = null, roll = 0) => PATH.push({ scr, x, y, slot, roll });
  const onG = (g, x, slot, roll) => bp(GIRDERS[g].scr, x, gy(g, x) - R - 0.5, slot, roll);
  // thrown down the left side by Kong
  bp('up', 11, 84);
  bp('up', 11, 128);
  onG('U0', 14, null, 1);
  onG('U0', 40, null, 1);
  COLS6.forEach((x, i) => onG('U0', x, `U0_${i}`, 1));
  onG('U0', 326, null, 1);
  // into the lower screen, top right
  bp('lo', 324, 20);
  onG('G2', 324, null, -1);
  [...COLS6].reverse().forEach((x, i) => onG('G2', x, `G2_${5 - i}`, -1));
  bp('lo', 36, 84);
  onG('G1', 36, null, 1);
  COLS6.forEach((x, i) => onG('G1', x, `G1_${i}`, 1));
  bp('lo', 324, 152);
  onG('G0', 324, null, -1);
  [...COLS6].reverse().forEach((x, i) => onG('G0', x, `G0_${5 - i}`, -1));
  // after the last entry the barrel drops into the burning oil drum

  // -------------------------------------------------------------- sprites
  // Pixel masks: 'X' = lit LCD segment.
  const HERO = {
    stand: [
      '....XXXX....',
      '...XXXXXX...',
      '..XXXXXXXXXX',
      '...XXX.XX...',
      '...XXXXXXXX.',
      '...XXXXXXX..',
      '....XXXXX...',
      '...XX.XXX...',
      '..XXXX.XXXX.',
      '.XXXXXXXXXXX',
      'XX.XXXXXXX.X',
      'XX.XXXXXXX.X',
      '...XXXXXX...',
      '...XXX.XXX..',
      '..XXX...XXX.',
      '.XXXX...XXXX',
    ],
    walk: [
      '....XXXX....',
      '...XXXXXX...',
      '..XXXXXXXXXX',
      '...XXX.XX...',
      '...XXXXXXXX.',
      '...XXXXXXX..',
      '....XXXXX...',
      '...XX.XXX...',
      '..XXXX.XXXX.',
      '.XXXXXXXXXX.',
      '.XXXXXXXXXXX',
      '..XXXXXXX.XX',
      '...XXXXXX...',
      '..XXXX.XXX..',
      '.XXX....XXX.',
      'XXX......XXX',
    ],
    jump: [
      '....XXXX..XX',
      '...XXXXXX.XX',
      '..XXXXXXXXXX',
      '...XXX.XX.X.',
      '...XXXXXXXX.',
      '...XXXXXXX..',
      '....XXXXX...',
      '.X.XX.XXX...',
      'XXXXXX.XXX..',
      'XX.XXXXXXX..',
      '...XXXXXXXX.',
      '..XXXXX.XXXX',
      '.XXXX....XXX',
      'XXXX......XX',
      'XX..........',
      '............',
    ],
    climb: [
      'X...XXXX...X',
      'XX.XXXXXX.XX',
      'XXXXXXXXXXXX',
      '.XX.XXXX.XX.',
      '.XX.XXXX.XX.',
      '..XXXXXXXX..',
      '...XXXXXX...',
      '..XXX..XXX..',
      '..XXXXXXXX..',
      '..XXXXXXXX..',
      '...XXXXXX...',
      '...XXX.XXX..',
      '..XXX..XXX..',
      '..XXX...XXX.',
      '..XX....XXX.',
      '.XXX........',
    ],
    hang: [
      '..XX....XX..',
      '..XX.XX.XX..',
      '..XXXXXXXX..',
      '..XXXXXXXXXX',
      '...XXX.XX...',
      '...XXXXXXXX.',
      '...XXXXXXX..',
      '....XXXXX...',
      '...XXXXXXX..',
      '...XXXXXXX..',
      '...XXXXXXX..',
      '...XXXXXX...',
      '...XX..XX...',
      '..XXX..XXX..',
      '..XX....XX..',
      '.XXX....XXX.',
    ],
    down: [
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '.X..X..X....',
      '..X.X.X.....',
      '............',
      '..XXXXX.....',
      '.XXXXXXXX.XX',
      'XXX.XXXXXXXX',
      'XXXXXXXXXX.X',
      '.XXXXXXXXXXX',
    ],
  };
  const KONG = {
    idle: [
      '.......XXXXXX.......',
      '.....XXXXXXXXXX.....',
      '....XXXXXXXXXXXX....',
      '....XX..XXXX..XX....',
      '....XX.X.XX.X.XX....',
      '...XXXX......XXXX...',
      '...XXXX.X..X.XXXX...',
      '..XXXXX......XXXXX..',
      '.XXXXXXX.XX.XXXXXXX.',
      'XXXXXXXXXXXXXXXXXXXX',
      'XXXX.XXX....XXX.XXXX',
      'XXX..XX......XX..XXX',
      'XXX..XX......XX..XXX',
      'XXX..XXX....XXX..XXX',
      'XXX...XXXXXXXX...XXX',
      'XXXX..XXXXXXXX..XXXX',
      '.XX..XXXX..XXXX..XX.',
      '....XXXXX..XXXXX....',
      '...XXXXXX..XXXXXX...',
    ],
    hold: [
      'XXX....XXXXXX....XXX',
      'XXX..XXXXXXXXXX..XXX',
      'XXX.XXXXXXXXXXXX.XXX',
      'XXX.XX..XXXX..XX.XXX',
      'XXX.XX.X.XX.X.XX.XXX',
      'XXXXXXX......XXXXXXX',
      '.XXXXXX.X..X.XXXXXX.',
      '..XXXXX......XXXXX..',
      '..XXXXXX.XX.XXXXXX..',
      '..XXXXXXXXXXXXXXXX..',
      '..XXXXXX....XXXXXX..',
      '..XXXXX......XXXXX..',
      '..XXXXX......XXXXX..',
      '..XXXXXX....XXXXXX..',
      '...XXXXXXXXXXXXXX...',
      '....XXXXXXXXXXXX....',
      '....XXXXX..XXXXX....',
      '....XXXXX..XXXXX....',
      '...XXXXXX..XXXXXX...',
    ],
    throw: [
      '..........XXXXXX....',
      '........XXXXXXXXXX..',
      '.......XXXXXXXXXXXX.',
      '.......XX..XXXX..XX.',
      '.......XX.X.XX.X.XX.',
      '......XXXX......XXXX',
      '......XXXX.X..X.XXXX',
      'XXX..XXXXX......XXXX',
      'XXXXXXXXXXX.XX.XXXXX',
      '.XXXXXXXXXXXXXXXXXXX',
      '...XXXXXXX....XXXXXX',
      '.....XXXX......XX.XX',
      '.....XXXX......XX.XX',
      '.....XXXXX....XXX.XX',
      '......XXXXXXXXXX..XX',
      '......XXXXXXXXXX.XXX',
      '.....XXXX..XXXXX....',
      '....XXXXX..XXXXX....',
      '...XXXXXX..XXXXXX...',
    ],
  };
  const MIRROR = new Map();
  function mirrored(rows) {
    if (!MIRROR.has(rows)) MIRROR.set(rows, rows.map(r => [...r].reverse().join('')));
    return MIRROR.get(rows);
  }

  // draw a pixel mask, anchored bottom-centre at (x, y). Each mask is turned
  // into a single cached Path2D so the pixels fill seamlessly.
  const PATHS = new Map();
  function maskPath(rows, cell) {
    let byCell = PATHS.get(rows);
    if (!byCell) PATHS.set(rows, byCell = new Map());
    let path = byCell.get(cell);
    if (!path) {
      path = new Path2D();
      const w = rows[0].length * cell, h = rows.length * cell;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        let c = 0;
        while (c < row.length) {
          if (row[c] !== 'X') { c++; continue; }
          let e = c;
          while (e < row.length && row[e] === 'X') e++;
          path.rect(c * cell - w / 2, r * cell - h, (e - c) * cell, cell);
          c = e;
        }
      }
      byCell.set(cell, path);
    }
    return path;
  }
  function pix(ctx, rows, x, y, cell, color, flip) {
    if (flip) rows = mirrored(rows);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.fill(maskPath(rows, cell));
    ctx.restore();
  }
  // lit segment with the faint offset shadow real LCDs cast on the backdrop
  function seg(ctx, fn) {
    ctx.save();
    ctx.translate(1.1, 1.5);
    fn(LCD_SHADOW);
    ctx.restore();
    fn(LCD);
  }

  const HERO_CELL = 1.85;
  const KONG_CELL = 2.2;

  // Qvantum logo barrel: navy disc, white ring, red core, white "tail"
  function drawQ(ctx, cx, cy, r, rot, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = Q_NAVY;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'butt';
    ctx.lineWidth = r * 0.15;
    ctx.beginPath();
    ctx.moveTo(r * 0.2, r * 0.26);
    ctx.lineTo(r * 0.76, r * 0.68);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-r * 0.05, -r * 0.05, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = Q_RED;
    ctx.beginPath();
    ctx.arc(-r * 0.05, -r * 0.05, r * 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function barrelSeg(ctx, x, y, rot, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.22;
    ctx.fillStyle = '#323428';
    ctx.beginPath();
    ctx.arc(x + 1.1, y + 1.5, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawQ(ctx, x, y, R, rot, alpha * 0.96);
  }

  // 7-segment digits
  const SEGS = {
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', ' ': '', '-': 'g',
  };
  function digit(ctx, ch, x, y, w, h, color) {
    const t = w * 0.2, s = SEGS[ch] || '';
    const hh = h / 2;
    ctx.fillStyle = color;
    const hbar = (yy) => {
      ctx.beginPath();
      ctx.moveTo(x + t * 0.6, yy);
      ctx.lineTo(x + t * 1.1, yy - t / 2);
      ctx.lineTo(x + w - t * 1.1, yy - t / 2);
      ctx.lineTo(x + w - t * 0.6, yy);
      ctx.lineTo(x + w - t * 1.1, yy + t / 2);
      ctx.lineTo(x + t * 1.1, yy + t / 2);
      ctx.closePath();
      ctx.fill();
    };
    const vbar = (xx, y0, y1) => {
      ctx.beginPath();
      ctx.moveTo(xx, y0 + t * 0.6);
      ctx.lineTo(xx + t / 2, y0 + t * 1.1);
      ctx.lineTo(xx + t / 2, y1 - t * 1.1);
      ctx.lineTo(xx, y1 - t * 0.6);
      ctx.lineTo(xx - t / 2, y1 - t * 1.1);
      ctx.lineTo(xx - t / 2, y0 + t * 1.1);
      ctx.closePath();
      ctx.fill();
    };
    if (s.includes('a')) hbar(y + t / 2);
    if (s.includes('g')) hbar(y + hh);
    if (s.includes('d')) hbar(y + h - t / 2);
    if (s.includes('f')) vbar(x + t / 2, y, y + hh);
    if (s.includes('b')) vbar(x + w - t / 2, y, y + hh);
    if (s.includes('e')) vbar(x + t / 2, y + hh, y + h);
    if (s.includes('c')) vbar(x + w - t / 2, y + hh, y + h);
  }
  function lcdText(ctx, text, x, y, size, color, align = 'left') {
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  // --------------------------------------------------- printed backdrops
  function girderPath(ctx, x1, y1, x2, y2, t = 7) {
    const len = x2 - x1;
    const yAt = x => y1 + (y2 - y1) * (x - x1) / len;
    ctx.fillStyle = 'rgba(216, 72, 58, 0.18)';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, y2 + t);
    ctx.lineTo(x1, y1 + t);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = GIRDER_RED;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.moveTo(x1, y1 + t);
    ctx.lineTo(x2, y2 + t);
    ctx.stroke();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = GIRDER_RED_DARK;
    ctx.beginPath();
    const step = 9;
    for (let x = x1; x + step <= x2 + 0.1; x += step) {
      ctx.moveTo(x, yAt(x) + 0.8);
      ctx.lineTo(x + step / 2, yAt(x + step / 2) + t - 0.8);
      ctx.lineTo(x + step, yAt(x + step) + 0.8);
    }
    ctx.stroke();
  }
  function drawGirder(ctx, g) {
    const G = GIRDERS[g];
    girderPath(ctx, G.x1, G.y1, G.x2, G.y2);
  }
  function ladder(ctx, x, yTop, yBot) {
    ctx.strokeStyle = GIRDER_RED;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 6, yTop);
    ctx.lineTo(x - 6, yBot);
    ctx.moveTo(x + 6, yTop);
    ctx.lineTo(x + 6, yBot);
    for (let y = yTop + 5; y < yBot - 1; y += 6) {
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
    }
    ctx.stroke();
  }
  function lcdBase(ctx) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#dcdecd');
    g.addColorStop(0.5, '#d0d3c0');
    g.addColorStop(1, '#c6c9b5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  function building(ctx, x, y, w, h) {
    ctx.fillStyle = '#9fcbdc';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#7fb3c9';
    ctx.fillRect(x + w - 4, y, 4, h);
    ctx.fillStyle = '#c4e2ec';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = 'rgba(70, 120, 145, 0.35)';
    for (let yy = y + 5; yy < y + h - 3; yy += 6) {
      for (let xx = x + 3; xx < x + w - 6; xx += 6) ctx.fillRect(xx, yy, 3, 3);
    }
  }

  function buildTopBackdrop() {
    const c = document.createElement('canvas');
    c.width = W * RES; c.height = H * RES;
    const ctx = c.getContext('2d');
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    lcdBase(ctx);
    // city skyline
    building(ctx, 92, 78, 30, 46);
    building(ctx, 124, 92, 22, 32);
    building(ctx, 150, 70, 26, 54);
    building(ctx, 200, 84, 34, 42);
    building(ctx, 238, 74, 22, 52);
    building(ctx, 262, 96, 20, 30);
    // crane: jib along the top, mast on the right
    girderPath(ctx, 70, 3, 336, 3, 6);
    ctx.fillStyle = GIRDER_RED;
    ctx.fillRect(326, 9, 3, 172);
    ctx.fillRect(334, 9, 2, 172);
    ctx.strokeStyle = GIRDER_RED_DARK;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let y = 9; y < 176; y += 8) { ctx.moveTo(329, y); ctx.lineTo(334, y + 4); ctx.lineTo(329, y + 8); }
    ctx.stroke();
    // Kong's platform + wall bracket
    girderPath(ctx, 16, 62, 72, 62, 6);
    // girders & ladders
    drawGirder(ctx, 'U1');
    drawGirder(ctx, 'U0');
    ladder(ctx, 70, gy('U1', 70) + 7, gy('U0', 70));
    ladder(ctx, 302, gy('U0', 302) + 7, H);
    return c;
  }

  function buildBottomBackdrop() {
    const c = document.createElement('canvas');
    c.width = W * RES; c.height = H * RES;
    const ctx = c.getContext('2d');
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    lcdBase(ctx);
    // girder sections dangling from above (as on the original)
    ctx.strokeStyle = 'rgba(120, 110, 100, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(128, 0); ctx.lineTo(128, 22);
    ctx.moveTo(158, 0); ctx.lineTo(158, 22);
    ctx.moveTo(218, 0); ctx.lineTo(218, 14);
    ctx.moveTo(244, 0); ctx.lineTo(244, 14);
    ctx.stroke();
    girderPath(ctx, 118, 22, 168, 22, 6);
    girderPath(ctx, 210, 14, 252, 14, 6);
    // main girders & ladders
    drawGirder(ctx, 'G2');
    drawGirder(ctx, 'G1');
    drawGirder(ctx, 'G0');
    ladder(ctx, 302, gy('G1', 302) + 7, gy('G0', 302));
    ladder(ctx, 70, gy('G2', 70) + 7, gy('G1', 70));
    ladder(ctx, 302, 0, gy('G2', 302));
    // oil drum
    ctx.fillStyle = '#c8402f';
    ctx.fillRect(6, 164, 24, gy('G0', 18) - 164);
    ctx.fillStyle = '#9d2e21';
    ctx.fillRect(6, 168, 24, 2);
    ctx.fillRect(6, 182, 24, 2);
    ctx.fillStyle = '#f1e6cf';
    ctx.font = 'bold 7px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OIL', 18, 176);
    return c;
  }
  const BACK = { up: buildTopBackdrop(), lo: buildBottomBackdrop() };

  // ------------------------------------------------------------------ audio
  let audio = null;
  let muted = false;
  try { muted = localStorage.getItem('qkong-muted') === '1'; } catch (e) { /* ignore */ }
  function ensureAudio() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audio = new AC();
    }
    if (audio && audio.state === 'suspended') audio.resume();
  }
  function beep(freq, dur = 0.05, vol = 0.05, when = 0) {
    if (muted || !audio) return;
    const t = audio.currentTime + when;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const SFX = {
    tick: () => beep(1250, 0.018, 0.018),
    step: () => beep(1900, 0.03, 0.03),
    jump: () => beep(1500, 0.05, 0.035),
    point: () => { beep(2400, 0.04, 0.04); beep(3000, 0.05, 0.04, 0.05); },
    miss: () => { for (let i = 0; i < 4; i++) beep(i % 2 ? 330 : 440, 0.12, 0.05, i * 0.16); },
    grab: () => [1200, 1600, 2000, 2400].forEach((f, i) => beep(f, 0.06, 0.04, i * 0.07)),
    bolt: () => { beep(900, 0.08, 0.05); beep(600, 0.1, 0.05, 0.09); },
    kongFall: () => { for (let i = 0; i < 10; i++) beep(1600 - i * 120, 0.07, 0.045, i * 0.08); },
    fanfare: () => [1047, 1319, 1568, 2093, 1568, 2093].forEach((f, i) => beep(f, 0.1, 0.045, i * 0.11)),
    start: () => [880, 1175, 1480].forEach((f, i) => beep(f, 0.07, 0.04, i * 0.08)),
  };

  // ------------------------------------------------------------------ state
  let hi = 0;
  try { hi = parseInt(localStorage.getItem('qkong-hi') || '0', 10) || 0; } catch (e) { /* ignore */ }

  const S = {
    mode: 'time', // 'time' (clock + demo), 'play', 'over'
    game: 'A',
    score: 0,
    misses: 0,
    bonusGiven: false,
    barrels: [],
    hero: { node: START_NODE, face: 1, air: 0, leap: false, jumpId: 0 },
    kong: { pose: 'idle', cd: 3, fallen: false },
    hook: { pos: 0, dir: 1 },
    bolts: 4,
    fire: 0,
    flare: 0,
    anim: null,
    acc: 0,
    ticks: 0,
  };

  function tickMs() {
    if (S.mode === 'time') return 520;
    return S.game === 'A'
      ? Math.max(330, 640 - S.score * 1.1)
      : Math.max(250, 480 - S.score * 0.9);
  }

  function resetRound() {
    S.barrels = [];
    S.hero = { node: START_NODE, face: 1, air: 0, leap: false, jumpId: S.hero.jumpId };
    S.kong.pose = 'idle';
    S.kong.cd = 3;
    S.hook = { pos: 0, dir: 1 };
    S.acc = 0;
  }

  function newGame(which) {
    S.mode = 'play';
    S.game = which;
    S.score = 0;
    S.misses = 0;
    S.bonusGiven = false;
    S.bolts = 4;
    S.kong.fallen = false;
    S.anim = null;
    resetRound();
    SFX.start();
  }

  function enterTime() {
    S.mode = 'time';
    S.anim = null;
    S.bolts = 4;
    S.kong.fallen = false;
    resetRound();
  }

  function addScore(n) {
    const before = S.score;
    S.score = (S.score + n) % 10000;
    if (!S.bonusGiven && before < 300 && S.score >= 300) {
      S.bonusGiven = true;
      if (S.misses > 0) {
        S.misses = 0;
        SFX.fanfare();
      }
    }
    if (S.score > hi) {
      hi = S.score;
      try { localStorage.setItem('qkong-hi', String(hi)); } catch (e) { /* ignore */ }
    }
  }

  const barrelAt = slot => S.barrels.some(b => PATH[b.i] && PATH[b.i].slot === slot);
  const barrelNext = slot => S.barrels.some(b => PATH[b.i + 1] && PATH[b.i + 1].slot === slot);

  function checkHit() {
    if (S.mode !== 'play' || S.anim) return;
    const h = S.hero;
    const n = NODES[h.node];
    if (h.air === 0 && n.slot && barrelAt(n.slot)) startMiss('hit');
  }

  // ---------------------------------------------------------- game tick
  function tick() {
    S.ticks++;
    const playing = S.mode === 'play';

    // hook swings 0,1,2,1,0...
    S.hook.pos += S.hook.dir;
    if (S.hook.pos >= 2 || S.hook.pos <= 0) S.hook.dir *= -1;

    // barrels roll one position
    const keep = [];
    for (const b of S.barrels) {
      b.i++;
      if (b.i >= PATH.length) { S.flare = 3; continue; }
      const p = PATH[b.i];
      b.rot += p.roll ? p.roll * Math.PI / 2 : Math.PI / 4;
      keep.push(b);
    }
    S.barrels = keep;

    // Kong: count down, lift a barrel, throw it
    const k = S.kong;
    if (!k.fallen) {
      if (k.pose === 'hold') {
        k.pose = 'throw';
        S.barrels.push({ i: 0, rot: 0, jumped: -1 });
      } else {
        k.pose = 'idle';
        if (--k.cd <= 0) {
          k.pose = 'hold';
          const [lo, hiT] = S.mode === 'play' && S.game === 'B' ? [3, 5] : [4, 8];
          k.cd = lo + Math.floor(Math.random() * (hiT - lo + 1));
        }
      }
    }

    S.fire = (S.fire + 1) % 2;
    if (S.flare > 0) S.flare--;

    const h = S.hero;
    const n = NODES[h.node];

    // hero in the air
    if (h.air > 0) {
      if (h.leap) {
        h.air = 0;
        h.leap = false;
        if (S.hook.pos === 2) startCrane();
        else if (playing) startMiss('fall');
        else h.node = CRANE_NODE;
        return;
      }
      for (const b of S.barrels) {
        if (PATH[b.i].slot === n.slot && b.jumped !== h.jumpId) {
          b.jumped = h.jumpId;
          if (playing) { addScore(1); SFX.point(); }
        }
      }
      h.air--;
    }

    if (playing) {
      SFX.tick();
      checkHit();
    } else if (S.mode === 'time') {
      autopilot();
    }
  }

  // demo mode (TIME): a simple autopilot so the screens come alive
  function autopilot() {
    const h = S.hero;
    if (h.air > 0 || S.anim) return;
    const n = NODES[h.node];
    if (h.node === CRANE_NODE) {
      if (S.hook.pos === 1 && S.hook.dir === 1) leap();
      return;
    }
    if (n.slot && barrelNext(n.slot)) { jump(); return; }
    const next = NODES[ROUTE[ROUTE.indexOf(h.node) + 1]];
    if (!next) return;
    if (next.slot && (barrelAt(next.slot) || barrelNext(next.slot))) return;
    if (next.x !== n.x) h.face = next.x > n.x ? 1 : -1;
    h.node = next.id;
  }

  // ------------------------------------------------------------ actions
  function jump() {
    const h = S.hero;
    h.air = 2;
    h.jumpId++;
    if (S.mode === 'play') SFX.jump();
  }
  function leap() {
    const h = S.hero;
    h.air = 1;
    h.leap = true;
    h.face = 1;
    if (S.mode === 'play') SFX.jump();
    // hook already in reach: grab it straight away
    if (S.hook.pos === 2) {
      h.air = 0;
      h.leap = false;
      startCrane();
    }
  }

  function heroInput(dir) {
    if (S.mode !== 'play' || S.anim) return;
    const h = S.hero;
    if (h.air > 0) return;
    const n = NODES[h.node];
    if (dir === 'jump' || (dir === 'up' && h.node === CRANE_NODE) || (dir === 'right' && h.node === CRANE_NODE)) {
      if (h.node === CRANE_NODE) leap();
      else if (n.kind === 'walk') jump();
      return;
    }
    const target = n[dir];
    if (!target) return;
    if (dir === 'left') h.face = -1;
    if (dir === 'right') h.face = 1;
    h.node = target;
    SFX.step();
    checkHit();
  }

  // ---------------------------------------------------------- sequences
  function startMiss(kind) {
    S.anim = { type: 'miss', kind, t: 0, dur: 1800 };
    SFX.miss();
  }
  function startCrane() {
    S.hero.air = 0;
    S.hero.leap = false;
    S.anim = { type: 'crane', t: 0, dur: 2300, popped: false };
    if (S.mode === 'play') { SFX.grab(); addScore(5); }
  }
  function startKongFall() {
    S.anim = { type: 'kong', t: 0, dur: 2600 };
    S.kong.fallen = true;
    if (S.mode === 'play') { SFX.kongFall(); addScore(20); }
  }

  function updateAnim(dt) {
    const a = S.anim;
    a.t += dt;
    if (a.type === 'crane' && !a.popped && a.t > 1650) {
      a.popped = true;
      S.bolts--;
      if (S.mode === 'play') SFX.bolt();
    }
    if (a.t < a.dur) return;

    S.anim = null;
    if (a.type === 'miss') {
      S.misses++;
      if (S.misses >= 3) {
        S.mode = 'over';
        S.overAt = performance.now();
        S.missKind = a.kind;
        return;
      }
      resetRound();
    } else if (a.type === 'crane') {
      if (S.bolts <= 0) { startKongFall(); return; }
      resetRound();
    } else if (a.type === 'kong') {
      S.bolts = 4;
      S.kong.fallen = false;
      if (S.mode === 'play') SFX.fanfare();
      resetRound();
    }
  }

  // ------------------------------------------------------------- render
  const HOOK_X = 298;
  const HOOK_Y = [44, 60, 76]; // hook bottom per swing position
  const TRAVEL_X = [298, 246, 194, 142, 92];

  function drawHook(ctx, x, yBottom, color) {
    // trolley
    ctx.fillStyle = color;
    ctx.fillRect(x - 6, 9, 12, 4);
    // cable
    ctx.fillRect(x - 0.5, 13, 1.1, yBottom - 13 - 9);
    // block + hook
    ctx.fillRect(x - 3.5, yBottom - 10, 7, 4);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x, yBottom - 6);
    ctx.lineTo(x, yBottom - 3);
    ctx.arc(x - 2.8, yBottom - 3, 2.8, 0, Math.PI, false);
    ctx.stroke();
  }

  function heroPose() {
    const h = S.hero;
    const n = NODES[h.node];
    if (h.leap) return { scr: 'up', x: 283, y: 106, art: 'jump', flip: false };
    if (n.kind === 'climb') return { scr: n.scr, x: n.x, y: n.y, art: 'climb', flip: S.ticks % 2 === 1 };
    if (h.air > 0) return { scr: n.scr, x: n.x, y: n.y - 15, art: 'jump', flip: h.face < 0 };
    return { scr: n.scr, x: n.x, y: n.y, art: (n.col % 2) ? 'walk' : 'stand', flip: h.face < 0 };
  }

  function drawHero(pose) {
    const ctx = SCR[pose.scr].ctx;
    seg(ctx, c => pix(ctx, HERO[pose.art], pose.x, pose.y, HERO_CELL, c, pose.flip));
  }

  function drawGhosts(ctx, scr) {
    // unlit segments are faintly visible on a real LCD
    ctx.save();
    ctx.globalAlpha = 0.03;
    for (const id in NODES) {
      const n = NODES[id];
      if (n.scr !== scr) continue;
      pix(ctx, HERO[n.kind === 'climb' ? 'climb' : 'stand'], n.x, n.y, HERO_CELL, LCD, false);
    }
    ctx.fillStyle = LCD;
    for (const p of PATH) {
      if (p.scr !== scr) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function renderTop(now) {
    const { ctx } = SCR.up;
    ctx.drawImage(BACK.up, 0, 0, W, H);
    drawGhosts(ctx, 'up');

    // score / clock
    let text, colon = false;
    if (S.mode === 'time') {
      const d = new Date();
      let hr = d.getHours() % 12;
      if (hr === 0) hr = 12;
      text = String(hr).padStart(2, ' ') + String(d.getMinutes()).padStart(2, '0');
      colon = d.getMilliseconds() < 500;
      lcdText(ctx, d.getHours() < 12 ? 'AM' : 'PM', 118, 20, 7, LCD);
    } else {
      text = String(S.score).padStart(4, ' ');
    }
    const DX = 136, DY = 17, DW = 12, DH = 22, GAP = 15.5;
    seg(ctx, c => {
      for (let i = 0; i < 4; i++) {
        const x = DX + i * GAP + (i >= 2 && S.mode === 'time' ? 4 : 0);
        digit(ctx, text[i], x, DY, DW, DH, c);
      }
      if (colon) {
        ctx.fillStyle = c;
        ctx.fillRect(DX + 2 * GAP - 0.5, DY + 6, 2.4, 2.4);
        ctx.fillRect(DX + 2 * GAP - 0.5, DY + 14, 2.4, 2.4);
      }
    });
    if (S.mode !== 'time') {
      lcdText(ctx, `GAME ${S.game}`, 206, 30, 7, LCD);
    }

    // Kong
    const k = S.kong;
    const anim = S.anim;
    let kongY = 62, kongX = 43, kongArt = KONG[k.pose];
    if (anim && anim.type === 'kong') {
      const steps = [62, 96, 132, 170, 186];
      const idx = Math.min(steps.length - 1, Math.floor(anim.t / 280));
      kongY = steps[idx];
      kongX = 43 + idx * 3;
      kongArt = idx < steps.length - 1 ? KONG.hold : KONG.idle;
    }
    if (!(anim && anim.type === 'kong' && anim.t > 1400 && Math.floor(anim.t / 150) % 2)) {
      seg(ctx, c => pix(ctx, kongArt, kongX, kongY, KONG_CELL, c, false));
    }
    if (k.pose === 'hold' && !k.fallen) {
      barrelSeg(ctx, 43, 62 - 19 * KONG_CELL - R - 1, 0);
    }

    // bolts holding Kong's platform
    const boltsShown = anim && anim.type === 'kong' ? 0 : S.bolts;
    seg(ctx, c => {
      ctx.fillStyle = c;
      for (let i = 0; i < boltsShown; i++) {
        const bx = 22 + i * 14;
        ctx.beginPath();
        ctx.arc(bx, 65, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // crane hook (+ hero riding it)
    if (anim && anim.type === 'crane') {
      const t = anim.t;
      let x = HOOK_X, yb = HOOK_Y[2];
      if (t > 450) {
        const idx = Math.min(TRAVEL_X.length - 1, Math.floor((t - 450) / 260));
        x = TRAVEL_X[idx];
        yb = HOOK_Y[0];
      } else if (t > 250) {
        yb = HOOK_Y[1];
      }
      seg(ctx, c => drawHook(ctx, x, yb, c));
      seg(ctx, c => pix(ctx, HERO.hang, x - 1, yb + 30, HERO_CELL, c, false));
      if (anim.popped && t < 2000 && Math.floor(t / 80) % 2) {
        lcdText(ctx, '✶', 22 + S.bolts * 14, 58, 12, LCD, 'center');
      }
    } else {
      seg(ctx, c => drawHook(ctx, HOOK_X, HOOK_Y[S.hook.pos], c));
    }

    // barrels
    for (const b of S.barrels) {
      const p = PATH[b.i];
      if (p.scr === 'up') barrelSeg(ctx, p.x, p.y, b.rot);
    }
  }

  function renderBottom(now) {
    const { ctx } = SCR.lo;
    ctx.drawImage(BACK.lo, 0, 0, W, H);
    drawGhosts(ctx, 'lo');

    // oil-drum fire
    seg(ctx, c => {
      ctx.fillStyle = c;
      const f = S.fire, big = S.flare > 0;
      const flame = (x, h, w) => {
        ctx.beginPath();
        ctx.moveTo(x - w, 164);
        ctx.quadraticCurveTo(x - w, 164 - h * 0.6, x, 164 - h);
        ctx.quadraticCurveTo(x + w, 164 - h * 0.6, x + w, 164);
        ctx.closePath();
        ctx.fill();
      };
      const s = big ? 1.6 : 1;
      flame(12, (f ? 12 : 8) * s, 4);
      flame(19, (f ? 8 : 13) * s, 4.5);
      flame(26, (f ? 11 : 7) * s, 3.5);
    });

    // misses
    if (S.mode !== 'time' && S.misses > 0) {
      lcdText(ctx, 'MISS', 8, 4, 7, LCD);
      for (let i = 0; i < S.misses; i++) {
        seg(ctx, c => pix(ctx, HERO.stand.slice(0, 7), 36 + i * 13, 12, 1.3, c, false));
      }
    }

    for (const b of S.barrels) {
      const p = PATH[b.i];
      if (p.scr === 'lo') barrelSeg(ctx, p.x, p.y, b.rot);
    }
  }

  function renderHero(now) {
    const a = S.anim;
    if (a && (a.type === 'crane')) return; // drawn with the hook
    if (a && a.type === 'miss') {
      if (Math.floor(a.t / 160) % 2) return;
      if (a.kind === 'fall') {
        drawHero({ scr: 'up', x: 300, y: gy('U0', 300), art: 'down', flip: false });
        return;
      }
      const n = NODES[S.hero.node];
      drawHero({ scr: n.scr, x: n.x, y: n.y, art: 'down', flip: S.hero.face < 0 });
      return;
    }
    if (S.mode === 'over') {
      if (Math.floor((now - S.overAt) / 500) % 2) return;
      if (S.missKind === 'fall') {
        drawHero({ scr: 'up', x: 300, y: gy('U0', 300), art: 'down', flip: false });
      } else {
        const n = NODES[S.hero.node];
        drawHero({ scr: n.scr, x: n.x, y: n.y, art: 'down', flip: S.hero.face < 0 });
      }
      return;
    }
    if (a && a.type === 'kong') {
      drawHero({ scr: 'up', x: 262, y: gy('U1', 262), art: 'stand', flip: true });
      return;
    }
    drawHero(heroPose());
  }

  function render(now) {
    renderTop(now);
    renderBottom(now);
    renderHero(now);
  }

  // --------------------------------------------------------------- loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(120, now - last);
    last = now;
    if (S.anim) {
      updateAnim(dt);
    } else if (S.mode === 'play' || S.mode === 'time') {
      S.acc += dt;
      const T = tickMs();
      while (S.acc >= T && !S.anim) {
        S.acc -= T;
        tick();
      }
    }
    render(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => { last = performance.now(); S.acc = 0; });

  // -------------------------------------------------------------- input
  function setMuted(m) {
    muted = m;
    document.getElementById('sound-led').classList.toggle('muted', muted);
    try { localStorage.setItem('qkong-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  setMuted(muted);

  function press(key) {
    ensureAudio();
    switch (key) {
      case 'gameA': newGame('A'); break;
      case 'gameB': newGame('B'); break;
      case 'time': enterTime(); break;
      case 'sound': setMuted(!muted); break;
      case 'jump':
        if (S.mode === 'play') heroInput('jump');
        else newGame(S.mode === 'over' ? S.game : 'A');
        break;
      default:
        heroInput(key);
    }
  }

  const KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
    ' ': 'jump', z: 'jump', x: 'jump', k: 'jump', Enter: 'jump',
    1: 'gameA', 2: 'gameB', t: 'time', 3: 'time', m: 'sound',
  };
  const KEY_BUTTON = {
    left: '.dp.left', right: '.dp.right', up: '.dp.up', down: '.dp.down',
    jump: '.jump-btn', gameA: '[data-key=gameA]', gameB: '[data-key=gameB]', time: '[data-key=time]',
  };
  window.addEventListener('keydown', e => {
    const key = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()];
    if (!key) return;
    e.preventDefault();
    if (e.repeat) return; // like the real thing: one press, one step
    const el = KEY_BUTTON[key] && document.querySelector(KEY_BUTTON[key]);
    if (el) el.classList.add('on');
    press(key);
  });
  window.addEventListener('keyup', e => {
    const key = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()];
    const el = key && KEY_BUTTON[key] && document.querySelector(KEY_BUTTON[key]);
    if (el) el.classList.remove('on');
  });

  document.querySelectorAll('[data-key]').forEach(el => {
    const key = el.dataset.key;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.classList.add('on');
      press(key);
    });
    const up = () => el.classList.remove('on');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  });
  document.addEventListener('dblclick', e => e.preventDefault());

  // handy for debugging from the console
  window.QKONG = { S, NODES, PATH };
})();
