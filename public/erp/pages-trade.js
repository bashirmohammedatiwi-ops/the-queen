// المبيعات والمشتريات والسندات
(function () {
  const { esc, fmt, icon } = Q;
  const T = ERP.table;
  const n = Q.n;

  function calc(lines, discount, purchase, applyTax, usd) {
    const t = Q.settings.tax;
    const r = usd ? n : Q.m; // الدولار بخانتين، الدينار حسب الإعدادات (مطابق للخادم)
    const subtotal = r(lines.reduce((s, l) => s + r(l.qty * l.price - (l.discount || 0)), 0));
    discount = Math.min(r(discount), subtotal);
    const net = r(subtotal - discount);
    const rate = t.enabled && (!purchase || applyTax) ? Number(t.rate) : 0;
    let tax, total;
    if (!purchase && t.inclusive) { total = net; tax = r(net - net / (1 + rate / 100)); } else { tax = r(net * rate / 100); total = r(net + tax); }
    return { subtotal, discount, tax, total, rate };
  }

  // ===== محرر الفواتير (بيع / شراء) =====
  async function editor(v, purchase) {
    const parties = await Q.get(purchase ? '/suppliers' : '/customers');
    const products = await Q.get('/products');
    const lines = [];
    const st = { discount: 0, method: 'cash', paid: null, apply_tax: true, cur: 'IQD', rate: Number(Q.settings.usd_rate) || 1 };
    const usd = () => purchase && st.cur === 'USD';
    const fm = (x) => fmt(x, usd() ? 2 : undefined); // تنسيق المبالغ بعملة المستند
    const costIn = (p) => (usd() ? n(p.cost / st.rate) : p.cost); // تكلفة الصنف بعملة المورد
    const pName = purchase ? 'المورد' : 'العميل';
    ERP.head(purchase ? 'فاتورة شراء جديدة' : 'فاتورة بيع جديدة', purchase ? 'تُضاف الكميات للمخزون وتُحدّث التكلفة' : 'فاتورة A4 من النظام الإداري');
    v.innerHTML = `<div class="doc">
      <div class="card">
        <div class="card-b fgrid c3" style="border-bottom:1px solid var(--line)">
          <label class="f"><span>${pName}</span><div class="row"><select class="input" id="party">${ERP.options(parties, (p) => p.name + (p.currency === 'USD' ? ' ($ دولار)' : '') + (p.phone ? ' — ' + p.phone : ''), purchase ? '— اختر المورد —' : 'عميل نقدي').map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
            <button class="btn icon" id="np" title="إضافة">${icon('plus')}</button></div></label>
          <label class="f"><span>التاريخ</span><input class="input" type="date" id="date" value="${Q.today()}"></label>
          ${purchase ? '<label class="f"><span>رقم فاتورة المورد</span><input class="input" id="ref"></label>' : '<label class="f"><span>ملاحظات</span><input class="input" id="notes"></label>'}
        </div>
        <div class="card-b row" style="padding-bottom:6px"><div class="picker grow"><input class="input" id="pk" placeholder="ابحث عن صنف بالاسم أو امسح الباركود ثم Enter…"></div>
          <button class="btn" id="qp" title="تعريف صنف جديد وإضافته للفاتورة">${icon('plus')} صنف جديد</button></div>
        <div id="lines"></div>
      </div>
      <div class="card"><div class="card-h"><h3>الإجمالي</h3></div><div class="card-b totals" id="tot"></div></div>
    </div>`;
    const draw = () => {
      Q.$('#lines').innerHTML = lines.length ? `<table class="tbl lines"><thead><tr><th class="idx">#</th><th>الصنف</th><th style="width:90px">الكمية</th>
        <th style="width:110px">${purchase ? 'التكلفة' : 'السعر'}</th>${purchase ? '' : '<th style="width:90px">الخصم</th>'}<th class="n" style="width:110px">الإجمالي</th><th style="width:36px"></th></tr></thead><tbody>
        ${lines.map((l, i) => `<tr><td class="idx">${i + 1}</td><td><b>${esc(l.name)}</b><div class="faint" style="font-size:11.5px">${esc(l.barcode || '')} · المتوفر ${Q.qty(l.stock)}</div></td>
          <td><input class="input sm num" type="number" step="any" data-f="qty" data-i="${i}" value="${l.qty}"></td>
          <td><input class="input sm num" type="number" step="any" data-f="price" data-i="${i}" value="${l.price}"></td>
          ${purchase ? '' : `<td><input class="input sm num" type="number" step="any" data-f="discount" data-i="${i}" value="${l.discount || ''}" placeholder="0"></td>`}
          <td class="n b" data-t="${i}">${fm(l.qty * l.price - (l.discount || 0))}</td><td><button class="btn sm ghost danger" data-rm="${i}">${icon('x', 14)}</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">لم تتم إضافة أصناف بعد</div>';
      Q.$$('#lines [data-f]').forEach((el) => (el.oninput = () => { lines[el.dataset.i][el.dataset.f] = Number(el.value) || 0; const l = lines[el.dataset.i]; Q.$(`[data-t="${el.dataset.i}"]`).textContent = fm(l.qty * l.price - (l.discount || 0)); totals(); }));
      Q.$$('#lines [data-rm]').forEach((el) => (el.onclick = () => { lines.splice(el.dataset.rm, 1); draw(); }));
      totals();
    };
    const totals = () => {
      const t = calc(lines, st.discount, purchase, st.apply_tax, usd());
      const paid = st.paid == null ? t.total : st.paid;
      const box = Q.$('#tot');
      const keep = document.activeElement?.id;
      const curLbl = usd() ? 'دولار $' : Q.settings.currency;
      box.innerHTML = `${purchase ? `<div class="kv"><span>عملة الفاتورة</span><span class="tag ${usd() ? 'info' : ''}">${usd() ? 'دولار أمريكي' : 'دينار عراقي'}</span></div>` : ''}
        ${usd() ? `<div class="kv"><span>سعر الصرف (دينار لكل دولار)</span><input class="input sm num" id="xr" type="number" step="any" value="${st.rate}" style="width:110px"></div>` : ''}
        <div class="kv"><span>المجموع</span><b class="num">${fm(t.subtotal)}</b></div>
        <div class="kv"><span>الخصم</span><input class="input sm num" id="disc" type="number" step="any" value="${st.discount || ''}" placeholder="0" style="width:110px"></div>
        ${purchase && Q.settings.tax.enabled ? `<div class="kv"><label class="chk"><input type="checkbox" id="atax" ${st.apply_tax ? 'checked' : ''}> ضريبة مشتريات ${Q.settings.tax.rate}%</label><span></span></div>` : ''}
        ${t.tax ? `<div class="kv"><span>الضريبة ${t.rate}% ${!purchase && Q.settings.tax.inclusive ? '<span class="faint">(شاملة)</span>' : ''}</span><b class="num">${fmt(t.tax)}</b></div>` : ''}
        <div class="kv grand"><span>الإجمالي</span><span class="num">${fm(t.total)} ${esc(curLbl)}</span></div>
        ${usd() ? `<div class="kv"><span>المعادل بالدينار</span><b class="num">${Q.fmtc(t.total * st.rate)}</b></div>` : ''}
        <div class="sec-t" style="margin-top:14px">الدفع</div>
        <select class="input" id="meth">${(purchase ? [['cash', 'نقدي من الصندوق'], ['bank', 'تحويل بنكي'], ['credit', 'آجل (على الحساب)']] : [['cash', 'نقدي'], ['card', 'شبكة / بطاقة'], ['credit', 'آجل (على الحساب)']])
          .map(([k, l]) => `<option value="${k}" ${st.method === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="kv" style="margin-top:8px"><span>المبلغ المدفوع</span><input class="input sm num" id="paid" type="number" step="any" value="${st.method === 'credit' ? (st.paid ?? 0) : paid}" style="width:110px"></div>
        <div class="kv"><span>المتبقي (آجل)</span><b class="num ${t.total - (st.method === 'credit' ? st.paid || 0 : paid) > 0 ? 'warn' : ''}">${fm(Math.max(0, t.total - (st.method === 'credit' ? st.paid || 0 : paid)))}</b></div>
        ${purchase ? '<label class="f" style="margin-top:10px"><span>ملاحظات</span><input class="input" id="notes"></label>' : ''}
        <div class="row" style="margin-top:14px"><button class="btn primary grow" id="save" style="justify-content:center">${icon('check')} حفظ</button><button class="btn" id="savep">${icon('printer')} حفظ وطباعة</button></div>`;
      if (st._notes != null && purchase) Q.$('#notes').value = st._notes;
      if (keep) { const el = document.getElementById(keep); if (el) { el.focus(); if (el.type === 'number') { const x = el.value; el.value = ''; el.value = x; } } }
      Q.$('#disc').onchange = (e) => { st.discount = Number(e.target.value) || 0; totals(); };
      Q.$('#xr') && (Q.$('#xr').onchange = (e) => { st.rate = Number(e.target.value) || st.rate; totals(); });
      Q.$('#atax') && (Q.$('#atax').onchange = (e) => { st.apply_tax = e.target.checked; totals(); });
      Q.$('#meth').onchange = (e) => { st.method = e.target.value; st.paid = st.method === 'credit' ? 0 : null; totals(); };
      Q.$('#paid').onchange = (e) => { st.paid = Number(e.target.value) || 0; totals(); };
      if (purchase) Q.$('#notes').oninput = (e) => (st._notes = e.target.value);
      Q.$('#save').onclick = () => save(false);
      Q.$('#savep').onclick = () => save(true);
    };
    const add = (p) => {
      const e = lines.find((l) => l.product_id === p.id);
      if (e) e.qty++;
      else lines.push({ product_id: p.id, name: p.name, barcode: p.barcode, stock: p.stock, qty: 1, price: purchase ? costIn(p) : p.price, discount: 0 });
      draw();
    };
    if (purchase) {
      // عند تغيير المورد: تتغير عملة الفاتورة وتُعاد تكلفة الأصناف بعملته
      Q.$('#party').addEventListener('change', (e) => {
        const sup = parties.find((x) => x.id == e.target.value);
        const next = sup?.currency === 'USD' ? 'USD' : 'IQD';
        if (next === st.cur) return;
        st.cur = next;
        lines.forEach((l) => { const p = products.find((x) => x.id === l.product_id); if (p) l.price = costIn(p); });
        st.discount = 0; st.paid = st.method === 'credit' ? 0 : null;
        draw();
      });
    }
    ERP.picker(Q.$('#pk'), add, { list: products });
    Q.$('#qp').onclick = () => ERP.productForm(null, (p) => { products.push(p); add(p); });
    Q.$('#np').onclick = () => ERP.partyForm(purchase ? 'suppliers' : 'customers', null, (r) => {
      const s = Q.$('#party'); s.insertAdjacentHTML('beforeend', `<option value="${r.id}">${esc(r.name)}</option>`); s.value = r.id;
    });
    const save = async (print) => {
      if (!lines.length) return Q.toast('أضف صنفاً واحداً على الأقل', 'err');
      const t = calc(lines, st.discount, purchase, st.apply_tax, usd());
      const paid = st.paid == null ? t.total : st.paid;
      const party = Q.$('#party').value || null;
      try {
        if (purchase) {
          const r = await Q.post('/purchases', { supplier_id: party, date: Q.$('#date').value, ref: Q.$('#ref').value, items: lines.map((l) => ({ product_id: l.product_id, qty: l.qty, cost: l.price })),
            discount: st.discount, apply_tax: st.apply_tax, paid, method: st.method === 'bank' ? 'bank' : 'cash', notes: st._notes, rate: usd() ? st.rate : 1 });
          Q.toast('تم حفظ فاتورة الشراء ' + r.number, 'ok');
          if (print) Q.print.run(Q.print.a4Purchase(r));
          ERP.go('/purchase/' + r.id);
        } else {
          const body = { source: 'erp', customer_id: party, date: Q.$('#date').value, notes: Q.$('#notes').value, discount: st.discount,
            items: lines.map((l) => ({ product_id: l.product_id, qty: l.qty, price: l.price, discount: l.discount })),
            paid_cash: st.method === 'cash' ? paid : 0, paid_card: st.method === 'card' ? paid : 0 };
          if (st.method === 'credit') body.paid_cash = paid;
          const r = await Q.post('/invoices', body);
          Q.toast('تم حفظ الفاتورة ' + r.number, 'ok');
          if (print) Q.print.run(Q.print.a4Invoice(r));
          ERP.go('/invoice/' + r.id);
        }
      } catch (e) { Q.err(e); }
    };
    draw();
    Q.$('#pk').focus();
  }
  ERP.page('/sales/new', { title: 'فاتورة بيع جديدة', render: (v) => editor(v, false) });
  ERP.page('/purchases/new', { title: 'فاتورة شراء جديدة', render: (v) => editor(v, true) });

  // ===== قائمة فواتير المبيعات =====
  ERP.page('/sales', {
    title: 'فواتير المبيعات',
    async render(v) {
      const st = { from: Q.monthStart(), to: Q.today(), type: '', source: '', method: '', q: '' };
      ERP.head('فواتير المبيعات', '', `<button class="btn" id="pr">${icon('printer')} طباعة القائمة</button><a class="btn primary" href="#/sales/new">${icon('plus')} فاتورة جديدة</a>`);
      v.innerHTML = `<div class="bar">${ERP.dateBar(st, () => load())}</div>
        <div class="bar"><input class="input search" id="q" placeholder="رقم الفاتورة أو اسم العميل…">
        <select class="input" id="ty"><option value="">الكل</option><option value="sale">مبيعات</option><option value="return">مرتجعات</option></select>
        <select class="input" id="so"><option value="">كل المصادر</option><option value="pos">نقطة البيع</option><option value="erp">النظام الإداري</option></select>
        <select class="input" id="me"><option value="">كل طرق الدفع</option>${Object.entries(Q.METHODS).filter(([k]) => k !== 'bank').map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <span class="sp"></span><span id="sm" class="muted"></span></div><div class="card tbl-wrap" id="list"></div>`;
      const load = async () => {
        const rows = await Q.get('/invoices' + Q.qs(st));
        const sale = rows.filter((r) => r.type === 'sale'), ret = rows.filter((r) => r.type === 'return');
        Q.$('#sm').innerHTML = `${sale.length} فاتورة · مبيعات <b>${fmt(ERP.sum(sale, 'total'))}</b> · مرتجعات <b class="err">${fmt(ERP.sum(ret, 'total'))}</b>`;
        Q.$('#list').innerHTML = T([{ k: 'number', t: 'الرقم', f: (x) => `<b class="mono">${x}</b>` }, { k: 'type', t: 'النوع', f: (x, r) => ERP.badge(r) },
          { k: 'source', t: 'المصدر', f: (x) => `<span class="tag ${x === 'pos' ? 'acc' : ''}">${x === 'pos' ? 'POS' : 'ERP'}</span>` }, { k: 'date', t: 'التاريخ', f: Q.dt },
          { k: 'customer_name', t: 'العميل', f: (x) => esc(x || 'عميل نقدي') }, { k: 'user_name', t: 'المستخدم' }, { k: 'method', t: 'الدفع', f: ERP.methodTag },
          { k: 'tax', t: 'الضريبة', n: 1 }, { k: 'total', t: 'الإجمالي', cls: 'n', f: (x, r) => `<b class="${r.type === 'return' ? 'err' : ''}">${fmt(x)}</b>` }], rows, { click: 1 });
        ERP.bindRows(Q.$('#list'), rows, (r) => ERP.go('/invoice/' + r.id));
      };
      Q.$('#q').oninput = Q.debounce((e) => { st.q = e.target.value; load(); });
      Q.$('#ty').onchange = (e) => { st.type = e.target.value; load(); };
      Q.$('#so').onchange = (e) => { st.source = e.target.value; load(); };
      Q.$('#me').onchange = (e) => { st.method = e.target.value; load(); };
      Q.$('#pr').onclick = () => ERP.printReport('فواتير المبيعات', `من ${st.from} إلى ${st.to}`, Q.$('#list').innerHTML);
      load();
    },
  });

  // ===== عرض فاتورة =====
  ERP.page('/invoice/:id', {
    title: 'فاتورة', nav: 1,
    async render(v, { id }) {
      const inv = await Q.get('/invoices/' + id);
      const isRet = inv.type === 'return';
      const canRet = !isRet && inv.items.some((i) => i.qty > i.returned_qty);
      ERP.head((isRet ? 'مرتجع ' : 'فاتورة ') + inv.number, Q.dt(inv.date),
        `${canRet ? `<button class="btn danger" id="ret">${icon('ret')} مرتجع</button>` : ''}<button class="btn" id="th">${icon('printer')} حراري 80mm</button><button class="btn" id="pv">${icon('eye')} معاينة A4</button><button class="btn primary" id="a4">${icon('printer')} طباعة A4</button>`);
      v.innerHTML = `<div class="doc"><div class="card">
          <div class="card-b fgrid c3" style="border-bottom:1px solid var(--line)">
            <div><div class="muted">العميل</div><b>${esc(inv.customer_name || 'عميل نقدي')}</b>${inv.customer_phone ? `<div dir="ltr" style="text-align:right">${esc(inv.customer_phone)}</div>` : ''}</div>
            <div><div class="muted">المستخدم / المصدر</div><b>${esc(inv.user_name || '')}</b> <span class="tag ${inv.source === 'pos' ? 'acc' : ''}">${inv.source === 'pos' ? 'نقطة البيع' : 'النظام الإداري'}</span></div>
            <div><div class="muted">${isRet ? 'عن الفاتورة' : 'الحالة'}</div>${isRet ? `<a href="#/invoice/${inv.ref_id}">${inv.ref_number}</a>` : inv.returns.length ? `<span class="tag warn">عليها مرتجع</span> ${inv.returns.map((r) => `<a href="#/invoice/${r.id}">${r.number}</a>`).join(' ')}` : '<span class="tag ok">مكتملة</span>'}</div>
          </div>
          ${T([{ k: 'name', t: 'الصنف', f: (x, r) => `<b>${esc(x)}</b> <span class="faint mono">${esc(r.barcode || '')}</span>` }, { k: 'qty', t: 'الكمية', cls: 'n', f: Q.qty }, { k: 'price', t: 'السعر', n: 1 },
            { k: 'discount', t: 'الخصم', n: 1 }, { k: 'total', t: 'الإجمالي', n: 1 }, ...(isRet ? [] : [{ k: 'returned_qty', t: 'مرتجع', cls: 'n', f: (x) => (x ? `<span class="err">${Q.qty(x)}</span>` : '') }])], inv.items)}
          ${inv.notes ? `<div class="card-b muted">ملاحظات: ${esc(inv.notes)}</div>` : ''}
        </div>
        <div class="card"><div class="card-h"><h3>الملخص</h3></div><div class="card-b totals">
          <div class="kv"><span>المجموع</span><b class="num">${fmt(inv.subtotal)}</b></div>
          ${inv.discount ? `<div class="kv"><span>الخصم</span><b class="num">-${fmt(inv.discount)}</b></div>` : ''}
          <div class="kv"><span>الضريبة ${inv.tax_rate}%</span><b class="num">${fmt(inv.tax)}</b></div>
          <div class="kv grand"><span>الإجمالي</span><span class="num">${fmt(inv.total)}</span></div>
          <div class="sec-t">الدفع — ${Q.METHODS[inv.method] || ''}</div>
          ${inv.paid_cash ? `<div class="kv"><span>نقدي</span><b class="num">${fmt(inv.paid_cash)}</b></div>` : ''}
          ${inv.paid_card ? `<div class="kv"><span>شبكة</span><b class="num">${fmt(inv.paid_card)}</b></div>` : ''}
          ${inv.credit ? `<div class="kv"><span>آجل</span><b class="num warn">${fmt(inv.credit)}</b></div>` : ''}
          <div class="kv"><span>التكلفة / الربح</span><span class="num muted">${fmt(inv.cost)} / ${fmt(inv.total - inv.tax - inv.cost)}</span></div>
        </div></div></div>`;
      Q.$('#a4').onclick = () => Q.print.run(Q.print.a4Invoice(inv));
      Q.$('#pv').onclick = () => Q.print.preview(Q.print.a4Invoice(inv));
      Q.$('#th').onclick = () => Q.print.run(Q.print.thermal(inv));
      if (canRet) Q.$('#ret').onclick = () => ERP.returnForm(inv, (r) => ERP.go('/invoice/' + r.id));
    },
  });

  ERP.returnForm = (inv, after, source = 'erp') => {
    const items = inv.items.filter((i) => i.qty > i.returned_qty);
    const m = Q.modal({
      title: 'مرتجع من الفاتورة ' + inv.number, width: 600,
      body: `<table class="tbl lines"><thead><tr><th>الصنف</th><th class="n">المباع</th><th class="n">المتاح للإرجاع</th><th style="width:110px">كمية الإرجاع</th></tr></thead><tbody>
        ${items.map((i) => `<tr><td>${esc(i.name)}</td><td class="n">${Q.qty(i.qty)}</td><td class="n">${Q.qty(i.qty - i.returned_qty)}</td><td><input class="input sm num" type="number" min="0" max="${i.qty - i.returned_qty}" step="any" data-id="${i.id}" value="0"></td></tr>`).join('')}</tbody></table>
        <div class="row" style="margin-top:12px"><button class="btn sm" id="allq">إرجاع الكل</button><span class="sp"></span><span class="muted">طريقة الاسترداد</span>
        <select class="input" id="rm" style="width:170px"><option value="cash">نقدي</option><option value="card">شبكة</option>${inv.customer_id ? '<option value="credit">خصم من حساب العميل</option>' : ''}</select></div>`,
      foot: '<button class="btn danger" data-ok>تنفيذ المرتجع</button><button class="btn" data-c>إلغاء</button>',
    });
    m.$('#allq').onclick = () => m.$$('[data-id]').forEach((el) => (el.value = el.max));
    m.$('[data-c]').onclick = m.close;
    m.$('[data-ok]').onclick = async () => {
      const req = m.$$('[data-id]').map((el) => ({ item_id: el.dataset.id, qty: Number(el.value) || 0 })).filter((x) => x.qty > 0);
      if (!req.length) return Q.toast('حدد الكميات المرتجعة', 'err');
      try { const r = await Q.post(`/invoices/${inv.id}/return`, { items: req, refund_method: m.$('#rm').value, source }); m.close(); Q.toast('تم تسجيل المرتجع ' + r.number, 'ok'); after?.(r); } catch (e) { Q.err(e); }
    };
  };

  // ===== المشتريات =====
  ERP.page('/purchases', {
    title: 'فواتير المشتريات',
    async render(v) {
      const st = { from: Q.monthStart(), to: Q.today() };
      ERP.head('فواتير المشتريات', '', `<a class="btn primary" href="#/purchases/new">${icon('plus')} فاتورة شراء</a>`);
      v.innerHTML = `<div class="bar">${ERP.dateBar(st, () => load())}<span class="sp"></span><span id="sm" class="muted"></span></div><div class="card tbl-wrap" id="list"></div>`;
      const load = async () => {
        const rows = await Q.get('/purchases' + Q.qs(st));
        rows.forEach((r) => (r.base = n(r.total * r.rate)));
        Q.$('#sm').innerHTML = `${rows.length} فاتورة · الإجمالي بالدينار <b>${Q.fmtc(ERP.sum(rows, 'base'))}</b>`;
        const c = (x, r) => Q.fmtc(x, r.currency);
        rows.forEach((r) => { if (r.type === 'preturn') r.base = -r.base; });
        Q.$('#sm').innerHTML = `${rows.length} مستند · الصافي بالدينار <b>${Q.fmtc(ERP.sum(rows, 'base'))}</b>`;
        Q.$('#list').innerHTML = T([{ k: 'number', t: 'الرقم', f: (x, r) => `<b class="mono">${x}</b> ${r.type === 'preturn' ? '<span class="tag err">مرتجع</span>' : ''}` }, { k: 'date', t: 'التاريخ' }, { k: 'supplier_name', t: 'المورد', f: (x) => esc(x || '—') },
          { k: 'ref', t: 'مرجع المورد' }, { k: 'total', t: 'الإجمالي', cls: 'n', f: c }, { k: 'paid', t: 'المدفوع', cls: 'n', f: c },
          { k: 'id', t: 'المتبقي', cls: 'n', f: (x, r) => `<b class="${r.total - r.paid > 0 ? 'warn' : ''}">${c(r.total - r.paid, r)}</b>` },
          { k: 'base', t: 'المعادل بالدينار', n: 1 }], rows, { click: 1, foot: { number: 'الإجمالي', base: ERP.sum(rows, 'base') } });
        ERP.bindRows(Q.$('#list'), rows, (r) => ERP.go('/purchase/' + r.id));
      };
      load();
    },
  });
  ERP.page('/purchase/:id', {
    title: 'فاتورة شراء', nav: 1,
    async render(v, { id }) {
      const p = await Q.get('/purchases/' + id);
      const fm = (x) => fmt(x, p.currency === 'USD' ? 2 : undefined);
      const isRet = p.type === 'preturn';
      const canRet = !isRet && p.items.some((i) => i.qty > i.returned_qty);
      ERP.head((isRet ? 'مرتجع مشتريات ' : 'فاتورة شراء ') + p.number, p.date + (isRet ? ` · عن ${p.ref_number}` : p.returns.length ? ` · عليها مرتجع: ${p.returns.map((r) => r.number).join('، ')}` : ''),
        `${canRet ? `<button class="btn danger" id="ret">${icon('ret')} مرتجع للمورد</button>` : ''}<button class="btn" id="pv">${icon('eye')} معاينة</button><button class="btn primary" id="a4">${icon('printer')} طباعة A4</button>`);
      if (canRet) Q.$('#ret').onclick = () => purchaseReturnForm(p);
      v.innerHTML = `<div class="doc"><div class="card"><div class="card-b fgrid c3" style="border-bottom:1px solid var(--line)">
        <div><div class="muted">المورد</div><b>${esc(p.supplier_name || '—')}</b></div><div><div class="muted">مرجع المورد</div><b>${esc(p.ref || '—')}</b></div><div><div class="muted">العملة</div><b>${p.currency === 'USD' ? `دولار أمريكي — سعر الصرف ${fmt(p.rate, 0)}` : 'دينار عراقي'}</b></div></div>
        ${T([{ k: 'name', t: 'الصنف' }, { k: 'qty', t: 'الكمية', cls: 'n', f: Q.qty }, { k: 'cost', t: 'التكلفة', cls: 'n', f: (x) => fm(x) }, { k: 'total', t: 'الإجمالي', cls: 'n', f: (x) => fm(x) }], p.items)}</div>
        <div class="card"><div class="card-b totals"><div class="kv"><span>المجموع</span><b>${fm(p.subtotal)}</b></div><div class="kv"><span>الخصم</span><b>${fm(p.discount)}</b></div>
        ${p.tax ? `<div class="kv"><span>الضريبة</span><b>${fm(p.tax)}</b></div>` : ''}<div class="kv grand"><span>الإجمالي</span><span>${Q.fmtc(p.total, p.currency)}</span></div>
        ${p.currency === 'USD' ? `<div class="kv"><span>المعادل بالدينار</span><b>${Q.fmtc(p.total * p.rate)}</b></div>` : ''}
        <div class="kv"><span>المدفوع (${Q.METHODS[p.method]})</span><b>${fm(p.paid)}</b></div><div class="kv"><span>المتبقي</span><b class="warn">${fm(p.total - p.paid)}</b></div></div></div></div>`;
      Q.$('#a4').onclick = () => Q.print.run(Q.print.a4Purchase(p));
      Q.$('#pv').onclick = () => Q.print.preview(Q.print.a4Purchase(p));
    },
  });

  function purchaseReturnForm(p) {
    const items = p.items.filter((i) => i.qty > i.returned_qty);
    const fm = (x) => fmt(x, p.currency === 'USD' ? 2 : undefined);
    const m = Q.modal({
      title: 'مرتجع مشتريات من ' + p.number, width: 600,
      body: `<table class="tbl lines"><thead><tr><th>الصنف</th><th class="n">التكلفة</th><th class="n">المشترى</th><th class="n">المتاح للإرجاع</th><th style="width:110px">كمية الإرجاع</th></tr></thead><tbody>
        ${items.map((i) => `<tr><td>${esc(i.name)}</td><td class="n">${fm(i.cost)}</td><td class="n">${Q.qty(i.qty)}</td><td class="n">${Q.qty(i.qty - i.returned_qty)}</td><td><input class="input sm num" type="number" min="0" step="any" max="${i.qty - i.returned_qty}" data-id="${i.id}" value="0"></td></tr>`).join('')}</tbody></table>
        <div class="row" style="margin-top:12px"><button class="btn sm" id="allq">إرجاع الكل</button><span class="sp"></span><span class="muted">طريقة التسوية</span>
        <select class="input" id="rm" style="width:200px">${p.supplier_id ? '<option value="credit">خصم من حساب المورد</option>' : ''}<option value="cash">استرداد نقدي للصندوق</option><option value="bank">استرداد للبنك</option></select></div>
        ${p.currency === 'USD' ? `<div class="faint" style="margin-top:8px;font-size:12px">يُحسب المرتجع بالدولار وبنفس سعر صرف الفاتورة (${fmt(p.rate, 0)}).</div>` : ''}`,
      foot: '<button class="btn danger" data-ok>تنفيذ المرتجع</button><button class="btn" data-c>إلغاء</button>',
    });
    m.$('#allq').onclick = () => m.$$('[data-id]').forEach((el) => (el.value = el.max));
    m.$('[data-c]').onclick = m.close;
    m.$('[data-ok]').onclick = async () => {
      const req = m.$$('[data-id]').map((el) => ({ item_id: el.dataset.id, qty: Number(el.value) || 0 })).filter((x) => x.qty > 0);
      if (!req.length) return Q.toast('حدد الكميات المرتجعة', 'err');
      try { const r = await Q.post(`/purchases/${p.id}/return`, { items: req, refund_method: m.$('#rm').value }); m.close(); Q.toast('تم تسجيل مرتجع المشتريات ' + r.number, 'ok'); ERP.go('/purchase/' + r.id); } catch (e) { Q.err(e); }
    };
  }

  // ===== السندات =====
  ERP.voucherForm = async (kind, data = {}, after) => {
    const isExp = kind === 'expense';
    const opts = isExp ? (await Q.get('/accounts')).filter((a) => a.type === 'expense' && !a.is_group && !['5101', '5301', '5302'].includes(a.code))
      : await Q.get(kind === 'receipt' ? '/customers' : '/suppliers');
    const m = ERP.form({
      title: { receipt: 'سند قبض من عميل', payment: 'سند صرف لمورد', expense: 'تسجيل مصروف' }[kind], width: 480, cols: 1, data: { rate: Q.settings.usd_rate, ...data },
      fields: [
        isExp ? { n: 'account_id', t: 'نوع المصروف', type: 'select', options: ERP.options(opts, (a) => `${a.code} — ${a.name}`), req: 1 }
          : { n: 'party_id', t: kind === 'receipt' ? 'العميل' : 'المورد', type: 'select', req: 1,
            options: ERP.options(opts, (p) => `${p.name} (الرصيد ${p.currency === 'USD' ? Q.fmtc(p.balance_fx, 'USD') : fmt(p.balance)})`) },
        { n: 'amount', t: 'المبلغ', type: 'number', req: 1 },
        ...(kind === 'payment' ? [{ n: 'rate', t: 'سعر صرف الدولار اليوم (دينار لكل دولار)', type: 'number', hint: 'يُخصم من الصندوق بالدينار حسب هذا السعر، والفرق يُسجّل في حساب فروقات الصرف' }] : []),
        { n: 'method', t: 'طريقة الدفع', type: 'select', options: [['cash', 'نقدي (الصندوق)'], ['bank', 'بنك / شبكة']] },
        { n: 'date', t: 'التاريخ', type: 'date', def: Q.today() },
        { n: 'notes', t: 'البيان' },
      ],
      onSave: async (o) => {
        if (!o.party_id && !isExp) throw new Error('اختر ' + (kind === 'receipt' ? 'العميل' : 'المورد'));
        if (isExp && !o.account_id) throw new Error('اختر نوع المصروف');
        const r = await Q.post('/vouchers', { ...o, kind });
        Q.toast('تم حفظ السند ' + r.number, 'ok'); after?.(r);
      },
    });
    if (kind === 'payment') {
      // إظهار سعر الصرف فقط لموردي الدولار
      const sel = m.$('[name=party_id]'), rateBox = m.$('[name=rate]').closest('label'), amtLbl = m.$('[name=amount]').closest('label').querySelector('span');
      const sync = () => {
        const p = opts.find((x) => x.id == sel.value);
        const u = p?.currency === 'USD';
        rateBox.classList.toggle('hidden', !u);
        amtLbl.textContent = u ? 'المبلغ بالدولار $ *' : 'المبلغ بالدينار *';
      };
      sel.addEventListener('change', sync); sync();
    }
  };
  const voucherPage = (path, kind, title) => ERP.page(path, {
    title,
    async render(v) {
      const st = { from: Q.monthStart(), to: Q.today(), kind };
      ERP.head(title, '', `<button class="btn primary" id="add">${icon('plus')} ${kind === 'expense' ? 'مصروف جديد' : 'سند جديد'}</button>`);
      v.innerHTML = `<div class="bar">${ERP.dateBar(st, () => load())}<span class="sp"></span><span id="sm" class="muted"></span></div><div class="card tbl-wrap" id="list"></div>`;
      const load = async () => {
        const rows = await Q.get('/vouchers' + Q.qs(st));
        rows.forEach((r) => (r.base = r.base_amount ?? r.amount));
        Q.$('#sm').innerHTML = `الإجمالي: <b>${Q.fmtc(ERP.sum(rows, 'base'))}</b>`;
        Q.$('#list').innerHTML = T([{ k: 'number', t: 'الرقم', f: (x) => `<b class="mono">${x}</b>` }, { k: 'date', t: 'التاريخ' },
          kind === 'expense' ? { k: 'account_name', t: 'المصروف' } : { k: 'party_name', t: kind === 'receipt' ? 'العميل' : 'المورد' },
          { k: 'method', t: 'الطريقة', f: (x) => Q.METHODS[x] || x }, { k: 'notes', t: 'البيان', cls: 'wrap' }, { k: 'user_name', t: 'المستخدم' },
          { k: 'amount', t: 'المبلغ', cls: 'n', f: (x, r) => (r.currency === 'USD' ? `${Q.fmtc(x, 'USD')} <span class="faint">× ${fmt(r.rate, 0)}</span>` : fmt(x)) },
          { k: 'base', t: 'بالدينار', n: 1 },
          { k: 'id', t: '', cls: 'act', f: (x) => `<button class="btn sm ghost" data-p="${x}">${icon('printer', 14)}</button>` }], rows, { foot: { number: 'الإجمالي', base: ERP.sum(rows, 'base') } });
        Q.$$('[data-p]').forEach((b) => (b.onclick = () => Q.print.run(Q.print.a4Voucher(rows.find((r) => r.id == b.dataset.p)))));
      };
      Q.$('#add').onclick = () => ERP.voucherForm(kind, {}, load);
      load();
    },
  });
  voucherPage('/receipts', 'receipt', 'سندات القبض');
  voucherPage('/payments', 'payment', 'سندات الصرف');
  voucherPage('/expenses', 'expense', 'المصروفات');
})();
