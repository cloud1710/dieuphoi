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
function person(shirt, seed, scale = 1, seated = true) { const b = Baker(), sk = SKIN[seed % 4], hr = HAIR[(seed >>> 3) % 7], pt = PANTS[(seed >>> 6) % 4], long = (seed >>> 9) % 3 === 0;
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

// ---- the world: a tower on a garden island. The CEO works in the penthouse on the roof, with a terrace around it:
// a pool, loungers, trees in planters, string lights, a glass railing. A glass lift runs up the front of the tower.
const G = 1.4, W = 18, D = 10.5, FL = 7, FH = 3.2, TOP = FL * FH + .4, T = {x0:-3.5, x1:W + 3.5, z0:-13.5, z1:D + 6.5};
let chair = {x:0, z:0}, chairL = null, off = null, visit = null, world = null, up = null, car = null, orchs = [], byId = {}, isle = null, boss = {x:0, z:0}, ent = 0, ex = 0, ez = 0, labels = [], sig = '', lamps = [], clouds = [], rain = null, pond = null, pool = null, callL = null;
function build(s) {
  if (world) return false; world = new THREE.Group(); scene.add(world); up = new THREE.Group(); up.position.y = TOP; world.add(up); LB.textContent = ''; labels = []; lamps = [];
  const S = Baker(), L = Baker(), P = Baker(), PL = Baker();          // ground: solid and glowing; penthouse: built at 0, lifted to the roof
  const mx = 13, mz0 = 9, mz1 = 13; isle = {x0:-mx, z0:T.z0 - mz0, x1:W + mx, z1:T.z1 + mz1}; const iw = isle.x1 - isle.x0, id = isle.z1 - isle.z0;
  const sh = new THREE.Shape(), r = 5, ix = isle.x0, iz = isle.z0; sh.moveTo(ix + r, iz); sh.lineTo(ix + iw - r, iz); sh.quadraticCurveTo(ix + iw, iz, ix + iw, iz + r); sh.lineTo(ix + iw, iz + id - r); sh.quadraticCurveTo(ix + iw, iz + id, ix + iw - r, iz + id); sh.lineTo(ix + r, iz + id); sh.quadraticCurveTo(ix, iz + id, ix, iz + id - r); sh.lineTo(ix, iz + r); sh.quadraticCurveTo(ix, iz, ix + r, iz);
  const grass = new THREE.ExtrudeGeometry(sh, {depth:.5, bevelEnabled:false, curveSegments:4}); grass.rotateX(Math.PI / 2); S.add(grass, '#86bf5e', 0, 0, 0);
  const soil = new THREE.ExtrudeGeometry(sh, {depth:2.6, bevelEnabled:false, curveSegments:4}); soil.rotateX(Math.PI / 2); S.add(soil, '#8a6243', 0, -.5, 0); S.add(soil, '#6f5038', 0, -2.4, 0, 0, 1, .35, 1);
  // the tower: plinth, body, floor slabs, a window grid on all four faces (some lit), the lobby, the lift
  const tw = T.x1 - T.x0, td = T.z1 - T.z0, tcx = (T.x0 + T.x1) / 2, tcz = (T.z0 + T.z1) / 2; let rs = 11; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  ent = W / 2 + 1.7; ex = T.x1 - 2.6; ez = T.z1 + 1.05;
  S.box(tw + 1.6, .4, td + 1.6, '#bdb6aa', tcx, 0, tcz); S.box(tw, TOP - .4, td, '#2c3a4a', tcx, .4, tcz);
  for (let f = 0; f < FL; f++) { const y = .4 + f * FH; S.box(tw + .3, .38, td + .3, '#eeeae2', tcx, y + FH - .38, tcz);
    if (f === 0) continue;
    const win = (wx, wz, w, along) => { const h = FH - 1, yy = y + .3; if (rnd() < .5) { if (along) L.box(w, h, .05, '#ffffff', wx, yy, wz); else L.add(BOX, '#ffffff', wx, yy + h / 2, wz, 0, .05, h, w); } else { if (along) S.box(w, h, .05, '#3d5772', wx, yy, wz); else S.add(BOX, '#3d5772', wx, yy + h / 2, wz, 0, .05, h, w); } };
    for (let x = T.x0 + 1; x < T.x1 - .6; x += 1.6) { win(x + .6, T.z1 + .03, 1.3, true); win(x + .6, T.z0 - .03, 1.3, true); }
    for (let z = T.z0 + 1; z < T.z1 - .6; z += 1.6) { win(T.x1 + .03, z + .6, 1.3, false); win(T.x0 - .03, z + .6, 1.3, false); }
    for (let x = T.x0 + .2; x <= T.x1; x += 1.6) { S.box(.12, FH - .4, .12, '#eeeae2', x, y, T.z1 + .06); S.box(.12, FH - .4, .12, '#eeeae2', x, y, T.z0 - .06); }
    for (let z = T.z0 + .2; z <= T.z1; z += 1.6) { S.box(.12, FH - .4, .12, '#eeeae2', T.x1 + .06, y, z); S.box(.12, FH - .4, .12, '#eeeae2', T.x0 - .06, y, z); } }
  L.box(tw - 1, FH - 1, .05, '#ffffff', tcx, .55, T.z1 + .04); S.box(2.4, 2.2, .08, '#2b2f38', ent, .4, T.z1 + .08); L.box(2, 2, .03, '#fff6d8', ent, .45, T.z1 + .13);
  S.box(5, .22, 2.6, '#3a3f4a', ent, FH - .3, T.z1 + 1.3); for (const sx of [-2.3, 2.3]) S.box(.14, FH - .3, .14, '#3a3f4a', ent + sx, .4, T.z1 + 2.5); S.box(4.6, .02, 2.4, '#8c2f39', ent, .4, T.z1 + 1.3);
  for (const sx of [-3.6, 3.6]) plantAt(S, ent + sx, T.z1 + .9, 1.2);
  for (const [cx, cz] of [[ex - .8, ez - .8], [ex + .8, ez - .8], [ex - .8, ez + .8], [ex + .8, ez + .8]]) S.box(.14, TOP + 2.8, .14, '#3a3f4a', cx, .4, cz);
  for (let y = 0; y < TOP + 3; y += FH) S.box(1.75, .1, 1.75, '#3a3f4a', ex, y + .4, ez); S.box(1.8, .3, 1.8, '#3a3f4a', ex, TOP + 3.1, ez);
  const shaft = new THREE.Mesh(BOX, GLASS); shaft.scale.set(1.6, TOP + 2.8, 1.6); shaft.position.set(ex, .4 + (TOP + 2.8) / 2, ez); shaft.renderOrder = 3; world.add(shaft);
  car = new THREE.Group(); { const cb = Baker(); cb.box(1.4, .12, 1.4, '#c9a65a', 0, 0, 0); cb.box(1.4, .1, 1.4, '#c9a65a', 0, 2.5, 0); for (const [a, b] of [[-.66, -.66], [.66, -.66], [-.66, .66], [.66, .66]]) cb.box(.08, 2.5, .08, '#c9a65a', a, 0, b); cb.box(1.3, 1, .05, '#e8e2d4', 0, .12, -.66); car.add(cb.mesh(MSOLID)); }
  car.position.set(ex, .4, ez); world.add(car);
  for (let f = 1; f < FL; f++) { const y = .4 + f * FH; S.box(1.5, 2.4, .1, '#c9a65a', ex, y, T.z1 + .1); S.box(1.2, 2.2, .06, '#7d8794', ex, y, T.z1 + .16); S.box(1.8, .1, 1.1, '#3a3f4a', ex, y - .05, T.z1 + .55); L.box(.3, .12, .02, '#ffe7a8', ex, y + 2.5, T.z1 + .17); }
  // the roof: deck and stone, the penthouse office, the pool, loungers, planters with trees, string lights, a glass railing
  S.box(tw + .4, .34, td + .4, '#eeeae2', tcx, TOP - .34, tcz);
  const n0 = lamps.length;
  P.box(tw, .05, td, '#d8d0c0', tcx, 0, tcz); P.box(tw - .4, .04, T.z1 - D - .4, '#a8825a', tcx, .05, (D + T.z1) / 2 + .1); for (let x = T.x0 + .5; x < T.x1; x += .7) P.box(.03, .045, T.z1 - D - .4, '#8f6c48', x, .05, (D + T.z1) / 2 + .1);
  P.box(W + .2, 2.7, .3, '#efe6d4', W / 2, .05, -.15); P.box(W + .4, .14, .4, '#c9b48d', W / 2, 2.75, -.15);
  managerOffice(P, PL); chairmanOffice(P, PL);
  const px0 = .6, px1 = 8.6, pz0 = D + 1, pz1 = T.z1 - 1.6; pool = {x:(px0 + px1) / 2, z:(pz0 + pz1) / 2, w:px1 - px0, d:pz1 - pz0};
  P.box(pool.w + .7, .32, pool.d + .7, '#f4f0e8', pool.x, .05, pool.z); P.box(pool.w, .05, pool.d, '#5aa7c9', pool.x, .33, pool.z); PL.box(pool.w - .1, .03, .06, '#aef0ff', pool.x, .3, pz0 + .05);
  pool.mesh = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({color:0x4fc3e8, transparent:true, opacity:.82})); pool.mesh.scale.set(pool.w, .06, pool.d); pool.mesh.position.set(pool.x, .36, pool.z); up.add(pool.mesh); lamps.push({x:pool.x, z:pool.z, r:4.2, pool:true});
  for (let i = 0; i < 3; i++) { const z = 1.4 + i * 2.6, x = T.x0 + 1.6; P.box(.8, .25, 2, '#f4f0e8', x, .3, z); P.box(.75, .12, 1.4, '#3f9db8', x, .55, z + .2); P.box(.75, .5, .5, '#3f9db8', x, .55, z - .7, 0); P.box(.06, .3, .06, '#8a8f99', x - .35, .05, z - .9); P.box(.06, .3, .06, '#8a8f99', x + .35, .05, z + .9); P.add(CYL, '#e8e2d4', x + .9, .5, z + 1.1, 0, .35, .06, .35); }
  P.box(.08, 2.5, .08, '#8a8f99', T.x0 + 1.6, .05, 9.2); P.add(CONE, '#e85d5d', T.x0 + 1.6, 2.6, 9.2, 0, 3, .6, 3); P.add(CONE, '#ffffff', T.x0 + 1.6, 2.62, 9.2, .4, 2.2, .5, 2.2);
  const dx = W + 1.7, dz = D + 2.6; P.add(CYL, '#f4f0e8', dx, .8, dz, 0, 1.4, .08, 1.4); P.box(.1, .75, .1, '#3a3f4a', dx, .05, dz); for (const [a, b] of [[-1, 0], [1, 0], [0, -1]]) { P.box(.55, .08, .55, '#3a3f4a', dx + a, .5, dz + b); P.box(.55, .5, .08, '#3a3f4a', dx + a, .55, dz + b + (b ? -.25 : .25) * 0 - .25); }
  const planter = (x, z, w, d) => { P.box(w, .6, d, '#7d6a58', x, .05, z); P.box(w - .1, .05, d - .1, '#4a3a2a', x, .62, z); };
  for (const [x, z, k] of [[W + 2, 1, 0], [W + 2, 4.2, 1], [W + 2, 7.4, 0], [W + 2, -3, 1], [W + 2, -7, 0], [W + 2, -11, 1], [T.x0 + 1.4, -11.8, 0], [T.x0 + 1.4, -7.5, 2]]) { planter(x, z, 1.6, 1.6); if (k === 0) treeAt(P, x, z, .55, .3 + x % .5); else if (k === 1) palmAt(P, x, z, .6, .4); else bushAt(P, x, z, .8); }
  for (let x = T.x0 + .6; x < T.x1 - .4; x += 1.1) { if (Math.abs(x - ex) < 1.2 || Math.abs(x - ent) < .7) continue; planter(x, T.z1 - .5, 1, .6); P.add(SPH, ['#f4d35e', '#ef8fa8', '#e85d5d', '#ffffff', '#b48ef0'][Math.floor(rnd() * 5)], x, .78, T.z1 - .5, 0, .5, .3, .35); P.add(ICO, '#5aa548', x + .25, .72, T.z1 - .5, x, .5, .35, .4); }
  for (const [x0, x1] of [[T.x0 + .3, W / 2 - .5], [W / 2 + 3.5, T.x1 - .3]]) { P.box(.1, 3, .1, '#3a3f4a', x0, .05, T.z1 - 1.1); P.box(.1, 3, .1, '#3a3f4a', x1, .05, T.z1 - 1.1);
    for (let k = 0; k <= 12; k++) { const u = k / 12, x = x0 + (x1 - x0) * u, y = 3 - Math.sin(Math.PI * u) * .7; PL.add(SPH, '#ffd98a', x, y, T.z1 - 1.1, 0, .16, .2, .16); } lamps.push({x:(x0 + x1) / 2, z:T.z1 - 1.6, r:3.4}); }
  const rail = (x, z, w, d) => { const m = new THREE.Mesh(BOX, GLASS); m.scale.set(w, 1.1, d); m.position.set(x, .6, z); m.renderOrder = 3; up.add(m); P.box(w + .06, .07, d + .06, '#8a8f99', x, 1.12, z); };
  rail(tcx, T.z0 - .1, tw, .05); rail(T.x0 - .1, tcz, .05, td); rail(T.x1 + .1, tcz, .05, td); rail((T.x0 + ex - 1) / 2, T.z1 + .1, ex - 1 - T.x0, .05); rail((ex + 1 + T.x1) / 2, T.z1 + .1, T.x1 - ex - 1, .05);
  for (let k = n0; k < lamps.length; k++) lamps[k].y = TOP;
  callL = addLabel('call', '', boss.x, TOP + 3.4, boss.z - 1.1, 'tag'); addLabel('room', 'Penthouse CEO', W * .3, TOP + 3.1, D, 'tag'); addLabel('chair-room', 'Phòng Chủ tịch', W / 2, TOP + 4.2, T.z0 + 1, 'tag'); chairL = addLabel('chair', '', chair.x, TOP + 3.3, chair.z, 'tag'); addLabel('tower', 'DIEUPHOI TOWER', ent, FH + .5, T.z1 + 2.4, 'tag');
  // the garden below: a stone path from the gate to the lobby, a pond with a bench, trees, palms, rocks, lamps
  for (let z = T.z1 + 2.8; z < isle.z1 - 1; z += 1.1) S.add(CYL, '#d9c7a3', ent + Math.sin(z * .7) * .3, .02, z, z, 1.1, .06, .8);
  for (let x = ent + .8; x < ex - .5; x += 1.1) S.add(CYL, '#d9c7a3', x, .02, T.z1 + 2.6, x, 1, .06, .8);
  for (const sx of [-1.1, 1.1]) S.box(.3, 2.6, .3, '#7d5f43', ent + sx, 0, isle.z1 - 2.2); S.box(2.7, .3, .4, '#7d5f43', ent, 2.6, isle.z1 - 2.2); S.box(2.2, .25, .3, '#3f73a8', ent, 2.28, isle.z1 - 2.15);
  pond = {x:T.x0 - 5.5, z:T.z1 + 4.5}; S.add(CYL, '#6f8f6a', pond.x, -.02, pond.z, 0, 6, .06, 4); const water = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, .05, 20), new THREE.MeshLambertMaterial({color:0x6fb2d6, transparent:true, opacity:.88}));
  water.scale.set(1, 1, .64); water.position.set(pond.x, .03, pond.z); water.receiveShadow = true; world.add(water); pond.mesh = water; for (let j = 0; j < 3; j++) S.add(CYL, '#4f9a45', pond.x - 1 + j * .9, .07, pond.z + (j % 2 ? .5 : -.4), 0, .5, .02, .5);
  const bx = pond.x + 3.4, bz = pond.z - 2.6; S.box(2, .1, .6, '#9a7350', bx, .5, bz); S.box(2, .5, .1, '#9a7350', bx, .55, bz - .3); for (const lx of [-.8, .8]) S.box(.1, .5, .5, '#3a3f4a', bx + lx, 0, bz);
  const free = (x, z, m = 1) => !(x > T.x0 - 1.5 - m && x < T.x1 + 1.5 + m && z > T.z0 - 1.5 - m && z < T.z1 + 3.2 + m) && Math.hypot(x - pond.x, (z - pond.z) * 1.5) > 4 && Math.hypot(x - bx, z - bz) > 2 && (z < T.z1 || Math.abs(x - ent) > 1.8);
  const trees = []; for (let t = 0; t < 900 && trees.length < 48; t++) { const x = isle.x0 + 1.2 + rnd() * (iw - 2.4), z = isle.z0 + 1.2 + rnd() * (id - 2.4); if (!free(x, z, 1.3) || trees.some(o => Math.hypot(o.x - x, o.z - z) < 2.4)) continue; trees.push({x, z}); }
  for (const t of trees) { const k = rnd(); if (k < .38) treeAt(S, t.x, t.z, .9 + rnd() * .5, rnd()); else if (k < .6) pineAt(S, t.x, t.z, .9 + rnd() * .5); else if (k < .85) palmAt(S, t.x, t.z, 1 + rnd() * .3, rnd()); else bushAt(S, t.x, t.z, rnd()); }
  for (let t = 0; t < 170; t++) { const x = isle.x0 + .8 + rnd() * (iw - 1.6), z = isle.z0 + .8 + rnd() * (id - 1.6); if (!free(x, z, .6)) continue; const k = rnd();
    if (k < .5) S.add(CONE, '#6fa64c', x, .12, z, rnd() * 6, .18, .35, .18); else if (k < .8) { S.box(.08, .25, .08, '#4f8a3a', x, 0, z); S.add(SPH, ['#f4d35e', '#ef8fa8', '#ffffff', '#e85d5d', '#b48ef0'][Math.floor(rnd() * 5)], x, .3, z, 0, .2, .16, .2); } else S.add(DOD, '#9aa0a2', x, .1, z, rnd() * 6, .5 + rnd() * .5, .35, .45); }
  for (const [x, z] of [[ent - 1.8, T.z1 + 5], [ent + 1.8, T.z1 + 9], [T.x0 - 2.5, 2], [T.x1 + 2.5, 4]]) { S.box(.12, 2.2, .12, '#4b4f58', x, 0, z); S.box(.3, .1, .3, '#4b4f58', x, 2.2, z); L.add(SPH, '#fff0c8', x, 2.42, z, 0, .32, .32, .32); lamps.push({x, z, r:2.6, post:true, y:0}); }
  const solid = S.mesh(MSOLID); solid.castShadow = solid.receiveShadow = true; world.add(solid); world.add(L.mesh(MGLOW));
  const ps = P.mesh(MSOLID); ps.castShadow = ps.receiveShadow = true; up.add(ps); up.add(PL.mesh(MGLOW));
  for (const l of lamps) { const m = new THREE.Mesh(new THREE.PlaneGeometry(l.r * 2.4, l.r * 2.4), new THREE.MeshBasicMaterial({map:poolTex(), color:l.pool ? 0x7fe0ff : 0xffc070, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-4})); m.rotation.x = -Math.PI / 2; m.position.set(l.x, (l.y || 0) + .46, l.z); m.renderOrder = 2; world.add(m); l.pool = m; }
  clouds = []; for (let i = 0; i < 9; i++) { const b = Baker(); for (let j = 0; j < 5; j++) b.add(ICO, '#ffffff', (j - 2) * 1.1, Math.sin(j * 2.1) * .4, Math.cos(j * 1.7) * .7, j, 1.6 + (j % 2) * .6, 1.2 + (j % 3) * .3, 1.4);
    const m = b.mesh(new THREE.MeshLambertMaterial({vertexColors:true, transparent:true, opacity:.95})); m.castShadow = true; m.userData = {sp:.4 + (i % 3) * .25, z:isle.z0 - 12 + (i * 5.3) % 12, y:TOP + 9 + (i % 3) * 2.5, off:i * 13.7}; world.add(m); clouds.push(m); }
  const N = 900, rp = new Float32Array(N * 6); rain = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color:0xdde8f6, transparent:true, opacity:.55}));
  rain.geometry.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rain.userData.d = Array.from({length:N}, () => ({x:isle.x0 + Math.random() * iw, z:isle.z0 + Math.random() * id, y:Math.random() * (TOP + 8)})); rain.frustumCulled = false; world.add(rain);
  const sc = sun.shadow.camera, half = Math.max(iw, id, TOP * 1.6) * .62; sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 200; sc.updateProjectionMatrix(); sun.shadow.mapSize.set(2048, 2048);
  boss.m = vip({suit:'#1f2a44', pants:'#1b2030', tie:'#c0392b', hair:'#3a2a20', skin:'#f0c8a0', glasses:false}); boss.m.position.set(boss.x, .34, boss.z - 1.1); up.add(boss.m);
  chair.m = vip({suit:'#2b2b30', pants:'#222226', tie:'#8c2f39', hair:'#1d1a18', skin:'#e8bb92', glasses:true}); chair.m.position.set(chair.x, .5, chair.z - 1.15); up.add(chair.m);
  phoneS = sign('☎', COL.ready); phoneS.visible = false; up.add(phoneS); return true; }

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
  const glass = (x, z, w, d) => { const m = new THREE.Mesh(BOX, GLASS); m.scale.set(w, 2.4, d); m.position.set(x, 1.55, z); m.renderOrder = 3; up.add(m); };
  const gl = z1 - z0 - 2.3; glass(x0, z0 + gl / 2, .06, gl); for (let z = z0; z <= z0 + gl + .01; z += gl / 3) S.box(.1, 2.5, .1, '#3a3f4a', x0, .3, z); S.box(.12, .1, gl, '#3a3f4a', x0, 2.75, z0 + gl / 2);
  S.box(.1, 2.5, .1, '#3a3f4a', x0, .3, z1 - .05); S.box(.12, .1, 2.3, '#3a3f4a', x0, 2.75, z1 - 1.15);
  glass(x0 + (x1 - x0) * .25, z1, (x1 - x0) * .5, .05); S.box((x1 - x0) * .5, .1, .1, '#3a3f4a', x0 + (x1 - x0) * .25, .34, z1); S.box((x1 - x0) * .5, .08, .08, '#3a3f4a', x0 + (x1 - x0) * .25, 1.2, z1);
  S.box(.12, 2.6, z1 - z0, '#e7dcc6', x1 + .06, .3, (z0 + z1) / 2);
  // the desk: walnut top, modesty panel, a return on the right; monitors, lamp, phone, nameplate, papers, mug
  const dk = '#4a3426'; S.box(3.8, .12, 1.5, dk, bx, 1.0, bz); S.box(3.6, .66, .1, '#3a281d', bx, .34, bz + .62); S.box(.12, .66, 1.4, '#3a281d', bx - 1.8, .34, bz); S.box(1.3, .12, 2.1, dk, bx + 2.45, 1.0, bz - .3); S.box(1.2, .66, .1, '#3a281d', bx + 2.45, .34, bz + .72);
  S.box(3.8, .03, 1.5, '#5d4232', bx, 1.12, bz); S.box(1.6, .02, .7, '#2d4a3a', bx - .2, 1.14, bz + .2);
  for (const [mx, ry] of [[-.62, -.3], [.62, .3]]) { const mz = bz + .2; S.box(.1, .4, .1, '#2b2f38', bx + mx, 1.12, mz + .05); S.add(BOX, '#2b2f38', bx + mx, 1.13, mz + .05, ry, .35, .03, .25);
    S.add(BOX, '#3a3f4a', bx + mx, 1.72, mz, ry, 1.15, .7, .06); L.add(BOX, '#9fd2ff', bx + mx - Math.sin(ry) * .035, 1.72, mz - Math.cos(ry) * .035, ry, 1.05, .6, .01); L.add(BOX, '#ffffff', bx + mx + Math.sin(ry) * .035, 1.95, mz + Math.cos(ry) * .035, ry, .08, .08, .01); }
  S.box(.95, .03, .3, '#2b2f38', bx, 1.12, bz - .42); S.box(.88, .012, .24, '#5a606c', bx, 1.15, bz - .42); S.add(SPH, '#2b2f38', bx + .7, 1.14, bz - .42, 0, .1, .06, .15); S.box(.4, .01, .3, '#1d1f25', bx + .7, 1.12, bz - .42);
  S.add(CYL, '#c9a65a', bx - 1.05, 1.18, bz - .1, 0, .16, .22, .16); for (const [a, c] of [[-.03, '#2b2f38'], [.04, '#c0392b'], [0, '#3f73a8']]) S.box(.025, .22, .025, c, bx - 1.05 + a, 1.22, bz - .1 + a);
  S.add(CYL, '#e8e2d4', bx + 1.6, 1.18, bz + .35, 0, .26, .18, .26); for (let i = 0; i < 5; i++) S.add(ICO, '#5aa548', bx + 1.6 + Math.cos(i * 1.3) * .08, 1.36 + i * .015, bz + .35 + Math.sin(i * 1.3) * .08, i, .14, .1, .14);
  S.add(BOX, '#c9a65a', bx - 1.15, 1.3, bz + .45, .5, .32, .26, .03); S.add(BOX, '#a7c4d8', bx - 1.15, 1.31, bz + .465, .5, .26, .2, .01);
  S.box(3.8, .72, .5, '#3a281d', bx, .34, .45); S.box(3.9, .05, .55, '#c9a65a', bx, 1.06, .45); for (let i = 0; i < 4; i++) S.box(.85, .55, .02, '#4a3426', bx - 1.4 + i * .93, .42, .71);
  S.add(CYL, '#1f3a5a', bx - 1.3, 1.25, .45, 0, .34, .34, .34); S.add(SPH, '#3f73a8', bx - 1.3, 1.55, .45, 0, .42, .42, .42); S.add(CYL, '#c9a65a', bx - 1.3, 1.55, .45, 0, .5, .03, .5, .4);
  S.add(CYL, '#c9a65a', bx + 1.3, 1.2, .45, 0, .2, .3, .2); S.add(CONE, '#e3c48c', bx + 1.3, 1.5, .45, 0, .3, .35, .3); S.add(SPH, '#c9a65a', bx + 1.3, 1.75, .45, 0, .22, .22, .22);
  for (let i = 0; i < 6; i++) S.box(.14, .4 - (i % 3) * .05, .3, ['#7c3030', '#1f3a5a', '#2e5d3a', '#c9a65a', '#5a1414', '#3b2a20'][i], bx - .5 + i * .17, 1.1, .45);
  S.add(CYL, '#c9a65a', bx - 1.5, 1.15, bz - .3, 0, .22, .06, .22); S.box(.04, .38, .04, '#c9a65a', bx - 1.5, 1.15, bz - .3); S.add(CYL, '#2e7d4f', bx - 1.5, 1.6, bz - .25, 0, .6, .18, .3, Math.PI / 2 * 0); L.box(.5, .04, .22, '#ffe7a8', bx - 1.5, 1.5, bz - .25); lamps.push({x:bx - 1.5, z:bz, r:1.8});
  S.box(.45, .12, .3, '#1f2228', bx + 1.5, 1.13, bz - .3); S.box(.42, .08, .12, '#2b2f38', bx + 1.5, 1.25, bz - .35); L.box(.12, .02, .08, '#7fe08f', bx + 1.6, 1.26, bz - .21);
  S.box(1.1, .2, .12, '#c9a65a', bx, 1.13, bz + .62); S.box(.5, .02, .7, '#f7f5ef', bx + .55, 1.14, bz + .35, .2); S.box(.5, .02, .7, '#ffffff', bx + .62, 1.16, bz + .32, .35); S.add(CYL, '#d2553d', bx - .9, 1.13, bz + .45, 0, .2, .22, .2);
  S.add(BOX, '#3a3f4a', bx + 2.5, 1.45, bz - .9, 1.3, .9, .55, .05); L.add(BOX, '#b8f0c8', bx + 2.5 - Math.sin(1.3) * .035, 1.45, bz - .9 - Math.cos(1.3) * .035, 1.3, .8, .45, .01); S.box(.08, .3, .08, '#2b2f38', bx + 2.5, 1.12, bz - .9);
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
// ---- the two bosses get a finer figure: a suit with lapels and a tie, shirt cuffs, hands on the desk, a rounder head
// with ears, eyes with whites, brows, nose, mouth, styled hair, glasses for the chairman
const HEAD = new THREE.SphereGeometry(.5, 16, 12);
function vip(o) { const b = Baker(), sk = o.skin, y0 = .55, wh = '#f7f7f2';
  b.box(.44, .16, .52, o.pants, 0, .44, .18); for (const s of [-1, 1]) { b.box(.17, .45, .17, o.pants, s * .11, 0, .4); b.box(.18, .08, .32, '#111', s * .11, 0, .5); }
  b.add(new THREE.CapsuleGeometry(.25, .32, 4, 12), o.suit, 0, y0 + .32, 0);
  b.add(BOX, wh, 0, y0 + .5, .19, 0, .17, .32, .08); b.add(BOX, o.tie, 0, y0 + .44, .235, 0, .065, .3, .02); b.add(BOX, shade(o.tie, .8), 0, y0 + .62, .236, 0, .085, .055, .025);
  b.add(BOX, shade(o.suit, .78), -.1, y0 + .5, .222, 0, .055, .34, .02, 0, .32); b.add(BOX, shade(o.suit, .78), .1, y0 + .5, .222, 0, .055, .34, .02, 0, -.32);
  b.add(SPH, '#d9d2c3', .1, y0 + .5, .232, 0, .04, .04, .01);
  for (const s of [-1, 1]) { b.box(.14, .36, .14, o.suit, s * .31, y0 + .2, .03); b.add(BOX, o.suit, s * .27, y0 + .18, .28, 0, .13, .13, .38); b.add(BOX, wh, s * .26, y0 + .18, .49, 0, .135, .135, .05); b.add(SPH, sk, s * .25, y0 + .18, .57, 0, .13, .1, .17); }
  b.add(CYL, sk, 0, y0 + .66, 0, 0, .17, .14, .17);
  b.add(HEAD, sk, 0, y0 + .88, 0, 0, .44, .5, .44); for (const s of [-1, 1]) b.add(SPH, shade(sk, .95), s * .215, y0 + .88, -.01, 0, .07, .11, .06);
  b.add(HEAD, o.hair, 0, y0 + 1.02, -.04, 0, .47, .26, .47); b.add(HEAD, o.hair, -.05, y0 + 1.08, .02, 0, .36, .16, .34); b.add(BOX, o.hair, 0, y0 + .87, -.16, 0, .42, .3, .14); for (const s of [-1, 1]) b.box(.04, .12, .08, o.hair, s * .21, y0 + .82, .04);
  for (const s of [-1, 1]) { b.add(BOX, shade(o.hair, 1.1), s * .085, y0 + .962, .203, 0, .075, .013, .015, 0, s * -.1); b.add(SPH, wh, s * .08, y0 + .9, .2, 0, .08, .055, .04); b.add(SPH, '#3a2a20', s * .08, y0 + .9, .217, 0, .042, .048, .02); b.add(SPH, wh, s * .07, y0 + .91, .226, 0, .012, .012, .006); }
  b.add(SPH, shade(sk, .97), 0, y0 + .845, .215, 0, .045, .06, .04); b.add(SPH, shade(sk, .86), 0, y0 + .825, .222, 0, .035, .02, .02); for (const s of [-1, 0, 1]) b.add(BOX, '#8a4a40', s * .028, y0 + .78 + Math.abs(s) * .008, .203, 0, .03, .011, .012, 0, s * .35); for (const s of [-1, 1]) b.add(SPH, '#f0a090', s * .12, y0 + .83, .19, 0, .05, .03, .02);
  if (o.glasses) { const g = '#22252c'; for (const s of [-1, 1]) { b.add(BOX, g, s * .08, y0 + .945, .232, 0, .12, .014, .01); b.add(BOX, g, s * .08, y0 + .858, .232, 0, .12, .014, .01); b.add(BOX, g, s * .14, y0 + .9, .23, 0, .014, .09, .01); b.add(BOX, g, s * .02, y0 + .9, .232, 0, .014, .09, .01); b.add(BOX, g, s * .18, y0 + .93, .1, 0, .012, .012, .24); }
    b.add(BOX, g, 0, y0 + .92, .234, 0, .04, .012, .01); }
  const m = b.mesh(MSOLID); m.castShadow = true; m.scale.setScalar(1.05); return m; }

