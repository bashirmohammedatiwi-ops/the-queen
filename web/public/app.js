/* The Queen — storefront (vanilla JS, RTL, mobile-first, live) */
(() => {
  'use strict';

  // ================= utilities =================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };
  const sstore = { get(k, d) { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDesk = () => window.matchMedia('(min-width: 1024px)').matches;
  const behavior = () => (reduceMotion ? 'auto' : 'smooth');
  const toLatin = (s) => String(s ?? '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c));
  const normPhone = (p) => {
    let d = toLatin(p).replace(/\D/g, '');
    if (d.startsWith('00964')) d = d.slice(2);
    if (d.startsWith('964')) d = '0' + d.slice(3);
    if (d.length === 10 && d.startsWith('7')) d = '0' + d;
    return d;
  };
  const phoneOk = (p) => /^07\d{9}$/.test(normPhone(p));
  const waNumber = (p) => {
    let d = toLatin(p).replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '964' + d.slice(1);
    else if (d.length === 10 && d.startsWith('7')) d = '964' + d;
    return d;
  };
  const mediaUrl = (x) => { if (!x) return ''; x = String(x); if (/^(https?:)?\/\//i.test(x) || x.startsWith('/') || x.startsWith('data:image/')) return x; return '/media/' + x; };
  const safeHref = (u) => { u = String(u || '').trim(); if (!u) return ''; if (/^(https?:|mailto:|tel:)/i.test(u) || (u.startsWith('/') && !u.startsWith('//'))) return u; if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return 'https://' + u; return ''; };
  const social = (kind, v) => {
    v = String(v || '').trim(); if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    if (/^(www\.)?(instagram|facebook|fb|tiktok)\.com/i.test(v)) return 'https://' + v;
    const h = v.replace(/^@/, '');
    return { instagram: `https://instagram.com/${enc(h)}`, facebook: `https://facebook.com/${enc(h)}`, tiktok: `https://www.tiktok.com/@${enc(h)}` }[kind];
  };
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('ar-IQ-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return iso; } };
  const fmtDay = (iso) => { try { return new Date(iso).toLocaleString('ar-IQ-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return iso; } };
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (!isFinite(s)) return '';
    if (s < 90) return 'الآن';
    if (s < 3600) return `قبل ${Math.round(s / 60)} دقيقة`;
    if (s < 86400) return `قبل ${Math.round(s / 3600)} ساعة`;
    if (s < 86400 * 7) return `قبل ${Math.round(s / 86400)} يوم`;
    return fmtDay(iso);
  };
  const vibrate = (ms = 12) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* */ } };

  // ================= state =================
  const S = { store: null, cats: [], brands: [], currency: 'د.ع' };
  const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('en-US')} ${S.currency}`;
  const moneyHtml = (n) => `<span class="num">${esc(Math.round(Number(n) || 0).toLocaleString('en-US'))}</span>&nbsp;<small>${esc(S.currency)}</small>`;
  const catById = (id) => S.cats.find((c) => String(c.id) === String(id));
  const catFind = (v) => S.cats.find((c) => String(c.id) === String(v) || c.slug === v);
  const mains = () => S.cats.filter((c) => !c.parent_id);
  const subsOf = (id) => S.cats.filter((c) => c.parent_id && String(c.parent_id) === String(id));
  const brandById = (id) => S.brands.find((b) => String(b.id) === String(id));
  const brandFind = (v) => S.brands.find((b) => String(b.id) === String(v) || b.slug === v);
  const catHref = (c) => `/c/${enc(c.slug)}`;
  const brandHref = (b) => `/brand/${enc(b.slug)}`;
  const prodHref = (p) => `/p/${enc(p.slug)}`;
  const discount = (p) => (p.compare_price && p.compare_price > p.price ? Math.round((1 - p.price / p.compare_price) * 100) : 0);

  async function api(url, opts = {}) {
    let r;
    try {
      r = await fetch(url, { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch {
      throw Object.assign(new Error('تعذر الاتصال، تحققي من الإنترنت وحاولي مجدداً'), { status: 0 });
    }
    let data = {};
    try { data = await r.json(); } catch { /* */ }
    if (!r.ok) throw Object.assign(new Error(data.error || 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً'), { status: r.status });
    return data;
  }

  // ================= icons =================
  const P = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    bag: '<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
    menu: '<path d="M4 7h16M4 12h11M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    arrow: '<path d="M19 12H5m5-5-5 5 5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5H5v11h3"/>',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.2a10 10 0 0 0 5.8 5.8L16 13l4 1.5v3A2 2 0 0 1 18 19.5 15 15 0 0 1 4.5 6 2 2 0 0 1 6.5 4z"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 6.5 8 6 8-6"/>',
    truck: '<path d="M3 6.5h11v10H3zM14 10h3.5l3 3v3.5H14"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/>',
    seal: '<path d="M12 3.2 14 5l2.7-.3.8 2.6 2.4 1.3-.8 2.6.8 2.6-2.4 1.3-.8 2.6L14 17.4 12 19.2 10 17.4l-2.7.3-.8-2.6-2.4-1.3.8-2.6-.8-2.6 2.4-1.3.8-2.6L10 5z"/><path d="m9 11.3 2 2 4-4"/>',
    cash: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
    swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
    crown: '<path d="M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z"/><path d="M4.5 20.5h15"/>',
    filter: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    sort: '<path d="M7 5v14m0 0-3-3m3 3 3-3M17 19V5m0 0-3 3m3-3 3 3"/>',
    box: '<path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9z"/><path d="M4 7.5 12 11.5l8-4M12 11.5v9"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/>',
    xcircle: '<circle cx="12" cy="12" r="8"/><path d="m9.5 9.5 5 5m0-5-5 5"/>',
    home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
    receipt: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6M9 15.5h3"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    sparkle: '<path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z"/>',
    share: '<path d="M12 4v11M8 8l4-4 4 4"/><path d="M6 12v6.5h12V12"/>',
    tag: '<path d="M4 12.5V5a1 1 0 0 1 1-1h7.5L20 11.5 12.5 19z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3.5 9h17M12 9v11M12 9S10.5 4.5 8 5s-1 4 4 4c5 0 6.5-3.5 4-4s-4 4-4 4"/>',
    download: '<path d="M12 4v11m-4-4 4 4 4-4"/><path d="M5 19.5h14"/>',
    zoom: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5"/>',
    refresh: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4.5V8h-3.5"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5"/>',
  };
  const BRAND = {
    whatsapp: '<path fill="currentColor" stroke="none" d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.2 21.8l4.9-1.3A9.8 9.8 0 1 0 12 2.2zm0 17.9a8.1 8.1 0 0 1-4.2-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8.1 8.1 0 1 1 12 20.1zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.3z"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>',
    facebook: '<path d="M14.5 8.5h2.5V5h-2.5A3.5 3.5 0 0 0 11 8.5V11H8.5v3.5H11V21h3.5v-6.5H17l.5-3.5h-3V9a.5.5 0 0 1 .5-.5z"/>',
    tiktok: '<path d="M14 3.5v11.8a3.3 3.3 0 1 1-3.3-3.3"/><path d="M14 3.5c.4 2.6 2 4.2 4.8 4.5"/>',
  };
  const icon = (n, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || BRAND[n] || ''}</svg>`;

  // ================= media helpers =================
  const ph = (name, small) => `<div class="ph" aria-hidden="true"><span class="q">Q</span>${small ? '' : `<span class="n">${esc(name)}</span>`}</div>`;
  const imgTag = (file, alt, cls = '', eager = false) => (file ? `<img src="${esc(mediaUrl(file))}" alt="${esc(alt)}" ${cls ? `class="${cls}"` : ''} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` : '');
  const cm = (images, name, { small = false, hover = false, eager = false, href = '', cls = '' } = {}) => {
    const imgs = (images || []).filter(Boolean);
    const tag = href ? 'a' : 'div';
    return `<${tag} class="cm ${cls}" ${href ? `href="${esc(href)}" aria-label="${esc(name)}"` : ''}>${ph(name, small)}${imgTag(imgs[0], href ? '' : name, '', eager)}${hover && imgs[1] ? imgTag(imgs[1], '', 'alt') : ''}</${tag}>`;
  };
  const markImgs = (root = document) => $$('img', root).forEach((i) => { if (i.complete && i.naturalWidth) i.classList.add('ld'); });
  document.addEventListener('load', (e) => { const t = e.target; if (t && t.tagName === 'IMG') t.classList.add('ld'); }, true);
  document.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && !t.closest('.brand')) t.remove(); }, true);

  // ================= cart & favourites =================
  const listeners = new Set();
  const changed = () => listeners.forEach((f) => { try { f(); } catch { /* */ } });
  const Cart = {
    items: [],
    load() { const v = store.get('tq_cart', []); this.items = Array.isArray(v) ? v.filter((i) => i && i.id && i.qty > 0) : []; },
    save() { store.set('tq_cart', this.items); renderBadges(); patchAdds(); changed(); },
    count() { return this.items.reduce((a, i) => a + i.qty, 0); },
    subtotal() { return this.items.reduce((a, i) => a + i.qty * i.price, 0); },
    find(id) { return this.items.find((i) => i.id === id); },
    qty(id) { const i = this.find(id); return i ? i.qty : 0; },
    cap(i) { return i && i.max != null ? Math.max(1, Math.min(99, i.max)) : 10; },
    add(p, qty = 1) {
      let it = this.find(p.id);
      if (!it) { it = { id: p.id, qty: 0 }; this.items.push(it); }
      Object.assign(it, { name: p.name, price: p.price, image: (p.images || [])[0] || it.image || null, slug: p.slug, max: p.max ?? (p.low_stock ? 3 : it.max) });
      const before = it.qty;
      it.qty = Math.min(this.cap(it), it.qty + qty);
      this.save();
      return it.qty - before;
    },
    set(id, qty) { const it = this.find(id); if (!it) return; it.qty = Math.max(1, Math.min(this.cap(it), qty)); this.save(); },
    remove(id) { const i = this.items.findIndex((x) => x.id === id); if (i < 0) return null; const [it] = this.items.splice(i, 1); this.save(); return { it, i }; },
    restore({ it, i }) { this.items.splice(Math.min(i, this.items.length), 0, it); this.save(); },
    clear() { this.items = []; this.save(); },
  };
  const Fav = {
    ids: [],
    load() { const v = store.get('tq_fav', []); this.ids = Array.isArray(v) ? v.filter(Number.isFinite).slice(0, 200) : []; },
    has(id) { return this.ids.includes(id); },
    toggle(id) { if (this.has(id)) this.ids = this.ids.filter((x) => x !== id); else this.ids.unshift(id); store.set('tq_fav', this.ids); renderBadges(); return this.has(id); },
  };
  const Recent = {
    get() { const v = store.get('tq_recent', []); return Array.isArray(v) ? v : []; },
    push(id) { store.set('tq_recent', [id, ...this.get().filter((x) => x !== id)].slice(0, 16)); },
  };
  window.addEventListener('storage', (e) => {
    if (e.key === 'tq_cart') { Cart.load(); renderBadges(); patchAdds(); changed(); }
    if (e.key === 'tq_fav') { Fav.load(); renderBadges(); }
  });

  async function syncCart({ quiet = false } = {}) {
    if (!Cart.items.length) return [];
    const r = await api('/api/cart/check', { method: 'POST', body: { items: Cart.items.map((i) => ({ id: i.id, qty: i.qty })) } });
    const map = new Map((r.items || []).map((p) => [p.id, p]));
    const notes = [], next = [];
    for (const it of Cart.items) {
      const p = map.get(it.id);
      if (!p) { notes.push(`«${it.name}» لم يعد متوفراً في المتجر وتمت إزالته من السلة`); continue; }
      if (!p.in_stock || p.max <= 0) { notes.push(`«${p.name}» نفد من المخزون وتمت إزالته من السلة`); continue; }
      let qty = it.qty;
      if (qty > p.max) { qty = p.max; notes.push(`تم تعديل كمية «${p.name}» إلى ${p.max} حسب المتوفر`); }
      if (it.price != null && Number(it.price) !== Number(p.price)) notes.push(`تم تحديث سعر «${p.name}» إلى ${money(p.price)}`);
      next.push({ id: p.id, qty, name: p.name, price: p.price, image: p.images[0] || null, slug: p.slug, max: p.max });
      known.set(p.id, p);
    }
    const before = JSON.stringify(Cart.items);
    Cart.items = next;
    if (JSON.stringify(next) !== before || !quiet) Cart.save();
    return notes;
  }

  const dlv = () => S.store.delivery || {};
  function deliveryFor(gov, subtotal) {
    const d = dlv();
    if (Number(d.free_over) > 0 && subtotal >= Number(d.free_over)) return 0;
    if (!gov) return null;
    if (d.fees && d.fees[gov] != null && d.fees[gov] !== '') return Number(d.fees[gov]) || 0;
    return gov === 'بغداد' ? Number(d.baghdad) || 0 : Number(d.other) || 0;
  }
  const govFee = (g) => { const d = dlv(); if (d.fees && d.fees[g] != null && d.fees[g] !== '') return Number(d.fees[g]) || 0; return g === 'بغداد' ? Number(d.baghdad) || 0 : Number(d.other) || 0; };
  const freeOver = () => Number(dlv().free_over) || 0;
  const minOrder = () => Number(dlv().min_order) || 0;
  const freeBar = (sub) => {
    const f = freeOver(); if (!f) return '';
    if (sub >= f) return `<div class="free done">${icon('gift')} رائع! طلبكِ مؤهل للتوصيل المجاني</div>`;
    const pct = Math.max(4, Math.min(100, (sub / f) * 100));
    return `<div class="free">أضيفي <b>${moneyHtml(f - sub)}</b> واحصلي على توصيل مجاني<div class="track"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
  };

  // ================= toasts =================
  function toast(msg, { type = 'ok', link, linkText, action, actionText, img, ms = 3200 } = {}) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `${img ? `<span class="th">${imgTag(img, '')}</span>` : icon(type === 'err' ? 'info' : 'check')}<span>${esc(msg)}</span>${link ? `<a href="${esc(link)}">${esc(linkText || 'عرض')}</a>` : ''}${action ? `<button type="button">${esc(actionText || 'تراجع')}</button>` : ''}`;
    if (action) el.querySelector('button').addEventListener('click', () => { action(); el.remove(); });
    if (link) el.querySelector('a').addEventListener('click', () => el.remove());
    box.appendChild(el);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 280); }, ms);
  }

  // ================= layers (menu, search, sheet, lightbox) — back button closes them =================
  const Layer = {
    cur: null, onClose: null, lastFocus: null,
    open(name, { onClose } = {}) {
      if (this.cur) this.hide(true);
      const el = this.el(name); if (!el) return;
      this.lastFocus = document.activeElement;
      this.cur = name; this.onClose = onClose || null;
      el.classList.add('on'); el.removeAttribute('aria-hidden');
      if (name !== 'search' && name !== 'lb') $('.scrim').classList.add('on');
      document.documentElement.classList.add('lock');
      if (!(history.state && history.state.layer)) history.pushState({ ...(history.state || {}), layer: name }, '');
      else history.replaceState({ ...history.state, layer: name }, '');
    },
    el(name) { return name === 'sheet' ? $('#sheet') : $(`[data-layer="${name}"]`); },
    hide(silent) {
      if (!this.cur) return;
      const el = this.el(this.cur);
      el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); el.style.transform = '';
      const cb = this.onClose; this.cur = null; this.onClose = null;
      $('.scrim').classList.remove('on');
      document.documentElement.classList.remove('lock');
      if (cb) try { cb(); } catch { /* */ }
      if (!silent && this.lastFocus && this.lastFocus.focus) this.lastFocus.focus({ preventScroll: true });
    },
    close() { if (!this.cur) return; if (history.state && history.state.layer) history.back(); else this.hide(); },
  };

  // generic bottom sheet
  function sheet({ title, body, foot = '', cls = '', onClose }) {
    const el = $('#sheet');
    el.className = 'sheet ' + cls;
    el.innerHTML = `<div class="grab" aria-hidden="true"></div><div class="sh-h"><h2>${title}</h2><button class="ib" data-close aria-label="إغلاق">${icon('close')}</button></div>
      <div class="sh-b">${body}</div>${foot ? `<div class="sh-f">${foot}</div>` : ''}`;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', String(title).replace(/<[^>]+>/g, ''));
    requestAnimationFrame(() => Layer.open('sheet', { onClose }));
    setTimeout(() => { const f = el.querySelector('[autofocus]'); if (f) f.focus(); }, 380);
    return el;
  }
  // drag down to dismiss (sheet + drawers on touch)
  function wireDrag() {
    const el = $('#sheet');
    let y0 = null, dy = 0, t0 = 0;
    const start = (e) => {
      if (isDesk()) return;
      const body = el.querySelector('.sh-b');
      const onHandle = e.target.closest('.grab, .sh-h');
      if (!onHandle && !(body && body.contains(e.target) && body.scrollTop <= 0)) return;
      y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); el.classList.add('drag');
    };
    const move = (e) => {
      if (y0 == null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 4) { el.style.transform = `translateY(${dy}px)`; if (e.cancelable) e.preventDefault(); }
    };
    const end = () => {
      if (y0 == null) return;
      el.classList.remove('drag');
      const fast = dy > 40 && Date.now() - t0 < 250;
      if (dy > 120 || fast) Layer.close(); else el.style.transform = '';
      y0 = null;
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  // ================= shell =================
  function brandHtml() {
    const st = S.store.store;
    if (st.logo) return `<img class="brand-logo" src="${esc(mediaUrl(st.logo))}" alt="${esc(st.name)}">`;
    return `<span class="brand-word">${esc(String(st.name || 'The Queen').toUpperCase())}</span>${st.name_ar ? `<span class="brand-sub">${esc(st.name_ar)}</span>` : ''}`;
  }
  const TABS = [
    ['/', 'الرئيسية', 'home', /^\/$/],
    ['/categories', 'الأقسام', 'grid', /^\/(categories|c\/|shop|brand\/|brands)/],
    ['/cart', 'السلة', 'bag', /^\/cart/],
    ['/wishlist', 'المفضلة', 'heart', /^\/wishlist/],
    ['/orders', 'طلباتي', 'receipt', /^\/(orders|order\/|track)/],
  ];

  function renderShell() {
    const st = S.store.store;
    renderAnnounce();
    $('#top').innerHTML = `<div class="top-in">
        <div class="top-s">
          <button class="ib menu-ib" data-open="menu" aria-label="القائمة">${icon('menu')}</button>
          <button class="ib back-ib" data-back aria-label="رجوع">${icon('back')}</button>
          <nav class="nav" aria-label="القائمة الرئيسية">
            <a href="/" data-nav="^/$">الرئيسية</a><a href="/shop" data-nav="^/(shop|c/|brand/)">المتجر</a><a href="/categories" data-nav="^/categories">الأقسام</a>
            <a href="/shop?offers=1" data-nav="offers">العروض</a><a href="/orders" data-nav="^/(orders|order/)">طلباتي</a>
          </nav>
        </div>
        <div class="top-c"><a href="/" class="brand" aria-label="${esc(st.name)} — الرئيسية">${brandHtml()}</a><span class="top-title" id="top-title"></span></div>
        <div class="top-e">
          <button class="dsearch" data-open="search" type="button">${icon('search')}<span>ابحثي عن منتج أو براند…</span><kbd>/</kbd></button>
          <button class="ib search-ib" data-open="search" aria-label="بحث">${icon('search')}</button>
          <button class="ib share-ib hide" id="share-ib" aria-label="مشاركة">${icon('share')}</button>
          <a class="ib cart-ib" href="/wishlist" aria-label="المفضلة">${icon('heart')}<span class="badge fav-badge"></span></a>
          <a class="ib cart-ib" href="/cart" aria-label="السلة">${icon('bag')}<span class="badge cart-badge"></span></a>
        </div>
      </div>`;
    $('#tabbar').innerHTML = `<span class="tab-ind" aria-hidden="true"></span>` + TABS.map(([href, label, ic], i) => i === 2
      ? `<a class="tab tab-cart" href="${href}" data-tab="${i}"><span class="bubble">${icon(ic)}<span class="badge cart-badge"></span></span><span>${label}</span></a>`
      : `<a class="tab" href="${href}" data-tab="${i}">${icon(ic)}<span>${label}</span>${i === 3 ? '<span class="badge fav-badge"></span>' : ''}</a>`).join('');

    const wa = waNumber(st.whatsapp);
    $('#layers').innerHTML = `
      <div class="scrim"></div>
      <aside class="drawer" data-layer="menu" aria-hidden="true" aria-label="القائمة" role="dialog">
        <div class="dr-h"><a href="/" class="brand" style="align-items:flex-start">${brandHtml()}</a><button class="ib" data-close aria-label="إغلاق">${icon('close')}</button></div>
        <div class="dr-b"><nav class="mnav">
          <a href="/">${icon('home')} الرئيسية</a>
          <a href="/shop">${icon('bag')} كل المنتجات</a>
          <a href="/categories">${icon('grid')} الأقسام${S.brands.length ? ' والبراندات' : ''}</a>
          <a href="/shop?offers=1">${icon('tag')} العروض والخصومات</a>
          <a href="/shop?new=1">${icon('sparkle')} وصل حديثاً</a>
          <hr>
          <a href="/orders">${icon('receipt')} طلباتي وتتبع الطلب</a>
          <a href="/wishlist">${icon('heart')} المفضلة</a>
          <hr>
          <a href="/about">${icon('crown')} من نحن</a>
          <a href="/policies">${icon('swap')} الدفع والتوصيل والاستبدال</a>
          <a href="/contact">${icon('phone')} تواصلي معنا</a>
          <button type="button" class="install-btn hide" data-install>${icon('download')} تثبيت التطبيق على الهاتف</button>
        </nav></div>
        <div class="dr-f">
          ${wa ? `<a class="soc" href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="واتساب">${icon('whatsapp')}</a>` : ''}
          ${st.phone ? `<a class="soc" href="tel:${esc(normPhone(st.phone) || st.phone)}" aria-label="اتصال">${icon('phone')}</a>` : ''}
          ${['instagram', 'facebook', 'tiktok'].filter((k) => st[k]).map((k) => `<a class="soc" href="${esc(social(k, st[k]))}" target="_blank" rel="noopener" aria-label="${k}">${icon(k)}</a>`).join('')}
        </div>
      </aside>
      <div class="sheet" id="sheet" aria-hidden="true"></div>
      <div class="search" data-layer="search" aria-hidden="true" role="dialog" aria-label="البحث">
        <form class="s-bar" role="search" action="/shop">
          <button type="button" class="ib" data-close aria-label="إغلاق البحث">${icon('back')}</button>
          <label class="s-field">${icon('search')}<span class="sr">ابحثي عن منتج</span><input id="q" name="q" type="search" placeholder="عطر، أحمر شفاه، كريم، براند…" autocomplete="off" enterkeyhint="search"></label>
        </form>
        <div class="s-body" id="s-body"></div>
      </div>
      <div class="lb" data-layer="lb" aria-hidden="true" role="dialog" aria-label="عرض الصور">
        <div class="lb-h"><span id="lb-n" class="num"></span><button class="ib" data-close aria-label="إغلاق">${icon('close')}</button></div>
        <div class="lb-track" id="lb-track"></div>
        <div class="lb-hint">اضغطي مرتين للتكبير · اسحبي للتنقل</div>
      </div>`;
    renderFooter();
    renderBadges();
    setupSearch();
    wireDrag();
    syncInstall();
  }

  function renderAnnounce() {
    const an = $('#annc');
    const parts = String(S.store.announcement || '').trim().split(/\s+[—–|•]\s+|\n+/).map((t) => t.trim()).filter(Boolean);
    if (!parts.length) { an.hidden = true; return; }
    const one = parts.map((t) => `<span>${esc(t)}</span>`).join('');
    an.innerHTML = `<div class="annc-track">${one}${one}</div>`;
    an.classList.toggle('static', reduceMotion);
  }

  function renderFooter() {
    const st = S.store.store, wa = waNumber(st.whatsapp);
    const about = String(S.store.about || '').trim();
    const socials = [['instagram', 'انستغرام'], ['facebook', 'فيسبوك'], ['tiktok', 'تيك توك']].filter(([k]) => st[k])
      .map(([k, l]) => `<a href="${esc(social(k, st[k]))}" target="_blank" rel="noopener" aria-label="${l}">${icon(k)}</a>`).join('')
      + (wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="واتساب">${icon('whatsapp')}</a>` : '');
    $('#footer').innerHTML = `
      <div class="wrap f-top">
        <div class="f-brand">
          <a href="/" class="brand"><span class="brand-word">${esc(String(st.name).toUpperCase())}</span></a>
          ${about ? `<p>${esc(about.length > 170 ? about.slice(0, 170).replace(/\s+\S*$/, '') + '…' : about)}</p>` : ''}
          ${socials ? `<div class="f-soc">${socials}</div>` : ''}
        </div>
        <div class="f-cols">
          <div><h4>تسوّقي</h4><ul><li><a href="/shop">كل المنتجات</a></li>${mains().slice(0, 4).map((c) => `<li><a href="${catHref(c)}">${esc(c.name)}</a></li>`).join('')}<li><a href="/shop?offers=1">العروض</a></li></ul></div>
          <div><h4>المساعدة</h4><ul><li><a href="/orders">تتبع طلباتي</a></li><li><a href="/policies">الدفع والتوصيل</a></li><li><a href="/about">من نحن</a></li><li><a href="/contact">تواصلي معنا</a></li></ul></div>
          <div><h4>تواصلي معنا</h4><ul>
            ${st.phone ? `<li><a href="tel:${esc(normPhone(st.phone) || st.phone)}" class="ltr">${esc(st.phone)}</a></li>` : ''}
            ${wa ? `<li><a href="https://wa.me/${wa}" target="_blank" rel="noopener">واتساب</a></li>` : ''}
            ${st.email ? `<li><a href="mailto:${esc(st.email)}">${esc(st.email)}</a></li>` : ''}
            ${st.address ? `<li>${esc(st.address)}</li>` : ''}
            ${!st.phone && !wa && !st.email && !st.address ? '<li><a href="/contact">صفحة التواصل</a></li>' : ''}
          </ul></div>
        </div>
      </div>
      <div class="wrap f-bot">
        <span>© <span class="num">${new Date().getFullYear()}</span> ${esc(st.name)}${st.name_ar ? ` · ${esc(st.name_ar)}` : ''}</span>
        <span class="cod">${icon('cash')} الدفع عند الاستلام · توصيل لكل المحافظات</span>
      </div>`;
  }

  function renderBadges() {
    const n = Cart.count(), f = Fav.ids.length;
    $$('.cart-badge').forEach((b) => {
      const prev = Number(b.dataset.n || 0);
      b.textContent = n > 99 ? '99+' : n; b.dataset.n = n;
      b.classList.toggle('on', n > 0);
      if (n > prev) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    });
    $$('.fav-badge').forEach((b) => { b.textContent = f > 99 ? '99+' : f; b.classList.toggle('on', f > 0); });
    const tc = $('.tab-cart'); if (tc) tc.setAttribute('aria-label', n ? `السلة (${n})` : 'السلة');
  }

  function setTab(path) {
    const bar = $('#tabbar'); if (!bar) return;
    const i = TABS.findIndex((t) => t[3].test(path));
    $$('.tab', bar).forEach((t) => { const on = Number(t.dataset.tab) === i; t.classList.toggle('on', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    const ind = $('.tab-ind', bar), tab = $(`.tab[data-tab="${i}"]`, bar);
    if (!ind) return;
    if (!tab || i === 2 || i < 0) { ind.style.opacity = '0'; return; }
    requestAnimationFrame(() => { ind.style.opacity = '1'; ind.style.width = (tab.offsetWidth - 8) + 'px'; ind.style.transform = `translateX(${tab.offsetLeft + 4}px)`; });
  }
  window.addEventListener('resize', debounce(() => setTab(curPath()), 120));

  // top bar modes: home | page | float(product)
  function setTop({ mode = 'page', title = '', share = false } = {}) {
    const t = $('#top');
    t.classList.toggle('pg', mode !== 'home');
    t.classList.toggle('float', mode === 'float');
    t.classList.remove('solid', 'away');
    $('#top-title').textContent = title;
    $('#share-ib').classList.toggle('hide', !share);
    $('#annc').hidden = mode !== 'home' || !$('#annc').innerHTML;
  }
  function setChrome({ tab = true, bar = false, pay = false } = {}) {
    document.body.classList.toggle('has-tab', tab);
    document.body.classList.toggle('has-bar', bar);
    document.body.classList.toggle('has-pay', pay);
    $('#tabbar').classList.toggle('off', !tab);
  }

  // ================= search =================
  function setupSearch() {
    const input = $('#q'), body = $('#s-body');
    const recent = () => store.get('tq_searches', []);
    const idle = () => {
      const r = recent();
      body.innerHTML = `${r.length ? `<p class="s-lbl">عمليات بحث سابقة <button type="button" id="s-clr">مسح</button></p><div class="s-chips">${r.map((q) => `<a class="chip" href="/shop?q=${enc(q)}">${icon('clock')} ${esc(q)}</a>`).join('')}</div>` : ''}
        ${mains().length ? `<p class="s-lbl">الأقسام</p><div class="s-chips">${mains().map((c) => `<a class="chip" href="${catHref(c)}">${esc(c.name)}</a>`).join('')}<a class="chip" href="/shop?offers=1">${icon('tag')} العروض</a></div>` : ''}
        ${S.brands.length ? `<p class="s-lbl">البراندات</p><div class="s-chips">${S.brands.slice(0, 16).map((b) => `<a class="chip" href="${brandHref(b)}">${esc(b.name)}</a>`).join('')}</div>` : ''}`;
      const c = $('#s-clr'); if (c) c.addEventListener('click', () => { store.set('tq_searches', []); idle(); });
    };
    const remember = (q) => store.set('tq_searches', [q, ...recent().filter((x) => x !== q)].slice(0, 8));
    const hl = (s, q) => { const i = s.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
    idle();
    let seq = 0;
    const run = debounce(async () => {
      const q = input.value.trim();
      if (!q) return idle();
      const my = ++seq;
      const cats = S.cats.filter((c) => c.name.includes(q)).slice(0, 4), brands = S.brands.filter((b) => b.name.toLowerCase().includes(q.toLowerCase())).slice(0, 4);
      const quick = cats.length || brands.length ? `<div class="s-chips">${cats.map((c) => `<a class="chip" href="${catHref(c)}">${icon('grid')} ${esc(c.name)}</a>`).join('')}${brands.map((b) => `<a class="chip" href="${brandHref(b)}">${icon('crown')} ${esc(b.name)}</a>`).join('')}</div>` : '';
      body.innerHTML = quick + `<div class="loadmore"><span class="spinner"></span></div>`;
      try {
        const r = await api(`/api/products?q=${enc(q)}&limit=10`);
        if (my !== seq) return;
        remember_(r.items);
        if (!r.items.length) { body.innerHTML = quick + `<div class="empty" style="padding-top:30px"><div class="mark">${icon('search')}</div><h2>لا توجد نتائج</h2><p>لم نجد «${esc(q)}». جرّبي كلمة أخرى أو تصفّحي الأقسام.</p></div>`; return; }
        body.innerHTML = quick + `<p class="s-lbl"><span><span class="num">${r.total}</span> نتيجة</span></p>
          <div class="s-list">${r.items.map((p) => `<a href="${prodHref(p)}" data-sq="${esc(q)}">${cm(p.images, p.name, { small: true })}<div><div class="t">${hl(p.name, q)}</div><div class="p">${moneyHtml(p.price)}${p.in_stock ? '' : ' <small class="muted">· نفد</small>'}</div></div></a>`).join('')}</div>
          ${r.total > r.items.length ? `<a class="link s-all" href="/shop?q=${enc(q)}" data-sq="${esc(q)}">عرض كل النتائج (<span class="num">${r.total}</span>) ${icon('arrow')}</a>` : ''}`;
        markImgs(body);
      } catch (e) { if (my === seq) body.innerHTML = `<p class="s-lbl">${esc(e.message)}</p>`; }
    }, 200);
    input.addEventListener('input', run);
    body.addEventListener('click', (e) => { const a = e.target.closest('[data-sq]'); if (a) remember(a.dataset.sq); });
    $('.s-bar').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim(); if (!q) return;
      remember(q); input.blur(); go('/shop?q=' + enc(q));
    });
  }
  function openSearch() {
    Layer.open('search');
    const i = $('#q');
    i.focus();
    setTimeout(() => { if (Layer.cur === 'search') i.focus(); }, 60);
  }

  // ================= router =================
  const routes = [
    [/^\/$/, viewHome],
    [/^\/shop\/?$/, viewShop],
    [/^\/c\/([^/]+)\/?$/, (a) => viewShop({ ...a, kind: 'cat' })],
    [/^\/brand\/([^/]+)\/?$/, (a) => viewShop({ ...a, kind: 'brand' })],
    [/^\/categories\/?$/, viewCategories],
    [/^\/p\/([^/]+)\/?$/, viewProduct],
    [/^\/cart\/?$/, viewCart],
    [/^\/checkout\/?$/, viewCheckout],
    [/^\/order\/([^/]+)\/?$/, viewOrderDone],
    [/^\/(orders|track)\/?$/, viewOrders],
    [/^\/wishlist\/?$/, viewWishlist],
    [/^\/about\/?$/, viewAbout],
    [/^\/policies\/?$/, viewPolicies],
    [/^\/contact\/?$/, viewContact],
  ];
  let navSeq = 0, cleanup = [], curKey = null;
  const main = () => $('#main');
  const onLeave = (fn) => cleanup.push(fn);
  const key = () => (history.state && history.state.k) || 'init';
  const scrolls = sstore.get('tq_scroll', {});
  const curPath = () => { try { return decodeURIComponent(location.pathname); } catch { return location.pathname; } };

  function setTitle(t) { const st = S.store.store; document.title = t ? `${t} — ${st.name}` : `${st.name} — ${st.tagline || st.name_ar || ''}`; }

  function go(url, { replace = false } = {}) {
    scrolls[key()] = window.scrollY; sstore.set('tq_scroll', scrolls);
    const depth = (history.state && history.state.d) || 0;
    const state = { k: Math.random().toString(36).slice(2, 10), d: replace ? depth : depth + 1 };
    if (Layer.cur) { Layer.hide(true); replace = replace || !!(history.state && history.state.layer); }
    if (replace) history.replaceState(state, '', url); else history.pushState(state, '', url);
    render({ restore: false });
  }
  function goBack() { if (((history.state && history.state.d) || 0) > 0) history.back(); else go('/', { replace: true }); }

  async function render({ restore }) {
    const my = ++navSeq;
    curKey = key();
    cleanup.forEach((f) => { try { f(); } catch { /* */ } }); cleanup = [];
    if (Layer.cur) Layer.hide(true);
    const path = curPath();
    const q = new URLSearchParams(location.search);
    $$('.nav a').forEach((a) => { const d = a.dataset.nav; a.classList.toggle('on', d === 'offers' ? q.get('offers') === '1' : new RegExp(d).test(path) && !(d.includes('shop') && q.get('offers') === '1')); });
    setTab(path);
    let view = viewNotFound, params = [];
    for (const [re, fn] of routes) { const m = path.match(re); if (m) { view = fn; params = m.slice(1); break; } }
    const target = restore ? scrolls[key()] || 0 : 0;
    if (!restore) window.scrollTo(0, 0);
    setTop({ mode: 'page' }); setChrome({ tab: true });
    try {
      await view({ params, q, path, isCurrent: () => my === navSeq });
    } catch (e) {
      if (my !== navSeq) return;
      console.error(e);
      setMain(`<div class="nf"><span class="big">!</span><h1>تعذر تحميل الصفحة</h1><p>${esc(e.message)}</p><div class="acts"><button class="btn" onclick="location.reload()">${icon('refresh')} إعادة المحاولة</button></div></div>`);
      setTitle('خطأ');
    }
    if (my !== navSeq) return;
    markImgs(main());
    if (restore && target) requestAnimationFrame(() => window.scrollTo(0, target));
  }
  const setMain = (html) => { main().innerHTML = `<div class="page">${html}</div>`; markImgs(main()); };

  // ================= product card =================
  const known = new Map();
  const remember_ = (list) => { for (const p of list || []) known.set(p.id, p); return list; };
  function tagsHtml(p) {
    const off = discount(p), t = [];
    if (!p.in_stock) t.push('<span class="tag out">نفد</span>');
    else {
      if (off) t.push(`<span class="tag sale">-<span class="num">${off}</span>٪</span>`);
      if (p.is_new) t.push('<span class="tag new">جديد</span>');
      if (p.low_stock) t.push('<span class="tag low">آخر القطع</span>');
    }
    return t.join('');
  }
  function addBtn(p) {
    const n = Cart.qty(p.id);
    return `<button class="add${n ? ' in' : ''}" type="button" data-add="${p.id}" ${p.in_stock ? '' : 'disabled'} aria-label="${n ? `في السلة ${n} — أضيفي المزيد` : 'أضيفي إلى السلة'}: ${esc(p.name)}">${icon(n ? 'bag' : 'plus')}${n ? `<span class="n num">${n}</span>` : ''}</button>`;
  }
  function card(p, { eager = false } = {}) {
    const off = discount(p), b = brandById(p.brand_id), c = catById(p.sub_id) || catById(p.category_id);
    const fav = Fav.has(p.id);
    return `<article class="card${p.in_stock ? '' : ' out'}" data-pid="${p.id}">
      <div class="cw">${cm(p.images, p.name, { hover: true, eager, href: prodHref(p) })}
      <div class="tags">${tagsHtml(p)}</div>
      <button class="fav${fav ? ' on' : ''}" type="button" data-fav="${p.id}" aria-pressed="${fav}" aria-label="${fav ? 'إزالة من المفضلة' : 'أضيفي للمفضلة'}">${icon('heart')}</button>
      ${addBtn(p)}</div>
      <a class="ci" href="${prodHref(p)}" tabindex="-1">
        ${b ? `<span class="ci-cat">${esc(b.name)}</span>` : c ? `<span class="ci-cat">${esc(c.name)}</span>` : ''}
        <h3 class="ci-name">${esc(p.name)}</h3>
        <div class="pr"><span class="now">${moneyHtml(p.price)}</span>${off ? `<span class="was">${moneyHtml(p.compare_price)}</span>` : ''}</div>
      </a>
    </article>`;
  }
  const skCards = (n) => Array.from({ length: n }, () => `<div class="card sk-card" aria-hidden="true"><div class="cm sk"></div><div class="sk sk-l w40"></div><div class="sk sk-l w80"></div><div class="sk sk-l w60"></div></div>`).join('');
  function patchAdds() {
    $$('[data-add]').forEach((b) => { const p = known.get(Number(b.dataset.add)); if (p && b.classList.contains('add')) b.outerHTML = addBtn(p); });
  }
  function patchCards(list) {
    for (const p of list) {
      known.set(p.id, p);
      $$(`.card[data-pid="${p.id}"]`).forEach((el) => {
        const old = el.querySelector('.now')?.textContent + '|' + el.classList.contains('out');
        const tmp = document.createElement('div'); tmp.innerHTML = card(p);
        const nu = tmp.firstElementChild;
        const now = nu.querySelector('.now')?.textContent + '|' + nu.classList.contains('out');
        nu.style.animation = 'none';
        el.replaceWith(nu); markImgs(nu);
        if (old !== now) { void nu.offsetWidth; nu.style.animation = ''; nu.classList.add('patched'); }
      });
    }
  }

  function flyToCart(fromEl) {
    if (reduceMotion || !fromEl) return;
    const target = isDesk() ? $$('.top .cart-ib')[1] : $('.tab-cart .bubble');
    if (!target || !target.offsetParent) return;
    const a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
    if (!a.width) return;
    const img = fromEl.querySelector('img.ld') || fromEl.querySelector('img');
    const fly = document.createElement('div');
    fly.className = 'fly';
    fly.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
    if (img) fly.innerHTML = `<img src="${img.src}" alt="">`;
    document.body.appendChild(fly);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const anim = fly.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '14px' },
      { transform: `translate(${dx * 0.5}px,${dy * 0.35 - 60}px) scale(.45)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px,${dy}px) scale(.08)`, opacity: 0.4, borderRadius: '50%' },
    ], { duration: 650, easing: 'cubic-bezier(.5,0,.3,1)' });
    anim.onfinish = () => { fly.remove(); const t = $('.tab-cart'); if (t) { t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); } };
  }
  function addToCart(p, qty = 1, fromEl) {
    if (!p.in_stock) return toast('هذا المنتج غير متوفر حالياً', { type: 'err' });
    const added = Cart.add(p, qty);
    if (!added) return toast('وصلتِ للحد الأقصى المتوفر من هذا المنتج', { type: 'err' });
    vibrate();
    flyToCart(fromEl);
    toast(`أُضيف إلى السلة`, { img: (p.images || [])[0], link: '/cart', linkText: 'عرض السلة', ms: 2600 });
  }
  function toggleFav(id, btn) {
    const on = Fav.toggle(id);
    vibrate(8);
    $$(`[data-fav="${id}"]`).forEach((b) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'إزالة من المفضلة' : 'أضيفي للمفضلة'); });
    if (btn) { btn.classList.remove('beat'); void btn.offsetWidth; btn.classList.add('beat'); }
    if (on) toast('أُضيف إلى المفضلة', { link: '/wishlist', linkText: 'المفضلة', ms: 2000 });
  }

  const railHtml = (items) => `<div class="rail">${items.map((p) => card(p)).join('')}</div>`;
  const secHead = (title, ic, href, sub = '') => `<div class="sec-h"><div><h2>${ic ? icon(ic) : ''}${title}</h2>${sub ? `<small>${sub}</small>` : ''}</div>${href ? `<a class="link" href="${href}">عرض الكل ${icon('arrow')}</a>` : ''}</div>`;

  // infinite product feed
  function feed({ grid, more, qs, onTotal, page = 20 }) {
    let offset = 0, total = Infinity, busy = false, done = false;
    const load = async () => {
      if (busy || done) return;
      busy = true;
      more.innerHTML = '<span class="spinner"></span>';
      try {
        const r = await api(`/api/products?${qs()}&limit=${page}&offset=${offset}`);
        remember_(r.items);
        total = r.total;
        if (offset === 0) grid.innerHTML = '';
        grid.insertAdjacentHTML('beforeend', r.items.map((p, i) => card(p, { eager: offset === 0 && i < 4 })).join(''));
        markImgs(grid);
        offset += r.items.length;
        onTotal && onTotal(total);
        done = offset >= total || !r.items.length;
        more.innerHTML = done ? (total > page ? `<span>عرضتِ كل المنتجات (<span class="num">${total}</span>)</span>` : '') : '';
      } catch (e) {
        more.innerHTML = `<button class="btn line sm" type="button">${icon('refresh')} إعادة المحاولة</button>`;
        more.querySelector('button').onclick = () => { busy = false; load(); };
        toast(e.message, { type: 'err' });
        return;
      } finally { busy = false; }
      if (!done && more.getBoundingClientRect().top < window.innerHeight + 600) load();
    };
    const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) load(); }, { rootMargin: '700px 0px' });
    io.observe(more);
    onLeave(() => io.disconnect());
    grid.innerHTML = skCards(isDesk() ? 8 : 4);
    load();
    return { reset() { offset = 0; done = false; total = Infinity; grid.innerHTML = skCards(4); load(); } };
  }

  // ================= views =================
  // ---------- home ----------
  async function viewHome({ isCurrent }) {
    setTitle(''); setTop({ mode: 'home' });
    const D = S.store, h = D.hero || {}, st = D.store;
    const wa = waNumber(st.whatsapp);
    const banners = (D.banners || []).filter((b) => b && b.image);
    const heroB = banners.filter((b) => b.place === 'hero'), midB = banners.filter((b) => b.place === 'mid'), tileB = banners.filter((b) => b.place === 'tiles');
    const defHero = h.image
      ? `<a class="hslide" href="/shop">${imgTag(h.image, h.title || st.name, '', true)}<div class="hcopy"><span class="eb">${esc(String(st.name).toUpperCase())}</span><h2>${esc(h.title || st.tagline)}</h2>${h.subtitle ? `<p>${esc(h.subtitle)}</p>` : ''}<span class="btn">${esc(h.cta || 'تسوّقي الآن')} ${icon('arrow')}</span></div></a>`
      : `<a class="hslide type" href="/shop"><svg class="pat" aria-hidden="true"><defs><pattern id="arches" width="56" height="76" patternUnits="userSpaceOnUse"><path d="M4 76V32a24 24 0 0 1 48 0v44" fill="none" stroke="currentColor" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#arches)"/></svg><span class="mono" aria-hidden="true">Q</span>
          <div class="hcopy"><span class="eb">${esc(String(st.name).toUpperCase())} · BEAUTY HOUSE</span><h2>${esc(h.title || st.tagline)}</h2>${h.subtitle ? `<p>${esc(h.subtitle)}</p>` : ''}<span class="btn">${esc(h.cta || 'تسوّقي الآن')} ${icon('arrow')}</span></div></a>`;
    const slides = heroB.length ? heroB.map((b, i) => bannerHtml(b, 'hslide', i === 0)) : [defHero];
    const stories = [
      `<a class="story special" href="/shop?offers=1"><span class="story-ring"><span class="story-in">${icon('tag')}</span></span><b>العروض</b></a>`,
      `<a class="story special" href="/shop?new=1"><span class="story-ring"><span class="story-in">${icon('sparkle')}</span></span><b>جديدنا</b></a>`,
      ...mains().map((c) => `<a class="story" href="${catHref(c)}"><span class="story-ring"><span class="story-in" data-cat="${c.id}"><span class="q">${esc(c.name.slice(0, 1))}</span>${c.image ? imgTag(c.image, '') : ''}</span></span><b>${esc(c.name)}</b></a>`),
    ];
    const sec = (id, cls = '') => `<section class="sec ${cls}" data-sec="${id}"><div class="sec-h"><div><div class="sk sk-l" style="width:120px;height:18px"></div></div></div><div class="rail">${skCards(3)}</div></section>`;
    const install = canInstall() && !store.get('tq_inst_x', false) ? `<div class="install" id="inst"><span class="ic">Q</span><div><b>ثبّتي تطبيق ${esc(st.name)}</b>وصول أسرع للعروض وتتبع طلباتكِ</div><button class="btn sm" data-install>تثبيت</button><button class="ib" id="inst-x" aria-label="إخفاء">${icon('close')}</button></div>` : '';
    setMain(`
      <div class="hsearch"><button class="spill" type="button" data-open="search">${icon('search')}<span>ابحثي عن عطر، مكياج، براند…</span></button></div>
      <nav class="stories" aria-label="الأقسام">${stories.join('')}</nav>
      <div class="hero-w"><div class="hero-s" id="hero">${slides.join('')}</div>${slides.length > 1 ? `<div class="dots" id="hdots">${slides.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}</div>
      <div class="perks">
        <span class="perk">${icon('seal')}<span><b>أصلي 100٪</b> مضمون</span></span>
        <span class="perk">${icon('truck')}<span><b>توصيل</b> لكل المحافظات${freeOver() ? ` · مجاني من ${moneyHtml(freeOver())}` : ''}</span></span>
        <span class="perk">${icon('cash')}<span><b>الدفع</b> عند الاستلام</span></span>
        <span class="perk">${icon('swap')}<span><b>استبدال</b> خلال 7 أيام</span></span>
      </div>
      ${install}
      ${sec('featured')}
      ${midB.length ? `<section class="sec"><div class="mids">${midB.map((b) => bannerHtml(b, 'mid')).join('')}</div></section>` : ''}
      ${sec('offers', 'band')}
      ${tileB.length ? `<section class="sec"><div class="tiles${tileB.length % 2 ? ' odd' : ''}">${tileB.map((b) => bannerHtml(b, 'tilep')).join('')}</div></section>` : ''}
      ${sec('new')}
      ${S.brands.length ? `<section class="sec">${secHead('تسوّقي حسب البراند', 'crown', '/categories#brands')}<div class="stories" style="padding-top:2px">${S.brands.map((b) => `<a class="story" href="${brandHref(b)}"><span class="story-ring" style="background:var(--line-2)"><span class="story-in" style="background:#fff">${b.logo ? imgTag(b.logo, '') : `<span class="bn">${esc(b.name)}</span>`}</span></span><b>${esc(b.name)}</b></a>`).join('')}</div></section>` : ''}
      <section class="sec" data-sec="recent" hidden></section>
      <section class="sec" id="all">
        ${secHead('اكتشفي كل المنتجات', 'sparkle', '', D.count ? `<span class="num">${D.count}</span> منتج أصلي` : '')}
        ${mains().length > 1 ? `<div class="stick"><div class="chips" id="hchips"><button class="chip on" data-hc="">الكل</button>${mains().map((c) => `<button class="chip" data-hc="${c.id}">${esc(c.name)}</button>`).join('')}</div></div>` : ''}
        <div class="grid" id="hgrid"></div><div class="loadmore" id="hmore"></div>
      </section>
      ${wa || st.phone ? `<section class="help"><span class="q" aria-hidden="true">Q</span><div><h3>تحتاجين مساعدة في الاختيار؟</h3><p>فريقنا جاهز لمساعدتكِ في اختيار ما يناسبكِ والإجابة على أسئلتكِ.</p></div>
        <div class="acts">${wa ? `<a class="btn wa" href="https://wa.me/${wa}?text=${enc('مرحباً، أحتاج استشارة بخصوص منتج')}" target="_blank" rel="noopener">${icon('whatsapp')} واتساب</a>` : ''}${st.phone ? `<a class="btn ghost" href="tel:${esc(normPhone(st.phone) || st.phone)}">${icon('phone')} اتصلي بنا</a>` : ''}</div></section>` : ''}`);

    // hero slider: dots + autoplay
    const hero = $('#hero'), dots = $$('#hdots i');
    if (dots.length) {
      const sl = $$('.hslide', hero);
      let cur = 0, paused = false;
      const io = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting && x.intersectionRatio > 0.55) { cur = sl.indexOf(x.target); dots.forEach((d, i) => d.classList.toggle('on', i === cur)); } }), { root: hero, threshold: [0.55] });
      sl.forEach((s) => io.observe(s));
      const vis = new IntersectionObserver((en) => { paused = !en[0].isIntersecting; }); vis.observe(hero);
      ['touchstart', 'pointerdown', 'mouseenter'].forEach((ev) => hero.addEventListener(ev, () => { paused = true; }, { passive: true }));
      ['touchend', 'mouseleave'].forEach((ev) => hero.addEventListener(ev, () => { setTimeout(() => { paused = false; }, 4000); }, { passive: true }));
      const t = setInterval(() => {
        if (paused || document.hidden || reduceMotion) return;
        const nx = sl[(cur + 1) % sl.length];
        hero.scrollTo({ left: nx.offsetLeft - hero.offsetLeft - (hero.clientWidth - nx.clientWidth) / 2 + (getComputedStyle(hero).direction === 'rtl' ? 0 : 0), behavior: 'smooth' });
      }, 5200);
      onLeave(() => { clearInterval(t); io.disconnect(); vis.disconnect(); });
    }
    const ix = $('#inst-x'); if (ix) ix.onclick = () => { store.set('tq_inst_x', true); $('#inst').remove(); };

    // product rails
    const fill = async (id, qs, title, ic, href) => {
      const el = $(`[data-sec="${id}"]`); if (!el) return;
      try {
        const r = await api(`/api/products?${qs}&limit=12`);
        if (!isCurrent()) return;
        remember_(r.items);
        if (!r.items.length) { el.remove(); return; }
        el.innerHTML = secHead(title, ic, href) + railHtml(r.items);
        markImgs(el);
      } catch { if (isCurrent()) el.remove(); }
    };
    // category stories without image borrow a product photo
    mains().filter((c) => !c.image).forEach(async (c) => {
      try {
        if (!catCover.has(c.id)) { const r = await api(`/api/products?category=${c.id}&instock=1&limit=6`); catCover.set(c.id, ((r.items.find((p) => p.images && p.images.length) || {}).images || [])[0] || ''); }
        const f = catCover.get(c.id), el = isCurrent() && $(`.story-in[data-cat="${c.id}"]`);
        if (f && el) { el.insertAdjacentHTML('beforeend', imgTag(f, '')); }
      } catch { /* */ }
    });
    // recently viewed
    const rec = Recent.get();
    if (rec.length) api(`/api/products?ids=${rec.join(',')}&limit=16`).then((r) => {
      if (!isCurrent() || !r.items.length) return;
      remember_(r.items);
      const byId = new Map(r.items.map((p) => [p.id, p])); const list = rec.map((id) => byId.get(id)).filter(Boolean);
      const el = $('[data-sec="recent"]'); if (!el) return;
      el.hidden = false; el.innerHTML = secHead('شاهدتِها مؤخراً', 'clock', '') + railHtml(list); markImgs(el);
    }).catch(() => {});
    // all products feed with category chips
    let hcat = '';
    const f = feed({ grid: $('#hgrid'), more: $('#hmore'), qs: () => (hcat ? `category=${hcat}` : '') });
    $$('[data-hc]').forEach((b) => b.addEventListener('click', () => {
      hcat = b.dataset.hc; $$('[data-hc]').forEach((x) => x.classList.toggle('on', x === b));
      b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: behavior() });
      const top = $('#all').getBoundingClientRect().top + window.scrollY - 60;
      if (window.scrollY > top) window.scrollTo({ top, behavior: behavior() });
      f.reset();
    }));
    await Promise.all([
      fill('featured', 'featured=1', 'مختارات الملكة', 'crown', '/shop'),
      fill('offers', 'offers=1', 'عروض لا تُفوّت', 'tag', '/shop?offers=1'),
      fill('new', 'new=1&sort=new', 'وصل حديثاً', 'sparkle', '/shop?new=1'),
    ]);
  }
  const catCover = new Map();
  // banner with optional phone-specific image
  function bannerHtml(b, cls, eager = false) {
    const href = safeHref(b.link);
    const tag = href ? 'a' : 'div';
    const ext = href && /^https?:/i.test(href) && !href.startsWith(location.origin);
    const pic = `<picture>${b.image_m ? `<source media="(max-width: 767px)" srcset="${esc(mediaUrl(b.image_m))}">` : ''}<img src="${esc(mediaUrl(b.image))}" alt="${esc(b.title || '')}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;
    const copy = b.title || b.subtitle || b.cta ? `<div class="hcopy">${b.title ? `<h2>${esc(b.title)}</h2>` : ''}${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ''}${b.cta && href ? `<span class="btn">${esc(b.cta)} ${icon('arrow')}</span>` : ''}</div>` : '';
    return `<${tag} class="${cls} bnr ${b.theme === 'light' ? 'light' : ''} ${copy ? '' : 'bare'}" ${href ? `href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}` : ''}>${pic}${copy}</${tag}>`;
  }

  // ---------- categories ----------
  async function viewCategories() {
    setTitle('الأقسام'); setTop({ title: 'الأقسام والبراندات' });
    const tile = (c, i) => `<a class="ctile" href="${catHref(c)}"><div class="ph"><span class="q">${String(i + 1).padStart(2, '0')}</span></div>${c.image ? imgTag(c.image, '') : ''}<span data-cover="${c.id}" hidden></span><div><b>${esc(c.name)}</b><small><span class="num">${c.n}</span> منتج${subsOf(c.id).length ? ` · ${subsOf(c.id).length} أقسام` : ''}</small></div></a>`;
    setMain(`
      <div class="phead"><h1>تسوّقي حسب القسم</h1><p>اختاري القسم الذي يناسبكِ</p></div>
      <div class="ctiles">
        <a class="ctile wide plum" href="/shop?offers=1"><span class="big">%</span><div><b>العروض والخصومات</b><small>أسعار مميزة لفترة محدودة</small></div></a>
        ${mains().map(tile).join('')}
        <a class="ctile gold" href="/shop?new=1"><span class="big">✦</span><div><b>وصل حديثاً</b><small>أحدث المنتجات</small></div></a>
        <a class="ctile plum" href="/shop"><span class="big">Q</span><div><b>كل المنتجات</b><small><span class="num">${S.store.count}</span> منتج</small></div></a>
      </div>
      ${mains().some((c) => subsOf(c.id).length) ? `<section class="sec">${mains().filter((c) => subsOf(c.id).length).map((c) => `<div class="sec-h"><h2>${esc(c.name)}</h2><a class="link" href="${catHref(c)}">الكل ${icon('arrow')}</a></div><div class="chips" style="padding-top:0;flex-wrap:wrap">${subsOf(c.id).map((s) => `<a class="chip" href="${catHref(s)}">${esc(s.name)} <small class="num">${s.n}</small></a>`).join('')}</div>`).join('')}</section>` : ''}
      ${S.brands.length ? `<section class="sec" id="brands">${secHead('البراندات', 'crown', '')}<div class="ctiles" style="grid-template-columns:repeat(auto-fill,minmax(100px,1fr))">${S.brands.map((b) => `<a class="story" style="width:auto" href="${brandHref(b)}"><span class="story-ring" style="background:var(--line-2);width:76px;height:76px"><span class="story-in" style="background:#fff">${b.logo ? imgTag(b.logo, '') : `<span class="bn">${esc(b.name)}</span>`}</span></span><b>${esc(b.name)}</b></a>`).join('')}</div></section>` : ''}`);
    if (location.hash === '#brands') setTimeout(() => $('#brands')?.scrollIntoView({ behavior: behavior() }), 100);
    mains().filter((c) => !c.image).forEach(async (c) => {
      try {
        if (!catCover.has(c.id)) { const r = await api(`/api/products?category=${c.id}&instock=1&limit=6`); catCover.set(c.id, ((r.items.find((p) => p.images && p.images.length) || {}).images || [])[0] || ''); }
        const f = catCover.get(c.id), m = $(`[data-cover="${c.id}"]`);
        if (f && m) { m.insertAdjacentHTML('afterend', imgTag(f, '')); markImgs(m.parentElement); }
      } catch { /* */ }
    });
  }

  // ---------- shop / category / brand ----------
  const SORTS = [['', 'الأكثر تميزاً'], ['new', 'الأحدث'], ['price_asc', 'السعر: من الأقل للأعلى'], ['price_desc', 'السعر: من الأعلى للأقل'], ['name', 'الاسم']];
  async function viewShop({ params, q, kind }) {
    const slug = params[0];
    let cat = null, brand = null;
    if (kind === 'cat') { cat = catFind(slug); if (!cat) return viewNotFound({ msg: 'هذا القسم غير موجود أو لم يعد متاحاً.' }); }
    if (kind === 'brand') { brand = brandFind(slug); if (!brand) return viewNotFound({ msg: 'هذا البراند غير موجود أو لم يعد متاحاً.' }); }
    if (!brand && q.get('brand')) brand = brandFind(q.get('brand')) || null;
    const parent = cat && cat.parent_id ? catById(cat.parent_id) : null;
    const f = {
      q: (q.get('q') || '').trim(), sort: q.get('sort') || '', offers: q.get('offers') === '1', new: q.get('new') === '1', instock: q.get('instock') === '1',
      min: toLatin(q.get('min') || '').replace(/\D/g, ''), max: toLatin(q.get('max') || '').replace(/\D/g, ''),
    };
    const title = cat ? cat.name : kind === 'brand' ? brand.name : f.q ? `«${f.q}»` : f.offers ? 'العروض والخصومات' : f.new ? 'وصل حديثاً' : 'كل المنتجات';
    setTitle(f.q ? `بحث: ${f.q}` : title); setTop({ title });
    const qsWith = (extra = {}) => {
      const o = { q: f.q, sort: f.sort, offers: f.offers ? '1' : '', new: f.new ? '1' : '', instock: f.instock ? '1' : '', min: f.min, max: f.max, brand: kind === 'brand' ? '' : brand ? brand.slug : '', ...extra };
      const u = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v) u.set(k, v);
      const s = u.toString(); return s ? '?' + s : '';
    };
    const base = location.pathname;
    const apply = (extra) => go(base + qsWith(extra), { replace: true });
    const activeN = [f.offers, f.new, f.instock, f.min || f.max, kind !== 'brand' && brand].filter(Boolean).length;
    // chips: subs of main / siblings of sub / mains
    let chips = '';
    const mainOf = cat ? (parent || cat) : null;
    if (mainOf && subsOf(mainOf.id).length) chips = `<a class="chip ${cat === mainOf ? 'on' : ''}" href="${catHref(mainOf)}${qsWith()}">الكل</a>` + subsOf(mainOf.id).map((s) => `<a class="chip ${cat && cat.id === s.id ? 'on' : ''}" href="${catHref(s)}${qsWith()}">${esc(s.name)}</a>`).join('');
    else if (!cat && mains().length > 1) chips = `<a class="chip ${kind === 'brand' || base === '/shop' ? 'on' : ''}" href="${kind === 'brand' ? brandHref(brand) : '/shop'}${qsWith()}">الكل</a>` + (kind === 'brand' ? '' : mains().map((c) => `<a class="chip" href="${catHref(c)}${qsWith()}">${esc(c.name)}</a>`).join(''));
    const active = [];
    if (f.q && kind) active.push(['q', `بحث: ${f.q}`]);
    if (kind !== 'brand' && brand) active.push(['brand', brand.name]);
    if (f.instock) active.push(['instock', 'المتوفر فقط']);
    if (f.offers && (cat || kind)) active.push(['offers', 'العروض']);
    if (f.new && (cat || kind)) active.push(['new', 'وصل حديثاً']);
    if (f.min || f.max) active.push(['price', `${f.min ? Number(f.min).toLocaleString('en-US') : '0'} – ${f.max ? Number(f.max).toLocaleString('en-US') : '∞'}`]);
    setMain(`
      <div class="phead">${kind === 'brand' && brand.logo ? `<div style="display:flex;align-items:center;gap:12px"><span class="story-in" style="width:56px;height:56px;border-radius:50%;border:1px solid var(--line);background:#fff;flex:none">${imgTag(brand.logo, '')}</span><div><h1>${esc(brand.name)}</h1><p id="count">&nbsp;</p></div></div>`
        : `<h1>${esc(title)}</h1><p id="count">${parent ? `<a class="link" href="${catHref(parent)}">${esc(parent.name)}</a>` : '&nbsp;'}</p>`}</div>
      <div class="stick">
        ${chips ? `<div class="chips" id="chips">${chips}</div>` : ''}
        <div class="tools"><span class="count" id="count2"></span>
          <button class="tbtn" type="button" id="b-sort">${icon('sort')} ${esc((SORTS.find((s) => s[0] === f.sort) || SORTS[0])[1].split(':')[0])}</button>
          <button class="tbtn" type="button" id="b-filter">${icon('filter')} تصفية ${activeN ? `<i>${activeN}</i>` : ''}</button>
        </div>
        ${active.length ? `<div class="chips" style="padding-top:0">${active.map(([k, l]) => `<button class="chip on" type="button" data-unset="${k}">${esc(l)} ${icon('close')}</button>`).join('')}</div>` : ''}
      </div>
      <div class="grid" id="grid"></div><div class="loadmore" id="more"></div>`);
    const chipOn = $('#chips .chip.on'); if (chipOn) chipOn.scrollIntoView({ inline: 'center', block: 'nearest' });
    $$('[data-unset]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.unset; apply(k === 'price' ? { min: '', max: '' } : { [k]: '' }); }));
    $('#b-sort').addEventListener('click', () => {
      const el = sheet({ title: 'ترتيب حسب', body: SORTS.map(([v, l]) => `<label class="opt"><span>${l}</span><input type="radio" name="srt" value="${v}" ${f.sort === v ? 'checked' : ''}><span class="radio"></span></label>`).join('') });
      $$('input[name="srt"]', el).forEach((r) => r.addEventListener('change', () => apply({ sort: r.value })));
    });
    $('#b-filter').addEventListener('click', () => {
      const quick = [[0, 25000], [25000, 50000], [50000, 100000], [100000, 0]];
      const showBrands = kind !== 'brand' && S.brands.length;
      const el = sheet({
        title: 'تصفية المنتجات',
        body: `${showBrands ? `<div class="fgroup"><h3>البراند</h3><div class="s-chips" style="margin:0"><button type="button" class="chip ${brand ? '' : 'on'}" data-br="">الكل</button>${S.brands.map((b) => `<button type="button" class="chip ${brand && brand.id === b.id ? 'on' : ''}" data-br="${esc(b.slug)}">${esc(b.name)}</button>`).join('')}</div></div>` : ''}
          <div class="fgroup">
            <label class="opt"><span>المتوفر فقط</span><input type="checkbox" data-f="instock" ${f.instock ? 'checked' : ''}><span class="sw"></span></label>
            <label class="opt"><span>العروض والخصومات</span><input type="checkbox" data-f="offers" ${f.offers ? 'checked' : ''}><span class="sw"></span></label>
            <label class="opt"><span>وصل حديثاً</span><input type="checkbox" data-f="new" ${f.new ? 'checked' : ''}><span class="sw"></span></label>
          </div>
          <div class="fgroup"><h3>السعر <small class="muted">(${esc(S.currency)})</small></h3>
            <div class="prange"><input class="inp" id="pmin" inputmode="numeric" placeholder="من" value="${esc(f.min)}" aria-label="أقل سعر"><input class="inp" id="pmax" inputmode="numeric" placeholder="إلى" value="${esc(f.max)}" aria-label="أعلى سعر"></div>
            <div class="quick-prices">${quick.map(([a, b]) => `<button type="button" class="chip" data-qp="${a}-${b}">${b ? `${a ? (a / 1000) + 'k' : '0'} – ${b / 1000}k` : `أكثر من ${a / 1000}k`}</button>`).join('')}</div>
          </div>`,
        foot: `<div style="display:flex;gap:10px"><button class="btn line" type="button" id="f-clear" style="flex:none">مسح</button><button class="btn block" type="button" id="f-apply">عرض النتائج</button></div>`,
      });
      let br = brand ? brand.slug : '';
      $$('[data-br]', el).forEach((b) => b.addEventListener('click', () => { br = b.dataset.br; $$('[data-br]', el).forEach((x) => x.classList.toggle('on', x === b)); }));
      $$('[data-qp]', el).forEach((b) => b.addEventListener('click', () => { const [a, c] = b.dataset.qp.split('-'); $('#pmin').value = a === '0' ? '' : a; $('#pmax').value = c === '0' ? '' : c; }));
      $('#f-clear', el).addEventListener('click', () => apply({ instock: '', offers: kind || cat ? '' : f.offers ? '1' : '', new: kind || cat ? '' : f.new ? '1' : '', min: '', max: '', brand: '' }));
      $('#f-apply', el).addEventListener('click', () => {
        const o = {}; $$('[data-f]', el).forEach((c) => { o[c.dataset.f] = c.checked ? '1' : ''; });
        let mn = toLatin($('#pmin').value).replace(/\D/g, ''), mx = toLatin($('#pmax').value).replace(/\D/g, '');
        if (mn && mx && Number(mn) > Number(mx)) [mn, mx] = [mx, mn];
        apply({ ...o, min: mn, max: mx, brand: showBrands ? br : '' });
      });
    });
    const qs = () => {
      const u = new URLSearchParams();
      if (cat) u.set('category', cat.id);
      if (brand) u.set('brand', brand.id);
      if (f.q) u.set('q', f.q); if (f.sort) u.set('sort', f.sort);
      if (f.offers) u.set('offers', 1); if (f.new) u.set('new', 1); if (f.instock) u.set('instock', 1);
      if (f.min) u.set('min', f.min); if (f.max) u.set('max', f.max);
      return u.toString();
    };
    feed({
      grid: $('#grid'), more: $('#more'), qs,
      onTotal: (t) => {
        const c = $('#count2'); if (c) c.innerHTML = t ? `<span class="num">${t}</span> منتج` : '';
        if (!t) $('#more').innerHTML = `<div class="empty" style="padding-top:20px"><div class="mark">${icon('search')}</div><h2>لا توجد منتجات مطابقة</h2><p>${f.q ? 'جرّبي كلمة بحث مختلفة أو تصفّحي الأقسام.' : 'جرّبي تعديل خيارات التصفية.'}</p><a class="btn line" href="/shop">عرض كل المنتجات</a></div>`;
      },
    });
  }

  // ---------- product ----------
  async function viewProduct({ params, isCurrent }) {
    setTop({ mode: 'float', share: true }); setChrome({ tab: false, bar: true });
    setMain(`<div class="pdp" aria-busy="true"><div class="gal-w solo"><div class="gal"><div class="gslide sk"></div></div></div><div class="pinfo"><div class="sk sk-l w40"></div><div class="sk" style="height:28px;width:85%;margin-top:12px"></div><div class="sk" style="height:30px;width:40%;margin-top:14px"></div><div class="sk" style="height:120px;margin-top:20px"></div></div></div>`);
    let p;
    try { p = await api('/api/products/' + enc(params[0])); } catch (e) {
      if (!isCurrent()) return;
      if (e.status === 404) { setTop({ mode: 'page' }); setChrome({ tab: true }); return viewNotFound({ msg: 'هذا المنتج غير متوفر أو تمت إزالته من المتجر.' }); }
      throw e;
    }
    if (!isCurrent()) return;
    remember_([p]); remember_(p.related);
    Recent.push(p.id);
    setTitle(p.name); setTop({ mode: 'float', title: p.name, share: true });
    const st = S.store.store, d = dlv(), wa = waNumber(st.whatsapp);
    const imgs = (p.images || []).filter(Boolean);
    const cat = p.category, sub = p.sub, brand = p.brand;
    const waText = `مرحباً، أرغب بطلب هذا المنتج:\n${p.name}\nالسعر: ${money(p.price)}\n${location.origin}${prodHref(p)}`;
    const fav = Fav.has(p.id);
    const slides = imgs.length ? imgs.map((im, i) => `<div class="gslide" data-i="${i}">${ph(p.name)}${imgTag(im, `${p.name}${imgs.length > 1 ? ' — صورة ' + (i + 1) : ''}`, '', i === 0)}</div>`).join('') : `<div class="gslide">${ph(p.name)}</div>`;
    const cap = () => Math.max(1, Math.min(p.low_stock ? 3 : 10, 10 - Cart.qty(p.id)));
    setMain(`
      <div class="pdp">
        <div class="gal-w${imgs.length > 1 ? '' : ' solo'}">
          <div class="gal" id="gal" tabindex="0" aria-label="صور المنتج">${slides}</div>
          ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((im, i) => `<button type="button" data-go="${i}" class="${i ? '' : 'on'}" aria-label="صورة ${i + 1}">${imgTag(im, '')}</button>`).join('')}</div>
            <span class="gal-n num" id="gal-n">1 / ${imgs.length}</span><div class="dots" aria-hidden="true">${imgs.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
          <div class="tags">${tagsHtml(p)}</div>
        </div>
        <div class="pinfo">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div style="min-width:0">${brand ? `<a class="pcat" href="${brandHref(brand)}">${esc(brand.name)}</a>` : ''}${brand && (sub || cat) ? '<span class="pcat"> · </span>' : ''}${sub ? `<a class="pcat" href="/c/${enc(sub.slug)}">${esc(sub.name)}</a>` : cat ? `<a class="pcat" href="/c/${enc(cat.slug)}">${esc(cat.name)}</a>` : ''}
              <h1>${esc(p.name)}</h1></div>
            <button class="fav${fav ? ' on' : ''}" style="position:static;flex:none;margin-top:4px" type="button" data-fav="${p.id}" aria-pressed="${fav}" aria-label="المفضلة">${icon('heart')}</button>
          </div>
          <div class="pprice" id="pprice"></div>
          <div id="pstock"></div>
          <div class="pbuy" id="pbuy"></div>
          <div class="dlv">
            <div class="dlv-r">${icon('truck')}<div><b>التوصيل لكل المحافظات</b><small>بغداد ${moneyHtml(d.baghdad)} · باقي المحافظات ${moneyHtml(d.other)}${freeOver() ? ` · مجاني للطلبات من ${moneyHtml(freeOver())}` : ''}</small></div></div>
            <div class="dlv-r">${icon('cash')}<div><b>الدفع عند الاستلام</b><small>ادفعي نقداً عند وصول طلبكِ</small></div></div>
            <div class="dlv-r">${icon('seal')}<div><b>أصلي 100٪</b><small>استبدال خلال 7 أيام وفق السياسة</small></div></div>
          </div>
          <div style="margin-top:6px">
            ${p.description ? `<details class="acc" open><summary>الوصف والتفاصيل ${icon('plus')}</summary><div class="acc-b">${esc(p.description)}</div></details>` : ''}
            <details class="acc"><summary>الاستبدال والإرجاع ${icon('plus')}</summary><div class="acc-b">يمكن الاستبدال خلال 7 أيام بشرط أن يكون المنتج بحالته الأصلية وغير مستخدم. <a class="link" href="/policies">السياسة الكاملة</a></div></details>
          </div>
        </div>
        <div class="pmore">
          ${p.related && p.related.length ? `<section class="sec">${secHead('قد يعجبكِ أيضاً', 'sparkle', sub ? `/c/${enc(sub.slug)}` : cat ? `/c/${enc(cat.slug)}` : '')}${railHtml(p.related)}</section>` : ''}
        </div>
      </div>
      <div class="buybar" id="buybar"></div>`);

    // live-patchable price/stock/buy area
    let qty = 1;
    const drawBuy = () => {
      const off = discount(p), inCart = Cart.qty(p.id);
      $('#pprice').innerHTML = `<span class="now">${moneyHtml(p.price)}</span>${off ? `<span class="was">${moneyHtml(p.compare_price)}</span><span class="off">وفّري ${moneyHtml(p.compare_price - p.price)}</span>` : ''}${p.unit ? `<span class="unit">/ ${esc(p.unit)}</span>` : ''}`;
      $('#pstock').innerHTML = !p.in_stock ? '<span class="stock out">نفد من المخزون</span>' : p.low_stock ? '<span class="stock low">آخر القطع المتوفرة — اطلبيها الآن</span>' : '<span class="stock">متوفر وجاهز للتوصيل</span>';
      qty = Math.min(qty, cap());
      const step = `<div class="stepper" role="group" aria-label="الكمية"><button type="button" data-q="1" aria-label="زيادة" ${qty >= cap() ? 'disabled' : ''}>${icon('plus')}</button><output class="num" aria-live="polite">${qty}</output><button type="button" data-q="-1" aria-label="إنقاص" ${qty <= 1 ? 'disabled' : ''}>${icon('minus')}</button></div>`;
      const addLabel = inCart ? `${icon('bag')} أضيفي المزيد <small>(في السلة ${inCart})</small>` : `${icon('bag')} أضيفي إلى السلة`;
      const waBtn = wa ? `<a class="btn wa" href="https://wa.me/${wa}?text=${enc(waText)}" target="_blank" rel="noopener" aria-label="اطلبي عبر واتساب">${icon('whatsapp')}</a>` : '';
      const buy = p.in_stock ? `${step}<button class="btn" type="button" data-buy>${addLabel}</button>` : `<button class="btn" type="button" disabled>نفد من المخزون</button>`;
      $('#pbuy').innerHTML = buy + waBtn;
      $('#buybar').innerHTML = p.in_stock
        ? `${step}<button class="btn" type="button" data-buy>${inCart ? `${icon('bag')} أضيفي <small>· في السلة ${inCart}</small>` : `${icon('bag')} أضيفي للسلة`}</button>${wa ? `<a class="ib" href="https://wa.me/${wa}?text=${enc(waText)}" target="_blank" rel="noopener" aria-label="اطلبي عبر واتساب">${icon('whatsapp')}</a>` : ''}`
        : `<button class="btn" type="button" disabled style="flex:1">نفد من المخزون</button>${wa ? `<a class="btn wa" href="https://wa.me/${wa}?text=${enc('مرحباً، هل سيتوفر هذا المنتج قريباً؟\n' + p.name)}" target="_blank" rel="noopener">${icon('whatsapp')} اسألي عن توفره</a>` : ''}`;
      $('#buybar').classList.add('on');
    };
    drawBuy();
    const onClick = (e) => {
      const qb = e.target.closest('[data-q]');
      if (qb) { qty = Math.max(1, Math.min(cap(), qty + Number(qb.dataset.q))); drawBuy(); return; }
      if (e.target.closest('[data-buy]')) { addToCart(p, qty, $('#gal .gslide') || $('#gal')); qty = 1; drawBuy(); }
    };
    $('#pbuy').addEventListener('click', onClick); $('#buybar').addEventListener('click', onClick);
    const onCart = () => drawBuy(); listeners.add(onCart); onLeave(() => listeners.delete(onCart));
    livePdp = { id: p.id, update(np) { Object.assign(p, np); drawBuy(); $('.gal-w .tags').innerHTML = tagsHtml(p); } };
    onLeave(() => { livePdp = null; });

    // gallery
    const gal = $('#gal');
    if (imgs.length > 1) {
      const sl = $$('.gslide', gal), dots = $$('.gal-w .dots i'), th = $$('.thumbs button'), n = $('#gal-n');
      let cur = 0;
      const mark = (i) => { cur = i; dots.forEach((d, j) => d.classList.toggle('on', j === i)); th.forEach((t, j) => t.classList.toggle('on', j === i)); if (n) n.textContent = `${i + 1} / ${imgs.length}`; };
      const io = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting && x.intersectionRatio > 0.6) mark(Number(x.target.dataset.i)); }), { root: gal, threshold: [0.6] });
      sl.forEach((s) => io.observe(s)); onLeave(() => io.disconnect());
      const show = (i) => { i = (i + sl.length) % sl.length; gal.scrollTo({ left: sl[i].offsetLeft - gal.offsetLeft * 0, behavior: behavior() }); sl[i].scrollIntoView({ inline: 'center', block: 'nearest', behavior: behavior() }); mark(i); };
      th.forEach((t) => t.addEventListener('click', () => show(Number(t.dataset.go))));
      gal.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); show(cur + 1); } if (e.key === 'ArrowRight') { e.preventDefault(); show(cur - 1); } });
      gal.addEventListener('click', () => openLightbox(imgs, cur, p.name));
    } else if (imgs.length) gal.addEventListener('click', () => openLightbox(imgs, 0, p.name));
    // floating header turns solid after gallery
    const top = $('#top');
    const io2 = new IntersectionObserver(([en]) => top.classList.toggle('solid', !en.isIntersecting), { rootMargin: `-${(top.offsetHeight || 56) + 10}px 0px 0px 0px` });
    io2.observe($('.gal-w')); onLeave(() => io2.disconnect());
    // share
    const sh = $('#share-ib');
    const doShare = async () => {
      const url = location.origin + prodHref(p);
      if (navigator.share) { try { await navigator.share({ title: p.name, text: `${p.name} — ${money(p.price)}`, url }); } catch { /* cancelled */ } return; }
      const ok = await copyText(url); toast(ok ? 'تم نسخ رابط المنتج' : 'تعذر النسخ', { type: ok ? 'ok' : 'err' });
    };
    sh.onclick = doShare; onLeave(() => { sh.onclick = null; });
  }
  let livePdp = null;

  function openLightbox(imgs, start, name) {
    const tr = $('#lb-track'), n = $('#lb-n');
    tr.innerHTML = imgs.map((im, i) => `<div class="lb-s" data-i="${i}"><img src="${esc(mediaUrl(im))}" alt="${esc(name)} — ${i + 1}"></div>`).join('');
    Layer.open('lb');
    const sl = $$('.lb-s', tr);
    requestAnimationFrame(() => sl[start] && sl[start].scrollIntoView({ inline: 'center', block: 'nearest' }));
    n.textContent = imgs.length > 1 ? `${start + 1} / ${imgs.length}` : '';
    const io = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting && x.intersectionRatio > 0.6 && imgs.length > 1) n.textContent = `${Number(x.target.dataset.i) + 1} / ${imgs.length}`; }), { root: tr, threshold: [0.6] });
    sl.forEach((s) => io.observe(s));
    let last = 0;
    const zoom = (s, cx, cy) => {
      const on = s.classList.toggle('zoom');
      tr.style.overflowX = on ? 'hidden' : '';
      if (on) requestAnimationFrame(() => { const img = s.querySelector('img'); s.scrollTo((img.offsetWidth - s.clientWidth) * cx, (img.offsetHeight - s.clientHeight) * cy); });
    };
    sl.forEach((s) => {
      s.addEventListener('dblclick', (e) => { const r = s.getBoundingClientRect(); zoom(s, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); });
      s.addEventListener('touchend', (e) => { const t = Date.now(); if (t - last < 280) { const r = s.getBoundingClientRect(), c = e.changedTouches[0]; zoom(s, (c.clientX - r.left) / r.width, (c.clientY - r.top) / r.height); e.preventDefault(); } last = t; });
    });
    Layer.onClose = () => { io.disconnect(); tr.innerHTML = ''; tr.style.overflowX = ''; };
  }

  // ---------- cart ----------
  async function viewCart({ isCurrent }) {
    setTitle('سلة التسوق'); setTop({ title: 'سلة التسوق' });
    if (!Cart.items.length) return setMain(emptyCart());
    setMain(`<div class="cartpage"><div>${skLines(3)}</div></div>`);
    let notes = [];
    try { notes = await syncCart(); } catch (e) { if (!isCurrent()) return; toast(e.message, { type: 'err' }); }
    if (!isCurrent()) return;
    const draw = () => {
      if (!isCurrent()) return;
      if (!Cart.items.length) { setChrome({ tab: true }); return setMain((notes.length ? `<div class="cartpage">${noticeHtml(notes)}</div>` : '') + emptyCart()); }
      const sub = Cart.subtotal(), mo = minOrder(), closed = S.store.ordering && S.store.ordering.enabled === false;
      const blocked = closed || (mo && sub < mo);
      setChrome({ tab: true, pay: true });
      main().innerHTML = `<div class="page" style="animation:none"><div class="phead"><h1>سلة التسوق</h1><p><span class="num">${Cart.count()}</span> قطعة</p></div><div class="cartpage">
        <div>${notes.length ? noticeHtml(notes) : ''}${freeBar(sub)}<div id="citems">${Cart.items.map(cartItemHtml).join('')}</div></div>
        <aside class="cart-side"><div class="sum">
          <div class="sumrow"><span>المجموع الفرعي</span><span>${moneyHtml(sub)}</span></div>
          <div class="sumrow"><span>التوصيل</span><span>${freeOver() && sub >= freeOver() ? '<b style="color:var(--ok)">مجاني</b>' : '<span class="muted">حسب المحافظة</span>'}</span></div>
          <div class="sumrow total"><span>الإجمالي</span><span>${moneyHtml(sub)}</span></div>
        </div>
        ${closed ? `<div class="notice err" style="margin-top:12px">${icon('info')}<span>${esc(S.store.ordering.closed_message)}</span></div>` : mo && sub < mo ? `<div class="notice" style="margin-top:12px">${icon('info')}<span>الحد الأدنى للطلب ${moneyHtml(mo)} — أضيفي ${moneyHtml(mo - sub)}</span></div>` : ''}
        <div class="paybar"><div class="tt"><small>الإجمالي</small><b>${moneyHtml(sub)}</b></div><a class="btn" href="/checkout" ${blocked ? 'aria-disabled="true"' : ''}>إتمام الطلب ${icon('arrow')}</a></div>
        <p class="secure">${icon('cash')} الدفع نقداً عند الاستلام</p>
        </aside></div></div>`;
      markImgs(main());
      notes = [];
    };
    draw();
    listeners.add(draw); onLeave(() => listeners.delete(draw));
  }
  const emptyCart = () => `<div class="empty"><div class="mark">${icon('bag')}</div><h2>سلتكِ فارغة</h2><p>لم تضيفي أي منتج بعد. اكتشفي تشكيلتنا المختارة بعناية.</p><a class="btn" href="/shop">ابدئي التسوق</a></div>`;
  const skLines = (n) => Array.from({ length: n }, () => `<div class="citem"><div class="cm sk"></div><div><div class="sk sk-l w80"></div><div class="sk sk-l w40"></div></div></div>`).join('');
  const noticeHtml = (notes, cls = '') => `<div class="notice ${cls}" role="alert">${icon('info')}<ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
  const cartItemHtml = (i) => {
    const cap = Cart.cap(i);
    return `<div class="citem" data-id="${i.id}">
      ${cm(i.image ? [i.image] : [], i.name, { small: true, href: `/p/${enc(i.slug)}` })}
      <div class="citem-b">
        <div class="citem-t"><a class="citem-n" href="/p/${enc(i.slug)}">${esc(i.name)}</a><button class="rm" data-rm="${i.id}" aria-label="إزالة ${esc(i.name)}">${icon('trash')}</button></div>
        <span class="up">${moneyHtml(i.price)}</span>
        <div class="citem-f">
          <div class="stepper sm" role="group" aria-label="الكمية"><button type="button" data-qty="${i.id}" data-d="1" aria-label="زيادة" ${i.qty >= cap ? 'disabled' : ''}>${icon('plus')}</button><span class="num">${i.qty}</span><button type="button" data-qty="${i.id}" data-d="-1" aria-label="إنقاص" ${i.qty <= 1 ? 'disabled' : ''}>${icon('minus')}</button></div>
          <span class="tot">${moneyHtml(i.qty * i.price)}</span>
        </div>
      </div></div>`;
  };

  // ---------- checkout ----------
  async function viewCheckout({ isCurrent }) {
    setTitle('إتمام الطلب'); setTop({ title: 'إتمام الطلب' }); setChrome({ tab: false });
    const ord = S.store.ordering || {};
    if (ord.enabled === false) return setMain(`<div class="empty"><div class="mark">${icon('clock')}</div><h2>الطلبات متوقفة مؤقتاً</h2><p>${esc(ord.closed_message || '')}</p><a class="btn line" href="/shop">تصفّحي المنتجات</a></div>`);
    if (!Cart.items.length) return setMain(emptyCart());
    setMain(`<div class="co">${skLines(2)}</div>`);
    let notes = [];
    try { notes = await syncCart(); } catch (e) { if (!isCurrent()) return; toast(e.message, { type: 'err' }); }
    if (!isCurrent()) return;
    if (!Cart.items.length) return setMain((notes.length ? `<div class="co">${noticeHtml(notes)}</div>` : '') + emptyCart());
    const c = store.get('tq_customer', {}) || {};
    let gov = c.governorate && (S.store.governorates || []).includes(c.governorate) ? c.governorate : '';
    setChrome({ tab: false, pay: true });
    setMain(`<form class="co" id="co" novalidate>
      <div class="co-main">
        ${notes.length ? noticeHtml(notes) : ''}
        <details class="co-card co-sum" id="co-sum"><summary></summary><div id="co-mini"></div></details>
        <div class="co-card"><h2><i>1</i> معلومات التواصل</h2>
          <div class="fields two">
            <div class="field"><label for="f-name">الاسم الكامل</label><input id="f-name" name="name" autocomplete="name" maxlength="80" value="${esc(c.name || '')}" required><small class="err"></small></div>
            <div class="field"><label for="f-phone">رقم الهاتف <small>(نتواصل معكِ عليه)</small></label><input id="f-phone" name="phone" type="tel" inputmode="tel" dir="ltr" autocomplete="tel" placeholder="07XX XXX XXXX" maxlength="20" value="${esc(c.phone || '')}" required><small class="err"></small></div>
          </div>
        </div>
        <div class="co-card"><h2><i>2</i> عنوان التوصيل</h2>
          <div class="fields two">
            <div class="field"><label>المحافظة</label><button type="button" class="pick" id="f-gov" aria-haspopup="dialog"></button><input type="hidden" name="governorate" value="${esc(gov)}"><small class="err"></small></div>
            <div class="field"><label for="f-city">المدينة / المنطقة</label><input id="f-city" name="city" autocomplete="address-level2" maxlength="80" placeholder="مثال: الكرادة" value="${esc(c.city || '')}"></div>
            <div class="field full"><label for="f-addr">أقرب نقطة دالة والعنوان</label><input id="f-addr" name="address" autocomplete="street-address" maxlength="300" placeholder="المحلة، الزقاق، الدار، أقرب نقطة دالة" value="${esc(c.address || '')}" required><small class="err"></small></div>
            <div class="field full"><label for="f-notes">ملاحظات <small>(اختياري)</small></label><textarea id="f-notes" name="notes" maxlength="500" placeholder="وقت مناسب للتوصيل، أو أي تفاصيل أخرى"></textarea></div>
          </div>
        </div>
        <div class="co-card"><h2><i>3</i> طريقة الدفع</h2>
          <div class="pay">${icon('cash')}<div><b>الدفع نقداً عند الاستلام</b><span>ادفعي عند وصول الطلب إلى باب بيتكِ</span></div><span class="radio" aria-hidden="true"></span></div>
        </div>
        <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
      </div>
      <div class="co-side">
        <div class="co-card" id="co-sum2" style="display:none"></div>
        <div id="co-err"></div>
        <div class="paybar"><div class="tt"><small>الإجمالي</small><b id="pb-total"></b></div><button class="btn" type="submit" id="place">تأكيد الطلب</button></div>
        <p class="secure">${icon('lock')} بياناتكِ تُستخدم فقط لتوصيل طلبكِ</p>
      </div>
    </form>`);

    const form = $('#co'), btn = $('#place');
    const govBtn = $('#f-gov'), govIn = form.elements.governorate;
    const drawGov = () => { govBtn.innerHTML = gov ? `<span>${esc(gov)}</span><small>${deliveryFor(gov, Cart.subtotal()) === 0 ? 'توصيل مجاني' : moneyHtml(deliveryFor(gov, Cart.subtotal()))}</small>${icon('down')}` : `<span class="ph-t">اختاري المحافظة</span>${icon('down')}`; govIn.value = gov; };
    const miniHtml = () => {
      const sub = Cart.subtotal(), fee = deliveryFor(gov, sub);
      return `<div class="mini">${Cart.items.map((i) => `<div class="mini-i"><div class="cm">${ph(i.name, true)}${imgTag(i.image, '')}<span class="q num">${i.qty}</span></div><span class="n">${esc(i.name)}</span><span class="p">${moneyHtml(i.price * i.qty)}</span></div>`).join('')}</div>
        ${freeBar(sub)}
        <div class="sumrow"><span>المجموع الفرعي</span><span>${moneyHtml(sub)}</span></div>
        <div class="sumrow"><span>التوصيل${gov ? ` (${esc(gov)})` : ''}</span><span>${fee === null ? '<span class="muted">اختاري المحافظة</span>' : fee === 0 ? '<b style="color:var(--ok)">مجاني</b>' : moneyHtml(fee)}</span></div>
        <div class="sumrow total"><span>الإجمالي عند الاستلام</span><span>${moneyHtml(sub + (fee || 0))}</span></div>
        <a class="link" href="/cart" style="margin:6px 0 10px">تعديل السلة</a>`;
    };
    const drawSum = () => {
      const sub = Cart.subtotal(), fee = deliveryFor(gov, sub), mo = minOrder();
      $('#co-sum summary').innerHTML = `<span class="l">${icon('bag')}<span>ملخص الطلب (<span class="num">${Cart.count()}</span>)</span>${icon('down', 'chev')}</span><b>${moneyHtml(sub + (fee || 0))}</b>`;
      $('#co-mini').innerHTML = miniHtml();
      $('#pb-total').innerHTML = moneyHtml(sub + (fee || 0));
      markImgs(form);
      btn.disabled = !!(mo && sub < mo);
      if (mo && sub < mo) $('#co-err').innerHTML = noticeHtml([`الحد الأدنى للطلب ${money(mo)}`]);
      drawGov();
    };
    if (isDesk()) $('#co-sum').open = true;
    drawSum();
    govBtn.addEventListener('click', () => {
      const sub = Cart.subtotal();
      const govs = (S.store.governorates || []).slice().sort((a, b) => (a === 'بغداد' ? -1 : b === 'بغداد' ? 1 : 0));
      const el = sheet({
        title: 'اختاري المحافظة',
        body: `<input class="inp" id="gq" placeholder="ابحثي عن المحافظة" style="margin-bottom:8px" autocomplete="off"><div class="govs" id="govs">${govs.map((g) => { const fee = deliveryFor(g, sub); return `<button type="button" class="gov ${g === gov ? 'on' : ''}" data-g="${esc(g)}"><span>${esc(g)}</span><small>${fee === 0 ? 'مجاني' : moneyHtml(fee)}</small></button>`; }).join('')}</div>`,
      });
      $('#gq', el).addEventListener('input', (e) => { const v = e.target.value.trim(); $$('.gov', el).forEach((b) => { b.style.display = !v || b.dataset.g.includes(v) ? '' : 'none'; }); });
      $$('.gov', el).forEach((b) => b.addEventListener('click', () => { gov = b.dataset.g; drawSum(); check('governorate'); Layer.close(); setTimeout(() => form.elements.city.focus({ preventScroll: true }), 350); }));
    });
    const onCart = () => { if (!isCurrent()) return; if (!Cart.items.length) { render({ restore: false }); return; } drawSum(); };
    listeners.add(onCart); onLeave(() => listeners.delete(onCart));

    const rules = {
      name: (v) => (v.trim().length < 2 ? 'يرجى كتابة الاسم الكامل' : ''),
      phone: (v) => (!v.trim() ? 'يرجى كتابة رقم الهاتف' : !phoneOk(v) ? 'رقم غير صحيح — يبدأ بـ 07 ويتكوّن من 11 رقماً' : ''),
      governorate: (v) => (!v ? 'يرجى اختيار المحافظة' : ''),
      address: (v) => (v.trim().length < 4 ? 'يرجى كتابة العنوان بالتفصيل' : ''),
    };
    let tried = false;
    const check = (name) => {
      const el = form.elements[name], msg = rules[name](el.value), box = el.closest('.field');
      box.classList.toggle('bad', !!msg); box.querySelector('.err').textContent = msg;
      if (el.type !== 'hidden') el.setAttribute('aria-invalid', !!msg);
      return !msg;
    };
    ['name', 'phone', 'address'].forEach((n) => {
      const el = form.elements[n];
      el.addEventListener('blur', () => { if (tried || el.value) check(n); });
      el.addEventListener('input', () => { if (el.closest('.field').classList.contains('bad')) check(n); });
    });
    form.elements.phone.addEventListener('blur', (e) => { const n = normPhone(e.target.value); if (/^07\d{9}$/.test(n)) e.target.value = n; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      tried = true;
      const ok = Object.keys(rules).map(check).every(Boolean);
      $('#co-err').innerHTML = '';
      if (!ok) {
        const bad = form.querySelector('.field.bad');
        if (bad) { bad.scrollIntoView({ block: 'center', behavior: behavior() }); const i = bad.querySelector('input:not([type=hidden]), .pick'); i && i.focus({ preventScroll: true }); }
        vibrate(30);
        return;
      }
      const data = Object.fromEntries(new FormData(form));
      const payload = { name: data.name.trim(), phone: normPhone(data.phone), governorate: gov, city: data.city.trim(), address: data.address.trim(), notes: data.notes.trim(), items: Cart.items.map((i) => ({ id: i.id, qty: i.qty })), website: data.website || '' };
      btn.classList.add('loading'); btn.disabled = true;
      try {
        const r = await api('/api/orders', { method: 'POST', body: payload });
        store.set('tq_customer', { name: payload.name, phone: payload.phone, governorate: payload.governorate, city: payload.city, address: payload.address });
        const items = Cart.items.map(({ id, name, qty, price, image }) => ({ id, name, qty, price, total: price * qty, image }));
        sstore.set('tq_last_order', { ...r, phone: payload.phone, items, governorate: payload.governorate, history: [{ status: 'new', at: r.created_at, label: r.status_label }] });
        MyOrders.add(r.token);
        Cart.clear();
        vibrate([20, 40, 20]);
        go('/order/' + enc(r.no), { replace: true });
      } catch (err) {
        if (!isCurrent()) return;
        $('#co-err').innerHTML = noticeHtml([err.message], 'err');
        $('#co-err').scrollIntoView({ block: 'center', behavior: behavior() });
        btn.classList.remove('loading'); btn.disabled = false;
        if (/المخزون|المتوفرة|متوفراً/.test(err.message)) { try { const n = await syncCart(); if (n.length) $('#co-err').insertAdjacentHTML('beforeend', noticeHtml(n)); drawSum(); } catch { /* */ } }
      }
    });
  }

  // my order tokens (for live status notifications)
  const MyOrders = {
    get() { const v = store.get('tq_orders', []); return Array.isArray(v) ? v : []; },
    add(t) { if (t) store.set('tq_orders', [t, ...this.get().filter((x) => x !== t)].slice(0, 50)); },
    has(t) { return this.get().includes(t); },
  };

  // ---------- order confirmation ----------
  async function viewOrderDone({ params, isCurrent }) {
    const no = params[0].toUpperCase();
    setTitle(`الطلب ${no}`); setTop({ title: 'تم الطلب' });
    const last = sstore.get('tq_last_order', null);
    const mine = last && last.no === no ? last : null;
    const st = S.store.store, wa = waNumber(st.whatsapp);
    const waMsg = mine ? `مرحباً، قمت بطلب من الموقع\nرقم الطلب: ${no}\n${mine.items.map((i) => `• ${i.name} × ${i.qty}`).join('\n')}\nالإجمالي: ${money(mine.total)}` : `مرحباً، استفسار عن الطلب ${no}`;
    setMain(`<div class="done-w">
      <div class="seal">${icon('check')}</div>
      <h1>شكراً لكِ، تم استلام طلبكِ</h1>
      <p>سنتواصل معكِ قريباً لتأكيد الطلب قبل الشحن. يمكنكِ متابعة طلبكِ في أي وقت من «طلباتي» برقم هاتفكِ فقط.</p>
      <div class="orderno"><div><small>رقم الطلب</small><b>${esc(no)}</b></div><button type="button" id="copy">${icon('copy')}<span>نسخ</span></button></div>
      <div class="co-card" style="text-align:start" id="obox">${mine ? orderDetail(mine) : '<div class="sk sk-l w60"></div><div class="sk sk-l w80"></div>'}</div>
      <div class="done-acts">
        <a class="btn" href="/orders">${icon('receipt')} متابعة طلباتي</a>
        ${wa ? `<a class="btn wa" href="https://wa.me/${wa}?text=${enc(waMsg)}" target="_blank" rel="noopener">${icon('whatsapp')} تأكيد سريع عبر واتساب</a>` : ''}
        <a class="btn line" href="/shop">متابعة التسوق</a>
      </div>
    </div>`);
    if (mine && !reduceMotion) confetti();
    $('#copy').addEventListener('click', async (e) => {
      const ok = await copyText(no);
      toast(ok ? 'تم نسخ رقم الطلب' : 'تعذر النسخ', { type: ok ? 'ok' : 'err' });
      if (ok) { const s = e.currentTarget.querySelector('span'); s.textContent = 'تم'; setTimeout(() => (s.textContent = 'نسخ'), 2000); }
    });
    const phone = mine ? mine.phone : (store.get('tq_customer', {}) || {}).phone;
    if (phone) {
      try {
        const r = await api(`/api/orders/by-phone?phone=${enc(phone)}`);
        const o = r.orders.find((x) => x.no === no);
        if (o && isCurrent()) { $('#obox').innerHTML = orderDetail(o); markImgs($('#obox')); liveOrder = { token: o.token, refresh: () => render({ restore: true }) }; onLeave(() => { liveOrder = null; }); }
        return;
      } catch { /* */ }
    }
    if (isCurrent() && !mine) $('#obox').innerHTML = '<p class="muted" style="text-align:center">تابعي حالة طلبكِ من «طلباتي» برقم الهاتف المستخدم عند الطلب.</p>';
  }
  let liveOrder = null;
  function confetti() {
    const box = document.createElement('div'); box.className = 'confetti';
    const colors = ['#6b1d3a', '#b08d57', '#e2cfa9', '#a2496b', '#2a0c17'];
    box.innerHTML = Array.from({ length: 46 }, () => `<i style="left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation-duration:${1.6 + Math.random() * 1.6}s;animation-delay:${Math.random() * 0.5}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
    document.body.appendChild(box); setTimeout(() => box.remove(), 4000);
  }

  // ---------- my orders (track by phone only) ----------
  const STEPS = [['new', 'تم استلام الطلب', 'clock'], ['confirmed', 'تم تأكيد الطلب', 'check'], ['shipping', 'في الطريق إليكِ', 'truck'], ['delivered', 'تم التسليم', 'home']];
  const OPEN = ['new', 'confirmed', 'shipping'];
  const SLABEL = { new: 'جديد', confirmed: 'مؤكد', shipping: 'في الطريق', delivered: 'تم التسليم', cancelled: 'ملغي' };
  function timeline(o) {
    const hist = o.history || [];
    const at = (s) => { const h = hist.filter((x) => x.status === s).pop(); return h ? h.at : null; };
    if (o.status === 'cancelled') return `<div class="cancel-box">${icon('xcircle')}<div><b>تم إلغاء هذا الطلب</b><span>${at('cancelled') ? esc(fmtDay(at('cancelled'))) + ' · ' : ''}للاستفسار يرجى التواصل معنا.</span></div></div>`;
    const idx = STEPS.findIndex(([s]) => s === o.status);
    return `<ol class="tl">${STEPS.map(([s, l, ic], i) => {
      const done = i < idx || (i === idx && s === 'delivered'), cur = i === idx && !done, t = at(s);
      return `<li class="${done ? 'done' : cur ? 'cur' : ''}"><span class="d">${icon(done ? 'check' : ic)}</span><div><b>${l}</b>${t ? `<small>${esc(fmtDay(t))}</small>` : ''}</div></li>`;
    }).join('')}</ol>`;
  }
  const itemRow = (i) => `<li>${cm(i.image ? [i.image] : [], i.name, { small: true })}<div>${esc(i.name)}<br><small>${moneyHtml(i.price)} × <span class="num">${i.qty}</span></small></div><span class="p">${moneyHtml(i.total != null ? i.total : i.price * i.qty)}</span></li>`;
  const orderDetail = (o) => `
    ${timeline(o)}
    <ul class="titems" style="margin:16px 0 8px">${(o.items || []).map(itemRow).join('')}</ul>
    <div class="sumrow"><span>المجموع الفرعي</span><span>${moneyHtml(o.subtotal)}</span></div>
    <div class="sumrow"><span>التوصيل${o.governorate ? ` (${esc(o.governorate)})` : ''}</span><span>${Number(o.delivery_fee) ? moneyHtml(o.delivery_fee) : 'مجاني'}</span></div>
    <div class="sumrow total"><span>الإجمالي عند الاستلام</span><span>${moneyHtml(o.total)}</span></div>`;

  async function viewOrders({ q, isCurrent }) {
    setTitle('طلباتي'); setTop({ title: 'طلباتي' });
    const saved = q.get('phone') || store.get('tq_phone', '') || (store.get('tq_customer', {}) || {}).phone || '';
    let filter = 'all', orders = null, phone = saved;
    setMain(`<div class="track-w">
      <div class="phead"><h1>طلباتي</h1><p>اكتبي رقم هاتفكِ لعرض كل طلباتكِ الجديدة والسابقة وحالة كل طلب.</p></div>
      <form class="co" id="tf" novalidate style="padding-bottom:6px">
        <div class="co-card"><div class="track-f">
          <div class="field"><label for="t-ph">رقم الهاتف المستخدم عند الطلب</label><input id="t-ph" name="phone" type="tel" inputmode="tel" dir="ltr" placeholder="07XX XXX XXXX" value="${esc(saved)}" autocomplete="tel" required><small class="err"></small></div>
          <button class="btn block" type="submit" id="tbtn">${icon('search')} عرض طلباتي</button>
        </div></div>
      </form>
      <div id="tres" aria-live="polite"></div>
    </div>`);
    const form = $('#tf'), res = $('#tres'), btn = $('#tbtn');
    const draw = () => {
      if (!orders) return;
      if (!orders.length) { res.innerHTML = `<div class="empty" style="padding-top:20px"><div class="mark">${icon('receipt')}</div><h2>لا توجد طلبات</h2><p>لم نجد طلبات مرتبطة بهذا الرقم. تأكدي من الرقم المستخدم عند الطلب.</p><a class="btn" href="/shop">ابدئي التسوق</a></div>`; return; }
      const cnt = { all: orders.length, open: orders.filter((o) => OPEN.includes(o.status)).length, delivered: orders.filter((o) => o.status === 'delivered').length, cancelled: orders.filter((o) => o.status === 'cancelled').length };
      const list = orders.filter((o) => filter === 'all' || (filter === 'open' ? OPEN.includes(o.status) : o.status === filter));
      res.innerHTML = `<div class="chips">${[['all', 'الكل'], ['open', 'الحالية'], ['delivered', 'المُسلّمة'], ['cancelled', 'الملغاة']].filter(([k]) => k === 'all' || cnt[k]).map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-of="${k}">${l} <small class="num">${cnt[k]}</small></button>`).join('')}<span class="livepill" style="margin-inline-start:auto;align-self:center">مباشر</span></div>
        <div style="padding:0 var(--gut)">${list.length ? list.map((o) => `<details class="ocard" ${list.length === 1 || o.status !== 'delivered' && o === list[0] ? 'open' : ''}>
          <summary style="list-style:none;cursor:pointer"><div class="ocard-h"><div><b>${esc(o.no)}</b><small>${esc(ago(o.created_at))} · <span class="num">${o.items.reduce((a, i) => a + i.qty, 0)}</span> قطعة</small></div><span class="pill ${esc(o.status)}">${esc(SLABEL[o.status] || o.status_label)}</span></div>
            <div class="ocard-f"><div class="thumbs-row">${o.items.slice(0, 4).map((i) => cm(i.image ? [i.image] : [], i.name, { small: true })).join('')}</div><b>${moneyHtml(o.total)}</b></div></summary>
          <div style="padding-top:6px">${orderDetail(o)}</div></details>`).join('') : '<p class="muted" style="text-align:center;padding:20px">لا توجد طلبات في هذا التصنيف</p>'}</div>`;
      markImgs(res);
      $$('[data-of]', res).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.of; draw(); }));
    };
    const run = async ({ quiet = false } = {}) => {
      const f = form.elements.phone.closest('.field');
      const ok = phoneOk(form.elements.phone.value);
      f.classList.toggle('bad', !ok); f.querySelector('.err').textContent = ok ? '' : 'رقم الهاتف غير صحيح — يبدأ بـ 07 ويتكوّن من 11 رقماً';
      if (!ok) return;
      phone = normPhone(form.elements.phone.value); form.elements.phone.value = phone;
      if (!quiet) { btn.classList.add('loading'); btn.disabled = true; if (!orders) res.innerHTML = `<div style="padding:0 var(--gut)">${skLines(2)}</div>`; }
      try {
        const r = await api(`/api/orders/by-phone?phone=${enc(phone)}`);
        if (!isCurrent()) return;
        orders = r.orders;
        store.set('tq_phone', phone);
        orders.forEach((o) => MyOrders.add(o.token));
        draw();
      } catch (e) {
        if (!isCurrent()) return;
        if (!quiet) res.innerHTML = `<div style="padding:0 var(--gut)">${noticeHtml([e.message], 'err')}</div>`;
      } finally { btn.classList.remove('loading'); btn.disabled = false; }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); form.elements.phone.blur(); run(); });
    liveOrder = { any: true, refresh: () => { if (orders) run({ quiet: true }); } };
    onLeave(() => { liveOrder = null; });
    if (saved && phoneOk(saved)) run();
  }

  // ---------- wishlist ----------
  async function viewWishlist({ isCurrent }) {
    setTitle('المفضلة'); setTop({ title: 'المفضلة' });
    const empty = () => `<div class="empty"><div class="mark">${icon('heart')}</div><h2>قائمة المفضلة فارغة</h2><p>اضغطي على القلب في أي منتج لحفظه هنا والعودة إليه لاحقاً.</p><a class="btn" href="/shop">تصفّحي المنتجات</a></div>`;
    if (!Fav.ids.length) return setMain(empty());
    setMain(`<div class="phead"><h1>المفضلة</h1><p><span class="num">${Fav.ids.length}</span> منتج محفوظ</p></div><div class="grid">${skCards(4)}</div>`);
    const r = await api(`/api/products?ids=${Fav.ids.slice(0, 100).join(',')}&limit=100`);
    if (!isCurrent()) return;
    remember_(r.items);
    const byId = new Map(r.items.map((p) => [p.id, p]));
    const list = Fav.ids.map((id) => byId.get(id)).filter(Boolean);
    if (!list.length) return setMain(empty());
    setMain(`<div class="phead"><h1>المفضلة</h1><p><span class="num">${list.length}</span> منتج محفوظ</p></div><div class="grid" id="wgrid">${list.map((p) => card(p)).join('')}</div>
      ${list.some((p) => p.in_stock && !Cart.qty(p.id)) ? `<div style="padding:20px var(--gut) 0;max-width:var(--wrap);margin:0 auto"><button class="btn line block" id="addall">${icon('bag')} أضيفي كل المتوفر إلى السلة</button></div>` : ''}`);
    const aa = $('#addall');
    if (aa) aa.addEventListener('click', () => { let n = 0; list.filter((p) => p.in_stock && !Cart.qty(p.id)).forEach((p) => { n += Cart.add(p, 1) ? 1 : 0; }); vibrate(); toast(`أُضيف ${n} منتج إلى السلة`, { link: '/cart', linkText: 'السلة' }); aa.remove(); });
  }

  // ---------- content pages ----------
  function viewAbout() {
    setTitle('من نحن'); setTop({ title: 'من نحن' });
    const st = S.store.store, about = String(S.store.about || '').trim();
    setMain(`<div class="prose-w">
      <div class="about-art">${icon('crown')}<span>${esc(String(st.name).toUpperCase())}</span>${st.tagline ? `<small>${esc(st.tagline)}</small>` : ''}</div>
      ${about ? `<p class="prose">${esc(about)}</p>` : ''}
      <div class="vals">
        <div class="val"><span class="ic">${icon('seal')}</span><div><h3>أصالة مضمونة</h3><p>نختار منتجاتنا من مصادر موثوقة لتحصلي على الجودة التي تستحقينها.</p></div></div>
        <div class="val"><span class="ic">${icon('sparkle')}</span><div><h3>اختيار بعناية</h3><p>تشكيلة منتقاة من العطور ومستحضرات التجميل والعناية تناسب ذوقكِ.</p></div></div>
        <div class="val"><span class="ic">${icon('truck')}</span><div><h3>خدمة تليق بكِ</h3><p>توصيل لكل المحافظات، دفع عند الاستلام، وفريق جاهز لخدمتكِ.</p></div></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="/shop">تسوّقي التشكيلة</a><a class="btn line" href="/contact">تواصلي معنا</a></div>
    </div>`);
  }
  function viewPolicies() {
    setTitle('السياسات'); setTop({ title: 'الدفع والتوصيل والاستبدال' });
    const lines = String(S.store.policies || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const d = dlv(), fees = d.fees || {};
    const custom = Object.entries(fees).filter(([, v]) => v !== '' && v != null);
    setMain(`<div class="prose-w">
      <div class="phead" style="padding:0"><h1>سياساتنا</h1><p>كل ما تحتاجين معرفته عن الدفع والتوصيل والاستبدال</p></div>
      ${lines.length ? `<ol class="pol">${lines.map((l) => `<li><span>${esc(l)}</span></li>`).join('')}</ol>` : ''}
      <div class="sum"><h2>أجور التوصيل</h2>
        <div class="sumrow"><span>داخل بغداد</span><span>${moneyHtml(d.baghdad)}</span></div>
        <div class="sumrow"><span>باقي المحافظات</span><span>${moneyHtml(d.other)}</span></div>
        ${custom.filter(([g]) => g !== 'بغداد').map(([g, v]) => `<div class="sumrow"><span>${esc(g)}</span><span>${moneyHtml(v)}</span></div>`).join('')}
        ${freeOver() ? `<div class="sumrow"><span>توصيل مجاني للطلبات من</span><span>${moneyHtml(freeOver())}</span></div>` : ''}
        ${minOrder() ? `<div class="sumrow"><span>الحد الأدنى للطلب</span><span>${moneyHtml(minOrder())}</span></div>` : ''}
        <div class="sumrow"><span>طريقة الدفع</span><span>نقداً عند الاستلام</span></div>
      </div>
    </div>`);
  }
  function viewContact() {
    setTitle('تواصلي معنا'); setTop({ title: 'تواصلي معنا' });
    const st = S.store.store, wa = waNumber(st.whatsapp);
    const items = [];
    const it = (href, ic, label, value, ext, cls = '') => items.push(`<${href ? `a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}` : 'div'} class="contact-i ${cls}"><span class="ic">${icon(ic)}</span><div><small>${label}</small><b>${value}</b></div>${href ? icon('left') : ''}</${href ? 'a' : 'div'}>`);
    if (wa) it(`https://wa.me/${wa}`, 'whatsapp', 'واتساب — الأسرع للرد', `<span class="ltr">${esc(st.whatsapp)}</span>`, true, 'wa');
    if (st.phone) it(`tel:${normPhone(st.phone) || st.phone}`, 'phone', 'اتصال هاتفي', `<span class="ltr">${esc(st.phone)}</span>`);
    if (st.instagram) it(social('instagram', st.instagram), 'instagram', 'انستغرام', `<span class="ltr">${esc(st.instagram.replace(/^https?:\/\/(www\.)?/, ''))}</span>`, true);
    if (st.facebook) it(social('facebook', st.facebook), 'facebook', 'فيسبوك', `<span class="ltr">${esc(st.facebook.replace(/^https?:\/\/(www\.)?/, ''))}</span>`, true);
    if (st.tiktok) it(social('tiktok', st.tiktok), 'tiktok', 'تيك توك', `<span class="ltr">${esc(st.tiktok.replace(/^https?:\/\/(www\.)?/, ''))}</span>`, true);
    if (st.email) it(`mailto:${st.email}`, 'mail', 'البريد الإلكتروني', esc(st.email));
    if (st.address) it('', 'pin', 'العنوان', esc(st.address));
    setMain(`<div class="prose-w">
      <div class="phead" style="padding:0"><h1>يسعدنا تواصلكِ</h1><p>لأي استفسار عن المنتجات أو الطلبات، فريقنا بانتظاركِ.</p></div>
      ${items.length ? `<div class="contacts">${items.join('')}</div>` : '<div class="empty"><p>لم تتم إضافة معلومات التواصل بعد.</p></div>'}
      <a class="contact-i" href="/orders"><span class="ic">${icon('receipt')}</span><div><small>لديكِ طلب؟</small><b>تتبّعي طلباتكِ برقم الهاتف</b></div>${icon('left')}</a>
    </div>`);
  }
  function viewNotFound({ msg } = {}) {
    setTitle('الصفحة غير موجودة'); setTop({ title: 'غير موجود' });
    setMain(`<div class="nf"><span class="big">404</span><h1>الصفحة غير موجودة</h1><p>${esc(msg || 'عذراً، لم نتمكن من العثور على الصفحة التي تبحثين عنها.')}</p><div class="acts"><a class="btn" href="/shop">تصفّحي المتجر</a><a class="btn line" href="/">الرئيسية</a></div></div>`);
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch {
      try { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
    }
  }

  // ================= live updates (SSE) =================
  let liveIds = new Set(), liveAll = false;
  const refreshLive = debounce(async () => {
    const ids = new Set(liveAll ? [] : liveIds);
    const all = liveAll; liveIds = new Set(); liveAll = false;
    const visible = new Set($$('.card[data-pid]').map((el) => Number(el.dataset.pid)));
    if (livePdp) visible.add(livePdp.id);
    Cart.items.forEach((i) => visible.add(i.id));
    const want = [...visible].filter((id) => all || ids.has(id)).slice(0, 100);
    try {
      if (want.length) {
        const r = await api(`/api/products?ids=${want.join(',')}&limit=100`);
        const got = new Map(r.items.map((p) => [p.id, p]));
        patchCards(r.items);
        if (livePdp && got.has(livePdp.id)) livePdp.update(got.get(livePdp.id));
        if (Cart.items.some((i) => want.includes(i.id))) {
          const notes = await syncCart({ quiet: true });
          if (notes.length && !/^\/(cart|checkout)/.test(curPath())) toast(notes[0], { link: '/cart', linkText: 'السلة', ms: 4500 });
          else if (notes.length) changed();
        }
      }
      if (all) { const s = await api('/api/store'); applyStore(s, { quiet: true }); }
    } catch { /* offline — next event will retry */ }
  }, 700);
  function applyStore(s, { quiet } = {}) {
    S.store = s; S.store.store = s.store || {}; S.store.store.name = S.store.store.name || 'The Queen';
    S.currency = S.store.store.currency || 'د.ع'; S.cats = s.categories || []; S.brands = s.brands || [];
    if (quiet) { renderAnnounce(); renderFooter(); if (!$('#annc').innerHTML || !$('#top').classList.contains('pg')) $('#annc').hidden = !$('#annc').innerHTML; }
  }
  function startLive() {
    if (!window.EventSource) return;
    let es, retry = 0;
    const open = () => {
      es = new EventSource('/api/live');
      es.onopen = () => { retry = 0; };
      es.addEventListener('catalog', (e) => {
        let d = {}; try { d = JSON.parse(e.data); } catch { /* */ }
        if (Array.isArray(d.ids) && d.ids.length) d.ids.forEach((id) => liveIds.add(id)); else liveAll = true;
        refreshLive();
      });
      es.addEventListener('store', async () => {
        try {
          const s = await api('/api/store');
          const ordering = JSON.stringify(S.store.ordering), dl = JSON.stringify(S.store.delivery);
          applyStore(s, { quiet: true });
          if (JSON.stringify(s.ordering) !== ordering || JSON.stringify(s.delivery) !== dl) { if (/^\/(cart|checkout)/.test(curPath())) changed(); }
        } catch { /* */ }
      });
      es.addEventListener('order', (e) => {
        let d = {}; try { d = JSON.parse(e.data); } catch { return; }
        if (!d.t || !MyOrders.has(d.t)) return;
        vibrate([15, 30, 15]);
        toast(`تحديث على طلبكِ: ${SLABEL[d.status] || d.status}`, { link: '/orders', linkText: 'عرض', ms: 5000 });
        if (liveOrder && (liveOrder.any || liveOrder.token === d.t)) liveOrder.refresh();
      });
      es.onerror = () => {
        if (es.readyState === 2) { es.close(); setTimeout(open, Math.min(30000, 2000 * 2 ** retry++)); }
      };
    };
    open();
    // returning to the tab after a while: refresh what is on screen
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 60000) { liveAll = true; refreshLive(); if (liveOrder) liveOrder.refresh(); }
    });
  }

  // ================= install (PWA) =================
  let deferredInstall = null;
  const canInstall = () => !!deferredInstall;
  function syncInstall() { $$('.install-btn').forEach((b) => b.classList.toggle('hide', !canInstall())); }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; syncInstall(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; syncInstall(); const i = $('#inst'); if (i) i.remove(); toast('تم تثبيت التطبيق 👑'); });
  async function doInstall() {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch { /* */ }
    deferredInstall = null; syncInstall();
  }

  // ================= global events =================
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-install]')) { e.preventDefault(); doInstall(); return; }
    const op = t.closest('[data-open]');
    if (op) { e.preventDefault(); if (op.dataset.open === 'search') openSearch(); else Layer.open(op.dataset.open); return; }
    if (t.closest('[data-back]')) { e.preventDefault(); goBack(); return; }
    if (t.closest('[data-close]') || t.classList.contains('scrim')) { e.preventDefault(); Layer.close(); return; }
    const fv = t.closest('[data-fav]');
    if (fv) { e.preventDefault(); toggleFav(Number(fv.dataset.fav), fv); return; }
    const add = t.closest('[data-add]');
    if (add) {
      e.preventDefault();
      const p = known.get(Number(add.dataset.add));
      if (p) addToCart(p, 1, add.closest('.card') && add.closest('.card').querySelector('.cm'));
      return;
    }
    const qb = t.closest('[data-qty]');
    if (qb) { const id = Number(qb.dataset.qty), it = Cart.find(id); if (it) { Cart.set(id, it.qty + Number(qb.dataset.d)); vibrate(6); } return; }
    const rm = t.closest('[data-rm]');
    if (rm) {
      const id = Number(rm.dataset.rm), row = rm.closest('.citem');
      const doIt = () => { const r = Cart.remove(id); if (r) toast(`أُزيل «${r.it.name}»`, { action: () => Cart.restore(r), actionText: 'تراجع', ms: 4500 }); };
      if (row && !reduceMotion) { row.classList.add('gone'); setTimeout(doIt, 220); } else doIt();
      return;
    }
    const dis = t.closest('[aria-disabled="true"]');
    if (dis) { e.preventDefault(); return; }
    // internal links
    const a = t.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/media/') || url.pathname.startsWith('/api/') || /\.\w{2,5}$/.test(url.pathname)) return;
    e.preventDefault();
    if (url.pathname + url.search === location.pathname + location.search && !Layer.cur) {
      if (url.hash) { const el = document.getElementById(decodeURIComponent(url.hash.slice(1))); if (el) el.scrollIntoView({ behavior: behavior() }); return; }
      window.scrollTo({ top: 0, behavior: behavior() }); return;
    }
    go(url.pathname + url.search + url.hash);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && Layer.cur) Layer.close();
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
  });
  window.addEventListener('popstate', (e) => {
    if (Layer.cur && !(e.state && e.state.layer)) { Layer.hide(); if (e.state && e.state.k === curKey) return; }
    if (e.state && e.state.k === curKey) return;
    render({ restore: true });
  });
  // header hides while scrolling down on mobile; shadow when scrolled
  let lastY = 0, ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY, top = $('#top');
      if (top) {
        top.classList.toggle('edge', y > 4);
        if (!isDesk() && !top.classList.contains('float')) {
          const away = y > 160 && y > lastY + 4;
          if (away) top.classList.add('away'); else if (y < lastY - 6 || y < 120) top.classList.remove('away');
          document.body.classList.toggle('top-away', top.classList.contains('away'));
        }
      }
      lastY = y; ticking = false;
    });
  }, { passive: true });
  window.addEventListener('beforeunload', () => { scrolls[key()] = window.scrollY; sstore.set('tq_scroll', scrolls); });

  // ================= boot =================
  async function boot() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (!history.state || !history.state.k) history.replaceState({ k: Math.random().toString(36).slice(2, 10), d: 0 }, '', location.href);
    else if (history.state.layer) history.replaceState({ k: history.state.k, d: history.state.d || 0 }, '', location.href);
    if (location.pathname === '/track') history.replaceState(history.state, '', '/orders' + location.search);
    Cart.load(); Fav.load();
    let tries = 0;
    for (;;) {
      try { const s = await api('/api/store'); applyStore(s); break; } catch (e) {
        if (++tries >= 3) {
          $('#main').innerHTML = `<div class="nf"><span class="big">Q</span><h1>تعذر تحميل المتجر</h1><p>${esc(e.message)}</p><div class="acts"><button class="btn" onclick="location.reload()">${icon('refresh')} إعادة المحاولة</button></div></div>`;
          return;
        }
        await sleep(800 * tries);
      }
    }
    renderShell();
    await render({ restore: true });
    startLive();
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  boot();
})();
