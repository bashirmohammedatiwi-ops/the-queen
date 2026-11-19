// المتجر الإلكتروني: الطلبات + منتجات الموقع + محتوى الموقع والربط
(function () {
  const { esc, fmt, icon } = Q;
  const T = ERP.table;
  const ST = { new: ['جديد', 'acc'], confirmed: ['مؤكد', 'info'], shipping: ['قيد التوصيل', 'warn'], delivered: ['تم التسليم', 'ok'], cancelled: ['ملغي', 'err'] };
  const NEXT = { new: ['confirmed', 'تأكيد الطلب'], confirmed: ['shipping', 'تسليم للتوصيل'], shipping: ['delivered', 'تم التسليم'] };
  // أوقات الطلبات تأتي من الموقع بتوقيت عالمي — تُعرض بالتوقيت المحلي
  const lt = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16).replace('T', ' '); };
  const tag = (s) => `<span class="tag ${ST[s]?.[1] || ''}">${ST[s]?.[0] || s}</span>`;
  const waLink = (phone, text = '') => { let d = String(phone || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '964' + d.slice(1); return `https://wa.me/${d}${text ? '?text=' + encodeURIComponent(text) : ''}`; };

  // ===== تنبيه الطلبات الجديدة (في كل صفحات النظام) =====
  ERP.webBadge = async () => {
    try {
      const s = await Q.get('/web/status');
      const n = s.counts?.new || 0;
      const a = Q.$('.nav a[data-h="/web/orders"]');
      if (a) { a.querySelector('.nb')?.remove(); if (n) a.insertAdjacentHTML('beforeend', `<span class="nb">${n}</span>`); }
    } catch { /* */ }
  };
  ERP.onWebOrder = (d) => {
    Q.toast(`طلب جديد من المتجر الإلكتروني ${d.no} — ${d.name}`, 'ok');
    try { // تنبيه صوتي خفيف
      const ac = new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.08, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.6);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.6);
    } catch { /* */ }
    ERP.webBadge();
    if (location.hash.startsWith('#/web/orders')) ERP.reload();
  };

  // ===== الطلبات =====
  ERP.page('/web/orders', {
    title: 'طلبات المتجر الإلكتروني',
    async render(v, prm) {
      const st = { status: prm.status ?? 'new', q: '' };
      const status = await Q.get('/web/status');
      ERP.head('طلبات المتجر الإلكتروني', status.last_ok ? `آخر مزامنة ${Q.dt(status.last_ok)}` : 'لم تتم المزامنة بعد', `<button class="btn" id="sync">${icon('refresh')} مزامنة الآن</button>`);
      const counts = status.counts || {};
      v.innerHTML = `${!status.configured ? `<div class="card card-b" style="margin-bottom:12px;border-color:#f3d9a8;background:var(--warn-bg)">الموقع غير مربوط بعد. اذهب إلى <a href="#/web/settings">إعدادات المتجر الإلكتروني</a> وأدخل الرابط والمفتاح.</div>` : ''}
        ${status.last_error ? `<div class="card card-b err" style="margin-bottom:12px">آخر مزامنة فشلت: ${esc(status.last_error)}</div>` : ''}
        <div class="bar"><div class="seg" id="tabs">${[['new', 'جديد'], ['confirmed', 'مؤكد'], ['shipping', 'قيد التوصيل'], ['delivered', 'تم التسليم'], ['cancelled', 'ملغي'], ['', 'الكل']]
          .map(([k, l]) => `<button data-s="${k}" class="${st.status === k ? 'on' : ''}">${l}${k && counts[k] ? ` <span class="faint">(${counts[k]})</span>` : ''}</button>`).join('')}</div>
          <input class="input search" id="q" placeholder="رقم الطلب، الاسم، الهاتف…"><span class="sp"></span><span class="muted" id="sm"></span></div>
        <div class="card tbl-wrap" id="list"></div>`;
      const load = async () => {
        const rows = await Q.get('/web/orders' + Q.qs(st));
        Q.$('#sm').innerHTML = `${rows.length} طلب · <b>${fmt(ERP.sum(rows, 'total'))}</b>`;
        Q.$('#list').innerHTML = T([{ k: 'no', t: 'رقم الطلب', f: (x) => `<b class="mono">${esc(x)}</b>` }, { k: 'created_at', t: 'الوقت', f: (x) => lt(x) },
          { k: 'name', t: 'الزبون', f: (x, r) => `<b>${esc(x)}</b><div class="faint" dir="ltr" style="text-align:right">${esc(r.phone)}</div>` },
          { k: 'governorate', t: 'المحافظة', f: (x, r) => `${esc(x || '')}<div class="faint">${esc(r.city || '')}</div>` },
          { k: 'items', t: 'القطع', cls: 'n', f: (x) => x.reduce((s, i) => s + Number(i.qty), 0) }, { k: 'total', t: 'الإجمالي', n: 1 },
          { k: 'status', t: 'الحالة', f: (x, r) => tag(x) + (r.invoice_number ? ` <span class="faint mono">${r.invoice_number}</span>` : '') }], rows, { click: 1, empty: 'لا توجد طلبات' });
        ERP.bindRows(Q.$('#list'), rows, (r) => orderDlg(r, load));
      };
      Q.$$('#tabs button').forEach((b) => (b.onclick = () => { st.status = b.dataset.s; Q.$$('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); load(); }));
      Q.$('#q').oninput = Q.debounce((e) => { st.q = e.target.value; load(); });
      Q.$('#sync').onclick = async (e) => {
        e.target.disabled = true;
        try { const r = await Q.post('/web/sync'); Q.toast(`تمت المزامنة: ${r.products} منتج، ${r.orders} طلب جديد، ${r.images} صورة`, 'ok'); ERP.reload(); }
        catch (er) { Q.err(er); e.target.disabled = false; }
      };
      load(); ERP.webBadge();
    },
  });

  function orderDlg(o, after) {
    const nx = NEXT[o.status];
    const m = Q.modal({
      title: `طلب ${o.no}`, width: 680,
      body: `<div class="fgrid c3" style="margin-bottom:12px">
          <div><div class="muted">الزبون</div><b>${esc(o.name)}</b><div dir="ltr" style="text-align:right"><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></div></div>
          <div><div class="muted">العنوان</div><b>${esc(o.governorate || '')}</b> — ${esc(o.city || '')}<div>${esc(o.address || '')}</div></div>
          <div><div class="muted">الحالة</div>${tag(o.status)}<div class="faint" style="margin-top:4px">${lt(o.created_at)}</div></div></div>
        ${o.notes ? `<div class="card card-b" style="margin-bottom:10px;background:var(--warn-bg)"><b>ملاحظة الزبون:</b> ${esc(o.notes)}</div>` : ''}
        ${T([{ k: 'name', t: 'المنتج', f: (x) => `<b>${esc(x)}</b>` }, { k: 'qty', t: 'الكمية', cls: 'n', f: Q.qty }, { k: 'price', t: 'السعر', n: 1 }, { k: 'total', t: 'الإجمالي', cls: 'n', f: (x, i) => fmt(i.price * i.qty) }], o.items)}
        <div class="totals" style="max-width:300px;margin-top:10px;margin-right:auto">
          <div class="kv"><span>المنتجات</span><b>${fmt(o.subtotal)}</b></div><div class="kv"><span>التوصيل</span><b>${fmt(o.delivery_fee)}</b></div>
          <div class="kv grand"><span>المطلوب من الزبون</span><span>${fmt(o.total)}</span></div></div>
        ${o.invoice_number ? `<div style="margin-top:10px">الفاتورة: <a href="#/invoice/${o.invoice_id}" data-close>${o.invoice_number}</a></div>` : ''}
        <label class="f" style="margin-top:12px"><span>ملاحظات داخلية</span><input class="input" id="sn" value="${esc(o.staff_notes || '')}"></label>
        ${nx?.[0] === 'delivered' ? `<div class="row" style="margin-top:10px"><span class="muted">طريقة استلام المبلغ:</span><select class="input" id="pay" style="width:200px"><option value="cash">نقدي (الدفع عند الاستلام)</option><option value="card">تحويل / بطاقة</option><option value="credit">آجل على الزبون</option></select></div>
          <div class="faint" style="font-size:12px;margin-top:4px">عند التسليم تُصدر فاتورة مبيعات تلقائياً ويُخصم المخزون. أجور التوصيل لا تدخل في الفاتورة.</div>` : ''}`,
      foot: `${nx ? `<button class="btn primary" data-next>${icon('check')} ${nx[1]}</button>` : ''}
        <a class="btn" href="${waLink(o.phone, `مرحباً ${o.name}، بخصوص طلبك ${o.no} من ${Q.settings.store.name}`)}" target="_blank">واتساب</a>
        <button class="btn" data-print>${icon('printer')} قسيمة التوصيل</button>
        <span class="sp"></span>${['new', 'confirmed', 'shipping'].includes(o.status) ? '<button class="btn danger" data-cancel>إلغاء الطلب</button>' : ''}`,
    });
    const set = async (status) => {
      try {
        await Q.put('/web/orders/' + o.id, { status, payment: m.$('#pay')?.value, staff_notes: m.$('#sn').value });
        m.close(); Q.toast('تم تحديث الطلب', 'ok'); after?.(); ERP.webBadge();
      } catch (e) { Q.err(e); }
    };
    m.$('[data-next]') && (m.$('[data-next]').onclick = () => set(nx[0]));
    m.$('[data-cancel]') && (m.$('[data-cancel]').onclick = async () => { if (await Q.confirm('إلغاء هذا الطلب؟ ستعود الكميات المحجوزة للمتجر.', { danger: true, ok: 'إلغاء الطلب' })) set('cancelled'); });
    m.$('[data-close]') && (m.$('[data-close]').onclick = () => m.close());
    m.$('[data-print]').onclick = () => Q.print.run(deliverySlip(o));
  }
  // قسيمة توصيل حرارية تُلصق على الطرد
  function deliverySlip(o) {
    const s = Q.settings, t = s.print_thermal;
    return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>${Q.print.thermalCSS(t)}</style></head><body>
      <div class="c b lg">${esc(s.store.name)}</div><div class="c">قسيمة توصيل — المتجر الإلكتروني</div><div class="hr2"></div>
      <div class="kv"><span>رقم الطلب</span><span class="b">${esc(o.no)}</span></div><div class="kv"><span>التاريخ</span><span>${esc(lt(o.created_at))}</span></div>
      <div class="hr"></div><div class="b lg">${esc(o.name)}</div><div class="b" dir="ltr" style="text-align:right">${esc(o.phone)}</div>
      <div>${esc(o.governorate || '')} — ${esc(o.city || '')}</div><div>${esc(o.address || '')}</div>${o.notes ? `<div class="sm">ملاحظة: ${esc(o.notes)}</div>` : ''}
      <div class="hr"></div><table><tbody>${o.items.map((i) => `<tr class="it"><td>${esc(i.name)}</td><td class="n">× ${Q.qty(i.qty)}</td><td class="n">${fmt(i.price * i.qty)}</td></tr>`).join('')}</tbody></table>
      <div class="kv"><span>المنتجات</span><span>${fmt(o.subtotal)}</span></div><div class="kv"><span>التوصيل</span><span>${fmt(o.delivery_fee)}</span></div>
      <div class="tot kv"><span>المطلوب تحصيله</span><span>${fmt(o.total)} ${esc(s.currency)}</span></div>
      <div class="bc">${Q.print.code128(o.no, { height: 34, module: 1.4 })}</div><div style="height:6mm"></div></body></html>`;
  }

  // ===== منتجات الموقع =====
  // ===== أقسام الموقع والبراندات (مشتركة) =====
  let TAX = null;
  const loadTax = async () => (TAX = await Q.get('/web/taxonomy'));
  const mains = () => TAX.categories.filter((c) => !c.parent_id);
  const subsOf = (id) => TAX.categories.filter((c) => c.parent_id && c.parent_id == id);
  const catName = (id) => TAX.categories.find((c) => c.id == id)?.name || '';
  const brandName = (id) => TAX.brands.find((b) => b.id == id)?.name || '';
  const thumb = (f, s = 38, r = 6) => (f ? `<img src="/media/${f}" style="width:${s}px;height:${s}px;object-fit:cover;border-radius:${r}px;border:1px solid var(--line);display:block">`
    : `<div style="width:${s}px;height:${s}px;border-radius:${r}px;background:var(--line-2);display:grid;place-items:center;color:var(--faint)">${icon('box', 16)}</div>`);
  const opts = (list, sel, empty) => `<option value="">${empty}</option>` + list.map((x) => `<option value="${x.id}" ${x.id == sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');

  // ===== منتجات الموقع =====
  // بيانات الصنف (الاسم، السعر، المخزون، الباركود) تؤخذ تلقائياً من المتجر — للموقع يُضاف فقط: الوصف، الصور، القسم الرئيسي والفرعي، البراند
  ERP.page('/web/products', {
    title: 'منتجات المتجر الإلكتروني',
    async render(v) {
      ERP.head('منتجات المتجر الإلكتروني', 'الاسم والسعر والمخزون تُؤخذ تلقائياً من أصناف المتجر — أضف للموقع الصور والوصف والقسم والبراند فقط',
        `<a class="btn" href="#/web/catalog">${icon('tag')} الأقسام والبراندات</a><button class="btn primary" id="sync">${icon('refresh')} نشر الآن</button>`);
      const st = { q: '', f: '', cat: '', brand: '' };
      const sel = new Set();
      v.innerHTML = `<div class="bar"><input class="input search" id="q" placeholder="بحث بالاسم أو الباركود…">
        <div class="seg" id="ff"><button data-f="" class="on">الكل</button><button data-f="pub">المنشورة</button><button data-f="unpub">غير المنشورة</button><button data-f="todo">ناقصة البيانات</button></div>
        <select class="input" id="fc"></select><select class="input" id="fb"></select><span class="sp"></span><button class="btn sm" id="pa">نشر كل المتوفر</button></div>
        <div class="card card-b" id="bulk" style="display:none;margin-bottom:10px;align-items:center;gap:8px;flex-wrap:wrap"></div>
        <div class="card tbl-wrap" id="list"></div>`;
      let rows = [];
      const load = async () => { [rows] = await Promise.all([Q.get('/web/products'), loadTax()]); fillFilters(); draw(); };
      const fillFilters = () => {
        Q.$('#fc').innerHTML = `<option value="">كل الأقسام</option><option value="none" ${st.cat === 'none' ? 'selected' : ''}>بدون قسم</option>` + mains().map((c) => `<option value="${c.id}" ${st.cat == c.id ? 'selected' : ''}>${esc(c.name)}</option>`
          + subsOf(c.id).map((s) => `<option value="${s.id}" ${st.cat == s.id ? 'selected' : ''}>&nbsp;&nbsp;↳ ${esc(s.name)}</option>`).join('')).join('');
        Q.$('#fb').innerHTML = `<option value="">كل البراندات</option><option value="none" ${st.brand === 'none' ? 'selected' : ''}>بدون براند</option>` + TAX.brands.map((b) => `<option value="${b.id}" ${st.brand == b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
      };
      const missing = (p) => [!p.web_images.length && 'صور', !(p.web_description || '').trim() && 'وصف', !p.web_cat_id && 'قسم', !p.web_brand_id && 'براند'].filter(Boolean);
      const filtered = () => {
        const q = st.q.toLowerCase();
        return rows.filter((p) => (!q || p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q))
          && (st.f === 'pub' ? p.web_published : st.f === 'unpub' ? !p.web_published : st.f === 'todo' ? missing(p).length : true)
          && (!st.cat || (st.cat === 'none' ? !p.web_cat_id : p.web_cat_id == st.cat || p.web_sub_id == st.cat))
          && (!st.brand || (st.brand === 'none' ? !p.web_brand_id : p.web_brand_id == st.brand)));
      };
      const drawBulk = () => {
        const b = Q.$('#bulk');
        if (!sel.size) { b.style.display = 'none'; return; }
        b.style.display = 'flex';
        b.innerHTML = `<b>${sel.size} محدد</b><button class="btn sm" data-b="pub1">${icon('check', 14)} نشر</button><button class="btn sm" data-b="pub0">إخفاء من الموقع</button>
          <select class="input sm" id="bc" style="width:auto"><option value="">تعيين قسم…</option>${mains().map((c) => `<option value="${c.id}">${esc(c.name)}</option>` + subsOf(c.id).map((s) => `<option value="s${s.id}">&nbsp;&nbsp;↳ ${esc(s.name)}</option>`).join('')).join('')}<option value="0">— بدون قسم</option></select>
          <select class="input sm" id="bb" style="width:auto"><option value="">تعيين براند…</option>${TAX.brands.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}<option value="0">— بدون براند</option></select>
          <button class="btn sm" data-b="feat1">مميز</button><button class="btn sm" data-b="new1">جديد</button><span class="sp"></span><button class="btn sm" data-b="clr">إلغاء التحديد</button>`;
        const ids = [...sel];
        const act = async (body) => { try { await Q.post('/web/products/bulk', { ids, ...body }); Q.toast('تم التحديث', 'ok'); await load(); } catch (e) { Q.err(e); } };
        Q.$$('[data-b]', b).forEach((x) => (x.onclick = () => {
          const k = x.dataset.b;
          if (k === 'clr') { sel.clear(); draw(); return; }
          act({ pub1: { field: 'publish', value: true }, pub0: { field: 'publish', value: false }, feat1: { field: 'featured', value: true }, new1: { field: 'new', value: true } }[k]);
        }));
        Q.$('#bc').onchange = (e) => { const val = e.target.value; if (val === '') return; act(val.startsWith('s') ? { field: 'category', sub: Number(val.slice(1)) } : { field: 'category', value: Number(val) || null }); };
        Q.$('#bb').onchange = (e) => { if (e.target.value === '') return; act({ field: 'brand', value: Number(e.target.value) || null }); };
      };
      const draw = () => {
        const list = filtered();
        Q.$('#list').innerHTML = T([
          { k: 'id', t: `<label class="chk"><input type="checkbox" id="all" ${list.length && list.every((p) => sel.has(p.id)) ? 'checked' : ''}></label>`, f: (x) => `<label class="chk"><input type="checkbox" data-s="${x}" ${sel.has(x) ? 'checked' : ''}></label>` },
          { k: 'web_images', t: '', f: (x) => thumb(x[0]) },
          { k: 'name', t: 'المنتج (من المتجر)', f: (x, p) => `<b>${esc(x)}</b><div class="faint">${esc(p.barcode || '')}${p.web_images.length > 1 ? ` · ${p.web_images.length} صور` : ''}</div>` },
          { k: 'web_cat_id', t: 'القسم في الموقع', f: (x, p) => x ? `${esc(catName(x))}${p.web_sub_id ? `<div class="faint">↳ ${esc(catName(p.web_sub_id))}</div>` : ''}` : '<span class="faint">—</span>' },
          { k: 'web_brand_id', t: 'البراند', f: (x) => (x ? esc(brandName(x)) : '<span class="faint">—</span>') },
          { k: 'price', t: 'السعر', cls: 'n', f: (x, p) => `${fmt(x)}${p.web_compare_price > x ? `<div class="faint" style="text-decoration:line-through">${fmt(p.web_compare_price)}</div>` : ''}` },
          { k: 'stock', t: 'المتاح', cls: 'n', f: (x, p) => `<span class="${x - p.reserved <= 0 ? 'err' : ''}">${Q.qty(Math.max(0, x - p.reserved))}</span>${p.reserved ? `<div class="faint">محجوز ${Q.qty(p.reserved)}</div>` : ''}` },
          { k: 'web_published', t: 'منشور', f: (x, p) => `<label class="chk"><input type="checkbox" data-t="web_published" data-id="${p.id}" ${x ? 'checked' : ''}></label>` },
          { k: 'web_featured', t: 'مميز', f: (x, p) => `<label class="chk"><input type="checkbox" data-t="web_featured" data-id="${p.id}" ${x ? 'checked' : ''}></label>` },
          { k: 'web_new', t: 'جديد', f: (x, p) => `<label class="chk"><input type="checkbox" data-t="web_new" data-id="${p.id}" ${x ? 'checked' : ''}></label>` },
          { k: 'id', t: 'الحالة', f: (x, p) => { const m = missing(p); return m.length ? `<span class="tag warn" title="ينقص: ${m.join('، ')}">ينقص ${m.join('، ')}</span>` : '<span class="tag ok">مكتمل</span>'; } },
          { k: 'id', t: '', cls: 'act', f: (x) => `<button class="btn sm" data-ed="${x}">${icon('edit', 14)} تعديل</button>` },
        ], list, { empty: 'لا توجد أصناف مطابقة' });
        Q.$$('#list [data-t]').forEach((c) => (c.onchange = async () => {
          try { await Q.put('/web/products/' + c.dataset.id, { [c.dataset.t]: c.checked }); rows.find((r) => r.id == c.dataset.id)[c.dataset.t] = c.checked ? 1 : 0; } catch (e) { Q.err(e); c.checked = !c.checked; }
        }));
        Q.$$('#list [data-s]').forEach((c) => (c.onchange = () => { const id = Number(c.dataset.s); c.checked ? sel.add(id) : sel.delete(id); drawBulk(); }));
        const all = Q.$('#all'); if (all) all.onchange = () => { list.forEach((p) => (all.checked ? sel.add(p.id) : sel.delete(p.id))); draw(); };
        Q.$$('#list [data-ed]').forEach((b) => (b.onclick = () => { const i = list.findIndex((r) => r.id == b.dataset.ed); editWeb(list, i, load); }));
        drawBulk();
      };
      Q.$('#q').oninput = Q.debounce((e) => { st.q = e.target.value; draw(); }, 150);
      Q.$('#fc').onchange = (e) => { st.cat = e.target.value; draw(); };
      Q.$('#fb').onchange = (e) => { st.brand = e.target.value; draw(); };
      Q.$$('#ff button').forEach((b) => (b.onclick = () => { st.f = b.dataset.f; Q.$$('#ff button').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
      Q.$('#pa').onclick = async () => {
        const ids = rows.filter((p) => p.stock > 0 && !p.web_published).map((p) => p.id);
        if (!ids.length) return Q.toast('كل الأصناف المتوفرة منشورة');
        if (!(await Q.confirm(`نشر ${ids.length} صنف متوفر في الموقع؟`))) return;
        await Q.post('/web/products/bulk', { ids, field: 'publish', value: true }); load();
      };
      Q.$('#sync').onclick = async (e) => {
        e.target.disabled = true;
        try { const r = await Q.post('/web/sync'); Q.toast(`تم النشر: ${r.products} منتج في الموقع`, 'ok'); } catch (er) { Q.err(er); }
        e.target.disabled = false;
      };
      load();
    },
  });

  // ضغط الصورة قبل الرفع (حد 1400 بكسل) لسرعة الموقع
  ERP.pickImages = (multiple = true, max = 1400) => new Promise((resolve) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = multiple;
    inp.onchange = async () => {
      const out = [];
      for (const file of inp.files) {
        try {
          const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          const r = await Q.post('/web/media', { data: c.toDataURL('image/jpeg', 0.86) });
          out.push(r.name);
        } catch (e) { Q.err(e); }
      }
      resolve(out);
    };
    inp.click();
  });

  // نافذة تعديل المنتج في الموقع — مع التنقل للتالي/السابق لإدخال سريع
  function editWeb(list, idx, after) {
    const p = list[idx];
    let imgs = [...p.web_images];
    const m = Q.modal({
      title: 'المنتج في الموقع', width: 760,
      body: `<div class="card card-b" style="display:flex;gap:14px;align-items:center;background:var(--bg-2,#f7f7f8);margin-bottom:12px">
          ${thumb(imgs[0], 54, 8)}<div style="flex:1;min-width:0"><b style="font-size:15px">${esc(p.name)}</b>
          <div class="faint">من المتجر تلقائياً: السعر <b>${fmt(p.price)}</b> · المتاح <b>${Q.qty(Math.max(0, p.stock - p.reserved))}</b>${p.barcode ? ` · الباركود ${esc(p.barcode)}` : ''}${p.category ? ` · تصنيف المخزون: ${esc(p.category)}` : ''}</div></div>
          <span class="faint">${idx + 1} / ${list.length}</span></div>
        <div class="fgrid c3">
          <label class="f"><span>القسم الرئيسي</span><select class="input" id="wcat">${opts(mains(), p.web_cat_id, '— اختر —')}</select></label>
          <label class="f"><span>القسم الفرعي</span><select class="input" id="wsub"></select></label>
          <label class="f"><span>البراند</span><div class="row" style="gap:6px"><select class="input" id="wbr" style="flex:1">${opts(TAX.brands, p.web_brand_id, '— بدون —')}</select><button class="btn icon" id="nbr" title="براند جديد">${icon('plus', 14)}</button></div></label>
        </div>
        <div class="sec-t">الصور <span class="faint">(الأولى هي الرئيسية — اسحب للترتيب، حتى 10 صور)</span></div><div id="ims" class="row wrap" style="gap:8px"></div>
        <div class="sec-t">الوصف</div><textarea class="input" id="wd" style="min-height:130px" placeholder="وصف المنتج، المكونات، طريقة الاستخدام، الحجم…">${esc(p.web_description || '')}</textarea>
        <div class="fgrid" style="margin-top:12px"><label class="f"><span>السعر قبل الخصم (اختياري)</span><input class="input num" type="number" id="wc" value="${p.web_compare_price || ''}" placeholder="مثال: ${fmt(p.price * 1.2, 0)}"><small class="faint">يظهر مشطوباً مع نسبة الخصم</small></label>
        <div class="chk-list" style="align-self:center"><label class="chk"><input type="checkbox" id="wp" ${p.web_published ? 'checked' : ''}> منشور في الموقع</label><label class="chk"><input type="checkbox" id="wf" ${p.web_featured ? 'checked' : ''}> مميز</label><label class="chk"><input type="checkbox" id="wn" ${p.web_new ? 'checked' : ''}> وصل حديثاً</label></div></div>`,
      foot: `<button class="btn primary" data-ok>حفظ</button>${idx < list.length - 1 ? '<button class="btn" data-next>حفظ والتالي ←</button>' : ''}${idx > 0 ? '<button class="btn" data-prev>→ السابق</button>' : ''}<button class="btn" data-c>إلغاء</button>`,
    });
    const fillSub = (sel) => { const s = subsOf(m.$('#wcat').value); m.$('#wsub').innerHTML = opts(s, sel, s.length ? '— بدون —' : 'لا توجد أقسام فرعية'); m.$('#wsub').disabled = !s.length; };
    fillSub(p.web_sub_id);
    m.$('#wcat').onchange = () => fillSub(null);
    m.$('#nbr').onclick = async () => {
      const name = prompt('اسم البراند الجديد'); if (!name || !name.trim()) return;
      try { const b = await Q.post('/web/brands', { name: name.trim() }); TAX.brands.push(b); m.$('#wbr').innerHTML = opts(TAX.brands, b.id, '— بدون —'); } catch (e) { Q.err(e); }
    };
    let dragI = null;
    const draw = () => {
      m.$('#ims').innerHTML = imgs.map((f, i) => `<div draggable="true" data-i="${i}" style="position:relative;width:96px;height:96px;border:1px solid var(--line);border-radius:6px;overflow:hidden;cursor:grab;${i === 0 ? 'outline:2px solid var(--accent)' : ''}">
          <img src="/media/${f}" style="width:100%;height:100%;object-fit:cover"><button class="btn sm icon" data-rm="${i}" style="position:absolute;top:3px;left:3px;width:24px;height:24px;background:#fffd">${icon('x', 12)}</button></div>`).join('')
        + (imgs.length < 10 ? `<button class="btn" id="add" style="width:96px;height:96px;justify-content:center;flex-direction:column">${icon('plus', 18)}<span style="font-size:11px">إضافة صور</span></button>` : '');
      m.$$('[data-rm]').forEach((b) => (b.onclick = () => { imgs.splice(b.dataset.rm, 1); draw(); }));
      m.$$('[draggable]').forEach((el) => {
        el.ondragstart = () => (dragI = Number(el.dataset.i));
        el.ondragover = (e) => e.preventDefault();
        el.ondrop = () => { const to = Number(el.dataset.i); const [x] = imgs.splice(dragI, 1); imgs.splice(to, 0, x); draw(); };
      });
      const add = m.$('#add'); if (add) add.onclick = async () => { const n = await ERP.pickImages(true); imgs.push(...n); imgs = imgs.slice(0, 10); draw(); };
    };
    draw();
    const save = async () => {
      await Q.put('/web/products/' + p.id, { web_images: imgs, web_description: m.$('#wd').value, web_compare_price: Number(m.$('#wc').value) || null,
        web_published: m.$('#wp').checked, web_featured: m.$('#wf').checked, web_new: m.$('#wn').checked,
        web_cat_id: Number(m.$('#wcat').value) || null, web_sub_id: Number(m.$('#wsub').value) || null, web_brand_id: Number(m.$('#wbr').value) || null });
      Object.assign(p, { web_images: imgs, web_description: m.$('#wd').value, web_cat_id: Number(m.$('#wcat').value) || null, web_sub_id: Number(m.$('#wsub').value) || null,
        web_brand_id: Number(m.$('#wbr').value) || null, web_compare_price: Number(m.$('#wc').value) || null, web_published: m.$('#wp').checked ? 1 : 0, web_featured: m.$('#wf').checked ? 1 : 0, web_new: m.$('#wn').checked ? 1 : 0 });
    };
    m.$('[data-c]').onclick = () => { m.close(); after?.(); };
    m.$('[data-ok]').onclick = async () => { try { await save(); m.close(); Q.toast('تم الحفظ — يظهر في الموقع خلال ثوانٍ', 'ok'); after?.(); } catch (e) { Q.err(e); } };
    const nx = m.$('[data-next]'); if (nx) nx.onclick = async () => { try { await save(); m.close(); editWeb(list, idx + 1, after); } catch (e) { Q.err(e); } };
    const pv = m.$('[data-prev]'); if (pv) pv.onclick = async () => { try { await save(); m.close(); editWeb(list, idx - 1, after); } catch (e) { Q.err(e); } };
  }

  // ===== إدارة الأقسام (رئيسي ← فرعي) والبراندات =====
  ERP.page('/web/catalog', {
    title: 'أقسام الموقع والبراندات',
    async render(v) {
      ERP.head('أقسام الموقع والبراندات', 'أقسام رئيسية وفرعية خاصة بالموقع، والبراندات — تظهر للزبائن للتصفح والتصفية');
      v.innerHTML = `<div class="set-grid half"><div class="card"><div class="card-h"><b>الأقسام</b><span class="sp"></span><button class="btn sm primary" id="ac">${icon('plus', 14)} قسم رئيسي</button></div><div id="cats"></div></div>
        <div class="card"><div class="card-h"><b>البراندات</b><span class="sp"></span><button class="btn sm primary" id="ab">${icon('plus', 14)} براند</button></div><div id="brs"></div></div></div>`;
      const draw = async () => {
        await loadTax();
        const row = (c, sub) => `<div class="row" style="gap:10px;align-items:center;padding:8px 14px;border-top:1px solid var(--line);${sub ? 'padding-inline-start:46px;background:var(--bg-2,#fafafa)' : ''}">
          ${thumb(c.image, sub ? 30 : 40)}<div style="flex:1;min-width:0"><b>${sub ? '↳ ' : ''}${esc(c.name)}</b><div class="faint">${c.n} صنف · ${c.pub} منشور${c.sort ? ` · ترتيب ${c.sort}` : ''}</div></div>
          ${sub ? '' : `<button class="btn sm" data-addsub="${c.id}">${icon('plus', 12)} فرعي</button>`}<button class="btn sm" data-ec="${c.id}">${icon('edit', 12)}</button><button class="btn sm" data-dc="${c.id}">${icon('trash', 12)}</button></div>`;
        Q.$('#cats').innerHTML = mains().length ? mains().map((c) => row(c) + subsOf(c.id).map((s) => row(s, true)).join('')).join('') : '<div class="empty">لا توجد أقسام بعد</div>';
        Q.$('#brs').innerHTML = TAX.brands.length ? TAX.brands.map((b) => `<div class="row" style="gap:10px;align-items:center;padding:8px 14px;border-top:1px solid var(--line)">${thumb(b.logo, 40, 20)}
          <div style="flex:1"><b>${esc(b.name)}</b><div class="faint">${b.n} صنف</div></div><button class="btn sm" data-eb="${b.id}">${icon('edit', 12)}</button><button class="btn sm" data-db="${b.id}">${icon('trash', 12)}</button></div>`).join('') : '<div class="empty">لا توجد براندات بعد</div>';
        Q.$$('[data-ec]').forEach((b) => (b.onclick = () => editCat(TAX.categories.find((c) => c.id == b.dataset.ec))));
        Q.$$('[data-addsub]').forEach((b) => (b.onclick = () => editCat({ parent_id: Number(b.dataset.addsub) })));
        Q.$$('[data-dc]').forEach((b) => (b.onclick = async () => {
          const c = TAX.categories.find((x) => x.id == b.dataset.dc);
          if (!(await Q.confirm(`حذف القسم «${c.name}»${c.parent_id ? '' : ' وأقسامه الفرعية'}؟ الأصناف لن تُحذف، فقط تُزال من هذا القسم.`))) return;
          try { await Q.del('/web/categories/' + c.id); draw(); } catch (e) { Q.err(e); }
        }));
        Q.$$('[data-eb]').forEach((b) => (b.onclick = () => editBrand(TAX.brands.find((x) => x.id == b.dataset.eb))));
        Q.$$('[data-db]').forEach((b) => (b.onclick = async () => {
          const x = TAX.brands.find((y) => y.id == b.dataset.db);
          if (!(await Q.confirm(`حذف البراند «${x.name}»؟ الأصناف لن تُحذف.`))) return;
          try { await Q.del('/web/brands/' + x.id); draw(); } catch (e) { Q.err(e); }
        }));
      };
      const imgModal = ({ title, item, imgKey, round, save }) => {
        let img = item[imgKey] || null;
        const m = Q.modal({
          title, width: 460,
          body: `<div class="fgrid"><label class="f full"><span>الاسم *</span><input class="input" id="n" value="${esc(item.name || '')}"></label>
            <label class="f"><span>الترتيب</span><input class="input num" type="number" id="s" value="${item.sort || 0}"><small class="faint">الأصغر يظهر أولاً</small></label>
            <div class="f"><span>الصورة</span><div class="row" style="gap:8px;align-items:center"><span id="im"></span><button class="btn sm" id="pk">اختيار</button><button class="btn sm" id="rmv">إزالة</button></div></div></div>`,
          foot: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-c>إلغاء</button>',
        });
        const di = () => { m.$('#im').innerHTML = thumb(img, 48, round ? 24 : 8); };
        di();
        m.$('#pk').onclick = async () => { const [n] = await ERP.pickImages(false, 800); if (n) { img = n; di(); } };
        m.$('#rmv').onclick = () => { img = null; di(); };
        m.$('[data-c]').onclick = m.close;
        m.$('[data-ok]').onclick = async () => { try { await save({ name: m.$('#n').value, sort: Number(m.$('#s').value) || 0, [imgKey]: img }); m.close(); draw(); } catch (e) { Q.err(e); } };
        setTimeout(() => m.$('#n').focus(), 50);
      };
      const editCat = (c) => imgModal({ title: c.id ? 'تعديل القسم' : c.parent_id ? `قسم فرعي في «${catName(c.parent_id)}»` : 'قسم رئيسي جديد', item: c, imgKey: 'image',
        save: (b) => (c.id ? Q.put('/web/categories/' + c.id, b) : Q.post('/web/categories', { ...b, parent_id: c.parent_id || null })) });
      const editBrand = (b) => imgModal({ title: b.id ? 'تعديل البراند' : 'براند جديد', item: b, imgKey: 'logo', round: true,
        save: (x) => (b.id ? Q.put('/web/brands/' + b.id, x) : Q.post('/web/brands', x)) });
      Q.$('#ac').onclick = () => editCat({});
      Q.$('#ab').onclick = () => editBrand({});
      draw();
    },
  });

  // ===== بنرات الموقع =====
  const PLACES = { hero: ['السلايدر الرئيسي', 'أعلى الصفحة الرئيسية — يتبدل تلقائياً', 'كمبيوتر 2400×800 · هاتف 1080×740'], mid: ['بنر عريض', 'وسط الصفحة الرئيسية بعد المختارات', 'كمبيوتر 2000×500 · هاتف 1080×540'], tiles: ['بطاقات ترويجية', 'مربعات صغيرة بعد العروض (2 أو 4 بجانب بعض)', 'مربعة 1000×1000'] };
  const LINKS = [['none', 'بدون رابط'], ['offers', 'صفحة العروض'], ['new', 'وصل حديثاً'], ['shop', 'كل المنتجات'], ['category', 'قسم'], ['brand', 'براند'], ['product', 'منتج'], ['url', 'رابط مخصص']];
  ERP.page('/web/banners', {
    title: 'بنرات الموقع',
    async render(v) {
      ERP.head('بنرات الموقع', 'صور ترويجية احترافية للصفحة الرئيسية — مع صورة خاصة للهاتف وجدولة تلقائية', `<button class="btn primary" id="nb">${icon('plus')} بنر جديد</button>`);
      let rows = [], prods = [];
      const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
      const state = (b) => !b.active ? ['متوقف', ''] : b.ends && b.ends < today ? ['منتهي', 'err'] : b.starts && b.starts > today ? ['مجدول', 'info'] : ['يظهر الآن', 'ok'];
      const linkText = (b) => {
        const l = LINKS.find((x) => x[0] === b.link_type)?.[1] || '';
        if (b.link_type === 'category') return `قسم: ${catName(b.link_value) || '؟'}`;
        if (b.link_type === 'brand') return `براند: ${brandName(b.link_value) || '؟'}`;
        if (b.link_type === 'product') return `منتج: ${prods.find((p) => p.id == b.link_value)?.name || '؟'}`;
        if (b.link_type === 'url') return b.link_value;
        return l;
      };
      const draw = () => {
        v.innerHTML = Object.entries(PLACES).map(([k, [t, d, sz]]) => {
          const list = rows.filter((b) => b.place === k);
          return `<div class="card" style="margin-bottom:14px"><div class="card-h"><b>${t}</b><span class="faint">${d} · المقاس المقترح: ${sz}</span><span class="sp"></span><button class="btn sm" data-new="${k}">${icon('plus', 14)} إضافة</button></div>
            ${list.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${k === 'tiles' ? 190 : 300}px,1fr));gap:12px;padding:14px" data-place="${k}">${list.map((b) => { const [stt, cls] = state(b); return `<div draggable="true" data-id="${b.id}" style="border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff;cursor:grab">
              <div style="position:relative;aspect-ratio:${k === 'hero' ? '3/1' : k === 'mid' ? '4/1' : '1/1'};background:var(--line-2)"><img src="/media/${b.image}" style="width:100%;height:100%;object-fit:cover;${b.active ? '' : 'filter:grayscale(1);opacity:.6'}">
                ${b.title ? `<div style="position:absolute;inset:auto 0 0 0;padding:8px 10px;background:linear-gradient(transparent,#0009);color:#fff;font-weight:600;font-size:13px">${esc(b.title)}</div>` : ''}
                <span class="tag ${cls}" style="position:absolute;top:6px;right:6px">${stt}</span>${b.image_m ? `<span class="tag" style="position:absolute;top:6px;left:6px">${icon('phone', 11)} صورة هاتف</span>` : ''}</div>
              <div style="padding:8px 10px;display:flex;align-items:center;gap:6px"><div style="flex:1;min-width:0;font-size:12px" class="faint">${esc(linkText(b))}${b.starts || b.ends ? `<br>${b.starts || '…'} ← ${b.ends || '…'}` : ''}</div>
                <label class="chk" title="ظاهر"><input type="checkbox" data-act="${b.id}" ${b.active ? 'checked' : ''}></label><button class="btn sm" data-ed="${b.id}">${icon('edit', 12)}</button><button class="btn sm" data-del="${b.id}">${icon('trash', 12)}</button></div></div>`; }).join('')}</div>`
            : `<div class="empty" style="padding:22px">لا توجد بنرات — ${k === 'hero' ? 'سيظهر الغلاف الافتراضي من إعدادات محتوى الموقع' : 'هذا القسم لن يظهر في الموقع'}</div>`}</div>`;
        }).join('') + `<div class="faint" style="font-size:12px">اسحب البنرات لتغيير ترتيبها. التغييرات تظهر في الموقع خلال ثوانٍ.</div>`;
        Q.$$('[data-new]').forEach((b) => (b.onclick = () => edit({ place: b.dataset.new, active: 1, link_type: 'none', theme: 'dark' })));
        Q.$$('[data-ed]').forEach((b) => (b.onclick = () => edit(rows.find((r) => r.id == b.dataset.ed))));
        Q.$$('[data-del]').forEach((b) => (b.onclick = async () => { if (!(await Q.confirm('حذف هذا البنر؟'))) return; try { await Q.del('/web/banners/' + b.dataset.del); load(); } catch (e) { Q.err(e); } }));
        Q.$$('[data-act]').forEach((c) => (c.onchange = async () => { const b = rows.find((r) => r.id == c.dataset.act); try { await Q.put('/web/banners/' + b.id, { ...b, active: c.checked }); load(); } catch (e) { Q.err(e); c.checked = !c.checked; } }));
        let drag = null;
        Q.$$('[data-place] [draggable]').forEach((el) => {
          el.ondragstart = () => { drag = el; };
          el.ondragover = (e) => { e.preventDefault(); };
          el.ondrop = async (e) => {
            e.preventDefault(); if (!drag || drag === el || drag.parentElement !== el.parentElement) return;
            const box = el.parentElement, items = [...box.children];
            box.insertBefore(drag, items.indexOf(drag) < items.indexOf(el) ? el.nextSibling : el);
            try { await Q.post('/web/banners/order', { ids: [...box.children].map((x) => Number(x.dataset.id)) }); load(); } catch (er) { Q.err(er); }
          };
        });
      };
      const load = async () => { [rows] = await Promise.all([Q.get('/web/banners'), loadTax()]); draw(); };
      const edit = async (b) => {
        if (!prods.length) prods = await Q.get('/web/products');
        let img = b.image || null, imgM = b.image_m || null;
        const m = Q.modal({
          title: b.id ? 'تعديل البنر' : 'بنر جديد', width: 720,
          body: `<div class="fgrid">
              <label class="f"><span>المكان</span><select class="input" id="pl">${Object.entries(PLACES).map(([k, [t]]) => `<option value="${k}" ${b.place === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
              <label class="f"><span>لون النص</span><select class="input" id="th"><option value="dark" ${b.theme !== 'light' ? 'selected' : ''}>نص أبيض (صورة داكنة)</option><option value="light" ${b.theme === 'light' ? 'selected' : ''}>نص داكن (صورة فاتحة)</option></select></label>
            </div>
            <div class="sec-t">الصور <span class="faint" id="sz"></span></div>
            <div class="row" style="gap:12px;align-items:flex-start;flex-wrap:wrap">
              <div><div class="faint" style="font-size:12px;margin-bottom:4px">صورة الكمبيوتر *</div><div id="pi"></div><div class="row" style="gap:6px;margin-top:6px"><button class="btn sm" id="pk">اختيار</button></div></div>
              <div><div class="faint" style="font-size:12px;margin-bottom:4px">صورة الهاتف (اختياري — أوضح على الشاشات الصغيرة)</div><div id="pm"></div><div class="row" style="gap:6px;margin-top:6px"><button class="btn sm" id="pkm">اختيار</button><button class="btn sm" id="rmm">إزالة</button></div></div>
            </div>
            <div class="sec-t">النص على البنر <span class="faint">(اختياري — اتركه فارغاً إن كان التصميم يحتوي النص)</span></div>
            <div class="fgrid"><label class="f"><span>العنوان</span><input class="input" id="tt" maxlength="120" value="${esc(b.title || '')}" placeholder="مثال: خصومات الشتاء حتى 40٪"></label>
              <label class="f"><span>نص الزر</span><input class="input" id="ct" maxlength="40" value="${esc(b.cta || '')}" placeholder="مثال: تسوّقي الآن"></label>
              <label class="f full"><span>وصف قصير</span><input class="input" id="st" maxlength="240" value="${esc(b.subtitle || '')}"></label></div>
            <div class="sec-t">عند الضغط على البنر</div>
            <div class="fgrid"><label class="f"><span>يذهب إلى</span><select class="input" id="lt">${LINKS.map(([k, l]) => `<option value="${k}" ${b.link_type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="f" id="lvw"><span>الوجهة</span><span id="lvb"></span></label></div>
            <div class="sec-t">الجدولة</div>
            <div class="fgrid c3"><label class="f"><span>يبدأ من</span><input class="input" type="date" id="sd" value="${b.starts || ''}"></label><label class="f"><span>ينتهي في</span><input class="input" type="date" id="ed" value="${b.ends || ''}"></label>
              <label class="chk" style="align-self:end;height:32px"><input type="checkbox" id="ac" ${b.active !== 0 ? 'checked' : ''}> ظاهر في الموقع</label></div>`,
          foot: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-c>إلغاء</button>',
        });
        const ratio = () => ({ hero: '3/1', mid: '4/1', tiles: '1/1' }[m.$('#pl').value]);
        const di = () => {
          const box = (f, w, r) => (f ? `<img src="/media/${f}" style="width:${w}px;aspect-ratio:${r};object-fit:cover;border-radius:6px;border:1px solid var(--line);display:block">` : `<div style="width:${w}px;aspect-ratio:${r};border-radius:6px;border:1px dashed var(--line);display:grid;place-items:center;color:var(--faint);font-size:12px">لا توجد صورة</div>`);
          m.$('#pi').innerHTML = box(img, 320, ratio());
          m.$('#pm').innerHTML = box(imgM, 150, m.$('#pl').value === 'tiles' ? '1/1' : '3/2');
          m.$('#sz').textContent = '— المقاس المقترح: ' + PLACES[m.$('#pl').value][2];
        };
        const lv = () => {
          const t = m.$('#lt').value, val = b.link_type === t ? b.link_value : '';
          m.$('#lvw').style.display = ['category', 'brand', 'product', 'url'].includes(t) ? '' : 'none';
          m.$('#lvb').innerHTML = t === 'category' ? `<select class="input" id="lv">${mains().map((c) => `<option value="${c.id}" ${c.id == val ? 'selected' : ''}>${esc(c.name)}</option>` + subsOf(c.id).map((s) => `<option value="${s.id}" ${s.id == val ? 'selected' : ''}>&nbsp;&nbsp;↳ ${esc(s.name)}</option>`).join('')).join('')}</select>`
            : t === 'brand' ? `<select class="input" id="lv">${TAX.brands.map((x) => `<option value="${x.id}" ${x.id == val ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`
            : t === 'product' ? `<select class="input" id="lv">${prods.filter((p) => p.web_published).map((p) => `<option value="${p.id}" ${p.id == val ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`
            : t === 'url' ? `<input class="input" id="lv" dir="ltr" placeholder="https://… أو /shop?q=…" value="${esc(val || '')}">` : '';
        };
        di(); lv();
        m.$('#pl').onchange = di; m.$('#lt').onchange = lv;
        m.$('#pk').onclick = async () => { const [n] = await ERP.pickImages(false, 2400); if (n) { img = n; di(); } };
        m.$('#pkm').onclick = async () => { const [n] = await ERP.pickImages(false, 1200); if (n) { imgM = n; di(); } };
        m.$('#rmm').onclick = () => { imgM = null; di(); };
        m.$('[data-c]').onclick = m.close;
        m.$('[data-ok]').onclick = async () => {
          const body = { place: m.$('#pl').value, theme: m.$('#th').value, image: img, image_m: imgM, title: m.$('#tt').value, subtitle: m.$('#st').value, cta: m.$('#ct').value,
            link_type: m.$('#lt').value, link_value: m.$('#lv')?.value || null, starts: m.$('#sd').value || null, ends: m.$('#ed').value || null, active: m.$('#ac').checked, sort: b.sort || 99 };
          try { await (b.id ? Q.put('/web/banners/' + b.id, body) : Q.post('/web/banners', body)); m.close(); Q.toast('تم الحفظ — يظهر في الموقع خلال ثوانٍ', 'ok'); load(); } catch (e) { Q.err(e); }
        };
      };
      Q.$('#nb').onclick = () => edit({ place: 'hero', active: 1, link_type: 'none', theme: 'dark' });
      load();
    },
  });

  // ===== إعدادات الموقع والمحتوى =====
  const GOVS = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء', 'بابل', 'الأنبار', 'ديالى', 'ذي قار', 'كركوك', 'صلاح الدين', 'السليمانية', 'دهوك', 'واسط', 'ميسان', 'القادسية', 'المثنى', 'حلبجة'];
  ERP.page('/web/settings', {
    title: 'إعدادات المتجر الإلكتروني',
    async render(v) {
      const s = await Q.loadSettings();
      const w = s.web, c = s.web_content;
      const isAdmin = ERP.user.role === 'admin';
      ERP.head('إعدادات المتجر الإلكتروني', 'الربط بالموقع ومحتوى الصفحات والتوصيل', isAdmin ? `<button class="btn primary" id="sv">${icon('check')} حفظ ونشر</button>` : '');
      const inp = (id, label, val, extra = '') => `<label class="f"><span>${label}</span><input class="input" id="${id}" value="${esc(val ?? '')}" ${extra}></label>`;
      const area = (id, label, val, h = 90) => `<label class="f full"><span>${label}</span><textarea class="input" id="${id}" style="min-height:${h}px">${esc(val ?? '')}</textarea></label>`;
      v.innerHTML = `<div class="set-grid">
        <div>
          <div class="card"><div class="card-h"><h3>الواجهة الرئيسية</h3></div><div class="card-b fgrid">
            ${inp('tagline', 'الشعار النصي (تحت الاسم)', c.tagline)}${inp('announcement', 'شريط الإعلان أعلى الموقع', c.announcement)}
            ${inp('hero_title', 'عنوان الواجهة', c.hero_title)}${inp('hero_cta', 'نص زر التسوق', c.hero_cta)}
            ${area('hero_subtitle', 'النص التعريفي للواجهة', c.hero_subtitle, 60)}
            <div class="full row" style="gap:12px"><div id="hero" style="width:180px;height:90px;border-radius:6px;border:1px solid var(--line);background:var(--line-2) center/cover"></div>
              <div><div class="b">صورة الواجهة (اختياري)</div><div class="faint" style="font-size:12px">يفضّل صورة عرضية بجودة عالية (1600×800). بدونها يظهر تصميم نصي أنيق.</div>
              <div class="row" style="margin-top:6px"><button class="btn sm" id="hpick">اختيار صورة</button><button class="btn sm danger" id="hrm">إزالة</button></div></div></div>
          </div></div>
          <div class="card" style="margin-top:14px"><div class="card-h"><h3>التواصل</h3><span class="muted">يظهر في الموقع وزر واتساب</span></div><div class="card-b fgrid">
            ${inp('whatsapp', 'رقم واتساب', c.whatsapp, 'placeholder="07xxxxxxxxx" dir="ltr"')}${inp('phone', 'رقم الهاتف', c.phone, 'dir="ltr"')}
            ${inp('instagram', 'رابط انستغرام', c.instagram, 'dir="ltr" placeholder="https://instagram.com/..."')}${inp('facebook', 'رابط فيسبوك', c.facebook, 'dir="ltr"')}
            ${inp('tiktok', 'رابط تيك توك', c.tiktok, 'dir="ltr"')}${inp('email', 'البريد الإلكتروني', c.email, 'dir="ltr"')}
            ${inp('address', 'عنوان المتجر', c.address)}</div></div>
          <div class="card" style="margin-top:14px"><div class="card-h"><h3>الصفحات</h3></div><div class="card-b fgrid">
            ${area('about', 'من نحن', c.about, 110)}${area('policies', 'سياسة الطلب والاستبدال (كل سطر نقطة)', c.policies, 110)}</div></div>
          <div class="card" style="margin-top:14px"><div class="card-h"><h3>التوصيل والطلبات</h3></div><div class="card-b">
            <div class="fgrid c4">${inp('fee_baghdad', 'أجور التوصيل — بغداد', c.fee_baghdad, 'type="number"')}${inp('fee_other', 'أجور التوصيل — باقي المحافظات', c.fee_other, 'type="number"')}
              ${inp('free_over', 'توصيل مجاني للطلبات فوق (0 = لا)', c.free_over, 'type="number"')}${inp('min_order', 'الحد الأدنى للطلب (0 = لا)', c.min_order, 'type="number"')}</div>
            <details style="margin-top:10px"><summary class="muted" style="cursor:pointer">أجور مختلفة لمحافظات محددة</summary>
              <div class="fgrid c4" style="margin-top:8px">${GOVS.map((g) => `<label class="f"><span>${g}</span><input class="input num" type="number" data-gov="${g}" value="${c.fees?.[g] ?? ''}" placeholder="افتراضي"></label>`).join('')}</div></details>
            <div class="divider"></div>
            <label class="chk"><input type="checkbox" id="ordering" ${c.ordering !== false ? 'checked' : ''}> استقبال الطلبات مفعّل</label>
            ${inp('closed_message', 'رسالة عند إيقاف الطلبات', c.closed_message)}
          </div></div>
        </div>
        <div>
          <div class="card"><div class="card-h"><h3>الربط بالموقع</h3><span class="sp"></span><span id="cs"></span></div><div class="card-b">
            ${isAdmin ? `${inp('wurl', 'رابط الموقع', w.url, 'dir="ltr" placeholder="http://..."')}
            <label class="f" style="margin-top:10px"><span>مفتاح المزامنة</span><input class="input mono" id="wkey" type="password" value="${esc(w.key || '')}" dir="ltr"></label>
            <div class="fgrid" style="margin-top:10px"><label class="chk" style="align-self:end;height:32px"><input type="checkbox" id="wen" ${w.enabled ? 'checked' : ''}> مزامنة تلقائية</label>
              <label class="f"><span>كل (ثانية)</span><input class="input num" type="number" id="wint" value="${w.interval || 60}" min="30"></label></div>
            <div class="row" style="margin-top:12px"><button class="btn" id="tst">اختبار الاتصال</button><button class="btn" id="snc">${icon('refresh')} مزامنة الآن</button></div>`
            : `<div class="muted">إعدادات الربط متاحة لمدير النظام فقط.</div>`}
            <div class="divider"></div><div id="sst" class="muted" style="font-size:12.5px;line-height:1.9"></div>
            ${w.url ? `<a class="btn" style="margin-top:10px" href="${esc(w.url)}" target="_blank">${icon('eye')} فتح الموقع</a>` : ''}
          </div></div>
          <div class="card" style="margin-top:14px"><div class="card-b muted" style="font-size:12.5px;line-height:1.9">
            <b style="color:var(--text)">كيف يعمل؟</b><br>• المنتجات المنشورة تُرسل للموقع مع السعر والكمية المتاحة والصور.<br>• طلبات الزبائن تصل هنا تلقائياً مع تنبيه صوتي.<br>
            • عند "تم التسليم" تُصدر فاتورة ويُخصم المخزون.<br>• حالة الطلب تظهر للزبون في صفحة تتبع الطلب.<br>• الكمية المحجوزة لطلبات مفتوحة لا تُعرض للبيع في الموقع.</div></div>
        </div></div>`;
      let hero = c.hero_image || '';
      const drawHero = () => (Q.$('#hero').style.backgroundImage = hero ? `url(/media/${hero})` : '');
      drawHero();
      Q.$('#hpick').onclick = async () => { const [n] = await ERP.pickImages(false); if (n) { hero = n; drawHero(); } };
      Q.$('#hrm').onclick = () => { hero = ''; drawHero(); };
      const showState = async () => {
        const st = await Q.get('/web/status');
        Q.$('#cs').innerHTML = st.configured ? (st.last_error ? '<span class="tag err">خطأ</span>' : st.live ? '<span class="tag ok">متصل مباشرة</span>' : st.last_ok ? '<span class="tag ok">متصل</span>' : '<span class="tag">لم يُختبر</span>') : '<span class="tag warn">غير مربوط</span>';
        Q.$('#sst').innerHTML = `المنتجات المنشورة: <b>${st.published}</b><br>آخر مزامنة ناجحة: <b>${st.last_ok ? Q.dt(st.last_ok) : '—'}</b>${st.last_report ? `<br>آخر تقرير: ${st.last_report.products} منتج، ${st.last_report.orders} طلب جديد، ${st.last_report.images} صورة` : ''}${st.last_error ? `<br><span class="err">${esc(st.last_error)}</span>` : ''}`;
        try { const u = (await Q.get('/settings')).web?.url; if (u && st.configured) Q.$('#sst').insertAdjacentHTML('beforeend', `<br>لوحة التحكم عن بعد (من الهاتف أو أي جهاز): <a href="${esc(u.replace(/\/+$/, ''))}/admin" target="_blank" rel="noopener"><b dir="ltr">${esc(u.replace(/\/+$/, ''))}/admin</b></a> — بنفس حساب المدير`); } catch { /* */ }
      };
      showState();
      const val = (id) => Q.$('#' + id).value;
      const save = async () => {
        const fees = {}; Q.$$('[data-gov]').forEach((el) => { if (el.value !== '') fees[el.dataset.gov] = Number(el.value) || 0; });
        const patch = { web_content: { tagline: val('tagline'), announcement: val('announcement'), hero_title: val('hero_title'), hero_cta: val('hero_cta'), hero_subtitle: val('hero_subtitle'), hero_image: hero,
          whatsapp: val('whatsapp'), phone: val('phone'), instagram: val('instagram'), facebook: val('facebook'), tiktok: val('tiktok'), email: val('email'), address: val('address'),
          about: val('about'), policies: val('policies'), fee_baghdad: Number(val('fee_baghdad')) || 0, fee_other: Number(val('fee_other')) || 0, free_over: Number(val('free_over')) || 0,
          min_order: Number(val('min_order')) || 0, fees, ordering: Q.$('#ordering').checked, closed_message: val('closed_message') } };
        if (Q.$('#wurl')) patch.web = { url: val('wurl').trim().replace(/\/+$/, ''), key: val('wkey').trim(), enabled: Q.$('#wen').checked, interval: Math.max(30, Number(val('wint')) || 60) };
        await Q.put('/settings', patch); await Q.loadSettings();
      };
      if (isAdmin) {
        Q.$('#sv').onclick = async () => {
          try { await save(); Q.toast('تم الحفظ', 'ok'); if (Q.settings.web.url) { const r = await Q.post('/web/sync'); Q.toast(`تم النشر في الموقع (${r.products} منتج)`, 'ok'); } } catch (e) { Q.err(e); }
          showState();
        };
        Q.$('#tst').onclick = async () => {
          try { const r = await Q.post('/web/test', { url: val('wurl').trim(), key: val('wkey').trim() }); Q.toast(`الاتصال ناجح — في الموقع ${r.products} منتج و${r.orders_new} طلب جديد`, 'ok'); } catch (e) { Q.err(e); }
        };
        Q.$('#snc').onclick = async () => { try { await save(); const r = await Q.post('/web/sync'); Q.toast(`تمت المزامنة: ${r.products} منتج، ${r.orders} طلب جديد`, 'ok'); } catch (e) { Q.err(e); } showState(); };
      }
    },
  });
})();
