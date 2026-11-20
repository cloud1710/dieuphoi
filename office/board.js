// Bảng trình chiếu: xem server local của PC, ảnh chụp và ghi chú của CEO và các orchestra.
// Dùng các hàm chung của m.html (E, $, api, CHATS, ACT, cur, liveMode).
(() => {
  const css = document.createElement('style');
  css.textContent = `
#bscreen{position:relative;background:#0c1220;border:1px solid var(--line);border-radius:12px;overflow:hidden;aspect-ratio:16/10;display:flex;align-items:center;justify-content:center;color:#dfe7f5}
#bscreen iframe{position:absolute;inset:0;width:200%;height:200%;border:0;background:#fff;transform:scale(.5);transform-origin:0 0}
#bscreen.full iframe{width:100%;height:100%;transform:none}
#bscreen img{max-width:100%;max-height:100%;object-fit:contain;display:block}
#bscreen .slide{padding:18px 20px;text-align:left;width:100%;max-height:100%;overflow:auto;font-size:14px;line-height:1.45;white-space:pre-wrap}
#bscreen .slide b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8fb4ff;margin-bottom:6px}
#bscreen.fs{position:fixed;inset:0;z-index:60;border-radius:0;border:0;aspect-ratio:auto;padding-top:env(safe-area-inset-top)}
#bclose{position:absolute;right:10px;top:calc(10px + env(safe-area-inset-top));z-index:2;margin:0;background:#000a;color:#fff;border-color:#fff5}
#bbar{display:flex;gap:6px;align-items:center;margin:8px 0 0;flex-wrap:wrap}
#bbar span{flex:1 0 100%;min-width:0;font-size:12.5px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#bbar .act{margin:0;padding:6px 10px;font-size:12.5px}
.thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:8px}
.thumbs button{all:unset;cursor:pointer;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--bg);display:flex;flex-direction:column;min-width:0}
.thumbs button.on{border-color:var(--work);box-shadow:0 0 0 1px var(--work)}
.thumbs img,.thumbs .nt{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
.thumbs .nt{padding:6px;font-size:10.5px;line-height:1.3;color:var(--mute);overflow:hidden;box-sizing:border-box}
.thumbs small{padding:3px 6px 5px;font-size:10.5px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pcbox{border-bottom:1px solid var(--line)}.pcbox .note{padding:0 12px 10px;margin:0}
.seg{display:flex;gap:6px;padding:0 12px 10px}.seg button{flex:1;margin:0;padding:8px 6px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit;font-size:13px}
.seg button.on{background:var(--ready);border-color:var(--ready);color:#fff;font-weight:650}.seg button:disabled{opacity:.45}
.row.pick{cursor:pointer}.row.pick.on{background:color-mix(in srgb,var(--work) 12%,transparent)}
details.sect>summary{font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--mute);margin:18px 2px 6px;gap:6px}
details.sect>summary::before{content:'▸';display:inline-block;transition:transform .15s}
details.sect[open]>summary::before{transform:rotate(90deg)}
details.sect>summary em{font-style:normal;text-transform:none;letter-spacing:0;margin-left:auto;font-size:11.5px}
details.grp{border-top:1px solid var(--line)}details.grp:first-child{border-top:0}
details.grp>summary{padding:10px 12px}details.grp>.in .row{padding-left:33px}
`;
  document.head.append(css);

  // ---- sections that fold, and remember on this phone whether they were open
  let FOLD = {};
  try { FOLD = JSON.parse(localStorage.getItem('dp-fold') || '{}'); } catch (e) {}
  window.sect = (key, title, body, defOpen, note) => {
    const d = E('details', 'sect'); d.open = key in FOLD ? FOLD[key] : !!defOpen;
    const s = E('summary'); s.append(title); if (note) s.append(E('em', '', note)); d.append(s, body);
    d.ontoggle = () => { FOLD[key] = d.open; try { localStorage.setItem('dp-fold', JSON.stringify(FOLD)); } catch (e) {} if (d.open && d.onopen) d.onopen(); };
    return d;
  };
  // one line per project that opens into its lines: rows = [[kind, id, text]], line = the row maker of the caller
  window.grouped = (rows, line, openSet, prefix) => {
    const by = new Map(); rows.forEach(r => { if (!by.has(r[1])) by.set(r[1], []); by.get(r[1]).push(r); });
    const out = []; const rank = {ask:0, work:1, mail:2, wait:3, ready:4, '':5};
    by.forEach((rs, id) => {
      if (rs.length === 1) { out.push(line(...rs[0])); return; }
      const top = rs.slice().sort((a, b) => (rank[a[0]] ?? 9) - (rank[b[0]] ?? 9))[0], k = prefix + id;
      const d = E('details', 'grp'); d.open = openSet.has(k); d.ontoggle = () => d.open ? openSet.add(k) : openSet.delete(k);
      const s = E('summary'); s.append(E('span', 'dot ' + top[0])); const nm = E('span', 'nm'); nm.append(E('b', '', '@' + id), E('small', '', top[2])); s.append(nm, E('span', 'chip', rs.length + ' dòng'));
      const inn = E('div', 'in'); rs.forEach(r => inn.append(line(...r))); d.append(s, inn); out.push(d);
    });
    return out;
  };

  // ---- the board
  let B = null, sel = null, timer = null, built = false, lastSig = '', newest = null;
  const same = (a, b) => a && b && a.kind === b.kind && a.id === b.id;
  const dur = m => m >= 60 ? Math.floor(m / 60) + ' giờ ' + (m % 60) + ' phút' : m + ' phút';
  const imgUrl = it => 'api/board/file?src=' + encodeURIComponent(it.src) + '&name=' + encodeURIComponent(it.name) + '&t=' + it.t;

  function build() {
    if (built) return; built = true; const root = $('board'); root.textContent = '';
    const sc = E('div'); sc.id = 'bscreen'; const bar = E('div'); bar.id = 'bbar';
    const lists = E('div'); lists.id = 'blists'; root.append(sc, bar, lists);
  }
  function bossSlide() {
    const d = E('div', 'slide'), last = (CHATS.messages || []).filter(m => m.who !== 'vinh').slice(-1)[0], note = CHATS.note;
    d.append(E('b', '', CHATS.busy ? 'CEO ' + (CHATS.step || 'đang trả lời') : 'CEO'));
    d.append(CHATS.busy ? 'Đang xử lý tin của anh từ ' + (CHATS.since || '') + '…' : last ? last.text.replace(/[*`]/g, '').slice(0, 700) : 'Chưa có gì để trình chiếu. Chọn một server hoặc một ảnh ở bên dưới.');
    if (note && note.text) { d.append(E('b', '', '\nViệc gần nhất' + (note.t ? ' · ' + note.t : ''))); d.lastChild.style.marginTop = '12px'; d.append(String(note.text).slice(0, 400)); }
    return d;
  }
  // fills the phone with the screen; stays inside the app, so the pairing still holds
  function fsBtn(sc) { const b = E('button', 'act', 'Toàn màn hình'); b.onclick = () => { sc.classList.add('fs', 'full'); const x = E('button', 'act', '✕ Đóng'); x.id = 'bclose'; x.onclick = () => { sc.classList.remove('fs', 'full'); x.remove(); }; sc.append(x); }; return b; }
  function screen() {
    const sc = $('bscreen'), bar = $('bbar'); sc.textContent = ''; bar.textContent = ''; sc.classList.remove('full', 'fs');
    if (!sel) { sc.append(bossSlide()); bar.append(E('span', '', 'Màn chiếu: CEO')); return; }
    const home = E('button', 'act', 'CEO'); home.onclick = () => { sel = null; screen(); lists(); };
    if (sel.kind === 'pc') {
      const i = E('img'); i.alt = 'Màn hình PC'; sc.append(i); let on = true, fails = 0;
      const next = () => { if (!on || !document.body.contains(i)) return; const n = new Image(); n.onload = () => { i.src = n.src; fails = 0; setTimeout(next, document.hidden ? 4000 : 1200); };
        n.onerror = () => { fails++; if (fails === 3) { sc.textContent = ''; sc.append(E('div', 'slide', 'Chưa lấy được màn hình PC. Nếu PC vừa cài Pillow để chụp, chờ một phút rồi bấm lại.')); on = false; return; } setTimeout(next, 3000); };
        n.src = 'api/screen.jpg?w=' + (sc.classList.contains('full') ? 1920 : 1280) + '&t=' + Date.now(); }; next();
      const out = fsBtn(sc); bar.append(E('span', '', 'Màn hình PC · khoảng 1 hình mỗi giây · chỉ xem'), out, home);
      if (B && B.sunshine) bar.append(E('span', '', 'Muốn điều khiển mượt: mở app Moonlight trên iPhone, thêm PC 10.147.17.77 (cần ZeroTier). Sunshine đang chạy trên PC.'));
      return; }
    if (sel.kind === 'server') {
      const f = E('iframe'); f.src = 'p/' + sel.port + '/'; f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms'); f.referrerPolicy = 'same-origin'; sc.append(f);
      const zoom = E('button', 'act', 'Cỡ thật'); zoom.onclick = () => { zoom.textContent = sc.classList.toggle('full') ? 'Thu nhỏ' : 'Cỡ thật'; };
      const re = E('button', 'act', 'Tải lại'); re.onclick = () => { f.src = f.src; };
      const out = fsBtn(sc);
      const snap = E('button', 'act', 'Chụp'); snap.onclick = async () => { snap.disabled = true; snap.textContent = 'Đang chụp…'; try { await api('api/board/shot', {port:sel.port}); snap.textContent = 'Đã chụp'; poll(true); } catch (e) { snap.textContent = e.message.slice(0, 40); } setTimeout(() => { snap.disabled = false; snap.textContent = 'Chụp'; }, 4000); };
      bar.append(E('span', '', ':' + sel.port + ' · ' + (sel.title || sel.name)), zoom, re, out); if (B && B.can_shot) bar.append(snap); bar.append(home);
    } else if (sel.kind === 'image') {
      const i = E('img'); i.src = imgUrl(sel); i.alt = sel.name; sc.append(i);
      const out = fsBtn(sc);
      bar.append(E('span', '', sel.name + ' · ' + sel.when + (sel.src === 'hub' ? '' : ' · @' + sel.src)), out, home);
    } else { const d = E('div', 'slide'); d.append(E('b', '', sel.name + ' · ' + sel.when), sel.text || ''); sc.append(d); bar.append(E('span', '', 'Ghi chú' + (sel.src === 'hub' ? ' của CEO' : ' của @' + sel.src)), home); }
  }
  function lists() {
    const l = $('blists'); l.textContent = ''; if (!B) return;
    const sv = B.servers, ks = E('div', 'card');
    // the PC's screen: one row, two ways to look at it, the last choice remembered on this device
    { let mode = 'view'; try { mode = localStorage.getItem('dp-screen-mode') || (B.mw && B.mw.link ? 'gaming' : 'view'); } catch (e) {}
      if (mode === 'gaming' && !(B.mw && B.mw.link)) mode = 'view';
      const card = E('div', ''), top = E('div', 'row line'); top.append(E('span', 'dot work')); const nm = E('span', 'nm');
      nm.append(E('b', '', 'Màn hình PC'), E('small', '', mode === 'gaming' ? 'Gaming: MoonlightWeb, xem và điều khiển, độ trễ thấp' : 'Xem ảnh: khoảng 1 hình mỗi giây, chỉ xem, nhẹ máy')); top.append(nm);
      const go = E('button', 'act go', mode === 'gaming' ? 'Chơi' : 'Xem'); go.style.margin = '0'; top.append(go);
      const seg = E('div', 'seg'); [['view', '🖼 Xem ảnh'], ['gaming', '🎮 Gaming']].forEach(([k, t]) => { const b = E('button', mode === k ? 'on' : '', t);
        if (k === 'gaming' && !(B.mw && B.mw.link)) { b.disabled = true; b.title = 'MoonlightWeb chưa sẵn sàng'; }
        b.onclick = () => { try { localStorage.setItem('dp-screen-mode', k); } catch (e) {} lists(); }; seg.append(b); });
      go.onclick = () => { if (mode === 'gaming') { window.open(B.mw.link, '_blank'); } else { sel = {kind:'pc', id:'pc'}; screen(); lists(); scrollTo(0, 0); } };
      card.append(top, seg);
      if (mode === 'gaming' && B.mw) {
        if (B.mw.pin) { const p = E('div', 'row line'); const nm2 = E('span', 'nm'); const v = E('b', '', '••••••'); nm2.append(E('small', '', 'Mã PIN cho máy mới (chạm để hiện) · mỗi mã dùng một lần'), v); p.append(E('span', 'dot'), nm2); p.onclick = () => { v.textContent = v.textContent.startsWith('•') ? B.mw.pin : '••••••'; }; card.append(p); }
        const n = E('div', 'row line'); const nb = twoTap('Tạo mã PIN mới cho máy khác', async () => { const o = await api('api/mw/newpin', {}); B.mw.pin = o.pin; lists(); return o.pin ? 'Mã mới: ' + o.pin + ' (dùng một lần, cho một máy)' : 'Chưa tạo được mã'; }); nb.style.margin = '0'; n.append(nb); card.append(n);
        card.append(E('div', 'note', 'Khi anh chơi, PC tự cho agents nghỉ và nâng tần số quét màn hình. Cần độ trễ thấp nhất thì dùng app Moonlight.')); }
      const pw = E('div', 'card'); pw.append(card); l.append(sect('b-pc', 'Màn hình PC', pw, true, mode === 'gaming' ? 'gaming' : 'xem ảnh')); }
    if (sv === null) ks.append(E('div', 'empty', 'PC chưa đọc được danh sách cổng (thiếu psutil hoặc thiếu quyền).'));
    else if (!sv.length) ks.append(E('div', 'empty', 'Không có server local nào đang chạy.'));
    else sv.forEach(s => { const me = {kind:'server', id:'s' + s.port, ...s}, d = E('div', 'row line pick' + (same(sel, me) ? ' on' : '')); d.append(E('span', 'dot work')); const nm = E('span', 'nm');
      nm.append(E('b', '', (s.title || s.name + (s.script ? ' ' + s.script : '')) + ' · :' + s.port), E('small', '', (s.project ? '@' + s.project : 'ngoài các project') + ' · ' + s.name + (s.script ? ' ' + s.script : '') + ' · chạy được ' + dur(s.mins)));
      d.append(nm, E('span', 'chip', 'Xem')); d.onclick = () => { sel = me; screen(); lists(); scrollTo(0, 0); }; ks.append(d); });
    l.append(sect('b-srv', 'Server local trên PC', ks, true, sv ? sv.length + ' đang chạy' : ''));
    const its = B.items || [], kt = E('div', 'card');
    if (!its.length) kt.append(E('div', 'empty', 'Chưa có ảnh hay ghi chú. Bấm "Chụp" khi đang xem một server, hoặc nhắn CEO "đưa … lên bảng".'));
    else { const g = E('div', 'thumbs'); its.forEach(it => { const me = {id:it.src + '/' + it.name, ...it}, b = E('button', same(sel, me) ? 'on' : '');
      if (it.kind === 'image') { const i = E('img'); i.loading = 'lazy'; i.src = imgUrl(it); i.alt = ''; b.append(i); } else b.append(E('div', 'nt', (it.text || '').slice(0, 140)));
      b.append(E('small', '', (it.src === 'hub' ? '' : '@' + it.src + ' · ') + it.when)); b.onclick = () => { sel = me; screen(); lists(); scrollTo(0, 0); }; g.append(b); }); kt.append(g); }
    l.append(sect('b-items', 'Ảnh chụp và ghi chú', kt, true, its.length ? its.length + ' mục' : ''));
  }
  async function poll(force) {
    if (!force && (cur !== 'hw' || document.hidden)) return; build();
    if (!liveMode) { $('bscreen').textContent = ''; $('bscreen').append(E('div', 'slide', 'Bảng trình chiếu chỉ xem được khi nối trực tiếp với PC.')); return; }
    try { B = await api('api/board'); } catch (e) { $('blists').textContent = ''; $('blists').append(E('div', 'empty', e.message)); return; }
    if (sel && sel.kind === 'server' && B.servers && !B.servers.some(s => s.port === sel.port)) { sel = null; screen(); }
    const its = B.items || [], top = its.find(i => i.kind === 'image'), was = sel;
    if (sel && sel.kind !== 'server' && !its.some(i => i.src === sel.src && i.name === sel.name && i.t === sel.t)) sel = null;      // the old picture is gone from the board
    if (top && newest !== null && top.t > newest && (!sel || sel.kind !== 'server')) sel = {id:top.src + '/' + top.name, ...top};   // a new picture: present it
    newest = top ? top.t : 0; if (sel !== was) { screen(); lists(); }
    const sig = JSON.stringify([B.servers, (B.items || []).map(i => [i.name, i.t]), B.can_shot]);
    if (sig !== lastSig) { lastSig = sig; lists(); }
    if (!sel || !$('bscreen').firstChild) screen();
  }
  window.boardOpen = () => { build(); screen(); poll(true); clearInterval(timer); timer = setInterval(poll, 12000); };
})();
