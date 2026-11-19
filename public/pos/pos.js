// The Queen — نقطة البيع (POS)
(function () {
  const { esc, fmt, icon, n } = Q;
  Q.tokenKey = 'queen_pos_token';
  const HOLD_KEY = 'queen_pos_held';
  const S = { user: null, shift: null, products: [], cats: [], cat: '', q: '', cart: [], customer: null, discount: 0, es: null };
  const app = document.getElementById('app');

  // ===== الدخول بالرمز السري =====
  async function login(msg = '') {
    S.es?.close();
    let pub = { store: {} };
    try { pub = await Q.get('/public'); } catch { /* */ }
    let pin = '';
    app.innerHTML = `<div class="login-wrap"><div class="login" style="width:320px">
      <div class="brand" style="justify-content:center"><div class="brand-mark">${pub.store.logo ? `<img src="${pub.store.logo}">` : 'Q'}</div><div><div class="brand-t">${esc(pub.store.name || 'The Queen')}</div><div class="brand-s">نقطة البيع</div></div></div>
      <div class="center muted" style="margin-top:18px">أدخل الرمز السري</div><div class="pin-dots" id="dots"></div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button data-d="${d}">${d}</button>`).join('')}<button data-d="c" style="font-size:14px">مسح</button><button data-d="0">0</button><button data-d="ok" style="background:var(--accent);color:#fff;border-color:var(--accent)">${icon('check', 20)}</button></div>
      <div class="err center" style="min-height:20px;margin-top:10px;font-size:12.5px" id="perr">${esc(msg)}</div>
      <div class="center" style="font-size:12px"><a href="/erp/">النظام الإداري ←</a></div></div></div>`;
    const dots = () => (app.querySelector('#dots').innerHTML = Array(Math.max(4, pin.length)).fill(0).map((_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''));
    const submit = async () => {
      if (pin.length < 4) return;
      try {
        const r = await Q.post('/login', { pin });
        localStorage.setItem(Q.tokenKey, r.token); document.removeEventListener('keydown', onKey); start();
      } catch (e) { pin = ''; dots(); app.querySelector('#perr').textContent = e.message; }
    };
    const press = (d) => { if (d === 'c') pin = pin.slice(0, -1); else if (d === 'ok') return submit(); else if (pin.length < 8) pin += d; dots(); if (pin.length === 8) submit(); };
    const onKey = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('c'); else if (e.key === 'Enter') press('ok'); };
    document.addEventListener('keydown', onKey);
    app.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => press(b.dataset.d)));
    dots();
  }

  async function start() {
    Q.onUnauthorized = () => login('انتهت الجلسة');
    if (!Q.token()) return login();
    try {
      S.user = await Q.get('/me');
      await Q.loadSettings();
      S.shift = await Q.get('/shifts/current');
      await loadProducts();
    } catch { return login(); }
    render();
    S.es?.close();
    S.es = Q.listen({
      products: Q.debounce(async () => { await loadProducts(); drawGrid(); syncCart(); }, 300),
      settings: async () => { await Q.loadSettings(); drawCart(); },
    });
    if (S.es) { S.es.onopen = () => live(true); S.es.onerror = () => live(false); }
    if (!S.shift && Q.settings.pos.require_shift) openShift();
  }
  const live = (on) => { const el = Q.$('#live'); if (el) { el.classList.toggle('off', !on); el.title = on ? 'متصل — التحديث مباشر' : 'غير متصل'; } };

  async function loadProducts() {
    [S.products, S.cats] = await Promise.all([Q.get('/products'), Q.get('/categories')]);
  }
  function syncCart() {
    S.cart.forEach((l) => { const p = S.products.find((x) => x.id === l.id); if (p) { l.stock = p.stock; l.name = p.name; if (!l.edited) l.price = p.price; } });
    drawCart();
  }
  // صلاحيات الكاشير (المدير والمشرف لهما كل الصلاحيات)
  const can = (k) => S.user.role !== 'cashier' || !!Q.settings.pos[k];
  const maxDisc = () => (S.user.role === 'cashier' ? Number(Q.settings.pos.cashier_max_discount) || 0 : 0);

  // ===== الواجهة =====
  function render() {
    const st = Q.settings.store;
    app.innerHTML = `<div class="pos">
      <header class="ptop">
        <div class="brand"><div class="brand-mark">${st.logo ? `<img src="${st.logo}">` : 'Q'}</div><div><div class="brand-t">${esc(st.name)}</div><div class="brand-s"><span class="live" id="live"></span>نقطة البيع</div></div></div>
        <div class="search" style="margin-right:14px">${icon('search')}<input class="input" id="q" placeholder="ابحث بالاسم أو امسح الباركود…  (F2)" autocomplete="off"></div>
        <span class="sp"></span>
        <button class="btn" id="b-inv">${icon('file')} الفواتير</button>
        <button class="btn" id="b-held">${icon('pause')} المعلقة <span class="tag" id="heldn">0</span></button>
        <button class="btn" id="b-shift">${icon('clock')} الوردية</button>
        ${window.desktop ? `<button class="btn" id="b-dev" title="طابعة هذا الجهاز">${icon('printer')}</button>` : ''}
        <div class="info"><b>${esc(S.user.name)}</b><span id="shinfo"></span></div>
        <button class="btn ghost icon" id="b-out" title="خروج">${icon('out')}</button>
      </header>
      <section class="prods"><div class="cats" id="cats"></div><div class="grid" id="grid"></div></section>
      <aside class="cart">
        <div class="cart-h"><div class="cust" id="cust">${icon('user')}<span>عميل نقدي</span></div><button class="btn icon danger" id="b-clear" title="إفراغ السلة">${icon('trash')}</button></div>
        <div class="lines" id="lines"></div>
        <div class="sum" id="sum"></div>
        <div class="acts"><button class="btn" id="b-disc">خصم</button><button class="btn" id="b-hold">${icon('pause')} تعليق <span class="kbd">F4</span></button><button class="btn" id="b-ret">${icon('ret')} مرتجع</button></div>
        <button class="btn primary paybtn" id="b-pay">الدفع <span class="kbd" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4)">F9</span></button>
      </aside></div>`;
    const q = Q.$('#q');
    q.oninput = () => { S.q = q.value.trim(); drawGrid(); };
    q.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = q.value.trim(); if (!v) return;
        const p = S.products.find((x) => x.barcode === v || x.sku === v);
        if (p) { add(p); q.value = ''; S.q = ''; drawGrid(); return; }
        const list = filtered();
        if (list.length === 1) { add(list[0]); q.value = ''; S.q = ''; drawGrid(); } else if (!list.length) Q.toast('الصنف غير موجود: ' + v, 'err');
      } else if (e.key === 'Escape') { q.value = ''; S.q = ''; drawGrid(); }
    };
    Q.$('#cust').onclick = pickCustomer;
    Q.$('#b-clear').onclick = async () => { if (S.cart.length && (await Q.confirm('إفراغ السلة؟', { danger: true, ok: 'إفراغ' }))) reset(); };
    Q.$('#b-disc').onclick = discountDlg;
    Q.$('#b-hold').onclick = hold;
    Q.$('#b-held').onclick = heldDlg;
    Q.$('#b-pay').onclick = pay;
    Q.$('#b-inv').onclick = invoicesDlg;
    Q.$('#b-ret').onclick = returnLookup;
    Q.$('#b-shift').onclick = shiftDlg;
    Q.$('#b-dev') && (Q.$('#b-dev').onclick = () => Q.print.deviceDialog());
    Q.$('#b-out').onclick = async () => { if (S.cart.length && !(await Q.confirm('السلة غير فارغة، الخروج على أي حال؟'))) return; try { await Q.post('/logout'); } catch { /* */ } localStorage.removeItem(Q.tokenKey); login(); };
    drawCats(); drawGrid(); drawCart(); shiftInfo(); heldCount();
    q.focus();
  }
  const shiftInfo = () => { const el = Q.$('#shinfo'); if (el) el.textContent = S.shift ? `وردية #${S.shift.shift.id}` : 'لا توجد وردية'; };
  const focusSearch = () => setTimeout(() => { if (!document.querySelector('.modal-bg')) Q.$('#q')?.focus(); }, 30);

  function drawCats() {
    const el = Q.$('#cats');
    // شجرة المواد: الفروع الرئيسية، وعند اختيار فرع يظهر مساره وفروعه التابعة
    const has = (c) => (c.total ?? c.products) > 0;
    const byId = (id) => S.cats.find((c) => c.id == id);
    const kids = (id) => S.cats.filter((c) => (c.parent_id || null) == (id || null) && has(c));
    const path = []; for (let x = byId(S.cat); x; x = byId(x.parent_id)) path.unshift(x);
    const btn = (c, on, cls = '') => `<button data-c="${c.id}" class="${on ? 'on' : ''} ${cls}">${esc(c.name)}</button>`;
    el.innerHTML = `<button data-c="" class="${S.cat === '' ? 'on' : ''}">الكل</button>`
      + (path.length ? path.map((c, i) => btn(c, i === path.length - 1, 'crumb')).join('<span class="sepc">›</span>') + (kids(S.cat).length ? '<span class="sepc">|</span>' + kids(S.cat).map((c) => btn(c, false)).join('') : '')
        : kids(null).map((c) => btn(c, false)).join(''));
    el.querySelectorAll('button').forEach((b) => (b.onclick = () => { S.cat = b.dataset.c; drawCats(); drawGrid(); focusSearch(); }));
  }
  const filtered = () => {
    const q = S.q.toLowerCase();
    const sub = new Set(); if (S.cat) { sub.add(Number(S.cat)); for (let grew = true; grew;) { grew = false; for (const c of S.cats) if (c.parent_id && sub.has(c.parent_id) && !sub.has(c.id)) { sub.add(c.id); grew = true; } } }
    return S.products.filter((p) => (!S.cat || sub.has(p.category_id)) && (!q || p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.sku || '').toLowerCase().includes(q)));
  };
  function drawGrid() {
    const el = Q.$('#grid'); if (!el) return;
    const list = filtered();
    el.innerHTML = list.length ? list.slice(0, 300).map((p) => `<button class="tile" data-id="${p.id}"><div class="nm">${esc(p.name)}</div>
      <div class="ft"><span class="pr">${fmt(p.price)}</span><span class="sk ${p.stock <= 0 ? 'out' : p.stock <= p.min_stock ? 'low' : ''}">${Q.qty(p.stock)} ${esc(p.unit || '')}</span></div></button>`).join('')
      : `<div class="empty" style="grid-column:1/-1">${S.products.length ? 'لا توجد نتائج' : 'لا توجد أصناف — أضف الأصناف من النظام الإداري'}</div>`;
    el.querySelectorAll('.tile').forEach((b) => (b.onclick = () => { add(S.products.find((p) => p.id == b.dataset.id)); focusSearch(); }));
  }

  // ===== السلة =====
  function add(p, qty = 1) {
    if (!p) return;
    const ex = S.cart.find((l) => l.id === p.id);
    const inCart = ex ? ex.qty : 0;
    if (!Q.settings.pos.allow_negative_stock && inCart + qty > p.stock) return Q.toast(`الكمية المتوفرة من "${p.name}" هي ${Q.qty(p.stock)} فقط`, 'err');
    if (ex) ex.qty += qty; else S.cart.push({ id: p.id, name: p.name, price: p.price, qty, discount: 0, stock: p.stock, min: p.min_stock });
    if (Q.settings.pos.low_stock_warning && p.stock - (inCart + qty) < 0 && Q.settings.pos.allow_negative_stock) Q.toast(`تنبيه: الكمية في النظام غير كافية (${Q.qty(p.stock)})`);
    drawCart(p.id);
  }
  const totals = () => {
    const t = Q.settings.tax;
    const m = Q.m;
    const subtotal = m(S.cart.reduce((s, l) => s + m(l.qty * l.price - (l.discount || 0)), 0));
    const discount = Math.min(m(S.discount), subtotal);
    const net = m(subtotal - discount);
    const rate = t.enabled ? Number(t.rate) : 0;
    let tax, total;
    if (t.inclusive) { total = net; tax = m(net - net / (1 + rate / 100)); } else { tax = m(net * rate / 100); total = m(net + tax); }
    return { subtotal, discount, tax, total, rate, count: S.cart.reduce((s, l) => s + l.qty, 0) };
  };
  function drawCart(flashId) {
    const el = Q.$('#lines'); if (!el) return;
    if (!S.cart.length) el.innerHTML = `<div class="cart-empty"><div>${icon('cart', 34)}<div style="margin-top:8px">السلة فارغة</div><div style="font-size:12px">امسح الباركود أو اختر صنفاً</div></div></div>`;
    else {
      el.innerHTML = S.cart.map((l, i) => `<div class="ln ${l.id === flashId ? 'flash' : ''}" data-i="${i}"><div><div class="nm">${esc(l.name)}</div>
        <div class="sub">${fmt(l.price)}${l.discount ? ` · خصم ${fmt(l.discount)}` : ''}</div></div>
        <div class="qt"><button data-m="${i}">${icon('minus', 13)}</button><span>${Q.qty(l.qty)}</span><button data-p="${i}">${icon('plus', 13)}</button></div>
        <div class="tt">${fmt(l.qty * l.price - (l.discount || 0))}</div></div>`).join('');
      el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const l = S.cart[b.dataset.m]; l.qty -= 1; if (l.qty <= 0) S.cart.splice(b.dataset.m, 1); drawCart(); focusSearch(); }));
      el.querySelectorAll('[data-p]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const l = S.cart[b.dataset.p]; add(S.products.find((p) => p.id === l.id) || { ...l, stock: Infinity }); focusSearch(); }));
      el.querySelectorAll('.ln').forEach((r) => (r.onclick = () => editLine(Number(r.dataset.i))));
      if (flashId) el.querySelector('.flash')?.scrollIntoView({ block: 'nearest' });
    }
    const t = totals();
    Q.$('#sum').innerHTML = `<div class="kv"><span>عدد القطع</span><b>${Q.qty(t.count)}</b></div><div class="kv"><span>المجموع</span><b>${fmt(t.subtotal)}</b></div>
      ${t.discount ? `<div class="kv"><span>الخصم</span><b class="err">-${fmt(t.discount)}</b></div>` : ''}
      ${t.tax ? `<div class="kv"><span>الضريبة ${t.rate}%${Q.settings.tax.inclusive ? ' (شاملة)' : ''}</span><b>${fmt(t.tax)}</b></div>` : ''}
      <div class="grand"><span>الإجمالي</span><span class="v">${fmt(t.total)} <small style="font-size:13px">${esc(Q.settings.currency)}</small></span></div>`;
    const c = Q.$('#cust');
    c.classList.toggle('set', !!S.customer);
    c.innerHTML = `${icon('user')}<span>${esc(S.customer ? S.customer.name + (S.customer.phone ? ' — ' + S.customer.phone : '') : 'عميل نقدي')}</span>`;
    Q.$('#b-pay').disabled = !S.cart.length;
  }
  function reset() { S.cart = []; S.customer = null; S.discount = 0; drawCart(); focusSearch(); }

  function editLine(i) {
    const l = S.cart[i];
    const m = Q.modal({
      title: l.name, width: 380,
      body: `<div class="fgrid"><label class="f"><span>الكمية</span><input class="input num big-in" type="number" step="any" id="eq" value="${l.qty}"></label>
        <label class="f"><span>السعر${can('cashier_edit_price') ? '' : ' (غير قابل للتعديل)'}</span><input class="input num big-in" type="number" step="any" id="ep" value="${l.price}" ${can('cashier_edit_price') ? '' : 'readonly tabindex="-1" style="background:#f4f5f7"'}></label>
        ${can('cashier_discount') ? `<label class="f full"><span>خصم على السطر (مبلغ)${maxDisc() ? ` — الحد ${maxDisc()}%` : ''}</span><input class="input num" type="number" step="any" id="ed" value="${l.discount || ''}" placeholder="0"></label>` : ''}</div>`,
      foot: '<button class="btn primary" data-ok>تحديث</button><button class="btn danger" data-rm>حذف الصنف</button><button class="btn" data-c>إلغاء</button>',
      onClose: focusSearch,
    });
    m.$('#eq').select();
    const ok = () => {
      const q = Number(m.$('#eq').value);
      if (!(q > 0)) { S.cart.splice(i, 1); } else {
        const price = can('cashier_edit_price') ? Number(m.$('#ep').value) || 0 : l.price;
        const disc = m.$('#ed') ? Math.min(Number(m.$('#ed').value) || 0, q * price) : 0;
        if (maxDisc() && disc > (q * price * maxDisc()) / 100 + 0.01) return Q.toast(`الحد الأعلى للخصم ${maxDisc()}%`, 'err');
        if (price !== l.price) l.edited = true;
        l.qty = q; l.price = price; l.discount = disc;
      }
      m.close(); drawCart();
    };
    m.$('[data-ok]').onclick = ok;
    m.el.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
    m.$('[data-rm]').onclick = () => { S.cart.splice(i, 1); m.close(); drawCart(); };
    m.$('[data-c]').onclick = m.close;
  }
  function discountDlg() {
    if (!can('cashier_discount')) return Q.toast('الخصم غير مسموح — يحتاج صلاحية المدير', 'err');
    const t = totals();
    const m = Q.modal({
      title: 'خصم على الفاتورة', width: 360,
      body: `<div class="seg" style="margin-bottom:10px" id="dm"><button data-t="amt" class="on">مبلغ</button><button data-t="pct">نسبة %</button></div>
        <input class="input num big-in" type="number" step="any" id="dv" value="${S.discount || ''}" placeholder="0"><div class="muted" style="margin-top:6px">المجموع: ${fmt(t.subtotal)}</div>`,
      foot: '<button class="btn primary" data-ok>تطبيق</button><button class="btn" data-rm>إزالة الخصم</button>', onClose: focusSearch,
    });
    let mode = 'amt';
    m.$$('#dm button').forEach((b) => (b.onclick = () => { mode = b.dataset.t; m.$$('#dm button').forEach((x) => x.classList.toggle('on', x === b)); m.$('#dv').focus(); }));
    const ok = () => {
      const v = Number(m.$('#dv').value) || 0;
      const d = n(mode === 'pct' ? (t.subtotal * Math.min(v, 100)) / 100 : v);
      const lineDisc = S.cart.reduce((x, l) => x + (l.discount || 0), 0), gross = t.subtotal + lineDisc;
      if (maxDisc() && d + lineDisc > (gross * maxDisc()) / 100 + 0.01) return Q.toast(`الحد الأعلى للخصم ${maxDisc()}% من قيمة الفاتورة`, 'err');
      S.discount = d; m.close(); drawCart();
    };
    m.$('[data-ok]').onclick = ok;
    m.$('#dv').onkeydown = (e) => e.key === 'Enter' && ok();
    m.$('[data-rm]').onclick = () => { S.discount = 0; m.close(); drawCart(); };
  }

  // ===== العملاء =====
  async function pickCustomer() {
    const list = await Q.get('/customers');
    const m = Q.modal({
      title: 'اختيار العميل', width: 460,
      body: `<div class="row"><input class="input" id="cq" placeholder="بحث بالاسم أو رقم الجوال…"><button class="btn" id="cn">${icon('plus')} جديد</button></div>
        <div class="list-pick" id="cl" style="margin-top:8px;max-height:340px;overflow:auto"></div>`,
      foot: '<button class="btn" data-cash>عميل نقدي</button>', onClose: focusSearch,
    });
    const draw = (q = '') => {
      const r = list.filter((c) => !q || c.name.includes(q) || (c.phone || '').includes(q)).slice(0, 60);
      m.$('#cl').innerHTML = r.map((c) => `<div class="it" data-id="${c.id}"><span class="grow b">${esc(c.name)}</span><span class="muted" dir="ltr">${esc(c.phone || '')}</span>${c.balance ? `<span class="tag warn">${fmt(c.balance)}</span>` : ''}</div>`).join('') || '<div class="empty">لا توجد نتائج</div>';
      m.$$('[data-id]').forEach((d) => (d.onclick = () => { S.customer = list.find((c) => c.id == d.dataset.id); m.close(); drawCart(); }));
    };
    m.$('#cq').oninput = (e) => draw(e.target.value.trim());
    m.$('[data-cash]').onclick = () => { S.customer = null; m.close(); drawCart(); };
    m.$('#cn').onclick = () => {
      const q = m.$('#cq').value.trim();
      m.close();
      const f = Q.modal({
        title: 'عميل جديد', width: 400,
        body: `<div class="fgrid"><label class="f full"><span>الاسم *</span><input class="input" id="nn" value="${/^\d+$/.test(q) ? '' : esc(q)}"></label>
          <label class="f full"><span>رقم الجوال</span><input class="input num" id="np" value="${/^\d+$/.test(q) ? esc(q) : ''}"></label></div>`,
        foot: '<button class="btn primary" data-ok>حفظ واختيار</button>', onClose: focusSearch,
      });
      f.$('[data-ok]').onclick = async () => {
        try { S.customer = await Q.post('/customers', { name: f.$('#nn').value.trim(), phone: f.$('#np').value.trim() }); f.close(); drawCart(); } catch (e) { Q.err(e); }
      };
    };
    draw();
  }

  // ===== التعليق =====
  const getHeld = () => { try { return JSON.parse(localStorage.getItem(HOLD_KEY) || '[]'); } catch { return []; } };
  const setHeld = (h) => { localStorage.setItem(HOLD_KEY, JSON.stringify(h)); heldCount(); };
  const heldCount = () => { const el = Q.$('#heldn'); if (el) { const k = getHeld().length; el.textContent = k; el.className = 'tag ' + (k ? 'warn' : ''); } };
  function hold() {
    if (!S.cart.length) return;
    const h = getHeld();
    h.push({ at: new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }), cart: S.cart, customer: S.customer, discount: S.discount, total: totals().total });
    setHeld(h); reset(); Q.toast('تم تعليق الفاتورة', 'ok');
  }
  function heldDlg() {
    const h = getHeld();
    const m = Q.modal({
      title: 'الفواتير المعلقة', width: 480, onClose: focusSearch,
      body: h.length ? `<table class="tbl"><thead><tr><th>الوقت</th><th>العميل</th><th class="n">القطع</th><th class="n">الإجمالي</th><th></th></tr></thead><tbody>
        ${h.map((x, i) => `<tr><td>${esc(x.at)}</td><td>${esc(x.customer?.name || 'عميل نقدي')}</td><td class="n">${x.cart.reduce((s, l) => s + l.qty, 0)}</td><td class="n b">${fmt(x.total)}</td>
        <td class="act"><div class="row"><button class="btn sm primary" data-r="${i}">استرجاع</button><button class="btn sm ghost danger" data-d="${i}">${icon('trash', 14)}</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">لا توجد فواتير معلقة</div>',
    });
    m.$$('[data-r]').forEach((b) => (b.onclick = () => {
      const x = h.splice(b.dataset.r, 1)[0];
      if (S.cart.length) h.push({ at: new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }), cart: S.cart, customer: S.customer, discount: S.discount, total: totals().total });
      setHeld(h); S.cart = x.cart; S.customer = x.customer; S.discount = x.discount; m.close(); syncCart();
    }));
    m.$$('[data-d]').forEach((b) => (b.onclick = () => { h.splice(b.dataset.d, 1); setHeld(h); m.close(); heldDlg(); }));
  }

  // ===== الدفع =====
  function pay() {
    if (!S.cart.length) return;
    if (!S.shift && Q.settings.pos.require_shift) return openShift();
    const t = totals();
    let method = 'cash';
    const m = Q.modal({
      title: 'الدفع', width: 470, onClose: focusSearch,
      body: `<div class="pay-total"><div class="k">المبلغ المطلوب</div><div class="v">${fmt(t.total)} <small style="font-size:15px">${esc(Q.settings.currency)}</small></div></div>
        <div class="methods">${[['cash', 'نقدي', 'cash'], ['card', 'شبكة', 'card'], ['mixed', 'مختلط', 'wallet'], ['credit', 'آجل', 'user']].map(([k, l, i]) => `<button data-m="${k}">${icon(i, 18)}${l}</button>`).join('')}</div>
        <div id="pbody"></div>`,
      foot: '<button class="btn primary" data-ok style="height:42px;padding:0 26px;font-size:15px">تأكيد الدفع <span class="kbd" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4)">Enter</span></button><button class="btn" data-c style="height:42px">إلغاء</button>',
    });
    const body = () => {
      m.$$('.methods button').forEach((b) => b.classList.toggle('on', b.dataset.m === method));
      const pb = m.$('#pbody');
      if (method === 'cash') {
        // فئات العملة العراقية: 250، 500، 1000، 5000، 10000، 25000، 50000
        const notes = [...new Set([t.total, ...[1000, 5000, 10000, 25000, 50000].map((d) => Math.ceil(t.total / d) * d), Math.ceil(t.total / 50000) * 50000 + 50000])]
          .filter((x) => x >= t.total).sort((a, b) => a - b).slice(0, 5);
        pb.innerHTML = `<label class="f"><span>المبلغ المستلم من العميل</span><input class="input num big-in" type="number" step="any" id="tend" value="${t.total}"></label>
          <div class="quick">${notes.map((x) => `<button class="btn" data-q="${x}">${fmt(x, 0)}</button>`).join('')}</div><div class="change" id="chg"></div>`;
        const upd = () => { const c = n((Number(m.$('#tend').value) || 0) - t.total); const el = m.$('#chg'); el.classList.toggle('neg', c < 0); el.innerHTML = `<span>${c < 0 ? 'المبلغ ناقص' : 'الباقي للعميل'}</span><span class="v">${fmt(Math.abs(c))}</span>`; };
        m.$('#tend').oninput = upd; m.$$('[data-q]').forEach((b) => (b.onclick = () => { m.$('#tend').value = b.dataset.q; upd(); m.$('#tend').focus(); }));
        upd(); setTimeout(() => m.$('#tend').select(), 40);
      } else if (method === 'card') pb.innerHTML = `<div class="change" style="background:var(--info-bg);color:var(--info)"><span>يتم تحصيل كامل المبلغ عبر جهاز الشبكة</span><span class="v">${fmt(t.total)}</span></div>`;
      else if (method === 'mixed') {
        pb.innerHTML = `<div class="fgrid"><label class="f"><span>نقدي</span><input class="input num big-in" type="number" step="any" id="mc" value=""></label>
          <label class="f"><span>شبكة</span><input class="input num big-in" type="number" step="any" id="mk" value="${t.total}"></label></div><div class="change" id="chg"></div>`;
        const upd = (src) => { const c = Number(m.$('#mc').value) || 0; if (src === 'c') m.$('#mk').value = n(Math.max(0, t.total - c)); const k = Number(m.$('#mk').value) || 0; const r = n(t.total - c - k); const el = m.$('#chg'); el.classList.toggle('neg', Math.abs(r) > 0.009); el.innerHTML = `<span>${Math.abs(r) < 0.01 ? 'المبلغ مكتمل' : r > 0 ? 'المتبقي' : 'زيادة'}</span><span class="v">${fmt(Math.abs(r))}</span>`; };
        m.$('#mc').oninput = () => upd('c'); m.$('#mk').oninput = () => upd('k'); upd(); setTimeout(() => m.$('#mc').focus(), 40);
      } else {
        pb.innerHTML = S.customer ? `<div class="change" style="background:var(--warn-bg);color:var(--warn)"><span>على حساب: ${esc(S.customer.name)}</span><span class="v">${fmt(t.total)}</span></div>
          <label class="f" style="margin-top:10px"><span>دفعة مقدمة نقداً (اختياري)</span><input class="input num" type="number" step="any" id="adv" placeholder="0"></label>`
          : `<div class="change neg"><span>البيع الآجل يتطلب اختيار عميل</span><button class="btn sm" id="pc">اختيار عميل</button></div>`;
        m.$('#pc') && (m.$('#pc').onclick = () => { m.close(); pickCustomer(); });
      }
    };
    m.$$('.methods button').forEach((b) => (b.onclick = () => { method = b.dataset.m; body(); }));
    m.$('[data-c]').onclick = m.close;
    let busy = false;
    const confirmPay = async () => {
      if (busy) return;
      const req = { source: 'pos', customer_id: S.customer?.id || null, discount: S.discount, items: S.cart.map((l) => ({ product_id: l.id, qty: l.qty, price: l.price, discount: l.discount })) };
      if (method === 'cash') {
        const tend = Number(m.$('#tend').value) || 0;
        if (tend < t.total - 0.009) return Q.toast('المبلغ المستلم أقل من الإجمالي', 'err');
        req.paid_cash = t.total; req.tendered = tend;
      } else if (method === 'card') req.paid_card = t.total;
      else if (method === 'mixed') {
        req.paid_cash = Number(m.$('#mc').value) || 0; req.paid_card = Number(m.$('#mk').value) || 0;
        if (Math.abs(req.paid_cash + req.paid_card - t.total) > 0.009) return Q.toast('مجموع النقدي والشبكة لا يساوي الإجمالي', 'err');
      } else {
        if (!S.customer) return Q.toast('اختر العميل للبيع الآجل', 'err');
        req.paid_cash = Math.min(Number(m.$('#adv')?.value) || 0, t.total);
      }
      busy = true; m.$('[data-ok]').disabled = true;
      try {
        const inv = await Q.post('/invoices', req);
        m.close(); reset();
        if (Q.settings.pos.auto_print) Q.print.run(Q.print.thermal(inv), { copies: Q.settings.print_thermal.copies || 1 });
        doneDlg(inv);
        refreshShift();
      } catch (e) { Q.err(e); busy = false; m.$('[data-ok]').disabled = false; }
    };
    m.$('[data-ok]').onclick = confirmPay;
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmPay(); } });
    body();
  }
  function doneDlg(inv) {
    const change = inv.tendered ? n(inv.tendered - inv.paid_cash) : 0;
    const m = Q.modal({
      title: 'تمت العملية', width: 380, onClose: focusSearch,
      body: `<div class="done"><div class="ic">${icon('check', 28)}</div><div class="b" style="font-size:15px">فاتورة ${esc(inv.number)}</div><div class="muted">الإجمالي ${fmt(inv.total)}</div>
        ${change > 0 ? `<div class="change" style="margin-top:14px"><span>الباقي للعميل</span><span class="v">${fmt(change)}</span></div>` : ''}</div>`,
      foot: `<button class="btn primary" data-n>فاتورة جديدة <span class="kbd" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4)">Enter</span></button><button class="btn" data-p>${icon('printer')} طباعة</button>`,
    });
    m.$('[data-n]').onclick = m.close;
    m.$('[data-p]').onclick = () => Q.print.run(Q.print.thermal(inv));
    m.$('[data-n]').focus();
  }

  // ===== الفواتير والمرتجعات =====
  async function invoicesDlg() {
    const rows = await Q.get('/invoices' + Q.qs({ from: Q.today(), to: Q.today(), limit: 200 }));
    const m = Q.modal({
      title: 'فواتير اليوم', width: 720, onClose: focusSearch,
      body: `<input class="input" id="iq" placeholder="بحث برقم الفاتورة…" style="margin-bottom:8px"><div style="max-height:420px;overflow:auto" id="il"></div>`,
    });
    const draw = (q = '') => {
      const r = rows.filter((x) => !q || x.number.includes(q.toUpperCase()) || String(x.no) === q.replace(/\D/g, '').replace(/^0+/, ''));
      m.$('#il').innerHTML = r.length ? `<table class="tbl"><thead><tr><th>الرقم</th><th>الوقت</th><th>العميل</th><th>الدفع</th><th class="n">الإجمالي</th><th></th></tr></thead><tbody>
        ${r.map((x) => `<tr><td><b class="mono">${x.number}</b> ${x.type === 'return' ? '<span class="tag err">مرتجع</span>' : ''}</td><td>${x.date.slice(11, 16)}</td><td>${esc(x.customer_name || 'نقدي')}</td>
        <td>${Q.METHODS[x.method] || ''}</td><td class="n b">${fmt(x.total)}</td><td class="act"><div class="row"><button class="btn sm" data-p="${x.id}">${icon('printer', 14)} طباعة</button>
        ${x.type === 'sale' ? `<button class="btn sm danger" data-r="${x.id}">${icon('ret', 14)} مرتجع</button>` : ''}</div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">لا توجد فواتير</div>';
      m.$$('[data-p]').forEach((b) => (b.onclick = async () => Q.print.run(Q.print.thermal(await Q.get('/invoices/' + b.dataset.p)))));
      m.$$('[data-r]').forEach((b) => (b.onclick = async () => { m.close(); returnDlg(await Q.get('/invoices/' + b.dataset.r)); }));
    };
    m.$('#iq').oninput = (e) => draw(e.target.value.trim());
    draw();
  }
  function returnLookup() {
    const m = Q.modal({
      title: 'مرتجع مبيعات', width: 380, onClose: focusSearch,
      body: '<label class="f"><span>رقم الفاتورة الأصلية (أو امسح باركود الفاتورة)</span><input class="input num big-in" id="rn" placeholder="S-00001"></label>',
      foot: '<button class="btn primary" data-ok>بحث</button>',
    });
    const go = async () => { try { const inv = await Q.get('/invoices/lookup/' + encodeURIComponent(m.$('#rn').value.trim())); m.close(); returnDlg(inv); } catch (e) { Q.err(e); } };
    m.$('[data-ok]').onclick = go;
    m.$('#rn').onkeydown = (e) => e.key === 'Enter' && go();
  }
  function returnDlg(inv) {
    const items = inv.items.filter((i) => i.qty > i.returned_qty);
    if (!items.length) return Q.toast('تم إرجاع كامل أصناف هذه الفاتورة سابقاً', 'err');
    const m = Q.modal({
      title: `مرتجع من ${inv.number}`, width: 560, onClose: focusSearch,
      body: `<div class="muted" style="margin-bottom:8px">${Q.dt(inv.date)} · ${esc(inv.customer_name || 'عميل نقدي')} · الإجمالي ${fmt(inv.total)}</div>
        <table class="tbl"><thead><tr><th>الصنف</th><th class="n">السعر</th><th class="n">المتاح</th><th style="width:100px">الإرجاع</th></tr></thead><tbody>
        ${items.map((i) => `<tr><td>${esc(i.name)}</td><td class="n">${fmt(i.total / i.qty)}</td><td class="n">${Q.qty(i.qty - i.returned_qty)}</td><td><input class="input sm num" type="number" min="0" step="any" max="${i.qty - i.returned_qty}" data-id="${i.id}" value="0"></td></tr>`).join('')}</tbody></table>
        <div class="row" style="margin-top:10px"><button class="btn sm" id="all">إرجاع الكل</button><span class="sp"></span><span class="muted">الاسترداد</span>
        <select class="input" id="rm" style="width:150px"><option value="cash">نقدي</option><option value="card">شبكة</option>${inv.customer_id ? '<option value="credit">لحساب العميل</option>' : ''}</select></div>`,
      foot: '<button class="btn danger" data-ok>تنفيذ المرتجع وطباعة</button><button class="btn" data-c>إلغاء</button>',
    });
    m.$('#all').onclick = () => m.$$('[data-id]').forEach((x) => (x.value = x.max));
    m.$('[data-c]').onclick = m.close;
    m.$('[data-ok]').onclick = async () => {
      const req = m.$$('[data-id]').map((x) => ({ item_id: x.dataset.id, qty: Number(x.value) || 0 })).filter((x) => x.qty > 0);
      if (!req.length) return Q.toast('حدد الكميات المرتجعة', 'err');
      try {
        const r = await Q.post(`/invoices/${inv.id}/return`, { items: req, refund_method: m.$('#rm').value, source: 'pos' });
        m.close(); Q.toast(`تم المرتجع ${r.number} — المبلغ المسترد ${fmt(r.total)}`, 'ok');
        Q.print.run(Q.print.thermal(r)); refreshShift();
      } catch (e) { Q.err(e); }
    };
  }

  // ===== الوردية =====
  async function refreshShift() { try { S.shift = await Q.get('/shifts/current'); shiftInfo(); } catch { /* */ } }
  function openShift() {
    const m = Q.modal({
      title: 'فتح وردية جديدة', width: 380, onClose: () => { focusSearch(); },
      body: `<p class="muted" style="margin-top:0">أدخل المبلغ النقدي الموجود في الدرج عند بداية الوردية.</p><label class="f"><span>رصيد الافتتاح</span><input class="input num big-in" type="number" step="any" id="oc" value="0"></label>`,
      foot: '<button class="btn primary" data-ok>فتح الوردية</button>',
    });
    const go = async () => { try { S.shift = await Q.post('/shifts/open', { opening_cash: Number(m.$('#oc').value) || 0 }); m.close(); shiftInfo(); Q.toast('تم فتح الوردية', 'ok'); } catch (e) { Q.err(e); } };
    m.$('[data-ok]').onclick = go;
    m.$('#oc').onkeydown = (e) => e.key === 'Enter' && go();
    m.$('#oc').select();
  }
  async function shiftDlg() {
    await refreshShift();
    if (!S.shift) return openShift();
    const s = S.shift;
    const kv = (k, v, cls = '') => `<div class="kv" style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line-2)"><span class="muted">${k}</span><b class="num ${cls}">${v}</b></div>`;
    const m = Q.modal({
      title: `الوردية #${s.shift.id}`, width: 440, onClose: focusSearch,
      body: `<div class="muted" style="margin-bottom:8px">بدأت ${Q.dt(s.shift.opened_at)}</div>
        ${kv('فواتير البيع', s.sales.n)}${kv('إجمالي المبيعات', fmt(s.sales.total))}${kv('نقدي', fmt(s.sales.cash))}${kv('شبكة', fmt(s.sales.card))}${kv('آجل', fmt(s.sales.credit))}
        ${kv('المرتجعات', fmt(s.returns.total), 'err')}${kv('صافي المبيعات', fmt(s.net))}${kv('رصيد الافتتاح', fmt(s.shift.opening_cash))}${kv('النقد المتوقع في الدرج', fmt(s.expected_cash), 'ok')}
        <label class="f" style="margin-top:12px"><span>النقد الفعلي عند الإغلاق</span><input class="input num big-in" type="number" step="any" id="cc" placeholder="${fmt(s.expected_cash)}"></label>
        <label class="f" style="margin-top:8px"><span>ملاحظات</span><input class="input" id="cn"></label>`,
      foot: '<button class="btn danger" data-ok>إغلاق الوردية وطباعة التقرير</button><button class="btn" data-p>طباعة ملخص</button>',
    });
    m.$('[data-p]').onclick = () => Q.print.run(Q.print.shiftThermal(s));
    m.$('[data-ok]').onclick = async () => {
      const v = m.$('#cc').value;
      if (v === '') return Q.toast('أدخل النقد الفعلي الموجود في الدرج', 'err');
      if (!(await Q.confirm('تأكيد إغلاق الوردية؟'))) return;
      try {
        const r = await Q.post(`/shifts/${s.shift.id}/close`, { counted_cash: Number(v), notes: m.$('#cn').value });
        m.close(); Q.print.run(Q.print.shiftThermal(r)); S.shift = null; shiftInfo();
        const d = n(r.shift.counted_cash - r.expected_cash);
        Q.toast(d === 0 ? 'تم إغلاق الوردية — الصندوق مطابق' : `تم إغلاق الوردية — ${d > 0 ? 'زيادة' : 'عجز'} ${fmt(Math.abs(d))}`, d === 0 ? 'ok' : 'err');
        setTimeout(async () => { try { await Q.post('/logout'); } catch { /* */ } localStorage.removeItem(Q.tokenKey); login(); }, 1500);
      } catch (e) { Q.err(e); }
    };
  }

  // ===== اختصارات لوحة المفاتيح =====
  document.addEventListener('keydown', (e) => {
    if (!S.user || !Q.$('.pos')) return;
    if (document.querySelector('.modal-bg')) return;
    if (e.key === 'F2') { e.preventDefault(); Q.$('#q').focus(); }
    else if (e.key === 'F4') { e.preventDefault(); hold(); }
    else if (e.key === 'F8') { e.preventDefault(); pickCustomer(); }
    else if (e.key === 'F9') { e.preventDefault(); pay(); }
    else if (e.key.length === 1 && document.activeElement.tagName !== 'INPUT') Q.$('#q').focus();
  });

  start();
})();