// ---- the chairman's office, behind the CEO's: a raised marble floor with gold lines, a panelled wall with a lacquer
// painting, bookcases, a rosewood desk with two monitors, a bonsai and a gold nameplate, a red leather chair, a
// sofa corner with a tea table, an aquarium, orchids and tall vases; glass walls at the sides
function chairmanOffice(P, PL) { const x0 = .2, x1 = W - .2, z0 = T.z0 + .6, z1 = -.4, cx = (x0 + x1) / 2, F = .55; chair = {x:cx, z:z0 + 4.4};
  P.box(x1 - x0, F - .05, z1 - z0, '#34353c', cx, .05, (z0 + z1) / 2); for (let x = x0 + 2; x < x1 - .5; x += 2) P.box(.04, .012, z1 - z0 - .4, '#c9a65a', x, F, (z0 + z1) / 2); for (let z = z0 + 2; z < z1 - .5; z += 2) P.box(x1 - x0 - .4, .012, .04, '#c9a65a', cx, F, z);
  P.box(1.4, .27, 1.4, '#3a3b42', x0 - .8, .05, -2.2); P.box(1.4, .13, .7, '#3a3b42', x0 - .8, .32, -2.55);
  P.box(x1 - x0, 3.2, .3, '#5b3a29', cx, F, z0 - .15); for (let x = x0 + .8; x < x1; x += 1.6) P.box(.06, 3, .05, '#7a5038', x, F, z0 + .02); P.box(x1 - x0, .1, .12, '#c9a65a', cx, F + 3.1, z0 + .02); P.box(x1 - x0, .07, .08, '#c9a65a', cx, F + .9, z0 + .03);
  P.box(4.6, 2.1, .06, '#c9a65a', cx, F + 1.05, z0 + .06); P.box(4.4, 1.9, .04, '#5a1414', cx, F + 1.15, z0 + .1);
  for (const [x, y, w, r] of [[-1.3, 1.6, 1.6, .5], [-.4, 1.45, 1.3, -.45], [.6, 1.7, 1.8, .38], [1.5, 1.5, 1, -.5]]) P.add(BOX, '#d8b26a', cx + x, F + y, z0 + .13, 0, w, .05, .01, 0, r);
  P.add(CYL, '#f2d27a', cx + 1.4, F + 2.5, z0 + .13, 0, .55, .02, .55, Math.PI / 2); P.add(BOX, '#e3c48c', cx - .2, F + 1.3, z0 + .13, 0, 3.8, .03, .01);
  for (const sx of [cx - 4.2, cx + 4.2]) { P.box(2.4, 2.9, .5, '#3b2418', sx, F, z0 + .3); P.box(2.5, .08, .55, '#c9a65a', sx, F + 2.9, z0 + .3); const B = ['#7c3030', '#1f3a5a', '#2e5d3a', '#c9a65a', '#5a1414', '#e7dcc4'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) P.box(.22, .5 - ((r + c) % 3) * .06, .32, B[(r * 8 + c + Math.round(sx)) % 6], sx - .95 + c * .27, F + .15 + r * .68, z0 + .42); }
  for (const vx of [x0 + .8, x1 - .8]) { P.add(CYL, '#1f3a5a', vx, F + .7, z0 + .8, 0, .7, 1.4, .7); P.add(CYL, '#e8e2d4', vx, F + 1.4, z0 + .8, 0, .45, .08, .45); for (let i = 0; i < 5; i++) P.box(.03, .9, .03, '#6b4a2e', vx - .2 + i * .1, F + 1.4, z0 + .8); }
  const dx = cx, dz = chair.z; P.box(1.2, .82, 1.5, '#4a2418', dx - 1.6, F, dz); P.box(1.2, .82, 1.5, '#4a2418', dx + 1.6, F, dz); P.box(4.4, .76, .08, '#4a2418', dx, F + .06, dz + .72); P.box(4.2, .03, .02, '#c9a65a', dx, F + .5, dz + .77);
  P.box(4.6, .14, 1.8, '#5a2e1e', dx, F + .82, dz); P.box(4.66, .03, 1.86, '#c9a65a', dx, F + .8, dz); P.box(1.8, .015, .8, '#2e5d3a', dx, F + .97, dz - .2);
  for (const [mx, ry] of [[-.62, -.3], [.62, .3]]) { const mz = dz + .2; P.box(.1, .4, .1, '#2b2f38', dx + mx, F + .96, mz + .05); P.add(BOX, '#3a3f4a', dx + mx, F + 1.56, mz, ry, 1.15, .7, .06); PL.add(BOX, '#9fd2ff', dx + mx - Math.sin(ry) * .035, F + 1.56, mz - Math.cos(ry) * .035, ry, 1.05, .6, .01); }
  P.box(.95, .03, .3, '#2b2f38', dx, F + .96, dz - .42); P.box(1.3, .22, .12, '#c9a65a', dx, F + .97, dz + .8); P.box(1.2, .14, .02, '#5a1414', dx, F + 1.02, dz + .87);
  P.add(CYL, '#3a2a20', dx + 1.75, F + 1.0, dz + .3, 0, .5, .12, .3); P.box(.06, .3, .06, '#5b3d26', dx + 1.75, F + 1.05, dz + .3); for (let i = 0; i < 4; i++) P.add(SPH, i % 2 ? '#3f7a3a' : '#2f6a33', dx + 1.6 + i * .1, F + 1.38 + (i % 2) * .1, dz + .3, 0, .3, .13, .22);
  for (let i = 0; i < 3; i++) P.box(.42, .05 + i * .03, .55, '#f7f5ef', dx - 1.5 + i * .02, F + .97 + i * .06, dz + .2);
  P.add(CYL, '#c9a65a', dx - 1.9, F + 1.0, dz - .3, 0, .22, .06, .22); P.box(.04, .45, .04, '#c9a65a', dx - 1.9, F + 1.0, dz - .3); P.add(CYL, '#2e7d4f', dx - 1.9, F + 1.5, dz - .25, 0, .6, .18, .3); PL.box(.5, .04, .22, '#ffe7a8', dx - 1.9, F + 1.38, dz - .25);
  P.add(CYL, '#f4f0e6', dx + .95, F + .97, dz + .45, 0, .16, .12, .16);
  P.box(1.2, .16, 1.05, '#6b1f2a', dx, F + .45, dz - 1.2); P.box(1.2, 1.8, .2, '#6b1f2a', dx, F + .5, dz - 1.75); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) P.add(SPH, '#4f1620', dx - .35 + c * .35, F + .95 + r * .45, dz - 1.64, 0, .05, .05, .02);
  P.box(.14, .35, .9, '#5a1820', dx - .62, F + .6, dz - 1.2); P.box(.14, .35, .9, '#5a1820', dx + .62, F + .6, dz - 1.2); P.add(CYL, '#c9a65a', dx, F + .05, dz - 1.2, 0, .9, .04, .9);
  const tz = z1 - 2.9; P.box(2.2, .06, 1.2, '#4a2418', cx, F + .42, tz); P.box(2, .4, 1, '#3b2418', cx, F, tz);
  P.add(SPH, '#7a4a2a', cx - .2, F + .6, tz, 0, .3, .24, .3); P.box(.2, .04, .04, '#7a4a2a', cx - .02, F + .62, tz); for (let i = 0; i < 4; i++) P.add(CYL, '#f4f0e6', cx + .25 + (i % 2) * .22, F + .52, tz - .2 + Math.floor(i / 2) * .4, 0, .12, .08, .12);
  for (const s of [-1, 1]) { const sx = cx + s * 2.2; P.box(1, .45, 2.6, '#efe3c8', sx, F, tz); P.box(.3, .9, 2.6, '#e3d4b2', sx + s * .4, F, tz); P.box(1, .55, .3, '#e3d4b2', sx, F, tz - 1.3); P.box(1, .55, .3, '#e3d4b2', sx, F, tz + 1.3); P.box(.7, .4, .14, '#8c2f39', sx + s * .25, F + .7, tz - .5, s * .2); }
  P.box(5.4, .02, 3.6, '#1f3a5a', cx, F + .01, tz); P.box(5, .022, 3.2, '#c9a65a', cx, F + .012, tz); P.box(4.8, .024, 3, '#1f3a5a', cx, F + .014, tz);
  P.box(.6, 1.6, 3.4, '#2b2f38', x0 + .4, F, z0 + 7.5); PL.box(.5, 1.25, 3.2, '#5fb7e0', x0 + .41, F + .2, z0 + 7.5); for (let i = 0; i < 6; i++) PL.box(.06, .08, .18, i % 2 ? '#ff9a3c' : '#ffd23c', x0 + .7, F + .5 + (i * .37) % 1, z0 + 6.1 + i * .5); P.box(.62, .1, 3.45, '#c9a65a', x0 + .4, F + 1.6, z0 + 7.5);
  for (const [ox, oz] of [[x1 - .9, z0 + 6], [x1 - .9, z1 - .9], [x0 + .9, z1 - .9]]) { P.add(CYL, '#f4f0e6', ox, F + .3, oz, 0, .45, .6, .45); P.box(.04, .9, .04, '#3f7a3a', ox, F + .6, oz); for (let i = 0; i < 5; i++) P.add(SPH, i % 2 ? '#ffffff' : '#f3d1e6', ox + .1 + Math.sin(i) * .08, F + 1.15 + i * .1, oz + .12, 0, .16, .12, .1); P.add(SPH, '#3f7a3a', ox, F + .65, oz, 0, .45, .1, .2); }
  const glass = (x, z, w, d) => { const m = new THREE.Mesh(BOX, GLASS); m.scale.set(w, 2.6, d); m.position.set(x, F + 1.3, z); m.renderOrder = 3; up.add(m); };
  glass(x0, (z0 + z1) / 2 - 1.2, .06, z1 - z0 - 2.4); glass(x1, (z0 + z1) / 2, .06, z1 - z0); for (const xx of [x0, x1]) { P.box(.1, .1, z1 - z0, '#c9a65a', xx, F + 2.6, (z0 + z1) / 2); P.box(.1, 2.6, .1, '#c9a65a', xx, F, z1); P.box(.1, 2.6, .1, '#c9a65a', xx, F, z0); }
  lamps.push({x:dx, z:dz + .4, r:3.6}, {x:cx, z:tz, r:3.4}); }
