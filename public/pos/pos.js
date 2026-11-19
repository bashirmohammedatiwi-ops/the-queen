// The Queen — نقطة البيع (POS)
(function () {
  const { esc, fmt, icon, n } = Q;
  Q.tokenKey = 'queen_pos_token';
  const HOLD_KEY = 'queen_pos_held';
  const S = { user: null, shift: null, products: [], cats: [], cart: [], customer: null, discount: 0, es: null, sel: -1, mult: 1 };
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
      products: Q.debounce(async () => { await loadProducts(); syncCart(); }, 300),
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

  // ===== الواجهة: البيع بمسح الباركود =====
  // حقل الباركود يحتفظ بالمؤشر دائماً؛ أي ضغطة مفتاح تذهب إليه، ويعود إليه المؤشر بعد كل عملية
  function render() {
    const st = Q.settings.store;
    app.innerHTML = `<div class="pos">
      <header class="ptop">
        <div class="brand"><div class="brand-mark">${st.logo ? `<img src="${st.logo}">` : 'Q'}</div><div><div class="brand-t">${esc(st.name)}</div><div class="brand-s"><span class="live" id="live"></span>نقطة البيع</div></div></div>
        <span class="sp"></span>
        <button class="btn" id="b-find">${icon('search')} بحث بالاسم <span class="kbd">F3</span></button>
        <button class="btn" id="b-inv">${icon('file')} الفواتير</button>
        <button class="btn" id="b-held">${icon('pause')} المعلقة <span class="tag" id="heldn">0</span></button>
        <button class="btn" id="b-shift">${icon('clock')} الوردية</button>
        ${window.desktop ? `<button class="btn" id="b-dev" title="طابعة هذا الجهاز">${icon('printer')}</button>` : ''}
        <div class="info"><b>${esc(S.user.name)}</b><span id="shinfo"></span></div>
        <button class="btn ghost icon" id="b-out" title="خروج">${icon('out')}</button>
      </header>
      <section class="main">
        <div class="scan" id="scanbox">
          <div class="scan-ic">${icon('barcode', 26)}</div>
          <input id="scan" class="scan-in" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="none" dir="ltr" placeholder="امسح الباركود…">
          <div class="scan-qty" id="sqty" hidden></div>
          <div class="scan-msg" id="smsg"><span class="muted">جاهز للمسح — اكتب <b class="mono">3*</b> قبل المسح لإضافة 3 قطع</span></div>
        </div>
        <div class="tbl-h"><span>#</span><span>الصنف</span><span class="n">السعر</span><span class="c">الكمية</span><span class="n">الخصم</span><span class="n">المجموع</span><span></span></div>
        <div class="lines" id="lines"></div>
        <div class="keys"><span><span class="kbd">↑↓</span> تحديد سطر</span><span><span class="kbd">+</span><span class="kbd">−</span> الكمية</span><span><span class="kbd">*</span> كمية</span><span><span class="kbd">Del</span> حذف</span><span><span class="kbd">F6</span> خصم</span><span><span class="kbd">F4</span> تعليق</span><span><span class="kbd">F7</span> مرتجع</span><span><span class="kbd">F8</span> عميل</span></div>
      </section>
      <aside class="side">
        <div class="cust" id="cust">${icon('user')}<span>عميل نقدي</span></div>
        <div class="big-total"><div class="k">الإجمالي</div><div class="v" id="gt">0</div><div class="cur">${esc(Q.settings.currency)}</div></div>
        <div class="sum" id="sum"></div>
        <div class="acts">
          <button class="btn" id="b-disc">خصم <span class="kbd">F6</span></button>
          <button class="btn" id="b-hold">${icon('pause')} تعليق <span class="kbd">F4</span></button>
          <button class="btn" id="b-ret">${icon('ret')} مرتجع <span class="kbd">F7</span></button>
          <button class="btn danger" id="b-clear">${icon('trash')} إلغاء</button>
        </div>
        <button class="btn primary paybtn" id="b-pay">${icon('cash', 20)} الدفع <span class="kbd inv">F9</span></button>
        <button class="btn paybtn2" id="b-quick">نقدي بالمبلغ الكامل <span class="kbd">F10</span></button>
      </aside></div>`;
    const sc = Q.$('#scan');
    sc.onkeydown = onScanKey;
    sc.oninput = () => { const m = sc.value.match(/^(\d+(?:\.\d+)?)\*$/); if (m) { S.mult = Number(m[1]); sc.value = ''; showMult(); } };
    Q.$('#cust').onclick = pickCustomer;
    Q.$('#b-clear').onclick = async () => { if (S.cart.length && (await Q.confirm('إلغاء الفاتورة الحالية وإفراغ السلة؟', { danger: true, ok: 'إلغاء الفاتورة' }))) reset(); else focusSearch(); };
    Q.$('#b-disc').onclick = discountDlg;
    Q.$('#b-hold').onclick = hold;
    Q.$('#b-held').onclick = heldDlg;
    Q.$('#b-pay').onclick = () => pay();
    Q.$('#b-quick').onclick = quickCash;
    Q.$('#b-inv').onclick = invoicesDlg;
    Q.$('#b-ret').onclick = returnLookup;
    Q.$('#b-shift').onclick = shiftDlg;
    Q.$('#b-find').onclick = findDlg;
    Q.$('#b-dev') && (Q.$('#b-dev').onclick = () => Q.print.deviceDialog());
    Q.$('#b-out').onclick = async () => { if (S.cart.length && !(await Q.confirm('السلة غير فارغة، الخروج على أي حال؟'))) return focusSearch(); try { await Q.post('/logout'); } catch { /* */ } localStorage.removeItem(Q.tokenKey); login(); };
    drawCart(); shiftInfo(); heldCount();
    sc.focus();
  }
  const shiftInfo = () => { const el = Q.$('#shinfo'); if (el) el.textContent = S.shift ? `وردية #${S.shift.shift.id}` : 'لا توجد وردية'; };
  const modalOpen = () => !!document.querySelector('.modal-bg');
  const focusSearch = () => setTimeout(() => { if (!modalOpen()) { const s = Q.$('#scan'); if (s && document.activeElement !== s) s.focus(); } }, 30);
  // إعادة المؤشر لحقل الباركود دائماً
  document.addEventListener('mouseup', () => { if (!modalOpen() && Q.$('#scan') && !window.getSelection().toString()) focusSearch(); });
  window.addEventListener('focus', focusSearch);
  setInterval(() => { if (Q.$('#scan') && !modalOpen() && document.activeElement !== Q.$('#scan') && document.hasFocus()) Q.$('#scan').focus(); }, 800);

  // صوت تأكيد المسح وصوت الخطأ
  let ac = null;
  function beep(ok = true) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = ok ? 'sine' : 'square'; o.frequency.value = ok ? 1250 : 220;
      g.gain.setValueAtTime(ok ? 0.08 : 0.06, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (ok ? 0.09 : 0.35));
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + (ok ? 0.1 : 0.36));
    } catch { /* */ }
  }
  function msg(html, type = '') {
    const el = Q.$('#smsg'), box = Q.$('#scanbox'); if (!el) return;
    el.innerHTML = html; box.classList.remove('ok', 'bad'); void box.offsetWidth; if (type) box.classList.add(type);
  }
  const showMult = () => { const q = Q.$('#sqty'); q.hidden = S.mult === 1; q.textContent = '× ' + Q.qty(S.mult); };

  // البحث عن الصنف بالباركود أو الرمز (مع دعم الأرقام العربية)
  const norm = (v) => String(v || '').trim().replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
  const byCode = (v) => { v = norm(v); return S.products.find((x) => x.barcode === v) || S.products.find((x) => (x.sku || '').toLowerCase() === v.toLowerCase()); };
  function onScanKey(e) {
    const sc = e.target;
    if (e.key === 'Enter') {
      e.preventDefault();
      let v = norm(sc.value); sc.value = '';
      if (!v) return;
      let qty = S.mult;
      const m = v.match(/^(\d+(?:\.\d+)?)\*(.+)$/); if (m) { qty = Number(m[1]); v = m[2].trim(); }
      S.mult = 1; showMult();
      const p = byCode(v);
      if (p) { add(p, qty); return; }
      beep(false);
      msg(`<b class="err">الصنف غير موجود:</b> <span class="mono">${esc(v)}</span> <span class="muted">— تأكد من الباركود أو ابحث بالاسم (F3)</span>`, 'bad');
      return;
    }
    if (sc.value) { if (e.key === 'Escape') { sc.value = ''; S.mult = 1; showMult(); } return; }
    // اختصارات السطر المحدد عندما يكون الحقل فارغاً
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (S.cart.length) { S.sel = Math.max(0, Math.min(S.cart.length - 1, S.sel + (e.key === 'ArrowDown' ? 1 : -1))); drawCart(); } }
    else if (e.key === '+' ) { e.preventDefault(); bump(1); }
    else if (e.key === '-') { e.preventDefault(); bump(-1); }
    else if (e.key === 'Delete') { e.preventDefault(); if (S.cart[S.sel]) { S.cart.splice(S.sel, 1); S.sel = Math.min(S.sel, S.cart.length - 1); drawCart(); } }
    else if (e.key === '*') { e.preventDefault(); if (S.cart[S.sel]) editLine(S.sel); }
    else if (e.key === 'Escape') { S.mult = 1; showMult(); }
  }
  function bump(d) {
    const l = S.cart[S.sel]; if (!l) return;
    if (d > 0) { const p = S.products.find((x) => x.id === l.id) || { ...l, stock: Infinity }; return add(p, 1); }
    l.qty -= 1; if (l.qty <= 0) { S.cart.splice(S.sel, 1); S.sel = Math.min(S.sel, S.cart.length - 1); }
    drawCart();
  }

  // ===== السلة =====
  function add(p, qty = 1) {
    if (!p) return;
    const ex = S.cart.find((l) => l.id === p.id);
    const inCart = ex ? ex.qty : 0;
    if (!Q.settings.pos.allow_negative_stock && inCart + qty > p.stock) { beep(false); msg(`<b class="err">الكمية غير كافية:</b> ${esc(p.name)} — المتوفر ${Q.qty(p.stock)}`, 'bad'); return; }
    if (ex) ex.qty += qty;
    else S.cart.push({ id: p.id, name: p.name, code: p.barcode || p.sku || '', unit: p.unit || '', price: p.price, qty, discount: 0, stock: p.stock, min: p.min_stock });
    S.sel = S.cart.indexOf(ex || S.cart[S.cart.length - 1]);
    beep(true);
    const l = S.cart[S.sel];
    const warn = Q.settings.pos.low_stock_warning && p.stock - (inCart + qty) < 0 ? ` <span class="tag warn">المخزون في النظام ${Q.qty(p.stock)}</span>` : '';
    msg(`<b>${esc(p.name)}</b> <span class="muted">×</span> <b class="num">${Q.qty(l.qty)}</b> <span class="sp"></span><b class="num pr">${fmt(p.price)}</b>${warn}`, 'ok');
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
    return { subtotal, discount, tax, total, rate, count: S.cart.reduce((s, l) => s + l.qty, 0), lines: S.cart.length };
  };
  function drawCart(flashId) {
    const el = Q.$('#lines'); if (!el) return;
    if (S.sel >= S.cart.length) S.sel = S.cart.length - 1;
    if (!S.cart.length) el.innerHTML = `<div class="cart-empty"><div>${icon('barcode', 54)}<div class="t">امسح باركود الصنف لبدء الفاتورة</div><div class="s">أو اضغط F3 للبحث بالاسم</div></div></div>`;
    else {
      el.innerHTML = S.cart.map((l, i) => `<div class="ln ${i === S.sel ? 'sel' : ''} ${l.id === flashId ? 'flash' : ''}" data-i="${i}">
        <span class="no num">${i + 1}</span>
        <div class="nmw"><div class="nm">${esc(l.name)}</div><div class="sub mono">${esc(l.code || '')}${l.edited ? ' <span class="tag">سعر معدّل</span>' : ''}</div></div>
        <span class="n num">${fmt(l.price)}</span>
        <div class="qt"><button data-m="${i}" tabindex="-1">${icon('minus', 14)}</button><span class="num">${Q.qty(l.qty)}</span><button data-p="${i}" tabindex="-1">${icon('plus', 14)}</button></div>
        <span class="n num ${l.discount ? 'err' : 'faint'}">${l.discount ? fmt(l.discount) : '—'}</span>
        <span class="n num tt">${fmt(l.qty * l.price - (l.discount || 0))}</span>
        <button class="rm" data-rm="${i}" tabindex="-1" title="حذف">${icon('x', 15)}</button></div>`).join('');
      el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); S.sel = Number(b.dataset.m); bump(-1); focusSearch(); }));
      el.querySelectorAll('[data-p]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); S.sel = Number(b.dataset.p); bump(1); focusSearch(); }));
      el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); S.cart.splice(Number(b.dataset.rm), 1); drawCart(); focusSearch(); }));
      el.querySelectorAll('.ln').forEach((r) => (r.onclick = () => { S.sel = Number(r.dataset.i); drawCart(); focusSearch(); }));
      el.querySelectorAll('.ln').forEach((r) => (r.ondblclick = () => editLine(Number(r.dataset.i))));
      el.querySelector('.ln.sel')?.scrollIntoView({ block: 'nearest' });
    }
    const t = totals();
    Q.$('#gt').textContent = fmt(t.total);
    Q.$('#sum').innerHTML = `<div class="kv"><span>عدد الأصناف / القطع</span><b class="num">${t.lines} / ${Q.qty(t.count)}</b></div><div class="kv"><span>المجموع</span><b class="num">${fmt(t.subtotal)}</b></div>
      ${t.discount ? `<div class="kv"><span>خصم الفاتورة</span><b class="err num">-${fmt(t.discount)}</b></div>` : ''}
      ${t.tax ? `<div class="kv"><span>الضريبة ${t.rate}%${Q.settings.tax.inclusive ? ' (شاملة)' : ''}</span><b class="num">${fmt(t.tax)}</b></div>` : ''}`;
    const c = Q.$('#cust');
    c.classList.toggle('set', !!S.customer);
    c.innerHTML = `${icon('user')}<span>${esc(S.customer ? S.customer.name + (S.customer.phone ? ' — ' + S.customer.phone : '') : 'عميل نقدي')}</span><span class="kbd">F8</span>`;
    Q.$('#b-pay').disabled = !S.cart.length; Q.$('#b-quick').disabled = !S.cart.length;
  }
  function reset() { S.cart = []; S.customer = null; S.discount = 0; S.sel = -1; S.mult = 1; showMult(); drawCart(); msg('<span class="muted">جاهز للمسح</span>'); focusSearch(); }

  // البحث بالاسم (للأصناف بدون باركود) — يعمل بالكامل من لوحة المفاتيح
  function findDlg() {
    let list = [], cur = 0;
    const m = Q.modal({
      title: 'بحث عن صنف', width: 640, onClose: focusSearch,
      body: `<input class="input big-in" id="fq" placeholder="اكتب جزءاً من اسم الصنف أو الرمز…" autocomplete="off"><div class="find-l" id="fl"></div>
        <div class="muted" style="font-size:12px;margin-top:6px"><span class="kbd">↑↓</span> للتنقل · <span class="kbd">Enter</span> للإضافة · <span class="kbd">Esc</span> للإغلاق</div>`,
    });
    const draw = () => {
      const q = norm(m.$('#fq').value).toLowerCase();
      list = q ? S.products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.sku || '').toLowerCase().includes(q)).slice(0, 60) : S.products.slice(0, 60);
      cur = Math.min(cur, Math.max(0, list.length - 1));
      m.$('#fl').innerHTML = list.length ? list.map((p, i) => `<div class="fi ${i === cur ? 'on' : ''}" data-i="${i}"><div class="grow"><b>${esc(p.name)}</b><div class="faint mono" style="font-size:11.5px">${esc(p.barcode || '')} ${p.category ? '· ' + esc(String(p.category).split(' › ').slice(-2).join(' › ')) : ''}</div></div>
        <span class="faint num">${Q.qty(p.stock)} ${esc(p.unit || '')}</span><b class="num pr">${fmt(p.price)}</b></div>`).join('') : '<div class="empty">لا توجد نتائج</div>';
      m.$$('.fi').forEach((r) => (r.onclick = () => { m.close(); add(list[Number(r.dataset.i)]); }));
      m.$('.fi.on')?.scrollIntoView({ block: 'nearest' });
    };
    m.$('#fq').oninput = () => { cur = 0; draw(); };
    m.$('#fq').onkeydown = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cur = Math.min(list.length - 1, cur + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, cur - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (list[cur]) { const p = list[cur]; m.close(); add(p); } }
    };
    draw(); m.$('#fq').focus();
  }

  // دفع نقدي سريع بالمبلغ الكامل (بدون باقٍ)
  let quickBusy = false;
  async function quickCash() {
    if (!S.cart.length || quickBusy) return;
    if (!S.shift && Q.settings.pos.require_shift) return openShift();
    const t = totals();
    quickBusy = true;
    try {
      const inv = await Q.post('/invoices', { source: 'pos', customer_id: S.customer?.id || null, discount: S.discount, items: S.cart.map((l) => ({ product_id: l.id, qty: l.qty, price: l.price, discount: l.discount })), paid_cash: t.total, tendered: t.total });
      reset();
      if (Q.settings.pos.auto_print) Q.print.run(Q.print.thermal(inv), { copies: Q.settings.print_thermal.copies || 1 });
      msg(`<b class="ok">تمت الفاتورة ${esc(inv.number)}</b> <span class="sp"></span><b class="num">${fmt(inv.total)}</b> <span class="muted">نقداً</span>`, 'ok');
      refreshShift();
    } catch (e) { Q.err(e); } finally { quickBusy = false; focusSearch(); }
  }

  function editLine(i) {
    const l = S.cart[i];
    const m = Q.modal({
      title: l.name, width: 380,
      body: `<div class="fgrid"><label class="f"><span>الكمية</span><input class="input num big-in" type="number" step="any" id="eq" value="${l.qty}"></label>
        <label class="f"><span>السعر${can('cashier_edit_price') ? '' : ' (غير قابل للتعديل)'}</span><input class="input num big-in" type="number" step="any" id="ep" value="${l.price}" ${can('cashier_edit_price') ? '' : 'readonly tabindex="-1" style="background:#f4f5f7"'}></label>
        ${can('cashier_discount') ? `<label class="f full"><span>خصم على السطر (مبلغ)${maxDisc() ? ` — الحد ${maxDisc()}%` : ''}</span><input class="input num" type="number" step="any" id="ed" value="${l.discount || ''}" placeholder="0"></label>` : ''}</div>`,
      foot: '<button class="btn primary" data-ok>تحديث <span class="kbd inv">Enter</span></button><button class="btn danger" data-rm>حذف الصنف</button><button class="btn" data-c>إلغاء</button>',
      onClose: focusSearch,
    });
    m.$('#eq').select();
    const ok = () => {
      const q = Number(m.$('#eq').value);
      if (!(q > 0)) { S.cart.splice(i, 1); } else {
        const price = can('cashier_edit_price') ? Number(m.$('#ep').value) || 0 : l.price;
        const disc = m.$('#ed') ? Math.min(Number(m.$('#ed').value) || 0, q * price) : 0;
        if (maxDisc() && disc > (q * price * maxDisc()) / 100 + 0.01) return Q.toast(`الحد الأعلى للخصم ${maxDisc()}%`, 'err');
        if (!Q.settings.pos.allow_negative_stock && q > l.stock) return Q.toast(`الكمية المتوفرة ${Q.qty(l.stock)} فقط`, 'err');
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
    if (modalOpen()) return;
    const k = e.key;
    if (k === 'F2' || k === 'F3') { e.preventDefault(); if (k === 'F3') findDlg(); else focusSearch(); }
    else if (k === 'F4') { e.preventDefault(); hold(); }
    else if (k === 'F6') { e.preventDefault(); discountDlg(); }
    else if (k === 'F7') { e.preventDefault(); returnLookup(); }
    else if (k === 'F8') { e.preventDefault(); pickCustomer(); }
    else if (k === 'F9') { e.preventDefault(); pay(); }
    else if (k === 'F10') { e.preventDefault(); quickCash(); }
    else if (document.activeElement !== Q.$('#scan') && (k.length === 1 || k === 'Enter' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'Delete')) {
      // أي ضغطة (ومنها جهاز الباركود) تذهب لحقل المسح حتى لو فقد المؤشر
      const sc = Q.$('#scan'); sc.focus();
      if (k.length === 1) { e.preventDefault(); sc.value += k; sc.dispatchEvent(new Event('input')); }
      else { e.preventDefault(); onScanKey({ key: k, target: sc, preventDefault() {} }); }
    }
  });

  start();
})();
