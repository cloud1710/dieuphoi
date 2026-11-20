// The office in 3D: a small diorama island seen from above at an angle. Rooms are cut-away boxes with a desk, a
// person and a lamp; the hall has the owner's door, the projector and the manager. Around it: grass, trees, palms,
// a pond, a stone path. The sun, the sky, clouds and rain follow the real time and weather where the phone is (WX).
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
sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; scene.add(hemi, sun, sun.target);

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

// ---- the world, rebuilt when the list of projects changes
const TW = 8, TD = 6.2, G = 1.4, HALL = 7.5;
let world = null, rooms = [], byId = {}, crates = [], walkers = [], fly = [], W = 0, D = 0, cols = 4, isle = null, boss = null, door = null, screen = null, labels = [], sig = '', lamps = [], pools = [], clouds = [], rain = null, pond = null;
const STMAT = Object.fromEntries(Object.entries(COL).map(([k, c]) => [k, new THREE.MeshBasicMaterial({color:c})]));
function build(s) {
  const heads = s.projects.filter(p => !stored(p)), gi = Object.fromEntries(s.groups.map((x, i) => [x.id, i])); cols = stage.clientWidth > 700 ? 6 : 4;
  heads.sort((a, b) => gi[a.group] - gi[b.group] || (a.parent || a.id).localeCompare(b.parent || b.id) || (a.parent ? 1 : 0) - (b.parent ? 1 : 0));
  const box = s.projects.filter(stored), key = JSON.stringify([cols, heads.map(p => p.id + p.group), box.map(p => p.id)]);
  if (key === sig) return false; sig = key;
  if (world) { scene.remove(world); world.traverse(o => { if (o.geometry && o.geometry !== BOX) o.geometry.dispose(); }); }
  world = new THREE.Group(); scene.add(world); LB.textContent = ''; labels = []; lamps = []; pools = [];
  const rows = Math.ceil(heads.length / cols), crateRows = Math.ceil(box.length / (cols * 2));
  W = cols * TW + (cols + 1) * G; D = G + HALL + G + rows * (TD + G) + (box.length ? 1.2 + crateRows * 1.6 + G : 0);
  const S = Baker(), L = Baker();                                     // solid and glowing
  // island: grass on top of soil, a margin all round, more in front for the garden
  const mx = 9, mz0 = 8, mz1 = 13, iw = W + 2 * mx, id = D + mz0 + mz1; isle = {x0:-mx, z0:-mz0, x1:W + mx, z1:D + mz1};
  const sh = new THREE.Shape(), r = 4.5, ix = -mx, iz = -mz0; sh.moveTo(ix + r, iz); sh.lineTo(ix + iw - r, iz); sh.quadraticCurveTo(ix + iw, iz, ix + iw, iz + r); sh.lineTo(ix + iw, iz + id - r); sh.quadraticCurveTo(ix + iw, iz + id, ix + iw - r, iz + id); sh.lineTo(ix + r, iz + id); sh.quadraticCurveTo(ix, iz + id, ix, iz + id - r); sh.lineTo(ix, iz + r); sh.quadraticCurveTo(ix, iz, ix + r, iz);
  const grass = new THREE.ExtrudeGeometry(sh, {depth:.5, bevelEnabled:false, curveSegments:4}); grass.rotateX(Math.PI / 2); S.add(grass, '#86bf5e', 0, 0, 0);
  const soil = new THREE.ExtrudeGeometry(sh, {depth:2.6, bevelEnabled:false, curveSegments:4}); soil.rotateX(Math.PI / 2); S.add(soil, '#8a6243', 0, -.5, 0, 0, 1, 1, 1); S.add(soil, '#6f5038', 0, -2.4, 0, 0, 1, .35, 1);
  // building slab and the hall
  S.box(W + .6, .3, D + .6, '#cdbb98', W / 2, 0, D / 2); S.box(W, .06, D, '#e9d6b1', W / 2, .3, D / 2);
  for (let z = .9; z < D; z += 1.8) S.box(W, .005, .05, '#d8c29a', W / 2, .36, z);
  S.box(W, 2.6, .3, '#efe6d4', W / 2, .3, G - .15); S.box(.3, 2.6, HALL + G, '#e7dcc6', .15, .3, (HALL + G) / 2); S.box(W, .16, .34, '#c9b48d', W / 2, 2.9, G - .15);
  const HZ = G + HALL; door = {x:3.2, z:G + .9}; boss = {x:W - 6, z:G + 4.1};
  S.box(1.6, 2.2, .14, '#6e4b33', door.x, .3, G + .05); S.box(1.3, 1.9, .06, '#8a6244', door.x, .45, G + .14); S.add(SPH, '#f2c94c', door.x + .45, 1.45, G + .2, 0, .14, .14, .14); S.box(1.9, .03, 1, '#b5563c', door.x, .33, G + .7);
  for (const wx of [7.5, W - 9]) { L.box(2.2, 1.1, .04, '#ffffff', wx, 1.3, G + .02); S.box(2.4, .12, .2, '#d9cdb5', wx, 1.22, G + .05); S.box(.08, 1.1, .06, '#d9cdb5', wx, 1.3, G + .05); lamps.push({x:wx, z:G + 1.5, r:2.2}); }
  S.add(CYL, '#d8b24a', boss.x, .36, boss.z + .7, 0, 4.2, .03, 2.6); deskAt(S, L, boss.x, boss.z, '#7d5b3d');
  screen = mkScreen(); screen.position.set(W / 2 - 1.5, 1.85, G + .2); world.add(screen); S.box(7.4, .12, .12, '#7d8794', W / 2 - 1.5, 3.05, G + .15);
  plantAt(S, door.x + 2.4, G + 1, 1.1); plantAt(S, W - 1.4, G + 1, 1.2);
  addLabel('door', 'Anh Vinh', door.x, 2.9, G + .2, 'tag'); addLabel('boss', 'Tổng quản', boss.x, .4, boss.z + 1.9, 'tag');
  // rooms
  rooms = []; byId = {};
  heads.forEach((p, i) => { const c = i % cols, rr = Math.floor(i / cols), x0 = G + c * (TW + G), z0 = HZ + G + rr * (TD + G), seed = hsh(p.id), tint = GC[gi[p.group] % GC.length];
    const rm = {p, x0, z0, cx:x0 + TW / 2, cz:z0 + TD / 2 + .3, tint, first:i === 0 || heads[i - 1].group !== p.group, gname:s.groups[gi[p.group]].name}; rooms.push(rm); byId[p.id] = rm;
    S.box(TW, .04, TD, shade(tint, 1.12), rm.cx, .34, z0 + TD / 2); S.box(TW - 2.4, .02, TD - 2.6, tint, rm.cx, .38, rm.cz + .2);
    S.box(TW, 1.5, .22, '#f6f0e3', rm.cx, .3, z0 + .11); S.box(TW, .14, .26, shade(tint, .85), rm.cx, 1.8, z0 + .11); S.box(.22, 1.5, TD, '#ece4d3', x0 + .11, .3, z0 + TD / 2); S.box(.26, .14, TD, shade(tint, .85), x0 + .11, 1.8, z0 + TD / 2);
    deskAt(S, L, rm.cx, rm.cz, '#9a7350'); lamps.push({x:rm.cx, z:rm.cz, r:2.8, room:rm}); rm.light = new THREE.Mesh(BOX, STMAT.sleep); rm.light.scale.set(.18, .18, .18); rm.light.position.set(rm.cx + .95, 1.3, rm.cz + .15); world.add(rm.light);
    const k = seed % 4; if (k === 0) plantAt(S, x0 + TW - .8, z0 + .9, .9); else if (k === 1) shelfAt(S, x0 + TW - 1.3, z0 + .55, seed); else if (k === 2) { S.box(2, 1.1, .06, '#ffffff', rm.cx - 1.5, .9, z0 + .25); S.box(2.1, .08, .1, '#9aa3ad', rm.cx - 1.5, .86, z0 + .27); for (let j = 0; j < 3; j++) S.box(.9 - j * .2, .05, .02, ['#d2553d', '#3f73a8', '#3f9d74'][j], rm.cx - 1.9, 1.7 - j * .25, z0 + .29); } else plantAt(S, x0 + .8, z0 + TD - .8, .8);
    if ((seed >> 5) % 2) { S.box(.08, 1.6, .08, '#6b6f7a', x0 + .9, .34, z0 + .9); S.add(CONE, '#e9dcc0', x0 + .9, 2.05, z0 + .9, 0, .55, .45, .55); L.add(SPH, '#ffe1a0', x0 + .9, 1.88, z0 + .9, 0, .25, .2, .25); lamps.push({x:x0 + .9, z:z0 + .9, r:1.6, room:rm}); }
    rm.head = person(tint, seed); rm.head.position.set(rm.cx, .34, rm.cz - .95); world.add(rm.head); rm.extra = [];
    addLabel(p.id, '@' + p.id, rm.cx, 2.0, z0 + .1, 'name'); rm.plq = addLabel(p.id + ':st', '', rm.cx, .4, rm.cz + 1.6, 'st');
    if (rm.first) addLabel(p.id + ':g', rm.gname, x0 + .2, 2.0, z0 - .15, 'wing'); });
  // crates for finished or stored projects, at the front
  crates = []; const cz = HZ + G + rows * (TD + G) + .6; box.forEach((p, i) => { const x = G + 1 + (i % (cols * 2)) * ((W - 2 * G) / (cols * 2)), z = cz + Math.floor(i / (cols * 2)) * 1.6;
    S.box(.9, .7, .9, '#c9a36b', x, .34, z); S.box(.92, .1, .92, '#b48d57', x, .7, z); S.box(.2, .72, .92, '#e9dcc0', x, .33, z); crates.push(addLabel(p.id + ':box', p.name, x, 1.2, z, 'box')); });
  if (box.length) addLabel('kho', 'KHO · ĐÃ XONG HOẶC BẢN LƯU', G, .5, cz - .9, 'wing');
  // garden: a stone path out of the front, a pond, trees and palms on the margin, bushes, flowers and rocks
  for (let z = D + .8; z < D + mz1 - .8; z += 1.1) S.add(CYL, '#d9c7a3', W / 2 + Math.sin(z) * .3, .02, z, z, 1.1, .06, .8);
  S.box(1.6, .5, .5, '#cdbb98', W / 2, 0, D + .4);
  pond = {x:W + mx * .45, z:D + mz1 * .5}; S.add(CYL, '#6f8f6a', pond.x, -.02, pond.z, 0, 5.4, .06, 3.6); const water = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, .05, 18), new THREE.MeshLambertMaterial({color:0x6fb2d6, transparent:true, opacity:.88}));
  water.scale.set(1, 1, .64); water.position.set(pond.x, .03, pond.z); water.receiveShadow = true; world.add(water); pond.mesh = water; for (let j = 0; j < 3; j++) S.add(CYL, '#4f9a45', pond.x - 1 + j * .9, .07, pond.z + (j % 2 ? .5 : -.4), 0, .5, .02, .5);
  let rs = 11; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647, free = (x, z, m = 1) => !(x > -m && x < W + m && z > -m && z < D + m) && Math.hypot(x - pond.x, (z - pond.z) * 1.5) > 3.6 && (z < D || Math.abs(x - W / 2) > 1.7);
  const trees = []; for (let t = 0; t < 900 && trees.length < 46 + cols * 4; t++) { const x = isle.x0 + 1.2 + rnd() * (iw - 2.4), z = isle.z0 + 1.2 + rnd() * (id - 2.4); if (!free(x, z, 1.3) || trees.some(o => Math.hypot(o.x - x, o.z - z) < 2.3)) continue; trees.push({x, z}); }
  for (const t of trees) { const k = rnd(); if (k < .38) treeAt(S, t.x, t.z, .9 + rnd() * .5, rnd()); else if (k < .6) pineAt(S, t.x, t.z, .9 + rnd() * .5); else if (k < .85) palmAt(S, t.x, t.z, 1 + rnd() * .3, rnd()); else bushAt(S, t.x, t.z, rnd()); }
  for (let t = 0; t < 140; t++) { const x = isle.x0 + .8 + rnd() * (iw - 1.6), z = isle.z0 + .8 + rnd() * (id - 1.6); if (!free(x, z, .6)) continue; const k = rnd();
    if (k < .5) S.add(CONE, '#6fa64c', x, .12, z, rnd() * 6, .18, .35, .18); else if (k < .8) { S.box(.08, .25, .08, '#4f8a3a', x, 0, z); S.add(SPH, ['#f4d35e', '#ef8fa8', '#ffffff', '#e85d5d', '#b48ef0'][Math.floor(rnd() * 5)], x, .3, z, 0, .2, .16, .2); } else S.add(DOD, '#9aa0a2', x, .1, z, rnd() * 6, .5 + rnd() * .5, .35, .45); }
  for (const [x, z] of [[W / 2 - 1.6, D + 2.5], [W / 2 + 1.6, D + 7.5], [-mx * .5, D * .3], [W + mx * .5, D * .2]]) { S.box(.12, 2.2, .12, '#4b4f58', x, 0, z); S.box(.3, .1, .3, '#4b4f58', x, 2.2, z); L.add(SPH, '#fff0c8', x, 2.42, z, 0, .32, .32, .32); lamps.push({x, z, r:2.6, post:true}); }
  const solid = S.mesh(MSOLID); solid.castShadow = solid.receiveShadow = true; world.add(solid); world.add(L.mesh(MGLOW));
  for (const l of lamps) { const m = new THREE.Mesh(new THREE.CircleGeometry(l.r, 20), new THREE.MeshBasicMaterial({color:0xffc870, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false})); m.rotation.x = -Math.PI / 2; m.position.set(l.x, .4, l.z); world.add(m); l.pool = m; }
  // clouds and rain live with the island
  clouds = []; for (let i = 0; i < 9; i++) { const b = Baker(); for (let j = 0; j < 5; j++) b.add(ICO, '#ffffff', (j - 2) * 1.1, Math.sin(j * 2.1) * .4, Math.cos(j * 1.7) * .7, j, 1.6 + (j % 2) * .6, 1.2 + (j % 3) * .3, 1.4);
    const m = b.mesh(new THREE.MeshLambertMaterial({vertexColors:true, transparent:true, opacity:.95})); m.castShadow = true; m.userData = {sp:.4 + (i % 3) * .25, z:isle.z0 - 14 + (i * 5.3) % 12, y:9 + (i % 3) * 2.5, off:i * 13.7}; world.add(m); clouds.push(m); }
  const N = 900, rp = new Float32Array(N * 6); rain = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color:0xdde8f6, transparent:true, opacity:.55}));
  rain.geometry.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rain.userData.d = Array.from({length:N}, () => ({x:isle.x0 + Math.random() * iw, z:isle.z0 + Math.random() * id, y:Math.random() * 16})); rain.frustumCulled = false; world.add(rain);
  // shadows cover the island
  const sc = sun.shadow.camera, half = Math.max(iw, id) * .62; sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 160; sc.updateProjectionMatrix();
  walkers.forEach(w => world.remove(w.m)); walkers = []; return true; }