function bigPlant(S, x, z) { S.add(CYL, '#e8e2d4', x, .34 + .35, z, 0, .55, .7, .55); S.add(CYL, '#4a3426', x, .34 + .72, z, 0, .5, .04, .5); S.box(.06, 1.2, .06, '#5b3d26', x, 1.05, z);
  for (let i = 0; i < 9; i++) { const a = i * 2.4, h = 1.3 + i * .14; S.add(SPH, i % 2 ? '#3f8a3a' : '#5aa548', x + Math.cos(a) * .3, h, z + Math.sin(a) * .3, a, .42, .12, .3, .5, .3); } }
function plantAt(S, x, z, s) { S.add(CYL, '#b5563c', x, .34 + .25 * s, z, 0, .55 * s, .5 * s, .55 * s); for (let j = 0; j < 4; j++) S.add(ICO, j % 2 ? '#4f9a45' : '#6dbb57', x + Math.cos(j * 1.6) * .18 * s, .34 + (.75 + j * .12) * s, z + Math.sin(j * 1.6) * .18 * s, j, .55 * s, .6 * s, .55 * s); }
function shelfAt(S, x, z, seed) { S.box(1.5, 1.7, .5, '#7d5f43', x, .34, z); const B = ['#d2553d', '#3f73a8', '#d39a2f', '#3f9d74', '#8a6fc2', '#e7dcc4'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) S.box(.22, .38 - ((seed >>> (c + r)) & 1) * .06, .3, B[(seed >>> (r * 3 + c)) % 6], x - .5 + c * .25, .5 + r * .52, z + .14); }
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
const cam = {tx:0, ty:0, tz:0, z:1, yaw:.38, pitch:.72}, goal = {}; let fitZ = 1, auto = true, touched = -1e9, moving = false;
try { auto = localStorage.getItem('dp-cam') !== '0'; } catch (e) {}
function aspect() { return stage.clientWidth / Math.max(1, stage.clientHeight); }
function applyCam() { const a = aspect(); camera.left = -V * a / 2; camera.right = V * a / 2; camera.top = V / 2; camera.bottom = -V / 2; camera.zoom = cam.z;
  const d = 60, cp = Math.cos(cam.pitch); camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * d, cam.ty + Math.sin(cam.pitch) * d, cam.tz + Math.cos(cam.yaw) * cp * d); camera.lookAt(cam.tx, cam.ty, cam.tz); camera.updateProjectionMatrix(); }
