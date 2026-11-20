// The office in 3D, now just the manager's office: a small building on a garden island, seen from above at an
// angle. The orchestras that are working are listed on the left (a face and a name). When the manager writes to an
// orchestra, gets a result back or receives a question, he phones it; its person walks in from the garden gate,
// sits across his desk, and the two talk in speech bubbles with the letters' own words, then walks out again.
// The sun, the sky, clouds and rain follow the real time and weather where the phone is (WX).
// Reads the page's globals: STATE, ACT, CHATS, WX, focusId, cur, stored, stateOf, progs, pendingDel, drawCol, tab.

import * as THREE from './vendor/three.module.js';

const $ = id => document.getElementById(id), stage = $('stage'), dark = matchMedia('(prefers-color-scheme:dark)').matches;
const cv = document.createElement('canvas'); cv.id = 'cv3'; stage.insertBefore(cv, $('cv').nextSibling);
const LB = document.createElement('div'); LB.id = 'lb3'; stage.insertBefore(LB, cv.nextSibling);
const R = new THREE.WebGLRenderer({canvas:cv, antialias:true, alpha:true, powerPreference:'low-power'});
R.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(), V = 30, camera = new THREE.OrthographicCamera(-V / 2, V / 2, V / 2, -V / 2, -200, 400);
const COL = {work:'#3f9d74', ready:'#3f73a8', ask:'#d2553d', wait:'#d39a2f', sleep:'#98a0ae', mail:'#c79a2b', link:'#8a6fc2'};
const GC = ['#d9b98a', '#a9c7a4', '#a7bfd8', '#e0b3a8', '#c5b7dc', '#d8d3a0'];
const hsh = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const C = c => new THREE.Color(c);

// ---- lights
const hemi = new THREE.HemisphereLight(0xdfefff, 0x6b7f4a, 1.1), sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536); sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.06; scene.add(hemi, sun, sun.target);

// ---- geometry baking: static things become one mesh with vertex colours (one draw call), glowing bits another
const MSOLID = new THREE.MeshLambertMaterial({vertexColors:true}), MGLOW = new THREE.MeshBasicMaterial({vertexColors:true});
function Baker() { const parts = []; return {
  add(geo, color, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) { const g = geo.index ? geo.toNonIndexed() : geo.clone(), m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m); const n = g.attributes.position.count, c = C(color), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); parts.push(g); },
  box(w, h, d, color, x, y, z, ry = 0) { this.add(BOX, color, x, y + h / 2, z, ry, w, h, d); },
  mesh(mat) { if (!parts.length) return new THREE.Group(); let n = 0; for (const p of parts) n += p.attributes.position.count; const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const p of parts) { if (!p.attributes.normal) p.computeVertexNormals(); pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); col.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; p.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeBoundingSphere(); return new THREE.Mesh(g, mat); } }; }
const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(.5, .5, 1, 7), CONE = new THREE.ConeGeometry(.5, 1, 7), ICO = new THREE.IcosahedronGeometry(.5, 0), DOD = new THREE.DodecahedronGeometry(.5, 0), SPH = new THREE.SphereGeometry(.5, 8, 6);

// ---- people: one baked mesh each (legs, body, arms, head, hair), so many of them stay cheap
const SKIN = ['#f3cfa6', '#e2b084', '#c88d62', '#9a6342'], HAIR = ['#2a2019', '#56371f', '#9b6229', '#d6ad66', '#25304d', '#7c3030', '#cfcfcf'], PANTS = ['#2f3447', '#3b3a36', '#24384a', '#40303a'];
function person(shirt, seed, scale = 1, seated = true) { const b = Baker(), sk = SKIN[seed % 4], hr = HAIR[(seed >> 3) % 7], pt = PANTS[(seed >> 6) % 4], long = (seed >> 9) % 3 === 0;
  if (seated) { b.box(.42, .16, .5, pt, 0, .44, .18); b.box(.16, .45, .16, pt, -.11, 0, .4); b.box(.16, .45, .16, pt, .11, 0, .4); }
  else { b.box(.16, .5, .16, pt, -.11, 0, 0); b.box(.16, .5, .16, pt, .11, 0, 0); }
  const y0 = seated ? .55 : .5; b.add(new THREE.CapsuleGeometry(.24, .3, 3, 8), shirt, 0, y0 + .32, 0); b.box(.12, .42, .12, shirt, -.32, y0 + .12, seated ? .14 : 0); b.box(.12, .42, .12, shirt, .32, y0 + .12, seated ? .14 : 0);
  b.add(SPH, sk, 0, y0 + .86, 0, 0, .46, .46, .44); b.add(SPH, hr, 0, y0 + .95, -.03, 0, .5, .32, .5); if (long) b.box(.46, .4, .14, hr, 0, y0 + .62, -.2);
  b.box(.05, .06, .02, '#222', -.09, y0 + .88, .22); b.box(.05, .06, .02, '#222', .09, y0 + .88, .22);
  const m = b.mesh(MSOLID); m.castShadow = true; m.scale.setScalar(scale); return m; }

// ---- signs above heads: little canvas sprites
const SIGNS = {}; function sign(glyph, color) { const k = glyph + color; if (!SIGNS[k]) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.strokeStyle = color; x.lineWidth = 5; x.beginPath(); x.roundRect(6, 4, 52, 46, 9); x.fill(); x.stroke(); x.beginPath(); x.moveTo(24, 50); x.lineTo(32, 60); x.lineTo(40, 50); x.fill();
    x.fillStyle = color; x.font = '700 32px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(glyph, 32, 28); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; SIGNS[k] = new THREE.SpriteMaterial({map:t, depthTest:false}); }
  const s = new THREE.Sprite(SIGNS[k]); s.scale.set(.75, .75, 1); s.renderOrder = 5; return s; }

