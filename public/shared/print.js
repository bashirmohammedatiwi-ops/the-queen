// The Queen — قوالب الطباعة: حرارية 80mm و A4
(function () {
  const Q = window.Q;
  const esc = Q.esc, f = Q.fmt;
  const P = (Q.print = {});

  // ===== باركود Code128-B (SVG) =====
  const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
    '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
    '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
    '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
    '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
    '114131 311141 411131 211412 211214 211232').split(' ');
  P.code128 = (text, { height = 40, module = 1.6, showText = true } = {}) => {
    text = String(text).replace(/[^\x20-\x7e]/g, '');
    const codes = [104];
    for (const ch of text) codes.push(ch.charCodeAt(0) - 32);
    let sum = 104;
    for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
    codes.push(sum % 103);
    let pattern = codes.map((c) => C128[c]).join('') + '2331112';
    let x = 10 * module, bars = '';
    for (let i = 0; i < pattern.length; i++) {
      const w = Number(pattern[i]) * module;
      if (i % 2 === 0) bars += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`;
      x += w;
    }
    const W = x + 10 * module;
    const th = showText ? 13 : 0;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${height + th}" width="${W.toFixed(1)}" height="${height + th}" style="max-width:100%;height:auto">
      <g fill="#000">${bars}</g>${showText ? `<text x="${W / 2}" y="${height + 11}" font-size="11" text-anchor="middle" font-family="monospace" fill="#000">${esc(text)}</text>` : ''}</svg>`;
  };

  // ===== تفقيط: المبلغ بالحروف العربية =====
  const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
    'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const HUND = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  const SCALES = [['', '', ''], ['ألف', 'ألفان', 'آلاف'], ['مليون', 'مليونان', 'ملايين'], ['مليار', 'ملياران', 'مليارات']];
  const below1000 = (n) => {
    const h = Math.floor(n / 100), r = n % 100, parts = [];
    if (h) parts.push(HUND[h]);
    if (r) parts.push(r < 20 ? ONES[r] : r % 10 ? `${ONES[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[r / 10]);
    return parts.join(' و');
  };
  P.numWords = (n) => {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (!n) return 'صفر';
    const parts = [];
    for (let i = SCALES.length - 1; i >= 0; i--) {
      const g = Math.floor(n / 1000 ** i) % 1000;
      if (!g) continue;
      if (i === 0) parts.push(below1000(g));
      else if (g === 1) parts.push(SCALES[i][0]);
      else if (g === 2) parts.push(SCALES[i][1]);
      else {
        // التمييز يتبع آخر جزء من العدد: 3-10 جمع، 11-99 مفرد منصوب، المئات المجردة مفرد مجرور
        const r = g % 100;
        const word = r >= 3 && r <= 10 ? SCALES[i][2] : r >= 11 ? SCALES[i][0] + 'اً' : SCALES[i][0];
        parts.push(`${below1000(g)} ${word}`);
      }
    }
    return parts.join(' و');
  };
  P.words = (amount, cur = 'IQD') => {
    const n = Math.abs(Number(amount) || 0);
    if (cur === 'USD') {
      const d = Math.floor(n), c = Math.round((n - d) * 100);
      return `فقط ${P.numWords(d)} دولار أمريكي${c ? ` و${P.numWords(c)} سنت` : ''} لا غير`;
    }
    return `فقط ${P.numWords(Math.round(n))} دينار عراقي لا غير`;
  };

  // ===== تنفيذ الطباعة عبر إطار مخفي =====
  // في تطبيق سطح المكتب: الإيصال الحراري يُطبع مباشرة على الطابعة المختارة بدون نافذة
  P.run = async (html, opts = {}) => {
    const thermal = opts.thermal ?? /@page\{size:\d+mm auto/.test(html);
    if (thermal && window.desktop?.print) {
      const cfg = await window.desktop.getConfig();
      const r = await window.desktop.print(html, { thermal: true, copies: opts.copies || 1, width: Q.settings?.print_thermal?.width || 80, silent: cfg.silent && !!cfg.printer });
      if (!r.ok && r.reason && !/cancel/i.test(r.reason)) Q.toast('تعذرت الطباعة: ' + r.reason + ' — تحقق من الطابعة من زر "الطابعة"', 'err');
      return;
    }
    return P.runFrame(html, opts);
  };
  // إعدادات طابعة هذا الجهاز (تطبيق سطح المكتب فقط)
  P.deviceDialog = async () => {
    if (!window.desktop) return;
    const [cfg, printers] = await Promise.all([window.desktop.getConfig(), window.desktop.printers()]);
    const m = Q.modal({
      title: 'إعدادات هذا الجهاز', width: 460,
      body: `<label class="f"><span>طابعة الإيصالات الحرارية</span><select class="input" id="dp"><option value="">— اختيار عند كل طباعة —</option>
          ${printers.map((p) => `<option value="${esc(p.name)}" ${p.name === cfg.printer ? 'selected' : ''}>${esc(p.displayName)}${p.isDefault ? ' (الافتراضية)' : ''}</option>`).join('')}</select></label>
        <label class="chk" style="margin-top:10px"><input type="checkbox" id="ds" ${cfg.silent ? 'checked' : ''}> طباعة مباشرة بدون نافذة الطباعة</label>
        <div class="faint" style="font-size:12px;margin-top:8px">عرض الورق والتصميم من: النظام الإداري ← إعدادات الطباعة.</div>
        ${cfg.mode === 'pos' ? `<div class="divider"></div><div class="muted">متصل بالخادم: <span class="mono" dir="ltr">${esc(cfg.server || '')}</span></div><button class="btn sm" id="dc" style="margin-top:6px">تغيير الخادم</button>` : ''}
        <div class="faint" style="font-size:11.5px;margin-top:12px">الإصدار ${esc(cfg.version)}</div>`,
      foot: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-t>طباعة تجريبية</button>',
    });
    const save = () => window.desktop.setConfig({ printer: m.$('#dp').value, silent: m.$('#ds').checked });
    m.$('[data-ok]').onclick = async () => { await save(); m.close(); Q.toast('تم حفظ إعدادات الجهاز', 'ok'); };
    m.$('[data-t]').onclick = async () => {
      await save();
      const s = Q.settings;
      P.run(P.thermal({ number: 'TEST-0001', type: 'sale', date: new Date().toISOString().replace('T', ' ').slice(0, 16), user_name: 'تجربة طباعة',
        items: [{ name: 'صنف تجريبي', qty: 1, price: 1000, discount: 0, total: 1000 }], subtotal: 1000, discount: 0, tax: 0, total: 1000, paid_cash: 1000, paid_card: 0, credit: 0, tax_rate: 0 }, s));
    };
    m.$('#dc') && (m.$('#dc').onclick = () => { m.close(); window.desktop.showConnect(); });
  };

  P.runFrame = (html, { copies = 1 } = {}) => new Promise((resolve) => {
    const ifr = document.createElement('iframe');
    ifr.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:1200px;border:0;visibility:hidden';
    document.body.appendChild(ifr);
    const doc = ifr.contentDocument;
    let body = html;
    if (copies > 1) {
      const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      if (m) body = html.replace(m[1], Array(copies).fill(m[1]).join('<div style="page-break-after:always"></div>'));
    }
    doc.open(); doc.write(body); doc.close();
    const go = () => {
      setTimeout(() => {
        ifr.contentWindow.focus(); ifr.contentWindow.print();
        setTimeout(() => { ifr.remove(); resolve(); }, 1000);
      }, 150);
    };
    const imgs = [...doc.images].filter((i) => !i.complete);
    if (!imgs.length) go(); else { let n = imgs.length; imgs.forEach((i) => (i.onload = i.onerror = () => --n === 0 && go())); setTimeout(go, 2500); }
  });
  P.preview = (html) => {
    const w = window.open('', '_blank');
    if (!w) return Q.toast('اسمح بالنوافذ المنبثقة للمعاينة', 'err');
    w.document.open(); w.document.write(html.replace('</body>', '<script>document.title="معاينة";<\/script></body>')); w.document.close();
  };

  const storeName = (s) => s.store.name_ar && s.store.name ? `${esc(s.store.name)}` : esc(s.store.name || s.store.name_ar);
  const typeTitle = (inv, t) => (inv.type === 'return' ? 'إشعار دائن / مرتجع مبيعات' : t);

  // ===== الفاتورة الحرارية =====
  P.thermalCSS = (t) => {
    const W = Number(t.width) || 80, m = Number(t.margin) || 0, fs = Number(t.font_size) || 12;
    return `@page{size:${W}mm auto;margin:0}*{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff}
    body{width:${W}mm;padding:${m}mm ${m + 1}mm;font-family:Tahoma,"Segoe UI",Arial,sans-serif;font-size:${fs}px;line-height:1.45;color:#000;direction:rtl}
    .c{text-align:center}.b{font-weight:700}.sm{font-size:${fs - 1.5}px}.lg{font-size:${fs + 4}px}
    .logo{display:block;margin:0 auto 4px;max-width:${t.logo_width || 45}mm;max-height:28mm;object-fit:contain;filter:grayscale(1)}
    .hr{border-top:1px dashed #000;margin:5px 0}.hr2{border-top:2px solid #000;margin:5px 0}
    .kv{display:flex;justify-content:space-between;gap:6px}.kv span:last-child{direction:ltr;text-align:left;font-variant-numeric:tabular-nums}
    table{width:100%;border-collapse:collapse}th{font-size:${fs - 1}px;text-align:right;border-bottom:1px solid #000;padding:2px 0}
    td{padding:2px 0;vertical-align:top}.n{text-align:left;direction:ltr;font-variant-numeric:tabular-nums;white-space:nowrap}
    .it td{border-bottom:1px dotted #999}.tot{font-size:${fs + 3}px;font-weight:700;border:2px solid #000;padding:4px 6px;margin:5px 0}
    .bc{text-align:center;margin-top:6px}.bc svg{width:85%}`;
  };
  P.thermal = (inv, s = Q.settings) => {
    const t = s.print_thermal, st = s.store, cur = s.currency;
    const rate = inv.tax_rate ?? s.tax.rate;
    const isRet = inv.type === 'return';
    const items = inv.items.map((i) => `<tr class="it"><td colspan="3"><div class="b">${esc(i.name)}</div>
      ${t.show_sku && (i.sku || i.barcode) ? `<div class="sm">${esc(i.sku || i.barcode)}</div>` : ''}
      <div class="kv sm"><span>${Q.qty(i.qty)} × ${f(i.price)}${i.discount ? ` - خصم ${f(i.discount)}` : ''}</span><span class="b">${f(i.total)}</span></div></td></tr>`).join('');
    const change = inv.tendered && inv.tendered > inv.paid_cash ? Q.n(inv.tendered - inv.paid_cash) : 0;
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(inv.number)}</title><style>${P.thermalCSS(t)}</style></head><body>
      ${t.show_logo && st.logo ? `<img class="logo" src="${st.logo}">` : ''}
      ${t.show_name ? `<div class="c b lg">${storeName(s)}</div>${st.name_ar && st.name ? `<div class="c b">${esc(st.name_ar)}</div>` : ''}` : ''}
      ${st.activity ? `<div class="c sm">${esc(st.activity)}</div>` : ''}
      ${t.show_address && st.address ? `<div class="c sm">${esc(st.address)}</div>` : ''}
      ${t.show_phone && st.phone ? `<div class="c sm">هاتف: <span dir="ltr">${esc(st.phone)}</span></div>` : ''}
      ${t.show_tax_no && st.tax_no ? `<div class="c sm">الرقم الضريبي: ${esc(st.tax_no)}</div>` : ''}
      ${t.header_note ? `<div class="c sm">${esc(t.header_note)}</div>` : ''}
      <div class="hr2"></div>
      <div class="c b">${esc(typeTitle(inv, t.title))}</div>
      <div class="hr"></div>
      <div class="kv"><span>رقم الفاتورة</span><span class="b">${esc(inv.number)}</span></div>
      ${isRet && inv.ref_number ? `<div class="kv"><span>عن فاتورة</span><span>${esc(inv.ref_number)}</span></div>` : ''}
      <div class="kv"><span>التاريخ</span><span>${esc(Q.dt(inv.date))}</span></div>
      ${t.show_cashier && inv.user_name ? `<div class="kv"><span>الكاشير</span><span>${esc(inv.user_name)}</span></div>` : ''}
      ${t.show_customer && inv.customer_name ? `<div class="kv"><span>العميل</span><span>${esc(inv.customer_name)}</span></div>` : ''}
      <div class="hr"></div>
      <table><thead><tr><th colspan="3"><div class="kv"><span>الصنف / الكمية × السعر</span><span>المبلغ</span></div></th></tr></thead><tbody>${items}</tbody></table>
      <div style="margin-top:4px">
        <div class="kv"><span>عدد الأصناف</span><span>${inv.items.reduce((a, i) => a + Number(i.qty), 0)}</span></div>
        <div class="kv"><span>المجموع</span><span>${f(inv.subtotal)}</span></div>
        ${inv.discount ? `<div class="kv"><span>الخصم</span><span>-${f(inv.discount)}</span></div>` : ''}
        ${t.show_tax_summary && inv.tax ? `<div class="kv"><span>الإجمالي غير شامل الضريبة</span><span>${f(inv.total - inv.tax)}</span></div>
        <div class="kv"><span>ضريبة القيمة المضافة ${rate}%</span><span>${f(inv.tax)}</span></div>` : ''}
      </div>
      <div class="tot kv"><span>${isRet ? 'المبلغ المسترد' : 'الإجمالي'}</span><span>${f(inv.total)} ${esc(cur)}</span></div>
      ${inv.paid_cash ? `<div class="kv"><span>نقدي</span><span>${f(inv.paid_cash)}</span></div>` : ''}
      ${inv.paid_card ? `<div class="kv"><span>شبكة</span><span>${f(inv.paid_card)}</span></div>` : ''}
      ${inv.credit ? `<div class="kv"><span>آجل (على الحساب)</span><span>${f(inv.credit)}</span></div>` : ''}
      ${inv.tendered ? `<div class="kv"><span>المدفوع</span><span>${f(inv.tendered)}</span></div><div class="kv b"><span>الباقي</span><span>${f(change)}</span></div>` : ''}
      ${t.show_barcode ? `<div class="bc">${P.code128(inv.number, { height: 34, module: 1.4 })}</div>` : ''}
      <div class="hr"></div>
      ${t.footer ? `<div class="c b">${esc(t.footer)}</div>` : ''}
      ${t.footer2 ? `<div class="c sm">${esc(t.footer2)}</div>` : ''}
      <div style="height:6mm"></div>
    </body></html>`;
  };

  P.shiftThermal = (sum, s = Q.settings) => {
    const t = s.print_thermal, sh = sum.shift;
    const kv = (k, v, b) => `<div class="kv ${b ? 'b' : ''}"><span>${k}</span><span>${v}</span></div>`;
    return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>${P.thermalCSS(t)}</style></head><body>
      <div class="c b lg">${storeName(s)}</div><div class="c b">تقرير إغلاق وردية #${sh.id}</div><div class="hr2"></div>
      ${kv('الكاشير', esc(sh.user_name))}${kv('الفتح', esc(Q.dt(sh.opened_at)))}${kv('الإغلاق', esc(Q.dt(sh.closed_at) || '—'))}
      <div class="hr"></div>
      ${kv('عدد فواتير البيع', sum.sales.n)}${kv('إجمالي المبيعات', f(sum.sales.total))}${kv('  نقدي', f(sum.sales.cash))}
      ${kv('  شبكة', f(sum.sales.card))}${kv('  آجل', f(sum.sales.credit))}${kv('الخصومات', f(sum.sales.discount))}
      ${kv('المرتجعات (' + sum.returns.n + ')', f(sum.returns.total))}${kv('صافي المبيعات', f(sum.net), 1)}
      <div class="hr"></div>
      ${kv('رصيد الافتتاح', f(sh.opening_cash))}${kv('النقد المتوقع', f(sum.expected_cash), 1)}
      ${sh.counted_cash != null ? kv('النقد الفعلي', f(sh.counted_cash), 1) + kv('الفرق', f(sh.counted_cash - sum.expected_cash)) : ''}
      <div class="hr"></div><div class="c sm">${esc(Q.dt(new Date().toISOString().replace('T', ' ')))}</div><div style="height:6mm"></div></body></html>`;
  };

  // ===== قالب A4 =====
  P.a4CSS = (a) => `@page{size:A4;margin:12mm}*{box-sizing:border-box}
    body{margin:0;font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif;font-size:12.5px;color:#1a1a1a;direction:rtl;line-height:1.55}
    .acc{color:${a.accent}}.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:14px;border-bottom:3px solid ${a.accent}}
    .st{display:flex;gap:14px;align-items:center}.st img{max-height:70px;max-width:150px;object-fit:contain}
    .st h1{margin:0;font-size:22px;color:${a.accent}}.st .sub{color:#555;font-size:12px}
    .ttl{text-align:left}.ttl h2{margin:0 0 6px;font-size:20px;color:${a.accent}}.meta td{padding:1px 0 1px 12px;font-size:12px}.meta td:first-child{color:#666}
    .boxes{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}.box{border:1px solid #ddd;border-radius:6px;padding:10px 12px}
    .box h4{margin:0 0 6px;font-size:11.5px;color:#666;font-weight:600}.box .nm{font-weight:700;font-size:14px}
    table.it{width:100%;border-collapse:collapse;margin-top:6px}.it th{background:${a.accent};color:#fff;font-weight:600;padding:7px 8px;text-align:right;font-size:12px}
    .it td{padding:7px 8px;border-bottom:1px solid #e5e5e5}.it tr:nth-child(even) td{background:#fafafa}.n{text-align:left;direction:ltr;font-variant-numeric:tabular-nums;white-space:nowrap}
    .sum{display:flex;justify-content:space-between;gap:20px;margin-top:14px;align-items:flex-start}.terms{flex:1;font-size:11.5px;color:#444}
    .tot{width:290px;border:1px solid #ddd;border-radius:6px;overflow:hidden}.tot div{display:flex;justify-content:space-between;padding:6px 12px;border-bottom:1px solid #eee}
    .tot .g{background:${a.accent};color:#fff;font-weight:700;font-size:15px;border:0}
    .sig{display:flex;justify-content:space-between;margin-top:46px;gap:30px}.sig div{flex:1;text-align:center;border-top:1px solid #999;padding-top:6px;color:#555;font-size:12px}
    .ft{margin-top:24px;padding-top:8px;border-top:1px solid #ddd;text-align:center;color:#777;font-size:11px}.bc svg{height:44px;width:auto}`;

  // doc: { kind:'invoice'|'purchase', title, number, date, party:{label,name,phone,address,tax_no}, items:[{name,sku,qty,unit,price,discount,total}], subtotal, discount, tax, total, paid, remain, notes, extra:[[k,v]] }
  P.a4Doc = (d, s = Q.settings) => {
    const a = s.print_a4, st = s.store, cur = d.currencyLabel || s.currency;
    const f = d.dec != null ? (x) => Q.fmt(x, d.dec) : (x) => Q.fmt(x, s.decimals);
    const showSku = a.show_sku && d.items.some((i) => i.sku || i.barcode);
    const rows = d.items.map((i, k) => `<tr><td>${k + 1}</td><td><b>${esc(i.name)}</b></td>${showSku ? `<td class="n">${esc(i.sku || i.barcode || '')}</td>` : ''}
      <td class="n">${Q.qty(i.qty)}</td><td>${esc(i.unit || '')}</td><td class="n">${f(i.price)}</td>${d.hasDiscount ? `<td class="n">${f(i.discount || 0)}</td>` : ''}<td class="n"><b>${f(i.total)}</b></td></tr>`).join('');
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(d.number)}</title>
      <link rel="stylesheet" href="/shared/fonts.css"><style>${P.a4CSS(a)}</style></head><body>
      <div class="hd"><div class="st">${a.show_logo && st.logo ? `<img src="${st.logo}">` : ''}<div>
        <h1>${esc(st.name_ar || st.name)}</h1>${st.name_ar && st.name ? `<div class="b">${esc(st.name)}</div>` : ''}
        ${st.activity ? `<div class="sub">${esc(st.activity)}</div>` : ''}
        <div class="sub">${[st.address, st.phone && `هاتف: <span dir="ltr">${esc(st.phone)}</span>`, st.email].filter(Boolean).map((x) => (x.includes('<span') ? x : esc(x))).join(' · ')}</div>
        <div class="sub">${a.show_tax_no && st.tax_no ? `الرقم الضريبي: ${esc(st.tax_no)}` : ''}${a.show_cr_no && st.cr_no ? ` · السجل التجاري: ${esc(st.cr_no)}` : ''}</div>
      </div></div>
      <div class="ttl"><h2>${esc(d.title)}</h2><table class="meta"><tr><td>الرقم</td><td><b>${esc(d.number)}</b></td></tr><tr><td>التاريخ</td><td>${esc(Q.dt(d.date))}</td></tr>
        ${(d.extra || []).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
        ${a.show_barcode ? `<div class="bc">${P.code128(d.number, { height: 30, module: 1.2, showText: false })}</div>` : ''}</div></div>
      ${a.show_customer_box ? `<div class="boxes"><div class="box"><h4>${esc(d.party.label)}</h4><div class="nm">${esc(d.party.name || '—')}</div>
        ${d.party.phone ? `<div>هاتف: <span dir="ltr">${esc(d.party.phone)}</span></div>` : ''}${d.party.address ? `<div>${esc(d.party.address)}</div>` : ''}
        ${d.party.tax_no ? `<div>الرقم الضريبي: ${esc(d.party.tax_no)}</div>` : ''}</div>
        <div class="box"><h4>تفاصيل الدفع</h4>${(d.payInfo || []).map(([k, v]) => `<div style="display:flex;justify-content:space-between"><span>${esc(k)}</span><b class="n">${esc(v)}</b></div>`).join('')}</div></div>` : '<div style="height:14px"></div>'}
      <table class="it"><thead><tr><th style="width:30px">#</th><th>الصنف</th>${showSku ? '<th>الرمز</th>' : ''}<th>الكمية</th><th>الوحدة</th><th>السعر</th>${d.hasDiscount ? '<th>الخصم</th>' : ''}<th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="sum"><div class="terms">${a.show_words !== false ? `<div style="margin-bottom:6px;padding:6px 10px;background:#f6f6f6;border-radius:4px"><b>المبلغ كتابةً:</b> ${esc(P.words(d.total, d.cur || 'IQD'))}</div>` : ''}
        ${d.notes ? `<div><b>ملاحظات:</b> ${esc(d.notes)}</div>` : ''}
        ${a.terms ? `<div style="margin-top:6px"><b>الشروط والأحكام:</b><br>${esc(a.terms).replace(/\n/g, '<br>')}</div>` : ''}
        ${a.show_bank && a.bank_info ? `<div style="margin-top:6px"><b>بيانات الحساب البنكي:</b><br>${esc(a.bank_info).replace(/\n/g, '<br>')}</div>` : ''}</div>
        <div class="tot"><div><span>المجموع</span><span class="n">${f(d.subtotal)}</span></div>
          ${d.discount ? `<div><span>الخصم</span><span class="n">-${f(d.discount)}</span></div>` : ''}
          ${d.tax ? `<div><span>الإجمالي قبل الضريبة</span><span class="n">${f(d.total - d.tax)}</span></div><div><span>ضريبة القيمة المضافة ${d.rate ?? ''}%</span><span class="n">${f(d.tax)}</span></div>` : ''}
          <div class="g"><span>الإجمالي ${esc(cur)}</span><span class="n">${f(d.total)}</span></div>
          ${d.remain ? `<div><span>المدفوع</span><span class="n">${f(d.paid)}</span></div><div><span>المتبقي</span><span class="n"><b>${f(d.remain)}</b></span></div>` : ''}</div></div>
      ${a.show_signature ? '<div class="sig"><div>توقيع المستلم</div><div>الختم</div><div>توقيع البائع</div></div>' : ''}
      ${a.footer ? `<div class="ft">${esc(a.footer)}</div>` : ''}
    </body></html>`;
  };

  P.a4Invoice = (inv, s = Q.settings) => P.a4Doc({
    title: inv.type === 'return' ? 'إشعار دائن (مرتجع مبيعات)' : s.print_a4.title,
    number: inv.number, date: inv.date, rate: inv.tax_rate,
    extra: [...(inv.ref_number ? [['عن فاتورة', inv.ref_number]] : []), ...(inv.user_name ? [['البائع', inv.user_name]] : [])],
    party: { label: 'العميل', name: inv.customer_name || 'عميل نقدي', phone: inv.customer_phone, address: inv.customer_address, tax_no: inv.customer_tax_no },
    payInfo: [['طريقة الدفع', Q.METHODS[inv.method] || inv.method], ...(inv.paid_cash ? [['نقدي', f(inv.paid_cash)]] : []),
      ...(inv.paid_card ? [['شبكة', f(inv.paid_card)]] : []), ...(inv.credit ? [['آجل', f(inv.credit)]] : [])],
    items: inv.items, hasDiscount: inv.items.some((i) => i.discount), subtotal: inv.subtotal, discount: inv.discount, tax: inv.tax, total: inv.total,
    paid: Q.n(inv.paid_cash + inv.paid_card), remain: inv.credit, notes: inv.notes,
  }, s);

  P.a4Purchase = (p, s = Q.settings) => P.a4Doc({
    title: p.type === 'preturn' ? 'مرتجع مشتريات' : 'فاتورة مشتريات', cur: p.currency, number: p.number, date: p.date, rate: p.tax && p.total ? s.tax.rate : '',
    currencyLabel: p.currency === 'USD' ? 'دولار $' : s.currency, dec: p.currency === 'USD' ? 2 : s.decimals,
    extra: [...(p.ref ? [['مرجع المورد', p.ref]] : []), ...(p.ref_number ? [['عن فاتورة', p.ref_number]] : []), ...(p.currency === 'USD' ? [['العملة', 'دولار أمريكي'], ['سعر الصرف', f(p.rate, 0)], ['المعادل بالدينار', f(p.total * p.rate, 0)]] : [])],
    party: { label: 'المورد', name: p.supplier_name, phone: p.supplier_phone, address: p.supplier_address, tax_no: p.supplier_tax_no },
    payInfo: [['طريقة الدفع', Q.METHODS[p.method] || p.method], ['المدفوع', Q.fmtc(p.paid, p.currency)], ['المتبقي', Q.fmtc(p.total - p.paid, p.currency)]],
    items: p.items.map((i) => ({ ...i, price: i.cost })), subtotal: p.subtotal, discount: p.discount, tax: p.tax, total: p.total,
    paid: p.paid, remain: Q.n(p.total - p.paid), notes: p.notes,
  }, s);

  P.a4Voucher = (v, s = Q.settings) => {
    const a = s.print_a4, st = s.store;
    const title = { receipt: 'سند قبض', payment: 'سند صرف', expense: 'سند صرف مصروف' }[v.kind];
    return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>${P.a4CSS(a)} .vb{border:1px solid #ccc;border-radius:8px;padding:18px;margin-top:18px;font-size:14px}.vb div{padding:7px 0;border-bottom:1px dashed #ddd}</style></head><body>
      <div class="hd"><div class="st">${a.show_logo && st.logo ? `<img src="${st.logo}">` : ''}<div><h1>${esc(st.name_ar || st.name)}</h1><div class="sub">${esc(st.phone || '')}</div></div></div>
      <div class="ttl"><h2>${title}</h2><table class="meta"><tr><td>الرقم</td><td><b>${esc(v.number)}</b></td></tr><tr><td>التاريخ</td><td>${esc(v.date)}</td></tr></table></div></div>
      <div class="vb"><div><b>${v.kind === 'receipt' ? 'استلمنا من' : 'صرفنا إلى'}:</b> ${esc(v.party_name || v.account_name || '')}</div>
      <div><b>مبلغ وقدره:</b> <span class="acc" style="font-size:18px;font-weight:700">${esc(Q.fmtc(v.amount, v.currency))}</span>${v.currency === 'USD' ? ` <span style="color:#666">(سعر الصرف ${f(v.rate, 0)} = ${f(v.base_amount, 0)} ${esc(s.currency)})</span>` : ''}</div>
      <div><b>طريقة الدفع:</b> ${esc(Q.METHODS[v.method] || v.method)}</div><div><b>البيان:</b> ${esc(v.notes || '')}</div></div>
      <div class="sig"><div>المستلم</div><div>المحاسب</div><div>المدير</div></div></body></html>`;
  };

  // تقرير عام A4 (جداول التقارير)
  P.report = (title, sub, html, s = Q.settings) => `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${P.a4CSS(s.print_a4)}
    table{width:100%;border-collapse:collapse;font-size:11.5px}th{background:#f2f2f2;text-align:right;padding:5px 6px;border-bottom:1px solid #999}
    td{padding:4px 6px;border-bottom:1px solid #e5e5e5;text-align:right}td.n,th.n{text-align:left;direction:ltr;font-variant-numeric:tabular-nums}tfoot td{font-weight:700;border-top:1px solid #999}
    .card{border:0}.card-h{display:none}.no-print,button,.btn{display:none!important}h3{font-size:14px;margin:14px 0 6px}</style></head><body>
    <div class="hd"><div class="st"><div><h1>${esc(s.store.name_ar || s.store.name)}</h1></div></div><div class="ttl"><h2>${esc(title)}</h2><div class="sub">${esc(sub || '')}</div></div></div>
    <div style="margin-top:12px">${html}</div></body></html>`;

  // ملصقات الباركود
  P.labels = (list, { w = 38, h = 25, showPrice = true } = {}, s = Q.settings) => `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
    @page{size:${w}mm ${h}mm;margin:0}body{margin:0;font-family:Tahoma,Arial,sans-serif}
    .l{width:${w}mm;height:${h}mm;padding:1.2mm 1.5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;page-break-after:always;overflow:hidden;text-align:center}
    .s{font-size:7px;font-weight:700}.nm{font-size:8px;line-height:1.15;max-height:2.4em;overflow:hidden}.pr{font-size:10px;font-weight:700}.l svg{width:100%;height:${h * 0.42}mm}</style></head><body>
    ${list.map((p) => `<div class="l"><div class="s">${esc(s.store.name)}</div><div class="nm">${esc(p.name)}</div>${P.code128(p.barcode, { height: 30, module: 1.3 })}${showPrice ? `<div class="pr">${f(p.price)} ${esc(s.currency)}</div>` : ''}</div>`).join('')}
    </body></html>`;
})();