function fit(x0, z0, x1, z1, yaw = cam.yaw, y0 = 0, y1 = 3) { const save = {...cam}; cam.yaw = yaw; cam.tx = (x0 + x1) / 2; cam.ty = (y0 + y1) / 2; cam.tz = (z0 + z1) / 2; cam.z = 1; applyCam(); camera.updateMatrixWorld();
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) for (const y of [y0, y1]) { v3.set(x, y, z).project(camera); a = Math.min(a, v3.x); b = Math.max(b, v3.x); c = Math.min(c, v3.y); d = Math.max(d, v3.y); }
  const z = Math.min(2 / (b - a), 2 / (d - c)), out = {tx:cam.tx, ty:cam.ty, tz:cam.tz, z, yaw}; Object.assign(cam, save); applyCam(); return out; }
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.4), hit = new THREE.Vector3();
function ground(px, py) { const r = cv.getBoundingClientRect(); ray.setFromCamera({x:(px / r.width) * 2 - 1, y:-(py / r.height) * 2 + 1}, camera); plane.constant = -cam.ty - .4; return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null; }
const pts = new Map(); let tap = null, pinch = null;
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x:e.offsetX, y:e.offsetY}); Object.keys(goal).forEach(k => delete goal[k]); touched = performance.now(); moving = true;
  if (pts.size === 1) tap = {x:e.offsetX, y:e.offsetY, t:performance.now()}; else { tap = null; const [a, b] = [...pts.values()]; pinch = {d:Math.hypot(a.x - b.x, a.y - b.y), z:cam.z, ang:Math.atan2(b.y - a.y, b.x - a.x), yaw:cam.yaw}; } });
