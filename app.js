/* Malyaz — Mehmet Ali Yaz'ın şiir ve makaleleri */
'use strict';
const APP_VER = '1.0.0';
const DATA_PATH = 'data/library.enc';
const ITER = 310000;
const AAD = new TextEncoder().encode('malyaz1');
const COLORS = ['sari', 'yesil', 'mavi', 'pembe'];

/* ================= yardımcılar ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const LS = {
  get(k, d) { try { const v = localStorage.getItem('malyaz.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('malyaz.' + k, JSON.stringify(v)); return true; } catch (e) { toast('Telefonda yer kalmadı, değişiklik kaydedilemedi.'); return false; } },
  del(k) { try { localStorage.removeItem('malyaz.' + k); } catch (e) { } }
};
const te = new TextEncoder(), td = new TextDecoder();
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s) { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/></svg>',
  aa: '<svg viewBox="0 0 24 24"><path d="M3 18l4.5-11L12 18M4.6 14h5.8M14 18l3-7.5 3 7.5M15 15.6h4"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>'
};

/* Türkçe katlama: büyük/küçük, şapka ve noktalama farkı gözetmeden arar (karakter sayısı aynı kalır) */
const FOLD = { 'İ': 'i', 'I': 'i', 'ı': 'i', 'Ş': 's', 'ş': 's', 'Ğ': 'g', 'ğ': 'g', 'Ü': 'u', 'ü': 'u', 'Ö': 'o', 'ö': 'o', 'Ç': 'c', 'ç': 'c', 'Â': 'a', 'â': 'a', 'Î': 'i', 'î': 'i', 'Û': 'u', 'û': 'u', '’': ' ', "'": ' ', '‘': ' ', '`': ' ' };
function fold(s) { let o = ''; for (const ch of s) { if (ch.length > 1) { o += ' '.repeat(ch.length); continue; } const f = FOLD[ch]; if (f) { o += f; continue; } const l = ch.toLowerCase(); o += l.length === 1 ? l : ch; } return o; }

/* ================= şifreleme ================= */
async function deriveKey(pw, saltB64, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(saltB64), iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function exportKey(k) { return b64(new Uint8Array(await crypto.subtle.exportKey('raw', k))); }
function importKey(s) { return crypto.subtle.importKey('raw', unb64(s), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); }
async function seal(obj, key, kinfo) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, te.encode(JSON.stringify(obj))));
  return JSON.stringify({ malyaz: 1, ver: new Date().toISOString(), kdf: { alg: 'PBKDF2-SHA256', iter: kinfo.iter, salt: kinfo.salt }, iv: b64(iv), ct: b64(ct) });
}
async function unseal(text, key) {
  const o = JSON.parse(text);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv), additionalData: AAD }, key, unb64(o.ct));
  return JSON.parse(td.decode(pt));
}
function header(text) { try { const o = JSON.parse(text); return o && o.malyaz && o.kdf ? o : null; } catch (e) { return null; } }

/* ================= durum ================= */
const S = {
  pub: null, lib: null, key: null, kinfo: null, draft: false,
  author: LS.get('author', null),
  ud: Object.assign({ hl: [], fav: [], prog: {}, last: null }, LS.get('ud', {})),
  set: Object.assign({ theme: 'kagit', size: 19, font: 'lora' }, LS.get('set', {})),
  route: null
};
const saveUD = () => LS.set('ud', S.ud);
const saveSet = () => { LS.set('set', S.set); applySet(); };
function applySet() {
  const r = document.documentElement;
  r.dataset.theme = S.set.theme; r.dataset.font = S.set.font;
  r.style.setProperty('--size', S.set.size + 'px');
  const m = $('meta[name="theme-color"]'); if (m) m.content = S.set.theme === 'gece' ? '#11151d' : S.set.theme === 'sepya' ? '#ece2cf' : '#eceee8';
}
function emptyLib() {
  return { v: 1, meta: { app: 'Malyaz', author: 'Mehmet Ali Yaz', email: '' }, books: [
    { id: 'terennum', title: 'Terennüm', subtitle: 'Şiirler', kind: 'poem', items: [] },
    { id: 'tinilar', title: 'Tınılar', subtitle: 'Makaleler', kind: 'essay', items: [] }] };
}
const book = id => S.lib.books.find(b => b.id === id);
const findItem = (bid, iid) => { const b = book(bid); return b ? b.items.find(i => i.id === iid) : null; };
const palOf = bid => (bid === 'tinilar' ? 'tinilar' : bid === 'terennum' ? 'terennum' : (book(bid) && book(bid).kind === 'essay' ? 'tinilar' : 'terennum'));
const accOf = bid => palOf(bid) === 'tinilar' ? 'var(--cini)' : 'var(--lac)';
const unit = b => b.kind === 'poem' ? 'şiir' : 'makale';

/* ================= açılış ================= */
async function fetchRemote() {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(DATA_PATH + '?t=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
    if (r.status === 404) return { st: 404 };
    if (!r.ok) return { st: 'err' };
    const text = await r.text();
    return header(text) ? { st: 200, text } : { st: 'err' };
  } catch (e) { return { st: 'offline' }; } finally { clearTimeout(t); }
}

async function boot() {
  applySet(); registerSW();
  const kinfo = LS.get('key', null); const cached = LS.get('enc', null);
  const remote = await fetchRemote();
  const text = remote.st === 200 ? remote.text : cached;
  if (!text) { if (remote.st === 404) return showSetup(); return showLock({ text: null, offline: remote.st === 'offline' }); }
  if (!kinfo) return showLock({ text });
  try {
    if (header(text).kdf.salt !== kinfo.salt) throw new Error('salt');
    S.key = await importKey(kinfo.k); S.kinfo = kinfo;
    S.pub = await unseal(text, S.key);
  } catch (e) { return showLock({ text, changed: true }); }
  const news = await diffNotice(cached, text);
  LS.set('enc', text); LS.set('ver', header(text).ver);
  await loadDraft();
  start();
  if (news) toast(news);
}

async function diffNotice(oldText, newText) {
  if (!oldText || !S.key || header(oldText).ver === header(newText).ver) return null;
  let old; try { old = await unseal(oldText, S.key); } catch (e) { return 'Yeni parolayla açıldı.'; }
  const added = [];
  for (const b of S.pub.books) { const ob = old.books.find(x => x.id === b.id); for (const it of b.items) if (!ob || !ob.items.find(x => x.id === it.id)) added.push(`“${it.title}”`); }
  if (added.length === 1) return `Yeni: ${added[0]}`;
  if (added.length > 1) return `${added.length} yeni yazı eklendi.`;
  return 'Yazılar güncellendi.';
}

async function loadDraft() {
  S.draft = false; S.lib = clone(S.pub);
  if (!S.author) return;
  const d = LS.get('draft', null);
  if (!d) return;
  try { S.lib = await unseal(d, S.key); S.draft = true; } catch (e) { LS.del('draft'); }
}
async function saveDraft() {
  S.draft = true;
  LS.set('draft', await seal(S.lib, S.key, S.kinfo));
  pubbar();
}

let started = false;
function start() {
  if (!started) {
    started = true;
    addEventListener('hashchange', route);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdates(); });
    document.addEventListener('selectionchange', onSelChange);
  }
  route();
}

async function checkUpdates() {
  if (!S.key) return;
  const r = await fetchRemote(); if (r.st !== 200) return;
  const cached = LS.get('enc', null);
  if (cached && header(cached).ver === header(r.text).ver) return;
  try {
    if (header(r.text).kdf.salt !== S.kinfo.salt) { LS.del('key'); location.reload(); return; }
    const lib = await unseal(r.text, S.key); S.pub = lib;
    const msg = await diffNotice(cached, r.text);
    LS.set('enc', r.text); LS.set('ver', header(r.text).ver);
    if (!S.draft) { S.lib = clone(lib); if (!['yaz'].includes(S.route && S.route[0])) route(); }
    if (msg) toast(msg);
  } catch (e) { }
}

