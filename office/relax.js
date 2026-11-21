// Relax scenes for the PC dashboard: a 3D aquarium (three.js), a starry sky (2D canvas), and ambient sound made in
// the page with WebAudio (no files). Exports: aquarium(canvas) -> {stop}, stars(canvas) -> {stop}, Ambient.
import * as THREE from './vendor/three.module.js';

const FOG = new THREE.Color('#0b4d68');

function gradientTexture(stops, w = 4, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, h);
  stops.forEach(([p, col]) => gr.addColorStop(p, col)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* one fish: a tapered body, tail, dorsal and belly fins in one geometry; x runs from the tail (-1.6) to the nose (1) */
function fishGeometry() {
  const body = new THREE.SphereGeometry(1, 28, 18), p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), k = x > 0 ? Math.pow(1 - x * x, 0.55) : Math.pow(1 - x * x, 0.9) * (1 + 0.15 * x) + 0.06;
    const r = Math.hypot(p.getY(i), p.getZ(i)) || 1;
    p.setY(i, p.getY(i) / r * k * 0.46); p.setZ(i, p.getZ(i) / r * k * 0.2);
  }
  body.computeVertexNormals();
  const pos = Array.from(p.array), nor = Array.from(body.attributes.normal.array), idx = Array.from(body.index.array);
  const part = Array(p.count).fill(0);
  const fin = (pts, tris) => { const b = pos.length / 3; pts.forEach(q => { pos.push(q[0], q[1], 0); nor.push(0, 0, 1); part.push(1); }); tris.forEach(t => idx.push(b + t[0], b + t[1], b + t[2])); };
  fin([[-0.9, 0], [-1.65, 0.62], [-1.42, 0], [-1.65, -0.62]], [[0, 1, 2], [0, 2, 3]]);                 // tail
  fin([[0.35, 0.36], [-0.55, 0.3], [-0.42, 0.78], [0.05, 0.7]], [[0, 1, 2], [0, 2, 3]]);               // dorsal
  fin([[0.1, -0.36], [-0.45, -0.3], [-0.3, -0.62]], [[0, 1, 2]]);                                      // belly
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('part', new THREE.Float32BufferAttribute(part, 1)); g.setIndex(idx);
  return g;
}