function shade(c, k) { const x = C(c); x.multiplyScalar(k); return '#' + x.getHexString(); }
function deskAt(S, L, x, z, wood) { S.box(2.6, .1, 1.1, wood, x, .98, z); S.box(.12, .64, 1, shade(wood, .8), x - 1.2, .34, z); S.box(.12, .64, 1, shade(wood, .8), x + 1.2, .34, z); S.box(2.3, .4, .06, shade(wood, .85), x, .58, z - .4);
  S.box(1.05, .05, .7, '#3a3f4a', x, 1.08, z + .1); S.box(1.05, .68, .05, '#2b2f38', x, 1.1, z - .25, 0); L.box(.95, .58, .01, '#bfe3ff', x, 1.15, z - .28); S.add(CYL, '#f4f0e6', x + .85, 1.08, z + .2, 0, .18, .2, .18);
  S.box(.7, .1, .7, '#4a4f5c', x, .58, z - 1.05); S.box(.7, .8, .1, '#4a4f5c', x, .6, z - 1.4); }
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

// ---- the projector: slides drawn on a canvas
function mkScreen() { const c = document.createElement('canvas'); c.width = 640; c.height = 300; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.3), new THREE.MeshBasicMaterial({map:t})); m.userData = {c, t, key:''}; const fr = new THREE.Mesh(new THREE.BoxGeometry(7.3, 3.6, .08), new THREE.MeshLambertMaterial({color:0x2b2f38})); fr.position.z = -.06; m.add(fr); return m; }
function slides() { const s = STATE, out = [], gm = ACT.game || {}, mb = [...CHATS.messages].reverse(), lastU = mb.find(m => m.who === 'vinh'), lastB = mb.find(m => m.who !== 'vinh');
  if (CHATS.busy) out.push({tag:'TỔNG QUẢN · đang làm việc anh giao', big:(CHATS.step || 'đang trả lời'), sub:lastU ? 'Anh nhắn: ' + lastU.text : '', c:COL.ready});
  else if (lastB && !focusId) out.push({tag:'TỔNG QUẢN · trả lời lúc ' + lastB.t.slice(11), big:'Báo cáo anh', sub:lastB.text.replace(/\*\*/g, ''), c:COL.ready});
  if (gm.on) { out.push({tag:'CHẾ ĐỘ CHƠI GAME', big:'Agents đang nghỉ', sub:'Tạm dừng từ ' + (gm.since || ''), c:COL.wait}); return out; }
  pendingDel().slice(0, 2).forEach(r => out.push({tag:'ĐỀ XUẤT XOÁ ' + r.id, big:'Chờ anh xác nhận xoá', sub:r.items.map(i => i.show).join(', ') + ' · ' + r.why, c:COL.ask}));
  for (const rm of rooms) { const p = rm.p; if (focusId && p.id !== focusId) continue; const a = (ACT.claude[p.id] || []).find(a => a.age < 300), w0 = (p.working || [])[0];
    if (a) out.push({id:p.id, tag:'@' + p.id, big:a.what, sub:w0 ? w0.id + ': ' + w0.title : p.name, c:COL.work}); else if (w0) out.push({id:p.id, tag:'@' + p.id, big:'Đang làm ' + w0.id, sub:w0.title, c:COL.work});
    (p.questions || []).slice(0, 1).forEach(q => out.push({id:p.id, tag:'@' + p.id + ' · hỏi anh ' + q.id, big:'Chờ anh trả lời', sub:q.text, c:COL.ask})); }
  if (!out.length) out.push({tag:'TỔNG QUẢN', big:'Chưa có việc đang chạy', sub:s ? (s.inbox.questions + s.inbox.person) + ' việc chờ anh' : '', c:COL.ready}); return out; }