/* ================= kilit ================= */
function showLock({ text, changed, offline }) {
  tabs(false);
  const app = $('#app');
  app.innerHTML = `<div class="lock"><canvas aria-hidden="true"></canvas>
    <form class="label" autocomplete="off">
      <h1>Malyaz</h1><p class="by">Mehmet Ali Yaz</p>
      <label class="sr" for="pw">Parola</label>
      <input id="pw" type="password" placeholder="Parola" autocomplete="current-password" enterkeyhint="go" required>
      <button class="btn" type="submit">Aç</button>
      <p class="msg ${changed ? '' : 'info'}">${changed ? 'Parola değişti. Yazardan aldığın yeni parolayı gir.' : offline ? 'İnternete bağlanınca parolayı gir.' : ''}</p>
    </form></div>`;
  const cv = $('.lock canvas'); paintFull(cv, 'malyaz', 1);
  const form = $('.lock form'), msg = $('.lock .msg'), btn = $('.lock .btn');
  form.onsubmit = async e => {
    e.preventDefault();
    const pw = $('#pw').value; if (!pw) return;
    btn.disabled = true; msg.className = 'msg info'; msg.textContent = 'Açılıyor…';
    if (!text) { const r = await fetchRemote(); if (r.st === 200) text = r.text; else if (r.st === 404) return showSetup(); else { msg.className = 'msg'; msg.textContent = 'İnternet yok. Bağlanınca tekrar dene.'; btn.disabled = false; return; } }
    const h = header(text);
    try {
      const key = await deriveKey(pw, h.kdf.salt, h.kdf.iter);
      const lib = await unseal(text, key);
      S.key = key; S.kinfo = { salt: h.kdf.salt, iter: h.kdf.iter, k: await exportKey(key) };
      LS.set('key', S.kinfo); LS.set('enc', text); LS.set('ver', h.ver); S.pub = lib;
      LS.del('draft'); await loadDraft();
      await openAnim(cv);
      start();
    } catch (err) {
      btn.disabled = false; msg.className = 'msg'; msg.textContent = 'Parola yanlış. Tekrar dene.';
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); $('#pw').select();
    }
  };
  setTimeout(() => $('#pw') && $('#pw').focus(), 300);
}
function paintFull(cv, name, f) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(innerWidth * dpr / 1.5); cv.height = Math.round(innerHeight * dpr / 1.5);
  Ebru.draw(cv, name, { f });
}
function openAnim(cv) {
  return new Promise(res => {
    const lock = $('.lock'); lock.classList.add('opening');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setTimeout(res, 50);
    // tek hareket: kilit açılınca ebru tarağı çekilir
    const t0 = performance.now(), D = 900;
    const step = now => {
      const p = Math.min(1, (now - t0) / D); const e = 1 - Math.pow(1 - p, 3);
      Ebru.draw(cv, 'malyaz', { f: 1 + e * 1.6, grain: false });
      if (p < 1) requestAnimationFrame(step); else setTimeout(res, 120);
    };
    requestAnimationFrame(step);
  });
}

/* ================= yönlendirme ================= */
function go(h, replace) { if (replace) history.replaceState(null, '', '#' + h); else location.hash = h; if (replace) route(); }
function parseHash() {
  const raw = location.hash.slice(1) || '/'; const [path, q] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(q || ''));
  return { parts, query };
}
const scrollMem = {};
function route() {
  if (!S.lib) return;
  if (S.route) scrollMem[S.route.key] = scrollY;
  hideSel(); closeSheet(true); window.onscroll = null; RD = null;
  const { parts, query } = parseHash();
  S.route = { key: parts.join('/'), 0: parts[0], parts, query };
  const p = parts;
  let tab = null;
  try {
    if (!p.length) { tab = 'home'; renderHome(); }
    else if (p[0] === 'k' && book(p[1])) { tab = 'home'; renderBook(p[1]); }
    else if (p[0] === 'o' && findItem(p[1], p[2])) { renderReader(p[1], p[2], query); }
    else if (p[0] === 'yaz' && S.author && book(p[1])) { renderDesk(p[1], p[2]); }
    else if (p[0] === 'ara') { tab = 'ara'; renderSearch(query.q || ''); }
    else if (p[0] === 'notlar') { tab = 'notlar'; renderNotes(query.s || 'vurgu'); }
    else if (p[0] === 'ayarlar') { tab = 'ayarlar'; renderSettings(); }
    else { go('/', true); return; }
  } catch (e) { console.error(e); $('#app').innerHTML = `<div class="empty"><p>Bu sayfa açılamadı.</p><a class="btn" href="#/">Kitaplığa dön</a></div>`; }
  tabs(tab);
  pubbar();
  const keep = scrollMem[S.route.key];
  if (!(p[0] === 'o')) requestAnimationFrame(() => scrollTo(0, keep || 0));
}
function tabs(on) {
  const t = $('#tabs'); t.hidden = !on;
  document.body.classList.toggle('no-tabs', !on); $('#app').classList.toggle('no-tabs', !on);
  if (on) $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === on));
}
function back(fallback) { if (history.length > 1 && sessionStorage.getItem('malyaz.nav')) history.back(); else go(fallback); }
addEventListener('hashchange', () => { try { sessionStorage.setItem('malyaz.nav', '1'); } catch (e) { } });

/* ================= kapak ================= */
const coverCache = {};
function coverURL(bid, w, h, ox, oy, zoom) {
  const k = [bid, w, h, ox, oy, zoom].join(':');
  if (coverCache[k]) return coverCache[k];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  Ebru.draw(c, palOf(bid), { ox, oy, zoom });
  return (coverCache[k] = c.toDataURL('image/jpeg', 0.86));
}
function coverImg(bid, w, h, opt = {}) {
  return `<canvas data-cover="${esc(bid)}" data-w="${w}" data-h="${h}" data-ox="${opt.ox ?? ''}" data-oy="${opt.oy ?? ''}" data-zoom="${opt.zoom ?? ''}" aria-hidden="true"></canvas>`;
}
function paintCovers(root) {
  $$('canvas[data-cover]', root).forEach(cv => {
    const w = +cv.dataset.w, h = +cv.dataset.h;
    const url = coverURL(cv.dataset.cover, w, h, cv.dataset.ox === '' ? undefined : +cv.dataset.ox, cv.dataset.oy === '' ? undefined : +cv.dataset.oy, cv.dataset.zoom === '' ? undefined : +cv.dataset.zoom);
    const img = new Image(); img.src = url; img.alt = ''; img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block';
    if (cv.parentElement && getComputedStyle(cv.parentElement).position === 'static') img.style.position = 'static';
    cv.replaceWith(img);
  });
}

/* ================= ana ekran ================= */
function verseOfDay() {
  const poems = []; for (const b of S.lib.books) if (b.kind === 'poem') for (const it of b.items) poems.push([b, it]);
  if (!poems.length) return null;
  const day = Math.floor((Date.now() + 3 * 3600e3) / 864e5);
  const [b, it] = poems[day % poems.length];
  const stanzas = []; let cur = []; let pos = 0;
  for (const ln of it.text.split('\n')) { if (!ln.trim() || /^\d{1,3}$/.test(ln.trim())) { if (cur.length) stanzas.push(cur); cur = []; } else cur.push([ln, pos]); pos += ln.length + 1; }
  if (cur.length) stanzas.push(cur);
  const good = stanzas.filter(s => s.length >= 2); if (!good.length) return null;
  const st = good[(day * 7) % good.length];
  return { b, it, lines: st.slice(0, 2).map(x => x[0]), at: st[0][1] };
}
function renderHome() {
  const L = S.lib, last = S.ud.last && findItem(S.ud.last.b, S.ud.last.i) ? S.ud.last : null;
  const v = verseOfDay();
  $('#app').innerHTML = `<div class="home screen">
    <header class="mast"><h1>Malyaz</h1><span class="who">${esc(L.meta.author || 'Mehmet Ali Yaz')}</span></header>
    ${S.author ? `<span class="author-pill">Yazar modu açık</span>` : ''}
    <div class="shelf">${L.books.map(b => `
      <a class="book" href="#/k/${esc(b.id)}">
        <div class="cover">${coverImg(b.id, 420, 630)}<div class="tag"><b>${esc(b.title)}</b><i>${esc(b.subtitle || '')}</i></div></div>
        <div class="meta"><b>${esc(b.title)}</b>${b.items.length} ${unit(b)}</div>
      </a>`).join('')}</div>
    ${last ? (() => { const it = findItem(last.b, last.i); const p = Math.round((S.ud.prog[it.id] || 0) * 100); return `
      <section class="sec"><h2>Kaldığın yer</h2>
      <a class="resume" href="#/o/${esc(last.b)}/${esc(it.id)}"><div class="sw">${coverImg(last.b, 84, 116)}</div>
      <div style="flex:1;min-width:0"><b>${esc(it.title)}</b><span>${esc(firstLine(it))}</span><div class="bar2"><i style="width:${p}%"></i></div></div></a></section>`; })() : ''}
    ${v ? `<section class="sec"><h2>Günün dizeleri</h2>
      <a class="verse" href="#/o/${esc(v.b.id)}/${esc(v.it.id)}?at=${v.at}"><p>${v.lines.map(esc).join('<br>')}</p><cite>${esc(v.it.title)}, ${esc(v.b.title)}</cite></a></section>` : ''}
  </div>`;
  paintCovers($('#app'));
}
function firstLine(it) { const l = it.text.split('\n').find(x => x.trim() && !/^\d{1,3}$/.test(x.trim())) || ''; return l.length > 120 ? l.slice(0, 118) + '…' : l; }

