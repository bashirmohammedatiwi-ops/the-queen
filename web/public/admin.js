/* The Queen — remote control panel. Changes go to a queue that the store's admin system applies itself. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } }, del(k) { try { localStorage.removeItem(k); } catch { /* */ } } };
  const toLatin = (s) => String(s ?? '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
  const tmpId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const vibrate = (m = 10) => { try { navigator.vibrate && navigator.vibrate(m); } catch { /* */ } };

  // ---------- icons ----------
  const P = {
    home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z"/>',
    orders: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6M9 15.5h3"/>',
    box: '<path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9z"/><path d="M4 7.5 12 11.5l8-4M12 11.5v9"/>',
    store: '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12v8h13v-8"/><path d="M10 20v-4.5h4V20"/>',
    more: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    back: '<path d="M5 12h14m-5-5 5 5-5 5"/>', left: '<path d="m15 6-6 6 6 6"/>', right: '<path d="m9 6 6 6-6 6"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.2a10 10 0 0 0 5.8 5.8L16 13l4 1.5v3A2 2 0 0 1 18 19.5 15 15 0 0 1 4.5 6 2 2 0 0 1 6.5 4z"/>',
    whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.8z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5H5v11h3"/>', truck: '<path d="M3 6.5h11v10H3zM14 10h3.5l3 3v3.5H14"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/>', alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4M12 17h.01"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    out: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>', tag: '<path d="M4 12.5V5a1 1 0 0 1 1-1h7.5L20 11.5 12.5 19z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
    crown: '<path d="M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z"/><path d="M4.5 20.5h15"/>', grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    text: '<path d="M5 6h14M5 11h14M5 16h9"/>', refresh: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4.5V8h-3.5"/>', globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>',
    layers: '<path d="m12 4 8 4-8 4-8-4z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/>', cash: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  };
  const icon = (n) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

  // ---------- api ----------
  let TOKEN = ls.get('tqa_token', ''), USER = ls.get('tqa_user', null);
  async function api(url, opts = {}) {
    let r;
    try {
      r = await fetch('/api/admin' + url, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch { throw new Error('تعذر الاتصال بالإنترنت'); }
    let d = {}; try { d = await r.json(); } catch { /* */ }
    if (r.status === 401 && !url.startsWith('/login')) { logout(true); throw new Error(d.error || 'انتهت الجلسة'); }
    if (!r.ok) throw Object.assign(new Error(d.error || 'حدث خطأ'), { status: r.status });
    return d;
  }
  const change = async (kind, payload) => { const r = await api('/change', { method: 'POST', body: { kind, payload } }); refreshSoon(); return r; };

  // ---------- state ----------
  let ST = null, SUM = null, route = 'home', routeArg = '';
  const CUR = () => (ST && ST.currency) || 'د.ع';
  const money = (n) => `<span class="num">${Math.round(Number(n) || 0).toLocaleString('en-US')}</span> ${esc(CUR())}`;
  const media = (f) => (f ? '/media/' + f : '');
  const thumb = (f, cls = '') => `<span class="th ${cls}">${f ? `<img src="${esc(media(f))}" alt="" loading="lazy">` : icon('image')}</span>`;
  const mains = () => ST.web_categories.filter((c) => !c.parent_id).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const subsOf = (id) => ST.web_categories.filter((c) => c.parent_id && String(c.parent_id) === String(id));
  const catName = (id) => (ST.web_categories.find((c) => String(c.id) === String(id)) || {}).name || '';
  const brandName = (id) => (ST.brands.find((b) => String(b.id) === String(id)) || {}).name || '';
  const missing = (p) => [!(p.web_images || []).length && 'صور', !(p.web_description || '').trim() && 'وصف', !p.web_cat_id && 'قسم', !p.web_brand_id && 'براند'].filter(Boolean);
  const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; if (!isFinite(s)) return ''; if (s < 60) return 'الآن'; if (s < 3600) return `قبل ${Math.round(s / 60)} د`; if (s < 86400) return `قبل ${Math.round(s / 3600)} س`; return new Date(iso).toLocaleDateString('ar-IQ-u-nu-latn', { day: 'numeric', month: 'short' }); };
  const fmtDT = (iso) => { try { return new Date(iso).toLocaleString('ar-IQ-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return iso; } };
  const ST_L = { new: 'جديد', confirmed: 'مؤكد', shipping: 'قيد التوصيل', delivered: 'تم التسليم', cancelled: 'ملغي' };
  const NEXT = { new: ['confirmed', 'تأكيد الطلب', 'check'], confirmed: ['shipping', 'تسليم للتوصيل', 'truck'], shipping: ['delivered', 'تم التسليم', 'check'] };

  async function loadState() { ST = await api('/state'); }
  async function loadSum() { SUM = await api('/summary'); drawChrome(); }
  let lastKey = '';
  const refreshSoon = debounce(async () => {
    try { await Promise.all([loadState(), loadSum()]); if (!$('.sheet.on')) render(); } catch { /* */ }
  }, 400);
  // poll: new orders + applied changes
  setInterval(async () => {
    if (!TOKEN || document.hidden) return;
    try {
      const prevNew = SUM ? SUM.counts.new || 0 : 0;
      await loadSum();
      const key = SUM.synced_at + '|' + SUM.pending;
      if ((SUM.counts.new || 0) > prevNew) { toast(`طلب جديد من الموقع (${SUM.counts.new} جديد)`); vibrate([20, 40, 20]); beep(); if (route === 'orders' || route === 'home') render(); }
      if (key !== lastKey) { lastKey = key; await loadState(); if (!$('.sheet.on')) render(); }
    } catch { /* */ }
  }, 12000);
  function beep() { try { const ac = new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.07, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.5); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.5); } catch { /* */ } }

  // ---------- toasts ----------
  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `${icon(type === 'err' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    while ($('#toasts').children.length > 2) $('#toasts').firstChild.remove();
    setTimeout(() => el.remove(), 3200);
  }
  const fail = (e) => toast(e.message || String(e), 'err');
  const pendNote = () => (SUM && SUM.live ? 'تم الحفظ — يُطبَّق في النظام خلال ثوانٍ' : 'تم الحفظ — سيُطبَّق عند اتصال النظام الإداري');

  // ---------- sheet ----------
  function sheet({ title, body, foot = '', full = false, onClose }) {
    closeSheet(true);
    const L = $('#layer');
    L.innerHTML = `<div class="scrim"></div><div class="sheet ${full ? 'full' : ''}" role="dialog" aria-label="${esc(title)}"><div class="sh-h"><h2>${title}</h2><button class="ib" data-x aria-label="إغلاق">${icon('close')}</button></div><div class="sh-b">${body}</div>${foot ? `<div class="sh-f">${foot}</div>` : ''}</div>`;
    const el = $('.sheet', L);
    document.documentElement.classList.add('lock');
    requestAnimationFrame(() => { $('.scrim', L).classList.add('on'); el.classList.add('on'); });
    const close = () => closeSheet();
    $('.scrim', L).onclick = close; $('[data-x]', el).onclick = close;
    sheetClose = onClose || null;
    if (!(history.state && history.state.sheet)) history.pushState({ sheet: 1 }, '');
    return el;
  }
  let sheetClose = null;
  function closeSheet(silent) {
    const L = $('#layer'); if (!L.innerHTML) return;
    const el = $('.sheet', L);
    if (el) { el.classList.remove('on'); $('.scrim', L).classList.remove('on'); }
    document.documentElement.classList.remove('lock');
    const cb = sheetClose; sheetClose = null;
    if (silent) { L.innerHTML = ''; } else setTimeout(() => { if (!$('.sheet.on', L)) L.innerHTML = ''; }, 300);
    if (!silent && history.state && history.state.sheet) history.back();
    if (cb) cb();
  }
  window.addEventListener('popstate', () => { if ($('#layer').innerHTML) { const L = $('#layer'); const el = $('.sheet', L); if (el) el.classList.remove('on'); $('.scrim', L)?.classList.remove('on'); document.documentElement.classList.remove('lock'); setTimeout(() => { L.innerHTML = ''; }, 300); const cb = sheetClose; sheetClose = null; if (cb) cb(); } else readHash(); });
  const confirmBox = (msg, okText = 'تأكيد', danger = false) => new Promise((res) => {
    const el = sheet({ title: 'تأكيد', body: `<p style="font-size:15px;line-height:1.8">${msg}</p>`, foot: `<button class="btn line" data-n>إلغاء</button><button class="btn ${danger ? 'err' : ''}" data-y>${okText}</button>`, onClose: () => res(false) });
    $('[data-y]', el).onclick = () => { sheetClose = null; closeSheet(); res(true); };
    $('[data-n]', el).onclick = () => closeSheet();
  });

  // ---------- images ----------
  function pickImages({ multiple = true, max = 1400 } = {}) {
    return new Promise((resolve) => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = multiple;
      inp.onchange = () => resolve(Array.from(inp.files || []).map((file) => ({ file, max })));
      inp.click();
    });
  }
  async function upload({ file, max }) {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('صورة غير صالحة')); i.src = URL.createObjectURL(file); });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    return (await api('/media', { method: 'POST', body: { data: c.toDataURL('image/jpeg', 0.86) } })).name;
  }
  // image list editor bound to an array
  function imageEditor(box, arr, { limit = 10, onChange } = {}) {
    let busy = 0;
    const draw = () => {
      box.innerHTML = `<div class="imgs">${arr.map((f, i) => `<div class="im ${i === 0 && limit > 1 ? 'main' : ''}"><img src="${esc(media(f))}" alt=""><div class="acts">${i > 0 && limit > 1 ? `<button type="button" data-first="${i}" aria-label="اجعلها الرئيسية">${icon('star')}</button>` : '<span></span>'}<button type="button" data-rm="${i}" aria-label="حذف">${icon('trash')}</button></div>${i === 0 && limit > 1 ? '<span class="lbl">الرئيسية</span>' : ''}</div>`).join('')}
        ${Array.from({ length: busy }, () => '<div class="up"><span class="spin"></span></div>').join('')}
        ${arr.length + busy < limit ? `<button type="button" class="add" data-add>${icon('plus')}${limit > 1 ? 'إضافة صور' : 'اختيار صورة'}</button>` : ''}</div>`;
      $$('[data-rm]', box).forEach((b) => (b.onclick = () => { arr.splice(Number(b.dataset.rm), 1); draw(); onChange && onChange(); }));
      $$('[data-first]', box).forEach((b) => (b.onclick = () => { const [x] = arr.splice(Number(b.dataset.first), 1); arr.unshift(x); draw(); onChange && onChange(); }));
      const add = $('[data-add]', box);
      if (add) add.onclick = async () => {
        const files = (await pickImages({ multiple: limit > 1 })).slice(0, limit - arr.length);
        busy += files.length; draw();
        for (const f of files) { try { arr.push(await upload(f)); } catch (e) { fail(e); } busy--; draw(); }
        onChange && onChange();
      };
    };
    draw();
    return { busy: () => busy > 0 };
  }

  // ---------- login ----------
  function viewLogin(msg = '') {
    $('#app').innerHTML = `<div class="login"><form class="login-card" id="lf" autocomplete="on">
      <div class="mark">Q</div><h1>لوحة تحكم The Queen</h1><p>ادخل بنفس حساب النظام الإداري (مدير)</p>
      <div class="fields">
        <label class="f"><span>اسم المستخدم</span><input name="username" autocomplete="username" autocapitalize="off" required></label>
        <label class="f"><span>كلمة المرور</span><input name="password" type="password" autocomplete="current-password" required></label>
        <div id="le">${msg ? `<div class="alert err">${icon('alert')}<span>${esc(msg)}</span></div>` : ''}</div>
        <button class="btn block" id="lb">تسجيل الدخول</button>
      </div></form></div>`;
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target), b = $('#lb');
      b.classList.add('loading');
      try {
        const r = await api('/login', { method: 'POST', body: { username: fd.get('username'), password: fd.get('password') } });
        TOKEN = r.token; USER = r.user; ls.set('tqa_token', TOKEN); ls.set('tqa_user', USER);
        boot();
      } catch (er) { $('#le').innerHTML = `<div class="alert err">${icon('alert')}<span>${esc(er.message)}</span></div>`; b.classList.remove('loading'); }
    };
  }
  function logout(silent) {
    if (TOKEN && !silent) api('/logout', { method: 'POST' }).catch(() => {});
    TOKEN = ''; USER = null; ls.del('tqa_token'); ls.del('tqa_user'); ST = null;
    closeSheet(true); viewLogin();
  }

  // ---------- shell ----------
  const NAV = [['home', 'الرئيسية', 'home'], ['orders', 'الطلبات', 'orders'], ['products', 'المنتجات', 'box'], ['store', 'المتجر', 'store'], ['more', 'المزيد', 'more']];
  const TITLES = { home: 'لوحة التحكم', orders: 'طلبات الموقع', products: 'المنتجات', store: 'المتجر', more: 'المزيد' };
  function shell() {
    $('#app').innerHTML = `
      <aside class="side"><div class="brand">THE QUEEN</div><small>لوحة التحكم عن بعد</small>
        ${NAV.map(([k, l, ic]) => `<a href="#/${k}" data-nav="${k}">${icon(ic)}<span>${l}</span>${k === 'orders' ? '<span class="dot hide" data-newc></span>' : ''}</a>`).join('')}
        <span class="sp"></span><a href="/" target="_blank" rel="noopener">${icon('globe')}<span>فتح الموقع</span></a><a href="#" data-logout>${icon('out')}<span>تسجيل الخروج</span></a></aside>
      <div class="shell">
        <header class="top"><div class="top-in"><h1 id="ttl"></h1><span class="conn" id="conn"></span><div class="head-acts" id="hacts"></div></div></header>
        <main id="view"></main>
      </div>
      <nav class="tabs">${NAV.map(([k, l, ic]) => `<a class="tab" href="#/${k}" data-nav="${k}">${icon(ic)}<span>${l}</span>${k === 'orders' ? '<span class="dot hide" data-newc></span>' : ''}</a>`).join('')}</nav>
      <button class="fab hide" id="fab" aria-label="إضافة">${icon('plus')}</button>`;
    $('[data-logout]').onclick = (e) => { e.preventDefault(); logout(); };
    window.addEventListener('scroll', () => $('.top') && $('.top').classList.toggle('edge', scrollY > 4), { passive: true });
  }
  function drawChrome() {
    if (!SUM || !$('#conn')) return;
    const c = $('#conn');
    c.className = 'conn ' + (SUM.live ? 'on' : 'off');
    c.textContent = SUM.live ? 'النظام متصل' : 'النظام غير متصل';
    c.title = SUM.synced_at ? 'آخر مزامنة ' + fmtDT(SUM.synced_at) : '';
    const n = SUM.counts.new || 0;
    $$('[data-newc]').forEach((d) => { d.textContent = n; d.classList.toggle('hide', !n); });
  }
  function readHash() {
    const h = location.hash.replace(/^#\/?/, '').split('/');
    route = NAV.some((n) => n[0] === h[0]) ? h[0] : 'home'; routeArg = h[1] || '';
    render();
  }
  window.addEventListener('hashchange', () => { closeSheet(true); readHash(); });

  function render() {
    if (!ST || !$('#view')) return;
    $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === route));
    $('#ttl').textContent = TITLES[route];
    $('#hacts').innerHTML = '';
    const fab = $('#fab'); fab.classList.add('hide'); fab.onclick = null;
    drawChrome();
    ({ home: vHome, orders: vOrders, products: vProducts, store: vStore, more: vMore })[route]();
  }
  const setView = (html) => { $('#view').innerHTML = `<div class="view">${html}</div>`; };
  const setFab = (fn, label) => {
    const fab = $('#fab'); fab.classList.remove('hide'); fab.onclick = fn; fab.setAttribute('aria-label', label);
    $('#hacts').innerHTML = `<button class="btn sm" id="hadd">${icon('plus')} ${label}</button>`; $('#hadd').onclick = fn;
  };

  // ---------- home ----------
  async function vHome() {
    const S = SUM || { counts: {}, today: { n: 0, total: 0 }, week: [], failed: [], top: [] };
    const prods = ST.products, pub = prods.filter((p) => p.web_published);
    const miss = pub.filter((p) => missing(p).length), outPub = pub.filter((p) => p.stock - (p.reserved || 0) <= 0);
    const open = (S.counts.new || 0) + (S.counts.confirmed || 0) + (S.counts.shipping || 0);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() + 3 * 3600e3 - (6 - i) * 86400e3).toISOString().slice(0, 10); const w = (S.week || []).find((x) => x.d === d); return { d, n: w ? w.n : 0, t: w ? w.t : 0 }; });
    const maxT = Math.max(1, ...days.map((d) => d.t));
    const dn = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
    let recent = [];
    try { recent = (await api('/orders?status=open')).orders.slice(0, 5); } catch { /* */ }
    if (route !== 'home') return;
    setView(`
      <p class="muted" style="margin:2px 2px 12px">أهلاً ${esc((USER && USER.name) || '')} 👋</p>
      ${!S.live ? `<div class="alert warn" style="margin:0 0 12px">${icon('alert')}<span>النظام الإداري في المتجر غير متصل الآن. يمكنك إجراء التعديلات وستُطبَّق تلقائياً عند تشغيله.${S.synced_at ? ` آخر اتصال ${ago(S.synced_at)}.` : ''}</span></div>` : ''}
      ${S.pending ? `<div class="alert info" style="margin:0 0 12px">${icon('clock')}<span><b class="num">${S.pending}</b> تعديل بانتظار التطبيق في النظام</span></div>` : ''}
      ${(S.failed || []).length ? `<div class="alert err" style="margin:0 0 12px">${icon('alert')}<span>بعض التعديلات لم تُطبَّق: ${esc(S.failed[0].error || '')} <a href="#/more">التفاصيل</a></span></div>` : ''}
      <div class="dash"><div>
        <div class="kpis">
          <div class="kpi hero">${icon('cash')}<small>طلبات اليوم</small><b>${money(S.today.total)}</b><small><span class="num">${S.today.n}</span> طلب</small>
            <div class="bars">${days.map((d, i) => `<i class="${i === 6 ? 't' : ''}" style="height:${Math.max(6, (d.t / maxT) * 100)}%" title="${d.n} طلب"></i>`).join('')}</div>
            <div class="bars-l">${days.map((d) => `<span>${dn[new Date(d.d + 'T12:00:00').getDay()]}</span>`).join('')}</div></div>
          <a class="kpi click" href="#/orders/new">${icon('orders')}<small>طلبات جديدة</small><b class="num">${S.counts.new || 0}</b></a>
          <a class="kpi click" href="#/orders/open">${icon('truck')}<small>قيد التنفيذ</small><b class="num">${open}</b></a>
          <a class="kpi click" href="#/products/pub">${icon('globe')}<small>منشور في الموقع</small><b class="num">${pub.length}<small style="display:inline;font-size:13px"> / ${prods.length}</small></b></a>
          <a class="kpi click" href="#/products/todo">${icon('alert')}<small>ناقصة البيانات</small><b class="num">${miss.length}</b></a>
        </div>
        ${outPub.length ? `<div class="alert warn">${icon('box')}<span><b class="num">${outPub.length}</b> منتج منشور نفد من المخزون — <a href="#/products/out">عرض</a></span></div>` : ''}
        <div class="sec-t"><span>إجراءات سريعة</span></div>
        <div class="list" style="grid-template-columns:1fr 1fr">
          <button class="row" data-q="np">${icon('plus')}<span class="b"><span class="t">منتج جديد</span></span></button>
          <button class="row" data-q="nb">${icon('image')}<span class="b"><span class="t">بنر جديد</span></span></button>
          <a class="row" href="#/store/cats">${icon('grid')}<span class="b"><span class="t">الأقسام</span></span></a>
          <a class="row" href="#/store/content">${icon('text')}<span class="b"><span class="t">محتوى الموقع</span></span></a>
        </div>
      </div><div>
        <div class="sec-t"><span>طلبات تحتاج متابعة</span><a href="#/orders/open">الكل</a></div>
        <div class="list">${recent.length ? recent.map(orderRow).join('') : `<div class="card empty">${icon('check')}لا توجد طلبات مفتوحة</div>`}</div>
        ${(S.top || []).length ? `<div class="sec-t"><span>الأكثر طلباً (30 يوم)</span></div><div class="card card-b">${S.top.map((t, i) => `<div style="display:flex;justify-content:space-between;padding:6px 0;${i ? 'border-top:1px solid var(--line)' : ''}"><span>${esc(t.name)}</span><b class="num">${t.q}</b></div>`).join('')}</div>` : ''}
      </div></div>`);
    bindOrderRows(recent);
    $('[data-q="np"]').onclick = () => editProduct(null);
    $('[data-q="nb"]').onclick = () => editBanner(null);
  }

  // ---------- orders ----------
  const orderRow = (o) => `<button class="row" data-ord="${esc(o.no)}">
    <span class="b"><span class="t"><span class="ltr">${esc(o.no)}</span> · ${esc(o.name)}</span><span class="s"><span>${esc(o.governorate || '')}</span><span>${ago(o.created_at)}</span><span class="num">${o.items.reduce((a, i) => a + i.qty, 0)} قطعة</span></span></span>
    <span class="e"><span class="pill ${esc(o.status)}">${ST_L[o.status]}</span><b>${money(o.total)}</b></span></button>`;
  let ordersCache = [];
  const bindOrderRows = (list) => { ordersCache = list; $$('[data-ord]').forEach((b) => (b.onclick = () => orderSheet(list.find((o) => o.no === b.dataset.ord)))); };
  async function vOrders() {
    const tabs = [['open', 'المفتوحة'], ['new', 'جديد'], ['confirmed', 'مؤكد'], ['shipping', 'قيد التوصيل'], ['delivered', 'تم التسليم'], ['cancelled', 'ملغي'], ['', 'الكل']];
    const st = routeArg || 'open';
    const c = (SUM && SUM.counts) || {};
    const cnt = (k) => (k === 'open' ? (c.new || 0) + (c.confirmed || 0) + (c.shipping || 0) : k ? c[k] || 0 : Object.values(c).reduce((a, b) => a + b, 0));
    setView(`<div class="search">${icon('search')}<input id="oq" placeholder="رقم الطلب، الاسم أو الهاتف" inputmode="search"></div>
      <div class="chips">${tabs.map(([k, l]) => `<a class="chip ${st === k || (!routeArg && k === 'open') ? 'on' : ''}" href="#/orders/${k}">${l} <small class="num">${cnt(k)}</small></a>`).join('')}</div>
      <div class="list grid2" id="ol"><div class="empty"><span class="spin" style="display:inline-block"></span></div></div>`);
    const load = async () => {
      const q = $('#oq').value.trim();
      try {
        const r = await api(`/orders?status=${enc(st)}${q ? '&q=' + enc(q) : ''}`);
        if (route !== 'orders') return;
        $('#ol').innerHTML = r.orders.length ? r.orders.map(orderRow).join('') : `<div class="card empty" style="grid-column:1/-1">${icon('orders')}لا توجد طلبات</div>`;
        bindOrderRows(r.orders);
      } catch (e) { fail(e); }
    };
    $('#oq').oninput = debounce(load, 300);
    load();
  }
  function orderSheet(o) {
    if (!o) return;
    const flow = ['new', 'confirmed', 'shipping', 'delivered'], idx = flow.indexOf(o.status);
    const wa = String(o.phone || '').replace(/^0/, '964');
    const nx = NEXT[o.status];
    const msg = `مرحباً ${o.name}، معكِ متجر The Queen بخصوص طلبكِ ${o.no} بقيمة ${Math.round(o.total).toLocaleString('en-US')} ${CUR()}.`;
    const el = sheet({
      title: `الطلب <span class="ltr">${esc(o.no)}</span>`, full: true,
      body: `<div class="box"><div class="od-h"><div><small class="muted">${fmtDT(o.created_at)}</small></div><span class="pill ${esc(o.status)}">${ST_L[o.status]}</span></div>
          ${o.status !== 'cancelled' ? `<div class="tl">${flow.map((_, i) => `<i class="${i <= idx ? 'd' : ''}"></i>`).join('')}</div><div class="tl-l">${flow.map((s) => `<span>${ST_L[s]}</span>`).join('')}</div>` : ''}</div>
        <div class="box"><h3>${icon('phone')} الزبون</h3><dl class="kv"><dt>الاسم</dt><dd>${esc(o.name)}</dd><dt>الهاتف</dt><dd class="ltr">${esc(o.phone)}</dd><dt>المحافظة</dt><dd>${esc(o.governorate || '')}${o.city ? ' — ' + esc(o.city) : ''}</dd><dt>العنوان</dt><dd>${esc(o.address || '')}</dd>${o.notes ? `<dt>ملاحظات</dt><dd>${esc(o.notes)}</dd>` : ''}</dl>
          <div class="acts2"><a class="btn line sm" href="tel:${esc(o.phone)}">${icon('phone')} اتصال</a><a class="btn wa sm" href="https://wa.me/${esc(wa)}?text=${enc(msg)}" target="_blank" rel="noopener">${icon('whatsapp')} واتساب</a></div>
          <button class="btn line sm block" style="margin-top:8px" data-copy>${icon('copy')} نسخ العنوان للتوصيل</button></div>
        <div class="box"><h3>${icon('box')} المنتجات</h3><div class="items"><ul>${o.items.map((i) => `<li style="margin-bottom:8px">${thumb(i.image)}<span class="n">${esc(i.name)}<br><small class="muted">${money(i.price)} × <span class="num">${i.qty}</span></small></span><b>${money(i.total ?? i.price * i.qty)}</b></li>`).join('')}</ul></div>
          <div class="sum"><div><span>المجموع</span><span>${money(o.subtotal)}</span></div><div><span>التوصيل</span><span>${o.delivery_fee ? money(o.delivery_fee) : 'مجاني'}</span></div><div class="tot"><span>الإجمالي عند الاستلام</span><span>${money(o.total)}</span></div></div></div>
        ${o.history && o.history.length ? `<div class="box"><h3>${icon('clock')} السجل</h3>${o.history.slice().reverse().map((h) => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span>${ST_L[h.status] || h.status}</span><span class="muted">${fmtDT(h.at)}</span></div>`).join('')}</div>` : ''}`,
      foot: nx ? `${o.status !== 'delivered' ? '<button class="btn err" data-cancel style="flex:none">إلغاء</button>' : ''}<button class="btn ${nx[0] === 'delivered' ? 'ok' : ''}" data-next>${icon(nx[2])} ${nx[1]}</button>` : '',
    });
    const copyAddr = `${o.name}\n${o.phone}\n${o.governorate || ''} ${o.city || ''}\n${o.address || ''}\nالمبلغ: ${Math.round(o.total).toLocaleString('en-US')} ${CUR()}`;
    $('[data-copy]', el).onclick = async () => { try { await navigator.clipboard.writeText(copyAddr); toast('تم النسخ'); } catch { toast('تعذر النسخ', 'err'); } };
    const setSt = async (status, payment) => {
      try { await api('/orders/' + enc(o.no), { method: 'PUT', body: { status, payment } }); vibrate(); toast(`تم: ${ST_L[status]}`); sheetClose = null; closeSheet(); loadSum().then(render); } catch (e) { fail(e); }
    };
    const nb = $('[data-next]', el);
    if (nb) nb.onclick = async () => {
      if (nx[0] !== 'delivered') return setSt(nx[0]);
      const pe = sheet({ title: 'تأكيد التسليم', body: `<p class="muted" style="margin-bottom:10px">سيتم إصدار فاتورة في النظام وخصم المخزون. طريقة استلام المبلغ:</p>
        ${[['cash', 'نقداً (من شركة التوصيل)'], ['card', 'بطاقة / تحويل'], ['credit', 'آجل على حساب الزبون']].map(([k, l], i) => `<label class="tg"><span>${l}</span><input type="radio" name="pm" value="${k}" ${i ? '' : 'checked'}><span class="sw"></span></label>`).join('')}`,
        foot: '<button class="btn ok" data-ok>تأكيد التسليم</button>' });
      $('[data-ok]', pe).onclick = () => setSt('delivered', ($('input[name=pm]:checked', pe) || {}).value || 'cash');
    };
    const cb = $('[data-cancel]', el);
    if (cb) cb.onclick = async () => { if (await confirmBox(`إلغاء الطلب ${esc(o.no)}؟ ستعود الكمية للمخزون المتاح في الموقع.`, 'إلغاء الطلب', true)) setSt('cancelled'); };
  }

  // ---------- products ----------
  let pq = '';
  function vProducts() {
    const f = routeArg || 'all';
    const P = ST.products;
    const filters = [['all', 'الكل', P.length], ['pub', 'منشور', P.filter((p) => p.web_published).length], ['unpub', 'غير منشور', P.filter((p) => !p.web_published).length],
      ['todo', 'ناقص البيانات', P.filter((p) => p.web_published && missing(p).length).length], ['out', 'نفد', P.filter((p) => p.stock - (p.reserved || 0) <= 0).length], ['pending', 'قيد التطبيق', P.filter((p) => p._pending).length]];
    setView(`<div class="search">${icon('search')}<input id="pq" placeholder="ابحث بالاسم أو الباركود" value="${esc(pq)}" inputmode="search"></div>
      <div class="chips">${filters.filter(([k, , n]) => n || k === 'all' || k === f).map(([k, l, n]) => `<a class="chip ${f === k ? 'on' : ''}" href="#/products/${k}">${l} <small class="num">${n}</small></a>`).join('')}</div>
      <div class="list grid2" id="pl"></div>`);
    const draw = () => {
      const q = pq.trim().toLowerCase();
      const list = P.filter((p) => (!q || String(p.name).toLowerCase().includes(q) || String(p.barcode || '').includes(q))
        && (f === 'pub' ? p.web_published : f === 'unpub' ? !p.web_published : f === 'todo' ? p.web_published && missing(p).length : f === 'out' ? p.stock - (p.reserved || 0) <= 0 : f === 'pending' ? p._pending : true));
      $('#pl').innerHTML = list.length ? list.slice(0, 300).map((p) => {
        const m = missing(p), avail = p.stock - (p.reserved || 0);
        return `<button class="row" data-p="${esc(p.id)}">${thumb((p.web_images || [])[0])}
          <span class="b"><span class="t">${esc(p.name)}</span><span class="s"><span class="${avail <= 0 ? '' : ''}" style="${avail <= 0 ? 'color:var(--err)' : ''}">المتاح <span class="num">${Math.max(0, avail)}</span></span>${p.web_cat_id ? `<span>${esc(catName(p.web_sub_id) || catName(p.web_cat_id))}</span>` : ''}${p.web_brand_id ? `<span>${esc(brandName(p.web_brand_id))}</span>` : ''}</span>
          <span class="s" style="margin-top:4px">${p._pending ? '<span class="pill pend">قيد التطبيق</span>' : ''}${p.web_published ? '<span class="pill ok">منشور</span>' : '<span class="pill">غير منشور</span>'}${p.web_published && m.length ? `<span class="pill warn">ينقص ${m.join('، ')}</span>` : ''}</span></span>
          <span class="e"><b>${money(p.price)}</b>${p.web_compare_price > p.price ? `<small class="muted" style="text-decoration:line-through">${money(p.web_compare_price)}</small>` : ''}</span></button>`;
      }).join('') + (list.length > 300 ? `<div class="empty" style="grid-column:1/-1">يظهر أول 300 — استخدم البحث</div>` : '') : `<div class="card empty" style="grid-column:1/-1">${icon('box')}لا توجد منتجات</div>`;
      $$('[data-p]').forEach((b) => (b.onclick = () => editProduct(P.find((p) => String(p.id) === b.dataset.p))));
    };
    $('#pq').oninput = debounce((e) => { pq = e.target.value; draw(); }, 150);
    draw();
    setFab(() => editProduct(null), 'منتج جديد');
  }
  const opt = (list, sel, empty) => `<option value="">${empty}</option>` + list.map((x) => `<option value="${esc(x.id)}" ${String(x.id) === String(sel ?? '') ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  function editProduct(p) {
    const isNew = !p;
    p = p ? { ...p } : { id: tmpId(), name: '', price: '', unit: 'حبة', web_images: [], web_published: 1, stock: 0 };
    const imgs = [...(p.web_images || [])];
    const el = sheet({
      title: isNew ? 'منتج جديد' : esc(p.name), full: true,
      body: `<form id="pf" onsubmit="return false">
        ${p._pending ? `<div class="alert info" style="margin:0 0 12px">${icon('clock')}<span>توجد تعديلات على هذا المنتج بانتظار التطبيق في النظام.</span></div>` : ''}
        <div class="box"><h3>${icon('image')} الصور <small class="muted" style="font-weight:400">(حتى 10 — الأولى هي الرئيسية)</small></h3><div id="pimgs"></div></div>
        <div class="box"><h3>${icon('box')} المعلومات الأساسية</h3><div class="fields two">
          <label class="f full"><span>اسم المنتج *</span><input name="name" value="${esc(p.name)}" required maxlength="150"></label>
          <label class="f"><span>سعر البيع *</span><input name="price" inputmode="numeric" value="${esc(p.price)}" required></label>
          <label class="f"><span>السعر قبل الخصم <small>(اختياري)</small></span><input name="web_compare_price" inputmode="numeric" value="${esc(p.web_compare_price || '')}"></label>
          <label class="f"><span>الباركود <small>(يُولّد تلقائياً إن تُرك فارغاً)</small></span><input name="barcode" dir="ltr" inputmode="numeric" value="${esc(p.barcode || '')}"></label>
          <label class="f"><span>الوحدة</span><input name="unit" list="units" value="${esc(p.unit || 'حبة')}"><datalist id="units">${(ST.units || []).map((u) => `<option value="${esc(u)}">`).join('')}</datalist></label>
          <label class="f"><span>تصنيف المخزون</span><select name="category_id">${opt(ST.store_categories, p.category_id, '— بدون —')}</select></label>
          <label class="f"><span>حد التنبيه للمخزون</span><input name="min_stock" inputmode="numeric" value="${esc(p.min_stock ?? 0)}"></label>
          ${isNew ? `<label class="f"><span>الكمية الافتتاحية</span><input name="opening_stock" inputmode="numeric" value="0"></label><label class="f"><span>التكلفة للحبة <small>(اختياري)</small></span><input name="cost" inputmode="numeric" value=""></label>`
            : `<div class="f full"><span>الكمية في المخزون</span><div style="display:flex;gap:8px;align-items:center"><span class="in" style="display:flex;align-items:center;flex:1;background:var(--bg)"><b class="num">${p.stock}</b>${p.reserved ? `<small class="muted" style="margin-inline-start:8px">(محجوز للموقع ${p.reserved})</small>` : ''}</span><button type="button" class="btn line sm" data-stock>جرد / تعديل</button></div></div>`}
        </div></div>
        <div class="box"><h3>${icon('globe')} في الموقع</h3>
          <label class="tg"><span>منشور في الموقع<small>يظهر للزبائن ويمكن طلبه</small></span><input type="checkbox" name="web_published" ${p.web_published ? 'checked' : ''}><span class="sw"></span></label>
          <label class="tg"><span>مميز<small>يظهر في «مختارات الملكة»</small></span><input type="checkbox" name="web_featured" ${p.web_featured ? 'checked' : ''}><span class="sw"></span></label>
          <label class="tg"><span>وصل حديثاً</span><input type="checkbox" name="web_new" ${p.web_new ? 'checked' : ''}><span class="sw"></span></label>
          <div class="fields two" style="margin-top:10px">
            <label class="f"><span>القسم الرئيسي</span><select name="web_cat_id">${opt(mains(), p.web_cat_id, '— اختر —')}</select></label>
            <label class="f"><span>القسم الفرعي</span><select name="web_sub_id"></select></label>
            <label class="f full"><span>البراند</span><select name="web_brand_id">${opt(ST.brands, p.web_brand_id, '— بدون —')}<option value="__new">+ براند جديد…</option></select></label>
            <label class="f full"><span>الوصف</span><textarea name="web_description" maxlength="5000" placeholder="المكونات، طريقة الاستخدام، الحجم، الرائحة…">${esc(p.web_description || '')}</textarea></label>
          </div></div>
        ${isNew ? '' : `<button type="button" class="btn err block" data-arch>${icon('trash')} حذف / أرشفة المنتج</button>`}
      </form>`,
      foot: `<button class="btn" data-save>${icon('check')} حفظ</button>`,
    });
    const form = $('#pf', el);
    const ie = imageEditor($('#pimgs', el), imgs);
    const fillSub = (sel) => { const s = subsOf(form.web_cat_id.value); form.web_sub_id.innerHTML = opt(s, sel, s.length ? '— بدون —' : 'لا توجد أقسام فرعية'); form.web_sub_id.disabled = !s.length; };
    fillSub(p.web_sub_id);
    form.web_cat_id.onchange = () => fillSub(null);
    form.web_brand_id.onchange = async () => {
      if (form.web_brand_id.value !== '__new') return;
      const name = (prompt('اسم البراند الجديد') || '').trim();
      if (!name) { form.web_brand_id.value = p.web_brand_id || ''; return; }
      const id = tmpId();
      try { await change('brand.save', { id, fields: { name } }); ST.brands.push({ id, name, _pending: true }); form.web_brand_id.innerHTML = opt(ST.brands, id, '— بدون —') + '<option value="__new">+ براند جديد…</option>'; } catch (e) { fail(e); }
    };
    const sb = $('[data-stock]', el);
    if (sb) sb.onclick = () => {
      const se = sheet({ title: 'جرد الكمية', body: `<p class="muted" style="margin-bottom:10px">${esc(p.name)} — الكمية الحالية <b class="num">${p.stock}</b>. أدخل الكمية الفعلية الموجودة (يُسجَّل الفرق كتسوية مخزون في الحسابات).</p><label class="f"><span>الكمية الفعلية</span><input id="sq" inputmode="numeric" value="${p.stock}"></label>`, foot: '<button class="btn" data-ok>حفظ الجرد</button>' });
      $('[data-ok]', se).onclick = async () => {
        const q = Number(toLatin($('#sq', se).value)); if (!Number.isFinite(q) || q < 0) return toast('كمية غير صحيحة', 'err');
        try { await change('product.stock', { id: p.id, qty: q }); toast(pendNote()); sheetClose = null; closeSheet(); } catch (e) { fail(e); }
      };
    };
    const ab = $('[data-arch]', el);
    if (ab) ab.onclick = async () => { if (!(await confirmBox(`حذف «${esc(p.name)}»؟ إن كان له حركات سابقة يُؤرشف فقط ويختفي من الموقع والنظام.`, 'حذف', true))) return; try { await change('product.archive', { id: p.id }); toast(pendNote()); } catch (e) { fail(e); } };
    $('[data-save]', el).onclick = async () => {
      if (ie.busy()) return toast('انتظر حتى يكتمل رفع الصور', 'err');
      const v = (n) => toLatin(form[n].value).trim();
      const name = form.name.value.trim(), price = Number(v('price').replace(/,/g, ''));
      if (name.length < 2) return toast('اكتب اسم المنتج', 'err');
      if (!Number.isFinite(price) || price < 0 || v('price') === '') return toast('اكتب سعر البيع', 'err');
      const fields = {
        name, price, barcode: v('barcode'), unit: form.unit.value.trim() || 'حبة', category_id: form.category_id.value ? Number(form.category_id.value) : null, min_stock: Number(v('min_stock')) || 0,
        web_compare_price: Number(v('web_compare_price').replace(/,/g, '')) || null, web_published: form.web_published.checked, web_featured: form.web_featured.checked, web_new: form.web_new.checked,
        web_cat_id: form.web_cat_id.value || null, web_sub_id: form.web_sub_id.value || null, web_brand_id: form.web_brand_id.value && form.web_brand_id.value !== '__new' ? form.web_brand_id.value : null,
        web_description: form.web_description.value, web_images: imgs,
      };
      for (const k of ['web_cat_id', 'web_sub_id', 'web_brand_id']) if (fields[k] && /^\d+$/.test(fields[k])) fields[k] = Number(fields[k]);
      if (isNew) { fields.opening_stock = Number(v('opening_stock')) || 0; fields.cost = Number(v('cost')) || 0; }
      const btn = $('[data-save]', el); btn.classList.add('loading');
      try { await change('product.save', { id: p.id, fields }); vibrate(); toast(pendNote()); sheetClose = null; closeSheet(); } catch (e) { fail(e); btn.classList.remove('loading'); }
    };
  }

  // ---------- store: categories / brands / banners / content ----------
  function vStore() {
    const seg = routeArg || 'cats';
    const segs = [['cats', 'الأقسام'], ['brands', 'البراندات'], ['banners', 'البنرات'], ['content', 'المحتوى']];
    setView(`<div class="seg">${segs.map(([k, l]) => `<button data-seg="${k}" class="${seg === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="sv"></div>`);
    $$('[data-seg]').forEach((b) => (b.onclick = () => { location.hash = '#/store/' + b.dataset.seg; }));
    ({ cats: sCats, brands: sBrands, banners: sBanners, content: sContent })[seg]();
  }
  const pcount = (fn) => ST.products.filter(fn).length;
  function sCats() {
    const row = (c, sub) => `<button class="row ${sub ? 'sub' : ''}" data-c="${esc(c.id)}">${thumb(c.image)}<span class="b"><span class="t">${esc(c.name)}</span><span class="s"><span class="num">${pcount((p) => String(p.web_cat_id) === String(c.id) || String(p.web_sub_id) === String(c.id))} منتج</span>${!sub ? `<span>${subsOf(c.id).length} فرعي</span>` : ''}${c._pending ? '<span class="pill pend">قيد التطبيق</span>' : ''}</span></span>${icon('left')}</button>`;
    $('#sv').innerHTML = `<div class="list">${mains().length ? mains().map((c) => row(c) + subsOf(c.id).map((s) => row(s, true)).join('')).join('') : `<div class="card empty">${icon('grid')}لا توجد أقسام</div>`}</div>`;
    $$('[data-c]').forEach((b) => (b.onclick = () => editCat(ST.web_categories.find((c) => String(c.id) === b.dataset.c))));
    setFab(() => editCat(null), 'قسم جديد');
  }
  function editCat(c) {
    const isNew = !c;
    c = c ? { ...c } : { id: tmpId(), name: '', parent_id: null, sort: 0, image: null };
    const imgs = c.image ? [c.image] : [];
    const el = sheet({
      title: isNew ? 'قسم جديد' : 'تعديل القسم',
      body: `<div class="fields"><label class="f"><span>اسم القسم *</span><input id="cn" value="${esc(c.name)}" maxlength="80"></label>
        <label class="f"><span>يتبع القسم</span><select id="cp" ${isNew ? '' : 'disabled'}>${opt(mains().filter((m) => String(m.id) !== String(c.id)), c.parent_id, '— قسم رئيسي —')}</select>${isNew ? '' : '<small>لا يمكن نقل قسم بعد إنشائه</small>'}</label>
        <label class="f"><span>الترتيب <small>(الأصغر أولاً)</small></span><input id="cs" inputmode="numeric" value="${esc(c.sort || 0)}"></label>
        <div class="f"><span>الصورة</span><div id="ci"></div></div></div>`,
      foot: `${isNew ? '' : `<button class="btn err" data-del style="flex:none">${icon('trash')}</button>`}<button class="btn" data-ok>حفظ</button>`,
    });
    imageEditor($('#ci', el), imgs, { limit: 1 });
    $('[data-ok]', el).onclick = async () => {
      const name = $('#cn', el).value.trim(); if (!name) return toast('اكتب اسم القسم', 'err');
      const fields = { name, sort: Number(toLatin($('#cs', el).value)) || 0, image: imgs[0] || null };
      if (isNew) fields.parent_id = $('#cp', el).value || null;
      if (fields.parent_id && /^\d+$/.test(fields.parent_id)) fields.parent_id = Number(fields.parent_id);
      try { await change('wcat.save', { id: c.id, fields }); toast(pendNote()); sheetClose = null; closeSheet(); } catch (e) { fail(e); }
    };
    const d = $('[data-del]', el);
    if (d) d.onclick = async () => { if (await confirmBox(`حذف القسم «${esc(c.name)}»${c.parent_id ? '' : ' وأقسامه الفرعية'}؟ المنتجات لا تُحذف.`, 'حذف', true)) { try { await change('wcat.delete', { id: c.id }); toast(pendNote()); } catch (e) { fail(e); } } };
  }
  function sBrands() {
    $('#sv').innerHTML = `<div class="list grid2">${ST.brands.length ? ST.brands.map((b) => `<button class="row" data-b="${esc(b.id)}">${thumb(b.logo, 'round')}<span class="b"><span class="t">${esc(b.name)}</span><span class="s"><span class="num">${pcount((p) => String(p.web_brand_id) === String(b.id))} منتج</span>${b._pending ? '<span class="pill pend">قيد التطبيق</span>' : ''}</span></span>${icon('left')}</button>`).join('') : `<div class="card empty" style="grid-column:1/-1">${icon('crown')}لا توجد براندات</div>`}</div>`;
    $$('[data-b]').forEach((x) => (x.onclick = () => editBrand(ST.brands.find((b) => String(b.id) === x.dataset.b))));
    setFab(() => editBrand(null), 'براند جديد');
  }
  function editBrand(b) {
    const isNew = !b;
    b = b ? { ...b } : { id: tmpId(), name: '', logo: null, sort: 0 };
    const imgs = b.logo ? [b.logo] : [];
    const el = sheet({
      title: isNew ? 'براند جديد' : 'تعديل البراند',
      body: `<div class="fields"><label class="f"><span>اسم البراند *</span><input id="bn" value="${esc(b.name)}" maxlength="80"></label>
        <label class="f"><span>الترتيب</span><input id="bs" inputmode="numeric" value="${esc(b.sort || 0)}"></label><div class="f"><span>الشعار</span><div id="bi"></div></div></div>`,
      foot: `${isNew ? '' : `<button class="btn err" data-del style="flex:none">${icon('trash')}</button>`}<button class="btn" data-ok>حفظ</button>`,
    });
    imageEditor($('#bi', el), imgs, { limit: 1 });
    $('[data-ok]', el).onclick = async () => {
      const name = $('#bn', el).value.trim(); if (!name) return toast('اكتب اسم البراند', 'err');
      try { await change('brand.save', { id: b.id, fields: { name, sort: Number(toLatin($('#bs', el).value)) || 0, logo: imgs[0] || null } }); toast(pendNote()); sheetClose = null; closeSheet(); } catch (e) { fail(e); }
    };
    const d = $('[data-del]', el);
    if (d) d.onclick = async () => { if (await confirmBox(`حذف البراند «${esc(b.name)}»؟`, 'حذف', true)) { try { await change('brand.delete', { id: b.id }); toast(pendNote()); } catch (e) { fail(e); } } };
  }
  const PLACES = { hero: 'السلايدر الرئيسي', mid: 'بنر عريض', tiles: 'بطاقة ترويجية' };
  const LINKS = [['none', 'بدون رابط'], ['offers', 'صفحة العروض'], ['new', 'وصل حديثاً'], ['shop', 'كل المنتجات'], ['category', 'قسم'], ['brand', 'براند'], ['product', 'منتج'], ['url', 'رابط مخصص']];
  function sBanners() {
    const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    const state = (b) => (!b.active ? ['متوقف', ''] : b.ends && b.ends < today ? ['منتهي', 'err'] : b.starts && b.starts > today ? ['مجدول', 'pend'] : ['يظهر الآن', 'ok']);
    const list = ST.banners.slice().sort((a, b) => (a.place > b.place ? 1 : a.place < b.place ? -1 : (a.sort || 0) - (b.sort || 0)));
    $('#sv').innerHTML = Object.entries(PLACES).map(([k, l]) => {
      const L = list.filter((b) => b.place === k);
      return `<div class="sec-t"><span>${l}</span><span class="muted" style="font-size:12px;font-weight:500">${L.length}</span></div>
        <div class="list grid2">${L.length ? L.map((b, i) => { const [s, c] = state(b); return `<div class="row" style="padding:8px"><button data-bn="${esc(b.id)}" style="display:flex;gap:10px;align-items:center;flex:1;min-width:0;text-align:start">
          <span class="th" style="width:${k === 'tiles' ? 54 : 96}px">${b.image ? `<img src="${esc(media(b.image))}" alt="">` : ''}</span><span class="b"><span class="t">${esc(b.title || 'بدون عنوان')}</span><span class="s"><span class="pill ${c}">${s}</span>${b._pending ? '<span class="pill pend">قيد التطبيق</span>' : ''}</span></span></button>
          ${L.length > 1 ? `<span style="display:flex;flex-direction:column"><button class="ib" style="width:32px;height:28px" data-mv="${esc(b.id)}" data-d="-1" ${i ? '' : 'disabled'} aria-label="أعلى">${icon('up')}</button><button class="ib" style="width:32px;height:28px" data-mv="${esc(b.id)}" data-d="1" ${i < L.length - 1 ? '' : 'disabled'} aria-label="أسفل">${icon('down')}</button></span>` : ''}</div>`; }).join('')
          : `<div class="card empty" style="grid-column:1/-1;padding:18px">لا توجد بنرات</div>`}</div>`;
    }).join('');
    $$('[data-bn]').forEach((x) => (x.onclick = () => editBanner(ST.banners.find((b) => String(b.id) === x.dataset.bn))));
    $$('[data-mv]').forEach((x) => (x.onclick = async () => {
      const b = ST.banners.find((y) => String(y.id) === x.dataset.mv);
      const L = list.filter((y) => y.place === b.place); const i = L.indexOf(b), j = i + Number(x.dataset.d);
      [L[i], L[j]] = [L[j], L[i]];
      L.forEach((y, n) => { y.sort = n + 1; });
      try { await change('banner.order', { ids: L.map((y) => y.id) }); sBanners(); } catch (e) { fail(e); }
    }));
    setFab(() => editBanner(null), 'بنر جديد');
  }
  function editBanner(b) {
    const isNew = !b;
    b = b ? { ...b } : { id: tmpId(), place: 'hero', active: 1, link_type: 'none', theme: 'dark' };
    const im = b.image ? [b.image] : [], imM = b.image_m ? [b.image_m] : [];
    const el = sheet({
      title: isNew ? 'بنر جديد' : 'تعديل البنر', full: true,
      body: `<div class="box"><h3>${icon('layers')} المكان والصور</h3><div class="fields">
          <label class="f"><span>المكان</span><select id="bp">${Object.entries(PLACES).map(([k, l]) => `<option value="${k}" ${b.place === k ? 'selected' : ''}>${l}</option>`).join('')}</select><small id="bsz"></small></label>
          <div class="f"><span>صورة الكمبيوتر *</span><div id="bim"></div></div>
          <div class="f"><span>صورة الهاتف <small>(اختياري — أوضح على الشاشات الصغيرة)</small></span><div id="bimm"></div></div></div></div>
        <div class="box"><h3>${icon('text')} النص <small class="muted" style="font-weight:400">(اختياري)</small></h3><div class="fields">
          <label class="f"><span>العنوان</span><input id="bt" value="${esc(b.title || '')}" maxlength="120"></label>
          <label class="f"><span>وصف قصير</span><input id="bst" value="${esc(b.subtitle || '')}" maxlength="240"></label>
          <label class="f"><span>نص الزر</span><input id="bc" value="${esc(b.cta || '')}" maxlength="40"></label>
          <label class="f"><span>لون النص</span><select id="bth"><option value="dark" ${b.theme !== 'light' ? 'selected' : ''}>أبيض (صورة داكنة)</option><option value="light" ${b.theme === 'light' ? 'selected' : ''}>داكن (صورة فاتحة)</option></select></label></div></div>
        <div class="box"><h3>${icon('link')} عند الضغط</h3><div class="fields">
          <label class="f"><span>يذهب إلى</span><select id="blt">${LINKS.map(([k, l]) => `<option value="${k}" ${b.link_type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <div id="blv"></div></div></div>
        <div class="box"><h3>${icon('clock')} الجدولة</h3><div class="fields two">
          <label class="f"><span>يبدأ من</span><input id="bsd" type="date" value="${esc(b.starts || '')}"></label><label class="f"><span>ينتهي في</span><input id="bed" type="date" value="${esc(b.ends || '')}"></label></div>
          <label class="tg"><span>ظاهر في الموقع</span><input type="checkbox" id="bac" ${b.active !== 0 && b.active !== false ? 'checked' : ''}><span class="sw"></span></label></div>`,
      foot: `${isNew ? '' : `<button class="btn err" data-del style="flex:none">${icon('trash')}</button>`}<button class="btn" data-ok>حفظ</button>`,
    });
    const SZ = { hero: 'المقاس المقترح: كمبيوتر 2400×800 · هاتف 1080×740', mid: 'المقاس المقترح: كمبيوتر 2000×500 · هاتف 1080×540', tiles: 'المقاس المقترح: مربعة 1000×1000' };
    const sz = () => { $('#bsz', el).textContent = SZ[$('#bp', el).value]; };
    sz(); $('#bp', el).onchange = sz;
    const e1 = imageEditor($('#bim', el), im, { limit: 1 }), e2 = imageEditor($('#bimm', el), imM, { limit: 1 });
    const lv = () => {
      const t = $('#blt', el).value, val = b.link_type === t ? b.link_value : '';
      const sel = (list) => `<label class="f"><span>الوجهة</span><select id="bv">${list.map((x) => `<option value="${esc(x.id)}" ${String(x.id) === String(val) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`;
      $('#blv', el).innerHTML = t === 'category' ? sel(mains().flatMap((m) => [m, ...subsOf(m.id).map((s) => ({ ...s, name: '↳ ' + s.name }))]))
        : t === 'brand' ? sel(ST.brands) : t === 'product' ? sel(ST.products.filter((p) => p.web_published))
        : t === 'url' ? `<label class="f"><span>الرابط</span><input id="bv" dir="ltr" placeholder="https://… أو /shop?q=…" value="${esc(val || '')}"></label>` : '';
    };
    lv(); $('#blt', el).onchange = lv;
    $('[data-ok]', el).onclick = async () => {
      if (e1.busy() || e2.busy()) return toast('انتظر حتى يكتمل رفع الصور', 'err');
      if (!im[0]) return toast('اختر صورة الكمبيوتر', 'err');
      const t = $('#blt', el).value, bv = $('#bv', el);
      if (['category', 'brand', 'product', 'url'].includes(t) && !(bv && bv.value.trim())) return toast('اختر وجهة الرابط', 'err');
      const fields = { place: $('#bp', el).value, image: im[0], image_m: imM[0] || null, title: $('#bt', el).value, subtitle: $('#bst', el).value, cta: $('#bc', el).value, theme: $('#bth', el).value,
        link_type: t, link_value: bv ? bv.value.trim() : null, starts: $('#bsd', el).value || null, ends: $('#bed', el).value || null, active: $('#bac', el).checked, sort: b.sort || 99 };
      try { await change('banner.save', { id: b.id, fields }); toast(pendNote()); sheetClose = null; closeSheet(); } catch (e) { fail(e); }
    };
    const d = $('[data-del]', el);
    if (d) d.onclick = async () => { if (await confirmBox('حذف هذا البنر؟', 'حذف', true)) { try { await change('banner.delete', { id: b.id }); toast(pendNote()); } catch (e) { fail(e); } } };
  }
  function sContent() {
    const c = ST.content || {};
    const govs = ST.governorates || [];
    const heroImgs = c.hero_image ? [c.hero_image] : [];
    $('#sv').innerHTML = `<form id="cf" onsubmit="return false">
      <div class="box"><h3>${icon('cash')} الطلبات والتوصيل</h3>
        <label class="tg"><span>استقبال الطلبات مفعّل<small>عند الإيقاف تظهر رسالة للزبائن</small></span><input type="checkbox" name="ordering" ${c.ordering !== false ? 'checked' : ''}><span class="sw"></span></label>
        <div class="fields two" style="margin-top:8px">
          <label class="f full"><span>رسالة الإيقاف</span><input name="closed_message" value="${esc(c.closed_message || '')}"></label>
          <label class="f"><span>توصيل بغداد</span><input name="fee_baghdad" inputmode="numeric" value="${esc(c.fee_baghdad ?? 0)}"></label>
          <label class="f"><span>باقي المحافظات</span><input name="fee_other" inputmode="numeric" value="${esc(c.fee_other ?? 0)}"></label>
          <label class="f"><span>توصيل مجاني للطلبات من <small>(0 = لا)</small></span><input name="free_over" inputmode="numeric" value="${esc(c.free_over || 0)}"></label>
          <label class="f"><span>الحد الأدنى للطلب</span><input name="min_order" inputmode="numeric" value="${esc(c.min_order || 0)}"></label>
        </div>
        <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:600;font-size:13px;color:var(--plum)">أجور خاصة لمحافظات معينة</summary><div class="fields two" style="margin-top:10px">${govs.map((g) => `<label class="f"><span>${esc(g)}</span><input data-fee="${esc(g)}" inputmode="numeric" placeholder="الافتراضي" value="${esc((c.fees || {})[g] ?? '')}"></label>`).join('')}</div></details>
      </div>
      <div class="box"><h3>${icon('phone')} التواصل</h3><div class="fields two">
        <label class="f"><span>واتساب</span><input name="whatsapp" dir="ltr" inputmode="tel" value="${esc(c.whatsapp || '')}"></label>
        <label class="f"><span>الهاتف</span><input name="phone" dir="ltr" inputmode="tel" value="${esc(c.phone || '')}"></label>
        <label class="f"><span>انستغرام</span><input name="instagram" dir="ltr" value="${esc(c.instagram || '')}"></label>
        <label class="f"><span>فيسبوك</span><input name="facebook" dir="ltr" value="${esc(c.facebook || '')}"></label>
        <label class="f"><span>تيك توك</span><input name="tiktok" dir="ltr" value="${esc(c.tiktok || '')}"></label>
        <label class="f"><span>البريد</span><input name="email" dir="ltr" inputmode="email" value="${esc(c.email || '')}"></label>
        <label class="f full"><span>العنوان</span><input name="address" value="${esc(c.address || '')}"></label></div></div>
      <div class="box"><h3>${icon('text')} الواجهة والنصوص</h3><div class="fields">
        <label class="f"><span>الشريط الإعلاني <small>(افصل بين العبارات بـ —)</small></span><input name="announcement" value="${esc(c.announcement || '')}"></label>
        <label class="f"><span>الشعار النصي</span><input name="tagline" value="${esc(c.tagline || '')}"></label>
        <label class="f"><span>عنوان الغلاف</span><input name="hero_title" value="${esc(c.hero_title || '')}"></label>
        <label class="f"><span>وصف الغلاف</span><input name="hero_subtitle" value="${esc(c.hero_subtitle || '')}"></label>
        <label class="f"><span>زر الغلاف</span><input name="hero_cta" value="${esc(c.hero_cta || '')}"></label>
        <div class="f"><span>صورة الغلاف <small>(تظهر إن لم توجد بنرات في السلايدر)</small></span><div id="hi"></div></div>
        <label class="f"><span>من نحن</span><textarea name="about">${esc(c.about || '')}</textarea></label>
        <label class="f"><span>السياسات <small>(كل سطر بند)</small></span><textarea name="policies">${esc(c.policies || '')}</textarea></label></div></div>
      <button class="btn block" id="csave">${icon('check')} حفظ المحتوى</button></form>`;
    const ie = imageEditor($('#hi'), heroImgs, { limit: 1 });
    $('#csave').onclick = async () => {
      if (ie.busy()) return toast('انتظر حتى يكتمل رفع الصورة', 'err');
      const f = $('#cf'), n = (k) => Number(toLatin(f[k].value).replace(/,/g, '')) || 0;
      const fees = {}; $$('[data-fee]').forEach((i) => { const v = toLatin(i.value).trim(); if (v !== '') fees[i.dataset.fee] = Number(v) || 0; });
      const fields = { ordering: f.ordering.checked, closed_message: f.closed_message.value, fee_baghdad: n('fee_baghdad'), fee_other: n('fee_other'), free_over: n('free_over'), min_order: n('min_order'), fees,
        hero_image: heroImgs[0] || '' };
      for (const k of ['whatsapp', 'phone', 'instagram', 'facebook', 'tiktok', 'email', 'address', 'announcement', 'tagline', 'hero_title', 'hero_subtitle', 'hero_cta', 'about', 'policies']) fields[k] = f[k].value;
      const b = $('#csave'); b.classList.add('loading');
      try { await change('content.save', { fields }); toast(pendNote()); } catch (e) { fail(e); }
      b.classList.remove('loading');
    };
  }

  // ---------- more ----------
  const KL = { 'product.save': 'حفظ منتج', 'product.stock': 'جرد كمية', 'product.archive': 'حذف منتج', 'wcat.save': 'حفظ قسم', 'wcat.delete': 'حذف قسم', 'brand.save': 'حفظ براند', 'brand.delete': 'حذف براند', 'banner.save': 'حفظ بنر', 'banner.delete': 'حذف بنر', 'banner.order': 'ترتيب البنرات', 'content.save': 'محتوى الموقع', 'order.status': 'حالة طلب' };
  async function vMore() {
    setView(`<div class="list">
        <a class="row" href="/" target="_blank" rel="noopener">${icon('globe')}<span class="b"><span class="t">فتح الموقع</span><span class="s">${esc(location.host)}</span></span>${icon('left')}</a>
        <button class="row" id="rf">${icon('refresh')}<span class="b"><span class="t">تحديث البيانات</span><span class="s">${SUM && SUM.synced_at ? 'آخر مزامنة مع النظام ' + ago(SUM.synced_at) : ''}</span></span></button>
        <button class="row" id="lo">${icon('out')}<span class="b"><span class="t">تسجيل الخروج</span><span class="s">${esc((USER && USER.name) || '')}</span></span></button>
      </div>
      <div class="sec-t"><span>سجل التعديلات</span></div><div class="list" id="cl"><div class="empty"><span class="spin" style="display:inline-block"></span></div></div>`);
    $('#lo').onclick = () => logout();
    $('#rf').onclick = () => { refreshSoon(); toast('جارٍ التحديث'); };
    try {
      const { changes } = await api('/changes');
      if (route !== 'more') return;
      const S = { pending: ['بانتظار النظام', 'pend'], sent: ['قيد التطبيق', 'pend'], applied: ['تم التطبيق', 'ok'], failed: ['فشل', 'err'] };
      $('#cl').innerHTML = changes.length ? changes.map((c) => {
        const p = c.payload || {}, f = p.fields || {};
        const what = f.name || f.title || p.no || (c.kind === 'product.stock' ? `الكمية ${p.qty}` : '') || (c.kind === 'order.status' ? ST_L[p.status] : '');
        return `<div class="row"><span class="b"><span class="t">${KL[c.kind] || c.kind}${what ? ' — ' + esc(what) : ''}</span><span class="s"><span>${esc(c.user || '')}</span><span>${ago(c.at)}</span></span>${c.error ? `<span class="s" style="color:var(--err)">${esc(c.error)}</span>` : ''}</span><span class="pill ${S[c.status][1]}">${S[c.status][0]}</span></div>`;
      }).join('') : `<div class="card empty">لا توجد تعديلات بعد</div>`;
    } catch (e) { fail(e); }
  }

  // ---------- boot ----------
  async function boot() {
    if (!TOKEN) return viewLogin();
    try {
      await api('/me');
      shell();
      await Promise.all([loadState(), loadSum()]);
      lastKey = SUM.synced_at + '|' + SUM.pending;
      readHash();
    } catch (e) {
      if (!TOKEN) return;
      $('#app').innerHTML = `<div class="login"><div class="login-card" style="text-align:center"><div class="mark">Q</div><h1>تعذر التحميل</h1><p>${esc(e.message)}</p><button class="btn block" onclick="location.reload()">إعادة المحاولة</button><button class="btn line block" style="margin-top:8px" id="lo2">تسجيل الخروج</button></div></div>`;
      $('#lo2').onclick = () => logout();
    }
  }
  boot();
})();