cv.addEventListener('pointermove', e => { const p = pts.get(e.pointerId); if (!p) return; const px = p.x, py = p.y; p.x = e.offsetX; p.y = e.offsetY; touched = performance.now();
  if (pts.size === 1) { const a = ground(px, py), b = ground(p.x, p.y); if (a && b) { cam.tx -= b.x - a.x; cam.tz -= b.z - a.z; } if (tap && Math.hypot(e.offsetX - tap.x, e.offsetY - tap.y) > 9) tap = null; }
  else if (pinch) { const [a, b] = [...pts.values()]; cam.z = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; cam.yaw = pinch.yaw - (Math.atan2(b.y - a.y, b.x - a.x) - pinch.ang); }
  clampCam(); applyCam(); });
const upH = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) moving = false;
  if (tap && performance.now() - tap.t < 400) { const g = ground(tap.x, tap.y); if (g) tapAt(g.x, g.z); } tap = null; };
cv.addEventListener('pointerup', upH); cv.addEventListener('pointercancel', upH);
cv.addEventListener('wheel', e => { e.preventDefault(); touched = performance.now(); if (e.shiftKey) cam.yaw += e.deltaY * .002; else cam.z *= e.deltaY < 0 ? 1.12 : .89; clampCam(); applyCam(); }, {passive:false});

