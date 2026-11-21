// The office as pictures: the CEO's floor drawn by Gemini (day, or night from 18:00 to 06:00 by the phone's clock) and
// people drawn by PixelLab. The CEO and the chairman sit in their chairs; one person per orchestra at work (or asking
// the owner) walks from the lift to a desk, stays a while and walks back. Pictures and spots come from
// themes/ai/manifest.json (themes/ai/SPEC.md). Tap a person to open that orchestra; tap the CEO or the chairman for Work.
// Reads the page's globals: STATE, ACT, CHATS, focusId, cur, stateOf, stored, drawCol, tab.

const $ = id => document.getElementById(id), stage = $('stage'), BASE = 'themes/ai/';
const cv = document.createElement('canvas'); cv.id = 'cvai'; stage.insertBefore(cv, $('cv').nextSibling); const g = cv.getContext('2d');
let M = null, on = false, running = false, last = 0, cw = 0, ch = 0, dpr = 1, fit = {k:1, x:0, y:0}, staff = [], down = null;
const BG = {}, CH = {}, bubs = {}, boxes = {}, rnd = (a, b) => a + Math.random() * (b - a), isPt = v => Array.isArray(v) && v.length > 1 && v.every(n => typeof n === 'number' && isFinite(n));
const hsh = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(src)); i.src = BASE + src; });
// true once the manifest is sound and the day picture loads; people whose strips fail are drawn as a dot
const ready = fetch(BASE + 'manifest.json', {cache:'no-cache'}).then(r => r.ok ? r.json() : null).then(async m => {
  if (!m || !isPt(m.size) || !m.bg || typeof m.bg.day !== 'string' || !m.spots || !isPt(m.spots.ceo) || !isPt(m.spots.lift) || !m.chars || typeof m.chars !== 'object') return false;
  BG.day = await load(m.bg.day); BG.night = m.bg.night ? await load(m.bg.night).catch(() => BG.day) : BG.day;
  await Promise.all(Object.entries(m.chars).map(([k, c]) => { CH[k] = {c, im:{}}; return Promise.all(Object.keys(c).filter(a => typeof c[a] === 'string' && /\.png$/i.test(c[a])).map(a => load(c[a]).then(i => { CH[k].im[a] = i; }, () => {}))); }));
  M = m; return true; }).catch(() => false);

// where people sit: spots.desks [[x,y],...] or desk_* spots if the artist gave them, else the guest chair, then standing places toward the lift
function deskFor(i) { const s = M.spots, d = (Array.isArray(s.desks) ? s.desks : Object.keys(s).filter(k => /^desk/.test(k)).sort().map(k => s[k])).filter(isPt);
  if (Array.isArray(s.seats)) { const q = s.seats.filter(x => x && isPt(x.p)); if (i < q.length) return {p:q[i].p, sit:true, via:(q[i].via || []).filter(isPt)}; }
  if (!d.length) d.push(isPt(s.guest) ? s.guest : s.ceo); if (i < d.length) return {p:d[i], sit:d[i] !== s.ceo};
  const a = d[0], L = s.lift, u = .2 + .12 * ((i - d.length) % 5), j = ((i * 37) % 7 - 3) * M.size[0] / 120; return {p:[a[0] + (L[0] - a[0]) * u + j, a[1] + (L[1] - a[1]) * u - j * .4], sit:false}; }
function set(s) { if (!s || !M) return; const L = M.spots.lift, old = Object.fromEntries(staff.map(w => [w.id, w]));
  const act = s.projects.filter(p => !stored(p) && /work|ask/.test(stateOf(p))).sort((a, b) => a.id.localeCompare(b.id));
  staff = act.map((p, i) => { const lx = (hsh(p.id) % 5 - 2) * M.size[0] / 110, w = old[p.id] || {id:p.id, x:L[0] + lx, y:L[1], ph:'lift', t:rnd(.3, 4), dir:'s', walk:false};
    return Object.assign(w, {p, lx, ch:'staff_' + (i % 8 + 1), desk:deskFor(i)}); }); }