// ---- the world: the island, the manager's office building, the garden
const G = 1.4, W = 18, D = 10.5;
let off = null, visit = null, world = null, orchs = [], byId = {}, isle = null, boss = {x:0, z:0}, ent = 0, labels = [], sig = '', lamps = [], clouds = [], rain = null, pond = null, callL = null;
function build(s) {
  if (world) return false; world = new THREE.Group(); scene.add(world); LB.textContent = ''; labels = []; lamps = [];
  const S = Baker(), L = Baker();                                     // solid and glowing
  const mx = 11, mz0 = 9, mz1 = 16, iw = W + 2 * mx, id = D + mz0 + mz1; isle = {x0:-mx, z0:-mz0, x1:W + mx, z1:D + mz1};
  const sh = new THREE.Shape(), r = 5, ix = -mx, iz = -mz0; sh.moveTo(ix + r, iz); sh.lineTo(ix + iw - r, iz); sh.quadraticCurveTo(ix + iw, iz, ix + iw, iz + r); sh.lineTo(ix + iw, iz + id - r); sh.quadraticCurveTo(ix + iw, iz + id, ix + iw - r, iz + id); sh.lineTo(ix + r, iz + id); sh.quadraticCurveTo(ix, iz + id, ix, iz + id - r); sh.lineTo(ix, iz + r); sh.quadraticCurveTo(ix, iz, ix + r, iz);
  const grass = new THREE.ExtrudeGeometry(sh, {depth:.5, bevelEnabled:false, curveSegments:4}); grass.rotateX(Math.PI / 2); S.add(grass, '#86bf5e', 0, 0, 0);
  const soil = new THREE.ExtrudeGeometry(sh, {depth:2.6, bevelEnabled:false, curveSegments:4}); soil.rotateX(Math.PI / 2); S.add(soil, '#8a6243', 0, -.5, 0); S.add(soil, '#6f5038', 0, -2.4, 0, 0, 1, .35, 1);
  // the building: a stone base, an outer back wall, the office inside
  S.box(W + 1, .34, D + 1, '#cdbb98', W / 2, 0, D / 2); S.box(W + .2, 2.7, .3, '#efe6d4', W / 2, .3, -.15); S.box(W + .4, .14, .4, '#c9b48d', W / 2, 3.0, -.15);
  managerOffice(S, L); ent = W / 2 + 1.7;
  callL = addLabel('call', '', boss.x, 3.4, boss.z - 1.1, 'tag'); addLabel('room', 'Phòng tổng quản', W * .3, 3, D, 'tag');
  // garden: an arch and a stone path from the gate, a pond with a bench, flower beds, trees, palms, rocks, lamps
  for (let z = D + 1; z < isle.z1 - 1; z += 1.1) S.add(CYL, '#d9c7a3', ent + Math.sin(z * .7) * .4, .02, z, z, 1.1, .06, .8);
  for (const sx of [-1.1, 1.1]) S.box(.3, 2.6, .3, '#7d5f43', ent + sx, 0, isle.z1 - 2.2); S.box(2.7, .3, .4, '#7d5f43', ent, 2.6, isle.z1 - 2.2); S.box(2.2, .25, .3, '#3f73a8', ent, 2.28, isle.z1 - 2.15);
  for (let x = .6; x < W / 2 - .4; x += .6) { S.box(.5, .3, .6, '#8a6243', x, .34, D + .7); S.add(SPH, ['#f4d35e', '#ef8fa8', '#e85d5d', '#ffffff', '#b48ef0'][Math.floor(x * 7) % 5], x, .75, D + .7, 0, .28, .22, .28); }
  pond = {x:-mx * .45, z:D + mz1 * .45}; S.add(CYL, '#6f8f6a', pond.x, -.02, pond.z, 0, 6, .06, 4); const water = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, .05, 20), new THREE.MeshLambertMaterial({color:0x6fb2d6, transparent:true, opacity:.88}));
  water.scale.set(1, 1, .64); water.position.set(pond.x, .03, pond.z); water.receiveShadow = true; world.add(water); pond.mesh = water; for (let j = 0; j < 3; j++) S.add(CYL, '#4f9a45', pond.x - 1 + j * .9, .07, pond.z + (j % 2 ? .5 : -.4), 0, .5, .02, .5);
  const bx = pond.x + 3.6, bz = pond.z - 2.4; S.box(2, .1, .6, '#9a7350', bx, .5, bz); S.box(2, .5, .1, '#9a7350', bx, .55, bz - .3); for (const lx of [-.8, .8]) S.box(.1, .5, .5, '#3a3f4a', bx + lx, 0, bz);
  let rs = 11; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647, free = (x, z, m = 1) => !(x > -1 - m && x < W + 1 + m && z > -1 - m && z < D + 1.4 + m) && Math.hypot(x - pond.x, (z - pond.z) * 1.5) > 4 && Math.hypot(x - bx, z - bz) > 2 && (z < D || Math.abs(x - ent) > 1.8);
  const trees = []; for (let t = 0; t < 900 && trees.length < 44; t++) { const x = isle.x0 + 1.2 + rnd() * (iw - 2.4), z = isle.z0 + 1.2 + rnd() * (id - 2.4); if (!free(x, z, 1.3) || trees.some(o => Math.hypot(o.x - x, o.z - z) < 2.4)) continue; trees.push({x, z}); }
  for (const t of trees) { const k = rnd(); if (k < .38) treeAt(S, t.x, t.z, .9 + rnd() * .5, rnd()); else if (k < .6) pineAt(S, t.x, t.z, .9 + rnd() * .5); else if (k < .85) palmAt(S, t.x, t.z, 1 + rnd() * .3, rnd()); else bushAt(S, t.x, t.z, rnd()); }
  for (let t = 0; t < 160; t++) { const x = isle.x0 + .8 + rnd() * (iw - 1.6), z = isle.z0 + .8 + rnd() * (id - 1.6); if (!free(x, z, .6)) continue; const k = rnd();
    if (k < .5) S.add(CONE, '#6fa64c', x, .12, z, rnd() * 6, .18, .35, .18); else if (k < .8) { S.box(.08, .25, .08, '#4f8a3a', x, 0, z); S.add(SPH, ['#f4d35e', '#ef8fa8', '#ffffff', '#e85d5d', '#b48ef0'][Math.floor(rnd() * 5)], x, .3, z, 0, .2, .16, .2); } else S.add(DOD, '#9aa0a2', x, .1, z, rnd() * 6, .5 + rnd() * .5, .35, .45); }
  for (const [x, z] of [[ent - 1.7, D + 4], [ent + 1.7, D + 10], [-mx * .55, D * .3], [W + mx * .5, D * .4]]) { S.box(.12, 2.2, .12, '#4b4f58', x, 0, z); S.box(.3, .1, .3, '#4b4f58', x, 2.2, z); L.add(SPH, '#fff0c8', x, 2.42, z, 0, .32, .32, .32); lamps.push({x, z, r:2.6, post:true}); }
  const solid = S.mesh(MSOLID); solid.castShadow = solid.receiveShadow = true; world.add(solid); world.add(L.mesh(MGLOW));
  for (const l of lamps) { const m = new THREE.Mesh(new THREE.PlaneGeometry(l.r * 2.4, l.r * 2.4), new THREE.MeshBasicMaterial({map:poolTex(), color:0xffc070, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-4})); m.rotation.x = -Math.PI / 2; m.position.set(l.x, .46, l.z); m.renderOrder = 2; world.add(m); l.pool = m; }
  clouds = []; for (let i = 0; i < 9; i++) { const b = Baker(); for (let j = 0; j < 5; j++) b.add(ICO, '#ffffff', (j - 2) * 1.1, Math.sin(j * 2.1) * .4, Math.cos(j * 1.7) * .7, j, 1.6 + (j % 2) * .6, 1.2 + (j % 3) * .3, 1.4);
    const m = b.mesh(new THREE.MeshLambertMaterial({vertexColors:true, transparent:true, opacity:.95})); m.castShadow = true; m.userData = {sp:.4 + (i % 3) * .25, z:isle.z0 - 14 + (i * 5.3) % 12, y:9 + (i % 3) * 2.5, off:i * 13.7}; world.add(m); clouds.push(m); }
  const N = 900, rp = new Float32Array(N * 6); rain = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color:0xdde8f6, transparent:true, opacity:.55}));
  rain.geometry.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rain.userData.d = Array.from({length:N}, () => ({x:isle.x0 + Math.random() * iw, z:isle.z0 + Math.random() * id, y:Math.random() * 16})); rain.frustumCulled = false; world.add(rain);
  const sc = sun.shadow.camera, half = Math.max(iw, id) * .62; sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 160; sc.updateProjectionMatrix();
  boss.m = person('#2f4f7a', 77, 1.05); boss.m.position.set(boss.x, .34, boss.z - 1.1); world.add(boss.m);
  phoneS = sign('☎', COL.ready); phoneS.visible = false; world.add(phoneS); return true; }

