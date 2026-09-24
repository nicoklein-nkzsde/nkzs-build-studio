// 3D-Ansicht: PC, Tastatur, Setup. Prozedural gebaut aus den Bauteil-Daten.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { playKey } from './sound.js';

let renderer, scene, camera, controls, root, el, sun, floor;
let spinners = [], rgbMats = [], keyObjs = [], keyByCode = new Map();
let mode = null, kbSound = null, lastKey = '';
const opts = { rgb: true, autoRotate: false, sound: true };
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
export let onTyped = null;
export const setOnTyped = (fn) => (onTyped = fn);

// ---------- Helfer ----------
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.5, metalness: o.m ?? 0.1, ...(o.x || {}) });
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const rbox = (w, h, d, r, mat, x, y, z) => mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.99), mat, x, y, z);
function rgbMat(offset = 0) {
  const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff33cc, emissiveIntensity: 2.2, roughness: 0.4 });
  m.userData.hueOffset = offset;
  rgbMats.push(m);
  return m;
}
const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0x9aa4b4, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.07, envMapIntensity: 0.25, depthWrite: false });

// Lüfter: Achse = lokale z
function fan(r, color = '#1a1a1a', rgb = false) {
  const g = new THREE.Group();
  const fm = M(color, { r: 0.6 });
  const s = r * 2 + 0.08, t = 0.25;
  const bar = (w, h, x, y) => g.add(box(w, h, t, fm, x, y, 0));
  bar(s, 0.05, 0, s / 2 - 0.025); bar(s, 0.05, 0, -s / 2 + 0.025);
  bar(0.05, s, s / 2 - 0.025, 0); bar(0.05, s, -s / 2 + 0.025, 0);
  const ring = mesh(new THREE.CylinderGeometry(r + 0.02, r + 0.02, t, 32, 1, true), rgb ? M('#ddd', { r: 0.3 }) : fm);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  if (rgb) {
    const tor = mesh(new THREE.TorusGeometry(r * 0.98, 0.025, 8, 40), rgbMat(Math.random()));
    tor.position.z = t / 2;
    g.add(tor);
  }
  const blades = new THREE.Group();
  const bm = M(rgb ? '#f4f4f6' : color, { r: 0.5, x: rgb ? { transparent: true, opacity: 0.85 } : {} });
  const hub = mesh(new THREE.CylinderGeometry(r * 0.32, r * 0.32, 0.1, 24), bm);
  hub.rotation.x = Math.PI / 2;
  blades.add(hub);
  for (let i = 0; i < 7; i++) {
    const piv = new THREE.Group();
    piv.rotation.z = (i / 7) * Math.PI * 2;
    const b = box(r * 0.66, r * 0.3, 0.02, bm, r * 0.62, 0, 0);
    b.rotation.x = 0.5;
    piv.add(b);
    blades.add(piv);
  }
  g.add(blades);
  spinners.push(blades);
  return g;
}

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- PC ----------
function buildPC(p) {
  const g = new THREE.Group();
  const cs = p.case || { dims: [460, 230, 450], color: '#1b1c20', style: 'glass', ff: ['ATX'] };
  const [H, W, D] = cs.dims.map((v) => v / 100);
  const t = 0.04;
  const sff = cs.style === 'sff' || H < 3;
  const light = new THREE.Color(cs.color).getHSL({}).l > 0.5;
  const shell = M(cs.color, { r: 0.45, m: 0.35 });
  const inner = M(light ? '#d4d5d8' : '#141518', { r: 0.7 });

  g.add(box(D, t, W, shell, 0, t / 2, 0));
  g.add(box(D, t, W, shell, 0, H - t / 2, 0));
  g.add(box(D, H, t, inner, 0, H / 2, -W / 2 + t / 2));
  g.add(box(t, H, W, shell, D / 2 - t / 2, H / 2, 0));
  // Front
  if (cs.style === 'wood') {
    g.add(box(t, H, W, shell, -D / 2 + t / 2, H / 2, 0));
    const wood = M('#8a5a36', { r: 0.7 });
    const n = Math.floor(W / 0.18);
    for (let i = 0; i < n; i++) g.add(box(0.08, H * 0.94, 0.12, wood, -D / 2 - 0.03, H / 2, -W / 2 + 0.12 + i * ((W - 0.24) / (n - 1))));
  } else if (cs.style === 'mesh') {
    const mt = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = cs.color; x.fillRect(0, 0, w, h);
      x.fillStyle = light ? '#b9babd' : '#050506';
      for (let i = 0; i < w; i += 8) for (let j = 0; j < h; j += 8) { x.beginPath(); x.arc(i + ((j / 8) % 2) * 4, j, 2.4, 0, 7); x.fill(); }
    });
    mt.wrapS = mt.wrapT = THREE.RepeatWrapping; mt.repeat.set(3, 6);
    g.add(box(t, H, W, M('#fff', { r: 0.8, x: { map: mt } }), -D / 2 + t / 2, H / 2, 0));
  } else if (cs.style === 'dual-glass') {
    const gl = box(t, H, W, glassMat(), -D / 2 + t / 2, H / 2, 0); gl.castShadow = false; g.add(gl);
    g.add(box(t * 2, t * 2, W, shell, -D / 2 + t, t, 0));
  } else {
    g.add(box(t, H, W, shell, -D / 2 + t / 2, H / 2, 0));
  }
  // Glas-Seitenteil + Rahmen
  const glass = box(D, H, 0.02, glassMat(), 0, H / 2, W / 2 - 0.01); glass.castShadow = false; g.add(glass);
  g.add(box(D, 0.08, 0.04, shell, 0, H - 0.04, W / 2 - 0.02));
  g.add(box(D, 0.08, 0.04, shell, 0, 0.04, W / 2 - 0.02));
  g.add(box(0.08, H, 0.04, shell, D / 2 - 0.04, H / 2, W / 2 - 0.02));
  // Füße
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.3, 0.08, 0.2, M('#111'), sx * (D / 2 - 0.3), -0.04, sz * (W / 2 - 0.2)));

  const shroudH = cs.style === 'dual-glass' || sff ? 0 : 0.95;
  if (shroudH) g.add(box(D - 2 * t, shroudH, W - 0.06, shell, 0, shroudH / 2 + t, -0.03));
  if (cs.style === 'dual-glass') {
    for (let i = 0; i < 3; i++) { const f = fan(0.56, light ? '#e8e8ea' : '#161616', cs.rgbFans); f.rotation.x = -Math.PI / 2; f.position.set(-D / 2 + 0.8 + i * 1.2, t + 0.14, 0.1); g.add(f); }
  }

  // Mainboard
  const ff = p.mobo?.ff || (cs.ff?.includes('ATX') ? 'ATX' : cs.ff?.[0] || 'ATX');
  const [mbH, mbW] = { ATX: [3.05, 2.44], mATX: [2.44, 2.44], ITX: [1.7, 1.7] }[ff];
  const trayZ = -W / 2 + t;
  const mbX = D / 2 - 0.25 - mbW / 2, mbY = H - 0.22 - mbH / 2;
  const mbMat = M(p.mobo?.color || '#1c1e22', { r: 0.55, m: 0.2 });
  const hsMat = M(new THREE.Color(p.mobo?.color || '#1c1e22').getHSL({}).l > 0.5 ? '#c8c9cc' : '#3a3c42', { r: 0.35, m: 0.8 });
  g.add(box(mbW, mbH, 0.03, mbMat, mbX, mbY, trayZ + 0.06));
  g.add(box(0.32, 1.0, 0.26, hsMat, mbX + mbW / 2 - 0.18, mbY + mbH / 2 - 0.62, trayZ + 0.2));
  g.add(box(mbW * 0.45, 0.22, 0.16, hsMat, mbX + mbW * 0.08, mbY + mbH / 2 - 0.2, trayZ + 0.15));
  if (ff !== 'ITX') g.add(box(0.55, 0.45, 0.1, hsMat, mbX - mbW / 2 + 0.55, mbY - mbH / 2 + 0.55, trayZ + 0.12));

  const cpuX = mbX + mbW / 2 - Math.min(0.95, mbW * 0.45);
  const cpuY = mbY + mbH / 2 - 0.82;
  g.add(box(0.45, 0.45, 0.05, M('#9da1a8', { m: 0.9, r: 0.3 }), cpuX, cpuY, trayZ + 0.1));

  // RAM
  const sticks = p.ram?.sticks || (p.ram ? 2 : 0);
  const slotIdx = sticks === 4 ? [0, 1, 2, 3] : ff === 'ITX' ? [0, 1] : [1, 3];
  for (let i = 0; i < sticks; i++) {
    const rx = cpuX - (ff === 'ITX' ? 0.62 : 0.72) - slotIdx[i] * 0.1;
    g.add(box(0.06, 1.33, 0.32, M(p.ram.color || '#1b1b1d', { m: 0.6, r: 0.35 }), rx, cpuY, trayZ + 0.25));
    if (p.ram.rgb) g.add(box(0.065, 1.3, 0.08, rgbMat(i * 0.1), rx, cpuY, trayZ + 0.45));
  }
  // M.2
  if (p.storage) g.add(box(0.8, 0.22, 0.05, hsMat, cpuX - 0.25, cpuY - 0.95, trayZ + 0.1));

  // Grafikkarte
  if (p.gpu) {
    const L = p.gpu.len / 100, th = (p.gpu.slots || 2) * 0.2, pw = 1.25;
    const slotY = ff === 'ITX' ? mbY - mbH / 2 + 0.4 : cpuY - 1.45;
    const gx = D / 2 - 0.15 - L / 2, gz = trayZ + 0.12 + pw / 2, gy = slotY - th / 2;
    const gm = M(p.gpu.color, { m: 0.55, r: 0.35 });
    g.add(rbox(L, th, pw, 0.05, gm, gx, gy, gz));
    g.add(box(L * 0.98, 0.02, pw * 0.96, M('#2e3034', { m: 0.8, r: 0.3 }), gx, gy + th / 2 + 0.01, gz));
    const n = p.gpu.fans || 3, fr = Math.min(0.5, L / (n * 2) - 0.04);
    for (let i = 0; i < n; i++) {
      const f = fan(fr, '#101010');
      f.rotation.x = Math.PI / 2;
      f.position.set(gx - L / 2 + (i + 0.5) * (L / n), gy - th / 2 + 0.05, gz);
      f.scale.z = 0.5;
      g.add(f);
    }
    g.add(box(L * 0.45, 0.05, 0.02, rgbMat(0.3), gx + L * 0.15, gy + th * 0.2, gz + pw / 2 + 0.005));
    g.add(box(0.05, th * 0.9, pw * 0.9, M('#8c9098', { m: 0.9, r: 0.3 }), D / 2 - 0.12, gy, gz));
  }

  // CPU-Kühler
  const cz0 = trayZ + 0.12;
  const cl = p.cooler;
  if (cl?.kind === 'air') {
    const hgt = Math.min(cl.height / 100, W - 0.35);
    const fin = M(cl.fin || '#c0c3c8', { m: 0.8, r: 0.3 });
    const towers = cl.dual ? [-0.36, 0.36] : [0];
    for (const dx of towers) {
      g.add(box(0.42, 1.25, hgt - 0.1, fin, cpuX + dx, cpuY, cz0 + (hgt - 0.1) / 2 + 0.05));
      g.add(box(0.44, 1.27, 0.04, M('#26272b', { m: 0.7, r: 0.3 }), cpuX + dx, cpuY, cz0 + hgt - 0.03));
    }
    const fx = cl.dual ? [cpuX - 0.36 - 0.34, cpuX] : [cpuX - 0.35];
    for (const x of fx) { const f = fan(0.56, cl.fan); f.rotation.y = Math.PI / 2; f.position.set(x, cpuY, cz0 + hgt / 2 + 0.05); f.scale.z = 0.8; g.add(f); }
  } else if (cl?.kind === 'low') {
    g.add(box(1.1, 1.1, 0.35, M(cl.fin || '#c0c3c8', { m: 0.8, r: 0.3 }), cpuX - 0.15, cpuY, cz0 + 0.25));
    const f = fan(0.48, cl.fan); f.position.set(cpuX - 0.15, cpuY, cz0 + 0.55); f.scale.z = 0.6; g.add(f);
  } else if (cl?.kind === 'aio') {
    const pump = mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.3, 40), M('#1a1a1c', { m: 0.6, r: 0.3 }), cpuX, cpuY, cz0 + 0.2);
    pump.rotation.x = Math.PI / 2; g.add(pump);
    const cap = mesh(new THREE.CircleGeometry(0.27, 40), cl.rgb ? rgbMat(0.5) : M('#333', { m: 0.8 }), cpuX, cpuY, cz0 + 0.36);
    g.add(cap);
    const rl = cl.rad / 100 + 0.12;
    const ry = H - t - 0.2, rz = 0.05;
    const rx = Math.max(-D / 2 + rl / 2 + 0.1, D / 2 - 0.35 - rl / 2);
    g.add(box(rl, 0.27, 1.22, M('#141416', { r: 0.6 }), rx, ry, rz));
    const n = Math.round(cl.rad / 120);
    for (let i = 0; i < n; i++) {
      const f = fan(0.56, cl.fan, !!cl.rgb);
      f.rotation.x = Math.PI / 2;
      f.position.set(rx - rl / 2 + 0.06 + (i + 0.5) * 1.2, ry - 0.27, rz);
      g.add(f);
    }
    const tubeMat = M('#111', { r: 0.6 });
    for (const off of [-0.12, 0.12]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(cpuX + off, cpuY + 0.3, cz0 + 0.2),
        new THREE.Vector3(cpuX - 0.4 + off, cpuY + 0.6, cz0 + 0.7),
        new THREE.Vector3(rx - rl / 2 + 0.2, ry - 0.2, rz + 0.3 + off * 2),
        new THREE.Vector3(rx - rl / 2 + 0.02, ry, rz + 0.3 + off * 2),
      ]);
      g.add(mesh(new THREE.TubeGeometry(curve, 30, 0.055, 10), tubeMat));
    }
  }

  // Gehäuselüfter
  if (!sff) {
    const light2 = light ? '#e8e8ea' : '#161616';
    if (cs.style !== 'dual-glass') {
      const n = Math.min(3, Math.floor((H - shroudH - 0.3) / 1.22));
      for (let i = 0; i < n; i++) {
        const f = fan(0.56, light2, !!cs.rgbFans);
        f.rotation.y = Math.PI / 2;
        f.position.set(-D / 2 + 0.2, H - 0.8 - i * 1.22, -0.05);
        g.add(f);
      }
    }
    const rf = fan(0.56, light2, !!cs.rgbFans); rf.rotation.y = -Math.PI / 2; rf.position.set(D / 2 - 0.17, cpuY, -0.05); g.add(rf);
  }
  // Innenbeleuchtung
  const pl = new THREE.PointLight(0xffffff, 1.2, 6, 1.5); pl.position.set(0, H * 0.7, W / 2 - 0.3); g.add(pl);

  return { group: g, H, W, D };
}

