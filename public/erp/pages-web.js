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
  ERP.page('/web/products', {
    title: 'منتجات المتجر الإلكتروني',
    async render(v) {
      ERP.head('منتجات المتجر الإلكتروني', 'اختر ما يظهر في الموقع وأضف الصور والوصف', `<button class="btn" id="sync">${icon('refresh')} نشر التغييرات الآن</button>`);
      const st = { q: '', f: '' };
      v.innerHTML = `<div class="bar"><input class="input search" id="q" placeholder="بحث…"><div class="seg" id="ff"><button data-f="" class="on">الكل</button><button data-f="pub">المنشورة</button><button data-f="unpub">غير المنشورة</button><button data-f="noimg">منشورة بدون صور</button></div>
        <span class="sp"></span><button class="btn sm" id="pa">نشر كل المتوفر</button></div><div class="card tbl-wrap" id="list"></div>`;
      let rows = [];
      const load = async () => { rows = await Q.get('/web/products'); draw(); };
      const draw = () => {
        const q = st.q.toLowerCase();
        const list = rows.filter((p) => (!q || p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q)) &&
          (st.f === 'pub' ? p.web_published : st.f === 'unpub' ? !p.web_published : st.f === 'noimg' ? p.web_published && !p.web_images.length : true));
        Q.$('#list').innerHTML = T([
          { k: 'web_images', t: '', f: (x) => (x.length ? `<img src="/media/${x[0]}" style="width:38px;height:38px;object-fit:cover;border-radius:5px;border:1px solid var(--line)">` : `<div style="width:38px;height:38px;border-radius:5px;background:var(--line-2);display:grid;place-items:center;color:var(--faint)">${icon('box', 16)}</div>`) },
          { k: 'name', t: 'المنتج', f: (x, p) => `<b>${esc(x)}</b><div class="faint">${esc(p.category || '')}</div>` },
          { k: 'price', t: 'السعر', cls: 'n', f: (x, p) => `${fmt(x)}${p.web_compare_price > x ? `<div class="faint" style="text-decoration:line-through">${fmt(p.web_compare_price)}</div>` : ''}` },
          { k: 'stock', t: 'المتاح للموقع', cls: 'n', f: (x, p) => `<span class="${x - p.reserved <= 0 ? 'err' : ''}">${Q.qty(Math.max(0, x - p.reserved))}</span>${p.reserved ? `<div class="faint">محجوز ${Q.qty(p.reserved)}</div>` : ''}` },
          { k: 'web_published', t: 'منشور', f: (x, p) => `<label class="chk"><input type="checkbox" data-t="web_published" data-id="${p.id}" ${x ? 'checked' : ''}></label>` },
          { k: 'web_featured', t: 'مميز', f: (x, p) => `<label class="chk"><input type="checkbox" data-t="web_featured" data-id="${p.id}" ${x ? 'checked' : ''}></label>` },
          { k: 'web_new', t: 'جديد', f: (x, p) => `<label class="chk"><input type="checkbox" data-t="web_new" data-id="${p.id}" ${x ? 'checked' : ''}></label>` },
          { k: 'id', t: '', cls: 'act', f: (x) => `<button class="btn sm" data-ed="${x}">${icon('edit', 14)} الصور والوصف</button>` },
        ], list, { empty: 'لا توجد أصناف' });
        Q.$$('#list [data-t]').forEach((c) => (c.onchange = async () => {
          try { await Q.put('/web/products/' + c.dataset.id, { [c.dataset.t]: c.checked }); rows.find((r) => r.id == c.dataset.id)[c.dataset.t] = c.checked ? 1 : 0; } catch (e) { Q.err(e); c.checked = !c.checked; }
        }));
        Q.$$('#list [data-ed]').forEach((b) => (b.onclick = () => editWeb(rows.find((r) => r.id == b.dataset.ed), load)));
      };
      Q.$('#q').oninput = Q.debounce((e) => { st.q = e.target.value; draw(); }, 150);
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
  ERP.pickImages = (multiple = true) => new Promise((resolve) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = multiple;
    inp.onchange = async () => {
      const out = [];
      for (const file of inp.files) {
        try {
          const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
          const k = Math.min(1, 1400 / Math.max(img.width, img.height));
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

  function editWeb(p, after) {
    let imgs = [...p.web_images];
    const m = Q.modal({
      title: 'المنتج في الموقع: ' + p.name, width: 640,
      body: `<div class="sec-t">الصور <span class="faint">(الأولى هي الرئيسية — اسحب للترتيب)</span></div><div id="ims" class="row wrap" style="gap:8px"></div>
        <div class="sec-t">الوصف</div><textarea class="input" id="wd" style="min-height:120px" placeholder="وصف المنتج، المكونات، طريقة الاستخدام، الحجم…">${esc(p.web_description || '')}</textarea>
        <div class="fgrid" style="margin-top:12px"><label class="f"><span>السعر قبل الخصم (اختياري)</span><input class="input num" type="number" id="wc" value="${p.web_compare_price || ''}" placeholder="مثال: ${fmt(p.price * 1.2, 0)}"><small class="faint">يظهر مشطوباً مع نسبة الخصم. سعر البيع الحالي ${fmt(p.price)}</small></label>
        <div class="chk-list" style="align-self:center"><label class="chk"><input type="checkbox" id="wp" ${p.web_published ? 'checked' : ''}> منشور في الموقع</label><label class="chk"><input type="checkbox" id="wf" ${p.web_featured ? 'checked' : ''}> مميز</label><label class="chk"><input type="checkbox" id="wn" ${p.web_new ? 'checked' : ''}> وصل حديثاً</label></div></div>`,
      foot: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-c>إلغاء</button>',
    });
    let dragI = null;
    const draw = () => {
      m.$('#ims').innerHTML = imgs.map((f, i) => `<div draggable="true" data-i="${i}" style="position:relative;width:96px;height:96px;border:1px solid var(--line);border-radius:6px;overflow:hidden;cursor:grab;${i === 0 ? 'outline:2px solid var(--accent)' : ''}">
          <img src="/media/${f}" style="width:100%;height:100%;object-fit:cover"><button class="btn sm icon" data-rm="${i}" style="position:absolute;top:3px;left:3px;width:24px;height:24px;background:#fffd">${icon('x', 12)}</button></div>`).join('')
        + `<button class="btn" id="add" style="width:96px;height:96px;justify-content:center;flex-direction:column">${icon('plus', 18)}<span style="font-size:11px">إضافة صور</span></button>`;
      m.$$('[data-rm]').forEach((b) => (b.onclick = () => { imgs.splice(b.dataset.rm, 1); draw(); }));
      m.$$('[draggable]').forEach((el) => {
        el.ondragstart = () => (dragI = Number(el.dataset.i));
        el.ondragover = (e) => e.preventDefault();
        el.ondrop = () => { const to = Number(el.dataset.i); const [x] = imgs.splice(dragI, 1); imgs.splice(to, 0, x); draw(); };
      });
      m.$('#add').onclick = async () => { const n = await ERP.pickImages(true); imgs.push(...n); imgs = imgs.slice(0, 10); draw(); };
    };
    draw();
    m.$('[data-c]').onclick = m.close;
    m.$('[data-ok]').onclick = async () => {
      try {
        await Q.put('/web/products/' + p.id, { web_images: imgs, web_description: m.$('#wd').value, web_compare_price: Number(m.$('#wc').value) || null,
          web_published: m.$('#wp').checked, web_featured: m.$('#wf').checked, web_new: m.$('#wn').checked });
        m.close(); Q.toast('تم الحفظ — يُنشر في الموقع مع المزامنة القادمة', 'ok'); after?.();
      } catch (e) { Q.err(e); }
    };
  }

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
        Q.$('#cs').innerHTML = st.configured ? (st.last_error ? '<span class="tag err">خطأ</span>' : st.last_ok ? '<span class="tag ok">متصل</span>' : '<span class="tag">لم يُختبر</span>') : '<span class="tag warn">غير مربوط</span>';
        Q.$('#sst').innerHTML = `المنتجات المنشورة: <b>${st.published}</b><br>آخر مزامنة ناجحة: <b>${st.last_ok ? Q.dt(st.last_ok) : '—'}</b>${st.last_report ? `<br>آخر تقرير: ${st.last_report.products} منتج، ${st.last_report.orders} طلب جديد، ${st.last_report.images} صورة` : ''}${st.last_error ? `<br><span class="err">${esc(st.last_error)}</span>` : ''}`;
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