let PT = null; function poolTex() { if (PT) return PT; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 2, 64, 64, 63); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.45, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return PT = new THREE.CanvasTexture(c); }
function shade(c, k) { const x = C(c); x.multiplyScalar(k); return '#' + x.getHexString(); }
const GLASS = new THREE.MeshLambertMaterial({color:0xcfe6f2, transparent:true, opacity:.28, depthWrite:false});
function managerOffice(S, L) { const x1 = W, x0 = 0, z0 = 0, z1 = D, cx = (x0 + x1) / 2; off = {x0, x1, z0, z1};
  const bx = x0 + (x1 - x0) * .58, bz = z0 + 3.6; boss = {x:bx, z:bz}; visit = {x:bx - .95, z:bz + 2.05};
  S.box(x1 - x0, .05, z1 - z0, '#5a4433', cx, .34, (z0 + z1) / 2); for (let x = x0 + .6; x < x1; x += 1.2) S.box(.03, .052, z1 - z0, '#4c3a2c', x, .34, (z0 + z1) / 2);
  S.box(6.4, .02, 4.4, '#e3c48c', bx, .38, bz + 1); S.box(5.9, .025, 3.9, '#8c2f39', bx, .385, bz + 1); S.box(4.6, .03, 2.6, '#a64452', bx, .39, bz + 1);
  // the feature wall: navy panel, window with the sky, dashboard, clock, frames, bookshelves
  S.box(x1 - x0, 2.6, .06, '#2f4858', cx, .3, z0 + .03); S.box(x1 - x0, .1, .1, '#c9a65a', cx, 2.86, z0 + .06);
  L.box(3.2, 1.3, .03, '#ffffff', bx, 1.25, z0 + .08); S.box(3.4, .1, .12, '#d9cdb5', bx, 1.2, z0 + .1); S.box(.08, 1.3, .08, '#d9cdb5', bx, 1.25, z0 + .1); S.box(3.4, .1, .12, '#d9cdb5', bx, 2.55, z0 + .1);
  S.box(2.4, 1.3, .06, '#16181d', x0 + 2.4, 1.2, z0 + .08); [['#3f9d74', .9], ['#3f73a8', .6], ['#d39a2f', 1.0], ['#d2553d', .4], ['#8a6fc2', .75]].forEach(([c, h], i) => L.box(.28, h * .9, .02, c, x0 + 1.55 + i * .42, 1.32, z0 + .12));
  L.box(1.9, .05, .02, '#7fd3ff', x0 + 2.4, 2.32, z0 + .12);
  S.add(CYL, '#f7f3ea', x1 - 2.2, 2.25, z0 + .1, 0, .7, .06, .7, Math.PI / 2); S.add(CYL, '#2b2f38', x1 - 2.2, 2.25, z0 + .07, 0, .76, .04, .76, Math.PI / 2); S.box(.04, .26, .02, '#222', x1 - 2.2, 2.25, z0 + .15); S.box(.2, .04, .02, '#222', x1 - 2.12, 2.25, z0 + .15);
  [[x1 - 4.2, '#e6d3a3'], [x1 - 3.4, '#a7c4d8']].forEach(([x, c]) => { S.box(.62, .8, .05, '#c9a65a', x, 1.3, z0 + .09); S.box(.5, .66, .02, c, x, 1.37, z0 + .12); });
  for (const sxx of [x0 + 4.6, x0 + 5.9]) { S.box(1.2, 2.3, .45, '#3b2a20', sxx, .36, z0 + .3); const B = ['#d2553d', '#3f73a8', '#d39a2f', '#3f9d74', '#e7dcc4', '#8a6fc2']; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) S.box(.22, .4 - ((r + c + Math.round(sxx)) % 3) * .06, .3, B[(r * 4 + c + Math.round(sxx)) % 6], sxx - .37 + c * .25, .48 + r * .54, z0 + .42); }
  // glass towards the hall, door gap at the front
  const glass = (x, z, w, d) => { const m = new THREE.Mesh(BOX, GLASS); m.scale.set(w, 2.4, d); m.position.set(x, 1.55, z); m.renderOrder = 3; world.add(m); };
  const gl = z1 - z0 - 2.3; glass(x0, z0 + gl / 2, .06, gl); for (let z = z0; z <= z0 + gl + .01; z += gl / 3) S.box(.1, 2.5, .1, '#3a3f4a', x0, .3, z); S.box(.12, .1, gl, '#3a3f4a', x0, 2.75, z0 + gl / 2);
  S.box(.1, 2.5, .1, '#3a3f4a', x0, .3, z1 - .05); S.box(.12, .1, 2.3, '#3a3f4a', x0, 2.75, z1 - 1.15);
  glass(x0 + (x1 - x0) * .25, z1, (x1 - x0) * .5, .05); S.box((x1 - x0) * .5, .1, .1, '#3a3f4a', x0 + (x1 - x0) * .25, .34, z1); S.box((x1 - x0) * .5, .08, .08, '#3a3f4a', x0 + (x1 - x0) * .25, 1.2, z1);
  S.box(.12, 2.6, z1 - z0, '#e7dcc6', x1 + .06, .3, (z0 + z1) / 2);
  // the desk: walnut top, modesty panel, a return on the right; monitors, lamp, phone, nameplate, papers, mug
  const dk = '#4a3426'; S.box(3.8, .12, 1.5, dk, bx, 1.0, bz); S.box(3.6, .66, .1, '#3a281d', bx, .34, bz + .62); S.box(.12, .66, 1.4, '#3a281d', bx - 1.8, .34, bz); S.box(1.3, .12, 2.1, dk, bx + 2.45, 1.0, bz - .3); S.box(1.2, .66, .1, '#3a281d', bx + 2.45, .34, bz + .72);
  S.box(3.8, .03, 1.5, '#5d4232', bx, 1.12, bz); S.box(1.6, .02, .7, '#2d4a3a', bx - .2, 1.14, bz + .2);
  for (const [mx, ry] of [[-.65, .35], [.65, -.35]]) { S.box(.12, .35, .12, '#222', bx + mx, 1.12, bz - .35); S.add(BOX, '#1d1f25', bx + mx, 1.7, bz - .4, ry, 1.15, .7, .06); L.add(BOX, '#9fd2ff', bx + mx + Math.sin(ry) * .04, 1.7, bz - .36, ry, 1.05, .6, .01); }
  S.add(CYL, '#c9a65a', bx - 1.5, 1.15, bz - .3, 0, .22, .06, .22); S.box(.04, .38, .04, '#c9a65a', bx - 1.5, 1.15, bz - .3); S.add(CYL, '#2e7d4f', bx - 1.5, 1.6, bz - .25, 0, .6, .18, .3, Math.PI / 2 * 0); L.box(.5, .04, .22, '#ffe7a8', bx - 1.5, 1.5, bz - .25); lamps.push({x:bx - 1.5, z:bz, r:1.8});
  S.box(.45, .12, .3, '#1f2228', bx + 1.25, 1.13, bz + .15); S.box(.42, .08, .12, '#2b2f38', bx + 1.25, 1.25, bz + .1); L.box(.12, .02, .08, '#7fe08f', bx + 1.35, 1.26, bz + .24);
  S.box(1.1, .2, .12, '#c9a65a', bx, 1.13, bz + .62); S.box(.5, .02, .7, '#f7f5ef', bx + .55, 1.14, bz + .35, .2); S.box(.5, .02, .7, '#ffffff', bx + .62, 1.16, bz + .32, .35); S.add(CYL, '#d2553d', bx - .9, 1.13, bz + .45, 0, .2, .22, .2);
  S.add(BOX, '#1f2228', bx + 2.45, 1.4, bz - .9, -.6, .9, .55, .05); L.add(BOX, '#b8f0c8', bx + 2.43, 1.4, bz - .87, -.6, .8, .45, .01);
  // the executive chair behind, two guest chairs in front
  S.box(1.0, .14, .95, '#1f2024', bx, .62, bz - 1.15); S.box(1.0, 1.25, .16, '#1f2024', bx, .7, bz - 1.65); S.box(.12, .3, .8, '#2a2b30', bx - .55, .76, bz - 1.15); S.box(.12, .3, .8, '#2a2b30', bx + .55, .76, bz - 1.15); S.add(CYL, '#555', bx, .34, bz - 1.15, 0, .14, .3, .14); S.add(CYL, '#444', bx, .36, bz - 1.15, 0, .8, .04, .8);
  for (const gx of [-.95, .95]) { const x = bx + gx, z = visit.z; S.box(.85, .14, .8, '#c89b6d', x, .6, z); S.box(.85, .7, .14, '#b5875a', x, .74, z + .38); S.box(.1, .3, .7, '#8a6447', x - .45, .7, z); S.box(.1, .3, .7, '#8a6447', x + .45, .7, z); for (const lx of [-.35, .35]) for (const lz of [-.3, .3]) S.box(.07, .28, .07, '#5a3d2a', x + lx, .34, z + lz); }
  // sofa corner with a coffee table, a floor lamp, a coffee bar, tall plants
  const sx0 = x1 - 2.4, sz0 = z1 - 1.6; S.box(3.6, .45, 1.1, '#5f7f8c', sx0 - .4, .36, sz0 + .55); S.box(3.6, .8, .3, '#55737f', sx0 - .4, .36, sz0 + 1.05); S.box(1.1, .45, 2.4, '#5f7f8c', x1 - .75, .36, sz0 - .7); S.box(.3, .8, 2.4, '#55737f', x1 - .45, .36, sz0 - .7);
  for (let i = 0; i < 3; i++) S.box(.9, .22, .7, '#6f93a1', sx0 - 1.4 + i * 1.05, .81, sz0 + .5); S.box(.5, .4, .14, '#e3c48c', sx0 - 1.6, .95, sz0 + .85, .2); S.box(.5, .4, .14, '#d2553d', x1 - .8, .95, sz0 - .3, 1.2);
  S.box(1.5, .06, .9, '#d9e8ee', sx0 - .9, .78, sz0 - 1.1); S.box(1.3, .4, .7, '#4a3426', sx0 - .9, .36, sz0 - 1.1); S.add(CYL, '#e8e2d4', sx0 - .7, .84, sz0 - 1.1, 0, .18, .3, .18); S.add(ICO, '#e85d5d', sx0 - .7, 1.08, sz0 - 1.1, 0, .22, .18, .22);
  S.box(.08, 2.1, .08, '#2b2f38', x1 - .6, .36, z1 - .45); S.add(CONE, '#efe3c8', x1 - .6, 2.55, z1 - .45, 0, .6, .45, .6); L.add(SPH, '#ffe1a0', x1 - .6, 2.35, z1 - .45, 0, .3, .22, .3); lamps.push({x:x1 - .9, z:z1 - 1.1, r:2.4});
  S.box(.7, 1.0, 2.4, '#3b2a20', x1 - .45, .36, z0 + 2.2); S.box(.75, .06, 2.5, '#c9a65a', x1 - .45, 1.36, z0 + 2.2); S.box(.45, .5, .4, '#1d1f25', x1 - .45, 1.4, z0 + 1.6); L.box(.06, .06, .02, '#ff5050', x1 - .66, 1.75, z0 + 1.6); S.add(CYL, '#ffffff', x1 - .45, 1.42, z0 + 2.3, 0, .14, .16, .14); S.add(CYL, '#3f73a8', x1 - .45, 1.42, z0 + 2.6, 0, .14, .16, .14);
  bigPlant(S, x0 + .8, z0 + .9); bigPlant(S, x1 - .8, z0 + 4.2); bigPlant(S, x0 + .9, z1 - 2.9);
  lamps.push({x:bx, z:bz + 1.2, r:3.4, office:true}); }
