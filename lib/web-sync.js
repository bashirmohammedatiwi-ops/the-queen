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

let state = { running: false, last_sync: null, last_ok: null, last_error: null, last_report: null };
let notify = () => {};
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
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, o.no, o.created_at, localNow(), o.status || 'new', o.name, o.phone, o.governorate, o.city, o.address, o.notes,
          JSON.stringify(o.items || []), o.subtotal, o.delivery_fee, o.total, localNow());
        report.orders++;
        notify('web_order', { no: o.no, name: o.name, total: o.total });
      }
      got.push(o.no);
    }
    if (got.length) await call(cfg, 'POST', '/api/sync/orders/ack', { nos: got });
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
    if (c.hero_image) wanted.add(c.hero_image);
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
      announcement: c.announcement, about: c.about, policies: c.policies,
      delivery: { baghdad: Number(c.fee_baghdad) || 0, other: Number(c.fee_other) || 0, free_over: Number(c.free_over) || 0, min_order: Number(c.min_order) || 0, fees: c.fees || {} },
      ordering: { enabled: c.ordering !== false, closed_message: c.closed_message },
    });
    // 5) الكتالوج: المنتجات المنشورة بالكمية المتاحة (بعد خصم المحجوز لطلبات الموقع)
    const reserved = reservedQty();
    const catIds = new Set(prods.map((p) => p.category_id).filter(Boolean));
    const categories = all('SELECT id, name, sort FROM categories ORDER BY sort, name').filter((x) => catIds.has(x.id));
    const products = prods.map((p) => ({
      id: p.id, name: p.name, category_id: p.category_id, price: p.price, compare_price: p.web_compare_price > p.price ? p.web_compare_price : null,
      stock: Math.max(0, p.stock - (reserved.get(p.id) || 0)), unit: p.unit, description: p.web_description || '', images: JSON.parse(p.web_images || '[]'),
      featured: !!p.web_featured, is_new: !!p.web_new,
    }));
    await call(cfg, 'PUT', '/api/sync/catalog', { categories, products });
    report.products = products.length;
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

// مزامنة دورية في الخلفية
let timer = null;
export function scheduleSync() {
  clearInterval(timer);
  const cfg = getSettings().web;
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