// ---------- Tastatur ----------
function buildKeyboard(k, interactive) {
  const g = new THREE.Group();
  const { keys, width, depth } = k.layout;
  const bez = 0.55, cw = width + bez * 2, cd = depth + bez * 2, ch = 0.9;
  let caseMat;
  if (k.caseMat === 'pc') caseMat = new THREE.MeshPhysicalMaterial({ color: k.caseColor, roughness: 0.55, transmission: 0.6, thickness: 0.5, transparent: true, opacity: 0.85 });
  else if (k.caseMat === 'wood') {
    const wt = canvasTex(512, 128, (x, w, h) => {
      x.fillStyle = k.caseColor; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const y = Math.random() * h; x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + Math.random() * 20 - 10, w * 0.6, y + Math.random() * 20 - 10, w, y + Math.random() * 10 - 5); x.stroke(); }
    });
    caseMat = M('#ffffff', { r: 0.7, x: { map: wt } });
  } else if (k.caseMat === 'alu') caseMat = M(k.caseColor, { m: 0.75, r: 0.32 });
  else caseMat = M(k.caseColor, { m: 0, r: 0.55 });

  const baseH = ch - 0.3;
  g.add(rbox(cw, baseH, cd, 0.2, caseMat, 0, baseH / 2, 0));
  const wallH = 0.3;
  g.add(rbox(cw, wallH, bez + 0.05, 0.08, caseMat, 0, baseH + wallH / 2 - 0.02, -cd / 2 + (bez + 0.05) / 2));
  g.add(rbox(cw, wallH, bez + 0.05, 0.08, caseMat, 0, baseH + wallH / 2 - 0.02, cd / 2 - (bez + 0.05) / 2));
  g.add(rbox(bez + 0.05, wallH, cd, 0.08, caseMat, -cw / 2 + (bez + 0.05) / 2, baseH + wallH / 2 - 0.02, 0));
  g.add(rbox(bez + 0.05, wallH, cd, 0.08, caseMat, cw / 2 - (bez + 0.05) / 2, baseH + wallH / 2 - 0.02, 0));
  if (k.weight) g.add(box(cw * 0.5, 0.02, 0.3, M('#c9a45a', { m: 1, r: 0.2 }), 0, 0.2, -cd / 2 - 0.005));
  const plateY = baseH + 0.04;
  g.add(box(width + 0.1, 0.05, depth + 0.1, k.plate.translucent ? new THREE.MeshPhysicalMaterial({ color: k.plate.color, roughness: 0.4, transmission: 0.5, transparent: true, opacity: 0.9 }) : M(k.plate.color, { m: 0.5, r: 0.4 }), 0, plateY, 0));
  if (k.rgb) {
    const um = rgbMat(0);
    g.add(box(width, 0.02, depth, um, 0, plateY - 0.03, 0));
    g.add(box(cw * 0.96, 0.04, 0.04, rgbMat(0.2), 0, 0.05, cd / 2 + 0.005));
  }

  const swMat = M(k.switchColor, { r: 0.4, x: { transparent: false } });
  const housing = M('#f2f2f2', { r: 0.3, x: { transparent: true, opacity: 0.75 } });
  const geoCache = new Map();
  const capH = k.capH;
  const low = capH < 0.3;
  for (const key of keys) {
    const cx = key.x + key.w / 2 - width / 2, cz = key.y + key.h / 2 - depth / 2;
    if (!low) {
      g.add(box(0.56, 0.2, 0.56, housing, cx, plateY + 0.12, cz));
      g.add(box(0.2, 0.12, 0.2, swMat, cx, plateY + 0.27, cz));
    }
    const ck = `${key.w}|${key.h}|${capH}`;
    let geo = geoCache.get(ck);
    if (!geo) {
      const gw = key.w - 0.07, gd = key.h - 0.07;
      geo = new RoundedBoxGeometry(gw, capH, gd, 2, low ? 0.04 : 0.07);
      const pos = geo.attributes.position;
      const inset = low ? 0.02 : 0.1;
      const sx = (gw - inset * 2) / gw, sz = (gd - inset * 2) / gd;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) { pos.setX(i, pos.getX(i) * sx); pos.setZ(i, pos.getZ(i) * sz); }
      geo.computeVertexNormals();
      geoCache.set(ck, geo);
    }
    const col = k.colors[key.role] || k.colors.alpha;
    const side = M(col, { r: k.gloss ? 0.3 : 0.75 });
    const legend = key.l;
    const tex = canvasTex(Math.min(512, 96 * key.w), Math.min(192, 96 * key.h), (x, w, h) => {
      x.fillStyle = col; x.fillRect(0, 0, w, h);
      if (!legend) return;
      const lum = (c) => new THREE.Color(c).getHSL({}).l;
      let lc = k.colors.legend;
      if (Math.abs(lum(lc) - lum(col)) < 0.3) lc = Math.abs(lum(k.colors.accent) - lum(col)) > 0.3 ? k.colors.accent : lum(col) > 0.5 ? '#222' : '#eee';
      x.fillStyle = lc;
      const big = legend.length === 1;
      x.font = `500 ${big ? 34 : 20}px 'IBM Plex Sans', system-ui, sans-serif`;
      x.textAlign = big ? 'center' : 'left';
      x.textBaseline = big ? 'middle' : 'top';
      if (big) x.fillText(legend, w / 2, h / 2); else x.fillText(legend, 20, 20);
    });
    const top = M('#fff', { r: k.gloss ? 0.3 : 0.75, x: { map: tex } });
    const cap = new THREE.Mesh(geo, [side, side, top, side, side, side]);
    cap.castShadow = true; cap.receiveShadow = true;
    const kg = new THREE.Group();
    const sculpt = [0.1, 0.05, 0, -0.06, -0.11, -0.14][key.row] ?? 0;
    const lift = [0.02, 0, 0, 0.03, 0.07, 0.1][key.row] ?? 0;
    const baseY = plateY + (low ? 0.12 : 0.34) + capH / 2 + lift * k.sculpt;
    kg.position.set(cx, baseY, cz);
    cap.rotation.x = sculpt * k.sculpt * 0.8;
    kg.add(cap);
    g.add(kg);
    const obj = { kg, baseY, down: false, key, big: key.w >= 2 };
    cap.userData.keyObj = obj;
    if (interactive) {
      keyObjs.push(obj);
      for (const c of key.codes) { if (!keyByCode.has(c)) keyByCode.set(c, []); keyByCode.get(c).push(obj); }
    }
  }
  g.rotation.x = 0.07;
  return { group: g, width: cw, depth: cd };
}