function bigPlant(S, x, z) { S.add(CYL, '#e8e2d4', x, .34 + .35, z, 0, .55, .7, .55); S.add(CYL, '#4a3426', x, .34 + .72, z, 0, .5, .04, .5); S.box(.06, 1.2, .06, '#5b3d26', x, 1.05, z);
  for (let i = 0; i < 9; i++) { const a = i * 2.4, h = 1.3 + i * .14; S.add(SPH, i % 2 ? '#3f8a3a' : '#5aa548', x + Math.cos(a) * .3, h, z + Math.sin(a) * .3, a, .42, .12, .3, .5, .3); } }
function plantAt(S, x, z, s) { S.add(CYL, '#b5563c', x, .34 + .25 * s, z, 0, .55 * s, .5 * s, .55 * s); for (let j = 0; j < 4; j++) S.add(ICO, j % 2 ? '#4f9a45' : '#6dbb57', x + Math.cos(j * 1.6) * .18 * s, .34 + (.75 + j * .12) * s, z + Math.sin(j * 1.6) * .18 * s, j, .55 * s, .6 * s, .55 * s); }
function shelfAt(S, x, z, seed) { S.box(1.5, 1.7, .5, '#7d5f43', x, .34, z); const B = ['#d2553d', '#3f73a8', '#d39a2f', '#3f9d74', '#8a6fc2', '#e7dcc4'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) S.box(.22, .38 - ((seed >> (c + r)) & 1) * .06, .3, B[(seed >> (r * 3 + c)) % 6], x - .5 + c * .25, .5 + r * .52, z + .14); }
function treeAt(S, x, z, s, v) { S.add(CYL, '#6b4a2e', x, .4 + .9 * s, z, 0, .32 * s, 1.8 * s, .32 * s); const g = ['#4f9a45', '#3f8a52', '#6a9d3a'][Math.floor(v * 3)];
  S.add(ICO, g, x, .5 + 2.3 * s, z, v * 6, 2.3 * s, 2.1 * s, 2.3 * s); S.add(ICO, shade(g, 1.15), x + .35 * s, .5 + 2.9 * s, z - .2 * s, v * 3, 1.5 * s, 1.4 * s, 1.5 * s); }