// ---- the working orchestras: one row each on the left, a drawn face and the name
const LIST = document.createElement('div'); LIST.id = 'act3'; stage.append(LIST);
const SKIN2 = SKIN, HAIR2 = HAIR, FACES = {};
function face(o) { const k = o.p.id + o.tint; if (FACES[k]) return FACES[k]; const c = document.createElement('canvas'); c.width = c.height = 120; const x = c.getContext('2d'), sd = o.seed;
  const sk = SKIN2[sd % 4], hr = HAIR2[(sd >>> 3) % 7], long = (sd >>> 9) % 3 === 0, style = long ? (sd >>> 11) % 2 : 2 + (sd >>> 11) % 3, specs = (sd >>> 14) % 4 === 0, shirt = o.tint;
  const R = (cx, cy, rx, ry, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill(); };
  const bg = x.createRadialGradient(42, 34, 8, 60, 60, 66); bg.addColorStop(0, shade(shirt, 1.25)); bg.addColorStop(1, shade(shirt, .92)); x.fillStyle = bg; x.beginPath(); x.arc(60, 60, 60, 0, 7); x.fill();
  x.save(); x.beginPath(); x.arc(60, 60, 60, 0, 7); x.clip();
  if (style === 0) { x.fillStyle = hr; x.beginPath(); x.roundRect(28, 30, 64, 66, 22); x.fill(); }                     // long hair behind
  if (style === 1) { R(60, 22, 13, 11, hr); }                                                                            // a bun
  const sh = x.createLinearGradient(0, 88, 0, 120); sh.addColorStop(0, shade(shirt, .82)); sh.addColorStop(1, shade(shirt, .62)); x.fillStyle = sh; x.beginPath(); x.ellipse(60, 124, 44, 34, 0, 0, 7); x.fill();   // shoulders
  x.fillStyle = shade(sk, .86); x.fillRect(51, 74, 18, 18); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(46, 92); x.lineTo(60, 104); x.lineTo(74, 92); x.lineTo(68, 89); x.lineTo(60, 97); x.lineTo(52, 89); x.closePath(); x.fill();  // neck, collar
  R(33, 56, 5, 7, shade(sk, .92)); R(87, 56, 5, 7, shade(sk, .92));                                                      // ears
  const fg = x.createRadialGradient(50, 44, 4, 60, 54, 30); fg.addColorStop(0, shade(sk, 1.08)); fg.addColorStop(1, shade(sk, .94)); x.fillStyle = fg; x.beginPath(); x.ellipse(60, 54, 26, 29, 0, 0, 7); x.fill();  // face
  x.fillStyle = hr; x.beginPath();                                                                                      // hair on top, by style
  if (style === 0 || style === 1) { x.ellipse(60, 40, 28, 19, 0, Math.PI, 2 * Math.PI); x.fill(); x.beginPath(); x.moveTo(34, 42); x.quadraticCurveTo(52, 26, 66, 40); x.quadraticCurveTo(76, 30, 87, 44); x.lineTo(87, 36); x.lineTo(34, 36); x.fill(); }
  else if (style === 2) { x.ellipse(60, 38, 28, 17, 0, Math.PI, 2 * Math.PI); x.fill(); x.beginPath(); x.moveTo(33, 40); x.quadraticCurveTo(40, 30, 58, 33); x.quadraticCurveTo(76, 30, 87, 42); x.lineTo(87, 36); x.lineTo(33, 36); x.fill(); x.fillRect(32, 36, 5, 14); x.fillRect(83, 36, 5, 12); }
  else if (style === 3) { for (let i = 0; i < 9; i++) R(36 + i * 6, 32 + Math.abs(4 - i) * 1.6, 7, 7, hr); }
  else { x.ellipse(60, 36, 27, 14, 0, Math.PI, 2 * Math.PI); x.fill(); x.beginPath(); x.moveTo(34, 38); x.lineTo(46, 26); x.lineTo(52, 34); x.lineTo(62, 24); x.lineTo(70, 34); x.lineTo(80, 27); x.lineTo(86, 40); x.lineTo(86, 36); x.fill(); }
  x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.ellipse(50, 32, 9, 3, -.3, 0, 7); x.fill();                 // hair shine
  x.strokeStyle = shade(hr, .9); x.lineWidth = 2.6; x.lineCap = 'round'; x.beginPath(); x.moveTo(42, 46); x.quadraticCurveTo(48, 43, 53, 45); x.moveTo(67, 45); x.quadraticCurveTo(72, 43, 78, 46); x.stroke();   // brows
  for (const ex of [48, 72]) { R(ex, 54, 4.2, 5, '#2a2320'); R(ex + 1.4, 52.4, 1.5, 1.5, '#fff'); }                    // eyes with a glint
  R(42, 63, 5, 3, 'rgba(240,120,120,.35)'); R(78, 63, 5, 3, 'rgba(240,120,120,.35)');                                 // cheeks
  x.strokeStyle = shade(sk, .72); x.lineWidth = 1.8; x.beginPath(); x.moveTo(60, 56); x.quadraticCurveTo(57, 62, 61, 63); x.stroke();   // nose
  x.strokeStyle = '#8a3f33'; x.lineWidth = 2.4; x.beginPath(); x.arc(60, 64, 7, .18 * Math.PI, .82 * Math.PI); x.stroke();          // smile
  if (specs) { x.strokeStyle = '#2b2f38'; x.lineWidth = 2.2; x.beginPath(); x.roundRect(39, 47, 18, 14, 5); x.roundRect(63, 47, 18, 14, 5); x.moveTo(57, 53); x.lineTo(63, 53); x.stroke(); }
  x.restore(); return FACES[k] = c.toDataURL(); }
function drawList() { LIST.textContent = ''; const act = orchs.filter(o => o.st === 'work');
  if (!act.length) { const r = document.createElement('div'); r.className = 'ar none'; r.textContent = 'Chưa orchestra nào đang làm'; LIST.append(r); return; }
  for (const o of act) { const r = document.createElement('div'); r.className = 'ar' + (meet && meet.o === o ? ' meet' : '') + (focusId === o.p.id ? ' sel' : ''); const im = document.createElement('img'); im.src = face(o); im.alt = '';
    const nm = document.createElement('span'); nm.textContent = '@' + o.p.id; const fl = document.createElement('small'); fl.textContent = 'T' + o.floor; r.append(im, nm, fl); r.onclick = () => focus(focusId === o.p.id ? null : o.p.id); LIST.append(r); } }