// ---------- Setup ----------
let wallpaper;
function monitor(m) {
  const g = new THREE.Group();
  const diag = m.inch * 0.254, a = m.ratio || 16 / 9;
  const sw = diag * a / Math.hypot(a, 1), sh = diag / Math.hypot(a, 1);
  const light = m.color && new THREE.Color(m.color).getHSL({}).l > 0.5;
  const body = M(light ? m.color : '#16171a', { r: 0.4, m: 0.4 });
  const y0 = 1.2 + sh / 2;
  g.add(rbox(sw + 0.12, sh + 0.12, 0.2, 0.04, body, 0, y0, 0));
  g.add(rbox(sw * 0.5, sh * 0.5, 0.2, 0.1, body, 0, y0, -0.18));
  const scr = mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: wallpaper, toneMapped: false }), 0, y0, 0.101);
  g.add(scr);
  g.add(box(0.5, y0, 0.18, body, 0, y0 / 2, -0.35));
  g.add(rbox(2.2, 0.08, 1.6, 0.04, body, 0, 0.04, -0.2));
  return { g, sw, sh, top: y0 + sh / 2 };
}

function makeWallpaper() {
  return canvasTex(1024, 576, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#1a1340'); gr.addColorStop(0.55, '#5b2a86'); gr.addColorStop(1, '#ff7a59');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(255,255,255,${0.03 + i * 0.01})`; x.beginPath(); x.arc(w * 0.7, h * 1.1, 200 + i * 90, 0, 7); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,.85)'; x.font = "700 64px 'IBM Plex Sans', system-ui"; x.fillText('NKZS', 64, h - 80);
  });
}