function pineAt(S, x, z, s) { S.add(CYL, '#5b3d26', x, .4 + .4 * s, z, 0, .26 * s, .8 * s, .26 * s); for (let k = 0; k < 3; k++) S.add(CONE, k % 2 ? '#2f7a5c' : '#3a8a66', x, .4 + (1.3 + k * .75) * s, z, k, (2 - k * .45) * s, 1.4 * s, (2 - k * .45) * s); }
function palmAt(S, x, z, s, v) { let px = x, py = .4, pz = z; const lean = (v - .5) * .5; for (let k = 0; k < 7; k++) { S.add(CYL, k % 2 ? '#8a6a45' : '#7a5c3a', px, py + .25 * s, pz, 0, .26 * s, .52 * s, .26 * s, 0, lean * k * .12); px += Math.sin(lean * k * .12) * -.5 * s; py += .5 * s; }
  for (let j = 0; j < 7; j++) { const a = j / 7 * Math.PI * 2 + v; S.add(BOX, j % 2 ? '#5fae4a' : '#4f9a45', px + Math.cos(a) * .8 * s, py - .15 * s, pz + Math.sin(a) * .8 * s, -a, 1.7 * s, .06, .42 * s, 0, -.45); }
  S.add(SPH, '#6b4f27', px + .15, py - .2, pz + .1, 0, .26, .26, .26); S.add(SPH, '#5a4220', px - .15, py - .25, pz - .05, 0, .26, .26, .26); }
function bushAt(S, x, z, v) { for (let j = 0; j < 3; j++) S.add(ICO, j % 2 ? '#5f9e46' : '#4f8f3d', x + (j - 1) * .5, .5, z + Math.sin(j * 2) * .2, j + v, 1, .8, .9); if (v > .5) for (let j = 0; j < 4; j++) S.add(SPH, ['#f4d35e', '#ef8fa8', '#ffffff', '#e85d5d'][j], x - .6 + j * .4, .95, z + .3, 0, .14, .14, .14); }
function addLabel(key, text, x, y, z, kind) { const e = document.createElement('div'); e.className = 'l3 ' + kind; e.textContent = text; LB.append(e); const l = {key, e, p:new THREE.Vector3(x, y, z), kind}; labels.push(l); return l; }
const v3 = new THREE.Vector3();
const PRI = {tag:0, ask:1, work:2, mail:3, wait:4, ready:5, sleep:6, wing:7, box:8};
function placeLabels(zr) { const w = stage.clientWidth, h = stage.clientHeight, placed = [], near = zr > 1.9;
  for (const l of labels) { let show = !!l.e.textContent;
    let x = 0, y = 0; if (show) { v3.copy(l.p).project(camera); x = (v3.x + 1) / 2 * w; y = (1 - v3.y) / 2 * h; show = x > -60 && x < w + 60 && y > -10 && y < h + 40; }
    if (show && l.kind === 'room') { const full = near; if (l.full !== full) { l.full = full; l.e.classList.toggle('full', full); l.w = null; } }
    if (show) { if (l.on !== true) { l.e.style.display = ''; l.on = true; l.w = null; } if (l.w == null) { l.w = l.e.offsetWidth; l.h = l.e.offsetHeight; }
      const r = l.kind === 'wing' ? [x, y - l.h, x + l.w, y] : [x - l.w / 2, y - l.h, x + l.w / 2, y];
      if (placed.some(q => r[0] < q[2] + 3 && r[2] > q[0] - 3 && r[1] < q[3] + 2 && r[3] > q[1] - 2)) show = false; else placed.push(r); }
    if (!show) { if (l.on !== false) { l.e.style.display = 'none'; l.on = false; } continue; }
    l.e.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(' + (l.kind === 'wing' ? '0' : '-50%') + ',-100%)'; } }
const cam = {tx:0, tz:0, z:1, yaw:.38, pitch:.8}, goal = {}; let fitZ = 1, auto = true, touched = -1e9, moving = false;
try { auto = localStorage.getItem('dp-cam') !== '0'; } catch (e) {}
function aspect() { return stage.clientWidth / Math.max(1, stage.clientHeight); }
function applyCam() { const a = aspect(); camera.left = -V * a / 2; camera.right = V * a / 2; camera.top = V / 2; camera.bottom = -V / 2; camera.zoom = cam.z;
  const d = 60, cp = Math.cos(cam.pitch); camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * d, Math.sin(cam.pitch) * d, cam.tz + Math.cos(cam.yaw) * cp * d); camera.lookAt(cam.tx, 0, cam.tz); camera.updateProjectionMatrix(); }
function fit(x0, z0, x1, z1, yaw = cam.yaw) { const save = {...cam}; cam.yaw = yaw; cam.tx = (x0 + x1) / 2; cam.tz = (z0 + z1) / 2; cam.z = 1; applyCam(); camera.updateMatrixWorld();
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) for (const y of [0, 3]) { v3.set(x, y, z).project(camera); a = Math.min(a, v3.x); b = Math.max(b, v3.x); c = Math.min(c, v3.y); d = Math.max(d, v3.y); }
  const z = Math.min(2 / (b - a), 2 / (d - c)), out = {tx:cam.tx, tz:cam.tz, z, yaw}; Object.assign(cam, save); applyCam(); return out; }
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.4), hit = new THREE.Vector3();
function ground(px, py) { const r = cv.getBoundingClientRect(); ray.setFromCamera({x:(px / r.width) * 2 - 1, y:-(py / r.height) * 2 + 1}, camera); return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null; }
const pts = new Map(); let tap = null, pinch = null;
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x:e.offsetX, y:e.offsetY}); Object.keys(goal).forEach(k => delete goal[k]); touched = performance.now(); moving = true;
  if (pts.size === 1) tap = {x:e.offsetX, y:e.offsetY, t:performance.now()}; else { tap = null; const [a, b] = [...pts.values()]; pinch = {d:Math.hypot(a.x - b.x, a.y - b.y), z:cam.z, ang:Math.atan2(b.y - a.y, b.x - a.x), yaw:cam.yaw}; } });