function step(dt) { const L = M.spots.lift, v = M.size[0] / 20; for (const w of staff) {
    if (w.ph === 'lift' || w.ph === 'stay') { w.walk = false; if ((w.t -= dt) > 0) continue; w.ph = w.ph === 'lift' ? 'in' : 'out'; w.vi = 0; }
    const vv = w.desk.via || [], route = w.ph === 'in' ? vv.concat([w.desk.p]) : vv.slice().reverse().concat([[L[0] + w.lx, L[1]]]), vi = Math.min(w.vi || 0, route.length - 1), last = vi === route.length - 1;
    const tx = route[vi][0], ty = route[vi][1], dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
    if (d <= 2 && !last) { w.vi = vi + 1; continue; }
    if (d > 2) { const k = Math.min(d, v * dt); w.x += dx / d * k; w.y += dy / d * k; w.walk = true; w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n'); continue; }
    w.x = tx; w.y = ty; w.walk = false; w.dir = 's'; w.vi = 0; if (w.ph === 'in') { w.ph = 'stay'; w.t = rnd(8, 18); } else { w.ph = 'lift'; w.t = rnd(2, 6); } } }

// one frame of a strip; a missing west walk is the east one mirrored (and back); no strip at all is a dot
function sprite(key, mode, dir, t, x, y) { const C = CH[key], sx = fit.x + x * fit.k, sy = fit.y + y * fit.k;
  const im = C ? C.im : {}; let a = null, fl = false;
  if (mode === 'walk') { a = im['walk_' + dir]; if (!a && dir === 'w' && im.walk_e) { a = im.walk_e; fl = true; } if (!a && dir === 'e' && im.walk_w) { a = im.walk_w; fl = true; } }
  else a = mode === 'sit' ? im.sit || im.idle : im.idle || im.sit;
  const still = !a; a = a || im.walk_s || Object.values(im)[0];
  if (!a) { g.fillStyle = '#3f73a8'; g.beginPath(); g.arc(sx, sy - 8, 6, 0, 7); g.fill(); return {x:sx - 6, y:sy - 14, w:12, h:14}; }
  const fw = C.c.w || a.naturalHeight, fh = C.c.h || a.naturalHeight, n = Math.max(1, Math.floor(a.naturalWidth / fw)), f = still && mode !== 'walk' ? 0 : Math.floor(t * (mode === 'walk' ? 8 : 3)) % n;
  const k = Math.max(fit.k * (M.char_scale || 1), 22 / fh), dw = fw * k, dh = fh * k;
  g.save(); if (fl) { g.translate(sx * 2, 0); g.scale(-1, 1); } g.drawImage(a, f * fw, 0, fw, fh, Math.round(sx - dw / 2), Math.round(sy - dh), Math.round(dw), Math.round(dh)); g.restore();
  return {x:sx - dw / 2, y:sy - dh, w:dw, h:dh}; }
function clip(text, max) { if (g.measureText(text).width <= max) return text; while (text.length > 2 && g.measureText(text + '...').width > max) text = text.slice(0, -1); return text + '...'; }
function bubble(x, y, text, color) { g.font = '600 9px system-ui,sans-serif'; text = clip(text, 130); const w = Math.round(g.measureText(text).width + 10);
  g.fillStyle = '#fffdf6'; g.strokeStyle = color; g.lineWidth = 1; g.beginPath(); g.roundRect(Math.round(x - w / 2), Math.round(y - 14), w, 14, 6); g.fill(); g.stroke();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y - 7); }
function tag(x, y, text, sel) { g.font = '700 9px system-ui,sans-serif'; const w = Math.round(g.measureText(text).width + 8);
  g.fillStyle = sel ? '#3f73a8' : 'rgba(20,22,30,.72)'; g.beginPath(); g.roundRect(Math.round(x - w / 2), Math.round(y + 2), w, 12, 5); g.fill();
  g.fillStyle = '#f4f1ea'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 8.5); }