let SL = [], slideI = 0;
function paintScreen(t) { if (!screen) return; const n = SL.length || 1, i = CHATS.busy ? 0 : Math.floor(t / 6) % n, sl = SL[i] || {tag:'', big:'', sub:'', c:COL.ready}, key = i + JSON.stringify(sl) + n; slideI = i;
  const u = screen.userData; if (u.key === key) return; u.key = key; const x = u.c.getContext('2d'), w = u.c.width, h = u.c.height;
  x.fillStyle = '#fbfaf6'; x.fillRect(0, 0, w, h); x.fillStyle = sl.c; x.fillRect(22, 24, 9, h - 48);
  x.font = '700 22px system-ui,sans-serif'; x.fillStyle = sl.c; x.fillText(clip(x, sl.tag.toUpperCase(), w - 110), 50, 52);
  x.font = '800 42px system-ui,sans-serif'; x.fillStyle = '#23211d'; x.fillText(clip(x, sl.big.charAt(0).toUpperCase() + sl.big.slice(1), w - 80), 50, 106);
  x.font = '500 23px system-ui,sans-serif'; x.fillStyle = '#5f5a50'; let line = '', y = 148; for (const wd of String(sl.sub).split(' ')) { const tt = line ? line + ' ' + wd : wd; if (x.measureText(tt).width > w - 90) { x.fillText(line, 50, y); y += 31; line = wd; if (y > 240) { line = ''; break; } } else line = tt; } if (line) x.fillText(line, 50, y);
  x.font = '600 18px system-ui,sans-serif'; x.fillStyle = '#98a0ae'; x.textAlign = 'right'; x.fillText((i + 1) + '/' + n, w - 24, h - 22); x.textAlign = 'left'; u.t.needsUpdate = true; }