function buildSetup(s) {
  const g = new THREE.Group();
  const deskY = 7.5, dw = 16, dd = 7, dz = -1.8;
  g.add(box(dw, 0.35, dd, M('#6e4b2e', { r: 0.6 }), 0, deskY - 0.175, dz));
  const leg = M('#1a1a1c', { m: 0.6, r: 0.4 });
  for (const sx of [-1, 1]) {
    g.add(box(0.5, deskY - 0.35, 0.5, leg, sx * (dw / 2 - 0.8), (deskY - 0.35) / 2, dz));
    g.add(box(0.6, 0.15, dd - 1, leg, sx * (dw / 2 - 0.8), 0.075, dz));
  }
  // Monitore
  const n = s.monitorQty || 1;
  let monTop = deskY + 5;
  if (s.monitor) {
    const probe = monitor(s.monitor);
    const gap = 0.3, total = n * probe.sw + (n - 1) * gap;
    for (let i = 0; i < n; i++) {
      const mm = i === 0 ? probe : monitor(s.monitor);
      const off = -total / 2 + probe.sw / 2 + i * (probe.sw + gap);
      mm.g.position.set(off, deskY, dz - 1.6 + Math.abs(off) * 0.12);
      mm.g.rotation.y = -off * 0.04;
      g.add(mm.g);
      monTop = deskY + mm.top;
    }
    if (s.webcam) {
      const cam = new THREE.Group();
      cam.add(rbox(0.9, 0.3, 0.3, 0.1, M('#111', { r: 0.4 }), 0, 0, 0));
      const lens = mesh(new THREE.CircleGeometry(0.1, 24), M('#224', { m: 1, r: 0.1 }), 0, 0, 0.151);
      cam.add(lens);
      cam.position.set(n === 2 ? -(probe.sw + gap) / 2 : 0, monTop + 0.15, dz - 1.6 + 0.02);
      g.add(cam);
    }
  }
  // Mauspad, Tastatur, Maus
  let kbW = 3;
  if (s.kb) {
    const kb = buildKeyboard(s.kb, false);
    const sc = 0.1905;
    kb.group.scale.setScalar(sc);
    kbW = kb.width * sc;
    kb.group.position.set(-0.8, deskY + 0.03, 0.6);
    g.add(kb.group);
  }
  const mouseX = -0.8 + kbW / 2 + 1.6;
  if (s.mousepad) {
    const [pw, pd] = s.mousepad.size.map((v) => v / 100);
    const px = pw > 6 ? (-0.8 - kbW / 2 + mouseX + 1) / 2 : mouseX;
    g.add(rbox(pw, 0.03, pd, 0.012, M(s.mousepad.color, { r: 0.95 }), px, deskY + 0.015, 0.6));
  }
  if (s.mouse) {
    const mo = mesh(new THREE.SphereGeometry(1, 32, 16), M(s.mouse.color, { r: 0.35 }), mouseX, deskY + 0.08, 0.7);
    mo.scale.set(0.33, 0.2, 0.62);
    g.add(mo);
  }
  // Headset auf Ständer
  if (s.headset) {
    const hs = new THREE.Group();
    const hm = M(s.headset.color, { r: 0.5 }), am = M(s.headset.accent || '#555', { r: 0.5, m: 0.4 });
    hs.add(mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.1, 32), M('#1a1a1c'), 0, 0.05, 0));
    hs.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 12), M('#1a1a1c'), 0, 1.3, 0));
    const band = mesh(new THREE.TorusGeometry(0.85, 0.1, 12, 32, Math.PI), hm, 0, 2.2, 0);
    hs.add(band);
    for (const sx of [-1, 1]) {
      const cup = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 32), hm, sx * 0.9, 1.95, 0);
      cup.rotation.z = Math.PI / 2; hs.add(cup);
      const ring = mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 32), am, sx * 1.08, 1.95, 0);
      ring.rotation.y = Math.PI / 2; hs.add(ring);
    }
    hs.position.set(-dw / 2 + 1.4, deskY, dz - 1.4);
    hs.rotation.y = 0.5;
    g.add(hs);
  }
  // Mini-PC oder Tower
  if (s.minipc) {
    const [w, h, d] = s.minipc.dims.map((v) => v / 100);
    const mp = new THREE.Group();
    const mat = M(s.minipc.color, { m: s.minipc.shape === 'mac' ? 0.85 : 0.3, r: s.minipc.shape === 'mac' ? 0.3 : 0.55 });
    mp.add(rbox(w, h, d, s.minipc.shape === 'mac' ? 0.25 : 0.06, mat, 0, h / 2, 0));
    mp.add(box(0.05, 0.05, 0.01, new THREE.MeshBasicMaterial({ color: 0x9cf29c }), w * 0.35, h * 0.5, d / 2 + 0.005));
    mp.position.set(dw / 2 - 2.6, deskY, dz - 0.8);
    mp.rotation.y = -0.3;
    g.add(mp);
  }
  if (s.pc) {
    const pc = buildPC(s.pc);
    if (pc.H < 3) { pc.group.position.set(dw / 2 - 2.2, deskY + 0.08, dz - 1.2); pc.group.rotation.y = -0.35; }
    else { pc.group.position.set(dw / 2 + pc.D / 2 + 0.6, 0.08, dz + 0.4); pc.group.rotation.y = -0.25; }
    g.add(pc.group);
  }
  // Wand + Boden
  const wallCol = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--viewport-floor').trim() || '#d3d8dc').offsetHSL(0, 0, -0.04);
  g.add(box(40, 20, 0.2, M(wallCol, { r: 0.9 }), 0, 10, dz - dd / 2 - 0.2));
  const strip = box(dw - 1, 0.06, 0.06, rgbMat(0), 0, deskY - 0.4, dz - dd / 2 + 0.2);
  g.add(strip);
  return g;
}