cv.addEventListener('pointermove', e => { const p = pts.get(e.pointerId); if (!p) return; const px = p.x, py = p.y; p.x = e.offsetX; p.y = e.offsetY; touched = performance.now();
  if (pts.size === 1) { const a = ground(px, py), b = ground(p.x, p.y); if (a && b) { cam.tx -= b.x - a.x; cam.tz -= b.z - a.z; } if (tap && Math.hypot(e.offsetX - tap.x, e.offsetY - tap.y) > 9) tap = null; }
  else if (pinch) { const [a, b] = [...pts.values()]; cam.z = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; cam.yaw = pinch.yaw - (Math.atan2(b.y - a.y, b.x - a.x) - pinch.ang); }
  clampCam(); applyCam(); });
const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) moving = false;
  if (tap && performance.now() - tap.t < 400) { const g = ground(tap.x, tap.y); if (g) tapAt(g.x, g.z); } tap = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => { e.preventDefault(); touched = performance.now(); if (e.shiftKey) cam.yaw += e.deltaY * .002; else cam.z *= e.deltaY < 0 ? 1.12 : .89; clampCam(); applyCam(); }, {passive:false});

// ---- the working orchestras: one row each on the left, a drawn face and the name
const LIST = document.createElement('div'); LIST.id = 'act3'; stage.append(LIST);
const SKIN2 = SKIN, HAIR2 = HAIR, FACES = {};
function face(o) { const k = o.p.id + o.tint; if (FACES[k]) return FACES[k]; const c = document.createElement('canvas'); c.width = c.height = 56; const x = c.getContext('2d'), sd = o.seed;
  const sk = SKIN2[sd % 4], hr = HAIR2[(sd >> 3) % 7], long = (sd >> 9) % 3 === 0;
  x.fillStyle = shade(o.tint, 1.12); x.beginPath(); x.arc(28, 28, 28, 0, 7); x.fill();
  x.save(); x.beginPath(); x.arc(28, 28, 28, 0, 7); x.clip();
  if (long) { x.fillStyle = hr; x.beginPath(); x.roundRect(11, 16, 34, 30, 10); x.fill(); }
  x.fillStyle = o.tint === '#ffffff' ? '#ccc' : shade(o.tint, .8); x.beginPath(); x.ellipse(28, 58, 22, 16, 0, 0, 7); x.fill();
  x.fillStyle = sk; x.fillRect(24, 36, 8, 8); x.beginPath(); x.ellipse(28, 26, 13, 14, 0, 0, 7); x.fill();
  x.fillStyle = hr; x.beginPath(); x.ellipse(28, 17, 14.5, 8.5, 0, Math.PI, 2 * Math.PI); x.fill(); x.fillRect(13.5, 15, 29, 5); x.restore();
  x.fillStyle = '#222'; x.fillRect(21.5, 25, 3, 3.5); x.fillRect(31.5, 25, 3, 3.5); x.strokeStyle = '#7a3d2a'; x.lineWidth = 1.6; x.beginPath(); x.arc(28, 31, 4, .2 * Math.PI, .8 * Math.PI); x.stroke();
  return FACES[k] = c.toDataURL(); }
function drawList() { LIST.textContent = ''; const act = orchs.filter(o => o.st === 'work');
  if (!act.length) { const r = document.createElement('div'); r.className = 'ar none'; r.textContent = 'Chưa orchestra nào đang làm'; LIST.append(r); return; }
  for (const o of act) { const r = document.createElement('div'); r.className = 'ar' + (meet && meet.o === o ? ' meet' : '') + (focusId === o.p.id ? ' sel' : ''); const im = document.createElement('img'); im.src = face(o); im.alt = '';
    const nm = document.createElement('span'); nm.textContent = '@' + o.p.id; r.append(im, nm); r.onclick = () => focus(focusId === o.p.id ? null : o.p.id); LIST.append(r); } }
function focus(id) { focusId = byId[id] ? id : null; $('back').classList.toggle('on', !!focusId); drawList(); drawCol(); }
$('back').addEventListener('click', () => { if (VIEW3) { touched = -1e9; focus(null); } });
$('camb').addEventListener('click', () => { try { auto = localStorage.getItem('dp-cam') !== '0'; } catch (e) {} touched = -1e9; });
function overview() { const o = fit(-3.5, -2.5, W + 3.5, D + 6.5, .38); fitZ = o.z; return o; }
function officeView() { return fit(-.8, -4.5, W + .5, D + 1.5); }
function clampCam() { if (!isle) return; cam.z = Math.max(fitZ * .45, Math.min(fitZ * 5, cam.z)); cam.tx = Math.max(isle.x0, Math.min(isle.x1, cam.tx)); cam.tz = Math.max(isle.z0, Math.min(isle.z1, cam.tz)); }
function tapAt(x, z) { if (x > -.5 && x < W + .5 && z > -.5 && z < D + .5) { Object.assign(goal, officeView()); touched = performance.now(); return; } if (focusId) focus(null); }
function director(ms) { if (!auto || moving || ms - touched < 9000) return null;
  if (meet && meet.a) { const q = meet.a.g.position; return fit(q.x - 7, q.z - 6, q.x + 7, q.z + 6); }
  if (call || (meet && meet.ph === 'talk') || CHATS.busy) return officeView();
  return overview(); }

// ---- calls and meetings. Triggers: a new letter from the manager in a project's INBOX (he reads what he asked,
// the orchestra acknowledges), a letter marked done with a result (the orchestra reads the result line it wrote),
// a new open question (the orchestra asks, the manager takes it to anh Vinh). The words are the letters' own text;
// only the short acknowledgements are stock phrases.
const DOTM = new THREE.MeshBasicMaterial({color:0x5fd39a, depthTest:false, transparent:true}); let call = null, arc = null, phoneS = null, litNow = false;
let meetQ = [], meet = null, seenTalk = null; try { seenTalk = JSON.parse(localStorage.getItem('dp-talk') || 'null'); } catch (e) {}
function saveSeen() { try { localStorage.setItem('dp-talk', JSON.stringify(seenTalk)); } catch (e) {} }
function talkEvents() { const ev = [];
  for (const o of orchs) { const p = o.p;
    for (const m of p.talk || []) { if (m.status === 'done' && m.result) ev.push({o, key:p.id + m.id + 'done', t:m.t, lines:[['b', 'Việc ' + m.id + ' tới đâu rồi em?'], ['o', m.result], ['b', 'Tốt. Cảm ơn em.']]});
      else ev.push({o, key:p.id + m.id, t:m.t, lines:[['b', m.text], ['o', m.status === 'new' ? 'Dạ, em nhận thư ' + m.id + '.' : 'Dạ, em đang làm ' + m.id + '.']]}); }
    for (const q of p.questions || []) ev.push({o, key:p.id + q.id, t:q.asked || '', lines:[['o', 'Em hỏi ' + q.id + ': ' + q.text], ['b', 'Để anh chuyển anh Vinh trả lời.']]}); }
  return ev; }
function scheduleMeetings() { const ev = talkEvents();
  if (!seenTalk) { seenTalk = {}; ev.forEach(e => seenTalk[e.key] = 1); const last = ev.filter(e => e.t).sort((a, b) => a.t < b.t ? 1 : -1)[0]; if (last) delete seenTalk[last.key]; }
  for (const e of ev) if (!seenTalk[e.key] && !meetQ.some(m => m.key === e.key) && !(meet && meet.key === e.key)) { seenTalk[e.key] = 1; meetQ.push(e); }
  saveSeen(); }