function focus(id) { focusId = byId[id] ? id : null; $('back').classList.toggle('on', !!focusId); drawList(); drawCol(); }
$('back').addEventListener('click', () => { if (VIEW3) { touched = -1e9; focus(null); } });
$('camb').addEventListener('click', () => { try { auto = localStorage.getItem('dp-cam') !== '0'; } catch (e) {} touched = -1e9; });
function overview() { const o = fit(T.x0 - 4, T.z0 - 2, T.x1 + 4, T.z1 + 6, .38, 0, TOP + 3); fitZ = o.z; return o; }
function officeView(yaw = cam.yaw) { return fit(T.x0 - .5, T.z0 - .5, T.x1 + .5, T.z1 + .8, yaw, TOP, TOP + 3); }
function chairView() { return fit(-.5, T.z0 - 1, W + .5, 0, .25, TOP, TOP + 3.5); }
function talkView() { return fit(-1, -5.5, W + 1, D + 2, cam.yaw, TOP, TOP + 3); }
function clampCam() { if (!isle) return; cam.z = Math.max(fitZ * .45, Math.min(fitZ * 5, cam.z)); cam.tx = Math.max(isle.x0, Math.min(isle.x1, cam.tx)); cam.tz = Math.max(isle.z0, Math.min(isle.z1, cam.tz)); cam.ty = Math.max(0, Math.min(TOP + 3, cam.ty)); }
function tapAt(x, z) { if (x > T.x0 - 1 && x < T.x1 + 1 && z > T.z0 - 1 && z < T.z1 + 2) { Object.assign(goal, cam.ty > TOP / 2 && cam.z > fitZ * 1.5 ? talkView() : officeView()); touched = performance.now(); return; } if (focusId) focus(null); }
function director(ms) { if (!auto || moving || ms - touched < 9000) return null;
  if (meet && meet.a) { const q = meet.a.g.position; return fit(q.x - 7, q.z - 6, q.x + 7, q.z + 6, cam.yaw, q.y - 1, q.y + 3); }
  if (meet && meet.ph === 'talk') return talkView();
  if (call || CHATS.busy) return officeView();
  const sl = Math.floor(ms / 12000) % 4; return sl === 0 ? overview() : sl === 2 ? chairView() : officeView(sl === 1 ? .1 : .7); }

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
    for (const q of p.questions || []) ev.push({o, key:p.id + q.id, t:q.asked || '', lines:[['o', 'Em hỏi ' + q.id + ': ' + q.text], ['b', 'Để anh trình Chủ tịch trả lời.']]}); }
  return ev; }
function scheduleMeetings() { const ev = talkEvents();
  if (!seenTalk) { seenTalk = {}; ev.forEach(e => seenTalk[e.key] = 1); const last = ev.filter(e => e.t).sort((a, b) => a.t < b.t ? 1 : -1)[0]; if (last) delete seenTalk[last.key]; }
  for (const e of ev) if (!seenTalk[e.key] && !meetQ.some(m => m.key === e.key) && !(meet && meet.key === e.key)) { seenTalk[e.key] = 1; meetQ.push(e); }
  saveSeen(); }
function chunks(text, n = 120) { const out = []; let cur = ''; for (const w of String(text).split(/\s+/)) { if ((cur + ' ' + w).length > n && cur) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } if (cur) out.push(cur); return out.slice(0, 4).map((c, i, a) => i === a.length - 1 && a.length === 4 && String(text).length > 480 ? c + ' …' : c); }
const floorY = o => .06 + o.floor * FH;
const inPath = o => [{x:ex, y:floorY(o), z:T.z1 - 1}, {x:ex, y:floorY(o), z:ez}, {x:ex, y:TOP, z:ez}, {x:ex, y:TOP, z:T.z1 - 1.1}, {x:ent, y:TOP, z:T.z1 - 1.1}, {x:ent, y:TOP, z:D - 1.1}, {x:visit.x, y:TOP, z:D - 1.1}, {x:visit.x, y:TOP, z:visit.z}];
function bubble(key, x, y, z) { const l = addLabel(key, '', x, y, z, 'say'); l.pri = -1; labels.unshift(labels.pop()); return l; }
function endCall() { if (callL) { callL.e.textContent = ''; } if (arc) { world.remove(arc); arc = null; } phoneS.visible = false; call = null; }
function meetTick(t, dt) {
  if (!meet && meetQ.length && !(ACT.game || {}).on) { const m = meetQ.shift(); meet = m; m.ph = 'call'; call = {t:0};
    const a = new THREE.Vector3(boss.x, TOP + 2.4, boss.z - 1.1), b = new THREE.Vector3(ex, floorY(m.o) + 1.6, T.z1 + .4), mid = a.clone().lerp(b, .5); mid.x += 6; mid.y += 3;
    arc = new THREE.Group(); arc.userData.curve = new THREE.QuadraticBezierCurve3(a, mid, b); for (let i = 0; i < 14; i++) { const d = new THREE.Mesh(SPH, DOTM); d.scale.setScalar(.32); d.renderOrder = 4; arc.add(d); } world.add(arc);
    callL.e.textContent = '☎ CEO gọi @' + m.o.p.id + ' ở tầng ' + m.o.floor + ' lên phòng'; callL.w = null; phoneS.position.set(boss.x + .55, 2.6, boss.z - 1.1); phoneS.visible = true; drawList(); }
  if (!meet) return; const m = meet, o = m.o;
  if (m.ph === 'call') { call.t += dt; const k = call.t; phoneS.position.y = 2.6 + Math.abs(Math.sin(k * 10)) * .12; arc.children.forEach((d, i) => { const u = ((i / 14) + k * .35) % 1; arc.userData.curve.getPoint(u, d.position); d.scale.setScalar(.2 + .2 * Math.sin(u * Math.PI)); });
    const cy = floorY(o) + .34 + .06; car.position.y += Math.sign(cy - car.position.y) * Math.min(Math.abs(cy - car.position.y), 9 * dt); if (k < 3.2 || Math.abs(cy - car.position.y) > .01) return; endCall(); const g = new THREE.Group(), b = person(o.tint, o.seed, 1, false); g.add(b); world.add(g); m.a = {g, b, path:inPath(o), d:0, dir:1}; m.ph = 'walk'; }
  if (m.ph === 'walk' || m.ph === 'back') { const a = m.a, L = plen(a.path); a.d = Math.max(0, Math.min(L, a.d + a.dir * 7 * dt)); const q = along(a.path, a.d); a.g.position.set(q.x, q.y + .34, q.z); if (q.dx || q.dz) a.g.rotation.y = Math.atan2(a.dir * q.dx, a.dir * q.dz); if (Math.abs(q.x - ex) < .05 && Math.abs(q.z - ez) < .05) car.position.y = q.y + .4; a.b.position.y = Math.abs(Math.sin(t * 11)) * .1;
    if (m.ph === 'walk' && a.d >= L) { world.remove(a.g); m.a = null; m.seat = person(o.tint, o.seed); m.seat.position.set(visit.x, .34, visit.z - .1); m.seat.rotation.y = Math.PI; up.add(m.seat);
      m.bo = bubble('say-b', boss.x, TOP + 3.0, boss.z - 1.1); m.bv = bubble('say-o', visit.x, TOP + 2.9, visit.z); m.bv.e.style.borderColor = shade(o.tint, .75); m.bo.e.classList.add('boss');
      m.lines2 = []; m.lines.forEach(([who, text]) => chunks(text).forEach(c => m.lines2.push([who, c]))); m.i = -1; m.t = 0; m.ph = 'talk'; }
    else if (m.ph === 'back' && a.d <= 0) { world.remove(a.g); meet = null; drawList(); } return; }
  if (m.ph === 'talk') { m.t -= dt; if (m.t > 0) { const sp = Math.abs(Math.sin(t * 12)) * .03; (m.lines2[m.i][0] === 'b' ? boss.m : m.seat).position.y = .34 + sp; return; }
    m.i++; if (m.i < m.lines2.length) { const [who, c] = m.lines2[m.i]; (who === 'b' ? m.bo : m.bv).e.textContent = c; (who === 'b' ? m.bv : m.bo).e.textContent = ''; m.bo.w = m.bv.w = null; m.t = 2.4 + c.length * .05; boss.m.position.y = m.seat.position.y = .34; return; }
    for (const l of [m.bo, m.bv]) { l.e.remove(); labels.splice(labels.indexOf(l), 1); } up.remove(m.seat); boss.m.position.y = .34;
    const g = new THREE.Group(), b = person(o.tint, o.seed, 1, false); g.add(b); world.add(g); m.a = {g, b, path:inPath(o), d:plen(inPath(o)), dir:-1}; m.ph = 'back'; } }

// ---- state: who works, what the list shows, which meetings are due
function populate() { const s = STATE, gm = (ACT.game || {}).on, gi = Object.fromEntries(s.groups.map((x, i) => [x.id, i])), old = byId; byId = {};
  orchs = s.projects.filter(p => !stored(p)).map(p => { const o = old[p.id] || {seed:hsh(p.id)}; Object.assign(o, {p, tint:GC[gi[p.group] % GC.length], st:gm ? 'sleep' : stateOf(p)}); byId[p.id] = o; return o; });
  if (meet && !byId[meet.o.p.id]) meet.o = {p:meet.o.p, tint:meet.o.tint, seed:meet.o.seed, floor:meet.o.floor};
  orchs.forEach(o => { o.floor = 1 + o.seed % (FL - 1); });
  if (chairL) { const nq = s.inbox.questions + s.inbox.person + pendingDel().length; chairL.e.textContent = nq ? '📋 ' + nq + ' việc chờ Chủ tịch' : ''; chairL.w = null; }
  drawList(); scheduleMeetings(); }