/* ================= kitap ================= */
function itemState(bid, it) {
  if (!S.draft) return '';
  const pb = S.pub.books.find(b => b.id === bid); const old = pb && pb.items.find(x => x.id === it.id);
  if (!old) return 'new';
  return ['title', 'note', 'text', 'date'].some(k => (old[k] || '') !== (it[k] || '')) ? 'edited' : '';
}
function renderBook(bid) {
  const b = book(bid); const A = S.author;
  document.documentElement.style.setProperty('--acc', accOf(bid));
  $('#app').innerHTML = `<div class="screen">
    <header class="bhead">${coverImg(bid, 900, 480, { oy: 0.35 })}
      <button class="ib back" aria-label="Geri">${ICON.back}</button>
      <div class="tag"><b>${esc(b.title)}</b><i>${esc(b.subtitle || '')}</i></div></header>
    <div class="toc">
      ${A ? `<div class="tools"><a class="btn small" href="#/yaz/${esc(bid)}/yeni">${ICON.pen.replace('<svg', '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"')} Yeni ${unit(b)} yaz</a></div>` : ''}
      <div class="count">${b.items.length} ${unit(b)}</div>
      ${b.items.length ? b.items.map((it, i) => `
        <div class="row ${itemState(bid, it)}" data-id="${esc(it.id)}">
          <a href="#/o/${esc(bid)}/${esc(it.id)}"><b>${esc(it.title)}</b><span>${esc(it.note || firstLine(it))}</span></a>
          ${S.ud.fav.includes(it.id) ? '<svg class="heart" viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/></svg>' : ''}
          ${A ? `<button class="ib" data-act="${i}" aria-label="${esc(it.title)} için seçenekler">${ICON.more}</button>` : ''}
        </div>`).join('') : `<div class="empty"><p>Bu kitapta henüz ${unit(b)} yok.</p>${A ? `<a class="btn" href="#/yaz/${esc(bid)}/yeni">İlk ${unit(b)}i yaz</a>` : ''}</div>`}
    </div></div>`;
  paintCovers($('#app'));
  $('.bhead .back').onclick = () => back('/');
  $$('[data-act]').forEach(btn => btn.onclick = () => itemMenu(bid, +btn.dataset.act));
}
function itemMenu(bid, i) {
  const b = book(bid), it = b.items[i];
  sheet(`<h2>${esc(it.title)}</h2><div class="list">
    <button class="item" data-a="edit"><span>Düzenle</span></button>
    <button class="item" data-a="up" ${i === 0 ? 'disabled' : ''}><span>Yukarı taşı</span></button>
    <button class="item" data-a="down" ${i === b.items.length - 1 ? 'disabled' : ''}><span>Aşağı taşı</span></button>
    <button class="item danger" data-a="del"><span>Sil</span></button></div>`, el => {
    $$('[data-a]', el).forEach(x => x.onclick = async () => {
      const a = x.dataset.a; closeSheet();
      if (a === 'edit') return go(`/yaz/${bid}/${it.id}`);
      if (a === 'up' || a === 'down') { const j = a === 'up' ? i - 1 : i + 1; [b.items[i], b.items[j]] = [b.items[j], b.items[i]]; await saveDraft(); renderBook(bid); pubbar(); return; }
      if (a === 'del') {
        if (await ask(`“${it.title}” silinsin mi?`, 'Yayınlamadan önce “Değişiklikleri geri al” ile geri getirebilirsin.', 'Sil', true)) {
          b.items.splice(i, 1); await saveDraft(); renderBook(bid); toast(`“${it.title}” silindi.`);
        }
      }
    });
  });
}

