// المحاسبة والتقارير
(function () {
  const { esc, fmt, icon } = Q;
  const T = ERP.table;
  const TYPES = { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };
  const REF = { invoice: 'مبيعات', purchase: 'مشتريات', voucher: 'سند', adjust: 'مخزون', shift: 'وردية', opening: 'رصيد افتتاحي', manual: 'يدوي' };

  // ===== دليل الحسابات =====
  ERP.page('/accounts', {
    title: 'دليل الحسابات',
    async render(v) {
      ERP.head('دليل الحسابات', 'الحسابات النظامية مرتبطة بالقيود التلقائية', `<button class="btn primary" id="add">${icon('plus')} حساب جديد</button>`);
      const rows = await Q.get('/accounts');
      const byParent = {};
      rows.forEach((a) => (byParent[a.parent_id || 0] = byParent[a.parent_id || 0] || []).push(a));
      const bal = (a) => (['asset', 'expense'].includes(a.type) ? a.debit - a.credit : a.credit - a.debit);
      const total = (a) => (a.is_group ? (byParent[a.id] || []).reduce((s, c) => s + total(c), 0) : bal(a));
      const flat = [];
      const walk = (pid, d) => (byParent[pid] || []).forEach((a) => { flat.push({ ...a, d, bal: total(a) }); walk(a.id, d + 1); });
      walk(0, 0);
      v.innerHTML = `<div class="card tbl-wrap">${T([
        { k: 'code', t: 'الرمز', f: (x) => `<span class="mono">${x}</span>` },
        { k: 'name', t: 'اسم الحساب', f: (x, a) => `<span style="padding-right:${a.d * 18}px">${a.is_group ? '<b>' + esc(x) + '</b>' : esc(x)}</span>${a.system ? '' : ' <span class="tag">مضاف</span>'}` },
        { k: 'type', t: 'النوع', f: (x) => `<span class="muted">${TYPES[x]}</span>` },
        { k: 'bal', t: 'الرصيد', cls: 'n', f: (x, a) => (a.is_group ? `<b>${fmt(x)}</b>` : fmt(x)) },
        { k: 'id', t: '', cls: 'act', f: (x, a) => `<div class="row">${a.is_group ? '' : `<a class="btn sm" href="#/ledger?account_id=${x}">كشف</a>`}<button class="btn sm ghost" data-ed="${x}">${icon('edit', 14)}</button>${a.system ? '' : `<button class="btn sm ghost danger" data-del="${x}">${icon('trash', 14)}</button>`}</div>` },
      ], flat, { cls: 'tree' }).replace(/<tr ?>/g, '<tr>')}</div>`;
      Q.$$('.tree tbody tr').forEach((tr, i) => flat[i].is_group && tr.classList.add('grp'));
      const groups = rows.filter((a) => a.is_group);
      Q.$('#add').onclick = () => ERP.form({
        title: 'حساب جديد', width: 460, cols: 1,
        fields: [{ n: 'parent_id', t: 'الحساب الرئيسي', type: 'select', options: ERP.options(groups, (a) => `${a.code} — ${a.name}`), req: 1 },
          { n: 'code', t: 'رمز الحساب', req: 1, hint: 'مثال: 5207' }, { n: 'name', t: 'اسم الحساب', req: 1 }, { n: 'is_group', t: 'حساب رئيسي (مجموعة)', type: 'checkbox' }],
        onSave: async (o) => { if (!o.parent_id) throw new Error('اختر الحساب الرئيسي'); await Q.post('/accounts', o); ERP.reload(); },
      });
      Q.$$('[data-ed]').forEach((b) => (b.onclick = () => {
        const a = rows.find((r) => r.id == b.dataset.ed);
        ERP.form({ title: 'تعديل حساب', width: 420, cols: 1, data: a, fields: [{ n: 'code', t: 'الرمز', ro: a.system }, { n: 'name', t: 'الاسم', req: 1 }], onSave: async (o) => { await Q.put('/accounts/' + a.id, o); ERP.reload(); } });
      }));
      Q.$$('[data-del]').forEach((b) => (b.onclick = async () => { if (await Q.confirm('حذف الحساب؟', { danger: true, ok: 'حذف' })) { try { await Q.del('/accounts/' + b.dataset.del); ERP.reload(); } catch (e) { Q.err(e); } } }));
    },
  });

  // ===== القيود اليومية =====
  ERP.page('/journal', {
    title: 'القيود اليومية',
    async render(v) {
      const st = { from: Q.monthStart(), to: Q.today(), ref_type: '', q: '' };
      ERP.head('القيود اليومية', 'كل العمليات تُرحّل تلقائياً', `<a class="btn primary" href="#/journal/new">${icon('plus')} قيد يدوي</a>`);
      v.innerHTML = `<div class="bar">${ERP.dateBar(st, () => load())}</div><div class="bar"><input class="input search" id="q" placeholder="بحث في البيان…">
        <select class="input" id="rt"><option value="">كل الأنواع</option>${Object.entries(REF).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div><div class="card tbl-wrap" id="list"></div>`;
      const load = async () => {
        const rows = await Q.get('/journal' + Q.qs(st));
        Q.$('#list').innerHTML = T([{ k: 'no', t: 'رقم القيد', f: (x) => `<b class="mono">JV-${String(x).padStart(5, '0')}</b>` }, { k: 'date', t: 'التاريخ' },
          { k: 'ref_type', t: 'النوع', f: (x) => `<span class="tag ${x === 'manual' ? 'acc' : ''}">${REF[x] || x}</span>` }, { k: 'description', t: 'البيان', cls: 'wrap' },
          { k: 'user_name', t: 'المستخدم' }, { k: 'amount', t: 'المبلغ', n: 1 }], rows, { click: 1 });
        ERP.bindRows(Q.$('#list'), rows, (r) => ERP.go('/entry/' + r.id));
      };
      Q.$('#q').oninput = Q.debounce((e) => { st.q = e.target.value; load(); });
      Q.$('#rt').onchange = (e) => { st.ref_type = e.target.value; load(); };
      load();
    },
  });
  ERP.page('/entry/:id', {
    title: 'قيد', nav: 1,
    async render(v, { id }) {
      const e = await Q.get('/journal/' + id);
      const no = 'JV-' + String(e.no).padStart(5, '0');
      const link = e.ref_type === 'invoice' ? `#/invoice/${e.ref_id}` : e.ref_type === 'purchase' ? `#/purchase/${e.ref_id}` : '';
      ERP.head('قيد ' + no, e.date, `${link ? `<a class="btn" href="${link}">المستند الأصلي</a>` : ''}<button class="btn" id="pr">${icon('printer')} طباعة</button>${e.ref_type === 'manual' && ERP.user.role === 'admin' ? `<button class="btn danger" id="del">${icon('trash')} حذف</button>` : ''}`);
      const d = ERP.sum(e.lines, 'debit'), c = ERP.sum(e.lines, 'credit');
      v.innerHTML = `<div class="card" style="max-width:900px"><div class="card-b"><b>${esc(e.description)}</b><div class="muted">${REF[e.ref_type] || ''} · ${esc(e.user_name || '')} · ${Q.dt(e.created_at)}</div></div>
        <div id="tb">${T([{ k: 'code', t: 'الرمز', f: (x) => `<span class="mono">${x}</span>` }, { k: 'account', t: 'الحساب', f: (x, l) => `${esc(x)}${l.party ? ` <span class="faint">— ${esc(l.party)}</span>` : ''}` },
          { k: 'debit', t: 'مدين', cls: 'n', f: (x) => (x ? fmt(x) : '') }, { k: 'credit', t: 'دائن', cls: 'n', f: (x) => (x ? fmt(x) : '') }], e.lines, { foot: { account: 'الإجمالي', debit: d, credit: c } })}</div></div>`;
      Q.$('#pr').onclick = () => ERP.printReport('قيد يومية ' + no, e.date + ' — ' + e.description, Q.$('#tb').innerHTML);
      Q.$('#del') && (Q.$('#del').onclick = async () => { if (await Q.confirm('حذف القيد اليدوي نهائياً؟', { danger: true, ok: 'حذف' })) { await Q.del('/journal/' + id); ERP.go('/journal'); } });
    },
  });
  ERP.page('/journal/new', {
    title: 'قيد يدوي', nav: 1,
    async render(v) {
      const accs = (await Q.get('/accounts')).filter((a) => !a.is_group);
      const customers = await Q.get('/customers'), suppliers = await Q.get('/suppliers');
      const lines = [{}, {}];
      ERP.head('قيد يومية يدوي', 'مثال: إيداع رأس مال، سحوبات المالك، إثبات أصل');
      v.innerHTML = `<div class="card" style="max-width:1000px"><div class="card-b fgrid c3" style="border-bottom:1px solid var(--line)">
        <label class="f"><span>التاريخ</span><input class="input" type="date" id="dt" value="${Q.today()}"></label>
        <label class="f" style="grid-column:span 2"><span>البيان *</span><input class="input" id="ds"></label></div>
        <div id="ls"></div><div class="card-b row"><button class="btn" id="al">${icon('plus')} سطر</button><span class="sp"></span><span id="bal"></span><button class="btn primary" id="sv">حفظ القيد</button></div></div>`;
      const accOpts = `<option value="">— الحساب —</option>${accs.map((a) => `<option value="${a.id}" data-code="${a.code}">${a.code} — ${esc(a.name)}</option>`).join('')}`;
      const draw = () => {
        Q.$('#ls').innerHTML = `<table class="tbl lines"><thead><tr><th style="width:34%">الحساب</th><th>الطرف (للذمم)</th><th style="width:130px">مدين</th><th style="width:130px">دائن</th><th>ملاحظة</th><th></th></tr></thead><tbody>
          ${lines.map((l, i) => {
            const code = accs.find((a) => a.id == l.account_id)?.code;
            const party = code === '1201' ? customers : code === '2101' ? suppliers : null;
            return `<tr><td><select class="input sm" data-i="${i}" data-f="account_id">${accOpts}</select></td>
              <td>${party ? `<select class="input sm" data-i="${i}" data-f="party_id"><option value="">—</option>${party.map((p) => `<option value="${p.id}" ${l.party_id == p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : '<span class="faint">—</span>'}</td>
              <td><input class="input sm num" type="number" step="any" data-i="${i}" data-f="debit" value="${l.debit || ''}"></td>
              <td><input class="input sm num" type="number" step="any" data-i="${i}" data-f="credit" value="${l.credit || ''}"></td>
              <td><input class="input sm" data-i="${i}" data-f="note" value="${esc(l.note || '')}"></td>
              <td class="act">${lines.length > 2 ? `<button class="btn sm ghost danger" data-rm="${i}">${icon('x', 14)}</button>` : ''}</td></tr>`;
          }).join('')}</tbody></table>`;
        Q.$$('#ls select[data-f=account_id]').forEach((s) => (s.value = lines[s.dataset.i].account_id || ''));
        Q.$$('#ls [data-f]').forEach((el) => {
          el.onchange = el.oninput = () => {
            const l = lines[el.dataset.i]; const f = el.dataset.f;
            l[f] = ['debit', 'credit'].includes(f) ? Number(el.value) || 0 : el.value;
            if (f === 'account_id') { l.party_id = ''; draw(); }
            bal();
          };
        });
        Q.$$('#ls [data-rm]').forEach((b) => (b.onclick = () => { lines.splice(b.dataset.rm, 1); draw(); }));
        bal();
      };
      const bal = () => {
        const d = ERP.sum(lines, 'debit'), c = ERP.sum(lines, 'credit');
        Q.$('#bal').innerHTML = `مدين <b>${fmt(d)}</b> · دائن <b>${fmt(c)}</b> ${Math.abs(d - c) < 0.01 && d > 0 ? '<span class="tag ok">متوازن</span>' : `<span class="tag err">الفرق ${fmt(d - c)}</span>`}`;
      };
      Q.$('#al').onclick = () => { lines.push({}); draw(); };
      Q.$('#sv').onclick = async () => {
        const accById = Object.fromEntries(accs.map((a) => [a.id, a]));
        const body = { date: Q.$('#dt').value, description: Q.$('#ds').value,
          lines: lines.filter((l) => l.account_id && (l.debit || l.credit)).map((l) => {
            const code = accById[l.account_id]?.code;
            return { ...l, account_id: Number(l.account_id), party_type: l.party_id ? (code === '1201' ? 'customer' : 'supplier') : null, party_id: l.party_id || null };
          }) };
        if (!body.description) return Q.toast('اكتب بيان القيد', 'err');
        try { const e = await Q.post('/journal', body); Q.toast('تم حفظ القيد', 'ok'); ERP.go('/entry/' + e.id); } catch (e) { Q.err(e); }
      };
      draw();
    },
  });

  // ===== كشف حساب =====
  ERP.page('/ledger', {
    title: 'كشف حساب',
    async render(v, prm) {
      const accs = (await Q.get('/accounts')).filter((a) => !a.is_group);
      const st = { from: Q.today().slice(0, 4) + '-01-01', to: Q.today(), account_id: prm.account_id || '' };
      ERP.head('كشف حساب', 'الأستاذ العام', `<button class="btn" id="pr">${icon('printer')} طباعة</button>`);
      v.innerHTML = `<div class="bar"><select class="input" id="ac" style="width:260px"><option value="">— اختر الحساب —</option>${accs.map((a) => `<option value="${a.id}" ${a.id == st.account_id ? 'selected' : ''}>${a.code} — ${esc(a.name)}</option>`).join('')}</select>
        ${ERP.dateBar(st, () => load())}</div><div class="card tbl-wrap" id="list"><div class="empty">اختر حساباً لعرض كشفه</div></div>`;
      let acc = null;
      const load = async () => {
        if (!st.account_id) return;
        const r = await Q.get('/reports/ledger' + Q.qs(st)); acc = r.account;
        Q.$('#list').innerHTML = ERP.ledgerTable(r);
      };
      Q.$('#ac').onchange = (e) => { st.account_id = e.target.value; load(); };
      Q.$('#pr').onclick = () => acc && ERP.printReport(`كشف حساب: ${acc.code} ${acc.name}`, `من ${st.from} إلى ${st.to}`, Q.$('#list').innerHTML);
      load();
    },
  });

  // ===== التقارير =====
  const reportPage = (path, title, build, { range = true, single = false } = {}) => ERP.page(path, {
    title,
    async render(v) {
      const st = single ? { from: Q.today(), to: Q.today() } : { from: Q.monthStart(), to: Q.today() };
      ERP.head(title, '', `<button class="btn" id="pr">${icon('printer')} طباعة A4</button>`);
      v.innerHTML = `${range ? `<div class="bar">${single ? `<span class="muted">حتى تاريخ</span><input class="input" type="date" id="to1" value="${st.to}" style="width:150px">` : ERP.dateBar(st, () => load())}</div>` : ''}<div id="rep"></div>`;
      const load = async () => { Q.$('#rep').innerHTML = await build(st); };
      if (single) Q.$('#to1').onchange = (e) => { st.to = e.target.value; load(); };
      Q.$('#pr').onclick = () => ERP.printReport(title, range ? (single ? `حتى ${st.to}` : `من ${st.from} إلى ${st.to}`) : Q.today(), Q.$('#rep').innerHTML);
      load();
    },
  });

  reportPage('/reports/sales', 'تقرير المبيعات', async (st) => {
    const r = await Q.get('/reports/sales' + Q.qs(st));
    return `<div class="stats">
      <div class="stat"><div class="k">إجمالي المبيعات</div><div class="v">${fmt(r.sales.total)}</div><div class="s">${r.sales.n} فاتورة</div></div>
      <div class="stat"><div class="k">المرتجعات</div><div class="v err">${fmt(r.returns.total)}</div><div class="s">${r.returns.n} مرتجع</div></div>
      <div class="stat"><div class="k">صافي المبيعات</div><div class="v">${fmt(r.net)}</div><div class="s">الضريبة ${fmt(r.net_tax)}</div></div>
      <div class="stat"><div class="k">تكلفة المبيعات</div><div class="v">${fmt(r.net_cost)}</div></div>
      <div class="stat"><div class="k">إجمالي الربح</div><div class="v ok">${fmt(r.profit)}</div><div class="s">بعد الضريبة والتكلفة</div></div>
      <div class="stat"><div class="k">نقدي / شبكة / آجل</div><div class="v" style="font-size:14px">${fmt(r.sales.cash)} / ${fmt(r.sales.card)} / ${fmt(r.sales.credit)}</div><div class="s">الخصومات ${fmt(r.sales.discount)}</div></div></div>
      <div class="grid2e"><div class="card"><div class="card-h"><h3>المبيعات حسب الصنف</h3></div><div class="tbl-wrap" style="max-height:460px">${T([{ k: 'name', t: 'الصنف' }, { k: 'qty', t: 'الكمية', cls: 'n', f: Q.qty }, { k: 'total', t: 'المبيعات', n: 1 },
        { k: 'cost', t: 'الربح', cls: 'n', f: (x, p) => fmt(p.total - x) }], r.byProduct)}</div></div>
      <div><div class="card"><div class="card-h"><h3>حسب اليوم</h3></div>${T([{ k: 'd', t: 'اليوم' }, { k: 'n', t: 'عدد الفواتير', cls: 'n', f: (x) => x }, { k: 'total', t: 'الصافي', n: 1 }], r.byDay, { foot: { d: 'الإجمالي', total: r.net } })}</div>
      <div class="card" style="margin-top:14px"><div class="card-h"><h3>حسب التصنيف</h3></div>${T([{ k: 'name', t: 'التصنيف' }, { k: 'qty', t: 'الكمية', cls: 'n', f: Q.qty }, { k: 'total', t: 'الصافي', n: 1 }], r.byCategory)}</div>
      <div class="card" style="margin-top:14px"><div class="card-h"><h3>حسب المستخدم</h3></div>${T([{ k: 'name', t: 'المستخدم' }, { k: 'n', t: 'العمليات', cls: 'n', f: (x) => x }, { k: 'total', t: 'الصافي', n: 1 }], r.byUser)}</div></div></div>`;
  });

  const section = (title, rows, total, label) => `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>${title}</h3></div>${T([{ k: 'code', t: 'الرمز', f: (x) => `<span class="mono">${x}</span>` }, { k: 'name', t: 'الحساب' }, { k: 'amount', t: 'المبلغ', n: 1 }], rows, { foot: { name: label, amount: total }, empty: 'لا توجد أرصدة' })}</div>`;
  reportPage('/reports/income', 'قائمة الأرباح والخسائر', async (st) => {
    const r = await Q.get('/reports/income' + Q.qs(st));
    return `<div style="max-width:820px"><div class="stats"><div class="stat"><div class="k">صافي الإيرادات</div><div class="v">${fmt(r.total_revenue)}</div></div>
      <div class="stat"><div class="k">مجمل الربح</div><div class="v">${fmt(r.gross_profit)}</div><div class="s">بعد تكلفة البضاعة</div></div>
      <div class="stat"><div class="k">صافي الربح</div><div class="v ${r.net >= 0 ? 'ok' : 'err'}">${fmt(r.net)}</div></div></div>
      ${section('الإيرادات', r.revenue, r.total_revenue, 'إجمالي الإيرادات')}${section('المصروفات', r.expense, r.total_expense, 'إجمالي المصروفات')}
      <div class="card card-b row b" style="font-size:15px"><span>صافي ${r.net >= 0 ? 'الربح' : 'الخسارة'}</span><span class="sp"></span><span class="${r.net >= 0 ? 'ok' : 'err'} num">${fmt(r.net)} ${esc(Q.settings.currency)}</span></div></div>`;
  });
  reportPage('/reports/balance', 'الميزانية العمومية', async (st) => {
    const r = await Q.get('/reports/balance-sheet' + Q.qs({ to: st.to }));
    const diff = Q.n(r.total_assets - r.total_liabilities - r.total_equity);
    return `<div class="grid2e"><div>${section('الأصول', r.assets, r.total_assets, 'إجمالي الأصول')}</div>
      <div>${section('الخصوم', r.liabilities, r.total_liabilities, 'إجمالي الخصوم')}${section('حقوق الملكية', r.equity, r.total_equity, 'إجمالي حقوق الملكية')}
      <div class="card card-b row b"><span>الخصوم + حقوق الملكية</span><span class="sp"></span><span class="num">${fmt(r.total_liabilities + r.total_equity)}</span></div></div></div>
      <div style="margin-top:10px">${Math.abs(diff) < 0.01 ? '<span class="tag ok">الميزانية متوازنة</span>' : `<span class="tag err">فرق ${fmt(diff)}</span>`}</div>`;
  }, { single: true });
  reportPage('/reports/trial', 'ميزان المراجعة', async (st) => {
    const rows = await Q.get('/reports/trial-balance' + Q.qs(st));
    const dr = (x) => (x > 0 ? fmt(x) : ''), cr = (x) => (x < 0 ? fmt(-x) : '');
    return `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>الرمز</th><th>الحساب</th><th class="n">رصيد سابق مدين</th><th class="n">رصيد سابق دائن</th><th class="n">حركة مدين</th><th class="n">حركة دائن</th><th class="n">الرصيد مدين</th><th class="n">الرصيد دائن</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td class="mono">${r.code}</td><td>${esc(r.name)}</td><td class="n">${dr(r.opening)}</td><td class="n">${cr(r.opening)}</td><td class="n">${fmt(r.debit)}</td><td class="n">${fmt(r.credit)}</td><td class="n b">${dr(r.closing)}</td><td class="n b">${cr(r.closing)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td>الإجمالي</td>${['opening', 'opening', 'debit', 'credit', 'closing', 'closing'].map((k, i) => `<td class="n">${fmt(rows.reduce((s, r) => s + (k === 'debit' || k === 'credit' ? r[k] : i % 2 === 0 ? Math.max(r[k], 0) : Math.max(-r[k], 0)), 0))}</td>`).join('')}</tr></tfoot></table></div>`;
  });
  reportPage('/reports/inventory', 'تقييم المخزون', async () => {
    const r = await Q.get('/reports/inventory');
    return `<div class="stats"><div class="stat"><div class="k">قيمة المخزون بالتكلفة</div><div class="v">${fmt(r.total_cost)}</div></div>
      <div class="stat"><div class="k">قيمة المخزون بسعر البيع</div><div class="v">${fmt(r.total_retail)}</div></div><div class="stat"><div class="k">الربح المتوقع</div><div class="v ok">${fmt(r.total_retail - r.total_cost)}</div></div></div>
      <div class="card tbl-wrap">${T([{ k: 'name', t: 'الصنف' }, { k: 'barcode', t: 'الباركود', f: (x) => `<span class="mono">${esc(x || '')}</span>` }, { k: 'category', t: 'التصنيف' },
        { k: 'stock', t: 'الكمية', cls: 'n', f: (x, p) => `<span class="${x <= p.min_stock ? 'warn b' : ''}">${Q.qty(x)}</span>` }, { k: 'cost', t: 'التكلفة', n: 1 }, { k: 'price', t: 'السعر', n: 1 },
        { k: 'value', t: 'القيمة بالتكلفة', n: 1 }, { k: 'retail', t: 'القيمة بالبيع', n: 1 }], r.rows, { foot: { name: 'الإجمالي', value: r.total_cost, retail: r.total_retail } })}</div>`;
  }, { range: false });

  // ===== الورديات =====
  ERP.page('/shifts', {
    title: 'ورديات الكاشير',
    async render(v) {
      const st = { from: Q.monthStart(), to: Q.today() };
      ERP.head('ورديات الكاشير', 'فتح وإغلاق الصندوق في نقطة البيع');
      v.innerHTML = `<div class="bar">${ERP.dateBar(st, () => load())}</div><div class="card tbl-wrap" id="list"></div>`;
      const load = async () => {
        const rows = await Q.get('/shifts' + Q.qs(st));
        Q.$('#list').innerHTML = T([{ k: 'id', t: '#', f: (x) => `<b>${x}</b>` }, { k: 'user_name', t: 'الكاشير' }, { k: 'opened_at', t: 'الفتح', f: Q.dt },
          { k: 'closed_at', t: 'الإغلاق', f: (x) => (x ? Q.dt(x) : '<span class="tag ok">مفتوحة</span>') }, { k: 'opening_cash', t: 'رصيد الافتتاح', n: 1 },
          { k: 'sales', t: 'المبيعات', n: 1 }, { k: 'returns', t: 'المرتجعات', n: 1 }, { k: 'expected_cash', t: 'النقد المتوقع', cls: 'n', f: (x) => (x == null ? '' : fmt(x)) },
          { k: 'counted_cash', t: 'النقد الفعلي', cls: 'n', f: (x) => (x == null ? '' : fmt(x)) },
          { k: 'notes', t: 'الفرق', cls: 'n', f: (x, r) => (r.counted_cash == null ? '' : `<b class="${r.counted_cash - r.expected_cash < 0 ? 'err' : r.counted_cash - r.expected_cash > 0 ? 'ok' : ''}">${fmt(r.counted_cash - r.expected_cash)}</b>`) },
          { k: 'id', t: '', cls: 'act', f: (x) => `<button class="btn sm ghost" data-p="${x}">${icon('printer', 14)}</button>` }], rows);
        Q.$$('[data-p]').forEach((b) => (b.onclick = async () => Q.print.run(Q.print.shiftThermal(await Q.get('/shifts/' + b.dataset.p)))));
      };
      load();
    },
  });
})();
