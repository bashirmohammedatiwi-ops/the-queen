// الإعدادات + إعدادات الطباعة + المستخدمين
(function () {
  const { esc, icon } = Q;
  const T = ERP.table;
  const chk = (n, t, v) => `<label class="chk"><input type="checkbox" name="${n}" ${v ? 'checked' : ''}> ${t}</label>`;
  const inp = (n, t, v, type = 'text', extra = '') => `<label class="f"><span>${t}</span><input class="input ${type === 'number' ? 'num' : ''}" type="${type}" name="${n}" value="${esc(v ?? '')}" ${extra}></label>`;
  const txt = (n, t, v) => `<label class="f full"><span>${t}</span><textarea class="input" name="${n}">${esc(v ?? '')}</textarea></label>`;

  // ===== بيانات المتجر والضريبة =====
  ERP.page('/settings', {
    title: 'المتجر والضريبة',
    async render(v) {
      const s = await Q.loadSettings();
      ERP.head('إعدادات المتجر والضريبة', '', `<button class="btn primary" id="sv">${icon('check')} حفظ الإعدادات</button>`);
      v.innerHTML = `<div class="set-grid"><div>
        <div class="card"><div class="card-h"><h3>بيانات المتجر</h3><span class="muted">تظهر في الفواتير</span></div><div class="card-b fgrid" id="store">
          ${inp('name', 'اسم المتجر (لاتيني)', s.store.name)}${inp('name_ar', 'اسم المتجر (عربي)', s.store.name_ar)}
          ${inp('activity', 'النشاط', s.store.activity, 'text', 'placeholder="مثال: عطور ومستحضرات تجميل"')}${inp('phone', 'الهاتف', s.store.phone)}
          ${inp('address', 'العنوان', s.store.address)}${inp('email', 'البريد الإلكتروني', s.store.email)}
          ${inp('tax_no', 'الرقم الضريبي', s.store.tax_no)}${inp('cr_no', 'السجل التجاري', s.store.cr_no)}
          <div class="full row" style="gap:12px"><div class="brand-mark" style="width:56px;height:56px" id="lg">${s.store.logo ? `<img src="${s.store.logo}">` : 'Q'}</div>
            <div><div class="b">الشعار</div><div class="muted" style="font-size:12px">PNG أو JPG، يفضل خلفية بيضاء. يطبع بالأبيض والأسود على الحراري.</div>
            <div class="row" style="margin-top:6px"><label class="btn sm">اختيار صورة<input type="file" accept="image/*" id="lf" hidden></label><button class="btn sm danger" id="lr">إزالة</button></div></div></div>
        </div></div>
        <div class="card" style="margin-top:14px"><div class="card-h"><h3>العملة وسعر الصرف</h3><span class="muted">البيع والحسابات بالدينار العراقي</span></div><div class="card-b fgrid c3" id="money">
          ${inp('currency', 'رمز العملة الأساسية', s.currency)}
          <label class="f"><span>الخانات العشرية</span><select class="input" name="decimals"><option value="0" ${s.decimals == 0 ? 'selected' : ''}>بدون (1,250)</option><option value="2" ${s.decimals == 2 ? 'selected' : ''}>خانتان (1,250.00)</option></select></label>
          ${inp('usd_rate', 'سعر صرف الدولار (دينار لكل 1$)', s.usd_rate, 'number', 'step="any"')}
          <div class="full faint" style="font-size:12px">سعر الصرف يُقترح تلقائياً في فواتير وسندات موردي الدولار ويمكن تعديله في كل فاتورة. حدّثه عند تغير السعر.</div>
        </div></div>
        <div class="card" style="margin-top:14px"><div class="card-h"><h3>الضريبة</h3></div><div class="card-b fgrid c3" id="tax">
          <label class="chk" style="align-self:end;height:32px"><input type="checkbox" name="enabled" ${s.tax.enabled ? 'checked' : ''}> تفعيل ضريبة القيمة المضافة</label>
          ${inp('rate', 'نسبة الضريبة %', s.tax.rate, 'number', 'step="any"')}
          <label class="f"><span>الأسعار</span><select class="input" name="inclusive"><option value="1" ${s.tax.inclusive ? 'selected' : ''}>شاملة الضريبة</option><option value="0" ${!s.tax.inclusive ? 'selected' : ''}>غير شاملة (تضاف الضريبة)</option></select></label>
        </div></div>
        <div class="card" style="margin-top:14px"><div class="card-h"><h3>نقطة البيع</h3></div><div class="card-b chk-list" id="pos">
          ${chk('require_shift', 'إلزام فتح وردية قبل البيع', s.pos.require_shift)}${chk('auto_print', 'طباعة الفاتورة تلقائياً بعد الدفع', s.pos.auto_print)}
          ${chk('allow_negative_stock', 'السماح بالبيع عند نفاد الكمية', s.pos.allow_negative_stock)}${chk('low_stock_warning', 'تنبيه عند انخفاض المخزون', s.pos.low_stock_warning)}
          <div class="sec-t" style="grid-column:1/-1;margin:6px 0 0">صلاحيات الكاشير</div>
          ${chk('cashier_edit_price', 'السماح للكاشير بتعديل سعر البيع', s.pos.cashier_edit_price)}${chk('cashier_discount', 'السماح للكاشير بإعطاء خصم', s.pos.cashier_discount)}
          <label class="f"><span>الحد الأعلى لخصم الكاشير % (0 = بدون حد)</span><input class="input num" type="number" name="cashier_max_discount" value="${esc(s.pos.cashier_max_discount)}" min="0" max="100"></label>
        </div></div></div>
        <div><div class="card"><div class="card-h"><h3>النسخ الاحتياطي</h3></div><div class="card-b">
          <p class="muted" style="margin-top:0">جميع البيانات محفوظة في ملف واحد داخل مجلد <span class="mono">data</span>. حمّل نسخة احتياطية بشكل دوري واحفظها في مكان آمن.</p>
          <button class="btn" id="bk">${icon('download')} تحميل نسخة احتياطية</button></div></div>
          <div class="card" style="margin-top:14px"><div class="card-h"><h3>روابط النظام</h3></div><div class="card-b">
          <div class="muted">عنوان هذا الجهاز على الشبكة (لأجهزة الكاشير)</div><div class="mono" id="lan" dir="ltr" style="text-align:right">…</div>
          <p class="faint" style="font-size:12px">برنامج الكاشير يجد هذا الجهاز تلقائياً. إن لم يجده، أدخل العنوان أعلاه يدوياً. يجب أن تكون الأجهزة على نفس الشبكة.</p>
          <div class="muted" style="margin-top:8px">مجلد البيانات</div><div class="mono" id="ddir" dir="ltr" style="text-align:right;font-size:11.5px;word-break:break-all">…</div></div></div></div></div>`;
      Q.get('/server-info').then((i) => {
        Q.$('#lan').innerHTML = i.addresses.length ? i.addresses.map((a) => `${a}:${i.port}`).join('<br>') : 'غير متصل بشبكة';
        Q.$('#ddir').textContent = i.data_dir;
      }).catch(() => {});
      let logo = s.store.logo;
      Q.$('#lf').onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 400 / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          logo = c.toDataURL('image/png'); Q.$('#lg').innerHTML = `<img src="${logo}">`;
        };
        img.src = URL.createObjectURL(file);
      };
      Q.$('#lr').onclick = () => { logo = ''; Q.$('#lg').textContent = 'Q'; };
      Q.$('#bk').onclick = async () => {
        const r = await fetch('/api/backup', { headers: { Authorization: 'Bearer ' + Q.token() } });
        if (!r.ok) return Q.toast('تعذر إنشاء النسخة', 'err');
        const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `the-queen-backup-${Q.today()}.db`; a.click();
      };
      Q.$('#sv').onclick = async () => {
        const store = { ...Q.formData(Q.$('#store')), logo };
        const tx = Q.formData(Q.$('#tax')), mo = Q.formData(Q.$('#money'));
        try {
          await Q.put('/settings', { store, currency: mo.currency || 'د.ع', decimals: Number(mo.decimals) || 0, usd_rate: Number(mo.usd_rate) || 1, tax: { enabled: tx.enabled, rate: Number(tx.rate) || 0, inclusive: tx.inclusive === '1' }, pos: Q.formData(Q.$('#pos')) });
          await Q.loadSettings(); Q.toast('تم حفظ الإعدادات', 'ok');
          Q.$('.side .brand').innerHTML = `${ERP.mark(Q.settings.store)}<div><div class="brand-t">${esc(Q.settings.store.name)}</div><div class="brand-s">النظام الإداري</div></div>`;
        } catch (e) { Q.err(e); }
      };
    },
  });

  // ===== إعدادات الطباعة =====
  const sample = () => ({
    number: 'S-00125', type: 'sale', date: Q.today() + ' 18:42', user_name: 'كاشير 1', customer_name: 'سارة أحمد', customer_phone: '0500000000', customer_address: '',
    tax_rate: Q.settings.tax.rate, method: 'mixed', items: [
      { name: 'عطر الملكة 100 مل', sku: 'QP-100', barcode: '20000001', qty: 1, unit: 'حبة', price: 35000, discount: 0, total: 35000 },
      { name: 'كريم مرطب للبشرة', sku: 'CR-22', barcode: '20000002', qty: 2, unit: 'حبة', price: 12000, discount: 1000, total: 23000 },
      { name: 'أحمر شفاه — لون 12', sku: 'LP-12', barcode: '20000003', qty: 1, unit: 'حبة', price: 9000, discount: 0, total: 9000 },
    ], subtotal: 67000, discount: 2000, total: 65000, tax: Q.settings.tax.enabled ? Q.n(65000 - 65000 / (1 + Q.settings.tax.rate / 100)) : 0, paid_cash: 40000, paid_card: 25000, credit: 0, tendered: 50000,
  });
  ERP.page('/print', {
    title: 'إعدادات الطباعة',
    async render(v, prm) {
      const s = await Q.loadSettings();
      let tab = prm.tab || 'thermal';
      ERP.head('إعدادات الطباعة', 'تحكم في شكل الفاتورة الحرارية وفاتورة A4', `${window.desktop ? `<button class="btn" id="dev">${icon('printer')} طابعة هذا الجهاز</button>` : ''}<button class="btn" id="tp">${icon('printer')} طباعة تجريبية</button><button class="btn primary" id="sv">${icon('check')} حفظ</button>`);
      const t = s.print_thermal, a = s.print_a4;
      v.innerHTML = `<div class="bar"><div class="seg" id="tabs"><button data-t="thermal">الفاتورة الحرارية (POS)</button><button data-t="a4">فاتورة A4 (ERP)</button></div></div>
        <div class="set-grid half"><div>
        <div class="card" id="f-thermal"><div class="card-b">
          <div class="sec-t">الورق</div><div class="fgrid c3">
            <label class="f"><span>عرض الورق</span><select class="input" name="width"><option value="80" ${t.width == 80 ? 'selected' : ''}>80 مم</option><option value="58" ${t.width == 58 ? 'selected' : ''}>58 مم</option></select></label>
            ${inp('font_size', 'حجم الخط (px)', t.font_size, 'number', 'min="9" max="18"')}${inp('margin', 'الهامش (مم)', t.margin, 'number', 'min="0" max="8"')}
            ${inp('copies', 'عدد النسخ', t.copies, 'number', 'min="1" max="3"')}${inp('logo_width', 'عرض الشعار (مم)', t.logo_width, 'number', 'min="15" max="70"')}</div>
          <div class="sec-t">رأس الفاتورة</div><div class="fgrid">${inp('title', 'عنوان الفاتورة', t.title)}${inp('header_note', 'سطر إضافي تحت البيانات', t.header_note)}</div>
          <div class="chk-list" style="margin-top:10px">${chk('show_logo', 'إظهار الشعار', t.show_logo)}${chk('show_name', 'إظهار اسم المتجر', t.show_name)}${chk('show_address', 'إظهار العنوان', t.show_address)}
            ${chk('show_phone', 'إظهار الهاتف', t.show_phone)}${chk('show_tax_no', 'إظهار الرقم الضريبي', t.show_tax_no)}${chk('show_cashier', 'إظهار اسم الكاشير', t.show_cashier)}
            ${chk('show_customer', 'إظهار اسم العميل', t.show_customer)}${chk('show_sku', 'إظهار رمز الصنف', t.show_sku)}${chk('show_tax_summary', 'تفصيل الضريبة', t.show_tax_summary)}${chk('show_barcode', 'باركود رقم الفاتورة', t.show_barcode)}</div>
          <div class="sec-t">التذييل</div><div class="fgrid">${inp('footer', 'رسالة الشكر', t.footer)}${inp('footer2', 'سطر سياسة الاستبدال', t.footer2)}</div>
        </div></div>
        <div class="card hidden" id="f-a4"><div class="card-b">
          <div class="sec-t">العام</div><div class="fgrid">${inp('title', 'عنوان الفاتورة', a.title)}<label class="f full"><span>اللون الرئيسي</span><div class="row"><input type="color" class="input" name="accent" value="${esc(a.accent)}">
            ${['#6b1d3a', '#1f2937', '#0f4c81', '#14532d', '#7c2d12', '#b08d57'].map((c) => `<button class="btn icon sm" data-c="${c}" style="background:${c};border-color:${c}"></button>`).join('')}</div></label></div>
          <div class="chk-list" style="margin-top:10px">${chk('show_logo', 'إظهار الشعار', a.show_logo)}${chk('show_tax_no', 'إظهار الرقم الضريبي', a.show_tax_no)}${chk('show_cr_no', 'إظهار السجل التجاري', a.show_cr_no)}
            ${chk('show_customer_box', 'مربع بيانات العميل والدفع', a.show_customer_box)}${chk('show_sku', 'عمود رمز الصنف', a.show_sku)}${chk('show_barcode', 'باركود رقم الفاتورة', a.show_barcode)}
            ${chk('show_words', 'المبلغ كتابةً (تفقيط)', a.show_words)}${chk('show_signature', 'خانات التوقيع والختم', a.show_signature)}${chk('show_bank', 'إظهار بيانات البنك', a.show_bank)}</div>
          <div class="fgrid" style="margin-top:12px">${txt('terms', 'الشروط والأحكام', a.terms)}${txt('bank_info', 'بيانات الحساب البنكي (IBAN)', a.bank_info)}${inp('footer', 'تذييل الصفحة', a.footer)}</div>
        </div></div></div>
        <div class="card"><div class="card-h"><h3>معاينة مباشرة</h3><span class="sp"></span><span class="muted" id="pinfo"></span></div><div class="card-b" style="padding:10px"><iframe class="prev-frame" id="pf"></iframe></div></div></div>`;
      const read = () => {
        const th = Q.formData(Q.$('#f-thermal')), a4 = Q.formData(Q.$('#f-a4'));
        ['font_size', 'margin', 'copies', 'logo_width', 'width'].forEach((k) => (th[k] = Number(th[k]) || 0));
        return { print_thermal: { ...s.print_thermal, ...th }, print_a4: { ...s.print_a4, ...a4 } };
      };
      const preview = () => {
        const cfg = { ...s, ...read() };
        const html = tab === 'thermal' ? Q.print.thermal(sample(), cfg) : Q.print.a4Invoice(sample(), cfg);
        const f = Q.$('#pf'), wrap = f.parentElement;
        wrap.style.overflow = 'hidden';
        if (tab === 'thermal') {
          Object.assign(f.style, { width: '', height: '', transform: '', transformOrigin: '' }); wrap.style.height = '';
          f.srcdoc = html.replace('</style>', 'html{background:#e9ebee}body{margin:16px auto;box-shadow:0 2px 10px rgba(0,0,0,.15)}</style>');
        } else {
          // صفحة A4 بحجمها الحقيقي ثم تصغير الإطار كاملاً ليناسب العرض المتاح
          const W = 860, H = 1180, z = Math.min(1, (wrap.clientWidth - 20) / W);
          Object.assign(f.style, { width: W + 'px', height: H + 'px', transform: `scale(${z})`, transformOrigin: 'top right' });
          wrap.style.height = Math.ceil(H * z + 20) + 'px';
          f.srcdoc = html.replace('</style>', '@media screen{html{background:#e9ebee}body{width:210mm;min-height:297mm;margin:16px auto;padding:12mm;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.15)}}</style>');
        }
        Q.$('#pinfo').textContent = tab === 'thermal' ? `ورق ${cfg.print_thermal.width} مم` : 'A4 — 210×297 مم';
      };
      const setTab = (x) => {
        tab = x; Q.$$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === x));
        Q.$('#f-thermal').classList.toggle('hidden', x !== 'thermal'); Q.$('#f-a4').classList.toggle('hidden', x !== 'a4'); preview();
      };
      Q.$$('#tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.t)));
      Q.$('#dev') && (Q.$('#dev').onclick = () => Q.print.deviceDialog());
      Q.$$('[data-c]').forEach((b) => (b.onclick = () => { Q.$('[name=accent]').value = b.dataset.c; preview(); }));
      v.addEventListener('input', Q.debounce(preview, 200));
      v.addEventListener('change', preview);
      Q.$('#tp').onclick = () => { const cfg = { ...s, ...read() }; Q.print.run(tab === 'thermal' ? Q.print.thermal(sample(), cfg) : Q.print.a4Invoice(sample(), cfg)); };
      Q.$('#sv').onclick = async () => { try { await Q.put('/settings', read()); await Q.loadSettings(); Q.toast('تم حفظ إعدادات الطباعة', 'ok'); } catch (e) { Q.err(e); } };
      setTab(tab);
    },
  });

  // ===== المستخدمين =====
  ERP.page('/users', {
    title: 'المستخدمين',
    async render(v) {
      const rows = await Q.get('/users');
      ERP.head('المستخدمين والصلاحيات', '', `<button class="btn primary" id="add">${icon('plus')} مستخدم جديد</button>`);
      v.innerHTML = `<div class="card" style="max-width:900px">${T([{ k: 'name', t: 'الاسم', f: (x) => `<b>${esc(x)}</b>` }, { k: 'username', t: 'اسم الدخول', f: (x) => `<span class="mono">${esc(x || '—')}</span>` },
        { k: 'role', t: 'الصلاحية', f: (x) => `<span class="tag ${x === 'admin' ? 'acc' : x === 'manager' ? 'info' : ''}">${Q.ROLES[x]}</span>` }, { k: 'has_pin', t: 'رمز POS', f: (x) => (x ? '••••' : '—') },
        { k: 'active', t: 'الحالة', f: (x) => (x ? '<span class="tag ok">فعال</span>' : '<span class="tag err">موقوف</span>') }, { k: 'id', t: '', cls: 'act', f: (x) => `<button class="btn sm ghost" data-ed="${x}">${icon('edit', 14)}</button>` }], rows)}
        <div class="card-b muted" style="border-top:1px solid var(--line);font-size:12px"><b>مدير النظام:</b> كل الصلاحيات · <b>مشرف:</b> كل شيء عدا الإعدادات والمستخدمين ودليل الحسابات · <b>كاشير:</b> نقطة البيع فقط (يدخل بالرمز السري)</div></div>`;
      const fields = (isNew) => [{ n: 'name', t: 'الاسم', req: 1 }, { n: 'role', t: 'الصلاحية', type: 'select', options: Object.entries(Q.ROLES) },
        { n: 'username', t: 'اسم الدخول للنظام الإداري', hint: 'غير مطلوب للكاشير' }, { n: 'password', t: isNew ? 'كلمة المرور' : 'كلمة مرور جديدة', type: 'password', hint: isNew ? '' : 'اتركها فارغة لعدم التغيير' },
        { n: 'pin', t: isNew ? 'الرمز السري لنقطة البيع' : 'رمز سري جديد لنقطة البيع', type: 'password', hint: isNew ? 'من 4 إلى 8 أرقام' : 'اتركه فارغاً لعدم التغيير' }, { n: 'active', t: 'حساب فعال', type: 'checkbox' }];
      Q.$('#add').onclick = () => ERP.form({ title: 'مستخدم جديد', fields: fields(true), data: { role: 'cashier', active: 1 }, onSave: async (o) => { await Q.post('/users', o); ERP.reload(); } });
      Q.$$('[data-ed]').forEach((b) => (b.onclick = () => ERP.form({ title: 'تعديل مستخدم', fields: fields(false), data: rows.find((r) => r.id == b.dataset.ed), onSave: async (o) => { await Q.put('/users/' + b.dataset.ed, o); ERP.reload(); } })));
    },
  });
})();