function paint(t) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#10131a'; g.fillRect(0, 0, cw, ch);
  const h = new Date().getHours(), S = M.spots, now = performance.now(); g.imageSmoothingEnabled = false;
  g.drawImage(h >= 18 || h < 6 ? BG.night : BG.day, Math.round(fit.x), Math.round(fit.y), Math.round(M.size[0] * fit.k), Math.round(M.size[1] * fit.k));
  const all = [{key:'ceo', mode:'sit', x:S.ceo[0], y:S.ceo[1], role:'ceo'}].concat(isPt(S.chairman) ? [{key:'chairman', mode:'sit', x:S.chairman[0], y:S.chairman[1], role:'chairman'}] : [],
    staff.map(w => ({key:w.ch, mode:w.walk ? 'walk' : w.ph === 'stay' && w.desk.sit ? 'sit' : 'idle', dir:w.dir, x:w.x, y:w.y, w})));
  all.sort((a, b) => a.y - b.y); for (const o of all) { const b = sprite(o.key, o.mode, o.dir || 's', t + (o.w ? hsh(o.w.id) % 7 : 0), o.x, o.y); if (o.w) o.w.box = b; else boxes[o.role] = b; }
  for (const o of all) { const b = o.w ? o.w.box : boxes[o.role], cx = b.x + b.w / 2;
    if (o.w) { const sel = focusId === o.w.id, bb = bubs[o.w.id]; if (o.w.ph !== 'lift' || sel) tag(cx, b.y + b.h, '@' + o.w.id, sel);
      if (bb && bb.until > now) bubble(cx, b.y - 2, bb.text, '#3f9d74'); else if (stateOf(o.w.p) === 'ask') bubble(cx, b.y - 2, '?', '#d2553d'); }
    else if (o.role === 'ceo' && CHATS.busy) bubble(cx, b.y - 2, (CHATS.step || '...') + '...', '#3f73a8'); } }
function frame(ms) { if (!running) return; requestAnimationFrame(frame); if (ms - last < 33) return; const dt = Math.min(.2, (ms - last) / 1000); last = ms;
  if (!(ACT.game || {}).on) step(dt); paint(ms / 1000); }
function size() { const r = stage.getBoundingClientRect(); if (!r.width || !r.height || !M) return false; dpr = Math.min(devicePixelRatio || 1, 3); cw = r.width; ch = r.height;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); const k = Math.min(cw / M.size[0], ch / M.size[1]); fit = {k, x:(cw - M.size[0] * k) / 2, y:(ch - M.size[1] * k) / 2}; return true; }
function wake() { const ok = on && M && cur === 'office' && !document.hidden && STATE; if (ok && !running) { if (!size()) return; set(STATE); running = true; last = performance.now(); requestAnimationFrame(frame); } else if (!ok) running = false; }
function show(v) { on = !!(v && M); stage.classList.toggle('vai', on); if (on) { size(); set(STATE); wake(); } else running = false; }
function focus(id) { focusId = id && STATE && STATE.projects.some(p => p.id === id) ? id : null; $('back').classList.toggle('on', !!focusId); drawCol(); }
function note(kind, id, text) { bubs[id] = {text:String(text || kind), until:performance.now() + 6000}; }
cv.addEventListener('pointerdown', e => { down = {x:e.offsetX, y:e.offsetY, t:performance.now()}; });
cv.addEventListener('pointerup', e => { const d = down; down = null; if (!d || Math.hypot(e.offsetX - d.x, e.offsetY - d.y) > 10 || performance.now() - d.t > 500) return;
  const x = e.offsetX, y = e.offsetY, hit = b => b && x >= b.x - 8 && x <= b.x + b.w + 8 && y >= b.y - 8 && y <= b.y + b.h + 8;
  const w = staff.slice().sort((a, b) => b.y - a.y).find(w => hit(w.box)); if (w) return focus(focusId === w.id ? null : w.id);
  if (hit(boxes.ceo) || hit(boxes.chairman)) return tab('work'); if (focusId) focus(null); });
addEventListener('resize', () => { if (on) size(); });
document.addEventListener('visibilitychange', wake);

window.OAI = {ready, show, set, note, boss() {}, focus, wake, sky() {}};
