// شجرة المواد + بطاقة الصنف + صفحة الأصناف بالعائدية
(function () {
  const { esc, fmt, icon } = Q;
  const T = ERP.table;
  const OPEN_KEY = 'tq_tree_open';
  const openSet = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); } catch { return new Set(); } };
  const saveOpen = (s) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s])); } catch { /* */ } };

  // ===== أدوات الشجرة =====
  ERP.cats = async () => Q.get('/categories');
  const kidsOf = (cats, id) => cats.filter((c) => (c.parent_id || null) === (id || null)).sort((a, b) => (a.sort || 0) - (b.sort || 0) || String(a.code || '').localeCompare(String(b.code || '')) || a.name.localeCompare(b.name));
  const descendants = (cats, id) => { const out = [id]; for (let i = 0; i < out.length; i++) cats.filter((c) => c.parent_id === out[i]).forEach((c) => out.push(c.id)); return out; };
  const shortPath = (p) => { const a = String(p || '').split(' › '); return a.length > 2 ? '… › ' + a.slice(-2).join(' › ') : p; };

  // عرض شجري قابل للطي — يُستخدم في صفحة الشجرة وصفحة الأصناف ومنتقي العائدية
  ERP.treeView = (box, cats, { selected = null, onSelect, top = [], filter = '', compact = false, exclude = [] } = {}) => {
    const open = openSet();
    const q = filter.trim().toLowerCase();
    const match = q ? new Set(cats.filter((c) => c.name.toLowerCase().includes(q) || String(c.code || '').startsWith(q)).flatMap((c) => { const up = []; let x = c; while (x) { up.push(x.id); x = cats.find((y) => y.id === x.parent_id); } return up; })) : null;
    const node = (c, depth) => {
      if (exclude.includes(c.id) || (match && !match.has(c.id))) return '';
      const kids = kidsOf(cats, c.id).filter((k) => !exclude.includes(k.id));
      const isOpen = q ? true : open.has(c.id);
      return `<div class="tn ${String(selected) === String(c.id) ? 'on' : ''}" data-id="${c.id}" style="padding-inline-start:${8 + depth * 16}px">
          <button class="tw" data-tg="${c.id}" ${kids.length ? '' : 'style="visibility:hidden"'} aria-label="فتح/طي">${icon(isOpen ? 'chevd' : 'chevl', 12)}</button>
          ${compact ? '' : `<span class="tc mono">${esc(c.code || '')}</span>`}<span class="tl">${esc(c.name)}</span><span class="tk">${c.total || ''}</span></div>`
        + (isOpen ? kids.map((k) => node(k, depth + 1)).join('') : '');
    };
    box.innerHTML = top.map(([id, label, n]) => `<div class="tn top ${String(selected) === String(id) ? 'on' : ''}" data-id="${id}"><span class="tl">${label}</span><span class="tk">${n ?? ''}</span></div>`).join('')
      + (kidsOf(cats, null).map((c) => node(c, 0)).join('') || (q ? '<div class="faint" style="padding:10px">لا نتائج</div>' : ''));
    box.querySelectorAll('[data-tg]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const id = Number(b.dataset.tg); open.has(id) ? open.delete(id) : open.add(id); saveOpen(open);
      ERP.treeView(box, cats, { selected, onSelect, top, filter, compact, exclude });
    }));
    box.querySelectorAll('.tn').forEach((n) => (n.onclick = () => {
      const id = n.dataset.id;
      // فتح الفرع عند اختياره حتى تظهر فروعه
      if (/^\d+$/.test(id)) { const o = openSet(); o.add(Number(id)); saveOpen(o); }
      onSelect && onSelect(/^\d+$/.test(id) ? Number(id) : id);
    }));
  };
  ERP.treeOpenTo = (cats, id) => { const o = openSet(); let x = cats.find((c) => c.id === id); while (x && x.parent_id) { o.add(x.parent_id); x = cats.find((c) => c.id === x.parent_id); } saveOpen(o); };

  // منتقي العائدية (حقل يعرض المسار الكامل، ويفتح شجرة مع بحث وإضافة فرع سريع)
  ERP.treePicker = (holder, cats, { value = null, none = 'بدون عائدية', exclude = [], onChange, allowAdd = true } = {}) => {
    let val = value ? Number(value) : null;
    const pathOf = (id) => (cats.find((c) => c.id === id) || {}).path || '';
    holder.innerHTML = `<div class="tp"><button type="button" class="input tp-b"><span class="tp-v"></span>${icon('chevd', 14)}</button>
      <div class="tp-pop" hidden><input class="input tp-q" placeholder="ابحث في الشجرة بالاسم أو الرمز…"><div class="tp-list"></div>
      <div class="tp-f"><button type="button" class="btn sm ghost" data-none>${esc(none)}</button>${allowAdd ? `<span class="sp"></span><button type="button" class="btn sm" data-add>${icon('plus', 13)} فرع جديد</button>` : ''}</div></div></div>`;
    const b = holder.querySelector('.tp-b'), pop = holder.querySelector('.tp-pop'), list = holder.querySelector('.tp-list'), qi = holder.querySelector('.tp-q');
    const show = () => { holder.querySelector('.tp-v').innerHTML = val ? `<span class="mono faint" style="margin-inline-end:6px">${esc((cats.find((c) => c.id === val) || {}).code || '')}</span>${esc(pathOf(val))}` : `<span class="faint">${esc(none)}</span>`; };
    const draw = () => ERP.treeView(list, cats, { selected: val, filter: qi.value, exclude, compact: false, onSelect: (id) => { val = id; show(); close(); onChange && onChange(val); } });
    const close = () => { pop.hidden = true; document.removeEventListener('mousedown', outside, true); };
    const outside = (e) => { if (!holder.contains(e.target)) close(); };
    b.onclick = () => { if (!pop.hidden) return close(); if (val) ERP.treeOpenTo(cats, val); pop.hidden = false; qi.value = ''; draw(); qi.focus(); document.addEventListener('mousedown', outside, true); };
    qi.oninput = draw;
    qi.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'Enter') { e.preventDefault(); const first = list.querySelector('.tn'); if (first) first.click(); } };
    holder.querySelector('[data-none]').onclick = () => { val = null; show(); close(); onChange && onChange(null); };
    const add = holder.querySelector('[data-add]');
    if (add) add.onclick = async () => {
      const parent = val;
      const name = prompt(parent ? `اسم الفرع الجديد داخل «${pathOf(parent)}»` : 'اسم الفرع الرئيسي الجديد');
      if (!name || !name.trim()) return;
      try {
        const c = await Q.post('/categories', { name: name.trim(), parent_id: parent });
        const fresh = await ERP.cats(); cats.splice(0, cats.length, ...fresh);
        val = c.id; ERP.treeOpenTo(cats, val); show(); close(); onChange && onChange(val); Q.toast('تمت إضافة الفرع', 'ok');
      } catch (e) { Q.err(e); }
    };
    show();
    return { get: () => val, set: (v) => { val = v ? Number(v) : null; show(); } };
  };

  // ===== بطاقة الصنف (النظام الإداري — مستقلة عن النشر في الموقع) =====
  const UNITS = ['حبة', 'علبة', 'قطعة', 'كرتون', 'درزن', 'مل', 'لتر', 'غرام', 'كغم', 'متر', 'طقم'];
  ERP.productForm = async (p, after, { category_id = null } = {}) => {
    const cats = await ERP.cats();
    const isNew = !p;
    const d = p || { unit: 'حبة', category_id, active: 1 };
    const tax = Q.settings.tax || {};
    const m = Q.modal({
      title: isNew ? 'صنف جديد' : `تعديل صنف — ${p.name}`, width: 780,
      body: `<form class="pf" onsubmit="return false">
        <div class="pf-sec"><div class="pf-h">${icon('box', 15)} البيانات الأساسية</div><div class="fgrid">
          <label class="f full"><span>اسم الصنف *</span><input class="input" name="name" value="${esc(d.name || '')}" required maxlength="150" placeholder="مثال: عطر ديور سوفاج 100 مل"></label>
          <div class="f full"><span>العائدية (الفرع في شجرة المواد)</span><div id="pf-cat"></div><small class="faint">تُستخدم لترتيب الأصناف وتصفيتها والتقارير وتبويبات الكاشير — ويُولَّد رمز الصنف منها تلقائياً</small></div>
          <label class="f"><span>رمز الصنف</span><input class="input mono" name="sku" value="${esc(d.sku || '')}" placeholder="تلقائي من رمز الفرع" dir="ltr"></label>
          <label class="f"><span>الباركود</span><input class="input mono" name="barcode" value="${esc(d.barcode || '')}" placeholder="${isNew ? 'امسح الباركود أو اتركه للتوليد التلقائي' : ''}" dir="ltr"></label>
          <label class="f"><span>الوحدة</span><input class="input" name="unit" list="pf-units" value="${esc(d.unit || 'حبة')}"><datalist id="pf-units">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist></label>
          ${isNew ? '' : `<label class="chk" style="align-self:end;height:32px"><input type="checkbox" name="active" ${d.active ? 'checked' : ''}> صنف نشط (يظهر في الكاشير)</label>`}
        </div></div>
        <div class="pf-sec"><div class="pf-h">${icon('cash', 15)} التسعير</div><div class="fgrid c3">
          <label class="f"><span>سعر البيع *${tax.enabled ? ` <small class="faint">${tax.inclusive ? 'شامل الضريبة' : 'غير شامل الضريبة'}</small>` : ''}</span><input class="input num" name="price" type="number" step="any" value="${d.price ?? ''}" required></label>
          <label class="f"><span>سعر التكلفة</span><input class="input num" name="cost" type="number" step="any" value="${d.cost ?? ''}" ${isNew ? '' : 'readonly'}><small class="faint">${isNew ? 'يتحدث تلقائياً بمتوسط سعر الشراء' : 'يُحسب تلقائياً من فواتير الشراء'}</small></label>
          <div class="f"><span>هامش الربح</span><div class="input pf-margin" style="display:flex;align-items:center"></div></div>
        </div></div>
        <div class="pf-sec"><div class="pf-h">${icon('layers', 15)} المخزون</div><div class="fgrid c3">
          ${isNew ? '<label class="f"><span>الكمية الافتتاحية</span><input class="input num" name="opening_stock" type="number" step="any" value="0"></label>'
            : `<div class="f"><span>الكمية الحالية</span><div class="input" style="display:flex;align-items:center;justify-content:space-between"><b class="num">${Q.qty(d.stock)} ${esc(d.unit || '')}</b><button type="button" class="btn sm ghost" id="pf-adj">جرد</button></div></div>`}
          <label class="f"><span>حد إعادة الطلب</span><input class="input num" name="min_stock" type="number" step="any" value="${d.min_stock ?? 0}"><small class="faint">تنبيه عند انخفاض الكمية</small></label>
          <label class="f"><span>ملاحظات</span><input class="input" name="notes" value="${esc(d.notes || '')}"></label>
        </div></div>
        <div class="faint" style="font-size:12px">${icon('globe', 13)} النشر في المتجر الإلكتروني (الصور والوصف وأقسام الموقع) يتم من <a href="#/web/products" data-close>المتجر الإلكتروني ← منتجات الموقع</a>.</div>
      </form>`,
      foot: `<button class="btn primary" data-save>حفظ</button>${isNew ? '<button class="btn" data-more>حفظ وإضافة آخر</button>' : ''}<button class="btn" data-c>إلغاء</button>`,
    });
    const form = m.$('form');
    const picker = ERP.treePicker(m.$('#pf-cat'), cats, { value: d.category_id });
    const margin = () => {
      const pr = Number(form.price.value) || 0, c = Number(form.cost.value) || 0;
      const net = tax.enabled && tax.inclusive ? pr / (1 + (Number(tax.rate) || 0) / 100) : pr;
      m.$('.pf-margin').innerHTML = pr && c ? `<b class="num ${net - c < 0 ? 'err' : 'ok'}">${fmt(net - c)}</b>&nbsp;<span class="faint num">(${((net - c) / net * 100).toFixed(1)}٪)</span>` : '<span class="faint">—</span>';
    };
    form.price.oninput = margin; form.cost.oninput = margin; margin();
    m.$$('[data-close]').forEach((a) => (a.onclick = () => m.close()));
    const adj = m.$('#pf-adj'); if (adj) adj.onclick = () => { m.close(); ERP.adjustStock(p, after); };
    m.$('[data-c]').onclick = m.close;
    const save = async (again) => {
      if (!form.reportValidity()) return;
      const o = Q.formData(form);
      o.category_id = picker.get();
      if (!isNew) { o.active = form.active.checked; delete o.cost; }
      for (const k of ['price', 'cost', 'opening_stock', 'min_stock']) if (k in o) o[k] = Number(o[k]) || 0;
      const btns = m.$$('.modal-f .btn'); btns.forEach((x) => (x.disabled = true));
      try {
        const r = isNew ? await Q.post('/products', o) : await Q.put('/products/' + p.id, o);
        Q.toast(`تم الحفظ${r.sku ? ' — رمز الصنف ' + r.sku : ''}`, 'ok');
        m.close(); after?.(r);
        if (again) ERP.productForm(null, after, { category_id: o.category_id });
      } catch (e) { Q.err(e); btns.forEach((x) => (x.disabled = false)); }
    };
    m.$('[data-save]').onclick = () => save(false);
    const more = m.$('[data-more]'); if (more) more.onclick = () => save(true);
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.target.closest('.tp')) { e.preventDefault(); save(false); } });
    setTimeout(() => form.name.focus(), 40);
  };

  // ===== صفحة الأصناف مع الشجرة =====
  ERP.page('/products', {
    title: 'الأصناف',
    async render(v, prm) {
      let cats = await ERP.cats();
      const st = { q: '', cat: prm.cat ? (prm.cat === 'none' ? 'none' : Number(prm.cat)) : '', low: prm.low ? 1 : '', all: '', tq: '' };
      ERP.head('الأصناف', 'منظمة حسب شجرة المواد', `<button class="btn" id="im2">${icon('list')} استيراد من Excel</button><button class="btn" id="imp">${icon('download')} تصدير</button><button class="btn primary" id="add">${icon('plus')} صنف جديد</button>`);
      v.innerHTML = `<div class="items-l">
        <div class="card tree-card"><div class="card-h"><h3>شجرة المواد</h3><span class="sp"></span><a class="btn sm ghost" href="#/categories" title="إدارة الشجرة">${icon('edit', 13)}</a></div>
          <div style="padding:8px"><input class="input" id="tq" placeholder="بحث في الشجرة…"></div><div class="tree" id="tree"></div></div>
        <div style="min-width:0">
          <div class="bar"><input class="input search" placeholder="بحث بالاسم أو الباركود أو الرمز…" id="q">
            <label class="chk"><input type="checkbox" id="low" ${st.low ? 'checked' : ''}> المنخفضة فقط</label>
            <label class="chk"><input type="checkbox" id="all"> إظهار المؤرشفة</label><span class="sp"></span><span class="muted" id="cnt"></span></div>
          <div class="crumbs" id="crumbs"></div>
          <div class="card tbl-wrap" id="list"></div>
        </div></div>`;
      const drawTree = () => ERP.treeView(Q.$('#tree'), cats, {
        selected: st.cat, filter: st.tq, compact: true,
        top: [['', 'كل الأصناف', cats.filter((c) => !c.parent_id).reduce((a, c) => a + c.total, 0) + '+'], ['none', 'بدون عائدية', '']],
        onSelect: (id) => { st.cat = id; drawTree(); load(); },
      });
      if (typeof st.cat === 'number') ERP.treeOpenTo(cats, st.cat);
      drawTree();
      Q.$('#tree .tn[data-id=""] .tk').textContent = '';
      let rows = [];
      const load = async () => {
        rows = await Q.get('/products' + Q.qs({ q: st.q, category_id: st.cat, low: st.low, active: st.all ? 'all' : '' }));
        const c = cats.find((x) => x.id === st.cat);
        Q.$('#crumbs').innerHTML = st.cat === 'none' ? '<b>بدون عائدية</b>' : c ? c.path.split(' › ').map((x, i, a) => i === a.length - 1 ? `<b>${esc(x)}</b>` : `<span class="faint">${esc(x)}</span>`).join(' <span class="faint">›</span> ') + ` <span class="mono faint">${esc(c.code || '')}</span>` : '<b>كل الأصناف</b>';
        Q.$('#cnt').textContent = `${rows.length} صنف · قيمة المخزون ${fmt(rows.reduce((a, r) => a + r.stock * r.cost, 0))}`;
        Q.$('#list').innerHTML = T([
          { k: 'sku', t: 'الرمز', f: (x) => `<span class="mono faint">${esc(x || '')}</span>` },
          { k: 'name', t: 'الصنف', f: (x, r) => `<b>${esc(x)}</b>${r.active ? '' : ' <span class="tag">مؤرشف</span>'}<div class="faint" style="font-size:11.5px">${esc(shortPath(r.category) || 'بدون عائدية')}</div>` },
          { k: 'barcode', t: 'الباركود', f: (x) => `<span class="mono muted">${esc(x || '')}</span>` },
          { k: 'cost', t: 'التكلفة', n: 1 }, { k: 'price', t: 'سعر البيع', n: 1 },
          { k: 'stock', t: 'المخزون', cls: 'n', f: (x, r) => `<span class="${x <= 0 ? 'err' : x <= r.min_stock ? 'warn' : ''} b">${Q.qty(x)}</span> <span class="faint">${esc(r.unit || '')}</span>` },
          { k: 'id', t: '', cls: 'act', f: (x) => `<div class="row"><button class="btn sm" data-adj="${x}" title="تسوية الكمية">جرد</button><button class="btn sm ghost" data-ed="${x}">${icon('edit', 14)}</button><button class="btn sm ghost danger" data-del="${x}">${icon('trash', 14)}</button></div>` },
        ], rows, { click: 1, empty: st.cat ? 'لا توجد أصناف في هذا الفرع — أضف صنفاً' : 'لا توجد أصناف — أضف أول صنف' });
        ERP.bindRows(Q.$('#list'), rows, (r) => ERP.go('/product/' + r.id));
        Q.$$('#list [data-ed]').forEach((b) => (b.onclick = () => ERP.productForm(rows.find((r) => r.id == b.dataset.ed), reloadAll)));
        Q.$$('#list [data-adj]').forEach((b) => (b.onclick = () => ERP.adjustStock(rows.find((r) => r.id == b.dataset.adj), reloadAll)));
        Q.$$('#list [data-del]').forEach((b) => (b.onclick = async () => {
          if (!(await Q.confirm('حذف هذا الصنف؟ إن كانت عليه حركات سيتم أرشفته بدلاً من الحذف.', { danger: true, ok: 'حذف' }))) return;
          try { const r = await Q.del('/products/' + b.dataset.del); Q.toast(r.archived ? 'تمت الأرشفة' : 'تم الحذف', 'ok'); reloadAll(); } catch (e) { Q.err(e); }
        }));
      };
      const reloadAll = async () => { cats = await ERP.cats(); drawTree(); load(); };
      Q.$('#q').oninput = Q.debounce((e) => { st.q = e.target.value; load(); });
      Q.$('#tq').oninput = Q.debounce((e) => { st.tq = e.target.value; drawTree(); }, 120);
      Q.$('#low').onchange = (e) => { st.low = e.target.checked ? 1 : ''; load(); };
      Q.$('#all').onchange = (e) => { st.all = e.target.checked; load(); };
      Q.$('#add').onclick = () => ERP.productForm(null, reloadAll, { category_id: typeof st.cat === 'number' ? st.cat : null });
      Q.$('#imp').onclick = () => ERP.productsCsv('products.csv', rows.map((r) => [r.name, r.barcode, (r.category || '').replace(/ › /g, ' / '), r.unit, r.cost, r.price, r.stock, r.min_stock]));
      Q.$('#im2').onclick = () => ERP.importProducts(reloadAll);
      Q.$('#q').focus();
      load();
    },
  });

  // ===== شجرة المواد =====
  ERP.page('/categories', {
    title: 'شجرة المواد',
    async render(v, prm) {
      let cats = await ERP.cats();
      let sel = prm.id ? Number(prm.id) : null, tq = '';
      ERP.head('شجرة المواد', 'تنظيم الأصناف في فروع متعددة المستويات (العائدية)', `<button class="btn" id="exp">${icon('layers')} فتح الكل</button><button class="btn primary" id="addr">${icon('plus')} فرع رئيسي</button>`);
      v.innerHTML = `<div class="items-l wide">
        <div class="card tree-card"><div style="padding:8px"><input class="input" id="tq" placeholder="بحث بالاسم أو الرمز…"></div><div class="tree" id="tree"></div></div>
        <div id="det" style="min-width:0"></div></div>`;
      const drawTree = () => ERP.treeView(Q.$('#tree'), cats, { selected: sel, filter: tq, onSelect: (id) => { sel = id; drawTree(); drawDet(); } });
      const reload = async (keep = true) => { cats = await ERP.cats(); if (!keep || !cats.some((c) => c.id === sel)) sel = null; drawTree(); drawDet(); };
      const catForm = (c, parent) => {
        const m = Q.modal({
          title: c ? 'تعديل الفرع' : parent ? `فرع جديد داخل «${parent.path}»` : 'فرع رئيسي جديد', width: 520,
          body: `<form class="fgrid" onsubmit="return false"><label class="f full"><span>اسم الفرع *</span><input class="input" name="name" value="${esc(c?.name || '')}" required></label>
            <label class="f"><span>الرمز</span><input class="input mono" name="code" dir="ltr" value="${esc(c?.code || '')}" placeholder="تلقائي"><small class="faint">تغييره يعيد ترميز الفروع التابعة</small></label>
            <label class="f"><span>الترتيب</span><input class="input num" name="sort" type="number" value="${c?.sort || 0}"></label>
            ${c ? '<div class="f full"><span>يتبع الفرع (نقل)</span><div id="mv"></div></div>' : ''}</form>`,
          foot: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-c>إلغاء</button>',
        });
        const mv = c ? ERP.treePicker(m.$('#mv'), cats, { value: c.parent_id, none: '— فرع رئيسي —', exclude: [c.id], allowAdd: false }) : null;
        m.$('[data-c]').onclick = m.close;
        const ok = async () => {
          const f = m.$('form'); if (!f.reportValidity()) return;
          const o = Q.formData(f);
          try {
            if (c) { o.parent_id = mv.get(); const r = await Q.put('/categories/' + c.id, o); sel = r.id; ERP.treeOpenTo(await ERP.cats(), r.id); }
            else { const r = await Q.post('/categories', { ...o, parent_id: parent?.id || null }); sel = r.id; if (parent) { const s = openSet(); s.add(parent.id); saveOpen(s); } }
            m.close(); Q.toast('تم الحفظ', 'ok'); reload();
          } catch (e) { Q.err(e); }
        };
        m.$('[data-ok]').onclick = ok;
        m.$('form').onkeydown = (e) => { if (e.key === 'Enter' && !e.target.closest('.tp')) { e.preventDefault(); ok(); } };
        setTimeout(() => m.$('[name=name]').focus(), 40);
      };
      const delCat = async (c) => {
        if (c.children) return Q.toast('هذا الفرع يحتوي فروعاً تابعة — انقلها أو احذفها أولاً', 'err');
        if (!c.products) { if (await Q.confirm(`حذف الفرع «${esc(c.name)}»؟`, { danger: true, ok: 'حذف' })) { try { await Q.del('/categories/' + c.id); sel = c.parent_id; Q.toast('تم الحذف', 'ok'); reload(); } catch (e) { Q.err(e); } } return; }
        const m = Q.modal({ title: 'حذف الفرع', width: 520, body: `<p>يحتوي «${esc(c.name)}» على <b>${c.products}</b> صنف. اختر الفرع الذي تُنقل إليه الأصناف:</p><div id="to" style="margin-top:10px"></div>`,
          foot: '<button class="btn danger" data-ok>نقل الأصناف وحذف الفرع</button><button class="btn" data-c>إلغاء</button>' });
        const to = ERP.treePicker(m.$('#to'), cats, { none: 'بدون عائدية', exclude: [c.id], allowAdd: false });
        m.$('[data-c]').onclick = m.close;
        m.$('[data-ok]').onclick = async () => { try { await Q.del('/categories/' + c.id + Q.qs(to.get() ? { move_to: to.get() } : { force: 1 })); m.close(); sel = c.parent_id; Q.toast('تم النقل والحذف', 'ok'); reload(); } catch (e) { Q.err(e); } };
      };
      const drawDet = async () => {
        const det = Q.$('#det');
        const c = cats.find((x) => x.id === sel);
        if (!c) {
          const roots = kidsOf(cats, null);
          det.innerHTML = `<div class="stats"><div class="stat"><div class="k">الفروع الرئيسية</div><div class="v">${roots.length}</div></div><div class="stat"><div class="k">كل الفروع</div><div class="v">${cats.length}</div></div>
            <div class="stat"><div class="k">أصناف لها عائدية</div><div class="v">${roots.reduce((a, r) => a + r.total, 0)}</div></div><div class="stat"><div class="k">قيمة المخزون</div><div class="v">${fmt(roots.reduce((a, r) => a + r.total_value, 0))}</div></div></div>
            <div class="card">${roots.length ? T([{ k: 'code', t: 'الرمز', f: (x) => `<span class="mono">${esc(x || '')}</span>` }, { k: 'name', t: 'الفرع الرئيسي', f: (x) => `<b>${esc(x)}</b>` }, { k: 'children', t: 'فروع', cls: 'n', f: (x) => x },
              { k: 'total', t: 'الأصناف', cls: 'n', f: (x) => x }, { k: 'total_value', t: 'قيمة المخزون', n: 1 }], roots, { click: 1 }) : `<div class="empty">ابدأ ببناء شجرة المواد: أضف فرعاً رئيسياً مثل «عطور» ثم فروعه مثل «نسائية» و«رجالية».</div>`}</div>`;
          ERP.bindRows(det, roots, (r) => { sel = r.id; drawTree(); drawDet(); });
          return;
        }
        const kids = kidsOf(cats, c.id);
        det.innerHTML = `<div class="card card-b" style="margin-bottom:12px"><div class="crumbs" style="margin:0 0 6px">${c.path.split(' › ').map((x, i, a) => i === a.length - 1 ? `<b style="font-size:16px">${esc(x)}</b>` : `<span class="faint">${esc(x)}</span>`).join(' <span class="faint">›</span> ')}</div>
            <div class="row wrap" style="gap:6px"><span class="tag mono">${esc(c.code || '—')}</span><span class="sp"></span>
              <button class="btn sm primary" id="np">${icon('plus', 13)} صنف في هذا الفرع</button><button class="btn sm" id="nc">${icon('plus', 13)} فرع تابع</button>
              <button class="btn sm" id="ec">${icon('edit', 13)} تعديل / نقل</button><button class="btn sm danger" id="dc">${icon('trash', 13)} حذف</button></div></div>
          <div class="stats"><div class="stat"><div class="k">أصناف مباشرة</div><div class="v">${c.products}</div></div><div class="stat"><div class="k">مع الفروع التابعة</div><div class="v">${c.total}</div></div>
            <div class="stat"><div class="k">فروع تابعة</div><div class="v">${c.children}</div></div><div class="stat"><div class="k">قيمة المخزون</div><div class="v">${fmt(c.total_value)}</div></div></div>
          ${kids.length ? `<div class="card" id="kids" style="margin-bottom:12px"><div class="card-h"><h3>الفروع التابعة</h3></div>${T([{ k: 'code', t: 'الرمز', f: (x) => `<span class="mono">${esc(x || '')}</span>` }, { k: 'name', t: 'الفرع', f: (x) => `<b>${esc(x)}</b>` }, { k: 'children', t: 'فروع', cls: 'n', f: (x) => x }, { k: 'total', t: 'الأصناف', cls: 'n', f: (x) => x }, { k: 'total_value', t: 'قيمة المخزون', n: 1 }], kids, { click: 1 })}</div>` : ''}
          <div class="card"><div class="card-h"><h3>الأصناف</h3><span class="sp"></span><a class="btn sm ghost" href="#/products?cat=${c.id}">فتح في صفحة الأصناف</a></div><div id="cp"><div class="empty">…</div></div></div>`;
        if (kids.length) ERP.bindRows(Q.$('#kids'), kids, (r) => { sel = r.id; ERP.treeOpenTo(cats, r.id); drawTree(); drawDet(); });
        Q.$('#np').onclick = () => ERP.productForm(null, () => reload(), { category_id: c.id });
        Q.$('#nc').onclick = () => catForm(null, c);
        Q.$('#ec').onclick = () => catForm(c);
        Q.$('#dc').onclick = () => delCat(c);
        const prods = await Q.get('/products' + Q.qs({ category_id: c.id }));
        if (sel !== c.id) return;
        Q.$('#cp').innerHTML = T([{ k: 'sku', t: 'الرمز', f: (x) => `<span class="mono faint">${esc(x || '')}</span>` }, { k: 'name', t: 'الصنف', f: (x, r) => `<b>${esc(x)}</b>${r.category_id !== c.id ? `<div class="faint" style="font-size:11.5px">${esc(shortPath(r.category))}</div>` : ''}` },
          { k: 'price', t: 'السعر', n: 1 }, { k: 'stock', t: 'المخزون', cls: 'n', f: (x, r) => `${Q.qty(x)} <span class="faint">${esc(r.unit || '')}</span>` }], prods, { click: 1, empty: 'لا توجد أصناف في هذا الفرع' });
        ERP.bindRows(Q.$('#cp'), prods, (r) => ERP.go('/product/' + r.id));
      };
      Q.$('#tq').oninput = Q.debounce((e) => { tq = e.target.value; drawTree(); }, 120);
      Q.$('#addr').onclick = () => catForm(null, null);
      Q.$('#exp').onclick = () => { const s = openSet(); const allOpen = cats.every((c) => !c.children || s.has(c.id)); cats.forEach((c) => (allOpen ? s.delete(c.id) : s.add(c.id))); saveOpen(s); drawTree(); };
      if (sel) ERP.treeOpenTo(cats, sel);
      drawTree(); drawDet();
    },
  });
})();
