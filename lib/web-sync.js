// مزامنة النظام الإداري مع المتجر الإلكتروني على السيرفر
// النظام الإداري هو المصدر: يرسل المنتجات المنشورة والصور والمحتوى، ويسحب الطلبات الجديدة ويرسل تحديثات حالاتها
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, get, run, tx, getSettings, saveSettings, localNow, DATA_DIR } from './db.js';
import { bad, createSale } from './services.js';

export const MEDIA_DIR = path.join(DATA_DIR, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

export const WEB_STATUS = { new: 'جديد', confirmed: 'مؤكد', shipping: 'قيد التوصيل', delivered: 'تم التسليم', cancelled: 'ملغي' };
const OPEN = ['new', 'confirmed', 'shipping'];

let state = { running: false, live: false, last_sync: null, last_ok: null, last_error: null, last_report: null };
let notify = () => {};
// تطبيق التعديلات القادمة من لوحة التحكم عن بعد (تُسجَّل من server.js لأنها تستخدم دوال الأصناف)
let applyRemote = null;
export function onRemoteChange(fn) { applyRemote = fn; }
export const webState = () => ({ ...state });
export function onWebEvent(fn) { notify = fn; }

// ===== الصور =====
export function saveMedia(dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if (!m) throw bad('صورة غير صالحة');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3e6) throw bad('حجم الصورة كبير (الحد 3 ميغابايت)');
  const name = crypto.createHash('sha1').update(buf).digest('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(MEDIA_DIR, name), buf);
  return name;
}

// الكمية المحجوزة لطلبات الموقع المفتوحة التي لم تتحول لفاتورة بعد
export function reservedQty() {
  const map = new Map();
  for (const o of all(`SELECT items FROM web_orders WHERE invoice_id IS NULL AND status IN ('new','confirmed','shipping')`))
    for (const i of JSON.parse(o.items || '[]')) map.set(i.id, (map.get(i.id) || 0) + Number(i.qty || 0));
  return map;
}

async function call(cfg, method, p, body) {
  const base = String(cfg.url || '').replace(/\/+$/, '');
  const r = await fetch(base + p, {
    method, signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', 'X-Sync-Key': cfg.key },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let d = null; try { d = await r.json(); } catch { /* */ }
  if (!r.ok) throw new Error(d?.error || `خطأ من الموقع (${r.status})`);
  return d;
}

export async function testConnection(cfg = getSettings().web) {
  if (!cfg.url || !cfg.key) throw bad('أدخل رابط الموقع ومفتاح المزامنة');
  return call(cfg, 'GET', '/api/sync/ping');
}

// ===== المزامنة الكاملة =====
// إن كانت مزامنة تعمل الآن، تُضاف مزامنة واحدة بعدها (حتى لا تضيع أي تحديثات)
let current = null, queued = null;
export function syncNow() {
  if (!current) { current = doSync().finally(() => { current = null; }); return current; }
  if (!queued) queued = current.catch(() => {}).then(() => { queued = null; return syncNow(); });
  return queued;
}
async function doSync() {
  const s = getSettings();
  const cfg = s.web;
  if (!cfg.url || !cfg.key) throw bad('الموقع غير مربوط بعد — أدخل الرابط والمفتاح من إعدادات المتجر الإلكتروني');
  state.running = true;
  const report = { products: 0, images: 0, orders: 0, statuses: 0 };
  try {
    await call(cfg, 'GET', '/api/sync/ping');
    // 1) سحب الطلبات الجديدة أولاً (حتى يحسب المخزون المحجوز بشكل صحيح)
    const { orders } = await call(cfg, 'GET', '/api/sync/orders');
    const got = [];
    for (const o of orders) {
      if (!get('SELECT 1 FROM web_orders WHERE no=?', o.no)) {
        run(`INSERT INTO web_orders(no,created_at,received_at,status,name,phone,governorate,city,address,notes,items,subtotal,delivery_fee,total,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, o.no, o.created_at, localNow(), 'new', o.name, o.phone, o.governorate, o.city, o.address, o.notes,
          JSON.stringify(o.items || []), o.subtotal, o.delivery_fee, o.total, localNow());
        report.orders++;
        notify('web_order', { no: o.no, name: o.name, total: o.total });
      }
      got.push(o.no);
    }
    if (got.length) await call(cfg, 'POST', '/api/sync/orders/ack', { nos: got });
    // 1ب) تطبيق التعديلات المُرسلة من لوحة التحكم عن بعد (بالترتيب) ثم إبلاغ الموقع بالنتيجة
    report.remote = 0;
    if (applyRemote) {
      const { changes } = await call(cfg, 'GET', '/api/sync/changes');
      if (changes && changes.length) {
        const results = [];
        for (const c of changes) {
          try {
            await fetchMissingMedia(cfg, c.payload);
            const r = await applyRemote(c);
            results.push({ id: c.id, ok: true, result: r ?? null }); report.remote++;
          } catch (e) { results.push({ id: c.id, ok: false, error: String(e.message || e).slice(0, 300) }); }
        }
        await call(cfg, 'POST', '/api/sync/changes/ack', { results });
        if (report.remote) notify('products', { stock: true });
      }
    }
    // 2) إرسال تحديثات حالات الطلبات (لصفحة تتبع الطلب عند الزبون)
    for (const o of all('SELECT no, status FROM web_orders WHERE status_dirty=1')) {
      // لا تُعلَّم كمُرسلة إلا إذا لم تتغير الحالة أثناء الإرسال
      try { await call(cfg, 'PUT', '/api/sync/orders/' + encodeURIComponent(o.no), { status: o.status }); run('UPDATE web_orders SET status_dirty=0 WHERE no=? AND status=?', o.no, o.status); report.statuses++; }
      catch (e) { if (!/غير موجود/.test(e.message)) throw e; run('UPDATE web_orders SET status_dirty=0 WHERE no=? AND status=?', o.no, o.status); }
    }
    // 3) الصور الناقصة على الموقع
    const prods = all(`SELECT p.*, c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=1 AND p.web_published=1`);
    const c = s.web_content;
    let logoFile = '';
    try { logoFile = s.store.logo ? saveMedia(s.store.logo) : ''; } catch { /* */ }
    const wanted = new Set();
    for (const p of prods) for (const f of JSON.parse(p.web_images || '[]')) wanted.add(f);
    // الأقسام المستخدمة (مع أقسامها الرئيسية) والبراندات المستخدمة فقط
    const usedCats = new Set(), usedBrands = new Set();
    for (const p of prods) { if (p.web_cat_id) usedCats.add(p.web_cat_id); if (p.web_sub_id) usedCats.add(p.web_sub_id); if (p.web_brand_id) usedBrands.add(p.web_brand_id); }
    const webCats = all('SELECT id, name, parent_id, sort, image FROM web_categories ORDER BY sort, name').filter((x) => usedCats.has(x.id));
    const webBrands = all('SELECT id, name, logo, sort FROM web_brands ORDER BY sort, name').filter((x) => usedBrands.has(x.id));
    for (const x of webCats) if (x.image) wanted.add(x.image);
    for (const x of webBrands) if (x.logo) wanted.add(x.logo);
    if (c.hero_image) wanted.add(c.hero_image);
    const banners = all('SELECT * FROM web_banners WHERE active=1 ORDER BY sort, id');
    for (const b of banners) { wanted.add(b.image); if (b.image_m) wanted.add(b.image_m); }
    if (logoFile) wanted.add(logoFile);
    const { files } = await call(cfg, 'GET', '/api/sync/media');
    const remote = new Set(files);
    for (const f of wanted) {
      if (remote.has(f)) continue;
      const fp = path.join(MEDIA_DIR, f);
      if (!fs.existsSync(fp)) continue;
      const ext = path.extname(f).slice(1);
      await call(cfg, 'POST', '/api/sync/media', { data: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + fs.readFileSync(fp).toString('base64') });
      report.images++;
    }
    // 4) المحتوى والإعدادات
    await call(cfg, 'PUT', '/api/sync/settings', {
      store: { name: s.store.name, name_ar: s.store.name_ar, tagline: c.tagline, phone: c.phone || s.store.phone, whatsapp: c.whatsapp, instagram: c.instagram,
        facebook: c.facebook, tiktok: c.tiktok, address: c.address || s.store.address, email: c.email || s.store.email, logo: logoFile, currency: s.currency },
      hero: { title: c.hero_title, subtitle: c.hero_subtitle, cta: c.hero_cta, image: c.hero_image || '' },
      banners: banners.map((b) => ({ id: b.id, place: b.place, image: b.image, image_m: b.image_m, title: b.title, subtitle: b.subtitle, cta: b.cta,
        link_type: b.link_type, link_value: b.link_value, starts: b.starts, ends: b.ends, theme: b.theme })),
      announcement: c.announcement, about: c.about, policies: c.policies,
      delivery: { baghdad: Number(c.fee_baghdad) || 0, other: Number(c.fee_other) || 0, free_over: Number(c.free_over) || 0, min_order: Number(c.min_order) || 0, fees: c.fees || {} },
      ordering: { enabled: c.ordering !== false, closed_message: c.closed_message },
    });
    // 5) الكتالوج: المنتجات المنشورة بالكمية المتاحة (بعد خصم المحجوز لطلبات الموقع)
    const reserved = reservedQty();
    const categories = webCats, brands = webBrands;
    const products = prods.map((p) => ({
      id: p.id, name: p.name, category_id: p.web_cat_id || null, sub_id: p.web_sub_id || null, brand_id: p.web_brand_id || null, price: p.price, compare_price: p.web_compare_price > p.price ? p.web_compare_price : null,
      stock: Math.max(0, p.stock - (reserved.get(p.id) || 0)), unit: p.unit, description: p.web_description || '', images: JSON.parse(p.web_images || '[]'),
      featured: !!p.web_featured, is_new: !!p.web_new,
    }));
    await call(cfg, 'PUT', '/api/sync/catalog', { categories, brands, products });
    report.products = products.length;
    // 6) نسخة كاملة للوحة التحكم عن بعد (كل الأصناف والأقسام والبنرات والمحتوى والمستخدمين المخولين)
    await call(cfg, 'PUT', '/api/sync/admin', adminSnapshot(s, reserved));
    state = { ...state, last_sync: localNow(), last_ok: localNow(), last_error: null, last_report: report };
    notify('web_sync', state);
    return report;
  } catch (e) {
    const msg = e.name === 'TimeoutError' || /fetch failed|ECONN|ENOTFOUND|EAI_AGAIN/.test(String(e.cause?.code || e.message)) ? 'تعذر الاتصال بالموقع — تحقق من الإنترنت والرابط' : e.message;
    state = { ...state, last_sync: localNow(), last_error: msg };
    notify('web_sync', state);
    throw bad(msg);
  } finally { state.running = false; }
}

// دفع فوري للموقع بعد أي تغيير في الأصناف أو الأسعار أو المخزون (مع تجميع التغييرات المتتالية)
let pushTimer = null;
export function pushSoon(ms = 2500) {
  const cfg = getSettings().web;
  if (!cfg.enabled || !cfg.url || !cfg.key) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow().catch(() => {}), ms);
  pushTimer.unref?.();
}

// اتصال مباشر دائم بالموقع: يصل كل طلب جديد فور إرساله من الزبون
let liveCtl = null, liveGen = 0;
function startLive(cfg) {
  liveCtl?.abort(); liveCtl = null; state.live = false;
  if (!cfg.enabled || !cfg.url || !cfg.key) return;
  const gen = ++liveGen;
  let wait = 3000;
  const loop = async () => {
    while (gen === liveGen) {
      const ctl = new AbortController(); liveCtl = ctl;
      let idle;
      const kick = () => { clearTimeout(idle); idle = setTimeout(() => ctl.abort(), 70000); };
      try {
        const r = await fetch(String(cfg.url).replace(/\/+$/, '') + '/api/sync/events', { headers: { 'X-Sync-Key': cfg.key, Accept: 'text/event-stream' }, signal: ctl.signal });
        if (!r.ok || !r.body) throw new Error('live ' + r.status);
        state.live = true; wait = 3000; kick(); notify('web_sync', state);
        const dec = new TextDecoder(); let buf = '';
        for await (const chunk of r.body) {
          kick();
          buf += dec.decode(chunk, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            if (/^event: (order|change)/m.test(block)) syncNow().catch(() => {});
          }
        }
      } catch { /* إعادة المحاولة */ }
      clearTimeout(idle);
      if (state.live) { state.live = false; notify('web_sync', state); }
      if (gen !== liveGen) return;
      await new Promise((res) => setTimeout(res, wait).unref?.());
      wait = Math.min(wait * 2, 60000);
    }
  };
  loop();
}

// تنزيل الصور التي رُفعت من لوحة التحكم عن بعد ولا توجد محلياً
async function fetchMissingMedia(cfg, payload) {
  const names = new Set(JSON.stringify(payload || {}).match(/[a-f0-9]{40}\.(?:jpg|png|webp)/g) || []);
  for (const n of names) {
    const fp = path.join(MEDIA_DIR, n);
    if (fs.existsSync(fp)) continue;
    const r = await fetch(String(cfg.url).replace(/\/+$/, '') + '/media/' + n, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('تعذر تنزيل صورة من الموقع');
    const buf = Buffer.from(await r.arrayBuffer());
    if (crypto.createHash('sha1').update(buf).digest('hex') !== n.slice(0, 40)) throw new Error('صورة تالفة');
    fs.writeFileSync(fp, buf);
  }
}
function adminSnapshot(s, reserved) {
  return {
    synced_at: new Date().toISOString(),
    currency: s.currency,
    products: all(`SELECT id, name, barcode, unit, price, cost, stock, min_stock, category_id, active, web_published, web_description, web_images, web_featured, web_new,
      web_compare_price, web_cat_id, web_sub_id, web_brand_id, created_at FROM products WHERE active=1 ORDER BY name`)
      .map((p) => ({ ...p, web_images: JSON.parse(p.web_images || '[]'), reserved: reserved.get(p.id) || 0 })),
    store_categories: all('SELECT id, name FROM categories ORDER BY sort, name'),
    web_categories: all('SELECT id, name, parent_id, sort, image FROM web_categories ORDER BY sort, name'),
    brands: all('SELECT id, name, logo, sort FROM web_brands ORDER BY sort, name'),
    banners: all('SELECT * FROM web_banners ORDER BY place, sort, id'),
    content: s.web_content,
    units: [...new Set(all('SELECT DISTINCT unit FROM products WHERE unit IS NOT NULL').map((r) => r.unit).concat(['حبة', 'علبة', 'قطعة', 'مل', 'غرام']))],
    idmap: Object.fromEntries(all('SELECT temp, real_id FROM web_remote_ids').map((r) => [r.temp, r.real_id])),
    users: all("SELECT id, name, username, password, role FROM users WHERE active=1 AND role IN ('admin','manager') AND username IS NOT NULL AND password IS NOT NULL"),
  };
}

// مزامنة دورية في الخلفية
let timer = null;
export function scheduleSync() {
  clearInterval(timer);
  const cfg = getSettings().web;
  startLive(cfg);
  if (!cfg.enabled || !cfg.url || !cfg.key) return;
  const sec = Math.max(30, Number(cfg.interval) || 60);
  timer = setInterval(() => { syncNow().catch(() => {}); }, sec * 1000);
  timer.unref?.();
  setTimeout(() => syncNow().catch(() => {}), 3000).unref?.();
}

// ===== إدارة طلبات الموقع =====
export function setOrderStatus(id, status, user, opts = {}) {
  if (!WEB_STATUS[status]) throw bad('حالة غير صحيحة');
  return tx(() => {
    const o = get('SELECT * FROM web_orders WHERE id=?', id);
    if (!o) throw bad('الطلب غير موجود');
    if (o.status === 'delivered' && status !== 'delivered') throw bad('الطلب مُسلّم وتم إصدار فاتورته — استخدم المرتجع من الفاتورة');
    if (o.status === 'cancelled' && status !== 'cancelled' && o.invoice_id) throw bad('لا يمكن إعادة فتح طلب له فاتورة');
    let invoiceId = o.invoice_id;
    // عند التسليم: تُصدر فاتورة مبيعات تلقائياً ويُخصم المخزون (الدفع عند الاستلام)
    if (status === 'delivered' && !invoiceId) {
      const items = JSON.parse(o.items || '[]');
      const phone = String(o.phone || '').trim();
      let cust = phone ? get('SELECT id FROM customers WHERE phone=?', phone) : null;
      if (!cust) cust = { id: Number(run('INSERT INTO customers(name,phone,address,notes) VALUES(?,?,?,?)', o.name, phone, [o.governorate, o.city, o.address].filter(Boolean).join(' - '), 'زبون من المتجر الإلكتروني').lastInsertRowid) };
      const method = opts.payment === 'card' ? 'card' : opts.payment === 'credit' ? 'credit' : 'cash';
      const sub = items.reduce((x, i) => x + Number(i.price) * Number(i.qty), 0);
      invoiceId = createSale({
        source: 'erp', customer_id: cust.id, items: items.filter((i) => get('SELECT 1 FROM products WHERE id=?', i.id)).map((i) => ({ product_id: i.id, qty: i.qty, price: i.price })),
        paid_cash: method === 'cash' ? sub : 0, paid_card: method === 'card' ? sub : 0, notes: `طلب المتجر الإلكتروني ${o.no}${o.delivery_fee ? ` — أجور التوصيل ${o.delivery_fee} (تُحصّل لشركة التوصيل)` : ''}`,
      }, user);
      run("UPDATE invoices SET source='web' WHERE id=?", invoiceId);
    }
    run('UPDATE web_orders SET status=?, invoice_id=?, status_dirty=1, updated_at=?, staff_notes=COALESCE(?, staff_notes) WHERE id=?', status, invoiceId || null, localNow(), opts.notes ?? null, id);
    return get('SELECT * FROM web_orders WHERE id=?', id);
  });
}
export const isOpen = (s) => OPEN.includes(s);