const clip = (x, s, w) => { if (x.measureText(s).width <= w) return s; while (s.length > 1 && x.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };

// ---- labels in HTML, placed over the 3D world every frame
function addLabel(key, text, x, y, z, kind) { const e = document.createElement('div'); e.className = 'l3 ' + kind; e.textContent = text; LB.append(e); const l = {key, e, p:new THREE.Vector3(x, y, z), kind}; labels.push(l); return l; }
const v3 = new THREE.Vector3();
function placeLabels(zr) { const w = stage.clientWidth, h = stage.clientHeight;
  for (const l of labels) { const show = l.kind === 'tag' ? zr > .5 : l.kind === 'name' ? zr > 1.35 || l.hot : l.kind === 'wing' ? zr > 1.35 : zr > 1.9; if (!show || (l.kind === 'st' && !l.e.textContent)) { if (l.on !== false) { l.e.style.display = 'none'; l.on = false; } continue; }
    v3.copy(l.p).project(camera); const x = (v3.x + 1) / 2 * w, y = (1 - v3.y) / 2 * h; if (x < -80 || x > w + 80 || y < -30 || y > h + 30) { if (l.on !== false) { l.e.style.display = 'none'; l.on = false; } continue; }
    if (l.on !== true) { l.e.style.display = ''; l.on = true; } l.e.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(' + (l.kind === 'wing' ? '0' : '-50%') + ',-100%)'; } }

// ---- the camera: isometric-ish, pans on the ground, pinches to zoom, twists to turn
const cam = {tx:0, tz:0, z:1, yaw:.38, pitch:.8}, goal = {}; let fitZ = 1, auto = true, touched = -1e9, moving = false;
try { auto = localStorage.getItem('dp-cam') !== '0'; } catch (e) {}
function aspect() { return stage.clientWidth / Math.max(1, stage.clientHeight); }
function applyCam() { const a = aspect(); camera.left = -V * a / 2; camera.right = V * a / 2; camera.top = V / 2; camera.bottom = -V / 2; camera.zoom = cam.z;
  const d = 60, cp = Math.cos(cam.pitch); camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * d, Math.sin(cam.pitch) * d, cam.tz + Math.cos(cam.yaw) * cp * d); camera.lookAt(cam.tx, 0, cam.tz); camera.updateProjectionMatrix(); }
function fit(x0, z0, x1, z1, yaw = cam.yaw) { const save = {...cam}; cam.yaw = yaw; cam.tx = (x0 + x1) / 2; cam.tz = (z0 + z1) / 2; cam.z = 1; applyCam(); camera.updateMatrixWorld();
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) for (const y of [0, 3]) { v3.set(x, y, z).project(camera); a = Math.min(a, v3.x); b = Math.max(b, v3.x); c = Math.min(c, v3.y); d = Math.max(d, v3.y); }
  const z = Math.min(2 / (b - a), 2 / (d - c)), out = {tx:cam.tx, tz:cam.tz, z, yaw}; Object.assign(cam, save); applyCam(); return out; }
function overview() { const o = fit(isle.x0 + 1, isle.z0 + 1, isle.x1 - 1, isle.z1 - 1, .38); fitZ = o.z; return o; }
function clampCam() { if (!isle) return; cam.z = Math.max(fitZ * .55, Math.min(fitZ * 7, cam.z)); cam.tx = Math.max(isle.x0, Math.min(isle.x1, cam.tx)); cam.tz = Math.max(isle.z0, Math.min(isle.z1, cam.tz)); }
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
function tapAt(x, z) { const rm = rooms.find(r => x >= r.x0 && x <= r.x0 + TW && z >= r.z0 && z <= r.z0 + TD), sx = screen.position.x;
  if (Math.abs(x - sx) < 3.6 && z < G + 2.5 && z > G - .5) { const sl = SL[slideI]; if (sl && sl.id) focus(sl.id); return; }
  if (rm) return focus(rm.p.id === focusId ? null : rm.p.id); if (Math.hypot(x - door.x, z - door.z) < 2 || Math.hypot(x - boss.x, z - boss.z) < 2.2) return tab('work'); if (focusId) focus(null); }
function focus(id) { const rm = byId[id]; focusId = rm ? id : null; $('back').classList.toggle('on', !!focusId); $('hint').style.display = focusId ? 'none' : '';
  Object.assign(goal, rm ? fit(rm.x0 - .5, rm.z0 - .5, rm.x0 + TW + .5, rm.z0 + TD + 1) : overview()); SL = slides(); paintScreen(performance.now() / 1000); drawCol(); }
$('back').addEventListener('click', () => { if (VIEW3) { touched = -1e9; focus(null); } });
$('camb').addEventListener('click', () => { try { auto = localStorage.getItem('dp-cam') !== '0'; } catch (e) {} touched = -1e9; });
function director(ms) { if (!auto || focusId || moving || ms - touched < 9000 || (ACT.game || {}).on) return null;
  if (CHATS.busy) return fit(W / 2 - 9, G - 1, W - 1, G + HALL + 1);
  const f = fly[fly.length - 1]; if (f && byId[f.to]) { const r = byId[f.to]; return fit(r.x0 - 2, r.z0 - 2, r.x0 + TW + 2, r.z0 + TD + 2); }
  const act = rooms.filter(r => stateOf(r.p) === 'work'); if (act.length && Math.floor(ms / 9000) % 3) { const r = act[Math.floor(ms / 27000) % act.length]; return fit(r.x0 - 1.5, r.z0 - 1.5, r.x0 + TW + 1.5, r.z0 + TD + 1.5); }
  return overview(); }

// ---- life: who sits, who walks, what glows
function populate() { const gm = (ACT.game || {}).on;
  for (const rm of rooms) { const p = rm.p, st = gm ? 'sleep' : stateOf(p); rm.st = st; rm.light.material = STMAT[st];
    const a0 = (ACT.claude[p.id] || []).find(a => a.age < 300), w0 = (p.working || [])[0], pg = progs(p.id)[0], q0 = (p.questions || [])[0], r0 = (p.ready || [])[0];
    const say = st === 'work' ? (a0 ? a0.what : w0 ? 'đang làm ' + w0.id : pg ? 'đang chạy ' + (pg.script || pg.name) : 'phiên đang mở') : q0 ? 'chờ anh trả lời ' + q0.id : r0 ? 'sẵn sàng ' + r0.id + ' · ' + r0.title : st === 'sleep' ? 'đang nghỉ' : p.waiting ? p.waiting + ' mục bị chặn' : 'không có việc mở';
    rm.plq.e.textContent = say.charAt(0).toUpperCase() + say.slice(1); rm.plq.e.style.borderLeftColor = COL[st];
    const nm = labels.find(l => l.key === p.id); if (nm) { nm.hot = st === 'work' || st === 'ask' || !!p.mail; nm.e.textContent = '@' + p.id; if ((p.questions || []).length) { const b = document.createElement('em'); b.textContent = p.questions.length + ' ?'; nm.e.append(b); } if (p.mail) { const b = document.createElement('em'); b.className = 'm'; b.textContent = '✉' + p.mail; nm.e.append(b); } }
    if (rm.sign) { rm.head.remove(rm.sign); rm.sign = null; } if (st === 'ask' || st === 'sleep') { rm.sign = sign(st === 'ask' ? '?' : 'z', COL[st]); rm.sign.position.set(.5, 2.1, 0); rm.head.add(rm.sign); }
    const want = st === 'work' ? Math.min(2, Math.max(0, (p.working || []).length + (p.sessions || 0) - 1) + Math.max(0, (ACT.claude[p.id] || []).filter(a => a.age < 300).length - 1)) : 0;
    while (rm.extra.length > want) world.remove(rm.extra.pop()); while (rm.extra.length < want) { const k = rm.extra.length, m = person(rm.tint, hsh(p.id + k), .8); m.position.set(rm.x0 + (k ? TW - 1.3 : 1.3), .34, rm.z0 + TD - 1.4); m.rotation.y = k ? -.9 : .9; world.add(m); rm.extra.push(m); } }
  const nq = STATE ? STATE.inbox.questions + STATE.inbox.person + pendingDel().length : 0, dl = labels.find(l => l.key === 'door'); if (dl) { dl.e.textContent = 'Anh Vinh'; if (nq) { const b = document.createElement('em'); b.textContent = nq; dl.e.append(b); } }
  if (!boss.m) { boss.m = person('#3f73a8', 77, 1.05); boss.m.position.set(boss.x, .34, boss.z - .95); world.add(boss.m); }
  // couriers: a question walks to the door, a letter from the manager, a report up to the parent
  const old = Object.fromEntries(walkers.map(w => [w.key, w])), keep = []; const mk = (key, rm, kind, glyph, a, b) => { let w = old[key]; if (!w) { w = {key, m:new THREE.Group(), t:Math.random() * 20, leg:0}; const body = person(COL[kind], hsh(key), .62, false); w.m.add(body); w.body = body; const s = sign(glyph, COL[kind]); s.position.set(0, 1.45, 0); s.scale.set(.6, .6, 1); w.m.add(s); world.add(w.m); w.m.position.set(a.x, .34, a.z); }
    w.path = route(a, b); w.rm = rm; keep.push(w); };
  if (!gm) for (const rm of rooms) { const p = rm.p, home = {x:rm.cx + 1.8, z:rm.z0 + TD - 1, zc:rm.z0 + TD + G / 2, vx:rm.x0 + TW + G / 2};
    if ((p.questions || []).length) mk(p.id + ':ask', rm, 'ask', '?', home, {x:door.x + 1, z:door.z + 1.6, zc:G + HALL + G / 2});
    if (p.mail) mk(p.id + ':mail', rm, 'mail', '✉', {x:boss.x - 1.6, z:boss.z + 1.2, zc:G + HALL + G / 2, vx:boss.x - 3}, {x:rm.cx - 1.5, z:rm.z0 + TD - 1.2, zc:rm.z0 + TD + G / 2});
    if (p.parent && byId[p.parent]) { const pr = byId[p.parent]; mk(p.id + ':link', rm, 'link', '↑', {x:rm.cx - 2.2, z:rm.z0 + TD - 1, zc:rm.z0 + TD + G / 2, vx:rm.x0 - G / 2}, {x:pr.cx + 2, z:pr.z0 + TD - 1, zc:pr.z0 + TD + G / 2}); } }
  for (const w of walkers) if (!keep.includes(w)) world.remove(w.m); walkers = keep; SL = slides(); }
function route(a, b) { const vx = a.vx != null ? a.vx : a.x; return [a, {x:a.x, z:a.zc}, {x:vx, z:a.zc}, {x:vx, z:b.zc}, {x:b.x, z:b.zc}, b]; }
function along(path, d) { for (let i = 1; i < path.length; i++) { const p = path[i - 1], q = path[i], l = Math.hypot(q.x - p.x, q.z - p.z); if (d <= l) return {x:p.x + (q.x - p.x) * d / l, z:p.z + (q.z - p.z) * d / l, dx:q.x - p.x, dz:q.z - p.z}; d -= l; } const e = path[path.length - 1]; return {x:e.x, z:e.z, dx:0, dz:0}; }
const plen = p => p.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - p[i].x, q.z - p[i].z), 0);
function walk(w, dt) { const L = plen(w.path), v = 2.6, go = L / v, cyc = go * 2 + 8 + 14; w.t = (w.t + dt) % cyc; const t = w.t; let d, moving = true;
  if (t < go) d = t * v; else if (t < go + 8) { d = L; moving = false; } else if (t < go * 2 + 8) d = L - (t - go - 8) * v; else { d = 0; moving = false; }
  const p = along(w.path, d); w.m.position.x = p.x; w.m.position.z = p.z; if (moving) { const back = t > go; w.m.rotation.y = Math.atan2(back ? -p.dx : p.dx, back ? -p.dz : p.dz); w.body.position.y = Math.abs(Math.sin(t * 9)) * .08; } else { w.body.position.y = 0; w.m.rotation.y = 0; } }

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
    sun.color.set(night ? '#9fb3ff' : low ? '#ffb27a' : '#fff2d8'); sun.intensity = (night ? .75 : low ? 1.4 : 2.3) * (w.wet || w.cloud > 85 ? .45 : 1);
    hemi.color.set(night ? '#8a9ad0' : '#dfefff'); hemi.groundColor.set(night ? '#3a3a4a' : '#6b7f4a'); hemi.intensity = night ? 1.15 : w.wet ? 1.25 : 1.05;
    const lit = night || s.k === 'dusk'; MGLOW.color.set(lit ? '#ffd27a' : w.wet ? '#c7d3dc' : '#cfe8fb'); for (const l of lamps) l.pool.material.opacity = lit ? (l.post ? .3 : l.room ? (l.room.st === 'sleep' ? .06 : .22) : .2) : 0;
    scene.fog = w.kind === 'fog' ? new THREE.Fog(s.bot, 40, 110) : null; if (pond) pond.mesh.material.color.set(night ? '#2a4660' : w.wet ? '#7d9db0' : '#6fb2d6');
    const cc = night ? '#5a6280' : w.wet || w.cloud > 80 ? '#c9d0d8' : '#ffffff'; clouds.forEach(c => { c.material.color.set(cc); c.material.opacity = night ? .55 : .92; }); }
  const nc = Math.min(9, Math.round((w.cloud || 0) / 11) + (w.wet ? 2 : 0)), span = isle.x1 - isle.x0 + 30;
  clouds.forEach((c, i) => { c.visible = i < nc; if (!c.visible) return; const u = c.userData; c.position.set(isle.x0 - 15 + ((u.off + t * u.sp * (1 + (w.wind || 6) / 12)) % span), u.y, u.z); });
  const wet = w.wet || w.kind === 'snow'; rain.visible = wet; if (wet) { const a = rain.geometry.attributes.position.array, n = w.kind === 'drizzle' ? 350 : w.kind === 'snow' ? 300 : Math.min(900, 400 + (w.rain || 1) * 150), sp = w.kind === 'snow' ? 1.5 : 16, len = w.kind === 'snow' ? .12 : w.kind === 'drizzle' ? .35 : .7, wx = Math.min(.5, (w.wind || 6) / 40);
    rain.material.color.set(s.k === 'night' ? '#9fb0d0' : '#e6eef8'); rain.geometry.setDrawRange(0, n * 2);
    rain.userData.d.forEach((q, i) => { if (i >= n) return; q.y -= sp * dt; q.x += wx * sp * dt * .3; if (q.y < .3 || (q.y < 3.2 && q.x > -.3 && q.x < W + .3 && q.z > -.3 && q.z < D + .3)) { q.y = 14 + Math.random() * 4; q.x = isle.x0 + Math.random() * (isle.x1 - isle.x0); q.z = isle.z0 + Math.random() * (isle.z1 - isle.z0); }
      a.set([q.x, q.y, q.z, q.x - wx * len, q.y + len, q.z], i * 6); }); rain.geometry.attributes.position.needsUpdate = true; }
  if (w.kind === 'storm') { const ph = t % 9; flash = ph < .15 || (ph > .3 && ph < .36) ? 1 : 0; hemi.intensity = flash ? 3 : 1.25; } }

