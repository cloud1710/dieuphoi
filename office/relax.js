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
void main(){ vec3 p = position; float tail = clamp((0.6 - p.x) / 2.2, 0.0, 1.0);
  p.z += sin(p.x * 2.6 - uT * uBeat + uPhase) * 0.34 * tail * tail;                    /* the body wave grows toward the tail */
  vP = position; vPart = part; vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
const FISH_FS = `
uniform vec3 uA, uB, uFin, uFog; uniform float uStripe, uT, uPhase; varying vec3 vP, vN; varying float vPart, vDepth;
void main(){ vec3 n = normalize(gl_FrontFacing ? vN : -vN);
  float s = uStripe > 0.0 ? smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(vP.x * uStripe + 1.0)) : smoothstep(-0.1, 0.25, vP.y);
  vec3 col = mix(uA, uB, s); col = mix(col, vec3(1.0), smoothstep(-0.05, -0.4, vP.y) * 0.35);   /* pale belly */
  if (vPart > 0.5) col = uFin;
  float eye = step(length(vec2(vP.x - 0.62, vP.y - 0.08)), 0.075); col = mix(col, vec3(0.04, 0.06, 0.08), eye * (1.0 - vPart));
  float l = 0.42 + 0.58 * max(dot(n, normalize(vec3(0.25, 1.0, 0.45))), 0.0);
  l += 0.16 * sin(vP.x * 7.0 + uT * 1.7 + uPhase) * max(n.y, 0.0);                             /* light ripples from the surface */
  col *= l; float a = vPart > 0.5 ? 0.82 : 1.0;
  gl_FragColor = vec4(mix(col, uFog, smoothstep(6.0, 30.0, vDepth)), a); 
  #include <colorspace_fragment>
}`;

const SPECIES = [
  {a: '#ff8a1f', b: '#fff4e6', fin: '#ff9d3c', stripe: 5.2, size: 0.62, beat: 7},     // clown-like: orange with white bands
  {a: '#1f6fe0', b: '#ffd23c', fin: '#ffd23c', stripe: 0, size: 0.8, beat: 6},        // blue with a yellow back
  {a: '#f4f1e4', b: '#5a6470', fin: '#f4d35e', stripe: 3.4, size: 0.95, beat: 5},     // angelfish-like: silver, dark bands
  {a: '#e23b5a', b: '#ff9bb0', fin: '#ff6f8c', stripe: 0, size: 0.5, beat: 8},        // small red
  {a: '#20d6c7', b: '#1d5fd1', fin: '#4be3d6', stripe: 0, size: 0.3, beat: 11},       // neon school
];

export function aquarium(canvas) {
  const R = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'low-power'});
  R.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(FOG, 8, 34);
  const cam = new THREE.PerspectiveCamera(46, 1, 0.1, 80); cam.position.set(0, 1.2, 13);
  const U = {uT: {value: 0}};

  const back = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshBasicMaterial({map: gradientTexture([[0, '#2aa6c4'], [0.5, '#0f6384'], [0.72, '#0b4d68'], [1, '#0b4d68']]), fog: false}));
  back.position.set(0, 4, -30); scene.add(back);

  /* sand with moving caustics */
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(90, 60, 60, 40), new THREE.ShaderMaterial({uniforms: {uT: U.uT, uFog: {value: FOG}}, vertexShader: `
    varying vec2 vW; varying float vD; void main(){ vec3 p = position; p.z += sin(p.x * 0.5) * 0.25 + cos(p.y * 0.7) * 0.2; vW = p.xy;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`, fragmentShader: `
    uniform float uT; uniform vec3 uFog; varying vec2 vW; varying float vD;
    float ca(vec2 p, float t){ p += vec2(sin(p.y * 1.3 + t * 0.6), cos(p.x * 1.1 - t * 0.5)) * 0.7; p += vec2(sin(p.y * 2.1 - t * 0.4), cos(p.x * 1.7 + t * 0.7)) * 0.35;
      return pow(0.5 + 0.5 * sin(p.x * 2.2) * sin(p.y * 2.4), 5.0); }
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){ vec3 col = mix(vec3(0.62, 0.50, 0.30), vec3(0.48, 0.38, 0.22), h(floor(vW * 9.0)) * 0.6);
      col *= 0.55 + 0.9 * ca(vW * 0.9, uT) + 0.4 * ca(vW * 1.7 + 4.0, uT * 1.3);
      gl_FragColor = vec4(mix(col * vec3(0.72, 0.9, 0.92), uFog, smoothstep(9.0, 30.0, vD)), 1.0); 
  #include <colorspace_fragment>
}`}));
  sand.rotation.x = -Math.PI / 2; sand.position.y = -4.6; scene.add(sand);

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
  const weedMat = c => new THREE.ShaderMaterial({side: THREE.DoubleSide, uniforms: {uT: U.uT, uC: {value: new THREE.Color(c)}, uFog: {value: FOG}, uPh: {value: Math.random() * 6}}, vertexShader: `
    uniform float uT, uPh; varying float vY, vD; void main(){ vec3 p = position; float k = uv.y; vY = k; p.x += sin(uT * 0.9 + uPh + k * 3.0) * 0.55 * k * k; p.z += cos(uT * 0.7 + uPh + k * 2.0) * 0.3 * k * k;
      p.x *= 1.0; vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`, fragmentShader: `
    uniform vec3 uC, uFog; varying float vY, vD; void main(){ vec3 col = uC * (0.45 + 0.75 * vY); gl_FragColor = vec4(mix(col, uFog, smoothstep(7.0, 32.0, vD)), 1.0); 
  #include <colorspace_fragment>
}`});
  [[-9.5, -6, '#2fae7c'], [-3.5, -7.5, '#3cc28d'], [4.2, -8.5, '#27996c'], [10.8, -4.5, '#35b784'], [-12.5, -3, '#2a9f73'], [12.8, -9, '#3cc28d']].forEach(([x, z, c]) => {
    for (let i = 0; i < 6; i++) { const h = 3 + Math.random() * 4.5, g = new THREE.PlaneGeometry(0.34, h, 1, 14); g.translate(0, h / 2, 0);
      const m = new THREE.Mesh(g, weedMat(c)); m.position.set(x + (Math.random() - 0.5) * 1.8, -4.5, z + (Math.random() - 0.5) * 1.5); m.rotation.y = Math.random() * 3; scene.add(m); } });

  /* fish */
  const geo = fishGeometry(), fish = [];
  const add = (sp, n, box) => { for (let i = 0; i < n; i++) {
    const mat = new THREE.ShaderMaterial({side: THREE.DoubleSide, transparent: true, uniforms: {uT: U.uT, uPhase: {value: Math.random() * 6}, uBeat: {value: sp.beat * (0.8 + Math.random() * 0.4)},
      uA: {value: new THREE.Color(sp.a)}, uB: {value: new THREE.Color(sp.b)}, uFin: {value: new THREE.Color(sp.fin)}, uStripe: {value: sp.stripe}, uFog: {value: FOG}}, vertexShader: FISH_VS, fragmentShader: FISH_FS});
    const m = new THREE.Mesh(geo, mat); m.rotation.y = -Math.PI / 2; const s = sp.size * (0.85 + Math.random() * 0.35); m.scale.setScalar(s);
    const g = new THREE.Group(); g.add(m); scene.add(g);
    fish.push({g, c: new THREE.Vector3(box[0] + (Math.random() - 0.5) * 3, box[1] + (Math.random() - 0.5) * box[4], box[2] + (Math.random() - 0.5) * 3), rx: box[3] * (0.7 + Math.random() * 0.5), ry: 0.5 + Math.random() * 0.9, rz: 2 + Math.random() * 4,
      sp: (0.07 + Math.random() * 0.06) * (Math.random() < 0.5 ? 1 : -1) / Math.sqrt(s), ph: Math.random() * 6.28, k: 1.3 + Math.random()}); } };
  add(SPECIES[0], 3, [0, -1.5, -1, 9, 2]); add(SPECIES[1], 3, [1, 1.5, -5, 11, 3]); add(SPECIES[2], 2, [-1, 0.5, -8, 10, 3]); add(SPECIES[3], 4, [0, -2.2, 1, 8, 2]);
  const school = fish.length; add(SPECIES[4], 12, [0, 2.2, -3, 9, 1.2]);
  for (let i = school; i < fish.length; i++) { const f = fish[i], lead = fish[school]; f.c.copy(lead.c).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 1.6)); f.rx = lead.rx; f.ry = lead.ry; f.rz = lead.rz; f.sp = lead.sp; f.k = lead.k; f.ph = lead.ph + (i - school) * 0.05; }
  const at = (f, t, out) => { const a = t * f.sp + f.ph; return out.set(f.c.x + Math.cos(a) * f.rx, f.c.y + Math.sin(a * f.k) * f.ry, f.c.z + Math.sin(a) * f.rz); };

  /* bubbles and drifting specks */
  const dots = (n, size, color, op) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([(Math.random() - 0.5) * 30, -4.5 + Math.random() * 12, -14 + Math.random() * 20], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({size, color, transparent: true, opacity: op, depthWrite: false})); scene.add(p); return p; };
  const bubbles = dots(60, 0.16, '#dff8fc', 0.7), specks = dots(260, 0.05, '#bfe9f0', 0.45);
  const bx = [-7.2, 5.8, 1.2]; { const a = bubbles.geometry.attributes.position; for (let i = 0; i < a.count; i++) a.setX(i, bx[i % 3] + (Math.random() - 0.5) * 0.6), a.setZ(i, [-3, -2, -8][i % 3] + (Math.random() - 0.5) * 0.6); }

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(); let raf = 0, last = 0, t = 0, alive = true;
  function size() { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; R.setSize(w, h, false); cam.aspect = w / h; cam.fov = w / h < 1.2 ? 62 : 46; cam.updateProjectionMatrix(); }
  addEventListener('resize', size); size();
  function frame(ms) { if (!alive) return; raf = requestAnimationFrame(frame); if (document.hidden) return; const dt = Math.min(0.05, (ms - last) / 1000 || 0.016); last = ms; t += dt; U.uT.value = t;
    fish.forEach(f => { at(f, t, v1); at(f, t + 0.25 * Math.sign(f.sp), v2); f.g.position.copy(v1); f.g.lookAt(v2); });
    rays.forEach(r => { r.material.opacity = 0.16 + 0.14 * Math.sin(t * 0.5 + r.userData.ph); r.position.x += Math.sin(t * 0.2 + r.userData.ph) * 0.002; });
    const b = bubbles.geometry.attributes.position; for (let i = 0; i < b.count; i++) { let y = b.getY(i) + dt * (1.1 + (i % 5) * 0.25); if (y > 8) y = -4.5; b.setY(i, y); b.setX(i, b.getX(i) + Math.sin(t * 2 + i) * 0.003); } b.needsUpdate = true;
    specks.rotation.y = Math.sin(t * 0.05) * 0.08; specks.position.y = Math.sin(t * 0.1) * 0.3;
    cam.position.x = Math.sin(t * 0.07) * 1.6; cam.position.y = 1.2 + Math.sin(t * 0.05) * 0.4; cam.lookAt(0, 0, -3);
    R.render(scene, cam); }
  raf = requestAnimationFrame(frame);
  return {stop() { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', size); R.dispose(); }, fishCount: fish.length};
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