// ---------- Szene / Loop ----------
export function init(container) {
  el = container;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  scene.background = new THREE.Color('#e3e6e9');
  scene.fog = new THREE.Fog('#e3e6e9', 60, 140);

  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;

  scene.add(new THREE.HemisphereLight(0xdde4ff, 0x20170f, 0.6));
  sun = new THREE.DirectionalLight(0xfff2e0, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 0.8);
  rim.position.set(-10, 8, -10);
  scene.add(rim);

  floor = mesh(new THREE.CircleGeometry(80, 64), M('#d3d8dc', { r: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  scene.add(floor);

  root = new THREE.Group();
  scene.add(root);
  wallpaper = makeWallpaper();

  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new ResizeObserver(resize).observe(el);
  resize();
  renderer.domElement.addEventListener('pointerdown', onPointer);
  window.addEventListener('pointerup', releaseAll);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  renderer.setAnimationLoop(tick);
}

// Hintergrund & Boden folgen dem hellen/dunklen Design (CSS-Variablen)
function applyTheme() {
  const css = getComputedStyle(document.documentElement);
  const bg = css.getPropertyValue('--viewport').trim() || '#e3e6e9';
  const fl = css.getPropertyValue('--viewport-floor').trim() || '#d3d8dc';
  scene.background.set(bg);
  scene.fog.color.set(bg);
  floor.material.color.set(fl);
}

function resize() {
  const w = el.clientWidth, h = el.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function clear() {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); });
  });
  root.clear();
  spinners = []; rgbMats = []; keyObjs = []; keyByCode = new Map();
}