/* ================= okuma ================= */
function blocks(item, kind) {
  const t = item.text || '', out = [];
  if (kind === 'poem') {
    let pos = 0;
    for (const line of t.split('\n')) {
      if (!line.trim()) out.push({ type: 'gap' });
      else if (/^\d{1,3}$/.test(line.trim())) out.push({ type: 'part', text: line.trim() });
      else { const lead = line.length - line.trimStart().length; out.push({ type: 'line', text: line.trim(), s: pos + lead }); }
      pos += line.length + 1;
    }
  } else {
    const re = /\n[ \t]*\n/g; let last = 0, m;
    const push = (s, e) => { const seg = t.slice(s, e); const lead = seg.length - seg.trimStart().length; const txt = seg.trim(); if (txt) out.push({ type: 'para', text: txt, s: s + lead }); };
    while ((m = re.exec(t))) { push(last, m.index); last = m.index + m[0].length; }
    push(last, t.length);
  }
  return out;
}
function anchorHls(item) {
  const list = S.ud.hl.filter(h => h.i === item.id); let changed = false;
  for (const h of list) {
    if (item.text.slice(h.s, h.e) === h.q) { h.o = false; continue; }
    const k = item.text.indexOf(h.q);
    if (k >= 0) { h.s = k; h.e = k + h.q.length; h.o = false; changed = true; } else if (!h.o) { h.o = true; changed = true; }
  }
  if (changed) saveUD();
  return list.filter(h => !h.o);
}
function segHTML(text, s0, hls) {
  const e0 = s0 + text.length; const rel = hls.filter(h => h.e > s0 && h.s < e0);
  if (!rel.length) return esc(text);
  const pts = new Set([s0, e0]); rel.forEach(h => { pts.add(Math.max(s0, h.s)); pts.add(Math.min(e0, h.e)); });
  const P = [...pts].sort((a, b) => a - b); let out = '';
  for (let k = 0; k < P.length - 1; k++) {
    const a = P[k], b = P[k + 1]; const piece = esc(text.slice(a - s0, b - s0));
    const cov = rel.filter(h => h.s <= a && h.e >= b); const top = cov[cov.length - 1];
    out += top ? `<mark class="hl c-${top.c}${top.n ? ' has-note' : ''}" data-h="${top.id}">${piece}</mark>` : piece;
  }
  return out;
}
function bodyHTML(item, kind, hls = []) {
  const bl = blocks(item, kind);
  if (kind === 'poem') {
    let h = '<div class="poem"><div class="stanza">'; let open = true;
    for (const x of bl) {
      if (x.type === 'gap') { if (open) { h += '</div>'; open = false; } }
      else if (x.type === 'part') { if (open) h += '</div>'; h += `<span class="part">${esc(x.text)}</span><div class="stanza">`; open = true; }
      else { if (!open) { h += '<div class="stanza">'; open = true; } h += `<span class="ln" data-s="${x.s}">${segHTML(x.text, x.s, hls)}</span>`; }
    }
    if (open) h += '</div>';
    return (h + '</div>').replace(/<div class="stanza"><\/div>/g, '');
  }
  return '<div class="essay">' + bl.map((x, k) => `<p class="${k === 0 ? 'first' : ''}" data-s="${x.s}">${segHTML(x.text, x.s, hls)}</p>`).join('') + '</div>';
}
let RD = null; // açık okuma bağlamı
function renderReader(bid, iid, query) {
  const b = book(bid), idx = b.items.findIndex(x => x.id === iid), it = b.items[idx];
  document.documentElement.style.setProperty('--acc', accOf(bid));
  const fav = S.ud.fav.includes(it.id);
  const prev = b.items[idx - 1], next = b.items[idx + 1];
  RD = { bid, iid, kind: b.kind };
  $('#app').innerHTML = `<div class="progress"></div>
    <header class="bar"><button class="ib" data-x="back" aria-label="Geri">${ICON.back}</button>
      <div class="ttl">${esc(it.title)}</div>
      <button class="ib" data-x="aa" aria-label="Görünüm">${ICON.aa}</button>
      <button class="ib ${fav ? 'fav-on' : ''}" data-x="fav" aria-label="${fav ? 'Favorilerden çıkar' : 'Favorilere ekle'}">${ICON.heart}</button>
      ${S.author ? `<button class="ib" data-x="edit" aria-label="Düzenle">${ICON.pen}</button>` : ''}
    </header>
    <article class="reader screen" lang="tr">
      <h1>${esc(it.title)}</h1>${it.note ? `<p class="note">${esc(it.note)}</p>` : ''}<div class="rule"></div>
      <div id="txt">${bodyHTML(it, b.kind, anchorHls(it))}</div>
      ${it.date ? `<p class="date">${esc(it.date)}</p>` : ''}
      <div class="end" aria-hidden="true"><i></i><i></i><i></i></div>
    </article>
    <nav class="pager">${prev ? `<a href="#/o/${esc(bid)}/${esc(prev.id)}"><small>Önceki</small><b>${esc(prev.title)}</b></a>` : ''}${next ? `<a class="next" href="#/o/${esc(bid)}/${esc(next.id)}"><small>Sonraki</small><b>${esc(next.title)}</b></a>` : ''}</nav>`;
  const bar = $('.bar');
  $('[data-x="back"]').onclick = () => back('/k/' + bid);
  $('[data-x="aa"]').onclick = lookSheet;
  $('[data-x="fav"]').onclick = e => toggleFav(it.id, e.currentTarget);
  if (S.author) $('[data-x="edit"]').onclick = () => go(`/yaz/${bid}/${it.id}`);
  $('#txt').addEventListener('click', e => { const m = e.target.closest('mark.hl'); if (m && !hasSel()) hlSheet(m.dataset.h); });
  S.ud.last = { b: bid, i: it.id }; saveUD();
  const prog = $('.progress');
  let tq = 0;
  const onScroll = () => {
    bar.classList.toggle('scrolled', scrollY > 60);
    const max = document.documentElement.scrollHeight - innerHeight; const f = max > 0 ? Math.min(1, scrollY / max) : 1;
    prog.style.width = (f * 100) + '%';
    clearTimeout(tq); tq = setTimeout(() => { if (RD && RD.iid === it.id) { S.ud.prog[it.id] = f; saveUD(); } }, 400);
  };
  window.onscroll = onScroll;
  requestAnimationFrame(() => {
    if (query.at != null || query.h) {
      let off = +query.at; if (query.h) { const h = S.ud.hl.find(x => x.id === query.h); if (h) off = h.s; }
      jumpTo(off, query.len ? +query.len : 0, query.h);
    } else {
      const max = document.documentElement.scrollHeight - innerHeight; const f = S.ud.prog[it.id];
      scrollTo(0, scrollMem['o/' + bid + '/' + iid] ?? (f && f < .98 ? f * max : 0));
    }
    onScroll();
  });
}
function jumpTo(off, len, hid) {
  let el = null;
  if (hid) el = $(`mark[data-h="${hid}"]`);
  if (!el) { for (const x of $$('#txt [data-s]')) { if (+x.dataset.s <= off) el = x; else break; } }
  if (!el) return;
  const r = el.getBoundingClientRect(); scrollTo(0, scrollY + r.top - innerHeight * 0.35);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
function toggleFav(id, btn) {
  const i = S.ud.fav.indexOf(id);
  if (i >= 0) S.ud.fav.splice(i, 1); else S.ud.fav.unshift(id);
  saveUD(); btn.classList.toggle('fav-on', i < 0); btn.setAttribute('aria-label', i < 0 ? 'Favorilerden çıkar' : 'Favorilere ekle');
  toast(i < 0 ? 'Favorilere eklendi.' : 'Favorilerden çıkarıldı.');
}
function lookSheet() {
  sheet(`<h2>Görünüm</h2>${lookControls()}`, el => bindLook(el));
}
function lookControls() {
  return `<div class="themes">${[['kagit', 'Kâğıt'], ['sepya', 'Sepya'], ['gece', 'Gece']].map(([k, n]) => `<button class="t-${k} ${S.set.theme === k ? 'on' : ''}" data-theme-set="${k}">${n}</button>`).join('')}</div>
    <div class="stepper"><button data-size="-1" aria-label="Yazıyı küçült">A−</button><output>Yazı boyutu ${S.set.size}</output><button data-size="1" aria-label="Yazıyı büyüt">A+</button></div>
    <div class="seg" style="margin:0 16px 12px"><button data-font-set="lora" class="${S.set.font === 'lora' ? 'on' : ''}" style="font-family:var(--serif)">Lora</button><button data-font-set="sistem" class="${S.set.font === 'sistem' ? 'on' : ''}" style="font-family:var(--sans)">Sistem yazısı</button></div>`;
}
function bindLook(el) {
  $$('[data-theme-set]', el).forEach(b => b.onclick = () => { S.set.theme = b.dataset.themeSet; saveSet(); $$('[data-theme-set]', el).forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-font-set]', el).forEach(b => b.onclick = () => { S.set.font = b.dataset.fontSet; saveSet(); $$('[data-font-set]', el).forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-size]', el).forEach(b => b.onclick = () => { S.set.size = Math.max(15, Math.min(28, S.set.size + +b.dataset.size)); saveSet(); $('output', el).textContent = 'Yazı boyutu ' + S.set.size; });
}

/* ================= seçim, vurgu, not ================= */
let SEL = null, selTimer = 0, barHold = false;
function hasSel() { const s = getSelection(); return s && !s.isCollapsed && String(s).trim(); }
function pointOff(node, off, isEnd) {
  let el = node.nodeType === 1 ? node : node.parentElement;
  let blockEl = el && el.closest('[data-s]');
  if (!blockEl) {
    if (node.nodeType !== 1) return null;
    const all = $$('#txt [data-s]');
    if (isEnd) { const c = node.childNodes[off - 1]; const cands = all.filter(x => c && (c === x || c.contains(x) || (c.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_PRECEDING))); const x = cands[cands.length - 1]; return x ? +x.dataset.s + x.textContent.length : null; }
    const c = node.childNodes[off]; const x = all.find(x => c && (c === x || c.contains(x) || (c.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING))); return x ? +x.dataset.s : null;
  }
  const r = document.createRange(); r.selectNodeContents(blockEl); r.setEnd(node, off);
  return +blockEl.dataset.s + r.toString().length;
}
function readSel() {
  const s = getSelection(); if (!s || s.isCollapsed || !s.rangeCount || !RD) return null;
  const txt = $('#txt'); if (!txt) return null;
  const r = s.getRangeAt(0); if (!txt.contains(r.commonAncestorContainer) && r.commonAncestorContainer !== txt) return null;
  let a = pointOff(r.startContainer, r.startOffset, false), b = pointOff(r.endContainer, r.endOffset, true);
  if (a == null || b == null || b <= a) return null;
  const it = findItem(RD.bid, RD.iid); const q = it.text.slice(a, b);
  const lead = q.length - q.trimStart().length, trail = q.length - q.trimEnd().length;
  a += lead; b -= trail; if (b <= a) return null;
  return { b: RD.bid, i: RD.iid, s: a, e: b, q: it.text.slice(a, b) };
}
function onSelChange() {
  clearTimeout(selTimer);
  selTimer = setTimeout(() => {
    const sel = readSel();
    if (sel) { SEL = sel; showSel(); } else if (!barHold) hideSel();
  }, 180);
}
function showSel() {
  const bar = $('#selbar');
  if (bar.hidden) {
    bar.innerHTML = COLORS.map(c => `<button class="dot c-${c}" data-c="${c}" aria-label="${{ sari: 'Sarı', yesil: 'Yeşil', mavi: 'Mavi', pembe: 'Pembe' }[c]} vurgula"></button>`).join('') +
      `<span class="sep"></span><button data-b="note">Not</button><button data-b="card">Kart</button><button data-b="copy">Kopyala</button>`;
    bar.onpointerdown = () => { barHold = true; setTimeout(() => barHold = false, 900); };
    bar.onclick = e => {
      const t = e.target.closest('button'); if (!t || !SEL) return;
      const sel = SEL;
      if (t.dataset.c) { addHl(sel, t.dataset.c); clearSel(); }
      else if (t.dataset.b === 'note') { const h = addHl(sel, 'sari', true); clearSel(); hlSheet(h.id, true); }
      else if (t.dataset.b === 'card') { clearSel(); cardSheet(sel.q, sel.b, sel.i); }
      else if (t.dataset.b === 'copy') { copyText(sel.q); clearSel(); }
    };
    bar.hidden = false; $('#toast').hidden = true;
  }
}
function hideSel() { const bar = $('#selbar'); if (bar) bar.hidden = true; }
function clearSel() { try { getSelection().removeAllRanges(); } catch (e) { } SEL = null; hideSel(); }
function addHl(sel, c, quiet) {
  // aynı aralıkta vurgu varsa rengini değiştir
  let h = S.ud.hl.find(x => x.i === sel.i && x.s === sel.s && x.e === sel.e);
  if (h) h.c = c; else { h = { id: uid('h'), b: sel.b, i: sel.i, s: sel.s, e: sel.e, q: sel.q, c, n: '', t: Date.now() }; S.ud.hl.push(h); }
  saveUD(); refreshText(); if (!quiet) toast('Vurgulandı.');
  return h;
}
function refreshText() {
  if (!RD) return; const it = findItem(RD.bid, RD.iid); const t = $('#txt'); if (!t) return;
  t.innerHTML = bodyHTML(it, RD.kind, anchorHls(it));
}
function hlSheet(id, focusNote) {
  const h = S.ud.hl.find(x => x.id === id); if (!h) return;
  sheet(`<blockquote>${esc(h.q)}</blockquote>
    <div class="themes" style="padding:0 0 14px">${COLORS.map(c => `<button data-c="${c}" class="${h.c === c ? 'on' : ''}" style="background:var(--hl-${c});color:var(--ink);height:40px" aria-label="${c}"></button>`).join('')}</div>
    <label class="field"><span>Not</span><textarea id="nt" placeholder="Bu dizeye dair düşüncen…">${esc(h.n)}</textarea></label>
    <div class="acts"><button class="btn ghost" data-a="del">Vurguyu sil</button><button class="btn ghost" data-a="card">Kart</button><button class="btn" data-a="save">Kaydet</button></div>`, el => {
    $$('[data-c]', el).forEach(b => b.onclick = () => { h.c = b.dataset.c; $$('[data-c]', el).forEach(x => x.classList.toggle('on', x === b)); saveUD(); refreshText(); });
    $('[data-a="save"]', el).onclick = () => { h.n = $('#nt', el).value.trim(); saveUD(); refreshText(); closeSheet(); toast(h.n ? 'Not kaydedildi.' : 'Kaydedildi.'); };
    $('[data-a="del"]', el).onclick = () => { S.ud.hl = S.ud.hl.filter(x => x.id !== id); saveUD(); refreshText(); closeSheet(); toast('Vurgu silindi.'); if (S.route && S.route[0] === 'notlar') route(); };
    $('[data-a="card"]', el).onclick = () => { closeSheet(true); cardSheet(h.q, h.b, h.i); };
    if (focusNote) setTimeout(() => $('#nt', el).focus(), 300);
  });
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Kopyalandı.'); } catch (e) { toast('Kopyalanamadı.'); } }

/* ================= alıntı kartı ================= */
async function makeCard(quote, bid, iid) {
  const it = findItem(bid, iid), b = book(bid);
  try { await document.fonts.load('italic 60px Lora'); await document.fonts.load('600 40px Lora'); } catch (e) { }
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  Ebru.draw(c, palOf(bid), { oy: 0.2 });
  const px = 90, py = 120, pw = W - px * 2, ph = H - py * 2;
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(px + 6, py + 14, pw, ph);
  g.fillStyle = '#f4efe1'; g.fillRect(px, py, pw, ph);
  g.strokeStyle = '#b8953f'; g.lineWidth = 2; g.strokeRect(px + 14, py + 14, pw - 28, ph - 28);
  const tx = px + 70, tw = pw - 140, maxH = ph - 330;
  let size = 60, lines;
  const wrap = (sz) => {
    g.font = `italic 400 ${sz}px Lora, Georgia, serif`; const out = [];
    for (const para of quote.split('\n')) {
      if (!para.trim()) { out.push(''); continue; }
      let line = '';
      for (const w of para.trim().split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > tw && line) { out.push(line); line = w; } else line = t; }
      out.push(line);
    }
    return out;
  };
  while (true) { lines = wrap(size); if (lines.length * size * 1.45 <= maxH || size <= 26) break; size -= 2; }
  if (lines.length * size * 1.45 > maxH) { const keep = Math.floor(maxH / (size * 1.45)); lines = lines.slice(0, keep); lines[keep - 1] += ' …'; }
  g.fillStyle = '#1d2a4c'; g.textBaseline = 'alphabetic';
  g.font = `italic 400 ${size}px Lora, Georgia, serif`;
  const blockH = lines.length * size * 1.45; let y = py + 90 + (maxH - blockH) / 2 + size;
  g.fillStyle = '#b8953f'; g.font = `italic 400 120px Lora, Georgia, serif`; g.fillText('“', tx - 18, py + 150);
  g.fillStyle = '#1d2a4c'; g.font = `italic 400 ${size}px Lora, Georgia, serif`;
  for (const l of lines) { g.fillText(l, tx, y); y += size * 1.45; }
  g.fillStyle = '#b8953f'; g.fillRect(tx, py + ph - 200, 70, 3);
  g.fillStyle = '#1d2a4c'; g.font = `600 40px Lora, Georgia, serif`; g.fillText(it.title, tx, py + ph - 140, tw);
  g.fillStyle = '#5c6378'; g.font = `italic 400 30px Lora, Georgia, serif`; g.fillText(`${S.lib.meta.author || 'Mehmet Ali Yaz'}, ${b.title}`, tx, py + ph - 92, tw);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
async function cardSheet(quote, bid, iid) {
  const blob = await makeCard(quote, bid, iid); const url = URL.createObjectURL(blob);
  const it = findItem(bid, iid);
  const name = 'malyaz-' + (it.title || 'kart').toLowerCase().replace(/[^a-z0-9ğüşöçı]+/gi, '-').slice(0, 30) + '.png';
  const file = new File([blob], name, { type: 'image/png' });
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  sheet(`<h2>Alıntı kartı</h2><img class="cardprev" src="${url}" alt="Alıntı kartı önizlemesi">
    <p style="margin:8px 0 0;color:var(--muted);font-size:13px">Kartta seçtiğin dizeler açıkça görünür. Paylaştığın kişi parolasız okuyabilir.</p>
    <div class="acts">${canShare ? '<button class="btn" data-a="share">Paylaş</button>' : ''}<a class="btn ${canShare ? 'ghost' : ''}" href="${url}" download="${esc(name)}">Kaydet</a></div>`, el => {
    const s = $('[data-a="share"]', el); if (s) s.onclick = async () => { try { await navigator.share({ files: [file] }); } catch (e) { } };
  });
}

/* ================= arama ================= */
function renderSearch(q) {
  $('#app').innerHTML = `<div class="page screen"><h1>Ara</h1>
    <div class="search">${ICON.search}<input id="q" type="search" placeholder="Şiirlerde ve makalelerde ara" value="${esc(q)}" autocomplete="off" enterkeyhint="search"></div>
    <div class="hits" id="hits"></div></div>`;
  const inp = $('#q'); let t = 0;
  const run = () => { const v = inp.value; history.replaceState(null, '', '#/ara' + (v ? '?q=' + encodeURIComponent(v) : '')); $('#hits').innerHTML = searchHTML(v); };
  inp.oninput = () => { clearTimeout(t); t = setTimeout(run, 160); };
  run(); if (!q) setTimeout(() => inp.focus(), 250);
}
function searchHTML(q) {
  const f = fold(q).trim().replace(/\s+/g, ' ');
  if (f.length < 2) return `<div class="empty"><p>Bir kelime ya da dize yaz. “ı” ile “i”, “ş” ile “s” aynı sayılır.</p></div>`;
  let html = '', total = 0;
  for (const b of S.lib.books) {
    const rows = [];
    for (const it of b.items) {
      const ft = fold(it.text); const fT = fold(it.title + ' ' + (it.note || ''));
      const k = ft.indexOf(f); const inTitle = fT.includes(f);
      if (k < 0 && !inTitle) continue;
      let count = 0, p = -1; while ((p = ft.indexOf(f, p + 1)) >= 0 && count < 99) count++;
      let snip = esc(firstLine(it)), at = '';
      if (k >= 0) {
        const s = Math.max(0, k - 50), e = Math.min(it.text.length, k + f.length + 70);
        const pre = it.text.slice(s, k), mid = it.text.slice(k, k + f.length), post = it.text.slice(k + f.length, e);
        snip = (s > 0 ? '…' : '') + esc(pre).replace(/\n+/g, ' / ') + '<em>' + esc(mid) + '</em>' + esc(post).replace(/\n+/g, ' / ') + (e < it.text.length ? '…' : '');
        at = `?at=${k}&len=${f.length}`;
      }
      rows.push(`<a class="hit" href="#/o/${esc(b.id)}/${esc(it.id)}${at}"><b>${esc(it.title)}${count > 1 ? ` <small style="font-family:var(--sans);font-weight:400;color:var(--muted)">(${count} yerde)</small>` : ''}</b><span>${snip}</span></a>`);
    }
    if (rows.length) { total += rows.length; html += `<h3>${esc(b.title)}</h3>` + rows.join(''); }
  }
  return total ? html : `<div class="empty"><p>“${esc(q)}” geçen bir yazı bulunamadı.</p></div>`;
}

/* ================= notlarım ================= */
function renderNotes(s) {
  const hls = [...S.ud.hl].sort((a, b) => b.t - a.t).filter(h => findItem(h.b, h.i) || true);
  const favs = S.ud.fav.map(id => { for (const b of S.lib.books) { const it = b.items.find(x => x.id === id); if (it) return [b, it]; } return null; }).filter(Boolean);
  // açılışta yer değiştirmiş vurguları yeniden bağla
  for (const b of S.lib.books) for (const it of b.items) if (S.ud.hl.some(h => h.i === it.id)) anchorHls(it);
  const hlHTML = hls.length ? hls.map(h => {
    const it = findItem(h.b, h.i), b = book(h.b); const orphan = !it || h.o;
    const where = it ? `${esc(it.title)}, ${esc(b.title)}` : 'Bu yazı kaldırılmış';
    return `<a class="nt c-${h.c} ${orphan ? 'orphan' : ''}" ${it && !orphan ? `href="#/o/${esc(h.b)}/${esc(h.i)}?h=${h.id}"` : `data-orph="${h.id}"`}>
      <q>${esc(h.q)}</q>${h.n ? `<p>${esc(h.n)}</p>` : ''}<small>${where}${orphan && it ? ', metin değişmiş' : ''}</small></a>`;
  }).join('') : `<div class="empty"><p>Bir dizeyi basılı tutup seç, sonra bir renge dokun. Vurguların ve notların burada toplanır.</p></div>`;
  const favHTML = favs.length ? favs.map(([b, it]) => `<a class="hit" href="#/o/${esc(b.id)}/${esc(it.id)}"><b>${esc(it.title)}</b><span>${esc(b.title)}</span></a>`).join('') : `<div class="empty"><p>Okurken kalp simgesine dokunduğun yazılar burada durur.</p></div>`;
  $('#app').innerHTML = `<div class="page screen"><h1>Notlarım</h1>
    <div class="seg"><button data-s="vurgu" class="${s === 'vurgu' ? 'on' : ''}">Vurgular ve notlar (${hls.length})</button><button data-s="fav" class="${s === 'fav' ? 'on' : ''}">Favoriler (${favs.length})</button></div>
    <div>${s === 'fav' ? favHTML : hlHTML}</div></div>`;
  $$('.seg button').forEach(b => b.onclick = () => go('/notlar?s=' + b.dataset.s, true));
  $$('[data-orph]').forEach(a => a.onclick = async () => {
    if (await ask('Bu vurgu silinsin mi?', 'Vurguladığın metin yazıda artık yok.', 'Sil', true)) { S.ud.hl = S.ud.hl.filter(x => x.id !== a.dataset.orph); saveUD(); route(); }
  });
}

/* ================= ayarlar ================= */
function renderSettings() {
  const A = S.author;
  $('#app').innerHTML = `<div class="page screen"><h1>Ayarlar</h1>
    <section class="group"><h2>Okuma</h2>${lookControls()}</section>
    ${A ? `<section class="group"><h2>Yazar</h2>
      <p>Bu telefonda yazar modu açık. Yazdıkların “Yayınla” deyince arkadaşlarına gider.</p>
      <button class="item" data-a="publish"><span>Yayınla<small>${S.draft ? 'Yayınlanmamış değişiklikler var' : 'Her şey yayında'}</small></span></button>
      <button class="item" data-a="pw"><span>Okuyucu parolasını değiştir<small>Arkadaşların yeni parolayla açar</small></span></button>
      <button class="item" data-a="mail"><span>Geri bildirim e-postası<small>${esc(S.lib.meta.email || 'Belirlenmedi')}</small></span></button>
      <button class="item" data-a="export"><span>İçeriğin yedeğini indir<small>Şifresiz kopya, sadece kendi cihazında sakla</small></span></button>
      <button class="item" data-a="enc"><span>Şifreli dosyayı indir<small>GitHub'a elle yüklemek için</small></span></button>
      <button class="item" data-a="repo"><span>GitHub bağlantısı<small>${esc(A.repo)}</small></span></button>
      <button class="item danger" data-a="logout"><span>Yazar modunu kapat</span></button>
    </section>` : ''}
    <section class="group"><h2>Notlarım</h2>
      <p>Vurgu, not ve favoriler sadece bu telefonda durur. Telefon değiştirirken yedek al.</p>
      <button class="item" data-a="backup"><span>Notlarımı yedekle</span></button>
      <label class="item" style="cursor:pointer"><span>Yedekten geri yükle</span><input type="file" accept="application/json,.json" data-a="restore" hidden></label>
    </section>
    <section class="group"><h2>Uygulama</h2>
      ${S.lib.meta.email ? `<a class="item" href="mailto:${esc(S.lib.meta.email)}?subject=${encodeURIComponent('Malyaz hakkında')}"><span>Yazara yaz</span></a>` : ''}
      <button class="item" data-a="update"><span>Yeni yazıları denetle</span></button>
      <button class="item" data-a="lock"><span>Bu telefonda kilitle<small>Parola yeniden sorulur</small></span></button>
      ${A ? '' : `<button class="item" data-a="author"><span>Yazar girişi<small>Sadece Mehmet Ali Yaz için</small></span></button>`}
    </section>
    <p class="foot">Malyaz, sürüm ${APP_VER}</p></div>`;
  bindLook($('#app'));
  const on = (a, f) => { const el = $(`[data-a="${a}"]`); if (el) el[a === 'restore' ? 'onchange' : 'onclick'] = f; };
  on('publish', publishSheet);
  on('pw', passwordSheet);
  on('mail', emailSheet);
  on('export', () => download(JSON.stringify(S.lib, null, 1), `malyaz-icerik-${new Date().toISOString().slice(0, 10)}.json`, 'application/json'));
  on('enc', async () => download(await seal(S.lib, S.key, S.kinfo), 'library.enc', 'application/octet-stream'));
  on('repo', () => authorSheet(true));
  on('logout', async () => {
    if (await ask('Yazar modu kapatılsın mı?', S.draft ? 'Yayınlanmamış değişikliklerin bu telefondan silinir.' : 'GitHub anahtarı bu telefondan silinir. Tekrar açmak için anahtarı yeniden girmen gerekir.', 'Kapat', true)) {
      S.author = null; LS.del('author'); LS.del('draft'); LS.del('edit'); await loadDraft(); route(); toast('Yazar modu kapatıldı.');
    }
  });
  on('backup', () => download(JSON.stringify({ malyazNotlar: 1, ud: S.ud }, null, 1), `malyaz-notlarim-${new Date().toISOString().slice(0, 10)}.json`, 'application/json'));
  on('restore', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const o = JSON.parse(await f.text()); if (!o.malyazNotlar) throw 0;
      const have = new Set(S.ud.hl.map(h => h.id)); let n = 0;
      for (const h of o.ud.hl || []) if (!have.has(h.id)) { S.ud.hl.push(h); n++; }
      for (const id of o.ud.fav || []) if (!S.ud.fav.includes(id)) S.ud.fav.push(id);
      Object.assign(S.ud.prog, o.ud.prog || {}); saveUD(); toast(`${n} vurgu geri yüklendi.`);
    } catch (err) { toast('Bu dosya bir Malyaz yedeği değil.'); }
  });
  on('update', async () => { toast('Denetleniyor…'); const before = LS.get('ver', null); await checkUpdates(); if (LS.get('ver', null) === before) toast('Yeni yazı yok.'); });
  on('lock', async () => { if (await ask('Bu telefonda kilitlensin mi?', 'Notların silinmez. Açmak için parolayı yeniden girersin.', 'Kilitle')) { LS.del('key'); LS.del('draft'); location.reload(); } });
  on('author', () => authorSheet(false));
}
function download(text, name, type) {
  const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function emailSheet() {
  sheet(`<h2>Geri bildirim e-postası</h2><p>Okurlar “Yazara yaz” deyince bu adrese yazar. Adres şifreli kısımda durur.</p>
    <label class="field"><span>E-posta</span><input id="em" type="email" value="${esc(S.lib.meta.email || '')}" autocomplete="email"></label>
    <div class="acts"><button class="btn" data-a="ok">Kaydet</button></div>`, el => {
    $('[data-a="ok"]', el).onclick = async () => { S.lib.meta.email = $('#em', el).value.trim(); await saveDraft(); closeSheet(); route(); toast('Kaydedildi. Arkadaşlarına gitmesi için yayınla.'); };
  });
}

/* ================= GitHub ================= */
function guessRepo() {
  const h = location.hostname;
  if (h.endsWith('.github.io')) { const owner = h.split('.')[0]; const seg = location.pathname.split('/').filter(Boolean)[0]; return owner + '/' + (seg && !seg.includes('.') ? seg : h); }
  return 'mehmetaliyazz/malyaz';
}
async function gh(author, path, opt = {}) {
  const r = await fetch('https://api.github.com/repos/' + author.repo + path, {
    ...opt, cache: 'no-store',
    headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + author.token, 'X-GitHub-Api-Version': '2022-11-28', ...(opt.body ? { 'Content-Type': 'application/json' } : {}) }
  });
  return r;
}
class PubErr extends Error { constructor(code) { super(String(code)); this.code = code; } }
function pubErrText(e) {
  const c = e && e.code;
  if (c === 'offline') return 'İnternet yok. Değişikliklerin telefonunda duruyor, bağlanınca tekrar “Yayınla”ya bas.';
  if (c === 401) return 'GitHub anahtarı geçersiz ya da süresi dolmuş. Ayarlar’daki GitHub bağlantısından yeni anahtar gir.';
  if (c === 403 || c === 404) return 'Anahtarın bu depoya yazma izni yok. Anahtarı oluştururken depoyu seçip “Contents: Read and write” iznini verdiğinden emin ol.';
  if (c === 409 || c === 422) return 'GitHub dosyayı kabul etmedi. Birkaç saniye sonra tekrar dene.';
  return 'Yayınlanamadı (' + (c || 'bilinmeyen hata') + '). Değişikliklerin telefonunda duruyor.';
}
async function remoteSha(author) {
  let r; try { r = await gh(author, '/contents/data'); } catch (e) { throw new PubErr('offline'); }
  if (r.status === 404) return null;
  if (!r.ok) throw new PubErr(r.status);
  const list = await r.json(); const f = Array.isArray(list) && list.find(x => x.name === 'library.enc');
  return f ? f.sha : null;
}
async function pushEnc(author, text, force) {
  const sha = await remoteSha(author);
  if (sha && author.sha && sha !== author.sha && !force) throw new PubErr('conflict');
  let r;
  try {
    r = await gh(author, '/contents/' + DATA_PATH, { method: 'PUT', body: JSON.stringify({ message: 'İçerik güncellendi', content: b64(te.encode(text)), ...(sha ? { sha } : {}) }) });
  } catch (e) { throw new PubErr('offline'); }
  if (!r.ok) throw new PubErr(r.status);
  const j = await r.json(); author.sha = j.content && j.content.sha; return author.sha;
}
async function publish(force) {
  const text = await seal(S.lib, S.key, S.kinfo);
  await pushEnc(S.author, text, force);
  LS.set('author', S.author);
  LS.set('enc', text); LS.set('ver', header(text).ver);
  S.pub = clone(S.lib); S.draft = false; LS.del('draft');
}
function diffList() {
  const out = [];
  for (const b of S.lib.books) {
    const pb = S.pub.books.find(x => x.id === b.id) || { items: [] };
    for (const it of b.items) { const o = pb.items.find(x => x.id === it.id); if (!o) out.push(['Yeni', it.title, b.title]); else if (['title', 'note', 'text', 'date'].some(k => (o[k] || '') !== (it[k] || ''))) out.push(['Düzenlendi', it.title, b.title]); }
    for (const o of pb.items) if (!b.items.find(x => x.id === o.id)) out.push(['Silindi', o.title, b.title]);
    const ids = b.items.map(x => x.id).filter(id => pb.items.some(o => o.id === id)); const pids = pb.items.map(x => x.id).filter(id => ids.includes(id));
    if (ids.join() !== pids.join()) out.push(['Sıra değişti', b.title, '']);
  }
  if ((S.lib.meta.email || '') !== (S.pub.meta.email || '')) out.push(['Değişti', 'Geri bildirim e-postası', '']);
  return out;
}
function publishSheet() {
  if (!S.draft) { toast('Yayınlanmamış değişiklik yok.'); return; }
  const d = diffList();
  sheet(`<h2>Yayınla</h2><p>Bunlar arkadaşlarının telefonuna gidecek:</p>
    <ul class="diff">${d.length ? d.map(([k, t, b]) => `<li><small>${esc(k)}</small><br><b>${esc(t)}</b>${b ? ` <small>${esc(b)}</small>` : ''}</li>`).join('') : '<li>Küçük değişiklikler</li>'}</ul>
    <p class="err" id="perr" hidden></p>
    <div class="acts"><button class="btn" data-a="go">Yayınla</button></div>
    <button class="btn ghost small" data-a="undo" style="width:100%;margin-top:10px;border:0;color:var(--muted)">Değişiklikleri geri al</button>`, el => {
    const go_ = $('[data-a="go"]', el), perr = $('#perr', el);
    const run = async (force) => {
      go_.disabled = true; go_.textContent = 'Yayınlanıyor…'; perr.hidden = true;
      try { await publish(force); closeSheet(); route(); toast('Yayınlandı. Arkadaşlarında uygulamayı açınca görünür.'); }
      catch (e) {
        go_.disabled = false; go_.textContent = 'Yayınla';
        if (e.code === 'conflict') {
          if (await ask('Yayındaki içerik başka bir yerden değişmiş', 'Başka bir cihazdan yayınlamış olabilirsin. Yine de yayınlarsan oradaki değişiklikler bu telefondakilerle değişir.', 'Yine de yayınla', true)) return run(true);
          return;
        }
        perr.textContent = pubErrText(e); perr.hidden = false;
      }
    };
    go_.onclick = () => run(false);
    $('[data-a="undo"]', el).onclick = async () => {
      if (await ask('Değişiklikler geri alınsın mı?', 'Yayınlanmamış tüm eklemeler, düzeltmeler ve silmeler kaybolur.', 'Geri al', true)) {
        LS.del('draft'); LS.del('edit'); S.draft = false; S.lib = clone(S.pub); closeSheet(); route(); toast('Değişiklikler geri alındı.');
      }
    };
  });
}
function pubbar() {
  const bar = $('#pubbar');
  const r = S.route && S.route[0];
  const show = S.author && S.draft && !['o', 'yaz'].includes(r);
  bar.hidden = !show; if (!show) return;
  const n = diffList().length;
  bar.innerHTML = `<p>${n ? `${n} değişiklik yayınlanmadı` : 'Yayınlanmamış değişiklik var'}</p><button class="btn small">Yayınla</button>`;
  $('button', bar).onclick = publishSheet;
}
function tokenHelp() {
  return `<details style="margin:-4px 0 16px;font-size:14px;line-height:1.5;color:var(--muted)"><summary style="color:var(--ink);font-weight:600">Anahtarı nasıl alırım?</summary>
    <ol style="padding-left:20px;margin:8px 0 0">
    <li>github.com’da sağ üstte profil resmi, sonra Settings.</li>
    <li>En altta Developer settings, sonra Personal access tokens, sonra Fine-grained tokens, sonra Generate new token.</li>
    <li>Ad: Malyaz. Süre: 1 yıl. Repository access: Only select repositories, depo olarak malyaz.</li>
    <li>Permissions bölümünde Contents: Read and write.</li>
    <li>Generate token deyip çıkan uzun yazıyı kopyala ve buraya yapıştır.</li></ol></details>`;
}
function authorSheet(edit) {
  const A = S.author || {};
  sheet(`<h2>${edit ? 'GitHub bağlantısı' : 'Yazar girişi'}</h2>
    <p>Yazar modu, GitHub anahtarınla açılır. Anahtar sadece bu telefonda saklanır ve hiçbir yere gönderilmez, yalnızca GitHub’a.</p>
    <label class="field"><span>GitHub anahtarı</span><input id="tk" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…" value="${esc(A.token || '')}"></label>
    ${tokenHelp()}
    <label class="field"><span>Depo</span><input id="rp" type="text" autocapitalize="off" spellcheck="false" value="${esc(A.repo || guessRepo())}"><small>kullanıcı-adı/depo-adı biçiminde</small></label>
    <p class="err" id="aerr" hidden></p>
    <div class="acts"><button class="btn" data-a="ok">Bağlan</button></div>`, el => {
    $('[data-a="ok"]', el).onclick = async e => {
      const btn = e.currentTarget, err = $('#aerr', el);
      const a = { token: $('#tk', el).value.trim(), repo: $('#rp', el).value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''), sha: null };
      if (!a.token || !/^[\w.-]+\/[\w.-]+$/.test(a.repo)) { err.textContent = 'Anahtarı ve depoyu “kullanıcı/depo” biçiminde gir.'; err.hidden = false; return; }
      btn.disabled = true; btn.textContent = 'Denetleniyor…'; err.hidden = true;
      try {
        const r = await gh(a, ''); if (!r.ok) throw new PubErr(r.status);
        a.sha = await remoteSha(a);
        S.author = a; LS.set('author', a); closeSheet(); await loadDraft(); route(); toast('Yazar modu açıldı.');
      } catch (x) { btn.disabled = false; btn.textContent = 'Bağlan'; err.textContent = x.code ? pubErrText(x) : 'Bağlanılamadı.'; err.hidden = false; }
    };
  });
}
function strongEnough(pw) { return pw.length >= 10; }
function passwordSheet() {
  sheet(`<h2>Okuyucu parolasını değiştir</h2>
    <p>Yeni parolayla şifreleyip hemen yayınlar. Arkadaşların bir sonraki açılışta yeni parolayı girer. Eski parolayı bilen yeni yazıları okuyamaz.</p>
    <label class="field"><span>Yeni parola</span><input id="p1" type="password" autocomplete="new-password"><small>En az 10 karakter. 4-5 kelimelik bir cümle hem akılda kalır hem tahmin edilemez.</small></label>
    <label class="field"><span>Yeni parola tekrar</span><input id="p2" type="password" autocomplete="new-password"></label>
    <p class="err" id="perr" hidden></p>
    <div class="acts"><button class="btn" data-a="ok">Değiştir ve yayınla</button></div>`, el => {
    $('[data-a="ok"]', el).onclick = async e => {
      const btn = e.currentTarget, err = $('#perr', el); const p1 = $('#p1', el).value, p2 = $('#p2', el).value;
      const fail = t => { err.textContent = t; err.hidden = false; btn.disabled = false; btn.textContent = 'Değiştir ve yayınla'; };
      if (!strongEnough(p1)) return fail('Parola en az 10 karakter olmalı.');
      if (p1 !== p2) return fail('İki parola aynı değil.');
      btn.disabled = true; btn.textContent = 'Şifreleniyor…';
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      const key = await deriveKey(p1, salt, ITER); const kinfo = { salt, iter: ITER, k: await exportKey(key) };
      try {
        const text = await seal(S.lib, key, kinfo); await pushEnc(S.author, text, true);
        S.key = key; S.kinfo = kinfo; LS.set('key', kinfo); LS.set('author', S.author); LS.set('enc', text); LS.set('ver', header(text).ver);
        S.pub = clone(S.lib); S.draft = false; LS.del('draft'); closeSheet(); route(); toast('Parola değişti ve yayınlandı.');
      } catch (x) { fail(pubErrText(x)); }
    };
  });
}