const FISH_VS = `
attribute float part; uniform float uT, uPhase, uBeat; varying vec3 vP, vN; varying float vPart, vDepth;
void main(){ vec3 p = position; float tail = clamp((0.6 - p.x) / 2.2, 0.0, 1.0); float ph = uPhase;
  #ifdef USE_INSTANCING
  ph += float(gl_InstanceID) * 1.7;
  #endif
  p.z += sin(p.x * 2.6 - uT * uBeat + ph) * 0.34 * tail * tail;                        /* the body wave grows toward the tail */
  vP = position; vPart = part; vec4 wp = vec4(p, 1.0); vec3 n = normal;
  #ifdef USE_INSTANCING
  wp = instanceMatrix * wp; n = mat3(instanceMatrix) * n;
  #endif
  vN = normalize(normalMatrix * n); vec4 mv = modelViewMatrix * wp; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
/* water takes the red out of the light first, then the green: far things go blue, as in real water */
const ABSORB = `vec3 absorb(vec3 c, float d){ return c * vec3(exp(-d * 0.034), exp(-d * 0.009), 1.0); }`;
const FISH_FS = `
uniform vec3 uA, uB, uFin, uFog; uniform float uStripe, uT, uPhase, uSpots; varying vec3 vP, vN; varying float vPart, vDepth;
${ABSORB}
void main(){ vec3 n = normalize(gl_FrontFacing ? vN : -vN);
  float s = uStripe > 0.0 ? smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(vP.x * uStripe + 1.0)) : smoothstep(-0.1, 0.25, vP.y);
  vec3 col = mix(uA, uB, s); col = mix(col, vec3(1.0), smoothstep(-0.05, -0.4, vP.y) * 0.35);   /* pale belly */
  if (uSpots > 0.0) col = mix(col, vec3(0.9, 0.95, 1.0), step(0.86, sin(vP.x * 15.0) * sin(vP.y * 34.0 + vP.x * 6.0)) * step(-0.05, vP.y) * 0.8);
  if (vPart > 0.5) col = uFin;
  float eye = step(length(vec2(vP.x - 0.62, vP.y - 0.08)), 0.075); col = mix(col, vec3(0.04, 0.06, 0.08), eye * (1.0 - vPart));
  float l = 0.42 + 0.58 * max(dot(n, normalize(vec3(0.25, 1.0, 0.45))), 0.0);
  l += 0.16 * sin(vP.x * 7.0 + uT * 1.7 + uPhase) * max(n.y, 0.0);                             /* light ripples from the surface */
  col *= l; float a = vPart > 0.5 ? 0.82 : 1.0;
  gl_FragColor = vec4(mix(absorb(col, vDepth), uFog, smoothstep(10.0, 46.0, vDepth)), a); 
  #include <colorspace_fragment>
}`;

const SPECIES = [
  {a: '#ff8a1f', b: '#fff4e6', fin: '#ff9d3c', stripe: 5.2, size: 0.62, beat: 7},     // clown-like: orange with white bands
  {a: '#1f6fe0', b: '#ffd23c', fin: '#ffd23c', stripe: 0, size: 0.8, beat: 6},        // blue with a yellow back
  {a: '#f4f1e4', b: '#5a6470', fin: '#f4d35e', stripe: 3.4, size: 0.95, beat: 5},     // angelfish-like: silver, dark bands
  {a: '#e23b5a', b: '#ff9bb0', fin: '#ff6f8c', stripe: 0, size: 0.5, beat: 8},        // small red
  {a: '#20d6c7', b: '#1d5fd1', fin: '#4be3d6', stripe: 0, size: 0.3, beat: 11},       // neon school
  {a: '#8fa9bd', b: '#33506b', fin: '#3f5f7c', stripe: 0, size: 8.5, beat: 1.6, spots: 1},   // whale shark
];

export function aquarium(canvas) {
  const R = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'low-power'});
  R.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(FOG, 12, 46);
  const cam = new THREE.PerspectiveCamera(46, 1, 0.1, 90); const ZW = 6, WH = 9.6, EYE = 12.5; let WW = WH * 1.78, mx = 0, my = 0, ex = 0, ey = 0;   /* window plane at z = ZW, WH tall; the eye EYE in front of it */
  const U = {uT: {value: 0}};

  const back = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshBasicMaterial({map: gradientTexture([[0, '#2aa6c4'], [0.5, '#0f6384'], [0.72, '#0b4d68'], [1, '#0b4d68']]), fog: false}));
  back.position.set(0, 4, -30); scene.add(back);

  /* sand with moving caustics */
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(90, 60, 60, 40), new THREE.ShaderMaterial({uniforms: {uT: U.uT, uFog: {value: FOG}}, vertexShader: `
    varying vec2 vW; varying float vD; void main(){ vec3 p = position; p.z += sin(p.x * 0.5) * 0.25 + cos(p.y * 0.7) * 0.2; vW = p.xy;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`, fragmentShader: `
    uniform float uT; uniform vec3 uFog; varying vec2 vW; varying float vD;
    ${ABSORB}
    float ca(vec2 p, float t){ p += vec2(sin(p.y * 1.3 + t * 0.6), cos(p.x * 1.1 - t * 0.5)) * 0.7; p += vec2(sin(p.y * 2.1 - t * 0.4), cos(p.x * 1.7 + t * 0.7)) * 0.35;
      return pow(0.5 + 0.5 * sin(p.x * 2.2) * sin(p.y * 2.4), 5.0); }
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){ vec3 col = mix(vec3(0.62, 0.50, 0.30), vec3(0.48, 0.38, 0.22), h(floor(vW * 9.0)) * 0.6);
      col *= 0.55 + 0.9 * ca(vW * 0.9, uT) + 0.4 * ca(vW * 1.7 + 4.0, uT * 1.3);
      gl_FragColor = vec4(mix(absorb(col, vD), uFog, smoothstep(14.0, 44.0, vD)), 1.0); 
  #include <colorspace_fragment>
}`}));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, -4.6, -25); scene.add(sand);

  /* shafts of light from the surface */
  const rayTex = gradientTexture([[0, 'rgba(190,240,250,0.55)'], [0.6, 'rgba(190,240,250,0.12)'], [1, 'rgba(190,240,250,0)']]);
  const rays = [];
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + Math.random() * 2.6, 22), new THREE.MeshBasicMaterial({map: rayTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.3}));
    m.position.set(-14 + i * 4.6 + Math.random() * 2, 5, -4 - Math.random() * 12); m.rotation.z = 0.22 + Math.random() * 0.12; m.userData.ph = Math.random() * 6; scene.add(m); rays.push(m); }

  /* rocks and coral */
  const rockMat = new THREE.MeshLambertMaterial({color: '#6a7c86', flatShading: true});
  [[-7.5, -4, -3, 2.4], [-5.4, -4.3, -1.6, 1.3], [7.4, -3.9, -5, 2.9], [9.6, -4.3, -2.5, 1.5], [1.5, -4.4, -9, 2.2], [-11, -4.2, -8, 2]].forEach(([x, y, z, s]) => {
    const g = new THREE.IcosahedronGeometry(s, 1), p = g.attributes.position; const q = Math.random() * 9; for (let i = 0; i < p.count; i++) { const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i), k = 1 + 0.16 * Math.sin(X * 2.3 + q) * Math.cos(Z * 2.9 + q) + 0.1 * Math.sin(Y * 3.7 + q); p.setXYZ(i, X * k, Y * k * 0.62, Z * k); }
    g.computeVertexNormals(); const m = new THREE.Mesh(g, rockMat); m.position.set(x, y, z); scene.add(m); });
  [['#ff7a59', 5.6, -1.5], ['#ff5fa2', -6.2, -4.2], ['#ffb347', 8.8, -6]].forEach(([c, x, z]) => { const mat = new THREE.MeshLambertMaterial({color: c, flatShading: true});
    for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.28 + Math.random() * 0.34, 8, 6), mat); m.position.set(x + (Math.random() - 0.5) * 1.6, -3.9 + Math.random() * 0.9, z + (Math.random() - 0.5) * 1.4); scene.add(m); } });
  scene.add(new THREE.HemisphereLight('#bfeef5', '#0a3040', 1.5)); const sun = new THREE.DirectionalLight('#ffffff', 1.3); sun.position.set(3, 10, 4); scene.add(sun);

  /* seaweed: ribbons that sway more toward the tip */
  const weedMat = (c, a = 1) => new THREE.ShaderMaterial({side: THREE.DoubleSide, transparent: a < 1, depthWrite: a >= 1, uniforms: {uT: U.uT, uC: {value: new THREE.Color(c)}, uFog: {value: FOG}, uPh: {value: Math.random() * 6}, uA: {value: a}}, vertexShader: `
    uniform float uT, uPh; varying float vY, vD; void main(){ vec3 p = position; float k = uv.y; vY = k; p.x += sin(uT * 0.9 + uPh + k * 3.0) * 0.55 * k * k; p.z += cos(uT * 0.7 + uPh + k * 2.0) * 0.3 * k * k;
      p.x *= 1.0; vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`, fragmentShader: `
    uniform vec3 uC, uFog; uniform float uA; varying float vY, vD;
    ${ABSORB}
    void main(){ vec3 col = uC * (0.45 + 0.75 * vY); gl_FragColor = vec4(mix(absorb(col, vD), uFog, smoothstep(12.0, 44.0, vD)), uA); 
  #include <colorspace_fragment>
}`});
  [[-9.5, -6, '#2fae7c'], [-3.5, -7.5, '#3cc28d'], [4.2, -8.5, '#27996c'], [10.8, -4.5, '#35b784'], [-12.5, -3, '#2a9f73'], [12.8, -9, '#3cc28d']].forEach(([x, z, c]) => {
    for (let i = 0; i < 6; i++) { const h = 3 + Math.random() * 4.5, g = new THREE.PlaneGeometry(0.34, h, 1, 14); g.translate(0, h / 2, 0);
      const m = new THREE.Mesh(g, weedMat(c)); m.position.set(x + (Math.random() - 0.5) * 1.8, -4.5, z + (Math.random() - 0.5) * 1.5); m.rotation.y = Math.random() * 3; scene.add(m); } });

  /* fish */
  const geo = fishGeometry(), fish = [];
  const add = (sp, n, box) => { for (let i = 0; i < n; i++) {
    const mat = new THREE.ShaderMaterial({side: THREE.DoubleSide, transparent: true, uniforms: {uT: U.uT, uPhase: {value: Math.random() * 6}, uBeat: {value: sp.beat * (0.8 + Math.random() * 0.4)},
      uA: {value: new THREE.Color(sp.a)}, uB: {value: new THREE.Color(sp.b)}, uFin: {value: new THREE.Color(sp.fin)}, uStripe: {value: sp.stripe}, uSpots: {value: sp.spots || 0}, uFog: {value: FOG}}, vertexShader: FISH_VS, fragmentShader: FISH_FS});
    const m = new THREE.Mesh(geo, mat); m.rotation.y = -Math.PI / 2; const s = sp.size * (0.85 + Math.random() * 0.35); m.scale.setScalar(s);
    const g = new THREE.Group(); g.add(m); scene.add(g);
    fish.push({g, c: new THREE.Vector3(box[0] + (Math.random() - 0.5) * 3, box[1] + (Math.random() - 0.5) * box[4], box[2] + (Math.random() - 0.5) * 3), rx: box[3] * (0.7 + Math.random() * 0.5), ry: 0.5 + Math.random() * 0.9, rz: 2 + Math.random() * 4,
      sp: (0.07 + Math.random() * 0.06) * (Math.random() < 0.5 ? 1 : -1) / Math.sqrt(s), ph: Math.random() * 6.28, k: 1.3 + Math.random(), zp: box[5] || 0}); } return fish[fish.length - 1]; };
  add(SPECIES[0], 3, [0, -1.5, -1, 9, 2]); add(SPECIES[1], 3, [1, 1.5, -5, 11, 3]); add(SPECIES[2], 2, [-1, 0.5, -8, 10, 3]); add(SPECIES[3], 4, [0, -2.2, 1, 8, 2]);
  add(SPECIES[2], 1, [0, 0.6, 3.5, 9, 1.5, 0.9]); add(SPECIES[0], 1, [0, -1.2, 4, 8, 1.5, -0.9]); add(SPECIES[1], 1, [0, 2, 3, 10, 1, 0.9]);   /* these three swim out through the window frame */
  const whale = add(SPECIES[5], 1, [0, 3.5, -20, 34, 0.1]); whale.sp = 0.035; whale.ry = 0.6; whale.rz = 3; whale.k = 1;
  /* a school of several hundred as one instanced mesh */
  const NS = 320, sMat = new THREE.ShaderMaterial({side: THREE.DoubleSide, transparent: true, uniforms: {uT: U.uT, uPhase: {value: 0}, uBeat: {value: 11}, uA: {value: new THREE.Color('#bfd9e6')}, uB: {value: new THREE.Color('#2a6fc9')},
    uFin: {value: new THREE.Color('#e9d36a')}, uStripe: {value: 0}, uSpots: {value: 0}, uFog: {value: FOG}}, vertexShader: FISH_VS, fragmentShader: FISH_FS});
  const school = new THREE.InstancedMesh(geo, sMat, NS); school.frustumCulled = false; scene.add(school);
  const sOff = Array.from({length: NS}, () => { const r = Math.cbrt(Math.random()), a = Math.random() * 6.28, b = Math.acos(2 * Math.random() - 1); return {v: new THREE.Vector3(r * Math.sin(b) * Math.cos(a) * 3.6, r * Math.cos(b) * 1.5, r * Math.sin(b) * Math.sin(a) * 2.4), s: 0.2 + Math.random() * 0.12, w: Math.random() * 6.28}; });
  const sLead = {c: new THREE.Vector3(0, 1.6, -5), rx: 10, ry: 1.6, rz: 6, sp: 0.16, ph: 1, k: 1.7, zp: 0.5}, dummy = new THREE.Object3D(), q1 = new THREE.Vector3(), q2 = new THREE.Vector3();
  /* jellyfish: a pulsing bell and trailing ribbons */
  const jellies = [];
  [['#ff9ad5', -9, 2, -6], ['#9ad9ff', 8.5, 3, -9], ['#c9a6ff', 3, 4, -13], ['#ffd1a6', -4, 3.4, -11], ['#a6fff0', 11, 1.5, -4]].forEach(([c, x, y, z]) => { const g = new THREE.Group();
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 12, 0, 6.3, 0, 1.75), new THREE.MeshBasicMaterial({color: c, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending}));
    g.add(bell); for (let i = 0; i < 7; i++) { const h = 1.6 + Math.random() * 1.8, pg = new THREE.PlaneGeometry(0.07, h, 1, 10); pg.translate(0, h / 2, 0); pg.rotateZ(Math.PI); const r = new THREE.Mesh(pg, weedMat(c, 0.5)); r.position.set(Math.cos(i) * 0.5, -0.2, Math.sin(i) * 0.5); r.rotation.y = i; g.add(r); }
    g.position.set(x, y, z); scene.add(g); jellies.push({g, bell, y, ph: Math.random() * 6}); });
  const at = (f, t, out) => { const a = t * f.sp + f.ph; return out.set(f.c.x + Math.cos(a) * f.rx, f.c.y + Math.sin(a * f.k) * f.ry, f.c.z + Math.sin(a + (f.zp || 0)) * f.rz); };

  /* bubbles and drifting specks */
  const dots = (n, size, color, op) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([(Math.random() - 0.5) * 30, -4.5 + Math.random() * 12, -14 + Math.random() * 20], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({size, color, transparent: true, opacity: op, depthWrite: false})); scene.add(p); return p; };
  const bubbles = dots(60, 0.16, '#dff8fc', 0.7), specks = dots(260, 0.05, '#bfe9f0', 0.45);
  const bx = [-7.2, 5.8, 1.2]; { const a = bubbles.geometry.attributes.position; for (let i = 0; i < a.count; i++) a.setX(i, bx[i % 3] + (Math.random() - 0.5) * 0.6), a.setZ(i, [-3, -2, -8][i % 3] + (Math.random() - 0.5) * 0.6); }

  /* the window frame: fish that swim nearer than it pass in front of it, which is what puts them in front of the screen */
  const rimMat = new THREE.MeshBasicMaterial({color: '#03141b', fog: false}), edgeMat = new THREE.MeshBasicMaterial({color: '#2b7088', fog: false}), rim = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), rimMat); scene.add(m); return m; }),
    edge = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), edgeMat); scene.add(m); return m; });
  function layRim() { const T = 0.16, D = 0.3, w = WW / 2, h = WH / 2; [[0, h - T / 2, WW, T], [0, -h + T / 2, WW, T], [-w + T / 2, 0, T, WH], [w - T / 2, 0, T, WH]].forEach(([x, y, sx, sy], i) => { rim[i].position.set(x, y, ZW - D / 2); rim[i].scale.set(sx, sy, D);
      const k = 0.05; edge[i].position.set(x - Math.sign(x) * T / 2, y - Math.sign(y) * T / 2, ZW - D); edge[i].scale.set(i < 2 ? sx - 2 * T : k, i < 2 ? k : sy - 2 * T, k); }); }
  const onMove = e => { mx = (e.clientX / innerWidth - 0.5) * 2; my = (e.clientY / innerHeight - 0.5) * 2; }; addEventListener('pointermove', onMove);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(); let raf = 0, last = 0, t = 0, alive = true;
  function size() { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; R.setSize(w, h, false); WW = WH * w / h; layRim(); }
  addEventListener('resize', size); size();
  function frame(ms) { if (!alive) return; raf = requestAnimationFrame(frame); if (document.hidden) return; const dt = Math.min(0.05, (ms - last) / 1000 || 0.016); last = ms; t += dt; U.uT.value = t;
    fish.forEach(f => { at(f, t, v1); at(f, t + 0.25 * Math.sign(f.sp), v2); f.g.position.copy(v1); f.g.lookAt(v2); });
    rays.forEach(r => { r.material.opacity = 0.16 + 0.14 * Math.sin(t * 0.5 + r.userData.ph); r.position.x += Math.sin(t * 0.2 + r.userData.ph) * 0.002; });
    const b = bubbles.geometry.attributes.position; for (let i = 0; i < b.count; i++) { let y = b.getY(i) + dt * (1.1 + (i % 5) * 0.25); if (y > 8) y = -4.5; b.setY(i, y); b.setX(i, b.getX(i) + Math.sin(t * 2 + i) * 0.003); } b.needsUpdate = true;
    specks.rotation.y = Math.sin(t * 0.05) * 0.08; specks.position.y = Math.sin(t * 0.1) * 0.3;
    q1.set(0, 0, 0); at(sLead, t, q1); at(sLead, t + 0.3, q2); const dir = q2.clone().sub(q1).normalize();
    for (let i = 0; i < NS; i++) { const o = sOff[i]; dummy.position.set(q1.x + o.v.x + Math.sin(t * 0.7 + o.w) * 0.35, q1.y + o.v.y + Math.cos(t * 0.9 + o.w) * 0.25, q1.z + o.v.z + Math.sin(t * 0.6 + o.w * 2) * 0.3);
      v2.copy(dummy.position).add(dir).addScaledVector(o.v, 0.02); dummy.lookAt(v2); dummy.rotateY(-Math.PI / 2); dummy.scale.setScalar(o.s); dummy.updateMatrix(); school.setMatrixAt(i, dummy.matrix); } school.instanceMatrix.needsUpdate = true;
    jellies.forEach(j => { const b = 0.5 + 0.5 * Math.sin(t * 1.6 + j.ph); j.bell.scale.set(1 + 0.18 * b, 1 - 0.16 * b, 1 + 0.18 * b); j.g.position.y = j.y + Math.sin(t * 0.13 + j.ph) * 2.2 + (1 - b) * 0.08; j.g.position.x += Math.sin(t * 0.1 + j.ph) * 0.002; });
    /* off-axis projection: the screen is a fixed window, the eye drifts and follows the pointer, so near and far things slide against each other */
    ex += ((mx * 2.4 + Math.sin(t * 0.11) * 0.9) - ex) * 0.04; ey += ((-my * 1.3 + 0.5 + Math.sin(t * 0.08) * 0.4) - ey) * 0.04;
    cam.position.set(ex, ey, ZW + EYE); cam.rotation.set(0, 0, 0); cam.updateMatrixWorld(); const n = 0.2, k = n / EYE;
    cam.projectionMatrix.makePerspective((-WW / 2 - ex) * k, (WW / 2 - ex) * k, (WH / 2 - ey) * k, (-WH / 2 - ey) * k, n, 90); cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    R.render(scene, cam); }
  raf = requestAnimationFrame(frame);
  return {stop() { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('pointermove', onMove); R.dispose(); }, fishCount: fish.length + NS};
}

export function stars(canvas) {
  const g = canvas.getContext('2d'); let alive = true, raf = 0, S = [], shoot = null;
  function size() { canvas.width = canvas.clientWidth || innerWidth; canvas.height = canvas.clientHeight || innerHeight;
    S = Array.from({length: Math.round(canvas.width * canvas.height / 3200)}, () => ({x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.4 + 0.3, p: Math.random() * 6, s: 0.4 + Math.random() * 1.6})); }
  addEventListener('resize', size); size();
  function frame(ms) { if (!alive) return; raf = requestAnimationFrame(frame); if (document.hidden) return; const t = ms / 1000, w = canvas.width, h = canvas.height;
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#050817'); bg.addColorStop(0.7, '#0c1a3a'); bg.addColorStop(1, '#1a2c4f'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    S.forEach(s => { g.globalAlpha = 0.45 + 0.55 * Math.sin(t * s.s + s.p); g.fillStyle = '#fff'; g.beginPath(); g.arc((s.x + t * 1.5) % w, s.y, s.r, 0, 7); g.fill(); });
    if (!shoot && Math.random() < 0.003) shoot = {x: Math.random() * w * 0.8, y: Math.random() * h * 0.4, t};
    if (shoot) { const k = (t - shoot.t) / 0.9; if (k > 1) shoot = null; else { g.globalAlpha = 1 - k; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(shoot.x + k * 320, shoot.y + k * 150); g.lineTo(shoot.x + k * 320 - 70, shoot.y + k * 150 - 33); g.stroke(); } }
    g.globalAlpha = 1; g.fillStyle = '#060a14'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 40) g.lineTo(x, h - 60 - 46 * Math.abs(Math.sin(x * 0.004)) - 22 * Math.sin(x * 0.013)); g.lineTo(w, h); g.fill(); }
  raf = requestAnimationFrame(frame);
  return {stop() { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', size); }};
}

/* Ambient sound synthesized in the page: nuoc (water with bubbles), mua (rain), song (waves), lua (fire), nau (brown noise). */
export const Ambient = (() => {
  let ctx = null, master = null, nodes = [], timer = 0, kind = '', vol = 0.3, duckBy = 1;
  const noise = brown => { const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = b.getChannelData(0); let l = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; }
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(); nodes.push(s); return s; };
  const filt = (type, f, q = 0.7) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
  const gain = v => { const x = ctx.createGain(); x.gain.value = v; return x; };
  const lfo = (param, hz, depth) => { const o = ctx.createOscillator(), g = gain(depth); o.frequency.value = hz; o.connect(g); g.connect(param); o.start(); nodes.push(o); };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
  const blip = (f0, f1, dur, v) => { const o = ctx.createOscillator(), g = gain(0), t = ctx.currentTime; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05); };
  const crack = v => { const s = ctx.createBufferSource(), b = ctx.createBuffer(1, 1200, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
    s.buffer = b; const g = gain(v); chain(s, filt('highpass', 1800), g, master); s.start(); };
  function stop() { clearInterval(timer); timer = 0; nodes.forEach(n => { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }); nodes = []; kind = ''; }
  function play(k) {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.connect(ctx.destination); }
    if (ctx.state === 'suspended') ctx.resume();
    stop(); if (!k || k === 'tat') return; kind = k; master.gain.value = vol * duckBy;
    if (k === 'nau') chain(noise(true), filt('lowpass', 420), gain(0.9), master);
    if (k === 'mua') { chain(noise(false), filt('highpass', 1400), filt('lowpass', 7500), gain(0.22), master); chain(noise(true), filt('lowpass', 260), gain(0.5), master); }
    if (k === 'song') { const g = gain(0.5); chain(noise(true), filt('lowpass', 520), g, master); lfo(g.gain, 0.09, 0.42); const h = gain(0.05); chain(noise(false), filt('bandpass', 2400, 0.6), h, master); lfo(h.gain, 0.09, 0.045); }
    if (k === 'lua') { chain(noise(true), filt('lowpass', 240), gain(0.8), master); timer = setInterval(() => { if (Math.random() < 0.55) crack(0.1 + Math.random() * 0.35); }, 140); }
    if (k === 'nuoc') { const g = gain(0.1); chain(noise(false), filt('bandpass', 1000, 0.9), g, master); lfo(g.gain, 0.3, 0.03); chain(noise(true), filt('lowpass', 180), gain(0.45), master);
      timer = setInterval(() => { if (Math.random() < 0.5) { const f = 350 + Math.random() * 500; blip(f, f * 1.9, 0.07 + Math.random() * 0.06, 0.05 + Math.random() * 0.05); } }, 170); }
  }
  return {play, stop, kind: () => kind, volume(v) { vol = v; if (master) master.gain.value = vol * duckBy; }, duck(on) { duckBy = on ? 0.3 : 1; if (master) master.gain.value = vol * duckBy; }};
})();