function chunks(text, n = 120) { const out = []; let cur = ''; for (const w of String(text).split(/\s+/)) { if ((cur + ' ' + w).length > n && cur) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } if (cur) out.push(cur); return out.slice(0, 4).map((c, i, a) => i === a.length - 1 && a.length === 4 && String(text).length > 480 ? c + ' …' : c); }
const inPath = () => [{x:ent, z:isle.z1 - 1.4}, {x:ent, z:D + .8}, {x:ent, z:D - 1.1}, {x:visit.x, z:D - 1.1}, {x:visit.x, z:visit.z}];
function bubble(key, x, y, z) { const l = addLabel(key, '', x, y, z, 'say'); l.pri = -1; labels.unshift(labels.pop()); return l; }
function endCall() { if (callL) { callL.e.textContent = ''; } if (arc) { world.remove(arc); arc = null; } phoneS.visible = false; call = null; }
function meetTick(t, dt) {
  if (!meet && meetQ.length && !(ACT.game || {}).on) { const m = meetQ.shift(); meet = m; m.ph = 'call'; call = {t:0};
    const a = new THREE.Vector3(boss.x, 2.4, boss.z - 1.1), b = new THREE.Vector3(ent, 1.2, isle.z1 - 1.4), mid = a.clone().lerp(b, .5); mid.y += 8;
    arc = new THREE.Group(); arc.userData.curve = new THREE.QuadraticBezierCurve3(a, mid, b); for (let i = 0; i < 14; i++) { const d = new THREE.Mesh(SPH, DOTM); d.scale.setScalar(.32); d.renderOrder = 4; arc.add(d); } world.add(arc);
    callL.e.textContent = '☎ Tổng quản gọi @' + m.o.p.id + ' lên phòng'; callL.w = null; phoneS.position.set(boss.x + .55, 2.6, boss.z - 1.1); phoneS.visible = true; drawList(); }
  if (!meet) return; const m = meet, o = m.o;
  if (m.ph === 'call') { call.t += dt; const k = call.t; phoneS.position.y = 2.6 + Math.abs(Math.sin(k * 10)) * .12; arc.children.forEach((d, i) => { const u = ((i / 14) + k * .35) % 1; arc.userData.curve.getPoint(u, d.position); d.scale.setScalar(.2 + .2 * Math.sin(u * Math.PI)); });
    if (k < 3.2) return; endCall(); const g = new THREE.Group(), b = person(o.tint, o.seed, 1, false); g.add(b); world.add(g); m.a = {g, b, path:inPath(), d:0, dir:1}; m.ph = 'walk'; }
  if (m.ph === 'walk' || m.ph === 'back') { const a = m.a, L = plen(a.path); a.d = Math.max(0, Math.min(L, a.d + a.dir * 7 * dt)); const q = along(a.path, a.d); a.g.position.set(q.x, .34, q.z); a.g.rotation.y = Math.atan2(a.dir * q.dx, a.dir * q.dz); a.b.position.y = Math.abs(Math.sin(t * 11)) * .1;
    if (m.ph === 'walk' && a.d >= L) { world.remove(a.g); m.a = null; m.seat = person(o.tint, o.seed); m.seat.position.set(visit.x, .34, visit.z - .1); m.seat.rotation.y = Math.PI; world.add(m.seat);
      m.bo = bubble('say-b', boss.x, 3.0, boss.z - 1.1); m.bv = bubble('say-o', visit.x, 2.9, visit.z); m.bv.e.style.borderColor = shade(o.tint, .75); m.bo.e.classList.add('boss');
      m.lines2 = []; m.lines.forEach(([who, text]) => chunks(text).forEach(c => m.lines2.push([who, c]))); m.i = -1; m.t = 0; m.ph = 'talk'; }
    else if (m.ph === 'back' && a.d <= 0) { world.remove(a.g); meet = null; drawList(); } return; }
  if (m.ph === 'talk') { m.t -= dt; if (m.t > 0) { const sp = Math.abs(Math.sin(t * 12)) * .03; (m.lines2[m.i][0] === 'b' ? boss.m : m.seat).position.y = .34 + sp; return; }
    m.i++; if (m.i < m.lines2.length) { const [who, c] = m.lines2[m.i]; (who === 'b' ? m.bo : m.bv).e.textContent = c; (who === 'b' ? m.bv : m.bo).e.textContent = ''; m.bo.w = m.bv.w = null; m.t = 2.4 + c.length * .05; boss.m.position.y = m.seat.position.y = .34; return; }
    for (const l of [m.bo, m.bv]) { l.e.remove(); labels.splice(labels.indexOf(l), 1); } world.remove(m.seat); boss.m.position.y = .34;
    const g = new THREE.Group(), b = person(o.tint, o.seed, 1, false); g.add(b); world.add(g); m.a = {g, b, path:inPath(), d:plen(inPath()), dir:-1}; m.ph = 'back'; } }

// ---- state: who works, what the list shows, which meetings are due
function populate() { const s = STATE, gm = (ACT.game || {}).on, gi = Object.fromEntries(s.groups.map((x, i) => [x.id, i])), old = byId; byId = {};
  orchs = s.projects.filter(p => !stored(p)).map(p => { const o = old[p.id] || {seed:hsh(p.id)}; Object.assign(o, {p, tint:GC[gi[p.group] % GC.length], st:gm ? 'sleep' : stateOf(p)}); byId[p.id] = o; return o; });
  if (meet && !byId[meet.o.p.id]) meet.o = {p:meet.o.p, tint:meet.o.tint, seed:meet.o.seed};
  drawList(); scheduleMeetings(); }

function along(path, d) { for (let i = 1; i < path.length; i++) { const p = path[i - 1], q = path[i], l = Math.hypot(q.x - p.x, q.z - p.z); if (d <= l) return {x:p.x + (q.x - p.x) * d / l, z:p.z + (q.z - p.z) * d / l, dx:q.x - p.x, dz:q.z - p.z}; d -= l; } const e = path[path.length - 1]; return {x:e.x, z:e.z, dx:0, dz:0}; }
const plen = p => p.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - p[i].x, q.z - p[i].z), 0);
// ---- sky, sun and weather from the phone's clock and WX
const skyNow = () => { const d = new Date(), h = d.getHours() + d.getMinutes() / 60, w = WX.now(), grey = w.wet || w.kind === 'fog' || w.cloud > 80;
  const k = h >= w.rise + .6 && h < w.set - .6 ? 'day' : h >= w.set - .6 && h < w.set + .5 ? 'dusk' : h >= w.rise - .5 && h < w.rise + .6 ? 'dawn' : 'night';
  const P = {day:grey ? ['#8fa3b4', '#d3dce3'] : ['#6fb4e6', '#dff1fa'], dusk:grey ? ['#8b7f94', '#d9c3b2'] : ['#e0804e', '#f9d9a6'], dawn:['#d999a4', '#fbe6c6'], night:['#0c1128', grey ? '#262b3d' : '#2a3560']}[k];
  return {k, h, w, top:P[0], bot:P[1], u:(h - w.rise) / (w.set - w.rise), v:((h - w.set + 24) % 24) / (24 - w.set + w.rise)}; };