/* ================= ilk kurulum ================= */
function showSetup() {
  tabs(false);
  $('#app').innerHTML = `<div class="setup screen"><h1>Malyaz kurulumu</h1>
    <p>Henüz yayınlanmış içerik yok. Bu adımı sadece yazar bir kez yapar: içerik şifrelenir ve GitHub’a yüklenir.</p>
    <label class="field"><span>İçerik dosyası</span><input id="file" type="file" accept=".json,application/json"><small>Sana gönderilen malyaz-icerik.json dosyası. Seçmezsen kitaplar boş başlar.</small></label>
    <label class="field"><span>Okuyucu parolası</span><input id="p1" type="password" autocomplete="new-password"><small>Arkadaşlarına vereceğin parola. En az 10 karakter, 4-5 kelimelik bir cümle önerilir.</small></label>
    <label class="field"><span>Parola tekrar</span><input id="p2" type="password" autocomplete="new-password"></label>
    <label class="field"><span>GitHub anahtarı</span><input id="tk" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…"></label>
    ${tokenHelp()}
    <label class="field"><span>Depo</span><input id="rp" type="text" autocapitalize="off" spellcheck="false" value="${esc(guessRepo())}"></label>
    <p class="err" id="serr" hidden></p>
    <button class="btn" id="go" style="width:100%">Şifrele ve yayınla</button>
    <button class="btn ghost" id="dl" style="width:100%;margin-top:10px" hidden>Şifreli dosyayı indir</button></div>`;
  let lastText = null;
  const err = $('#serr'), btn = $('#go');
  const fail = t => { err.textContent = t; err.hidden = false; btn.disabled = false; btn.textContent = 'Şifrele ve yayınla'; };
  btn.onclick = async () => {
    err.hidden = true;
    const p1 = $('#p1').value, p2 = $('#p2').value;
    if (!strongEnough(p1)) return fail('Parola en az 10 karakter olmalı.');
    if (p1 !== p2) return fail('İki parola aynı değil.');
    let lib = emptyLib();
    const f = $('#file').files[0];
    if (f) { try { lib = JSON.parse(await f.text()); if (!Array.isArray(lib.books)) throw 0; } catch (e) { return fail('Seçilen dosya bir Malyaz içerik dosyası değil.'); } }
    const a = { token: $('#tk').value.trim(), repo: $('#rp').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''), sha: null };
    btn.disabled = true; btn.textContent = 'Şifreleniyor…';
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const key = await deriveKey(p1, salt, ITER); const kinfo = { salt, iter: ITER, k: await exportKey(key) };
    lastText = await seal(lib, key, kinfo); $('#dl').hidden = false;
    if (!a.token) return fail('GitHub anahtarını gir. Ya da şifreli dosyayı indirip depoya “data” klasörüne elle yükle.');
    btn.textContent = 'Yayınlanıyor…';
    try {
      await pushEnc(a, lastText, true);
      S.author = a; LS.set('author', a); S.key = key; S.kinfo = kinfo; LS.set('key', kinfo); LS.set('enc', lastText); LS.set('ver', header(lastText).ver);
      S.pub = lib; await loadDraft(); start(); toast('Kuruldu ve yayınlandı.');
    } catch (e) { fail(pubErrText(e)); }
  };
  $('#dl').onclick = () => lastText && download(lastText, 'library.enc', 'application/octet-stream');
}

