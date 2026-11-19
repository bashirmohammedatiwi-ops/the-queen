// The Queen — النظام الإداري: الهيكل والموجّه والأدوات
(function () {
  const { esc, icon, fmt } = Q;
  const ERP = (window.ERP = { pages: {}, user: null });
  Q.tokenKey = 'queen_erp_token';

  const NAV = [
    ['', [['/', 'لوحة التحكم', 'home']]],
    ['المبيعات', [['/sales/new', 'فاتورة بيع جديدة', 'plus'], ['/sales', 'فواتير المبيعات', 'file'], ['/customers', 'العملاء', 'users'], ['/receipts', 'سندات القبض', 'wallet']]],
    ['المتجر الإلكتروني', [['/web/orders', 'طلبات الموقع', 'cart'], ['/web/products', 'منتجات الموقع', 'tag'], ['/web/catalog', 'الأقسام والبراندات', 'box'], ['/web/banners', 'البنرات', 'image'], ['/web/settings', 'محتوى الموقع والربط', 'gear']]],
    ['المشتريات', [['/purchases/new', 'فاتورة شراء جديدة', 'plus'], ['/purchases', 'فواتير المشتريات', 'truck'], ['/suppliers', 'الموردين', 'users'], ['/payments', 'سندات الصرف', 'wallet']]],
    ['المخزون', [['/products', 'الأصناف', 'box'], ['/categories', 'شجرة المواد', 'tree'], ['/stock', 'حركة المخزون', 'layers'], ['/labels', 'طباعة الباركود', 'barcode']]],
    ['المحاسبة', [['/accounts', 'دليل الحسابات', 'book'], ['/journal', 'القيود اليومية', 'list'], ['/expenses', 'المصروفات', 'cash'], ['/ledger', 'كشف حساب', 'file']]],
    ['التقارير', [['/reports/sales', 'تقرير المبيعات', 'chart'], ['/reports/income', 'الأرباح والخسائر', 'chart'], ['/reports/balance', 'الميزانية العمومية', 'book'], ['/reports/trial', 'ميزان المراجعة', 'list'], ['/reports/inventory', 'تقييم المخزون', 'box'], ['/shifts', 'ورديات الكاشير', 'clock']]],
    ['الإعدادات', [['/settings', 'المتجر والضريبة', 'gear'], ['/print', 'إعدادات الطباعة', 'printer'], ['/users', 'المستخدمين', 'user']]],
  ];

  ERP.start = async () => {
    Q.onUnauthorized = () => showLogin();
    if (!Q.token()) return showLogin();
    try {
      ERP.user = await Q.get('/me');
      if (ERP.user.role === 'cashier') { localStorage.removeItem(Q.tokenKey); return showLogin('حساب الكاشير مخصص لنقطة البيع فقط'); }
      await Q.loadSettings();
      shell();
    } catch { showLogin(); }
  };

  async function showLogin(msg) {
    let pub = { store: {} };
    try { pub = await Q.get('/public'); } catch { /* */ }
    const app = document.getElementById('app');
    app.innerHTML = `<div class="login-wrap"><form class="login">
      <div class="brand" style="margin-bottom:22px">${mark(pub.store)}<div><div class="brand-t">${esc(pub.store.name || 'The Queen')}</div><div class="brand-s">النظام الإداري</div></div></div>
      <label class="f"><span>اسم المستخدم</span><input class="input" name="username" autocomplete="username" required></label>
      <label class="f" style="margin-top:10px"><span>كلمة المرور</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
      <div class="err" style="min-height:20px;margin:8px 0 4px;font-size:12px" id="lerr">${esc(msg || '')}</div>
      <button class="btn primary" style="width:100%;justify-content:center">تسجيل الدخول</button>
      <div class="center muted" style="margin-top:14px;font-size:12px"><a href="/pos/">الانتقال إلى نقطة البيع ←</a></div></form></div>`;
    const form = app.querySelector('form');
    form.username.focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await Q.post('/login', { username: form.username.value, password: form.password.value });
        if (r.user.role === 'cashier') { app.querySelector('#lerr').textContent = 'حساب الكاشير مخصص لنقطة البيع فقط'; return; }
        localStorage.setItem(Q.tokenKey, r.token);
        ERP.start();
      } catch (er) { app.querySelector('#lerr').textContent = er.message; }
    };
  }

  const mark = (st) => `<div class="brand-mark">${st?.logo ? `<img src="${st.logo}">` : 'Q'}</div>`;
  ERP.mark = mark;

  function shell() {
    const st = Q.settings.store;
    document.getElementById('app').innerHTML = `<div class="shell">
      <aside class="side"><div class="brand">${mark(st)}<div><div class="brand-t">${esc(st.name || 'The Queen')}</div><div class="brand-s">النظام الإداري</div></div></div>
        <nav class="nav">${NAV.map(([g, items]) => `${g ? `<div class="nav-g">${g}</div>` : ''}${items.map(([h, t, i]) => `<a href="#${h}" data-h="${h}">${icon(i)}<span>${t}</span></a>`).join('')}`).join('')}</nav>
        <div class="side-f"><div class="av">${icon('user')}</div><div class="who"><b>${esc(ERP.user.name)}</b><span>${Q.ROLES[ERP.user.role]}</span></div>
          <button class="btn ghost icon" id="logout" title="تسجيل الخروج">${icon('out')}</button></div></aside>
      <main class="main"><header class="top"><h1 id="ptitle"></h1><span class="crumb" id="psub"></span><span class="sp"></span><div class="row" id="pact"></div>
        <a class="btn" href="/pos/" target="_blank">${icon('pos')} نقطة البيع</a></header><section class="content" id="view"></section></main></div>`;
    document.getElementById('logout').onclick = async () => { try { await Q.post('/logout'); } catch { /* */ } localStorage.removeItem(Q.tokenKey); showLogin(); };
    window.onhashchange = () => { document.querySelectorAll(".modal-bg").forEach((m) => m.querySelector("[data-x]")?.click()); route(); };
    route();
    // تحديثات مباشرة: طلبات المتجر الإلكتروني الجديدة
    Q.listen({ web_order: (d) => ERP.onWebOrder?.(d), web_orders: () => ERP.webBadge?.() });
    if (ERP.user.role !== 'cashier') ERP.webBadge?.();
  }

  function route() {
    const h = location.hash.slice(1) || '/';
    const [p, qs] = h.split('?');
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    let page = ERP.pages[p], match = {};
    if (!page) {
      for (const [k, v] of Object.entries(ERP.pages)) {
        if (!k.includes(':')) continue;
        const re = new RegExp('^' + k.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
        const m = p.match(re);
        if (m) { page = v; match = m.groups; break; }
      }
    }
    const exact = Q.$$('.nav a').some((a) => a.dataset.h === p);
    Q.$$('.nav a').forEach((a) => a.classList.toggle('on', exact ? a.dataset.h === p : a.dataset.h !== '/' && p.startsWith(a.dataset.h + '/')));
    const view = document.getElementById('view');
    view.scrollTop = 0;
    if (!page) { setHead('غير موجود'); view.innerHTML = '<div class="empty">الصفحة غير موجودة</div>'; return; }
    setHead(page.title || '');
    view.innerHTML = '<div class="empty">جارٍ التحميل…</div>';
    Promise.resolve(page.render(view, { ...params, ...match })).catch((e) => { view.innerHTML = `<div class="empty err">${esc(e.message)}</div>`; });
  }
  ERP.reload = route;
  ERP.go = (h) => { if (location.hash === '#' + h) route(); else location.hash = h; };

  function setHead(title, sub = '', actions = '') {
    document.getElementById('ptitle').textContent = title;
    document.getElementById('psub').textContent = sub;
    document.getElementById('pact').innerHTML = actions;
    document.title = `${title} — ${Q.settings?.store?.name || 'The Queen'}`;
  }
  ERP.head = setHead;
  ERP.page = (path, def) => (ERP.pages[path] = def);

  // ===== جدول عام =====
  // cols: [{k, t, n:true(رقم), f:(v,row)=>html, cls}]
  ERP.table = (cols, rows, { foot, empty = 'لا توجد بيانات', click, cls = '' } = {}) => {
    if (!rows.length) return `<div class="empty">${empty}</div>`;
    const cell = (c, r) => (c.f ? c.f(r[c.k], r) : c.n ? fmt(r[c.k]) : esc(r[c.k] ?? ''));
    return `<table class="tbl ${cls}"><thead><tr>${cols.map((c) => `<th class="${c.n ? 'n' : ''} ${c.cls || ''}">${c.t}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr ${click ? `class="click" data-i="${i}"` : ''}>${cols.map((c) => `<td class="${c.n ? 'n' : ''} ${c.cls || ''}">${cell(c, r)}</td>`).join('')}</tr>`).join('')}</tbody>
      ${foot ? `<tfoot><tr>${cols.map((c) => `<td class="${c.n ? 'n' : ''}">${foot[c.k] != null ? (typeof foot[c.k] === 'number' ? fmt(foot[c.k]) : foot[c.k]) : ''}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
  };
  ERP.bindRows = (root, rows, fn) => Q.$$('tr[data-i]', root).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('button,a,input')) fn(rows[tr.dataset.i]); }));
  ERP.sum = (rows, k) => Q.n(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));

  // ===== نموذج منبثق عام =====
  // fields: [{n, t, type:'text'|'number'|'select'|'checkbox'|'textarea'|'password'|'date', options:[[v,l]], full, req, ph, step}]
  ERP.field = (fd, val) => {
    const v = val ?? fd.def ?? '';
    const cls = fd.full ? 'full' : '';
    if (fd.type === 'checkbox') return `<label class="chk ${cls}" style="align-self:end;height:32px"><input type="checkbox" name="${fd.n}" ${v ? 'checked' : ''}> ${fd.t}</label>`;
    let inp;
    if (fd.type === 'select') inp = `<select class="input" name="${fd.n}">${fd.options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (fd.type === 'textarea') inp = `<textarea class="input" name="${fd.n}" placeholder="${esc(fd.ph || '')}">${esc(v)}</textarea>`;
    else inp = `<input class="input ${fd.type === 'number' ? 'num' : ''}" name="${fd.n}" type="${fd.type || 'text'}" ${fd.type === 'number' ? `step="${fd.step || 'any'}"` : ''} value="${esc(v)}" placeholder="${esc(fd.ph || '')}" ${fd.req ? 'required' : ''} ${fd.ro ? 'readonly' : ''}>`;
    return `<label class="f ${cls}"><span>${fd.t}${fd.req ? ' *' : ''}</span>${inp}${fd.hint ? `<small class="faint">${fd.hint}</small>` : ''}</label>`;
  };
  ERP.form = ({ title, fields, data = {}, onSave, width = 560, cols = 2 }) => {
    const m = Q.modal({
      title, width,
      body: `<form class="fgrid ${cols === 3 ? 'c3' : ''}" onsubmit="return false">${fields.map((fd) => ERP.field(fd, data[fd.n])).join('')}</form>`,
      foot: '<button class="btn primary" data-save>حفظ</button><button class="btn" data-cancel>إلغاء</button>',
    });
    const save = async () => {
      const form = m.$('form');
      if (!form.reportValidity()) return;
      const o = Q.formData(form);
      fields.forEach((fd) => { if (fd.type === 'number' && o[fd.n] == null) o[fd.n] = 0; });
      const btn = m.$('[data-save]'); btn.disabled = true;
      try { await onSave(o); m.close(); } catch (e) { Q.err(e); btn.disabled = false; }
    };
    m.$('[data-save]').onclick = save;
    m.$('form').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); save(); } });
    m.$('[data-cancel]').onclick = m.close;
    return m;
  };

  // ===== فلتر التاريخ =====
  ERP.dateBar = (state, onChange, extra = '') => {
    const id = 'db' + Math.random().toString(36).slice(2, 7);
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const f = el.querySelector('[name=from]'), t = el.querySelector('[name=to]');
      const apply = () => { state.from = f.value; state.to = t.value; onChange(); };
      f.onchange = t.onchange = apply;
      el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => {
        const d = new Date(), td = Q.today();
        const r = b.dataset.r;
        if (r === 'today') { f.value = td; t.value = td; }
        if (r === 'month') { f.value = Q.monthStart(); t.value = td; }
        if (r === 'last') { d.setDate(0); const e = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); f.value = e.slice(0, 8) + '01'; t.value = e; }
        if (r === 'year') { f.value = td.slice(0, 4) + '-01-01'; t.value = td; }
        apply();
      }));
    });
    return `<div class="row" id="${id}"><span class="muted">من</span><input class="input" type="date" name="from" value="${state.from}" style="width:140px">
      <span class="muted">إلى</span><input class="input" type="date" name="to" value="${state.to}" style="width:140px">
      <div class="seg"><button data-r="today">اليوم</button><button data-r="month">هذا الشهر</button><button data-r="last">الشهر الماضي</button><button data-r="year">هذه السنة</button></div>${extra}</div>`;
  };

  // ===== منتقي الأصناف (بحث بالاسم أو الباركود) =====
  ERP.picker = (input, onPick, { list } = {}) => {
    let products = list || null, box = null, idx = 0, cur = [];
    const load = async () => (products = products || (await Q.get('/products')));
    const close = () => { box?.remove(); box = null; };
    const render = () => {
      close();
      if (!cur.length) return;
      box = document.createElement('div'); box.className = 'picker-list';
      box.innerHTML = cur.map((p, i) => `<div class="${i === idx ? 'on' : ''}" data-i="${i}"><span class="grow">${esc(p.name)}</span><span class="faint mono">${esc(p.barcode || '')}</span><span class="mono">${fmt(p.price)}</span><span class="tag ${p.stock <= 0 ? 'err' : ''}">${Q.qty(p.stock)}</span></div>`).join('');
      box.onmousedown = (e) => { const d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); pick(cur[d.dataset.i]); } };
      input.parentElement.appendChild(box);
    };
    const pick = (p) => { close(); input.value = ''; onPick(p); input.focus(); };
    input.addEventListener('input', async () => {
      await load();
      const q = input.value.trim().toLowerCase();
      if (!q) { cur = []; return close(); }
      cur = products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.sku || '').toLowerCase().includes(q)).slice(0, 12);
      idx = 0; render();
    });
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, cur.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); render(); }
      else if (e.key === 'Enter') {
        e.preventDefault(); await load();
        const q = input.value.trim();
        const exact = products.find((p) => p.barcode === q || p.sku === q);
        if (exact) pick(exact); else if (cur[idx]) pick(cur[idx]);
      } else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
    return { refresh: () => (products = null) };
  };

  ERP.options = (rows, label = 'name', empty = '— اختر —') => [['', empty], ...rows.map((r) => [r.id, typeof label === 'function' ? label(r) : r[label]])];
  ERP.printReport = (title, sub, html) => Q.print.run(Q.print.report(title, sub, html));
  ERP.badge = (inv) => (inv.type === 'return' ? '<span class="tag err">مرتجع</span>' : '<span class="tag ok">بيع</span>');
  ERP.methodTag = (m) => `<span class="tag ${m === 'credit' ? 'warn' : m === 'card' ? 'info' : ''}">${Q.METHODS[m] || m || ''}</span>`;
})();