let skyKey = '', flash = 0;
function weather(t, dt) { const s = skyNow(), w = s.w, key = s.k + w.kind + Math.round(s.h * 20);
  if (key !== skyKey) { skyKey = key; cv.style.background = 'linear-gradient(' + s.top + ',' + s.bot + ' 70%)'; const night = s.k === 'night', low = s.k !== 'day';
    const u = Math.max(.02, Math.min(.98, night ? s.v : s.u)), az = Math.PI * (1 - u), el = (night ? .7 : 1.15) * Math.sin(Math.PI * u) + .12, cx = (isle.x0 + isle.x1) / 2, cz = (isle.z0 + isle.z1) / 2;
    sun.position.set(cx + Math.cos(az) * Math.cos(el) * 60, Math.sin(el) * 60, cz + Math.sin(az) * Math.cos(el) * 26 + 10); sun.target.position.set(cx, 0, cz);
    sun.castShadow = !night; sun.color.set(night ? '#c4ccf0' : low ? '#ffb27a' : '#fff2d8'); sun.intensity = (night ? .55 : low ? 1.4 : 2.3) * (w.wet || w.cloud > 85 ? .45 : 1);
    hemi.color.set(night ? '#b4b9d6' : '#dfefff'); hemi.groundColor.set(night ? '#5a5048' : '#6b7f4a'); hemi.intensity = night ? 1.45 : w.wet ? 1.25 : 1.05;
    const lit = night || s.k === 'dusk'; litNow = lit; MGLOW.color.set(lit ? '#ffd27a' : w.wet ? '#c7d3dc' : '#cfe8fb'); for (const l of lamps) l.pool.material.opacity = lit ? (l.post ? .5 : .35) : 0;
    scene.fog = w.kind === 'fog' ? new THREE.Fog(s.bot, 40, 110) : null; if (pond) pond.mesh.material.color.set(night ? '#2a4660' : w.wet ? '#7d9db0' : '#6fb2d6');
    const cc = night ? '#5a6280' : w.wet || w.cloud > 80 ? '#c9d0d8' : '#ffffff'; clouds.forEach(c => { c.material.color.set(cc); c.material.opacity = night ? .55 : .92; }); }
  const nc = Math.min(9, Math.round((w.cloud || 0) / 11) + (w.wet ? 2 : 0)), span = isle.x1 - isle.x0 + 30;
  clouds.forEach((c, i) => { c.visible = i < nc; if (!c.visible) return; const u = c.userData; c.position.set(isle.x0 - 15 + ((u.off + t * u.sp * (1 + (w.wind || 6) / 12)) % span), u.y, u.z); });
  const wet = w.wet || w.kind === 'snow'; rain.visible = wet; if (wet) { const a = rain.geometry.attributes.position.array, n = w.kind === 'drizzle' ? 350 : w.kind === 'snow' ? 300 : Math.min(900, 400 + (w.rain || 1) * 150), sp = w.kind === 'snow' ? 1.5 : 16, len = w.kind === 'snow' ? .12 : w.kind === 'drizzle' ? .35 : .7, wx = Math.min(.5, (w.wind || 6) / 40);
    rain.material.color.set(s.k === 'night' ? '#9fb0d0' : '#e6eef8'); rain.geometry.setDrawRange(0, n * 2);
    rain.userData.d.forEach((q, i) => { if (i >= n) return; q.y -= sp * dt; q.x += wx * sp * dt * .3; if (q.y < .3 || (q.y < 3.2 && q.x > -.3 && q.x < W + .3 && q.z > -.3 && q.z < D + .3)) { q.y = 14 + Math.random() * 4; q.x = isle.x0 + Math.random() * (isle.x1 - isle.x0); q.z = isle.z0 + Math.random() * (isle.z1 - isle.z0); }
      a.set([q.x, q.y, q.z, q.x - wx * len, q.y + len, q.z], i * 6); }); rain.geometry.attributes.position.needsUpdate = true; }
  if (w.kind === 'storm') { const ph = t % 9; flash = ph < .15 || (ph > .3 && ph < .36) ? 1 : 0; hemi.intensity = flash ? 3 : 1.25; } }

// ---- the loop
let VIEW3 = false, running = false, last = 0, zoomIn = false;
function frame(ms) { if (!running) return; requestAnimationFrame(frame); const wet = WX.now().wet, busy = moving || Object.keys(goal).length || meet || meetQ.length; if (ms - last < (busy || wet ? 30 : 60)) return; const dt = Math.min(.1, (ms - last) / 1000); last = ms; const t = ms / 1000;
  const dg = director(ms); if (dg) Object.assign(goal, dg); if (goal.z && !moving) { const a = 1 - Math.exp(-dt * 2.4); cam.tx += (goal.tx - cam.tx) * a; cam.tz += (goal.tz - cam.tz) * a; cam.z += (goal.z - cam.z) * a; cam.yaw += (goal.yaw - cam.yaw) * a; if (Math.abs(goal.z - cam.z) < .002 && Math.hypot(goal.tx - cam.tx, goal.tz - cam.tz) < .02) Object.keys(goal).forEach(k => delete goal[k]); applyCam(); }
  const zin = cam.z > fitZ * 1.6; if (zin !== zoomIn) { zoomIn = zin; stage.classList.toggle('zoomin', zin); }
  if (!(meet && meet.ph === 'talk')) { boss.m.position.y = .34 + (CHATS.busy ? Math.abs(Math.sin(t * 8)) * .05 : 0); boss.m.rotation.y = CHATS.busy ? Math.sin(t * 1.2) * .3 : Math.sin(t * .3) * .1; }
  meetTick(t, dt); weather(t, dt); placeLabels(cam.z / fitZ); R.render(scene, camera); }
function size() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return false; R.setSize(w, h, false); applyCam(); return true; }
function wake() { const on = VIEW3 && cur === 'office' && !document.hidden && STATE; if (on && !running) { if (!size()) return; if (!world) set(STATE); running = true; last = performance.now(); requestAnimationFrame(frame); } else if (!on) running = false; }
function set(s) { if (!s || !VIEW3) return; if (!stage.clientWidth) return; const fresh = build(s); populate(); if (fresh) { size(); const o = overview(); Object.assign(cam, o); clampCam(); applyCam(); skyKey = ''; } }
function show(on) { VIEW3 = on; stage.classList.toggle('v3', on); if (on) { set(STATE); wake(); } else { running = false; stage.classList.remove('zoomin'); } }
addEventListener('resize', () => { if (VIEW3 && size()) { overview(); } });
document.addEventListener('visibilitychange', wake);
window.O3D = {set, note() {}, boss() {}, focus, wake, sky() { skyKey = ''; }, show};
