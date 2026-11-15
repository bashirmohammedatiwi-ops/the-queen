/* The Queen — storefront (vanilla JS, RTL) */
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
  const toLatinDigits = (s) => String(s ?? '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c));
  const normPhone = (p) => {
    let d = toLatinDigits(p).replace(/\D/g, '');
    if (d.startsWith('964')) d = '0' + d.slice(3);
    if (d.length === 10 && d.startsWith('7')) d = '0' + d;
    return d;
  };
  const waNumber = (p) => {
    let d = toLatinDigits(p).replace(/\D/g, '');
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

  // ================= state =================
  const S = { store: null, cats: [], currency: 'د.ع' };
  const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('en-US')} ${S.currency}`;
  const moneyHtml = (n) => `<span class="num">${esc(Math.round(Number(n) || 0).toLocaleString('en-US'))}</span>&nbsp;${esc(S.currency)}`;
  const catById = (id) => S.cats.find((c) => String(c.id) === String(id));
  const catFind = (v) => S.cats.find((c) => String(c.id) === String(v) || c.slug === v);
  const catHref = (c) => `/c/${enc(c.slug)}`;
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
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    arrow: '<path d="M19 12H5m5-5-5 5 5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="1"/><path d="M16 8V5H5v11h3"/>',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.2a10 10 0 0 0 5.8 5.8L16 13l4 1.5v3A2 2 0 0 1 18 19.5 15 15 0 0 1 4.5 6 2 2 0 0 1 6.5 4z"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1"/><path d="m4 6.5 8 6 8-6"/>',
    truck: '<path d="M3 6.5h11v10H3zM14 10h3.5l3 3v3.5H14"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/>',
    seal: '<path d="M12 3.2 14 5l2.7-.3.8 2.6 2.4 1.3-.8 2.6.8 2.6-2.4 1.3-.8 2.6L14 17.4 12 19.2 10 17.4l-2.7.3-.8-2.6-2.4-1.3.8-2.6-.8-2.6 2.4-1.3.8-2.6L10 5z"/><path d="m9 11.3 2 2 4-4"/>',
    cash: '<rect x="3" y="6.5" width="18" height="11" rx="1"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
    swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
    crown: '<path d="M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z"/><path d="M4.5 20.5h15"/>',
    filter: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    box: '<path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9z"/><path d="M4 7.5 12 11.5l8-4M12 11.5v9"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/>',
    xcircle: '<circle cx="12" cy="12" r="8"/><path d="m9.5 9.5 5 5m0-5-5 5"/>',
    home: '<path d="M4 11 12 4.5l8 6.5"/><path d="M6 9.5V19.5h12V9.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="1"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    sparkle: '<path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z"/>',
  };
  const BRAND = {
    whatsapp: '<path fill="currentColor" stroke="none" d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.2 21.8l4.9-1.3A9.8 9.8 0 1 0 12 2.2zm0 17.9a8.1 8.1 0 0 1-4.2-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8.1 8.1 0 1 1 12 20.1zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.3z"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>',
    facebook: '<path d="M14.5 8.5h2.5V5h-2.5A3.5 3.5 0 0 0 11 8.5V11H8.5v3.5H11V21h3.5v-6.5H17l.5-3.5h-3V9a.5.5 0 0 1 .5-.5z"/>',
    tiktok: '<path d="M14 3.5v11.8a3.3 3.3 0 1 1-3.3-3.3"/><path d="M14 3.5c.4 2.6 2 4.2 4.8 4.5"/>',
  };
  const icon = (n, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || BRAND[n] || ''}</svg>`;

  // ================= media helpers =================
  const ph = (name, small) => `<div class="ph${small ? ' small' : ''}" aria-hidden="true"><span class="q">Q</span>${small ? '' : `<span class="n">${esc(name)}</span>`}</div>`;
  const imgTag = (file, alt, cls = '', eager = false) => file ? `<img src="${esc(mediaUrl(file))}" alt="${esc(alt)}" ${cls ? `class="${cls}"` : ''} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` : '';
  const media = (images, name, { small = false, hover = false, eager = false } = {}) => {
    const imgs = (images || []).filter(Boolean);
    return `<div class="media${imgs.length < 2 || !hover ? ' single' : ''}">${ph(name, small)}${imgTag(imgs[0], name, '', eager)}${hover && imgs[1] ? imgTag(imgs[1], '', 'alt') : ''}</div>`;
  };
  // broken images fall back to the placeholder underneath
  document.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.closest('.media, .arch, .thumbs, .banner, figure')) { if (t.closest('.banner, figure')) t.style.visibility = 'hidden'; else t.remove(); } }, true);

  // ================= cart =================
  const Cart = {
    items: [],
    load() { const v = store.get('tq_cart', []); this.items = Array.isArray(v) ? v.filter((i) => i && i.id && i.qty > 0) : []; },
    save() { store.set('tq_cart', this.items); renderBadge(); if (Drawer.isOpen('cart')) renderCartDrawer(); },
    count() { return this.items.reduce((a, i) => a + i.qty, 0); },
    subtotal() { return this.items.reduce((a, i) => a + i.qty * i.price, 0); },
    find(id) { return this.items.find((i) => i.id === id); },
    cap(i) { return i && i.max != null ? Math.max(1, Math.min(99, i.max)) : 10; },
    add(p, qty = 1) {
      let it = this.find(p.id);
      if (!it) { it = { id: p.id, qty: 0, name: p.name, price: p.price, image: (p.images || [])[0] || null, slug: p.slug }; this.items.push(it); }
      Object.assign(it, { name: p.name, price: p.price, image: (p.images || [])[0] || it.image || null, slug: p.slug });
      const cap = this.cap(it), before = it.qty;
      it.qty = Math.min(cap, it.qty + qty);
      this.save();
      return it.qty - before;
    },
    set(id, qty) { const it = this.find(id); if (!it) return; it.qty = Math.max(1, Math.min(this.cap(it), qty)); this.save(); },
    remove(id) { this.items = this.items.filter((i) => i.id !== id); this.save(); },
    clear() { this.items = []; this.save(); },
  };
  window.addEventListener('storage', (e) => { if (e.key === 'tq_cart') { Cart.load(); renderBadge(); if (Drawer.isOpen('cart')) renderCartDrawer(); } });

  async function syncCart() {
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
    }
    Cart.items = next; Cart.save();
    return notes;
  }

  function deliveryFor(gov, subtotal) {
    const d = S.store.delivery || {};
    if (Number(d.free_over) > 0 && subtotal >= Number(d.free_over)) return 0;
    if (!gov) return null;
    if (d.fees && d.fees[gov] != null && d.fees[gov] !== '') return Number(d.fees[gov]) || 0;
    return gov === 'بغداد' ? Number(d.baghdad) || 0 : Number(d.other) || 0;
  }
  const freeOver = () => Number((S.store.delivery || {}).free_over) || 0;
  const minOrder = () => Number((S.store.delivery || {}).min_order) || 0;
  const freeBar = (sub) => {
    const f = freeOver(); if (!f) return '';
    if (sub >= f) return `<div class="free done">${icon('check')} مبروك! حصلتِ على توصيل مجاني<div class="track"><i style="width:100%"></i></div></div>`;
    const pct = Math.max(4, Math.min(100, (sub / f) * 100));
    return `<div class="free">أضيفي <b>${moneyHtml(f - sub)}</b> لتحصلي على توصيل مجاني<div class="track"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
  };

  // ================= toasts =================
  function toast(msg, { type = 'ok', link, linkText, ms = 3200 } = {}) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `${icon(type === 'err' ? 'info' : 'check')}<span>${esc(msg)}</span>${link ? `<a href="${esc(link)}">${esc(linkText || 'عرض')}</a>` : ''}`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
  }

  // ================= layers (drawers, search) =================
  const Drawer = {
    current: null, lastFocus: null,
    isOpen(n) { return this.current === n; },
    open(n) {
      if (this.current && this.current !== n) this.close(true);
      const el = $(`[data-layer="${n}"]`); if (!el) return;
      this.lastFocus = document.activeElement;
      this.current = n;
      if (n === 'cart') renderCartDrawer();
      el.classList.add('on'); el.removeAttribute('aria-hidden');
      $('.scrim').classList.add('on');
      document.documentElement.classList.add('lock');
      const focus = () => { const f = n === 'search' ? $('#q', el) : el.querySelector('[data-close]'); if (f && this.current === n && !el.contains(document.activeElement)) f.focus({ preventScroll: true }); };
      requestAnimationFrame(focus); setTimeout(focus, 120); setTimeout(focus, 400);
    },
    close(silent) {
      if (!this.current) return;
      const el = $(`[data-layer="${this.current}"]`);
      el.classList.remove('on'); el.setAttribute('aria-hidden', 'true');
      this.current = null;
      if (!silent) { $('.scrim').classList.remove('on'); document.documentElement.classList.remove('lock'); this.lastFocus && this.lastFocus.focus && this.lastFocus.focus({ preventScroll: true }); }
    },
  };
  // filter sheet uses the same scrim
  const Sheet = {
    el: null,
    open(el) { this.el = el; el.classList.add('on'); $('.scrim').classList.add('on'); document.documentElement.classList.add('lock'); },
    close() { if (!this.el) return; this.el.classList.remove('on'); this.el = null; $('.scrim').classList.remove('on'); document.documentElement.classList.remove('lock'); },
  };

  // ================= shell =================
  function brandHtml(sub = true) {
    const st = S.store.store;
    if (st.logo) return `<img class="brand-logo" src="${esc(mediaUrl(st.logo))}" alt="${esc(st.name)}">`;
    return `<span class="brand-row"><span class="brand-word">${esc(String(st.name || 'The Queen').toUpperCase())}</span></span>${sub && st.name_ar ? `<span class="brand-sub">${esc(st.name_ar)}</span>` : ''}`;
  }

  function renderShell() {
    const st = S.store.store;
    // announcement
    const an = $('#announce');
    const annText = String(S.store.announcement || '').trim();
    if (annText) {
      an.innerHTML = annText.split(/\s+[—–|•]\s+/).map((t) => `<span>${esc(t)}</span>`).join('<i class="dot" aria-hidden="true"></i>');
      an.hidden = false;
    } else an.hidden = true;

    const cats = S.cats;
    const megaList = cats.map((c) => `<a href="${catHref(c)}">${esc(c.name)}<small class="num">${c.n}</small></a>`).join('');
    $('#header').innerHTML = `
      <div class="wrap header-in">
        <div class="h-start">
          <button class="icon-btn menu-btn" data-open="menu" aria-label="القائمة">${icon('menu')}</button>
          <nav class="nav" aria-label="القائمة الرئيسية">
            <a href="/" data-nav="/">الرئيسية</a>
            <a href="/shop" data-nav="/shop">المتجر</a>
            ${cats.length ? `<div class="nav-dd"><button type="button" aria-expanded="false" aria-haspopup="true">الأقسام ${icon('down')}</button>
              <div class="mega" role="menu"><div class="mega-list">${megaList}</div>
              <div class="mega-side"><span class="serif">Q</span><p>${esc(st.tagline || '')}</p><a class="link" href="/shop">تسوّقي الكل ${icon('arrow')}</a></div></div></div>` : ''}
            <a href="/about" data-nav="/about">من نحن</a>
          </nav>
        </div>
        <div class="h-brand"><a href="/" class="brand" aria-label="${esc(st.name)} — الرئيسية">${brandHtml()}</a></div>
        <div class="h-end">
          <a class="icon-btn track-link" href="/track" aria-label="تتبع الطلب" title="تتبع الطلب">${icon('box')}</a>
          <button class="icon-btn" data-open="search" aria-label="بحث">${icon('search')}</button>
          <button class="icon-btn cart-btn" data-open="cart" aria-label="السلة">${icon('bag')}<span class="badge" aria-hidden="true"></span></button>
        </div>
      </div>`;

    // dropdown: hover on desktop, click toggles
    const dd = $('.nav-dd');
    if (dd) {
      const btn = dd.querySelector('button');
      let t;
      const set = (on) => { dd.classList.toggle('open', on); btn.setAttribute('aria-expanded', on); };
      dd.addEventListener('mouseenter', () => { clearTimeout(t); set(true); });
      dd.addEventListener('mouseleave', () => { t = setTimeout(() => set(false), 160); });
      btn.addEventListener('click', () => set(!dd.classList.contains('open')));
      dd.addEventListener('focusout', (e) => { if (!dd.contains(e.relatedTarget)) set(false); });
      dd.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    }

    // layers
    const wa = waNumber(st.whatsapp);
    $('#layers').innerHTML = `
      <div class="scrim"></div>
      <aside class="drawer from-start" data-layer="menu" aria-hidden="true" aria-label="القائمة" role="dialog">
        <div class="drawer-head"><a href="/" class="brand" style="align-items:flex-start">${brandHtml(false)}</a><button class="icon-btn" data-close aria-label="إغلاق">${icon('close')}</button></div>
        <div class="drawer-body">
          <nav class="mnav">
            <a href="/">الرئيسية ${icon('left')}</a>
            <a href="/shop">المتجر ${icon('left')}</a>
            ${cats.length ? `<details open><summary>الأقسام ${icon('down')}</summary><div class="sub">${cats.map((c) => `<a href="${catHref(c)}">${esc(c.name)}<small class="num">${c.n}</small></a>`).join('')}</div></details>` : ''}
            <a href="/shop?offers=1">العروض ${icon('left')}</a>
            <a href="/track">تتبع الطلب ${icon('left')}</a>
            <a href="/about">من نحن ${icon('left')}</a>
            <a href="/policies">سياسة الاستبدال ${icon('left')}</a>
            <a href="/contact">تواصلي معنا ${icon('left')}</a>
          </nav>
          <div class="mnav-meta">
            ${st.phone ? `<a href="tel:${esc(normPhone(st.phone) || st.phone)}">${icon('phone')}<span class="ltr">${esc(st.phone)}</span></a>` : ''}
            ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">${icon('whatsapp')}واتساب</a>` : ''}
            ${st.instagram ? `<a href="${esc(social('instagram', st.instagram))}" target="_blank" rel="noopener">${icon('instagram')}انستغرام</a>` : ''}
          </div>
        </div>
      </aside>
      <aside class="drawer from-end" data-layer="cart" aria-hidden="true" aria-label="سلة التسوق" role="dialog"></aside>
      <div class="search" data-layer="search" aria-hidden="true" role="dialog" aria-label="البحث">
        <div class="wrap">
          <form class="search-bar" role="search" action="/shop">
            ${icon('search')}
            <label for="q" class="sr">ابحثي عن منتج</label>
            <input id="q" name="q" type="search" placeholder="ابحثي عن عطر، أحمر شفاه، كريم…" autocomplete="off" enterkeyhint="search">
            <button type="button" class="icon-btn" data-close aria-label="إغلاق البحث">${icon('close')}</button>
          </form>
          <div class="search-body" id="search-body"></div>
        </div>
      </div>
      ${wa ? `<a class="wa-fab" href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="تواصلي معنا عبر واتساب">${icon('whatsapp')}</a>` : ''}`;

    renderFooter();
    renderBadge();
    setupSearch();
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
          <a href="/" class="brand">${st.logo ? `<span class="brand-word">${esc(String(st.name).toUpperCase())}</span>` : brandHtml(false)}</a>
          <p>${esc(about.length > 180 ? about.slice(0, 180).replace(/\s+\S*$/, '') + '…' : about)}</p>
          ${socials ? `<div class="socials">${socials}</div>` : ''}
        </div>
        <div><h4>المتجر</h4><ul>
          <li><a href="/shop">جميع المنتجات</a></li>
          ${S.cats.slice(0, 5).map((c) => `<li><a href="${catHref(c)}">${esc(c.name)}</a></li>`).join('')}
          <li><a href="/shop?offers=1">العروض</a></li>
        </ul></div>
        <div><h4>المساعدة</h4><ul>
          <li><a href="/track">تتبع الطلب</a></li>
          <li><a href="/policies">سياسة الاستبدال والدفع</a></li>
          <li><a href="/about">من نحن</a></li>
          <li><a href="/contact">تواصلي معنا</a></li>
        </ul></div>
        <div><h4>تواصلي معنا</h4><ul class="f-contact">
          ${st.phone ? `<li>${icon('phone')}<a href="tel:${esc(normPhone(st.phone) || st.phone)}" class="ltr">${esc(st.phone)}</a></li>` : ''}
          ${wa ? `<li>${icon('whatsapp')}<a href="https://wa.me/${wa}" target="_blank" rel="noopener">واتساب</a></li>` : ''}
          ${st.email ? `<li>${icon('mail')}<a href="mailto:${esc(st.email)}">${esc(st.email)}</a></li>` : ''}
          ${st.address ? `<li>${icon('pin')}<span>${esc(st.address)}</span></li>` : ''}
          ${!st.phone && !wa && !st.email && !st.address ? `<li><a href="/contact">صفحة التواصل</a></li>` : ''}
        </ul></div>
      </div>
      <div class="wrap f-bot">
        <span>© <span class="num">${new Date().getFullYear()}</span> ${esc(st.name)}${st.name_ar ? ` · ${esc(st.name_ar)}` : ''}. جميع الحقوق محفوظة.</span>
        <span class="cod">${icon('cash')} الدفع نقداً عند الاستلام · توصيل لجميع المحافظات</span>
      </div>`;
  }

  function renderBadge() {
    const b = $('.cart-btn .badge'); if (!b) return;
    const n = Cart.count();
    const prev = b.textContent;
    b.textContent = n > 99 ? '99+' : n;
    b.classList.toggle('on', n > 0);
    $('.cart-btn').setAttribute('aria-label', n ? `السلة (${n})` : 'السلة');
    if (prev && String(n) !== prev && n > Number(prev)) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  }

  function renderCartDrawer() {
    const el = $('[data-layer="cart"]');
    const n = Cart.count(), sub = Cart.subtotal();
    const head = `<div class="drawer-head"><h2>سلة التسوق ${n ? `<small class="num">(${n})</small>` : ''}</h2><button class="icon-btn" data-close aria-label="إغلاق">${icon('close')}</button></div>`;
    if (!Cart.items.length) {
      el.innerHTML = head + `<div class="drawer-body"><div class="empty"><div class="mark">${icon('bag')}</div><h2>سلتكِ فارغة</h2><p>اكتشفي تشكيلتنا من العطور ومستحضرات التجميل الأصلية.</p><a class="btn" href="/shop">ابدئي التسوق</a></div></div>`;
      return;
    }
    el.innerHTML = head + `<div class="drawer-body">${Cart.items.map(cartItemHtml).join('')}</div>
      <div class="drawer-foot">
        ${freeBar(sub)}
        <div class="sumrow total" style="border:0;margin:0;padding-top:0"><span>المجموع</span><span>${moneyHtml(sub)}</span></div>
        <div class="actions"><a class="btn block" href="/checkout">إتمام الطلب</a><a class="btn line block" href="/cart">عرض السلة</a></div>
        <p class="note">رسوم التوصيل تُحسب عند إتمام الطلب · الدفع عند الاستلام</p>
      </div>`;
  }
  const cartItemHtml = (i) => {
    const cap = Cart.cap(i);
    return `<div class="citem" data-id="${i.id}">
      <a href="/p/${enc(i.slug)}" tabindex="-1" aria-hidden="true">${media(i.image ? [i.image] : [], i.name, { small: true })}</a>
      <div class="citem-b">
        <div class="citem-top"><a class="citem-name" href="/p/${enc(i.slug)}">${esc(i.name)}</a><button class="rm" data-rm="${i.id}" aria-label="إزالة ${esc(i.name)}">${icon('trash')}</button></div>
        <span class="unitp">${moneyHtml(i.price)}</span>
        <div class="citem-bot">
          <div class="stepper sm" role="group" aria-label="الكمية">
            <button type="button" data-qty="${i.id}" data-d="1" aria-label="زيادة" ${i.qty >= cap ? 'disabled' : ''}>${icon('plus')}</button>
            <span class="num" aria-live="polite">${i.qty}</span>
            <button type="button" data-qty="${i.id}" data-d="-1" aria-label="إنقاص" ${i.qty <= 1 ? 'disabled' : ''}>${icon('minus')}</button>
          </div>
          <span class="tot">${moneyHtml(i.qty * i.price)}</span>
        </div>
      </div></div>`;
  };

  // ================= search =================
  function setupSearch() {
    const layer = $('[data-layer="search"]'), input = $('#q'), body = $('#search-body');
    const idle = () => {
      body.innerHTML = S.cats.length ? `<p class="search-label">تصفّحي الأقسام</p><div class="search-chips">${S.cats.map((c) => `<a class="chip" href="${catHref(c)}">${esc(c.name)}</a>`).join('')}<a class="chip" href="/shop?offers=1">${icon('sparkle')} العروض</a></div>` : '';
    };
    idle();
    let seq = 0;
    const run = debounce(async () => {
      const q = input.value.trim();
      if (!q) return idle();
      const my = ++seq;
      body.innerHTML = `<p class="search-label">جارٍ البحث…</p>`;
      try {
        const r = await api(`/api/products?q=${enc(q)}&limit=8`);
        if (my !== seq) return;
        if (!r.items.length) { body.innerHTML = `<p class="search-label">لا توجد نتائج لـ «${esc(q)}». جرّبي كلمة أخرى.</p>`; return; }
        body.innerHTML = `<p class="search-label"><span class="num">${r.total}</span> نتيجة</p>
          <div class="search-results">${r.items.map((p) => `<a class="sr-item" href="${prodHref(p)}">${media(p.images, p.name, { small: true })}<div><div class="t">${esc(p.name)}</div><div class="p">${moneyHtml(p.price)}</div></div></a>`).join('')}</div>
          ${r.total > r.items.length ? `<div class="search-all"><a class="link" href="/shop?q=${enc(q)}">عرض كل النتائج (<span class="num">${r.total}</span>) ${icon('arrow')}</a></div>` : ''}`;
      } catch (e) { if (my === seq) body.innerHTML = `<p class="search-label">${esc(e.message)}</p>`; }
    }, 220);
    input.addEventListener('input', run);
    layer.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim(); if (!q) return;
      Drawer.close(); go('/shop?q=' + enc(q));
    });
  }

  // ================= router =================
  const routes = [
    [/^\/$/, viewHome],
    [/^\/shop\/?$/, viewShop],
    [/^\/c\/([^/]+)\/?$/, viewShop],
    [/^\/p\/([^/]+)\/?$/, viewProduct],
    [/^\/cart\/?$/, viewCart],
    [/^\/checkout\/?$/, viewCheckout],
    [/^\/order\/([^/]+)\/?$/, viewOrder],
    [/^\/track\/?$/, viewTrack],
    [/^\/about\/?$/, viewAbout],
    [/^\/policies\/?$/, viewPolicies],
    [/^\/contact\/?$/, viewContact],
  ];
  let navSeq = 0, cleanup = [];
  const main = () => $('#main');
  const onLeave = (fn) => cleanup.push(fn);
  const key = () => (history.state && history.state.k) || 'init';
  const scrolls = sstore.get('tq_scroll', {});

  function setTitle(t) { const st = S.store.store; document.title = t ? `${t} — ${st.name}` : `${st.name} — ${st.tagline || st.name_ar || ''}`; }

  function go(url, { replace = false } = {}) {
    scrolls[key()] = window.scrollY; sstore.set('tq_scroll', scrolls);
    const state = { k: Math.random().toString(36).slice(2, 10) };
    if (replace) history.replaceState(state, '', url); else history.pushState(state, '', url);
    render({ restore: false });
  }

  async function render({ restore }) {
    const my = ++navSeq;
    cleanup.forEach((f) => { try { f(); } catch { /* */ } }); cleanup = [];
    Drawer.close(); Sheet.close();
    document.body.classList.remove('has-sticky');
    let path;
    try { path = decodeURIComponent(location.pathname); } catch { path = location.pathname; }
    const q = new URLSearchParams(location.search);
    // nav active state
    $$('.nav > a').forEach((a) => a.classList.toggle('on', a.dataset.nav === path || (a.dataset.nav === '/shop' && /^\/(shop|c\/)/.test(path))));
    let view = viewNotFound, params = [];
    for (const [re, fn] of routes) { const m = path.match(re); if (m) { view = fn; params = m.slice(1); break; } }
    const target = restore ? scrolls[key()] || 0 : 0;
    if (!restore) window.scrollTo(0, 0);
    try {
      await view({ params, q, path, isCurrent: () => my === navSeq });
    } catch (e) {
      if (my !== navSeq) return;
      console.error(e);
      main().innerHTML = `<div class="wrap err-state page"><h2 class="title">تعذر تحميل الصفحة</h2><p>${esc(e.message)}</p><button class="btn line" onclick="location.reload()">إعادة المحاولة</button></div>`;
      setTitle('خطأ');
    }
    if (my !== navSeq) return;
    if (restore && target) requestAnimationFrame(() => window.scrollTo(0, target));
  }
  const setMain = (html) => { const m = main(); m.innerHTML = `<div class="page">${html}</div>`; };

  // ================= product card =================
  function card(p, { eager = false } = {}) {
    const off = discount(p), cat = catById(p.category_id);
    const badges = [];
    if (!p.in_stock) badges.push('<span class="badge-t out">نفد</span>');
    else {
      if (off) badges.push(`<span class="badge-t sale">خصم <span class="num">${off}</span>٪</span>`);
      if (p.is_new) badges.push('<span class="badge-t new">جديد</span>');
      if (p.low_stock) badges.push('<span class="badge-t low">كمية محدودة</span>');
    }
    return `<article class="card${p.in_stock ? '' : ' is-out'}">
      <div style="position:relative">
        <a class="card-link" href="${prodHref(p)}" aria-label="${esc(p.name)}">${media(p.images, p.name, { hover: true, eager })}</a>
        <div class="badges">${badges.join('')}</div>
        <button class="quick" type="button" data-add="${p.id}" ${p.in_stock ? '' : 'disabled'} aria-label="${p.in_stock ? 'أضيفي إلى السلة: ' + esc(p.name) : 'نفد من المخزون'}">${icon('bag')}<span>${p.in_stock ? 'أضيفي إلى السلة' : 'نفد من المخزون'}</span></button>
      </div>
      <a class="card-body" href="${prodHref(p)}" tabindex="-1">
        ${cat ? `<span class="card-cat">${esc(cat.name)}</span>` : ''}
        <h3 class="card-name">${esc(p.name)}</h3>
        <div class="prices${off ? ' sale' : ''}"><span class="now">${moneyHtml(p.price)}</span>${off ? `<span class="was">${moneyHtml(p.compare_price)}</span>` : ''}</div>
      </a>
    </article>`;
  }
  const skCards = (n) => Array.from({ length: n }, () => `<div class="card sk-card" aria-hidden="true"><div class="media sk"></div><div class="sk sk-line w40"></div><div class="sk sk-line w80"></div><div class="sk sk-line w60"></div></div>`).join('');
  // products known on page (for quick add)
  const known = new Map();
  const remember = (list) => { for (const p of list || []) known.set(p.id, p); return list; };

  function addToCart(p, qty = 1, { openDrawer = true } = {}) {
    if (!p.in_stock) return toast('هذا المنتج غير متوفر حالياً', { type: 'err' });
    const added = Cart.add(p, qty);
    if (!added) return toast('وصلتِ للحد الأقصى من هذا المنتج في السلة', { type: 'err' });
    if (openDrawer) Drawer.open('cart');
    else toast(`أُضيف «${p.name}» إلى السلة`, { link: '/cart', linkText: 'عرض السلة' });
  }

  function railHtml(id, items) {
    return `<div class="rail-wrap"><div class="rail" id="${id}">${items.map((p) => card(p)).join('')}</div></div>`;
  }
  function railNav(id) { return `<div class="rail-nav" data-rail="${id}"><button type="button" data-dir="-1" aria-label="السابق">${icon('right')}</button><button type="button" data-dir="1" aria-label="التالي">${icon('left')}</button></div>`; }
  function wireRails(root) {
    $$('.rail-nav', root).forEach((nav) => {
      const rail = document.getElementById(nav.dataset.rail); if (!rail) return;
      const [prev, next] = nav.querySelectorAll('button');
      const update = () => {
        const max = rail.scrollWidth - rail.clientWidth, x = Math.abs(rail.scrollLeft);
        prev.disabled = x < 4; next.disabled = x > max - 4;
        nav.style.visibility = max > 4 ? '' : 'hidden';
      };
      nav.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const dir = Number(b.dataset.dir), rtl = getComputedStyle(rail).direction === 'rtl';
        rail.scrollBy({ left: dir * rail.clientWidth * 0.9 * (rtl ? -1 : 1), behavior: reduceMotion ? 'auto' : 'smooth' });
      });
      rail.addEventListener('scroll', debounce(update, 60), { passive: true });
      window.addEventListener('resize', update); onLeave(() => window.removeEventListener('resize', update));
      update();
    });
  }

  // ================= views =================
  async function viewHome({ isCurrent }) {
    setTitle('');
    const D = S.store, h = D.hero || {}, st = D.store;
    const heroCopy = `
      <span class="eyebrow reveal">${esc(String(st.name || 'The Queen').toUpperCase())} · BEAUTY HOUSE</span>
      <h1 class="display reveal d1">${esc(h.title || st.tagline)}</h1>
      ${h.subtitle ? `<p class="lead reveal d2">${esc(h.subtitle)}</p>` : ''}
      <div class="hero-cta reveal d3"><a class="btn" href="/shop">${esc(h.cta || 'تسوّقي الآن')} ${icon('arrow')}</a>${S.cats.length ? `<a class="btn line" href="#cats">الأقسام</a>` : ''}</div>`;
    const hero = h.image
      ? `<section class="hero hero-img"><div class="hero-in">${heroCopy}</div><figure>${imgTag(h.image, h.title || st.name, '', true)}</figure></section>`
      : `<section class="hero hero-type">
          <svg class="pattern" aria-hidden="true"><defs><pattern id="arches" width="72" height="96" patternUnits="userSpaceOnUse"><path d="M6 96V40a30 30 0 0 1 60 0v56" fill="none" stroke="currentColor" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#arches)"/></svg>
          <span class="hero-mono" aria-hidden="true">Q</span>
          <div class="wrap" style="width:100%"><div class="hero-in">${heroCopy}
            <div class="hero-meta reveal d4">${D.count ? `<div><b>${D.count}+</b>منتج أصلي</div>` : ''}<div><b>${D.governorates.length}</b>محافظة نوصل إليها</div><div><b>COD</b>الدفع عند الاستلام</div></div>
          </div></div>
        </section>`;
    const catsHtml = S.cats.length ? `
      <section class="section" id="cats"><div class="wrap">
        <div class="sec-head center"><div class="t"><span class="eyebrow center">COLLECTIONS</span><h2 class="title">تسوّقي حسب القسم</h2></div></div>
        <div class="cats" style="--n:${Math.min(Math.max(S.cats.length, 3), 5)}">${S.cats.map((c, i) => `<a class="cat" href="${catHref(c)}"><div class="arch" data-cat="${c.id}"><div class="ph"><span class="q">${String(i + 1).padStart(2, '0')}</span></div>${c.image ? imgTag(c.image, c.name) : ''}</div><span class="cat-name">${esc(c.name)}</span><span class="cat-n"><span class="num">${c.n}</span> منتج</span></a>`).join('')}</div>
      </div></section>` : '';
    const sk = (title, eyebrow, id, cls = '') => `<section class="section ${cls}" data-sec="${id}"><div class="wrap"><div class="sec-head"><div class="t"><span class="eyebrow">${eyebrow}</span><h2 class="title">${title}</h2></div></div><div class="rail-wrap"><div class="rail">${skCards(4)}</div></div></div></section>`;
    const wa = waNumber(st.whatsapp);
    const banners = (D.banners || []).filter((b) => b && b.image);
    const about = String(D.about || '').trim();
    setMain(`${hero}${catsHtml}
      ${sk('الأكثر تميزاً', 'THE EDIT', 'featured')}
      ${banners.length ? `<section class="section tight"><div class="wrap"><div class="banners${banners.length === 1 ? ' one' : ''}">${banners.map((b) => { const href = safeHref(b.link); const tag = href ? 'a' : 'div'; return `<${tag} class="banner" ${href ? `href="${esc(href)}"` : ''}>${imgTag(b.image, b.title || '')}${b.title ? `<div class="cap"><h3>${esc(b.title)}</h3>${href ? icon('arrow') : ''}</div>` : ''}</${tag}>`; }).join('')}</div></div></section>` : ''}
      ${sk('وصل حديثاً', 'NEW IN', 'new')}
      ${sk('عروض مختارة', 'OFFERS', 'offers', 'band')}
      <section class="section tight"><div class="wrap"><div class="trust">
        <div>${icon('seal')}<div><b>أصلي 100٪</b><span>منتجات موثوقة من مصادرها</span></div></div>
        <div>${icon('truck')}<div><b>توصيل لكل المحافظات</b><span>من بغداد إلى كل العراق</span></div></div>
        <div>${icon('cash')}<div><b>الدفع عند الاستلام</b><span>ادفعي نقداً عند وصول طلبكِ</span></div></div>
        <div>${icon('swap')}<div><b>استبدال خلال 7 أيام</b><span>وفق سياسة الاستبدال</span></div></div>
      </div></div></section>
      ${about ? `<section class="section"><div class="wrap story">
        <div class="story-art" aria-hidden="true">${icon('crown', 'crown')}<span class="serif">Q</span><small>${esc(String(st.name).toUpperCase())}</small></div>
        <div class="story-txt"><span class="eyebrow">OUR STORY</span><h2 class="title">جمالٌ يليق بكِ</h2><blockquote>${esc(about.length > 320 ? about.slice(0, 320).replace(/\s+\S*$/, '') + '…' : about)}</blockquote><a class="link" href="/about">اقرئي قصتنا ${icon('arrow')}</a></div>
      </div></section>` : ''}
      ${wa || st.phone ? `<section class="section band"><div class="wrap cta">
        <span class="eyebrow center">PERSONAL ADVICE</span>
        <h2 class="title">تحتاجين مساعدة في اختيار عطركِ أو روتينكِ؟</h2>
        <p>فريقنا جاهز لمساعدتكِ في اختيار ما يناسبكِ، وتأكيد طلبكِ والإجابة على كل أسئلتكِ.</p>
        <div class="cta-actions">${wa ? `<a class="btn light" href="https://wa.me/${wa}?text=${enc('مرحباً، أحتاج استشارة بخصوص منتج')}" target="_blank" rel="noopener">${icon('whatsapp')} راسلينا على واتساب</a>` : ''}${st.phone ? `<a class="btn ghost-light" href="tel:${esc(normPhone(st.phone) || st.phone)}">${icon('phone')} اتصلي بنا</a>` : ''}</div>
      </div></section>` : ''}`);

    const load = async (id, qs, title, eyebrow, href) => {
      const sec = $(`[data-sec="${id}"]`); if (!sec) return;
      try {
        const r = await api(`/api/products?${qs}&limit=12`);
        if (!isCurrent()) return;
        remember(r.items);
        if (!r.items.length) { sec.remove(); return; }
        sec.innerHTML = `<div class="wrap"><div class="sec-head"><div class="t"><span class="eyebrow">${eyebrow}</span><h2 class="title">${title}</h2></div><div class="sec-tools">${railNav('r-' + id)}<a class="link" href="${href}">عرض الكل ${icon('arrow')}</a></div></div>${railHtml('r-' + id, r.items)}</div>`;
        wireRails(sec);
      } catch { if (isCurrent()) sec.remove(); }
    };
    // categories without their own image borrow a product photo
    S.cats.filter((c) => !c.image).forEach(async (c) => {
      try {
        if (!catCover.has(c.id)) { const r = await api(`/api/products?category=${c.id}&instock=1&limit=12`); catCover.set(c.id, ((r.items.find((p) => p.images && p.images.length) || {}).images || [])[0] || ''); }
        const f = catCover.get(c.id), el = isCurrent() && $(`.arch[data-cat="${c.id}"]`);
        if (f && el) el.insertAdjacentHTML('beforeend', imgTag(f, c.name));
      } catch { /* keep placeholder */ }
    });
    await Promise.all([
      load('featured', 'featured=1', 'الأكثر تميزاً', 'THE EDIT', '/shop'),
      load('new', 'new=1&sort=new', 'وصل حديثاً', 'NEW IN', '/shop?new=1'),
      load('offers', 'offers=1', 'عروض مختارة', 'OFFERS', '/shop?offers=1'),
    ]);
    // if nothing featured/new/offers, show a general selection so home isn't empty
    if (isCurrent() && !$('[data-sec="featured"]') && !$('[data-sec="new"]') && !$('[data-sec="offers"]') && D.count) {
      const after = $('#cats') || $('.hero');
      after.insertAdjacentHTML('afterend', `<section class="section" data-sec="all"></section>`);
      await load('all', 'instock=1', 'من تشكيلتنا', 'SELECTION', '/shop');
    }
  }

  const catCover = new Map();
  // ---------- shop ----------
  const SORTS = [['', 'الأكثر تميزاً'], ['new', 'الأحدث'], ['price_asc', 'السعر: من الأقل'], ['price_desc', 'السعر: من الأعلى'], ['name', 'الاسم']];
  const PAGE = 24;
  async function viewShop({ params, q, isCurrent }) {
    const slug = params[0];
    let cat = null;
    if (slug) { cat = catFind(slug); if (!cat) return viewNotFound({ msg: 'هذا القسم غير موجود أو لم يعد متاحاً.' }); }
    else if (q.get('category')) cat = catFind(q.get('category')) || null;
    const f = {
      q: (q.get('q') || '').trim(), sort: q.get('sort') || '', offers: q.get('offers') === '1', new: q.get('new') === '1', instock: q.get('instock') === '1',
      min: toLatinDigits(q.get('min') || '').replace(/\D/g, ''), max: toLatinDigits(q.get('max') || '').replace(/\D/g, ''),
    };
    const title = cat ? cat.name : f.q ? `نتائج البحث` : f.offers ? 'العروض' : f.new ? 'وصل حديثاً' : 'المتجر';
    setTitle(f.q ? `بحث: ${f.q}` : title);
    const qsWith = (extra = {}) => {
      const o = { q: f.q, sort: f.sort, offers: f.offers ? '1' : '', new: f.new ? '1' : '', instock: f.instock ? '1' : '', min: f.min, max: f.max, ...extra };
      const u = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v) u.set(k, v);
      const s = u.toString(); return s ? '?' + s : '';
    };
    const activeCount = [f.offers, f.new, f.instock, f.min || f.max].filter(Boolean).length;
    setMain(`
      <div class="wrap phead">
        <nav class="crumbs" aria-label="مسار التصفح"><a href="/">الرئيسية</a><i class="sep"></i><a href="/shop">المتجر</a>${cat ? `<i class="sep"></i><span>${esc(cat.name)}</span>` : ''}</nav>
        <h1 class="title">${esc(title)}${f.q ? ` <span class="muted">«${esc(f.q)}»</span>` : ''}</h1>
      </div>
      <div class="wrap shop">
        <aside class="filters-sheet" id="filters" aria-label="تصفية المنتجات">
          <div class="fhead"><h2>تصفية</h2><button class="icon-btn" data-sheet-close aria-label="إغلاق">${icon('close')}</button></div>
          ${S.cats.length ? `<div class="fgroup"><h3>الأقسام</h3><div class="fcats">
            <a href="/shop${qsWith()}" class="${cat ? '' : 'on'}"><span>جميع المنتجات</span><small>${S.store.count}</small></a>
            ${S.cats.map((c) => `<a href="${catHref(c)}${qsWith()}" class="${cat && cat.id === c.id ? 'on' : ''}"><span>${esc(c.name)}</span><small>${c.n}</small></a>`).join('')}
          </div></div>` : ''}
          <div class="fgroup"><h3>عرض</h3>
            <label class="check"><input type="checkbox" data-f="instock" ${f.instock ? 'checked' : ''}> المتوفر فقط</label>
            <label class="check"><input type="checkbox" data-f="offers" ${f.offers ? 'checked' : ''}> العروض والخصومات</label>
            <label class="check"><input type="checkbox" data-f="new" ${f.new ? 'checked' : ''}> وصل حديثاً</label>
          </div>
          <form class="fgroup" id="pform"><h3>السعر <small class="muted">(${esc(S.currency)})</small></h3>
            <div class="prange">
              <label>من<input name="min" inputmode="numeric" placeholder="0" value="${esc(f.min)}" aria-label="أقل سعر"></label>
              <label>إلى<input name="max" inputmode="numeric" placeholder="∞" value="${esc(f.max)}" aria-label="أعلى سعر"></label>
              <button class="btn line sm" type="submit">تطبيق</button>
            </div>
          </form>
          <div class="fapply"><button class="btn block" type="button" data-sheet-close>عرض النتائج</button></div>
        </aside>
        <div>
          <div class="toolbar">
            <span class="count" id="count">&nbsp;</span>
            <div class="toolbar-r">
              <button class="filter-btn" type="button" id="open-filters">${icon('filter')} تصفية ${activeCount ? `<i>${activeCount}</i>` : ''}</button>
              <label class="select"><span class="sr">ترتيب حسب</span><select id="sort">${SORTS.map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${icon('down')}</label>
            </div>
          </div>
          ${(() => {
            const chips = [];
            if (f.q) chips.push(['q', `بحث: ${f.q}`]);
            if (f.instock) chips.push(['instock', 'المتوفر فقط']);
            if (f.offers) chips.push(['offers', 'العروض']);
            if (f.new) chips.push(['new', 'وصل حديثاً']);
            if (f.min || f.max) chips.push(['price', `السعر: ${f.min ? Number(f.min).toLocaleString('en-US') : '0'} – ${f.max ? Number(f.max).toLocaleString('en-US') : '∞'}`]);
            return chips.length ? `<div class="active-chips">${chips.map(([k, l]) => `<button class="chip" type="button" data-unset="${k}">${esc(l)} ${icon('close')}</button>`).join('')}${chips.length > 1 ? `<a class="chip" href="${cat ? catHref(cat) : '/shop'}">مسح الكل</a>` : ''}</div>` : '';
          })()}
          <div class="grid" id="grid">${skCards(8)}</div>
          <div id="more"></div>
        </div>
      </div>`);

    const base = location.pathname;
    const apply = (extra) => go(base + qsWith(extra), { replace: false });
    let pending = {};
    $$('[data-f]').forEach((c) => c.addEventListener('change', () => {
      const v = { [c.dataset.f]: c.checked ? '1' : '' };
      if (Sheet.el) Object.assign(pending, v); else apply(v);
    }));
    $('#sort').addEventListener('change', (e) => go(base + qsWith({ sort: e.target.value }), { replace: true }));
    $('#pform').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      let mn = toLatinDigits(fd.get('min')).replace(/\D/g, ''), mx = toLatinDigits(fd.get('max')).replace(/\D/g, '');
      if (mn && mx && Number(mn) > Number(mx)) [mn, mx] = [mx, mn];
      apply({ ...pending, min: mn, max: mx });
    });
    $$('[data-unset]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.unset; apply(k === 'price' ? { min: '', max: '' } : { [k]: '' }); }));
    const sheet = $('#filters');
    $('#open-filters').addEventListener('click', () => Sheet.open(sheet));
    $$('[data-sheet-close]').forEach((b) => b.addEventListener('click', () => {
      const ch = Object.keys(pending).length;
      if (b.classList.contains('btn') && ch) { apply(pending); return; }
      pending = {}; $$('[data-f]').forEach((c) => { c.checked = f[c.dataset.f]; });
      Sheet.close();
    }));

    let offset = 0, total = 0;
    const grid = $('#grid'), more = $('#more'), count = $('#count');
    const qs = () => {
      const u = new URLSearchParams();
      if (cat) u.set('category', cat.id);
      if (f.q) u.set('q', f.q); if (f.sort) u.set('sort', f.sort);
      if (f.offers) u.set('offers', 1); if (f.new) u.set('new', 1); if (f.instock) u.set('instock', 1);
      if (f.min) u.set('min', f.min); if (f.max) u.set('max', f.max);
      u.set('limit', PAGE); u.set('offset', offset);
      return u.toString();
    };
    const loadPage = async () => {
      const r = await api('/api/products?' + qs());
      if (!isCurrent()) return;
      remember(r.items);
      total = r.total;
      if (offset === 0) grid.innerHTML = '';
      grid.insertAdjacentHTML('beforeend', r.items.map((p, i) => card(p, { eager: offset === 0 && i < 4 })).join(''));
      offset += r.items.length;
      count.innerHTML = total ? `<span class="num">${total}</span> منتج` : '';
      if (!total) {
        grid.innerHTML = '';
        more.innerHTML = `<div class="empty"><div class="mark">${icon('search')}</div><h2>لا توجد منتجات مطابقة</h2><p>${f.q ? 'جرّبي كلمة بحث مختلفة أو تصفّحي الأقسام.' : 'جرّبي تعديل خيارات التصفية لعرض المزيد من المنتجات.'}</p><a class="btn line" href="/shop">عرض جميع المنتجات</a></div>`;
        return;
      }
      more.innerHTML = offset < total ? `<div class="more"><small>عرضتِ <span class="num">${offset}</span> من <span class="num">${total}</span></small><div class="bar"><i style="width:${(offset / total * 100).toFixed(1)}%"></i></div><button class="btn line" id="more-btn">عرض المزيد</button></div>`
        : (total > PAGE ? `<div class="more"><small>عرضتِ جميع المنتجات (<span class="num">${total}</span>)</small></div>` : '');
      const mb = $('#more-btn');
      if (mb) mb.addEventListener('click', async () => {
        mb.classList.add('loading'); mb.disabled = true;
        try { await loadPage(); } catch (e) { toast(e.message, { type: 'err' }); mb.classList.remove('loading'); mb.disabled = false; }
      });
    };
    await loadPage();
  }

  // ---------- product ----------
  async function viewProduct({ params, isCurrent }) {
    setMain(`<div class="wrap pdp" aria-busy="true"><div class="gallery solo"><div class="media sk"></div></div><div class="pinfo"><div class="sk sk-line w40"></div><div class="sk" style="height:34px;width:80%"></div><div class="sk sk-line w40"></div><div class="sk" style="height:52px;margin-top:20px"></div></div></div>`);
    let p;
    try { p = await api('/api/products/' + enc(params[0])); } catch (e) {
      if (!isCurrent()) return;
      if (e.status === 404) return viewNotFound({ msg: 'هذا المنتج غير متوفر أو تمت إزالته من المتجر.' });
      throw e;
    }
    if (!isCurrent()) return;
    remember([p]); remember(p.related);
    setTitle(p.name);
    const st = S.store.store, d = S.store.delivery || {}, wa = waNumber(st.whatsapp);
    const off = discount(p);
    const imgs = (p.images || []).filter(Boolean);
    const cap = p.low_stock ? 3 : 10;
    const stock = !p.in_stock ? '<span class="stock out">نفد من المخزون</span>' : p.low_stock ? '<span class="stock low">كمية محدودة — اطلبي الآن</span>' : '<span class="stock">متوفر وجاهز للتوصيل</span>';
    const waText = `مرحباً، أرغب بطلب هذا المنتج:\n${p.name}\nالسعر: ${money(p.price)}\n${location.origin}${prodHref(p)}`;
    const cat = p.category;
    const slides = imgs.length ? imgs.map((im, i) => `<div class="slide" data-i="${i}"><div class="media">${ph(p.name)}${imgTag(im, `${p.name}${imgs.length > 1 ? ' — صورة ' + (i + 1) : ''}`, '', i === 0)}</div></div>`).join('') : `<div class="slide"><div class="media">${ph(p.name)}</div></div>`;
    const feeRows = [];
    feeRows.push(`<dt>بغداد</dt><dd>${moneyHtml(d.baghdad)}</dd>`);
    feeRows.push(`<dt>باقي المحافظات</dt><dd>${moneyHtml(d.other)}</dd>`);
    if (Number(d.free_over) > 0) feeRows.push(`<dt>توصيل مجاني</dt><dd>للطلبات من ${moneyHtml(d.free_over)}</dd>`);
    if (Number(d.min_order) > 0) feeRows.push(`<dt>الحد الأدنى للطلب</dt><dd>${moneyHtml(d.min_order)}</dd>`);
    setMain(`
      <div class="wrap pdp-crumbs" style="padding-top:22px"><nav class="crumbs" aria-label="مسار التصفح"><a href="/">الرئيسية</a><i class="sep"></i><a href="/shop">المتجر</a>${cat ? `<i class="sep"></i><a href="${catHref(cat)}">${esc(cat.name)}</a>` : ''}<i class="sep"></i><span>${esc(p.name)}</span></nav></div>
      <div class="wrap pdp">
        <div class="gallery${imgs.length > 1 ? '' : ' solo'}">
          ${imgs.length > 1 ? `<div class="thumbs" role="tablist" aria-label="صور المنتج">${imgs.map((im, i) => `<button type="button" data-go="${i}" class="${i ? '' : 'on'}" aria-label="صورة ${i + 1}">${imgTag(im, '')}</button>`).join('')}</div>` : ''}
          <div class="stage">
            <div class="badges">${!p.in_stock ? '<span class="badge-t out">نفد</span>' : `${off ? `<span class="badge-t sale">خصم <span class="num">${off}</span>٪</span>` : ''}${p.is_new ? '<span class="badge-t new">جديد</span>' : ''}`}</div>
            <div class="slides" id="slides">${slides}</div>
            ${imgs.length > 1 ? `<div class="stage-nav"><button type="button" data-step="-1" aria-label="الصورة السابقة">${icon('right')}</button><button type="button" data-step="1" aria-label="الصورة التالية">${icon('left')}</button></div><div class="dots" aria-hidden="true">${imgs.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="pinfo">
          ${cat ? `<a href="${catHref(cat)}" class="eyebrow ar">${esc(cat.name)}</a>` : ''}
          <h1>${esc(p.name)}</h1>
          <div class="pprice${off ? ' sale' : ''}"><span class="now">${moneyHtml(p.price)}</span>${off ? `<span class="was">${moneyHtml(p.compare_price)}</span><span class="off">وفّري ${moneyHtml(p.compare_price - p.price)}</span>` : ''}${p.unit ? `<span class="unit">/ ${esc(p.unit)}</span>` : ''}</div>
          ${stock}
          <div class="buy" id="buy">
            ${p.in_stock ? `<div class="stepper" role="group" aria-label="الكمية">
              <button type="button" data-q="1" aria-label="زيادة الكمية">${icon('plus')}</button><output id="qty" class="num" aria-live="polite">1</output><button type="button" data-q="-1" aria-label="إنقاص الكمية" disabled>${icon('minus')}</button>
            </div>
            <button class="btn" type="button" id="add">${icon('bag')} أضيفي إلى السلة</button>` : `<button class="btn" type="button" disabled style="grid-column:1/-1">نفد من المخزون</button>`}
            ${wa ? `<a class="btn line wa" href="https://wa.me/${wa}?text=${enc(waText)}" target="_blank" rel="noopener">${icon('whatsapp')} اطلبي عبر واتساب</a>` : ''}
          </div>
          <ul class="perks">
            <li>${icon('seal')}<span>منتج أصلي 100٪ ومضمون</span></li>
            <li>${icon('truck')}<span>توصيل لجميع محافظات العراق${Number(d.free_over) > 0 ? ` · مجاني للطلبات من ${moneyHtml(d.free_over)}` : ''}</span></li>
            <li>${icon('cash')}<span>الدفع نقداً عند الاستلام</span></li>
          </ul>
          <div>
            ${p.description ? `<details class="acc" open><summary>الوصف ${icon('plus')}</summary><div class="acc-b">${esc(p.description)}</div></details>` : ''}
            <details class="acc" ${p.description ? '' : 'open'}><summary>التوصيل والدفع ${icon('plus')}</summary><div class="acc-b"><dl>${feeRows.join('')}<dt>طريقة الدفع</dt><dd>نقداً عند الاستلام</dd></dl></div></details>
            <details class="acc"><summary>الاستبدال ${icon('plus')}</summary><div class="acc-b">يمكن الاستبدال خلال 7 أيام بشرط أن يكون المنتج بحالته الأصلية وغير مستخدم. <a class="link" href="/policies">السياسة الكاملة</a></div></details>
          </div>
        </div>
      </div>
      ${p.related && p.related.length ? `<section class="section" style="padding-top:clamp(20px,4vw,50px)"><div class="wrap"><div class="sec-head"><div class="t"><span class="eyebrow">YOU MAY ALSO LIKE</span><h2 class="title">قد يعجبكِ أيضاً</h2></div><div class="sec-tools">${railNav('r-rel')}${cat ? `<a class="link" href="${catHref(cat)}">المزيد من ${esc(cat.name)} ${icon('arrow')}</a>` : ''}</div></div>${railHtml('r-rel', p.related)}</div></section>` : ''}
      ${p.in_stock ? `<div class="sticky-buy" id="sticky-buy" aria-hidden="true"><div class="meta"><b>${esc(p.name)}</b><span>${moneyHtml(p.price)}</span></div><button class="btn" type="button" id="add2" tabindex="-1">${icon('bag')} أضيفي للسلة</button></div>` : ''}`);
    wireRails(main());

    // gallery
    const slidesEl = $('#slides');
    if (imgs.length > 1) {
      const slideEls = $$('.slide', slidesEl), thumbs = $$('.thumbs button'), dots = $$('.dots i');
      let cur = 0;
      const mark = (i) => { cur = i; thumbs.forEach((t, j) => t.classList.toggle('on', j === i)); dots.forEach((t, j) => t.classList.toggle('on', j === i)); };
      const rtl = getComputedStyle(slidesEl).direction === 'rtl';
      const show = (i) => { i = (i + slideEls.length) % slideEls.length; slidesEl.scrollTo({ left: i * slidesEl.clientWidth * (rtl ? -1 : 1), behavior: reduceMotion ? 'auto' : 'smooth' }); mark(i); };
      thumbs.forEach((t) => t.addEventListener('click', () => show(Number(t.dataset.go))));
      $$('[data-step]').forEach((b) => b.addEventListener('click', () => show(cur + Number(b.dataset.step))));
      const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting && en.intersectionRatio > 0.6) mark(Number(en.target.dataset.i)); }), { root: slidesEl, threshold: [0.6] });
      slideEls.forEach((s) => io.observe(s)); onLeave(() => io.disconnect());
      slidesEl.tabIndex = 0;
      slidesEl.setAttribute('aria-label', 'صور المنتج — استخدمي الأسهم للتنقل');
      slidesEl.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); show(cur + 1); } if (e.key === 'ArrowRight') { e.preventDefault(); show(cur - 1); } });
    }

    if (!p.in_stock) return;
    let qty = 1;
    const out = $('#qty'), [plus, minus] = $$('[data-q]');
    const upd = () => { out.textContent = qty; minus.disabled = qty <= 1; plus.disabled = qty >= cap; };
    plus.addEventListener('click', () => { if (qty < cap) qty++; upd(); });
    minus.addEventListener('click', () => { if (qty > 1) qty--; upd(); });
    $('#add').addEventListener('click', () => { addToCart(p, qty); qty = 1; upd(); });
    $('#add2').addEventListener('click', () => addToCart(p, 1));
    // sticky mobile bar
    const bar = $('#sticky-buy');
    document.body.classList.add('has-sticky');
    const io2 = new IntersectionObserver(([en]) => { const on = !en.isIntersecting && en.boundingClientRect.top < 0; bar.classList.toggle('on', on); bar.setAttribute('aria-hidden', !on); $('#add2').tabIndex = on ? 0 : -1; }, { rootMargin: '-80px 0px 0px 0px' });
    io2.observe($('#buy')); onLeave(() => io2.disconnect());
  }

  // ---------- cart page ----------
  async function viewCart({ isCurrent }) {
    setTitle('سلة التسوق');
    const head = `<div class="wrap phead"><nav class="crumbs"><a href="/">الرئيسية</a><i class="sep"></i><span>سلة التسوق</span></nav><h1 class="title">سلة التسوق</h1></div>`;
    if (!Cart.items.length) return setMain(head + emptyCart());
    setMain(head + `<div class="wrap cartpage"><div>${skLines(3)}</div><aside class="summary"><div class="sk sk-line w60"></div><div class="sk sk-line w80"></div></aside></div>`);
    let notes = [];
    try { notes = await syncCart(); } catch (e) { if (!isCurrent()) return; toast(e.message, { type: 'err' }); }
    if (!isCurrent()) return;
    const draw = () => {
      if (!Cart.items.length) return setMain(head + (notes.length ? `<div class="wrap" style="padding-top:24px">${noticeHtml(notes)}</div>` : '') + emptyCart());
      const sub = Cart.subtotal(), mo = minOrder();
      setMain(head + `<div class="wrap cartpage">
        <div>${notes.length ? noticeHtml(notes) : ''}<div id="citems">${Cart.items.map(cartItemHtml).join('')}</div>
          <div style="margin-top:26px"><a class="link" href="/shop">${icon('right')} متابعة التسوق</a></div></div>
        <aside class="summary"><h2>ملخص الطلب</h2>
          ${freeBar(sub)}
          <div class="sumrow"><span>المجموع الفرعي (<span class="num">${Cart.count()}</span> قطعة)</span><span>${moneyHtml(sub)}</span></div>
          <div class="sumrow"><span>التوصيل</span><span>${freeOver() && sub >= freeOver() ? 'مجاني' : 'يُحسب حسب المحافظة'}</span></div>
          <div class="sumrow total"><span>الإجمالي</span><span>${moneyHtml(sub)}</span></div>
          ${mo && sub < mo ? `<div class="notice" style="margin:18px 0 0">${icon('info')}<span>الحد الأدنى للطلب ${moneyHtml(mo)}. أضيفي ${moneyHtml(mo - sub)} لإتمام الطلب.</span></div>` : ''}
          ${S.store.ordering && S.store.ordering.enabled === false ? `<div class="notice err" style="margin:18px 0 0">${icon('info')}<span>${esc(S.store.ordering.closed_message)}</span></div>` : `<a class="btn block" href="/checkout" ${mo && sub < mo ? 'aria-disabled="true" data-block="1"' : ''}>إتمام الطلب ${icon('arrow')}</a>`}
          <p class="note">${icon('cash')} الدفع نقداً عند الاستلام. سنتواصل معكِ لتأكيد الطلب قبل الشحن.</p>
        </aside></div>`);
      notes = [];
    };
    draw();
    const onChange = () => { if (isCurrent()) draw(); };
    cartListeners.add(onChange); onLeave(() => cartListeners.delete(onChange));
  }
  const cartListeners = new Set();
  const emptyCart = () => `<div class="wrap"><div class="empty"><div class="mark">${icon('bag')}</div><h2>سلتكِ فارغة</h2><p>لم تضيفي أي منتج بعد. اكتشفي تشكيلتنا المختارة بعناية.</p><a class="btn" href="/shop">ابدئي التسوق</a></div></div>`;
  const skLines = (n) => Array.from({ length: n }, () => `<div class="citem"><div class="media sk"></div><div><div class="sk sk-line w80"></div><div class="sk sk-line w40"></div></div></div>`).join('');
  const noticeHtml = (notes, cls = '') => `<div class="notice ${cls}" role="alert">${icon('info')}<ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`;

  // ---------- checkout ----------
  async function viewCheckout({ isCurrent }) {
    setTitle('إتمام الطلب');
    const head = `<div class="wrap phead"><nav class="crumbs"><a href="/">الرئيسية</a><i class="sep"></i><a href="/cart">السلة</a><i class="sep"></i><span>إتمام الطلب</span></nav><h1 class="title">إتمام الطلب</h1></div>`;
    const ord = S.store.ordering || {};
    if (ord.enabled === false) return setMain(head + `<div class="wrap"><div class="empty"><div class="mark">${icon('clock')}</div><h2>الطلبات متوقفة مؤقتاً</h2><p>${esc(ord.closed_message || '')}</p><a class="btn line" href="/shop">تصفّحي المنتجات</a></div></div>`);
    if (!Cart.items.length) return setMain(head + emptyCart());
    setMain(head + `<div class="wrap checkout"><div>${skLines(2)}</div><aside class="summary"><div class="sk sk-line w60"></div><div class="sk sk-line w80"></div></aside></div>`);
    let notes = [];
    try { notes = await syncCart(); } catch (e) { if (!isCurrent()) return; toast(e.message, { type: 'err' }); }
    if (!isCurrent()) return;
    if (!Cart.items.length) return setMain(head + (notes.length ? `<div class="wrap" style="padding-top:24px">${noticeHtml(notes)}</div>` : '') + emptyCart());
    const c = store.get('tq_customer', {}) || {};
    const govs = S.store.governorates || [];
    setMain(head + `<div class="wrap checkout">
      <form id="co" novalidate>
        ${notes.length ? noticeHtml(notes) : ''}
        <div class="form-sec"><h2><i>1</i> معلومات التواصل</h2>
          <div class="fields">
            <div class="field"><label for="f-name">الاسم الكامل</label><input id="f-name" name="name" autocomplete="name" maxlength="80" value="${esc(c.name || '')}" required><small class="err"></small></div>
            <div class="field"><label for="f-phone">رقم الهاتف <small>(واتساب إن وُجد)</small></label><input id="f-phone" name="phone" type="tel" inputmode="tel" dir="ltr" autocomplete="tel" placeholder="07XX XXX XXXX" maxlength="20" value="${esc(c.phone || '')}" required><small class="err"></small></div>
          </div>
        </div>
        <div class="form-sec"><h2><i>2</i> عنوان التوصيل</h2>
          <div class="fields">
            <div class="field"><label for="f-gov">المحافظة</label><span class="select"><select id="f-gov" name="governorate" required><option value="">اختاري المحافظة</option>${govs.map((g) => `<option ${c.governorate === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>${icon('down')}</span><small class="err"></small></div>
            <div class="field"><label for="f-city">المدينة / المنطقة</label><input id="f-city" name="city" autocomplete="address-level2" maxlength="80" placeholder="مثال: الكرادة" value="${esc(c.city || '')}"><small class="err"></small></div>
            <div class="field full"><label for="f-addr">العنوان بالتفصيل</label><input id="f-addr" name="address" autocomplete="street-address" maxlength="300" placeholder="المحلة، الزقاق، الدار، أقرب نقطة دالة" value="${esc(c.address || '')}" required><small class="err"></small></div>
            <div class="field full"><label for="f-notes">ملاحظات <small>(اختياري)</small></label><textarea id="f-notes" name="notes" maxlength="500" placeholder="وقت مناسب للتوصيل، أو أي تفاصيل أخرى"></textarea></div>
          </div>
        </div>
        <div class="form-sec"><h2><i>3</i> طريقة الدفع</h2>
          <div class="pay">${icon('cash')}<div><b>الدفع نقداً عند الاستلام</b><span>ادفعي عند وصول الطلب إلى باب بيتكِ</span></div><span class="radio" aria-hidden="true"></span></div>
        </div>
        <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
        <div id="co-err"></div>
        <button class="btn block" type="submit" id="place">تأكيد الطلب</button>
        <p class="secure">${icon('lock')} بياناتكِ تُستخدم فقط لتوصيل طلبكِ</p>
      </form>
      <aside class="summary" id="co-sum"></aside>
    </div>`);

    const form = $('#co'), gov = $('#f-gov'), sumEl = $('#co-sum'), btn = $('#place');
    const drawSum = () => {
      const sub = Cart.subtotal(), fee = deliveryFor(gov.value, sub), mo = minOrder();
      sumEl.innerHTML = `<h2>طلبكِ <small class="muted num">(${Cart.count()})</small></h2>
        <div class="mini">${Cart.items.map((i) => `<div class="mini-i"><div class="media">${ph(i.name, true)}${imgTag(i.image, i.name)}<span class="q">${i.qty}</span></div><span class="n">${esc(i.name)}</span><span class="p">${moneyHtml(i.price * i.qty)}</span></div>`).join('')}</div>
        ${freeBar(sub)}
        <div class="sumrow"><span>المجموع الفرعي</span><span>${moneyHtml(sub)}</span></div>
        <div class="sumrow"><span>التوصيل${gov.value ? ` (${esc(gov.value)})` : ''}</span><span>${fee === null ? '<span class="muted">اختاري المحافظة</span>' : fee === 0 ? 'مجاني' : moneyHtml(fee)}</span></div>
        <div class="sumrow total"><span>الإجمالي</span><span>${moneyHtml(sub + (fee || 0))}</span></div>
        ${mo && sub < mo ? `<div class="notice" style="margin:18px 0 0">${icon('info')}<span>الحد الأدنى للطلب ${moneyHtml(mo)}. <a href="/shop" class="link">أضيفي منتجات أخرى</a></span></div>` : ''}
        <a class="link" href="/cart" style="margin-top:18px">تعديل السلة</a>`;
      btn.disabled = !!(mo && sub < mo);
    };
    drawSum();
    gov.addEventListener('change', drawSum);
    const onCart = () => { if (!isCurrent()) return; if (!Cart.items.length) { render({ restore: false }); return; } drawSum(); };
    cartListeners.add(onCart); onLeave(() => cartListeners.delete(onCart));

    const fields = {
      name: (v) => v.trim().length < 2 ? 'يرجى كتابة الاسم الكامل' : '',
      phone: (v) => !v.trim() ? 'يرجى كتابة رقم الهاتف' : !/^07\d{9}$/.test(normPhone(v)) ? 'رقم الهاتف غير صحيح — يجب أن يبدأ بـ 07 ويتكوّن من 11 رقماً' : '',
      governorate: (v) => !v ? 'يرجى اختيار المحافظة' : '',
      address: (v) => v.trim().length < 4 ? 'يرجى كتابة العنوان بالتفصيل' : '',
    };
    let tried = false;
    const check = (name) => {
      const el = form.elements[name], msg = fields[name](el.value), box = el.closest('.field');
      box.classList.toggle('bad', !!msg); box.querySelector('.err').textContent = msg;
      el.setAttribute('aria-invalid', !!msg);
      return !msg;
    };
    Object.keys(fields).forEach((n) => {
      const el = form.elements[n];
      el.addEventListener('blur', () => { if (tried || el.value) check(n); });
      el.addEventListener('input', () => { if (el.closest('.field').classList.contains('bad')) check(n); });
      el.addEventListener('change', () => { if (tried) check(n); });
    });
    form.elements.phone.addEventListener('blur', (e) => { const n = normPhone(e.target.value); if (/^07\d{9}$/.test(n)) e.target.value = n; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      tried = true;
      const ok = Object.keys(fields).map(check).every(Boolean);
      $('#co-err').innerHTML = '';
      if (!ok) { const bad = form.querySelector('.field.bad input, .field.bad select'); bad && bad.focus(); return; }
      const data = Object.fromEntries(new FormData(form));
      const payload = { name: data.name.trim(), phone: normPhone(data.phone), governorate: data.governorate, city: data.city.trim(), address: data.address.trim(), notes: data.notes.trim(), items: Cart.items.map((i) => ({ id: i.id, qty: i.qty })), website: data.website || '' };
      btn.classList.add('loading'); btn.disabled = true; btn.textContent = 'جارٍ إرسال الطلب';
      try {
        const r = await api('/api/orders', { method: 'POST', body: payload });
        store.set('tq_customer', { name: payload.name, phone: payload.phone, governorate: payload.governorate, city: payload.city, address: payload.address });
        sstore.set('tq_last_order', { ...r, phone: payload.phone, items: Cart.items.map(({ name, qty, price, image }) => ({ name, qty, price, total: price * qty, image })), governorate: payload.governorate });
        Cart.clear();
        go('/order/' + enc(r.no), { replace: true });
      } catch (err) {
        if (!isCurrent()) return;
        $('#co-err').innerHTML = noticeHtml([err.message], 'err');
        $('#co-err').scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        btn.classList.remove('loading'); btn.disabled = false; btn.textContent = 'تأكيد الطلب';
        // refresh cart in case stock changed
        if (/المخزون|المتوفرة|متوفراً/.test(err.message)) { try { const n = await syncCart(); if (n.length) $('#co-err').insertAdjacentHTML('beforeend', noticeHtml(n)); drawSum(); } catch { /* */ } }
      }
    });
  }

  // ---------- order confirmation ----------
  async function viewOrder({ params, isCurrent }) {
    const no = params[0].toUpperCase();
    setTitle(`الطلب ${no}`);
    const last = sstore.get('tq_last_order', null);
    const mine = last && last.no === no ? last : null;
    const phone = mine ? mine.phone : (store.get('tq_customer', {}) || {}).phone;
    setMain(`<div class="wrap"><div class="confirm">
      <div class="seal">${icon('check')}</div>
      <span class="eyebrow center">THANK YOU</span>
      <h1 class="title">شكراً لكِ، تم استلام طلبكِ</h1>
      <p class="lead">سنتواصل معكِ قريباً لتأكيد الطلب قبل الشحن. احتفظي برقم الطلب لتتبّعه.</p>
      <div class="orderno"><span class="lbl">رقم الطلب</span><b>${esc(no)}</b><button type="button" id="copy">${icon('copy')}<span>نسخ</span></button></div>
      <div class="box" id="obox">${mine ? orderBox(mine) : `<div class="sk sk-line w60"></div><div class="sk sk-line w80"></div>`}</div>
      <div class="actions"><a class="btn" href="/track?no=${enc(no)}">${icon('box')} تتبع الطلب</a><a class="btn line" href="/shop">متابعة التسوق</a></div>
    </div></div>`);
    $('#copy').addEventListener('click', async (e) => {
      const ok = await copyText(no);
      toast(ok ? 'تم نسخ رقم الطلب' : 'تعذر النسخ', { type: ok ? 'ok' : 'err' });
      if (ok) { const s = e.currentTarget.querySelector('span'); s.textContent = 'تم النسخ'; setTimeout(() => (s.textContent = 'نسخ'), 2000); }
    });
    if (phone) {
      try {
        const o = await api(`/api/orders/track?no=${enc(no)}&phone=${enc(phone)}`);
        if (isCurrent()) $('#obox').innerHTML = orderBox(o);
        return;
      } catch { /* fall through */ }
    }
    if (isCurrent() && !mine) $('#obox').innerHTML = `<p class="muted" style="text-align:center">يمكنكِ متابعة حالة طلبكِ وتفاصيله من صفحة تتبع الطلب باستخدام رقم الطلب ورقم الهاتف.</p>`;
  }
  const orderBox = (o) => `
    ${o.status_label ? `<div class="sumrow"><span>الحالة</span><span>${esc(o.status_label)}</span></div>` : ''}
    ${o.governorate ? `<div class="sumrow"><span>التوصيل إلى</span><span>${esc(o.governorate)}</span></div>` : ''}
    ${o.items && o.items.length ? `<ul class="titems" style="margin:12px 0 6px">${o.items.map(itemRow).join('')}</ul>` : ''}
    <div class="sumrow"><span>المجموع الفرعي</span><span>${moneyHtml(o.subtotal)}</span></div>
    <div class="sumrow"><span>التوصيل</span><span>${Number(o.delivery_fee) ? moneyHtml(o.delivery_fee) : 'مجاني'}</span></div>
    <div class="sumrow total"><span>الإجمالي عند الاستلام</span><span>${moneyHtml(o.total)}</span></div>`;
  const itemRow = (i) => `<li>${media(i.image ? [i.image] : [], i.name, { small: true })}<div>${esc(i.name)}<br><small>${moneyHtml(i.price)} × <span class="num">${i.qty}</span></small></div><span class="p">${moneyHtml(i.total != null ? i.total : i.price * i.qty)}</span></li>`;
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch {
      try { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
    }
  }

  // ---------- track ----------
  const STEPS = [['new', 'تم استلام الطلب', 'clock'], ['confirmed', 'تم التأكيد', 'check'], ['shipping', 'في الطريق', 'truck'], ['delivered', 'تم التسليم', 'home']];
  async function viewTrack({ q, isCurrent }) {
    setTitle('تتبع الطلب');
    const cust = store.get('tq_customer', {}) || {};
    const no0 = (q.get('no') || '').trim(), phone0 = q.get('phone') || (no0 ? cust.phone || '' : '');
    setMain(`<div class="wrap phead center"><nav class="crumbs"><a href="/">الرئيسية</a><i class="sep"></i><span>تتبع الطلب</span></nav><h1 class="title">تتبّعي طلبكِ</h1><p>أدخلي رقم الطلب ورقم الهاتف المستخدم عند الطلب.</p></div>
      <div class="wrap trackpage">
        <form class="track-form" id="tf" novalidate>
          <div class="field"><label for="t-no">رقم الطلب</label><input id="t-no" name="no" dir="ltr" placeholder="TQ-10001" value="${esc(no0)}" autocomplete="off" required><small class="err"></small></div>
          <div class="field"><label for="t-ph">رقم الهاتف</label><input id="t-ph" name="phone" type="tel" inputmode="tel" dir="ltr" placeholder="07XX XXX XXXX" value="${esc(phone0)}" required><small class="err"></small></div>
          <button class="btn" type="submit" id="tbtn">${icon('search')} تتبع</button>
        </form>
        <div id="tres" aria-live="polite"></div>
      </div>`);
    const form = $('#tf'), res = $('#tres'), btn = $('#tbtn');
    const run = async () => {
      const no = form.elements.no.value.trim().toUpperCase(), phone = normPhone(form.elements.phone.value);
      let ok = true;
      const setErr = (name, msg) => { const f = form.elements[name].closest('.field'); f.classList.toggle('bad', !!msg); f.querySelector('.err').textContent = msg; if (msg) ok = false; };
      setErr('no', no ? '' : 'يرجى كتابة رقم الطلب');
      setErr('phone', /^07\d{9}$/.test(phone) ? '' : 'رقم الهاتف غير صحيح');
      if (!ok) return;
      btn.classList.add('loading'); btn.disabled = true;
      res.innerHTML = `<div class="tres"><div class="sk sk-line w40"></div><div class="sk" style="height:60px;margin-top:30px"></div></div>`;
      try {
        const o = await api(`/api/orders/track?no=${enc(no)}&phone=${enc(phone)}`);
        if (!isCurrent()) return;
        history.replaceState(history.state, '', '/track?no=' + enc(o.no));
        res.innerHTML = trackResult(o);
      } catch (e) {
        if (!isCurrent()) return;
        res.innerHTML = `<div class="tres">${noticeHtml([e.message], 'err')}</div>`;
      } finally { btn.classList.remove('loading'); btn.disabled = false; }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
    if (no0 && phone0) run();
  }
  function trackResult(o) {
    const hist = o.history || [];
    const at = (s) => { const h = hist.filter((x) => x.status === s).pop(); return h ? h.at : null; };
    const cancelled = o.status === 'cancelled';
    const idx = STEPS.findIndex(([s]) => s === o.status);
    const timeline = cancelled
      ? `<div class="cancel-box">${icon('xcircle')}<div><b>تم إلغاء هذا الطلب</b><span>${at('cancelled') ? esc(fmtDate(at('cancelled'))) + ' · ' : ''}للاستفسار يرجى التواصل معنا.</span></div></div>`
      : `<ol class="timeline">${STEPS.map(([s, l, ic], i) => {
        const cls = i < idx ? 'done' : i === idx ? (s === 'delivered' ? 'done' : 'cur') : '';
        const t = at(s);
        return `<li class="tstep ${cls}"><span class="tdot">${icon(i < idx || (i === idx && s === 'delivered') ? 'check' : ic)}</span><div><b>${l}</b>${t ? `<small>${esc(fmtDay(t))}</small>` : ''}</div></li>`;
      }).join('')}</ol>`;
    return `<div class="tres page">
      <div class="tres-head"><div><small>رقم الطلب</small><span class="no">${esc(o.no)}</span><small>${esc(fmtDate(o.created_at))}${o.governorate ? ' · ' + esc(o.governorate) : ''}</small></div>
        <span class="status-pill ${esc(o.status)}">${esc(o.status_label || '')}</span></div>
      ${timeline}
      <div class="tgrid">
        <div><h3>المنتجات</h3><ul class="titems">${(o.items || []).map(itemRow).join('')}</ul></div>
        <div><h3>الملخص</h3>
          <div class="sumrow"><span>المجموع الفرعي</span><span>${moneyHtml(o.subtotal)}</span></div>
          <div class="sumrow"><span>التوصيل</span><span>${Number(o.delivery_fee) ? moneyHtml(o.delivery_fee) : 'مجاني'}</span></div>
          <div class="sumrow total"><span>الإجمالي</span><span>${moneyHtml(o.total)}</span></div>
          ${hist.length ? `<h3 style="margin-top:28px">سجل الحالة</h3><ul class="hist">${hist.slice().reverse().map((h) => `<li><span>${esc(h.label || h.status)}</span><span>${esc(fmtDay(h.at))}</span></li>`).join('')}</ul>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ---------- content pages ----------
  function viewAbout() {
    setTitle('من نحن');
    const st = S.store.store, about = String(S.store.about || '').trim();
    setMain(`<div class="wrap phead center"><nav class="crumbs"><a href="/">الرئيسية</a><i class="sep"></i><span>من نحن</span></nav><span class="eyebrow center" style="margin-top:14px">OUR STORY</span><h1 class="title">${esc(st.name)}${st.name_ar ? ` <span class="muted">· ${esc(st.name_ar)}</span>` : ''}</h1>${st.tagline ? `<p>${esc(st.tagline)}</p>` : ''}</div>
      <div class="wrap about-hero">
        <div class="story-art" aria-hidden="true">${icon('crown', 'crown')}<span class="serif">Q</span><small>${esc(String(st.name).toUpperCase())}</small></div>
        <div class="story-txt"><span class="eyebrow">ABOUT</span><p class="prose">${esc(about)}</p><div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn" href="/shop">تسوّقي التشكيلة</a><a class="btn line" href="/contact">تواصلي معنا</a></div></div>
      </div>
      <div class="wrap" style="padding-bottom:90px"><div class="about-values">
        <div><b>01</b><h3>أصالة مضمونة</h3><p>نختار منتجاتنا من مصادر موثوقة، لتحصلي على الجودة التي تستحقينها.</p></div>
        <div><b>02</b><h3>اختيار بعناية</h3><p>تشكيلة منتقاة من العطور ومستحضرات التجميل والعناية تناسب ذوقكِ وروتينكِ.</p></div>
        <div><b>03</b><h3>خدمة تليق بكِ</h3><p>توصيل لجميع المحافظات، دفع عند الاستلام، وفريق جاهز للإجابة على استفساراتكِ.</p></div>
      </div></div>`);
  }
  function viewPolicies() {
    setTitle('السياسات');
    const lines = String(S.store.policies || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const d = S.store.delivery || {};
    setMain(`<div class="wrap phead center"><nav class="crumbs"><a href="/">الرئيسية</a><i class="sep"></i><span>السياسات</span></nav><span class="eyebrow center" style="margin-top:14px">POLICIES</span><h1 class="title">سياسة الدفع والتوصيل والاستبدال</h1></div>
      <div class="prose-wrap wrap">
        ${lines.length ? `<ol class="policy-list">${lines.map((l) => `<li><span>${esc(l)}</span></li>`).join('')}</ol>` : '<p class="muted">لا توجد سياسات منشورة حالياً.</p>'}
        <div class="summary" style="position:static;margin-top:48px"><h2>أجور التوصيل</h2>
          <div class="sumrow"><span>داخل بغداد</span><span>${moneyHtml(d.baghdad)}</span></div>
          <div class="sumrow"><span>باقي المحافظات</span><span>${moneyHtml(d.other)}</span></div>
          ${Number(d.free_over) > 0 ? `<div class="sumrow"><span>توصيل مجاني للطلبات من</span><span>${moneyHtml(d.free_over)}</span></div>` : ''}
          ${Number(d.min_order) > 0 ? `<div class="sumrow"><span>الحد الأدنى للطلب</span><span>${moneyHtml(d.min_order)}</span></div>` : ''}
          <div class="sumrow"><span>طريقة الدفع</span><span>نقداً عند الاستلام</span></div>
        </div>
      </div>`);
  }
  function viewContact() {
    setTitle('تواصلي معنا');
    const st = S.store.store, wa = waNumber(st.whatsapp);
    const items = [];
    const it = (href, ic, label, value, go, ext) => items.push(`<${href ? `a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}` : 'div'} class="contact-i">${icon(ic)}<small>${label}</small><b>${value}</b>${go ? `<span class="go">${go} ${icon('arrow')}</span>` : ''}</${href ? 'a' : 'div'}>`);
    if (st.phone) it(`tel:${normPhone(st.phone) || st.phone}`, 'phone', 'الهاتف', `<span class="ltr">${esc(st.phone)}</span>`, 'اتصلي الآن');
    if (wa) it(`https://wa.me/${wa}`, 'whatsapp', 'واتساب', `<span class="ltr">${esc(st.whatsapp)}</span>`, 'ابدئي المحادثة', true);
    if (st.instagram) it(social('instagram', st.instagram), 'instagram', 'انستغرام', `<span class="ltr">${esc(st.instagram.replace(/^https?:\/\/(www\.)?/, ''))}</span>`, 'تابعينا', true);
    if (st.facebook) it(social('facebook', st.facebook), 'facebook', 'فيسبوك', `<span class="ltr">${esc(st.facebook.replace(/^https?:\/\/(www\.)?/, ''))}</span>`, 'تابعينا', true);
    if (st.tiktok) it(social('tiktok', st.tiktok), 'tiktok', 'تيك توك', `<span class="ltr">${esc(st.tiktok.replace(/^https?:\/\/(www\.)?/, ''))}</span>`, 'تابعينا', true);
    if (st.email) it(`mailto:${st.email}`, 'mail', 'البريد الإلكتروني', esc(st.email), 'راسلينا');
    if (st.address) it('', 'pin', 'العنوان', esc(st.address));
    setMain(`<div class="wrap phead center"><nav class="crumbs"><a href="/">الرئيسية</a><i class="sep"></i><span>تواصلي معنا</span></nav><span class="eyebrow center" style="margin-top:14px">CONTACT</span><h1 class="title">يسعدنا تواصلكِ</h1><p>لأي استفسار عن المنتجات أو الطلبات، فريقنا بانتظاركِ.</p></div>
      <div class="wrap" style="padding-block:50px 100px">
        ${items.length ? `<div class="contacts">${items.join('')}</div>` : `<div class="empty"><p>لم تتم إضافة معلومات التواصل بعد.</p></div>`}
        <div style="text-align:center;margin-top:44px"><a class="link" href="/track">${icon('box')} لديكِ طلب؟ تتبّعيه من هنا</a></div>
      </div>`);
  }
  function viewNotFound({ msg } = {}) {
    setTitle('الصفحة غير موجودة');
    setMain(`<div class="wrap nf"><span class="big">404</span><h1 class="title">الصفحة غير موجودة</h1><p>${esc(msg || 'عذراً، لم نتمكن من العثور على الصفحة التي تبحثين عنها. ربما تم نقلها أو أن الرابط غير صحيح.')}</p><div class="actions"><a class="btn" href="/shop">تصفّحي المتجر</a><a class="btn line" href="/">العودة للرئيسية</a></div></div>`);
  }

  // ================= global events =================
  document.addEventListener('click', (e) => {
    const t = e.target;
    // open/close layers
    const op = t.closest('[data-open]');
    if (op) { e.preventDefault(); Drawer.open(op.dataset.open); return; }
    if (t.closest('[data-close]') || t.classList.contains('scrim')) { if (Sheet.el) Sheet.close(); Drawer.close(); return; }
    // quick add
    const add = t.closest('[data-add]');
    if (add) {
      e.preventDefault();
      const p = known.get(Number(add.dataset.add));
      if (p) addToCart(p, 1);
      return;
    }
    // cart qty / remove (drawer + cart page)
    const qb = t.closest('[data-qty]');
    if (qb) { const id = Number(qb.dataset.qty), it = Cart.find(id); if (it) { Cart.set(id, it.qty + Number(qb.dataset.d)); cartListeners.forEach((f) => f()); } return; }
    const rm = t.closest('[data-rm]');
    if (rm) {
      const id = Number(rm.dataset.rm), it = Cart.find(id);
      Cart.remove(id); cartListeners.forEach((f) => f());
      if (it) toast(`أُزيل «${it.name}» من السلة`);
      return;
    }
    const blocked = t.closest('[data-block]');
    if (blocked) { e.preventDefault(); toast('لم تصلي للحد الأدنى للطلب بعد', { type: 'err' }); return; }
    // internal links
    const a = t.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/media/') || url.pathname.startsWith('/api/') || /\.\w{2,5}$/.test(url.pathname)) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) {
      e.preventDefault(); const el = document.getElementById(decodeURIComponent(url.hash.slice(1))); if (el) { el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }); } Drawer.close(); return;
    }
    e.preventDefault();
    if (url.pathname + url.search === location.pathname + location.search) { Drawer.close(); Sheet.close(); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); return; }
    go(url.pathname + url.search + url.hash);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (Sheet.el) Sheet.close(); else Drawer.close(); }
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); Drawer.open('search'); }
  });
  window.addEventListener('popstate', () => render({ restore: true }));
  const onScroll = () => { const h = $('#header'); if (h) h.classList.toggle('scrolled', window.scrollY > 30); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('beforeunload', () => { scrolls[key()] = window.scrollY; sstore.set('tq_scroll', scrolls); });

  // ================= boot =================
  async function boot() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (!history.state || !history.state.k) history.replaceState({ k: Math.random().toString(36).slice(2, 10) }, '', location.href);
    Cart.load();
    let tries = 0;
    for (;;) {
      try { S.store = await api('/api/store'); break; } catch (e) {
        if (++tries >= 3) {
          $('#main').innerHTML = `<div class="wrap err-state"><span class="boot-mark" style="animation:none">Q</span><h2 class="title">تعذر تحميل المتجر</h2><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">إعادة المحاولة</button></div>`;
          return;
        }
        await sleep(800 * tries);
      }
    }
    S.store.store = S.store.store || {};
    S.store.store.name = S.store.store.name || 'The Queen';
    S.currency = S.store.store.currency || 'د.ع';
    S.cats = S.store.categories || [];
    renderShell();
    onScroll();
    await render({ restore: true });
  }
  boot();
})();