/* ================= yazı masası ================= */
function renderDesk(bid, iid) {
  const b = book(bid); const isNew = iid === 'yeni'; const it = isNew ? { title: '', note: '', date: '', text: '' } : findItem(bid, iid);
  if (!it) return go('/k/' + bid, true);
  document.documentElement.style.setProperty('--acc', accOf(bid));
  const saved = LS.get('edit', null);
  const restore = saved && saved.b === bid && saved.i === iid && ['title', 'note', 'date', 'text'].some(k => (saved[k] || '') !== (it[k] || ''));
  const v = restore ? saved : it;
  const poem = b.kind === 'poem';
  $('#app').innerHTML = `<header class="bar scrolled"><button class="ib txt" data-a="cancel" style="color:var(--muted)">Vazgeç</button>
      <div class="ttl on">${isNew ? `Yeni ${unit(b)}` : 'Düzenle'}</div>
      <button class="ib txt" data-a="prev">Önizle</button><button class="ib txt" data-a="save">Kaydet</button></header>
    <div class="desk screen">
      ${restore ? `<div class="restored">Yarım kalan yazın geri getirildi. <button class="btn small ghost" data-a="discard">Taslağı at</button></div>` : ''}
      <input class="title-in" id="t" placeholder="Başlık" value="${esc(v.title)}" autocapitalize="sentences">
      <input class="note-in" id="n" placeholder="${poem ? 'İthaf ya da alt yazı (isteğe bağlı)' : 'Alt başlık (isteğe bağlı)'}" value="${esc(v.note || '')}">
      <div class="row2"><label class="field"><span>Tarih (isteğe bağlı)</span><input id="d" value="${esc(v.date || '')}" placeholder="Örneğin 11.2026"></label>
      ${isNew ? `<label class="field"><span>Kitaptaki yeri</span><select id="pos"><option value="end">Sona ekle</option><option value="start">Başa ekle</option></select></label>` : ''}</div>
      <textarea class="body-in" id="x" placeholder="${poem ? 'Dizelerini yaz…' : 'Yazmaya başla…'}" spellcheck="true" lang="tr">${esc(v.text)}</textarea>
      <div id="pv" class="reader" hidden></div>
      <p class="hint">${poem ? 'Her dize ayrı satıra. Kıtalar arasına bir boş satır bırak. Bölüm numarası için satıra sadece sayı yaz (1, 2, 3).' : 'Paragraflar arasına bir boş satır bırak. Word’den kopyalayıp yapıştırabilirsin.'}</p>
    </div>`;
  const x = $('#x');
  const grow = () => { x.style.height = 'auto'; x.style.height = Math.max(x.scrollHeight, innerHeight * .55) + 'px'; };
  const cur = () => ({ b: bid, i: iid, title: $('#t').value.trim(), note: $('#n').value.trim(), date: $('#d').value.trim(), text: x.value.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/^\n+|\s+$/g, '') });
  let at = 0;
  const autosave = () => { clearTimeout(at); at = setTimeout(() => LS.set('edit', { ...cur(), text: x.value, t: Date.now() }), 400); };
  ['#t', '#n', '#d'].forEach(s => $(s).oninput = autosave);
  x.oninput = () => { grow(); autosave(); };
  requestAnimationFrame(grow);
  if (isNew) setTimeout(() => $('#t').focus(), 250);
  const dirty = () => { const c = cur(); return ['title', 'note', 'date', 'text'].some(k => (c[k] || '') !== (it[k] || '').trim()); };
  $('[data-a="cancel"]').onclick = async () => {
    if (dirty() && !(await ask('Değişiklikler kaydedilmesin mi?', 'Yazdıkların silinir.', 'Kaydetme', true))) return;
    LS.del('edit'); back(isNew ? '/k/' + bid : `/o/${bid}/${iid}`);
  };
  const d = $('[data-a="discard"]'); if (d) d.onclick = () => { LS.del('edit'); renderDesk(bid, iid); };
  $('[data-a="prev"]').onclick = e => {
    const pv = $('#pv'), on = pv.hidden; const c = cur();
    if (on) pv.innerHTML = `<h1>${esc(c.title || 'Başlıksız')}</h1>${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}<div class="rule"></div>${bodyHTML(c, b.kind)}${c.date ? `<p class="date">${esc(c.date)}</p>` : ''}`;
    pv.hidden = !on; x.hidden = on; $('#t').hidden = on; $('#n').hidden = on; $('.row2').hidden = on; $('.hint').hidden = on;
    e.currentTarget.textContent = on ? 'Yaz' : 'Önizle'; scrollTo(0, 0);
  };
  $('[data-a="save"]').onclick = async () => {
    const c = cur();
    if (!c.title) { toast('Bir başlık yaz.'); $('#t').focus(); return; }
    if (!c.text) { toast('Metin boş.'); x.focus(); return; }
    let id = iid;
    if (isNew) {
      id = uid(poem ? 's-' : 'm-');
      const obj = { id, title: c.title, note: c.note, date: c.date, text: c.text };
      if ($('#pos').value === 'start') b.items.unshift(obj); else b.items.push(obj);
    } else Object.assign(it, { title: c.title, note: c.note, date: c.date, text: c.text });
    await saveDraft(); LS.del('edit');
    go(`/o/${bid}/${id}`, true);
    toast('Kaydedildi. Arkadaşlarının görmesi için Yayınla’ya bas.');
  };
}