function fitDist(w, h) {
  const t = Math.tan((camera.fov * Math.PI) / 360);
  const portrait = camera.aspect < 1 ? 1.1 : 1; // Handy hochkant: mehr Rand, Schrägansicht wirkt vorne breiter
  return Math.max(h / 2 / t, (w * portrait) / 2 / (t * camera.aspect));
}

function frame(target, pos, shadow) {
  controls.target.copy(target);
  camera.position.copy(pos);
  sun.position.set(target.x + shadow, target.y + shadow * 1.6, target.z + shadow * 0.8);
  sun.target.position.copy(target);
  const c = sun.shadow.camera;
  c.left = c.bottom = -shadow * 1.2; c.right = c.top = shadow * 1.2; c.near = 0.5; c.far = shadow * 5;
  c.updateProjectionMatrix();
  controls.update();
}

// data: { mode, pc, kb, setup }, keepCam: Kamera behalten wenn nur Details geändert
export function show(data, keepCam = false) {
  resize(); // Seitenverhältnis aktualisieren, falls die Ansicht gerade erst sichtbar wurde (Handy-Tabs)
  const prevMode = mode;
  mode = data.mode;
  clear();
  const keep = keepCam && prevMode === mode;
  const camPos = camera.position.clone(), tgt = controls.target.clone();
  floor.visible = true;
  if (mode === 'pc') {
    const r = buildPC(data.pc || {});
    root.add(r.group);
    const s = Math.max(r.H, r.D);
    const tg = new THREE.Vector3(0, r.H / 2, 0);
    frame(tg, tg.clone().add(new THREE.Vector3(0.5, 0.35, 1).normalize().multiplyScalar(fitDist(Math.max(r.D, r.W) * 1.9, r.H * 1.6))), s * 1.4);
  } else if (mode === 'kb') {
    kbSound = data.kb.sound;
    const r = buildKeyboard(data.kb, true);
    root.add(r.group);
    const s = r.width;
    const tg = new THREE.Vector3(0, 0.4, 0.3);
    frame(tg, tg.clone().add(new THREE.Vector3(0, 1, 1.05).normalize().multiplyScalar(fitDist(s * 1.2, r.depth * 2.4))), s * 0.8);
  } else if (mode === 'setup') {
    root.add(buildSetup(data.setup));
    const wide = !!data.setup.pc && !data.setup.minipc;
    const tg = new THREE.Vector3(wide ? 2.2 : 0.3, 7.6, -1.5);
    frame(tg, tg.clone().add(new THREE.Vector3(0.2, 0.34, 1).normalize().multiplyScalar(fitDist(wide ? 27 : 21, 14))), 16);
  }
  if (keep) { camera.position.copy(camPos); controls.target.copy(tgt); controls.update(); }
}