// ---- letters flying between desks, the door and the manager
function note(kind, id, text) { const rm = byId[id]; if (!rm || !VIEW3) return; const toV = kind === 'ask', fromV = /trả lời|của anh/.test(text || ''), a = toV ? {x:rm.cx, z:rm.cz} : fromV ? door : boss, b = toV ? door : {x:rm.cx, z:rm.cz};
  const s = sign('✉', COL[kind] || COL.ready); s.scale.set(.9, .9, 1); world.add(s); fly.push({s, a, b, t0:performance.now(), to:toV ? null : id}); if (fly.length > 10) world.remove(fly.shift().s); }
function flights(ms) { fly = fly.filter(f => { const u = (ms - f.t0) / 1800; if (u >= 1) { world.remove(f.s); return false; } const e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; f.s.position.set(f.a.x + (f.b.x - f.a.x) * e, 1.5 + Math.sin(Math.PI * u) * 4, f.a.z + (f.b.z - f.a.z) * e); return true; }); }

// ---- the loop
let VIEW3 = false, running = false, last = 0, zoomIn = false;
function frame(ms) { if (!running) return; requestAnimationFrame(frame); const wet = WX.now().wet, busy = moving || Object.keys(goal).length || fly.length; if (ms - last < (busy || wet ? 30 : 60)) return; const dt = Math.min(.1, (ms - last) / 1000); last = ms; const t = ms / 1000;
  const dg = director(ms); if (dg) Object.assign(goal, dg); if (goal.z && !moving) { const a = 1 - Math.exp(-dt * 2.4); cam.tx += (goal.tx - cam.tx) * a; cam.tz += (goal.tz - cam.tz) * a; cam.z += (goal.z - cam.z) * a; let dy = goal.yaw - cam.yaw; cam.yaw += dy * a; if (Math.abs(goal.z - cam.z) < .002 && Math.hypot(goal.tx - cam.tx, goal.tz - cam.tz) < .02) Object.keys(goal).forEach(k => delete goal[k]); applyCam(); }
  const zin = cam.z > fitZ * 1.3; if (zin !== zoomIn) { zoomIn = zin; stage.classList.toggle('zoomin', zin); }
  for (const rm of rooms) { const h = rm.head; if (rm.st === 'work') { h.position.y = .34 + Math.abs(Math.sin(t * 7 + rm.x0)) * .04; h.rotation.y = Math.sin(t * .7 + rm.z0) * .25; } else if (rm.st === 'sleep') { h.rotation.x = .25; h.position.y = .3; } else { h.rotation.x = 0; h.position.y = .34; h.rotation.y = Math.sin(t * .4 + rm.x0) * .15; }
    rm.extra.forEach((m, k) => { m.position.y = .34 + Math.abs(Math.sin(t * 8 + k)) * .03; }); if (rm.st === 'work') rm.light.scale.setScalar(.16 + Math.sin(t * 5) * .03); }
  if (boss.m) { boss.m.position.y = .34 + (CHATS.busy ? Math.abs(Math.sin(t * 8)) * .05 : 0); boss.m.rotation.y = CHATS.busy ? Math.sin(t * 1.2) * .3 : 0; }
  for (const w of walkers) walk(w, dt); flights(ms); weather(t, dt); paintScreen(t); placeLabels(cam.z / fitZ); R.render(scene, camera); }
function size() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return false; R.setSize(w, h, false); applyCam(); return true; }
function wake() { const on = VIEW3 && cur === 'office' && !document.hidden && STATE; if (on && !running) { if (!size()) return; if (!rooms.length) set(STATE); running = true; last = performance.now(); requestAnimationFrame(frame); } else if (!on) running = false; }
function set(s) { if (!s || !VIEW3) return; if (!stage.clientWidth) return; const fresh = build(s); populate(); if (fresh) { const o = overview(); Object.assign(cam, o); clampCam(); applyCam(); skyKey = ''; } }
function show(on) { VIEW3 = on; stage.classList.toggle('v3', on); if (on) { set(STATE); wake(); } else { running = false; stage.classList.remove('zoomin'); } }
addEventListener('resize', () => { if (VIEW3 && size() && STATE) { sig = ''; set(STATE); } });
document.addEventListener('visibilitychange', wake);
window.O3D = {set, note, boss() { SL = slides(); }, focus, wake, sky() { skyKey = ''; }, show};
