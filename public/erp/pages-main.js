// لوحة التحكم + الأصناف + التصنيفات + المخزون + العملاء والموردين
(function () {
  const { esc, fmt, icon } = Q;
  const T = ERP.table;

  // ===== لوحة التحكم =====
  ERP.page('/', {
    title: 'لوحة التحكم',
    async render(v) {
      const d = await Q.get('/dashboard');
      ERP.head('لوحة التحكم', Q.today(), `<a class="btn primary" href="#/sales/new">${icon('plus')} فاتورة بيع</a><a class="btn" href="#/purchases/new">${icon('plus')} فاتورة شراء</a>`);
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const dt = new Date(); dt.setDate(dt.getDate() - i);
        const k = new Date(dt - dt.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
        days.push({ k, v: d.days.find((x) => x.d === k)?.total || 0 });
      }
      const max = Math.max(1, ...days.map((x) => x.v));
      v.innerHTML = `
        <div class="stats">
          <div class="stat"><div class="k">مبيعات اليوم</div><div class="v">${fmt(d.today.total)}</div><div class="s">${d.today.n || 0} فاتورة · ربح ${fmt(d.today.profit)}</div></div>
          <div class="stat"><div class="k">مبيعات الشهر</div><div class="v">${fmt(d.month.total)}</div><div class="s">${d.month.n || 0} فاتورة · ربح ${fmt(d.month.profit)}</div></div>
          <div class="stat"><div class="k">رصيد الصندوق</div><div class="v">${fmt(d.cash)}</div><div class="s">البنك / الشبكة: ${fmt(d.bank)}</div></div>
          <div class="stat"><div class="k">قيمة المخزون (بالتكلفة)</div><div class="v">${fmt(d.inventory)}</div><div class="s">${d.products} صنف نشط</div></div>
          <div class="stat"><div class="k">ذمم العملاء</div><div class="v">${fmt(d.receivable)}</div><div class="s">مستحقات لنا</div></div>
          <div class="stat"><div class="k">ذمم الموردين</div><div class="v">${fmt(d.payable)}</div><div class="s">مستحقات علينا</div></div>
        </div>
        <div class="grid2">
          <div class="card"><div class="card-h"><h3>صافي المبيعات — آخر 14 يوم</h3></div><div class="card-b">
            <div class="bars">${days.map((x) => `<div class="bc" title="${x.k}: ${fmt(x.v)}"><div class="bb" style="height:${(x.v / max) * 100}%"></div><div class="bl">${x.k.slice(8)}</div></div>`).join('')}</div></div></div>
          <div class="card"><div class="card-h"><h3>الأكثر مبيعاً هذا الشهر</h3></div>
            ${T([{ k: 'name', t: 'الصنف' }, { k: 'qty', t: 'الكمية', f: Q.qty, cls: 'n' }, { k: 'total', t: 'المبلغ', n: 1 }], d.top, { empty: 'لا توجد مبيعات بعد' })}</div>
        </div>
        <div class="grid2" style="margin-top:14px">
          <div class="card"><div class="card-h"><h3>آخر الفواتير</h3><span class="sp"></span><a href="#/sales" class="btn sm">عرض الكل</a></div>
            ${T([{ k: 'number', t: 'الرقم', f: (x, r) => `<a href="#/invoice/${r.id}">${x}</a>` }, { k: 'type', t: 'النوع', f: (x, r) => ERP.badge(r) }, { k: 'date', t: 'التاريخ', f: Q.dt },
              { k: 'customer_name', t: 'العميل', f: (x) => esc(x || 'عميل نقدي') }, { k: 'method', t: 'الدفع', f: ERP.methodTag }, { k: 'total', t: 'الإجمالي', n: 1 }], d.recent, { empty: 'لا توجد فواتير بعد' })}</div>
          <div class="card"><div class="card-h"><h3>أصناف وصلت للحد الأدنى</h3><span class="tag ${d.low_count ? 'warn' : ''}">${d.low_count}</span><span class="sp"></span><a href="#/products?low=1" class="btn sm">عرض</a></div>
            ${T([{ k: 'name', t: 'الصنف' }, { k: 'stock', t: 'المتوفر', f: (x, r) => `<span class="${x <= 0 ? 'err' : 'warn'} b">${Q.qty(x)}</span> ${esc(r.unit)}`, cls: 'n' }, { k: 'min_stock', t: 'الحد الأدنى', f: Q.qty, cls: 'n' }], d.low_stock, { empty: 'المخزون بحالة جيدة' })}
            ${d.open_shifts.length ? `<div class="card-b" style="border-top:1px solid var(--line)"><div class="muted" style="margin-bottom:4px">ورديات مفتوحة الآن</div>${d.open_shifts.map((s) => `<div>${icon('clock', 13)} ${esc(s.user_name)} <span class="faint">منذ ${Q.dt(s.opened_at)}</span></div>`).join('')}</div>` : ''}</div>
        </div>`;
    },
  });

  // صفحة الأصناف وبطاقة الصنف وشجرة المواد في pages-items.js
  // ===== استيراد / تصدير الأصناف =====
  const COLS = ['الاسم', 'الباركود', 'العائدية', 'الوحدة', 'التكلفة', 'سعر البيع', 'الكمية', 'حد إعادة الطلب'];
  const KEYS = ['name', 'barcode', 'category', 'unit', 'cost', 'price', 'stock', 'min_stock'];
  function downloadCsv(name, data) {
    const csv = [COLS, ...data].map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click();
  }
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : text.split('\n')[0].includes('\t') ? '\t' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  ERP.importProducts = (after) => importDlg(after);
  ERP.productsCsv = (name, data) => downloadCsv(name, data);
  function importDlg(after) {
    let data = [];
    const m = Q.modal({
      title: 'استيراد الأصناف من Excel', width: 640,
      body: `<ol class="muted" style="margin:0 0 12px;padding-right:18px;line-height:1.9">
          <li>حمّل <a href="#" id="tpl">النموذج الجاهز</a> وافتحه في Excel.</li>
          <li>املأ الأصناف (الاسم إجباري، الباقي اختياري. الباركود الفارغ يُولّد تلقائياً).</li>
          <li>من Excel: حفظ باسم ← <b>CSV UTF-8</b>، ثم اختر الملف هنا.</li></ol>
        <div class="row"><label class="btn">${icon('file')} اختيار ملف CSV<input type="file" accept=".csv,.txt" id="fl" hidden></label><span id="fn" class="muted"></span></div>
        <label class="chk" style="margin-top:10px"><input type="checkbox" id="up"> تحديث الأصناف الموجودة (بنفس الباركود أو الاسم): السعر والتصنيف والحد الأدنى</label>
        <div id="pv" style="margin-top:12px;max-height:300px;overflow:auto"></div>`,
      foot: '<button class="btn primary" data-ok disabled>استيراد</button><button class="btn" data-c>إلغاء</button>',
    });
    m.$('#tpl').onclick = (e) => { e.preventDefault(); downloadCsv('the-queen-products-template.csv', [['عطر الملكة 100 مل', '', 'عطور / نسائية', 'حبة', 18000, 35000, 10, 3], ['كريم مرطب', '6281234567890', 'العناية بالبشرة / كريمات', 'حبة', 6000, 12000, 24, 5]]); };
    m.$('[data-c]').onclick = m.close;
    m.$('#fl').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      m.$('#fn').textContent = f.name;
      const rows = parseCsv(await f.text());
      const head = rows[0].map((h) => h.trim());
      const idx = KEYS.map((k, i) => { const j = head.indexOf(COLS[i]) >= 0 ? head.indexOf(COLS[i]) : i === 2 ? head.indexOf('التصنيف') : -1; return j >= 0 ? j : head.includes('الاسم') ? -1 : i; });
      data = rows.slice(head.includes('الاسم') ? 1 : 0).map((r) => Object.fromEntries(KEYS.map((k, i) => [k, idx[i] >= 0 ? (r[idx[i]] || '').trim() : ''])));
      m.$('#pv').innerHTML = `<div class="muted" style="margin-bottom:6px">${data.length} صنف في الملف — معاينة أول 50:</div>` + T(KEYS.map((k, i) => ({ k, t: COLS[i] })), data.slice(0, 50));
      m.$('[data-ok]').disabled = !data.length;
    };
    m.$('[data-ok]').onclick = async () => {
      m.$('[data-ok]').disabled = true;
      try {
        const r = await Q.post('/products/import', { rows: data, update: m.$('#up').checked });
        m.close();
        Q.modal({ title: 'نتيجة الاستيراد', width: 460, body: `<div>تمت إضافة <b>${r.created}</b> صنف · تحديث <b>${r.updated}</b> · تخطي <b>${r.skipped.length}</b></div>
          ${r.skipped.length ? `<div class="muted" style="margin-top:8px;max-height:220px;overflow:auto;font-size:12px">${r.skipped.map(esc).join('<br>')}</div>` : ''}` });
        after?.();
      } catch (e) { Q.err(e); m.$('[data-ok]').disabled = false; }
    };
  }

  ERP.adjustStock = (p, after) => adjust(p, after);
  function adjust(p, after) {
    ERP.form({
      title: `جرد / تسوية: ${p.name}`, cols: 1, width: 420,
      fields: [
        { n: 'mode', t: 'نوع التسوية', type: 'select', options: [['set', 'تحديد الكمية الفعلية (جرد)'], ['add', 'إضافة / خصم كمية']] },
        { n: 'qty', t: 'الكمية', type: 'number', req: 1, hint: `الكمية الحالية بالنظام: ${Q.qty(p.stock)}. للخصم في وضع الإضافة اكتب رقماً سالباً.` },
        { n: 'note', t: 'السبب / ملاحظة', def: 'جرد' },
      ],
      onSave: async (o) => { await Q.post('/stock/adjust', { ...o, product_id: p.id }); Q.toast('تمت التسوية وإنشاء القيد', 'ok'); after?.(); },
    });
  }
  const MOVE = { sale: ['بيع', 'ok'], return: ['مرتجع بيع', 'err'], purchase: ['شراء', 'info'], preturn: ['مرتجع شراء', 'warn'], adjust: ['تسوية', 'warn'] };
  ERP.page('/product/:id', {
    title: 'بطاقة صنف', nav: 1,
    async render(v, { id }) {
      const p = await Q.get('/products/' + id);
      ERP.head(p.name, 'بطاقة صنف', `<button class="btn" id="lbl">${icon('barcode')} ملصق</button><button class="btn" id="adj">جرد / تسوية</button><button class="btn primary" id="ed">${icon('edit')} تعديل</button>`);
      v.innerHTML = `<div class="stats">
        <div class="stat"><div class="k">المخزون الحالي</div><div class="v">${Q.qty(p.stock)} <small class="muted">${esc(p.unit)}</small></div></div>
        <div class="stat"><div class="k">سعر البيع</div><div class="v">${fmt(p.price)}</div></div>
        <div class="stat"><div class="k">متوسط التكلفة</div><div class="v">${fmt(p.cost)}</div><div class="s">هامش ${p.price ? fmt(((p.price - p.cost) / p.price) * 100, 1) : 0}%</div></div>
        <div class="stat"><div class="k">قيمة المخزون</div><div class="v">${fmt(p.stock * p.cost)}</div></div>
        <div class="stat"><div class="k">الباركود</div><div class="v mono" style="font-size:15px">${esc(p.barcode || '—')}</div><div class="s">${esc(p.category || 'بدون تصنيف')}</div></div></div>
        <div class="card"><div class="card-h"><h3>حركة الصنف</h3></div><div class="tbl-wrap">${T([
          { k: 'date', t: 'التاريخ', f: Q.dt }, { k: 'type', t: 'الحركة', f: (x) => `<span class="tag ${MOVE[x]?.[1]}">${MOVE[x]?.[0] || x}</span>` },
          { k: 'note', t: 'المرجع', f: (x, r) => (r.ref_type === 'invoice' ? `<a href="#/invoice/${r.ref_id}">${esc(x)}</a>` : r.ref_type === 'purchase' ? `<a href="#/purchase/${r.ref_id}">${esc(x)}</a>` : esc(x || '')) },
          { k: 'qty', t: 'الكمية', cls: 'n', f: (x) => `<span class="${x < 0 ? 'err' : 'ok'} b" dir="ltr">${x > 0 ? '+' : ''}${Q.qty(x)}</span>` },
          { k: 'cost', t: 'التكلفة', n: 1 }, { k: 'user_name', t: 'المستخدم' }], p.moves, { empty: 'لا توجد حركات' })}</div></div>`;
      Q.$('#ed').onclick = () => ERP.productForm(p, () => ERP.reload());
      Q.$('#adj').onclick = () => adjust(p, () => ERP.reload());
      Q.$('#lbl').onclick = () => ERP.go('/labels?id=' + p.id);
    },
  });

  // ===== حركة المخزون =====
  ERP.page('/stock', {
    title: 'حركة المخزون',
    async render(v) {
      const st = { from: Q.monthStart(), to: Q.today(), type: '' };
      ERP.head('حركة المخزون');
      v.innerHTML = `<div class="bar">${ERP.dateBar(st, () => load())}<select class="input" id="tp" style="width:150px"><option value="">كل الحركات</option>
        ${Object.entries(MOVE).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select></div><div class="card tbl-wrap" id="list"></div>`;
      const load = async () => {
        const rows = await Q.get('/stock/moves' + Q.qs(st));
        Q.$('#list').innerHTML = T([{ k: 'date', t: 'التاريخ', f: Q.dt }, { k: 'product', t: 'الصنف', f: (x, r) => `<a href="#/product/${r.product_id}">${esc(x)}</a>` },
          { k: 'type', t: 'الحركة', f: (x) => `<span class="tag ${MOVE[x]?.[1]}">${MOVE[x]?.[0] || x}</span>` }, { k: 'note', t: 'المرجع / البيان' },
          { k: 'qty', t: 'الكمية', cls: 'n', f: (x) => `<span class="${x < 0 ? 'err' : 'ok'} b" dir="ltr">${x > 0 ? '+' : ''}${Q.qty(x)}</span>` },
          { k: 'cost', t: 'التكلفة', n: 1 }, { k: 'user_name', t: 'المستخدم' }], rows, { empty: 'لا توجد حركات في هذه الفترة' });
      };
      Q.$('#tp').onchange = (e) => { st.type = e.target.value; load(); };
      load();
    },
  });

  // ===== طباعة الباركود =====
  ERP.page('/labels', {
    title: 'طباعة ملصقات الباركود',
    async render(v, prm) {
      const all = await Q.get('/products');
      const list = [];
      ERP.head('طباعة ملصقات الباركود', 'لطابعات الملصقات الحرارية');
      v.innerHTML = `<div class="doc"><div class="card"><div class="card-h"><div class="picker grow"><input class="input" id="pk" placeholder="ابحث عن صنف أو امسح الباركود لإضافته…"></div></div>
        <div id="lst"></div></div>
        <div class="card"><div class="card-h"><h3>مقاس الملصق</h3></div><div class="card-b fgrid">
          <label class="f"><span>العرض (مم)</span><input class="input num" type="number" id="lw" value="38"></label>
          <label class="f"><span>الارتفاع (مم)</span><input class="input num" type="number" id="lh" value="25"></label>
          <label class="chk full"><input type="checkbox" id="lp" checked> إظهار السعر</label>
          <div class="full row"><button class="btn primary grow" id="pr" style="justify-content:center">${icon('printer')} طباعة</button><button class="btn" id="pv">معاينة</button></div></div></div></div>`;
      const draw = () => {
        Q.$('#lst').innerHTML = list.length ? `<table class="tbl lines"><thead><tr><th>الصنف</th><th>الباركود</th><th class="n">السعر</th><th style="width:110px">عدد الملصقات</th><th></th></tr></thead><tbody>
          ${list.map((x, i) => `<tr><td>${esc(x.p.name)}</td><td class="mono">${esc(x.p.barcode)}</td><td class="n">${fmt(x.p.price)}</td><td><input class="input sm num" type="number" min="1" value="${x.n}" data-n="${i}"></td>
          <td class="act"><button class="btn sm ghost danger" data-rm="${i}">${icon('x', 14)}</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">أضف أصنافاً لطباعة ملصقاتها</div>';
        Q.$$('[data-n]').forEach((el) => (el.oninput = () => (list[el.dataset.n].n = Math.max(1, Number(el.value) || 1))));
        Q.$$('[data-rm]').forEach((el) => (el.onclick = () => { list.splice(el.dataset.rm, 1); draw(); }));
      };
      const add = (p) => { const e = list.find((x) => x.p.id === p.id); if (e) e.n++; else list.push({ p, n: Math.max(1, Math.floor(p.stock) || 1) }); draw(); };
      ERP.picker(Q.$('#pk'), add, { list: all });
      if (prm.id) { const p = all.find((x) => x.id == prm.id); if (p) add(p); }
      draw();
      const html = () => Q.print.labels(list.flatMap((x) => Array(x.n).fill(x.p)), { w: Number(Q.$('#lw').value), h: Number(Q.$('#lh').value), showPrice: Q.$('#lp').checked });
      Q.$('#pr').onclick = () => (list.length ? Q.print.run(html()) : Q.toast('لا توجد أصناف', 'err'));
      Q.$('#pv').onclick = () => list.length && Q.print.preview(html());
    },
  });

  // ===== العملاء والموردين =====
  const partyFields = [{ n: 'name', t: 'الاسم', req: 1, full: 1 }, { n: 'phone', t: 'الهاتف' }, { n: 'email', t: 'البريد الإلكتروني' },
    { n: 'tax_no', t: 'الرقم الضريبي' }, { n: 'address', t: 'العنوان' }, { n: 'notes', t: 'ملاحظات', full: 1 }];
  const openingFields = (kind) => [
    { n: 'opening_balance', t: kind === 'customers' ? 'رصيد سابق مستحق على العميل' : 'رصيد سابق مستحق للمورد', type: 'number', def: 0, hint: kind === 'suppliers' ? 'بعملة المورد. اتركه 0 إن لم يوجد' : 'دين قديم قبل بدء النظام. اتركه 0 إن لم يوجد' },
    ...(kind === 'suppliers' ? [{ n: 'rate', t: 'سعر صرف الرصيد (لموردي الدولار)', type: 'number', def: Q.settings.usd_rate }] : []),
  ];
  ERP.partyForm = (kind, data, after) => ERP.form({
    title: (data ? 'تعديل ' : 'إضافة ') + (kind === 'customers' ? 'عميل' : 'مورد'),
    fields: [...(kind === 'suppliers' ? [partyFields[0], { n: 'currency', t: 'عملة التعامل', type: 'select', options: [['IQD', 'دينار عراقي'], ['USD', 'دولار أمريكي']], hint: 'فواتير المورد ورصيده تكون بهذه العملة' }, ...partyFields.slice(1)] : partyFields),
      ...(data || ERP.user.role === 'cashier' ? [] : openingFields(kind))],
    data: data || { currency: 'IQD' },
    onSave: async (o) => { const r = data ? await Q.put(`/${kind}/${data.id}`, o) : await Q.post(`/${kind}`, o); Q.toast('تم الحفظ', 'ok'); after?.(r); },
  });
  for (const kind of ['customers', 'suppliers']) {
    const isC = kind === 'customers';
    ERP.page('/' + kind, {
      title: isC ? 'العملاء' : 'الموردين',
      async render(v) {
        ERP.head(isC ? 'العملاء' : 'الموردين', '', `<button class="btn primary" id="add">${icon('plus')} ${isC ? 'عميل جديد' : 'مورد جديد'}</button>`);
        v.innerHTML = `<div class="bar"><input class="input search" id="q" placeholder="بحث بالاسم أو الهاتف…"><span class="sp"></span><span class="muted" id="tot"></span></div><div class="card tbl-wrap" id="list"></div>`;
        const load = async (q = '') => {
          const rows = await Q.get(`/${kind}` + Q.qs({ q }));
          const usd = rows.filter((r) => r.currency === 'USD');
          Q.$('#tot').innerHTML = isC ? `إجمالي الأرصدة: <b>${Q.fmtc(ERP.sum(rows, 'balance'))}</b>`
            : `مستحق بالدينار: <b>${Q.fmtc(ERP.sum(rows.filter((r) => r.currency !== 'USD'), 'balance'))}</b> · بالدولار: <b>${Q.fmtc(ERP.sum(usd, 'balance_fx'), 'USD')}</b>`;
          Q.$('#list').innerHTML = T([{ k: 'name', t: 'الاسم', f: (x) => `<b>${esc(x)}</b>` },
            ...(isC ? [] : [{ k: 'currency', t: 'العملة', f: (x) => `<span class="tag ${x === 'USD' ? 'info' : ''}">${x === 'USD' ? 'دولار $' : 'دينار'}</span>` }]),
            { k: 'phone', t: 'الهاتف', f: (x) => `<span dir="ltr">${esc(x || '')}</span>` }, { k: 'address', t: 'العنوان' },
            { k: 'balance', t: isC ? 'الرصيد المستحق لنا' : 'الرصيد المستحق له', cls: 'n', f: (x, r) => (r.currency === 'USD'
              ? `<b class="${r.balance_fx > 0 ? 'warn' : ''}">${Q.fmtc(r.balance_fx, 'USD')}</b><div class="faint" style="font-size:11px">≈ ${Q.fmtc(x)}</div>`
              : `<b class="${x > 0 ? 'warn' : ''}">${fmt(x)}</b>`) },
            { k: 'id', t: '', cls: 'act', f: (x) => `<div class="row"><button class="btn sm" data-st="${x}">كشف حساب</button><button class="btn sm" data-pay="${x}">${isC ? 'سند قبض' : 'سند صرف'}</button>
              <button class="btn sm ghost" data-ed="${x}">${icon('edit', 14)}</button><button class="btn sm ghost danger" data-del="${x}">${icon('trash', 14)}</button></div>` }], rows);
          Q.$$('[data-ed]').forEach((b) => (b.onclick = () => ERP.partyForm(kind, rows.find((r) => r.id == b.dataset.ed), () => load())));
          Q.$$('[data-st]').forEach((b) => (b.onclick = () => ERP.go(`/statement/${kind}/${b.dataset.st}`)));
          Q.$$('[data-pay]').forEach((b) => (b.onclick = () => ERP.voucherForm(isC ? 'receipt' : 'payment', { party_id: b.dataset.pay }, () => load())));
          Q.$$('[data-del]').forEach((b) => (b.onclick = async () => { if (await Q.confirm('تأكيد الحذف؟', { danger: true, ok: 'حذف' })) { try { await Q.del(`/${kind}/${b.dataset.del}`); load(); } catch (e) { Q.err(e); } } }));
        };
        Q.$('#q').oninput = Q.debounce((e) => load(e.target.value));
        Q.$('#add').onclick = () => ERP.partyForm(kind, null, () => load());
        load();
      },
    });
  }
  ERP.page('/statement/:kind/:id', {
    title: 'كشف حساب', nav: 1,
    async render(v, { kind, id }) {
      const st = { from: Q.today().slice(0, 4) + '-01-01', to: Q.today() };
      const party = (await Q.get('/' + kind)).find((x) => x.id == id);
      ERP.head('كشف حساب: ' + party.name, kind === 'customers' ? 'عميل' : 'مورد' + (party.currency === 'USD' ? ' — بالدولار' : ''),
        `<button class="btn" id="ob">رصيد افتتاحي</button><button class="btn" id="vc">${kind === 'customers' ? 'سند قبض' : 'سند صرف'}</button><button class="btn" id="pr">${icon('printer')} طباعة</button>`);
      Q.$('#ob').onclick = () => ERP.form({
        title: 'إضافة رصيد افتتاحي', width: 420, cols: 1,
        fields: [{ n: 'amount', t: `المبلغ${party.currency === 'USD' ? ' بالدولار' : ''}`, type: 'number', req: 1, hint: 'موجب = مستحق ' + (kind === 'customers' ? 'على العميل' : 'للمورد') + '، سالب = العكس' },
          ...(party.currency === 'USD' ? [{ n: 'rate', t: 'سعر الصرف', type: 'number', def: Q.settings.usd_rate }] : []), { n: 'date', t: 'التاريخ', type: 'date', def: Q.today() }],
        onSave: async (o) => { await Q.post(`/${kind}/${id}/opening`, o); Q.toast('تم تسجيل الرصيد', 'ok'); load(); },
      });
      Q.$('#vc').onclick = () => ERP.voucherForm(kind === 'customers' ? 'receipt' : 'payment', { party_id: id }, () => load());
      v.innerHTML = `<div class="bar">${ERP.dateBar(st, () => load())}</div><div class="card" id="list"></div>`;
      const load = async () => {
        const r = await Q.get(`/${kind}/${id}/statement` + Q.qs(st));
        Q.$('#list').innerHTML = ERP.ledgerTable(r);
      };
      Q.$('#pr').onclick = () => ERP.printReport('كشف حساب: ' + party.name, `من ${st.from} إلى ${st.to}`, Q.$('#list').innerHTML);
      load();
    },
  });
  ERP.ledgerTable = (r) => (r.fx ? `<div class="card-b muted" style="border-bottom:1px solid var(--line)">المبالغ بالدولار الأمريكي $ — الرصيد المعادل بالدينار في الدفاتر: <b>${Q.fmtc(r.base_closing)}</b></div>` : '') + T([{ k: 'date', t: 'التاريخ' }, { k: 'no', t: 'رقم القيد', f: (x, row) => (row.entry_id ? `<a href="#/entry/${row.entry_id}">JV-${String(x).padStart(5, '0')}</a>` : '') },
    { k: 'description', t: 'البيان', cls: 'wrap' }, ...[['debit', 'مدين'], ['credit', 'دائن'], ['balance', 'الرصيد']].map(([k, t]) => ({ k, t, cls: 'n', f: (x) => (k === 'balance' ? `<b>${fmt(x, r.fx ? 2 : undefined)}</b>` : fmt(x, r.fx ? 2 : undefined)) }))],
    [{ date: '', no: '', entry_id: '', description: 'رصيد أول المدة', debit: 0, credit: 0, balance: r.opening }, ...r.rows],
    { foot: { description: 'الإجمالي', debit: fmt(r.debit, r.fx ? 2 : undefined), credit: fmt(r.credit, r.fx ? 2 : undefined), balance: fmt(r.closing, r.fx ? 2 : undefined) } });
})();
