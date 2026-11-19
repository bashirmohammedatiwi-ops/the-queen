// The Queen — أدوات مشتركة بين ERP و POS
(function () {
  const Q = (window.Q = window.Q || {});
  Q.tokenKey = 'queen_token';
  Q.settings = null;

  Q.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  Q.n = (x) => Math.round((Number(x) || 0) * 100) / 100;
  // تقريب المبالغ حسب عملة النظام (الدينار بدون كسور) — مطابق لحسابات الخادم
  Q.m = (x) => { const f = 10 ** (Number.isInteger(Number(Q.settings?.decimals)) ? Number(Q.settings.decimals) : 2); return Math.round((Number(x) || 0) * f) / f; };
  // الدينار العراقي بدون فواصل عشرية افتراضياً (حسب الإعدادات)، الدولار دائماً بخانتين
  Q.fmt = (x, d) => {
    if (d == null) d = Q.settings?.decimals ?? 2;
    return (Number(x) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  Q.CUR = { IQD: 'د.ع', USD: '$' };
  Q.fmtc = (x, cur = 'IQD') => (cur === 'USD' ? `$${Q.fmt(x, 2)}` : `${Q.fmt(x)} ${Q.settings?.currency || 'د.ع'}`);
  Q.qty = (x) => { const v = Number(x) || 0; return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, ''); };
  Q.money = (x) => `${Q.fmt(x)} ${Q.settings?.currency || ''}`.trim();
  Q.today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  Q.monthStart = () => Q.today().slice(0, 8) + '01';
  Q.dt = (s) => (s ? String(s).slice(0, 16) : '');
  Q.$ = (sel, root = document) => root.querySelector(sel);
  Q.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  Q.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  Q.METHODS = { cash: 'نقدي', card: 'شبكة', mixed: 'نقدي + شبكة', credit: 'آجل', bank: 'بنك' };
  Q.ROLES = { admin: 'مدير النظام', manager: 'مشرف', cashier: 'كاشير' };

  Q.token = () => localStorage.getItem(Q.tokenKey);
  Q.api = async (method, path, body) => {
    const res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(Q.token() ? { Authorization: 'Bearer ' + Q.token() } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* */ }
    if (res.status === 401 && path !== '/login') { localStorage.removeItem(Q.tokenKey); Q.onUnauthorized?.(); }
    if (!res.ok) throw new Error(data?.error || 'تعذر الاتصال بالخادم');
    return data;
  };
  Q.get = (p) => Q.api('GET', p);
  Q.post = (p, b) => Q.api('POST', p, b ?? {});
  Q.put = (p, b) => Q.api('PUT', p, b ?? {});
  Q.del = (p) => Q.api('DELETE', p);
  Q.qs = (o) => { const p = Object.entries(o).filter(([, v]) => v !== '' && v != null); return p.length ? '?' + new URLSearchParams(p).toString() : ''; };

  Q.loadSettings = async () => (Q.settings = await Q.get('/settings'));

  // تنبيهات
  Q.toast = (msg, type = '') => {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), type === 'err' ? 4500 : 2600);
  };
  Q.err = (e) => Q.toast(e?.message || String(e), 'err');

  // نافذة منبثقة
  Q.modal = ({ title, body = '', foot = '', width = 520, onClose } = {}) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" style="width:${width}px"><div class="modal-h"><h3>${Q.esc(title)}</h3>
      <button class="btn ghost icon" data-x>${Q.icon('x')}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey, true); onClose?.(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    bg.querySelector('[data-x]').onclick = close;
    document.body.appendChild(bg);
    const el = bg.querySelector('.modal');
    setTimeout(() => el.querySelector('input:not([type=checkbox]):not([readonly]),select,textarea')?.focus(), 30);
    return { el, close, $: (s) => el.querySelector(s), $$: (s) => [...el.querySelectorAll(s)] };
  };
  Q.confirm = (msg, { ok = 'تأكيد', danger = false } = {}) => new Promise((resolve) => {
    let done = false;
    const m = Q.modal({
      title: 'تأكيد', width: 380, body: `<div>${Q.esc(msg)}</div>`,
      foot: `<button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${ok}</button><button class="btn" data-no>إلغاء</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.$('[data-ok]').onclick = () => { done = true; m.close(); resolve(true); };
    m.$('[data-no]').onclick = () => m.close();
    m.$('[data-ok]').focus();
  });

  // قراءة نموذج إلى كائن
  Q.formData = (root) => {
    const o = {};
    root.querySelectorAll('[name]').forEach((el) => {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'number' || el.dataset.num !== undefined) o[el.name] = el.value === '' ? null : Number(el.value);
      else o[el.name] = el.value;
    });
    return o;
  };

  // أحداث مباشرة من الخادم
  Q.listen = (handlers) => {
    if (!window.EventSource || !Q.token()) return;
    const es = new EventSource('/api/events?token=' + Q.token());
    for (const [k, fn] of Object.entries(handlers)) es.addEventListener(k, (e) => fn(JSON.parse(e.data || '{}')));
    return es;
  };

  // أيقونات خطية صغيرة
  const P = {
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zM4 19.5A1.5 1.5 0 0 0 5.5 21H20"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    printer: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><path d="M6 14h12v7H6z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
    out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11"/>',
    pos: '<rect x="3" y="3" width="18" height="12" rx="1.5"/><path d="M7 21h10M12 15v6"/>',
    ret: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    barcode: '<path d="M4 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/>',
    cash: '<rect x="2.5" y="6" width="19" height="12" rx="1.5"/><circle cx="12" cy="12" r="2.5"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    chevd: '<path d="m6 9 6 6 6-6"/>',
    chevl: '<path d="m15 6-6 6 6 6"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>',
    tree: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  };
  Q.icon = (n, s = 15) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;
})();