export function setOpts(o) { Object.assign(opts, o); controls.autoRotate = opts.autoRotate; controls.autoRotateSpeed = 1.2; }

export function snapshot() {
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/jpeg', 0.88);
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  for (const s of spinners) s.rotation.z += dt * 9;
  for (const m of rgbMats) {
    if (opts.rgb) { m.emissive.setHSL((t * 0.08 + m.userData.hueOffset) % 1, 0.9, 0.55); m.emissiveIntensity = 2.2; }
    else { m.emissive.setRGB(0, 0, 0); }
  }
  for (const k of keyObjs) {
    const target = k.baseY - (k.down ? 0.16 : 0);
    k.kg.position.y += (target - k.kg.position.y) * Math.min(1, dt * 40);
  }
  controls.update();
  renderer.render(scene, camera);
}

// ---------- Tipp-Simulator ----------
function press(obj, down) {
  if (obj.down === down) return;
  obj.down = down;
  if (opts.sound && kbSound) playKey(kbSound, down, obj.big);
}
function onKey(e) {
  if (mode !== 'kb') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.metaKey && e.type === 'keydown' && e.code !== 'MetaLeft' && e.code !== 'MetaRight') return;
  const list = keyByCode.get(e.code);
  if (!list) return;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Slash', 'Quote', 'Enter'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  const down = e.type === 'keydown';
  list.forEach((o) => press(o, down));
  if (down && onTyped) onTyped(e);
}
let pointerKey = null;
function onPointer(e) {
  if (mode !== 'kb') return;
  const r = renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(v, camera);
  const hit = raycaster.intersectObjects(keyObjs.map((k) => k.kg), true)[0];
  if (hit) {
    let o = hit.object;
    while (o && !o.userData.keyObj) o = o.parent;
    if (o) { pointerKey = o.userData.keyObj; press(pointerKey, true); controls.enabled = false; }
  }
}
function releaseAll() {
  if (pointerKey) { press(pointerKey, false); pointerKey = null; }
  controls.enabled = true;
}
