(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  const face = new Image();
  face.src = 'target.png';
  // Crop of the photo that covers the head (hair to chin), aspect matches head ellipse.
  const FACE_CROP = { sx: 150, sy: 100, sw: 720, sh: 950 };
  const HEAD_RX = 6, HEAD_RY = 6 * (950 / 720);

  const fmt = (n) => n.toFixed(1).replace('.', ',');
  const COARSE = window.matchMedia('(pointer: coarse)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  const SKIN = ['#f6d7c3', '#eac0a2', '#d9a27e', '#c68863', '#a86b47', '#7d4a2d', '#f1c9a5', '#e8b796'];
  const HAIR = ['#1d1a17', '#3b2a1e', '#5a3d25', '#8a5a2b', '#c49a5a', '#e2c27a', '#9a9a9a', '#b0451d', '#2d2d2d'];
  const SHIRT = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#e9c46a', '#8338ec', '#ff006e', '#06d6a0',
    '#118ab2', '#ffffff', '#ef476f', '#3a86ff', '#fb5607', '#70e000', '#9d4edd', '#f72585', '#4cc9f0'];
  const PANTS = ['#1d3557', '#264653', '#3d3d3d', '#6b4f3a', '#2b2d42', '#14213d', '#5c677d', '#8d6e63'];

  // ---------- state ----------
  const state = {
    level: 1, score: 0, playing: false, time: 0, lastTs: 0,
    W: 0, H: 0, people: [], scenery: [], target: null,
    cam: { x: 0, y: 0, zoom: 1 }, minZoom: 0.1, maxZoom: 5,
    foundAnim: null, misses: [],
  };

  // ---------- level generation ----------
  function makePerson(x, y, isTarget = false) {
    const suit = isTarget || chance(0.1);
    return {
      x, y, s: rand(1.45, 1.75), isTarget,
      skin: isTarget ? '#f1c9a5' : pick(SKIN),
      hair: pick(HAIR),
      hairStyle: Math.floor(rand(0, 5)),
      shirt: suit ? '#151515' : pick(SHIRT),
      striped: !suit && chance(0.12),
      suit,
      pants: suit ? '#151515' : pick(PANTS),
      hat: isTarget ? 0 : (chance(0.3) ? Math.floor(rand(1, 5)) : 0),
      hatColor: pick(SHIRT),
      glasses: !isTarget && chance(0.15),
      beard: !isTarget && chance(suit ? 0.6 : 0.2),
      arms: Math.floor(rand(0, 3)),
      flip: chance(0.5),
    };
  }

  function buildLevel(level) {
    const L = Math.min(level, 12); // world/crowd growth caps here so high levels stay smooth
    const W = 2200 + L * 350, H = 1500 + L * 230;
    state.W = W; state.H = H;
    const scenery = [];
    const people = [];

    // paths / ponds are flat; trees, umbrellas, tents, stalls stand up
    state.flat = [];
    for (let i = 0; i < 3 + L; i++) {
      state.flat.push({ type: 'pond', x: rand(150, W - 150), y: rand(150, H - 150), rx: rand(90, 200), ry: rand(50, 110) });
    }
    for (let i = 0; i < 4; i++) {
      state.flat.push({ type: 'path', x1: rand(0, W), y1: 0, x2: rand(0, W), y2: H, w: rand(60, 120) });
    }

    const nTrees = 25 + L * 12;
    for (let i = 0; i < nTrees; i++) scenery.push({ type: 'tree', x: rand(0, W), y: rand(40, H), s: rand(1.2, 2.2), c: pick(['#2d6a4f', '#40916c', '#1b4332', '#52b788']) });
    for (let i = 0; i < 12 + L * 6; i++) scenery.push({ type: 'umbrella', x: rand(0, W), y: rand(40, H), s: rand(1.3, 1.9), c: pick(SHIRT), c2: pick(SHIRT) });
    for (let i = 0; i < 6 + L * 3; i++) scenery.push({ type: 'tent', x: rand(0, W), y: rand(60, H), s: rand(1.5, 2.4), c: pick(SHIRT) });
    for (let i = 0; i < 3 + L; i++) scenery.push({ type: 'villa', x: rand(160, W - 160), y: rand(180, H - 40), s: rand(1.9, 2.3), wood: pick(['#a0673a', '#7c4a2a', '#c08552', '#5b5b5b']), flip: chance(0.5) });
    for (let i = 0; i < 2 + Math.floor(L / 2); i++) scenery.push({ type: 'dubai', variant: i % 2, x: rand(150, W - 150), y: rand(320, H - 40), s: rand(1.1, 1.35), flip: chance(0.5) });
    const CAR_COLORS = ['#ffd60a', '#d62828', '#c0c4c8', '#111111', '#f8f9fa', '#1d4ed8', '#16a34a', '#f97316'];
    for (let i = 0; i < 6 + L * 3; i++) scenery.push({ type: 'car', x: rand(60, W - 60), y: rand(60, H), s: rand(1.5, 1.8), c: pick(CAR_COLORS), flip: chance(0.5) });
    for (let i = 0; i < 10 + L * 4; i++) scenery.push({ type: 'balloons', x: rand(0, W), y: rand(60, H), s: rand(1.3, 1.7) });

    const n = 260 + L * 170;
    for (let i = 0; i < n; i++) people.push(makePerson(rand(20, W - 20), rand(40, H - 10)));

    // place target away from the very edges
    const t = makePerson(rand(W * 0.08, W * 0.92), rand(H * 0.1, H * 0.95), true);
    t.s = 1.6;
    people.push(t);
    state.target = t;

    state.people = people;
    state.scenery = scenery;
    // y-sorted draw list; target drawn last so his face is never fully covered
    state.drawList = [...scenery, ...people.filter((p) => !p.isTarget)].sort((a, b) => a.y - b.y);
  }

  // ---------- drawing ----------
  function headCenter(p) {
    const s = p.s;
    return { x: p.x, y: p.y - 27 * s - HEAD_RY * s + 1.5 * s, rx: HEAD_RX * s, ry: HEAD_RY * s };
  }

  function drawPerson(p) {
    const s = p.s, x = p.x, y = p.y;
    ctx.lineCap = 'round';
    // legs
    ctx.fillStyle = p.pants;
    ctx.fillRect(x - 5 * s, y - 13 * s, 4 * s, 13 * s);
    ctx.fillRect(x + 1 * s, y - 13 * s, 4 * s, 13 * s);
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 6 * s, y - 1.5 * s, 5 * s, 2 * s);
    ctx.fillRect(x + 1 * s, y - 1.5 * s, 5 * s, 2 * s);

    // arms
    ctx.strokeStyle = p.shirt; ctx.lineWidth = 3.4 * s;
    const ay = y - 25 * s;
    ctx.beginPath();
    if (p.arms === 0) { ctx.moveTo(x - 7 * s, ay); ctx.lineTo(x - 9 * s, y - 13 * s); ctx.moveTo(x + 7 * s, ay); ctx.lineTo(x + 9 * s, y - 13 * s); }
    else if (p.arms === 1) { ctx.moveTo(x - 7 * s, ay); ctx.lineTo(x - 12 * s, y - 36 * s); ctx.moveTo(x + 7 * s, ay); ctx.lineTo(x + 9 * s, y - 13 * s); }
    else { ctx.moveTo(x - 7 * s, ay); ctx.lineTo(x - 13 * s, y - 37 * s); ctx.moveTo(x + 7 * s, ay); ctx.lineTo(x + 13 * s, y - 37 * s); }
    ctx.stroke();

    // torso
    ctx.fillStyle = p.shirt;
    roundRect(x - 7 * s, y - 28 * s, 14 * s, 16 * s, 3 * s); ctx.fill();
    if (p.striped) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 7 * s, y - 26 * s + i * 4 * s, 14 * s, 1.8 * s);
    }
    if (p.suit) {
      ctx.fillStyle = '#f5f5f5';
      ctx.beginPath(); ctx.moveTo(x - 3 * s, y - 28 * s); ctx.lineTo(x + 3 * s, y - 28 * s); ctx.lineTo(x, y - 19 * s); ctx.closePath(); ctx.fill();
    }

    // head
    const h = headCenter(p);
    if (p.isTarget && face.complete && face.naturalWidth) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(h.x, h.y, h.rx, h.ry, 0, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(face, FACE_CROP.sx, FACE_CROP.sy, FACE_CROP.sw, FACE_CROP.sh, h.x - h.rx, h.y - h.ry, h.rx * 2, h.ry * 2);
      ctx.restore();
      return;
    }
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.ellipse(h.x, h.y, h.rx, h.ry, 0, 0, Math.PI * 2); ctx.fill();

    // hair
    ctx.fillStyle = p.hair;
    if (p.hairStyle > 0 && p.hat !== 3) {
      ctx.beginPath();
      ctx.ellipse(h.x, h.y - h.ry * 0.35, h.rx * 1.05, h.ry * 0.7, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      if (p.hairStyle === 2) { ctx.fillRect(h.x - h.rx * 1.05, h.y - h.ry * 0.4, h.rx * 0.5, h.ry * 1.3); ctx.fillRect(h.x + h.rx * 0.55, h.y - h.ry * 0.4, h.rx * 0.5, h.ry * 1.3); }
      if (p.hairStyle === 3) { ctx.beginPath(); ctx.arc(h.x, h.y - h.ry * 1.05, h.rx * 0.5, 0, Math.PI * 2); ctx.fill(); }
      if (p.hairStyle === 4) { ctx.beginPath(); ctx.ellipse(h.x + (p.flip ? 1 : -1) * h.rx * 0.3, h.y - h.ry * 0.85, h.rx * 0.9, h.ry * 0.35, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    if (p.beard) {
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.ellipse(h.x, h.y + h.ry * 0.45, h.rx * 0.85, h.ry * 0.5, 0, 0, Math.PI); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // face
    ctx.fillStyle = '#222';
    const ex = h.rx * 0.4, ey = h.y - h.ry * 0.05;
    ctx.beginPath(); ctx.arc(h.x - ex, ey, 0.9 * s, 0, 7); ctx.arc(h.x + ex, ey, 0.9 * s, 0, 7); ctx.fill();
    if (p.glasses) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = 0.7 * s;
      ctx.beginPath(); ctx.arc(h.x - ex, ey, 2 * s, 0, 7); ctx.moveTo(h.x + ex + 2 * s, ey); ctx.arc(h.x + ex, ey, 2 * s, 0, 7);
      ctx.moveTo(h.x - ex + 2 * s, ey); ctx.lineTo(h.x + ex - 2 * s, ey); ctx.stroke();
    }
    ctx.strokeStyle = '#7a2e2e'; ctx.lineWidth = 0.7 * s;
    ctx.beginPath(); ctx.arc(h.x, h.y + h.ry * 0.3, 1.8 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

    // hats
    if (p.hat) {
      ctx.fillStyle = p.hatColor;
      const top = h.y - h.ry * 0.7;
      if (p.hat === 1) { // cap
        ctx.beginPath(); ctx.ellipse(h.x, top, h.rx * 1.05, h.ry * 0.45, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(h.x + (p.flip ? -h.rx * 1.7 : 0), top - 0.5 * s, h.rx * 1.7, 1.6 * s);
      } else if (p.hat === 2) { // beanie with pompom
        ctx.beginPath(); ctx.ellipse(h.x, top, h.rx * 1.05, h.ry * 0.6, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h.x, top - h.ry * 0.62, 1.8 * s, 0, 7); ctx.fill();
      } else if (p.hat === 3) { // top hat
        ctx.fillStyle = '#111';
        ctx.fillRect(h.x - h.rx * 1.4, top, h.rx * 2.8, 1.5 * s);
        ctx.fillRect(h.x - h.rx * 0.85, top - 9 * s, h.rx * 1.7, 9 * s);
      } else { // sun hat
        ctx.beginPath(); ctx.ellipse(h.x, top + s, h.rx * 1.8, h.ry * 0.25, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(h.x, top, h.rx * 0.9, h.ry * 0.45, 0, Math.PI, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawScenery(o) {
    const s = o.s, x = o.x, y = o.y;
    if (o.type === 'tree') {
      ctx.fillStyle = '#6b4423'; ctx.fillRect(x - 3 * s, y - 25 * s, 6 * s, 25 * s);
      ctx.fillStyle = o.c;
      ctx.beginPath();
      ctx.arc(x, y - 38 * s, 16 * s, 0, 7); ctx.arc(x - 11 * s, y - 30 * s, 11 * s, 0, 7); ctx.arc(x + 11 * s, y - 30 * s, 11 * s, 0, 7);
      ctx.fill();
    } else if (o.type === 'umbrella') {
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5 * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 40 * s); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? o.c : o.c2;
        ctx.beginPath(); ctx.moveTo(x, y - 46 * s);
        ctx.lineTo(x - 22 * s + i * 7.33 * s, y - 36 * s); ctx.lineTo(x - 22 * s + (i + 1) * 7.33 * s, y - 36 * s); ctx.closePath(); ctx.fill();
      }
    } else if (o.type === 'tent') {
      ctx.fillStyle = o.c;
      ctx.beginPath(); ctx.moveTo(x - 22 * s, y); ctx.lineTo(x, y - 30 * s); ctx.lineTo(x + 22 * s, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.moveTo(x - 6 * s, y); ctx.lineTo(x, y - 16 * s); ctx.lineTo(x + 6 * s, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = s; ctx.beginPath(); ctx.moveTo(x, y - 30 * s); ctx.lineTo(x, y - 38 * s); ctx.stroke();
      ctx.fillStyle = '#e63946'; ctx.fillRect(x, y - 38 * s, 7 * s, 4 * s);
    } else if (o.type === 'villa') {
      // modern flat-roof villa with glass walls and a pool, local units at s=1
      ctx.save();
      ctx.translate(x, y); ctx.scale(o.flip ? -s : s, s);
      // pool + deck in front
      ctx.fillStyle = '#e7dcc7'; ctx.fillRect(-82, -2, 120, 22);
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(-74, 2, 96, 14);
      ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-66, 7); ctx.lineTo(-40, 7); ctx.moveTo(-20, 11); ctx.lineTo(10, 11); ctx.stroke();
      // ground floor
      ctx.fillStyle = '#f5f1e8'; ctx.fillRect(-78, -46, 156, 46);
      ctx.fillStyle = '#7dd3fc'; ctx.fillRect(-70, -40, 66, 36);
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2;
      ctx.strokeRect(-70, -40, 66, 36);
      ctx.beginPath(); for (const mx of [-48, -26]) { ctx.moveTo(mx, -40); ctx.lineTo(mx, -4); } ctx.stroke();
      ctx.fillStyle = o.wood; ctx.fillRect(4, -40, 66, 40);
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); for (let ly = -36; ly < 0; ly += 4) { ctx.moveTo(4, ly); ctx.lineTo(70, ly); } ctx.stroke();
      ctx.fillStyle = '#1f2937'; ctx.fillRect(48, -30, 14, 30); // front door
      // upper floor, cantilevered
      ctx.fillStyle = '#f5f1e8'; ctx.fillRect(-58, -82, 104, 36);
      ctx.fillStyle = '#7dd3fc'; ctx.fillRect(-52, -76, 58, 24);
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2; ctx.strokeRect(-52, -76, 58, 24);
      ctx.beginPath(); ctx.moveTo(-23, -76); ctx.lineTo(-23, -52); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.moveTo(-50, -76); ctx.lineTo(-42, -76); ctx.lineTo(-52, -60); ctx.closePath(); ctx.fill();
      // roof slabs + balcony glass
      ctx.fillStyle = '#374151';
      ctx.fillRect(-64, -86, 116, 5);
      ctx.fillRect(-84, -49, 168, 4);
      ctx.fillStyle = 'rgba(186,230,253,.6)'; ctx.fillRect(10, -58, 34, 9);
      // hedges
      ctx.fillStyle = '#2d6a4f';
      for (const hx of [-90, 84]) { ctx.beginPath(); ctx.arc(hx, -8, 9, 0, 7); ctx.arc(hx + (hx < 0 ? 6 : -6), -14, 7, 0, 7); ctx.fill(); }
      ctx.restore();
    } else if (o.type === 'dubai') {
      // Dubai-style property: stepped needle skyscraper or sail-shaped hotel, palms and a sign
      ctx.save();
      ctx.translate(x, y); ctx.scale(o.flip ? -s : s, s);
      ctx.fillStyle = '#f2e3c6'; ctx.beginPath(); ctx.ellipse(0, -2, 95, 10, 0, 0, 7); ctx.fill(); // sand plot
      if (o.variant === 0) {
        const tiers = [[34, 70], [26, 60], [19, 50], [13, 40], [8, 30]];
        let top = -4;
        for (let i = 0; i < tiers.length; i++) {
          const [hw, h] = tiers[i];
          const g = ctx.createLinearGradient(-hw, 0, hw, 0);
          g.addColorStop(0, '#9fb7c9'); g.addColorStop(0.45, '#e8f1f7'); g.addColorStop(1, '#6f8ca3');
          ctx.fillStyle = g; ctx.fillRect(-hw, top - h, hw * 2, h);
          ctx.strokeStyle = 'rgba(40,60,80,.25)'; ctx.lineWidth = 0.8; ctx.beginPath();
          for (let ly = top - 6; ly > top - h; ly -= 6) { ctx.moveTo(-hw, ly); ctx.lineTo(hw, ly); }
          ctx.stroke();
          top -= h;
        }
        ctx.strokeStyle = '#8aa1b3'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(0, top - 45); ctx.stroke(); // spire
      } else {
        // sail hotel
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath(); ctx.moveTo(-30, -4); ctx.lineTo(-30, -230);
        ctx.quadraticCurveTo(55, -150, 40, -4); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(100,116,139,.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); for (let ly = -20; ly > -210; ly -= 14) { ctx.moveTo(-30, ly); ctx.quadraticCurveTo(10, ly + 4, 40 - (ly / -230) * 6, ly + 10); } ctx.stroke();
        ctx.fillStyle = '#475569'; ctx.fillRect(-36, -236, 8, 232); // mast
        ctx.fillRect(-56, -150, 26, 4); // helipad arm
        ctx.beginPath(); ctx.arc(-60, -150, 9, 0, 7); ctx.fill();
        ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(-60, -150, 5, 0, 7); ctx.fill();
      }
      // palms
      for (const px of [-70, 72]) {
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(px, -2); ctx.quadraticCurveTo(px + 6, -25, px + 2, -48); ctx.stroke();
        ctx.fillStyle = '#2f9e44';
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx.beginPath(); ctx.ellipse(px + 2 + Math.cos(a) * 11, -50 + Math.sin(a) * 5, 13, 3.5, a, 0, 7); ctx.fill();
        }
      }
      // sign
      ctx.fillStyle = '#6b4423'; ctx.fillRect(48, -26, 3, 24);
      ctx.fillStyle = '#c9a227'; ctx.fillRect(30, -42, 40, 18);
      ctx.save(); if (o.flip) { ctx.translate(50, 0); ctx.scale(-1, 1); ctx.translate(-50, 0); }
      ctx.fillStyle = '#111'; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('DUBAI', 50, -35); ctx.fillText('ELADÓ', 50, -27);
      ctx.restore();
      ctx.restore();
    } else if (o.type === 'car') {
      // low rear-engine sports coupé (911-style silhouette), side view, local units ≈ px at s=1
      ctx.save();
      ctx.translate(x, y); ctx.scale(o.flip ? -s : s, s);
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath(); ctx.ellipse(0, 0, 54, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = o.c;
      ctx.beginPath();
      ctx.moveTo(-54, -8);
      ctx.lineTo(-55, -17);
      ctx.quadraticCurveTo(-54, -24, -45, -26);
      ctx.bezierCurveTo(-30, -29, -22, -41, -5, -41);
      ctx.quadraticCurveTo(8, -41, 18, -28);
      ctx.lineTo(40, -24);
      ctx.quadraticCurveTo(53, -22, 55, -13);
      ctx.lineTo(55, -8);
      ctx.quadraticCurveTo(55, -5, 50, -5);
      ctx.lineTo(-50, -5);
      ctx.quadraticCurveTo(-54, -5, -54, -8);
      ctx.closePath(); ctx.fill();
      // windows
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.moveTo(-30, -28); ctx.bezierCurveTo(-24, -36, -14, -38, -5, -38);
      ctx.quadraticCurveTo(5, -38, 13, -28); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = o.c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, -38); ctx.lineTo(-4, -28); ctx.stroke();
      // door line, lights
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-6, -27); ctx.lineTo(-4, -8); ctx.moveTo(16, -26); ctx.lineTo(16, -9); ctx.stroke();
      ctx.fillStyle = '#fff7c2'; ctx.beginPath(); ctx.ellipse(47, -21, 3.5, 2.4, -0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#e11d48'; ctx.fillRect(-55.5, -18, 3, 4);
      // wheels
      for (const wx of [-34, 34]) {
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(wx, -6, 9, 0, 7); ctx.fill();
        ctx.fillStyle = '#b8bec6'; ctx.beginPath(); ctx.arc(wx, -6, 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#6b7280'; ctx.beginPath(); ctx.arc(wx, -6, 1.6, 0, 7); ctx.fill();
      }
      ctx.restore();
    } else if (o.type === 'balloons') {
      const cols = ['#e63946', '#ffd60a', '#3a86ff', '#06d6a0', '#ff006e'];
      ctx.strokeStyle = '#555'; ctx.lineWidth = 0.6 * s;
      for (let i = 0; i < 4; i++) {
        const bx = x + (i - 1.5) * 6 * s, by = y - 45 * s - (i % 2) * 6 * s;
        ctx.beginPath(); ctx.moveTo(x, y - 18 * s); ctx.lineTo(bx, by); ctx.stroke();
        ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.ellipse(bx, by - 4 * s, 4 * s, 5 * s, 0, 0, 7); ctx.fill();
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function render(ts) {
    const dpr = window.devicePixelRatio || 1;
    const vw = canvas.width / dpr, vh = canvas.height / dpr;
    const { cam } = state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1b1d24'; ctx.fillRect(0, 0, vw, vh);

    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, -cam.x * cam.zoom * dpr, -cam.y * cam.zoom * dpr);
    // ground
    ctx.fillStyle = '#8fbf5a'; ctx.fillRect(0, 0, state.W, state.H);
    for (const f of state.flat || []) {
      if (f.type === 'path') {
        ctx.strokeStyle = '#d9c38c'; ctx.lineWidth = f.w; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.bezierCurveTo(f.x1, state.H / 2, f.x2, state.H / 2, f.x2, f.y2); ctx.stroke();
      }
    }
    for (const f of state.flat || []) {
      if (f.type === 'pond') {
        ctx.fillStyle = '#4ea8de'; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.rx, f.ry, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#a3d5ff'; ctx.lineWidth = 3; ctx.stroke();
      }
    }

    // cull to viewport
    const x0 = cam.x - 220, y0 = cam.y - 60, x1 = cam.x + vw / cam.zoom + 220, y1 = cam.y + vh / cam.zoom + 120;
    for (const o of state.drawList || []) {
      if (o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1) continue;
      if (o.type) drawScenery(o); else drawPerson(o);
    }
    if (state.target) drawPerson(state.target);

    // wrong-click markers
    const now = performance.now();
    state.misses = state.misses.filter((m) => now - m.t < 900);
    for (const m of state.misses) {
      const a = 1 - (now - m.t) / 900;
      ctx.strokeStyle = `rgba(230,57,70,${a})`; ctx.lineWidth = 4 / cam.zoom;
      const r = 12 / cam.zoom;
      ctx.beginPath(); ctx.moveTo(m.x - r, m.y - r); ctx.lineTo(m.x + r, m.y + r); ctx.moveTo(m.x + r, m.y - r); ctx.lineTo(m.x - r, m.y + r); ctx.stroke();
    }

    // found ring
    if (state.foundAnim) {
      const h = headCenter(state.target);
      const age = now - state.foundAnim.t;
      ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 3 / cam.zoom;
      for (let i = 0; i < 3; i++) {
        const r = h.ry * 1.6 + ((age / 12 + i * 20) % 60) / cam.zoom;
        ctx.globalAlpha = 1 - ((age / 12 + i * 20) % 60) / 60;
        ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, 7); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- camera ----------
  // real on-screen canvas size (on mobile Safari this can differ from innerHeight)
  function viewSize() { const r = canvas.getBoundingClientRect(); return { vw: r.width || window.innerWidth, vh: r.height || window.innerHeight }; }
  // extra screen-px room to pan past the edges so the HUD / browser toolbars never hide part of the map
  const PAD_TOP = 70, PAD_BOTTOM = COARSE ? 110 : 30, PAD_SIDE = COARSE ? 20 : 0;

  function clampCam() {
    const { vw, vh } = viewSize();
    const c = state.cam;
    c.zoom = Math.max(state.minZoom, Math.min(state.maxZoom, c.zoom));
    const ww = vw / c.zoom, wh = vh / c.zoom;
    const pt = PAD_TOP / c.zoom, pb = PAD_BOTTOM / c.zoom, ps = PAD_SIDE / c.zoom;
    c.x = ww >= state.W ? (state.W - ww) / 2 : Math.max(-ps, Math.min(state.W - ww + ps, c.x));
    c.y = wh >= state.H ? (state.H - wh) / 2 : Math.max(-pt, Math.min(state.H - wh + pb, c.y));
  }

  function zoomAt(sx, sy, factor) {
    const c = state.cam;
    const wx = c.x + sx / c.zoom, wy = c.y + sy / c.zoom;
    c.zoom *= factor;
    c.zoom = Math.max(state.minZoom, Math.min(state.maxZoom, c.zoom));
    c.x = wx - sx / c.zoom; c.y = wy - sy / c.zoom;
    clampCam();
  }

  function fitCamera() {
    const { vw, vh } = viewSize();
    state.minZoom = Math.min(vw / state.W, vh / state.H);
    // start filling the screen (no empty bars) — on phones this keeps people big enough to see
    state.cam.zoom = Math.max(vw / state.W, vh / state.H);
    state.cam.x = (state.W - vw / state.cam.zoom) / 2; state.cam.y = (state.H - vh / state.cam.zoom) / 2;
    clampCam();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const { vw, vh } = viewSize();
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    if (state.W) {
      state.minZoom = Math.min(vw / state.W, vh / state.H);
      clampCam();
    }
  }

  // ---------- input ----------
  const pointers = new Map();
  let dragStart = null, pinchStart = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragStart = { x: e.clientX, y: e.clientY, cx: state.cam.x, cy: state.cam.y, moved: false };
      canvas.classList.add('dragging');
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.cam.zoom };
      if (dragStart) dragStart.moved = true;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const target = pinchStart.zoom * (d / pinchStart.d);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target / state.cam.zoom);
    } else if (dragStart) {
      const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
      if (Math.hypot(dx, dy) > 6) dragStart.moved = true;
      if (dragStart.moved) {
        state.cam.x = dragStart.cx - dx / state.cam.zoom;
        state.cam.y = dragStart.cy - dy / state.cam.zoom;
        clampCam();
      }
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      canvas.classList.remove('dragging');
      if (dragStart && !dragStart.moved && e.type === 'pointerup') handleClick(e.clientX, e.clientY);
      dragStart = null;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const { vw, vh } = viewSize();
    if (e.key === '+' || e.key === '=') zoomAt(vw / 2, vh / 2, 1.3);
    if (e.key === '-') zoomAt(vw / 2, vh / 2, 1 / 1.3);
  });

  $('zoom-in').onclick = () => { const { vw, vh } = viewSize(); zoomAt(vw / 2, vh / 2, 1.4); };
  $('zoom-out').onclick = () => { const { vw, vh } = viewSize(); zoomAt(vw / 2, vh / 2, 1 / 1.4); };
  $('wanted-mini').onclick = () => { if (state.playing) { state.playing = false; showStart(true); } };

  function handleClick(sx, sy) {
    if (!state.playing) return;
    const c = state.cam;
    const wx = c.x + sx / c.zoom, wy = c.y + sy / c.zoom;
    const h = headCenter(state.target);
    // generous hitbox: head (with slack), plus his body
    const minPx = (COARSE ? 20 : 10) / c.zoom; // screen-px tolerance, bigger for fingers
    const nx = (wx - h.x) / (h.rx + minPx), ny = (wy - h.y) / (h.ry + minPx);
    const onHead = nx * nx + ny * ny <= 1.4;
    const onBody = Math.abs(wx - state.target.x) < 9 * state.target.s && wy > h.y && wy < state.target.y;
    if (onHead || onBody) found();
    else {
      state.time += 5;
      state.misses.push({ x: wx, y: wy, t: performance.now() });
      flash('Nem ő! +5 mp', sx, sy);
    }
  }

  function flash(text, x, y) {
    const el = $('flash');
    el.textContent = text;
    el.style.transition = 'none';
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - 140, x - 40))}px`; el.style.top = `${y - 30}px`;
    el.style.opacity = '1'; el.style.transform = 'translateY(0)';
    void el.offsetWidth;
    el.style.transition = 'opacity .8s, transform .8s';
    el.style.opacity = '0'; el.style.transform = 'translateY(-30px)';
  }

  // ---------- flow ----------
  function found() {
    state.playing = false;
    state.foundAnim = { t: performance.now() };
    const t = state.time;
    const pts = Math.max(100, Math.round((3000 - t * 25) * (1 + (state.level - 1) * 0.25)));
    state.score += pts;
    updateHud();

    // fly camera to him
    const h = headCenter(state.target);
    const { vw, vh } = viewSize();
    const from = { ...state.cam };
    const toZoom = Math.max(from.zoom, 3.5);
    const to = { zoom: toZoom, x: h.x - vw / 2 / toZoom, y: h.y - vh / 2 / toZoom };
    const start = performance.now();
    (function fly() {
      const k = Math.min(1, (performance.now() - start) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      state.cam.zoom = from.zoom + (to.zoom - from.zoom) * e;
      state.cam.x = from.x + (to.x - from.x) * e;
      state.cam.y = from.y + (to.y - from.y) * e;
      if (k < 1) requestAnimationFrame(fly);
      else setTimeout(() => {
        $('found-title').textContent = pick(['Megvan!', 'Elkaptuk!', 'Ott van!', 'Lebukott!']);
        $('found-text').textContent = `${state.level}. szint teljesítve ${fmt(t)} mp alatt: +${pts} pont. ${state.level < 12 ? 'A következő tömeg még nagyobb.' : 'Bírod még?'}`;
        $('found').classList.remove('hidden');
      }, 700);
    })();
  }

  function startLevel() {
    $('found').classList.add('hidden');
    $('start').classList.add('hidden');
    state.foundAnim = null; state.misses = [];
    buildLevel(state.level);
    fitCamera();
    state.time = 0;
    state.playing = true;
    updateHud();
  }

  function showStart(resume) {
    $('start').classList.remove('hidden');
    $('start-btn').textContent = resume ? 'Vissza a kereséshez' : 'Keresés indítása';
    $('start-btn').onclick = () => {
      $('start').classList.add('hidden');
      if (resume) state.playing = true; else startLevel();
    };
  }

  $('next-btn').onclick = () => {
    state.level++;
    startLevel();
  };

  // ---------- coffee / BTC donation ----------
  let pausedForCoffee = false;
  document.querySelectorAll('.coffee-open').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.playing) { state.playing = false; pausedForCoffee = true; }
    $('coffee').classList.remove('hidden');
  }));
  $('coffee-close').onclick = (e) => {
    e.preventDefault();
    $('coffee').classList.add('hidden');
    if (pausedForCoffee) { state.playing = true; pausedForCoffee = false; }
  };
  $('btc-copy').onclick = async () => {
    const addr = $('btc-addr').textContent.trim();
    try { await navigator.clipboard.writeText(addr); }
    catch { const r = document.createRange(); r.selectNodeContents($('btc-addr')); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy'); }
    $('btc-copy').textContent = 'Kimásolva ✓';
    setTimeout(() => { $('btc-copy').textContent = 'Cím másolása'; }, 2000);
  };

  function updateHud() {
    $('level').textContent = `${state.level}. szint`;
    $('timer').textContent = `⏱ ${fmt(state.time)} mp`;
    $('score').textContent = `${state.score.toLocaleString('hu-HU')} pont`;
  }

  function loop(ts) {
    const dt = state.lastTs ? (ts - state.lastTs) / 1000 : 0;
    state.lastTs = ts;
    if (state.playing) { state.time += dt; updateHud(); }
    render(ts);
    requestAnimationFrame(loop);
  }

  document.addEventListener('gesturestart', (e) => e.preventDefault()); // stop iOS page zoom
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();
  buildLevel(1); fitCamera(); // background scene behind the start screen
  showStart(false);
  requestAnimationFrame(loop);
})();