/* ================= ortak arayüz ================= */
let sheetEl = null;
function sheet(html, onMount) {
  closeSheet(true);
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const el = document.createElement('div'); el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = '<div class="grab"></div>' + html;
  scrim.onclick = () => closeSheet();
  document.body.append(scrim, el); sheetEl = { scrim, el };
  hideSel(); $('#toast').hidden = true;
  if (onMount) onMount(el);
  return el;
}
function closeSheet() { if (!sheetEl) return; sheetEl.scrim.remove(); sheetEl.el.remove(); sheetEl = null; }
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
function ask(title, body, ok, danger) {
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; closeSheet(); res(v); };
    const el = sheet(`<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="acts"><button class="btn ghost" data-a="no">Vazgeç</button><button class="btn ${danger ? 'danger' : ''}" data-a="yes">${esc(ok)}</button></div>`);
    $('[data-a="no"]', el).onclick = () => fin(false); $('[data-a="yes"]', el).onclick = () => fin(true);
    sheetEl.scrim.onclick = () => fin(false);
  });
}
let toastT = 0;
function toast(msg, action) {
  const t = $('#toast'); clearTimeout(toastT);
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) $('button', t).onclick = () => { t.hidden = true; action.fn(); };
  t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  toastT = setTimeout(() => t.hidden = true, action ? 10000 : 3200);
}

/* ================= çevrimdışı ================= */
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const ask_ = w => toast('Uygulamanın yeni sürümü hazır.', { label: 'Yenile', fn: () => w.postMessage('skip') });
    if (reg.waiting && navigator.serviceWorker.controller) ask_(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask_(w); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => { }); });
  }).catch(() => { });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; location.reload(); });
}

boot().catch(e => { console.error(e); $('#app').innerHTML = '<div class="setup"><h1>Malyaz</h1><p>Uygulama açılamadı. Sayfayı yenile.</p></div>'; });