function along(path, d) { for (let i = 1; i < path.length; i++) { const p = path[i - 1], q = path[i], l = Math.hypot(q.x - p.x, (q.y || 0) - (p.y || 0), q.z - p.z); if (d <= l && l > 0) { const u = d / l; return {x:p.x + (q.x - p.x) * u, y:(p.y || 0) + ((q.y || 0) - (p.y || 0)) * u, z:p.z + (q.z - p.z) * u, dx:q.x - p.x, dz:q.z - p.z}; } d -= l; } const e = path[path.length - 1]; return {x:e.x, y:e.y || 0, z:e.z, dx:0, dz:0}; }
const plen = p => p.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - p[i].x, (q.y || 0) - (p[i].y || 0), q.z - p[i].z), 0);
// ---- sky, sun and weather from the phone's clock and WX
const skyNow = () => { const d = new Date(), h = d.getHours() + d.getMinutes() / 60, w = WX.now(), grey = w.wet || w.kind === 'fog' || w.cloud > 80;
  const k = h >= w.rise + .6 && h < w.set - .6 ? 'day' : h >= w.set - .6 && h < w.set + .5 ? 'dusk' : h >= w.rise - .5 && h < w.rise + .6 ? 'dawn' : 'night';
  const P = {day:grey ? ['#8fa3b4', '#d3dce3'] : ['#6fb4e6', '#dff1fa'], dusk:grey ? ['#8b7f94', '#d9c3b2'] : ['#e0804e', '#f9d9a6'], dawn:['#d999a4', '#fbe6c6'], night:['#0c1128', grey ? '#262b3d' : '#2a3560']}[k];
  return {k, h, w, top:P[0], bot:P[1], u:(h - w.rise) / (w.set - w.rise), v:((h - w.set + 24) % 24) / (24 - w.set + w.rise)}; };
let skyKey = '', flash = 0;
function weather(t, dt) { const s = skyNow(), w = s.w, key = s.k + w.kind + Math.round(s.h * 20);
  if (key !== skyKey) { skyKey = key; cv.style.background = 'linear-gradient(' + s.top + ',' + s.bot + ' 70%)'; const night = s.k === 'night', low = s.k !== 'day';
    const u = Math.max(.02, Math.min(.98, night ? s.v : s.u)), az = Math.PI * (1 - u), el = (night ? .7 : 1.15) * Math.sin(Math.PI * u) + .12, cx = (isle.x0 + isle.x1) / 2, cz = (isle.z0 + isle.z1) / 2;
    sun.position.set(cx + Math.cos(az) * Math.cos(el) * 70, Math.sin(el) * 70 + 10, cz + Math.sin(az) * Math.cos(el) * 30 + 10); sun.target.position.set(cx, 0, cz);
    sun.castShadow = !night; sun.color.set(night ? '#c4ccf0' : low ? '#ffb27a' : '#fff2d8'); sun.intensity = (night ? .55 : low ? 1.4 : 2.3) * (w.wet || w.cloud > 85 ? .45 : 1);
    hemi.color.set(night ? '#b4b9d6' : '#dfefff'); hemi.groundColor.set(night ? '#5a5048' : '#6b7f4a'); hemi.intensity = night ? 1.45 : w.wet ? 1.25 : 1.05;
    const lit = night || s.k === 'dusk'; litNow = lit; MGLOW.color.set(lit ? '#ffd27a' : w.wet ? '#c7d3dc' : '#cfe8fb'); for (const l of lamps) l.pool.material.opacity = lit ? (l.post ? .5 : .35) : 0;
    scene.fog = w.kind === 'fog' ? new THREE.Fog(s.bot, 40, 110) : null; if (pond) pond.mesh.material.color.set(night ? '#2a4660' : w.wet ? '#7d9db0' : '#6fb2d6'); if (pool) pool.mesh.material.color.set(night ? '#2a8fc0' : '#4fc3e8');
    const cc = night ? '#5a6280' : w.wet || w.cloud > 80 ? '#c9d0d8' : '#ffffff'; clouds.forEach(c => { c.material.color.set(cc); c.material.opacity = night ? .55 : .92; }); }
  const nc = Math.min(9, Math.round((w.cloud || 0) / 11) + (w.wet ? 2 : 0)), span = isle.x1 - isle.x0 + 30;
  clouds.forEach((c, i) => { c.visible = i < nc; if (!c.visible) return; const u = c.userData; c.position.set(isle.x0 - 15 + ((u.off + t * u.sp * (1 + (w.wind || 6) / 12)) % span), u.y, u.z); });
  const wet = w.wet || w.kind === 'snow'; rain.visible = wet; if (wet) { const a = rain.geometry.attributes.position.array, n = w.kind === 'drizzle' ? 350 : w.kind === 'snow' ? 300 : Math.min(900, 400 + (w.rain || 1) * 150), sp = w.kind === 'snow' ? 1.5 : 16, len = w.kind === 'snow' ? .12 : w.kind === 'drizzle' ? .35 : .7, wx = Math.min(.5, (w.wind || 6) / 40);
    rain.material.color.set(s.k === 'night' ? '#9fb0d0' : '#e6eef8'); rain.geometry.setDrawRange(0, n * 2);
    rain.userData.d.forEach((q, i) => { if (i >= n) return; q.y -= sp * dt; q.x += wx * sp * dt * .3; if (q.y < .3 || (q.y < TOP + 3 && q.x > T.x0 - .3 && q.x < T.x1 + .3 && q.z > T.z0 - .3 && q.z < T.z1 + .3)) { q.y = TOP + 6 + Math.random() * 4; q.x = isle.x0 + Math.random() * (isle.x1 - isle.x0); q.z = isle.z0 + Math.random() * (isle.z1 - isle.z0); }
      a.set([q.x, q.y, q.z, q.x - wx * len, q.y + len, q.z], i * 6); }); rain.geometry.attributes.position.needsUpdate = true; }
  if (w.kind === 'storm') { const ph = t % 9; flash = ph < .15 || (ph > .3 && ph < .36) ? 1 : 0; hemi.intensity = flash ? 3 : 1.25; } }

// ---- the loop
let VIEW3 = false, running = false, last = 0, zoomIn = false;
function frame(ms) { if (!running) return; requestAnimationFrame(frame); const wet = WX.now().wet, busy = moving || Object.keys(goal).length || meet || meetQ.length; if (ms - last < (busy || wet ? 30 : 60)) return; const dt = Math.min(.1, (ms - last) / 1000); last = ms; const t = ms / 1000;
  const dg = director(ms); if (dg) Object.assign(goal, dg); if (goal.z && !moving) { const a = 1 - Math.exp(-dt * 2.4); cam.tx += (goal.tx - cam.tx) * a; cam.tz += (goal.tz - cam.tz) * a; cam.z += (goal.z - cam.z) * a; cam.yaw += (goal.yaw - cam.yaw) * a; if (goal.ty != null) cam.ty += (goal.ty - cam.ty) * a; if (Math.abs(goal.z - cam.z) < .002 && Math.hypot(goal.tx - cam.tx, goal.tz - cam.tz) < .02) Object.keys(goal).forEach(k => delete goal[k]); applyCam(); }
  const zin = cam.z > fitZ * 1.6; if (zin !== zoomIn) { zoomIn = zin; stage.classList.toggle('zoomin', zin); }
  if (!(meet && meet.ph === 'talk')) { boss.m.position.y = .34 + (CHATS.busy ? Math.abs(Math.sin(t * 8)) * .05 : 0); boss.m.rotation.y = CHATS.busy ? Math.sin(t * 1.2) * .3 : Math.sin(t * .3) * .1; } if (chair.m) chair.m.rotation.y = Math.sin(t * .22 + 1) * .12;
  meetTick(t, dt); weather(t, dt); placeLabels(cam.z / fitZ); R.render(scene, camera); }
function size() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return false; R.setSize(w, h, false); applyCam(); return true; }
function wake() { const on = VIEW3 && cur === 'office' && !document.hidden && STATE; if (on && !running) { if (!size()) return; if (!world) set(STATE); running = true; last = performance.now(); requestAnimationFrame(frame); } else if (!on) running = false; }
function set(s) { if (!s || !VIEW3) return; if (!stage.clientWidth) return; const fresh = build(s); populate(); if (fresh) { size(); const o = overview(); Object.assign(cam, o); clampCam(); applyCam(); skyKey = ''; } }
function show(on) { VIEW3 = on; stage.classList.toggle('v3', on); if (on) { set(STATE); wake(); } else { running = false; stage.classList.remove('zoomin'); } }
addEventListener('resize', () => { if (VIEW3 && size()) { overview(); } });

document.addEventListener('visibilitychange', wake);
window.O3D = {set, note() {}, boss() {}, focus, wake, sky() { skyKey = ''; }, show};
