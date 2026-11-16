// The Queen — خادم المتجر الإلكتروني (يعمل على السيرفر في حاوية مستقلة)
// - واجهة عامة للزبائن (عرض المنتجات، السلة، الطلب، تتبع الطلب)
// - واجهة مزامنة محمية بمفتاح للنظام الإداري (رفع المنتجات والصور والإعدادات، سحب الطلبات وتحديث حالاتها)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const MEDIA = path.join(DATA, 'media');
const PORT = Number(process.env.PORT) || 8080;
const SYNC_KEY = process.env.SYNC_KEY || '';
fs.mkdirSync(MEDIA, { recursive: true });
if (!SYNC_KEY || SYNC_KEY.length < 24) console.warn('  تنبيه: SYNC_KEY غير مضبوط أو قصير — المزامنة معطلة');

// ===== قاعدة البيانات =====
const db = new DatabaseSync(path.join(DATA, 'web.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT, sort INTEGER DEFAULT 0, image TEXT);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE, name TEXT NOT NULL, category_id INTEGER, price REAL NOT NULL, compare_price REAL,
  stock REAL NOT NULL DEFAULT 0, unit TEXT, description TEXT, images TEXT NOT NULL DEFAULT '[]', featured INTEGER DEFAULT 0,
  is_new INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, no TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
  name TEXT NOT NULL, phone TEXT NOT NULL, governorate TEXT, city TEXT, address TEXT, notes TEXT,
  items TEXT NOT NULL, subtotal REAL NOT NULL, delivery_fee REAL NOT NULL DEFAULT 0, total REAL NOT NULL,
  history TEXT NOT NULL DEFAULT '[]', pulled INTEGER NOT NULL DEFAULT 0, updated_at TEXT, ip TEXT
);
CREATE INDEX IF NOT EXISTS ix_orders_pulled ON orders(pulled);
`);
const addCol = (t, c, d) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); };
addCol('orders', 'token', 'TEXT');
addCol('categories', 'parent_id', 'INTEGER');
addCol('products', 'sub_id', 'INTEGER');
addCol('products', 'brand_id', 'INTEGER');
db.exec('CREATE TABLE IF NOT EXISTS brands (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT, logo TEXT, sort INTEGER DEFAULT 0)');
for (const r of db.prepare('SELECT id FROM orders WHERE token IS NULL').all()) db.prepare('UPDATE orders SET token=? WHERE id=?').run(crypto.randomBytes(9).toString('base64url'), r.id);
const all = (s, ...p) => db.prepare(s).all(...p);
const get = (s, ...p) => db.prepare(s).get(...p);
const run = (s, ...p) => db.prepare(s).run(...p);
const now = () => new Date().toISOString();

const DEFAULTS = {
  store: { name: 'The Queen', name_ar: 'ذا كوين', tagline: 'جمالكِ يستحق الأفضل', phone: '', whatsapp: '', instagram: '', facebook: '', tiktok: '', address: '', email: '', logo: '', currency: 'د.ع' },
  hero: { title: 'تألّقي كملكة', subtitle: 'عطور ومستحضرات تجميل أصلية مختارة بعناية، توصيل لجميع محافظات العراق', cta: 'تسوّقي الآن', image: '' },
  announcement: 'توصيل سريع لجميع المحافظات — الدفع عند الاستلام',
  about: 'The Queen وجهتكِ للجمال الأصيل. نختار لكِ أفضل العطور ومستحضرات التجميل والعناية من علامات موثوقة، ونوصلها إلى باب بيتكِ بكل عناية.',
  policies: 'الدفع نقداً عند الاستلام.\nيمكن الاستبدال خلال 7 أيام بشرط أن يكون المنتج بحالته الأصلية وغير مستخدم.\nيتم التواصل لتأكيد الطلب قبل الشحن.',
  delivery: { baghdad: 5000, other: 7000, free_over: 0, min_order: 0, fees: {} },
  ordering: { enabled: true, closed_message: 'استقبال الطلبات متوقف مؤقتاً، يرجى المحاولة لاحقاً.' },
  banners: [],
};
function getSettings() {
  const s = structuredClone(DEFAULTS);
  for (const r of all('SELECT key, value FROM settings')) {
    try { const v = JSON.parse(r.value); s[r.key] = v && typeof v === 'object' && !Array.isArray(v) && typeof s[r.key] === 'object' && !Array.isArray(s[r.key]) ? { ...s[r.key], ...v } : v; } catch { /* */ }
  }
  return s;
}
export const GOVERNORATES = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء', 'بابل', 'الأنبار', 'ديالى', 'ذي قار', 'كركوك', 'صلاح الدين', 'السليمانية', 'دهوك', 'واسط', 'ميسان', 'القادسية', 'المثنى', 'حلبجة'];
function deliveryFee(gov, subtotal, s) {
  const d = s.delivery;
  if (d.free_over > 0 && subtotal >= d.free_over) return 0;
  if (d.fees && d.fees[gov] != null && d.fees[gov] !== '') return Number(d.fees[gov]) || 0;
  return gov === 'بغداد' ? Number(d.baghdad) || 0 : Number(d.other) || 0;
}

// ===== أدوات =====
class E extends Error { constructor(s, m) { super(m); this.status = s; } }
const send = (res, status, data, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
};
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new E(413, 'الطلب كبير جداً')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new E(400, 'بيانات غير صالحة')); } });
    req.on('error', reject);
  });
}
const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
const hits = new Map();
function limit(key, max, windowMs) {
  const t = Date.now(), arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) throw new E(429, 'طلبات كثيرة، يرجى المحاولة بعد قليل');
  arr.push(t); hits.set(key, arr);
}
setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (!v.some((x) => t - x < 3600e3)) hits.delete(k); }, 600e3).unref();
const keyOk = (req) => SYNC_KEY.length >= 24 && crypto.timingSafeEqual(crypto.createHash('sha256').update(String(req.headers['x-sync-key'] || '')).digest(), crypto.createHash('sha256').update(SYNC_KEY).digest());
const productOut = (p) => ({ id: p.id, slug: p.slug, name: p.name, category_id: p.category_id, sub_id: p.sub_id || null, brand_id: p.brand_id || null, price: p.price, compare_price: p.compare_price || null,
  in_stock: p.stock > 0, low_stock: p.stock > 0 && p.stock <= 3, unit: p.unit, description: p.description || '', images: JSON.parse(p.images || '[]'),
  featured: !!p.featured, is_new: !!p.is_new });
const slugify = (s, id) => (String(s).trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'p') + '-' + id;
const normPhone = (p) => {
  let d = String(p || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g, '');
  if (d.startsWith('964')) d = '0' + d.slice(3);
  if (d.length === 10 && d.startsWith('7')) d = '0' + d;
  return d;
};
// ===== التحديث المباشر (SSE) =====
// زوار الموقع: تحديث الأسعار والمخزون وحالة الطلب فوراً — النظام الإداري: إشعار فوري بالطلبات الجديدة
const live = new Set(), syncLive = new Set();
let liveSeq = 0;
function emit(set, type, data = {}) {
  const msg = `event: ${type}\ndata: ${JSON.stringify({ ...data, seq: ++liveSeq })}\n\n`;
  for (const c of set) { try { c.write(msg); } catch { set.delete(c); } }
}
setInterval(() => { for (const set of [live, syncLive]) for (const c of set) { try { c.write(': ping\n\n'); } catch { set.delete(c); } } }, 25000).unref();
function openStream(req, res, set, max) {
  const ip = clientIp(req);
  const mine = [...set].filter((c) => c.ip === ip).length;
  if (set.size >= max || mine >= 8) { res.writeHead(503, { 'Retry-After': '30' }); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 4000\n\n');
  res.ip = ip; set.add(res);
  req.on('close', () => set.delete(res));
}
const hashOf = (v) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex');
const lastHash = {};
const STATUS = { new: 'تم استلام الطلب', confirmed: 'تم تأكيد الطلب', shipping: 'الطلب في الطريق إليكِ', delivered: 'تم التسليم', cancelled: 'تم إلغاء الطلب' };

// ===== الواجهة العامة =====
const routes = [];
const R = (method, pattern, fn, auth = false) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, auth });

// البنرات: تُحل روابطها هنا وتُعرض فقط ضمن فترة الجدولة (بتوقيت بغداد)
function liveBanners(list) {
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const okImg = (x) => (x && /^[a-f0-9]{40}\.(jpg|webp|png)$/.test(x) ? x : null);
  return (Array.isArray(list) ? list : []).filter((b) => b && okImg(b.image) && (!b.starts || b.starts <= today) && (!b.ends || b.ends >= today)).map((b) => {
    let link = '';
    const v = b.link_value;
    if (b.link_type === 'category') { const c = get('SELECT slug FROM categories WHERE id=?', Number(v)); link = c ? '/c/' + encodeURIComponent(c.slug) : ''; }
    else if (b.link_type === 'brand') { const x = get('SELECT slug FROM brands WHERE id=?', Number(v)); link = x ? '/brand/' + encodeURIComponent(x.slug) : ''; }
    else if (b.link_type === 'product') { const x = get('SELECT slug FROM products WHERE id=?', Number(v)); link = x ? '/p/' + encodeURIComponent(x.slug) : ''; }
    else if (b.link_type === 'offers') link = '/shop?offers=1';
    else if (b.link_type === 'new') link = '/shop?new=1';
    else if (b.link_type === 'shop') link = '/shop';
    else if (b.link_type === 'url' && /^(https?:\/\/|\/)/.test(String(v || ''))) link = String(v);
    else if (b.link) link = String(b.link);
    return { id: b.id, place: ['hero', 'mid', 'tiles'].includes(b.place) ? b.place : 'hero', image: okImg(b.image), image_m: okImg(b.image_m), title: b.title || '', subtitle: b.subtitle || '', cta: b.cta || '', theme: b.theme === 'light' ? 'light' : 'dark', link };
  });
}
R('GET', '/api/store', () => {
  const s = getSettings();
  const cats = all(`SELECT c.id, c.name, c.slug, c.image, c.parent_id, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id OR p.sub_id=c.id) n FROM categories c ORDER BY c.sort, c.name`).filter((c) => c.n > 0);
  const brands = all(`SELECT b.id, b.name, b.slug, b.logo, (SELECT COUNT(*) FROM products p WHERE p.brand_id=b.id) n FROM brands b ORDER BY b.sort, b.name`).filter((b) => b.n > 0);
  return { store: s.store, hero: s.hero, announcement: s.announcement, about: s.about, policies: s.policies, banners: liveBanners(s.banners),
    delivery: { baghdad: s.delivery.baghdad, other: s.delivery.other, free_over: s.delivery.free_over, min_order: s.delivery.min_order, fees: s.delivery.fees },
    ordering: s.ordering, governorates: GOVERNORATES, categories: cats, brands, count: get('SELECT COUNT(*) n FROM products').n };
});
R('GET', '/api/products', ({ q }) => {
  const w = [], p = [];
  if (q.category) {
    const c = get('SELECT id FROM categories WHERE id=? OR slug=?', Number(q.category) || -1, String(q.category));
    w.push('(category_id=? OR sub_id=?)'); p.push(c ? c.id : -1, c ? c.id : -1);
  }
  if (q.brand) {
    const b = get('SELECT id FROM brands WHERE id=? OR slug=?', Number(q.brand) || -1, String(q.brand));
    w.push('brand_id=?'); p.push(b ? b.id : -1);
  }
  if (q.q) { w.push('(name LIKE ? OR description LIKE ? OR brand_id IN (SELECT id FROM brands WHERE name LIKE ?))'); p.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`); }
  if (q.ids) { const ids = String(q.ids).split(',').map(Number).filter(Boolean).slice(0, 100); w.push(`id IN (${ids.map(() => '?').join(',') || 'NULL'})`); p.push(...ids); }
  if (q.featured) w.push('featured=1');
  if (q.new) w.push('is_new=1');
  if (q.offers) w.push('compare_price > price');
  if (q.instock) w.push('stock > 0');
  if (q.min) { w.push('price >= ?'); p.push(Number(q.min) || 0); }
  if (q.max) { w.push('price <= ?'); p.push(Number(q.max) || 0); }
  const order = { price_asc: 'price ASC', price_desc: 'price DESC', new: 'is_new DESC, id DESC', name: 'name' }[q.sort] || '(stock>0) DESC, featured DESC, sort, id DESC';
  const limitN = Math.min(Number(q.limit) || 60, 200), offset = Math.max(0, Number(q.offset) || 0);
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) n FROM products ${where}`, ...p).n;
  const items = all(`SELECT * FROM products ${where} ORDER BY ${order} LIMIT ${limitN} OFFSET ${offset}`, ...p).map(productOut);
  return { total, items };
});
R('GET', '/api/products/:slug', ({ params }) => {
  const p = get('SELECT * FROM products WHERE slug=? OR id=?', params.slug, Number(params.slug) || -1);
  if (!p) throw new E(404, 'المنتج غير متوفر');
  const related = all(`SELECT * FROM products WHERE id<>? AND ((sub_id IS NOT NULL AND sub_id=?) OR category_id=? OR (brand_id IS NOT NULL AND brand_id=?))
    ORDER BY (stock>0) DESC, (sub_id IS NOT NULL AND sub_id=?) DESC, RANDOM() LIMIT 10`, p.id, p.sub_id, p.category_id, p.brand_id, p.sub_id).map(productOut);
  const cat = p.category_id ? get('SELECT id, name, slug FROM categories WHERE id=?', p.category_id) : null;
  const sub = p.sub_id ? get('SELECT id, name, slug FROM categories WHERE id=?', p.sub_id) : null;
  const brand = p.brand_id ? get('SELECT id, name, slug, logo FROM brands WHERE id=?', p.brand_id) : null;
  return { ...productOut(p), category: cat, sub, brand, related };
});
R('POST', '/api/cart/check', async ({ body }) => {
  const ids = (body.items || []).map((i) => Number(i.id)).filter(Boolean).slice(0, 100);
  if (!ids.length) return { items: [] };
  return { items: all(`SELECT * FROM products WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).map((p) => ({ ...productOut(p), max: Math.max(0, Math.floor(p.stock)) })) };
});
R('POST', '/api/orders', async ({ body, req }) => {
  const s = getSettings();
  if (!s.ordering.enabled) throw new E(400, s.ordering.closed_message);
  if (body.website) throw new E(400, 'تعذر إرسال الطلب'); // حقل مخفي لمنع البرامج الآلية
  const ip = clientIp(req);
  limit('order:' + ip, 6, 10 * 60e3);
  const name = String(body.name || '').trim().slice(0, 80), phone = normPhone(body.phone);
  const governorate = GOVERNORATES.includes(body.governorate) ? body.governorate : null;
  const city = String(body.city || '').trim().slice(0, 80), address = String(body.address || '').trim().slice(0, 300), notes = String(body.notes || '').trim().slice(0, 500);
  if (name.length < 2) throw new E(400, 'يرجى كتابة الاسم');
  if (!/^07\d{9}$/.test(phone)) throw new E(400, 'رقم الهاتف غير صحيح (مثال: 07701234567)');
  if (!governorate) throw new E(400, 'يرجى اختيار المحافظة');
  if (address.length < 4) throw new E(400, 'يرجى كتابة العنوان بالتفصيل');
  const want = new Map();
  for (const i of body.items || []) { const id = Number(i.id), q = Math.floor(Number(i.qty)); if (id && q > 0) want.set(id, Math.min(99, (want.get(id) || 0) + q)); }
  if (!want.size) throw new E(400, 'السلة فارغة');
  if (want.size > 50) throw new E(400, 'عدد الأصناف كبير');
  const items = [];
  for (const [id, qty] of want) {
    const p = get('SELECT * FROM products WHERE id=?', id);
    if (!p) throw new E(400, 'أحد المنتجات لم يعد متوفراً، يرجى تحديث السلة');
    if (p.stock < qty) throw new E(400, p.stock > 0 ? `الكمية المتوفرة من "${p.name}" هي ${Math.floor(p.stock)} فقط` : `"${p.name}" نفد من المخزون`);
    items.push({ id: p.id, name: p.name, price: p.price, qty, total: p.price * qty, image: JSON.parse(p.images || '[]')[0] || null });
  }
  const subtotal = items.reduce((x, i) => x + i.total, 0);
  if (s.delivery.min_order > 0 && subtotal < s.delivery.min_order) throw new E(400, `الحد الأدنى للطلب ${Number(s.delivery.min_order).toLocaleString('en')} ${s.store.currency}`);
  const fee = deliveryFee(governorate, subtotal, s);
  const total = subtotal + fee;
  const no = 'TQ-' + String((get('SELECT COALESCE(MAX(id),0)+1 n FROM orders').n) + 10000);
  const t = now(), token = crypto.randomBytes(9).toString('base64url');
  db.exec('BEGIN');
  try {
    run(`INSERT INTO orders(no,created_at,status,name,phone,governorate,city,address,notes,items,subtotal,delivery_fee,total,history,updated_at,ip,token)
      VALUES(?,?,'new',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, no, t, name, phone, governorate, city, address, notes, JSON.stringify(items), subtotal, fee, total,
      JSON.stringify([{ status: 'new', at: t }]), t, ip, token);
    // حجز الكمية على الموقع حتى تتم المزامنة القادمة من النظام الإداري
    for (const i of items) run('UPDATE products SET stock = stock - ? WHERE id=?', i.qty, i.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  emit(syncLive, 'order', { no });
  emit(live, 'catalog', { ids: items.map((i) => i.id) });
  return { no, token, total, subtotal, delivery_fee: fee, status: 'new', status_label: STATUS.new, created_at: t };
});
// تتبع كل طلبات الزبون برقم الهاتف فقط (بدون العنوان أو البيانات الشخصية)
const orderPublic = (o) => ({ no: o.no, token: o.token, created_at: o.created_at, status: o.status, status_label: STATUS[o.status],
  items: JSON.parse(o.items).map(({ id, name, qty, price, total, image }) => ({ id, name, qty, price, total, image })),
  subtotal: o.subtotal, delivery_fee: o.delivery_fee, total: o.total, governorate: o.governorate,
  history: JSON.parse(o.history).map((h) => ({ ...h, label: STATUS[h.status] })) });
R('GET', '/api/orders/by-phone', ({ q, req }) => {
  limit('phone:' + clientIp(req), 30, 10 * 60e3);
  const phone = normPhone(q.phone);
  if (!/^07\d{9}$/.test(phone)) throw new E(400, 'رقم الهاتف غير صحيح (مثال: 07701234567)');
  return { orders: all('SELECT * FROM orders WHERE phone=? ORDER BY id DESC LIMIT 50', phone).map(orderPublic) };
});
R('GET', '/api/orders/track', ({ q, req }) => {
  limit('track:' + clientIp(req), 30, 10 * 60e3);
  const o = get('SELECT * FROM orders WHERE no=? AND phone=?', String(q.no || '').trim().toUpperCase(), normPhone(q.phone));
  if (!o) throw new E(404, 'لم يتم العثور على طلب بهذا الرقم ورقم الهاتف');
  return { no: o.no, token: o.token, created_at: o.created_at, status: o.status, status_label: STATUS[o.status], items: JSON.parse(o.items).map(({ name, qty, price, total, image }) => ({ name, qty, price, total, image })),
    subtotal: o.subtotal, delivery_fee: o.delivery_fee, total: o.total, history: JSON.parse(o.history).map((h) => ({ ...h, label: STATUS[h.status] })), governorate: o.governorate };
});

// ===== المزامنة مع النظام الإداري (مفتاح سري) =====
R('GET', '/api/sync/ping', () => ({ ok: true, app: 'the-queen-web', products: get('SELECT COUNT(*) n FROM products').n, orders_new: get("SELECT COUNT(*) n FROM orders WHERE status='new'").n }), true);
R('PUT', '/api/sync/settings', ({ body }) => {
  const allowed = Object.keys(DEFAULTS);
  for (const [k, v] of Object.entries(body || {})) if (allowed.includes(k)) run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(v));
  const h = hashOf(getSettings());
  if (lastHash.settings && lastHash.settings !== h) emit(live, 'store');
  lastHash.settings = h;
  return { ok: true };
}, true);
// استبدال كامل للكتالوج المنشور (المنتجات غير المرسلة تُحذف من الموقع)
R('PUT', '/api/sync/catalog', ({ body }) => {
  const cats = Array.isArray(body.categories) ? body.categories : [];
  const prods = Array.isArray(body.products) ? body.products : [];
  const h = hashOf(body), changed = lastHash.catalog !== h;
  lastHash.catalog = h;
  db.exec('BEGIN');
  try {
    const okImg = (x) => (x && /^[a-f0-9]{40}\.(jpg|webp|png)$/.test(x) ? x : null);
    run('DELETE FROM categories');
    for (const c of cats) run('INSERT INTO categories(id,name,slug,sort,image,parent_id) VALUES(?,?,?,?,?,?)', Number(c.id), String(c.name), slugify(c.name, c.id), Number(c.sort) || 0, okImg(c.image), Number(c.parent_id) || null);
    run('DELETE FROM brands');
    for (const b of Array.isArray(body.brands) ? body.brands : []) run('INSERT INTO brands(id,name,slug,logo,sort) VALUES(?,?,?,?,?)', Number(b.id), String(b.name), slugify(b.name, b.id), okImg(b.logo), Number(b.sort) || 0);
    const keep = new Set();
    for (const p of prods) {
      const id = Number(p.id); if (!id) continue; keep.add(id);
      const images = JSON.stringify((Array.isArray(p.images) ? p.images : []).filter((x) => /^[a-f0-9]{40}\.(jpg|webp|png)$/.test(x)).slice(0, 10));
      run(`INSERT INTO products(id,slug,name,category_id,price,compare_price,stock,unit,description,images,featured,is_new,sort,updated_at,sub_id,brand_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, name=excluded.name, category_id=excluded.category_id, sub_id=excluded.sub_id, brand_id=excluded.brand_id,
        price=excluded.price, compare_price=excluded.compare_price, stock=excluded.stock, unit=excluded.unit, description=excluded.description,
        images=excluded.images, featured=excluded.featured, is_new=excluded.is_new, sort=excluded.sort, updated_at=excluded.updated_at`,
        id, slugify(p.name, id), String(p.name), p.category_id || null, Number(p.price) || 0, Number(p.compare_price) || null,
        Math.max(0, Number(p.stock) || 0), p.unit || null, String(p.description || '').slice(0, 5000), images, p.featured ? 1 : 0, p.is_new ? 1 : 0, Number(p.sort) || 0, now(),
        Number(p.sub_id) || null, Number(p.brand_id) || null);
    }
    const existing = all('SELECT id FROM products').map((r) => r.id);
    for (const id of existing) if (!keep.has(id)) run('DELETE FROM products WHERE id=?', id);
    // خصم الكميات المحجوزة بطلبات لم يسحبها النظام الإداري بعد
    for (const o of all("SELECT items FROM orders WHERE pulled=0 AND status<>'cancelled'"))
      for (const i of JSON.parse(o.items)) run('UPDATE products SET stock = MAX(0, stock - ?) WHERE id=?', i.qty, i.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  if (changed) emit(live, 'catalog', {});
  return { ok: true, products: prods.length, categories: cats.length };
}, true);
R('GET', '/api/sync/media', () => ({ files: fs.readdirSync(MEDIA).filter((f) => /^[a-f0-9]{40}\./.test(f)) }), true);
R('POST', '/api/sync/media', ({ body }) => {
  const m = String(body.data || '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if (!m) throw new E(400, 'صورة غير صالحة');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3e6) throw new E(413, 'حجم الصورة كبير');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = crypto.createHash('sha1').update(buf).digest('hex') + '.' + ext;
  fs.writeFileSync(path.join(MEDIA, name), buf);
  return { name };
}, true);
R('GET', '/api/sync/orders', ({ q }) => {
  const rows = q.all ? all('SELECT * FROM orders ORDER BY id DESC LIMIT 500') : all('SELECT * FROM orders WHERE pulled=0 ORDER BY id');
  return { orders: rows.map((o) => ({ ...o, items: JSON.parse(o.items), history: JSON.parse(o.history) })) };
}, true);
R('POST', '/api/sync/orders/ack', ({ body }) => {
  for (const no of body.nos || []) run('UPDATE orders SET pulled=1 WHERE no=?', String(no));
  return { ok: true };
}, true);
R('PUT', '/api/sync/orders/:no', ({ params, body }) => {
  const o = get('SELECT * FROM orders WHERE no=?', params.no);
  if (!o) throw new E(404, 'الطلب غير موجود');
  if (!STATUS[body.status]) throw new E(400, 'حالة غير صحيحة');
  if (o.status !== body.status) {
    const h = JSON.parse(o.history), flow = ['new', 'confirmed', 'shipping', 'delivered'];
    // إكمال المراحل التي تم تجاوزها بين مزامنتين حتى يبقى المسار كاملاً عند الزبون
    const from = flow.indexOf(o.status), to = flow.indexOf(body.status);
    if (from >= 0 && to > from + 1) for (const st of flow.slice(from + 1, to)) h.push({ status: st, at: now() });
    h.push({ status: body.status, at: now() });
    run('UPDATE orders SET status=?, history=?, updated_at=? WHERE no=?', body.status, JSON.stringify(h), now(), o.no);
    emit(live, 'order', { t: o.token, status: body.status });
    if (body.status === 'cancelled') emit(live, 'catalog', { ids: JSON.parse(o.items).map((i) => i.id) });
  }
  return { ok: true };
}, true);

// ===== الملفات الثابتة والصفحات =====
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let indexTpl = null;
function page(res, pathname, host) {
  if (!indexTpl || process.env.NODE_ENV !== 'production') indexTpl = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const s = getSettings();
  let title = `${s.store.name} — ${s.store.tagline}`, desc = s.hero.subtitle, image = '';
  const m = pathname.match(/^\/p\/([^/]+)$/);
  let status = 200;
  if (m) {
    const p = get('SELECT * FROM products WHERE slug=?', decodeURIComponent(m[1]));
    if (p) { title = `${p.name} — ${s.store.name}`; desc = (p.description || '').slice(0, 160) || desc; image = JSON.parse(p.images)[0] || ''; } else status = 404;
  }
  const origin = `http://${host || 'localhost'}`;
  const meta = `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="${esc(s.store.name)}">
    ${image ? `<meta property="og:image" content="${origin}/media/${esc(image)}">` : ''}`;
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  res.end(indexTpl.replace('<!--META-->', meta));
}
function serveFile(res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('غير موجود'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  const p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (p === '/api/live' && req.method === 'GET') return openStream(req, res, live, 3000);
      if (p === '/api/sync/events' && req.method === 'GET') {
        if (!keyOk(req)) { limit('auth:' + clientIp(req), 20, 10 * 60e3); throw new E(401, 'مفتاح المزامنة غير صحيح'); }
        return openStream(req, res, syncLive, 20);
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = p.match(r.re); if (!m) continue;
        if (r.auth && !keyOk(req)) { limit('auth:' + clientIp(req), 20, 10 * 60e3); throw new E(401, 'مفتاح المزامنة غير صحيح'); }
        const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req, r.auth ? 6e6 : 2e5) : {};
        if (!r.auth) limit('api:' + clientIp(req), 600, 60e3);
        const params = Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]));
        return send(res, 200, await r.fn({ req, body, q: Object.fromEntries(url.searchParams), params }));
      }
      throw new E(404, 'غير موجود');
    }
    if (p.startsWith('/media/')) {
      const f = path.basename(p);
      if (!/^[a-f0-9]{40}\.(jpg|png|webp)$/.test(f)) { res.writeHead(404); return res.end(); }
      return serveFile(res, path.join(MEDIA, f), 'public, max-age=31536000, immutable');
    }
    if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    if (p === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('User-agent: *\nAllow: /\n'); }
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(p)));
    if (file.startsWith(PUBLIC + path.sep) && path.extname(file) && fs.existsSync(file) && !file.endsWith('index.html'))
      return serveFile(res, file, /\.(woff2|png|jpg|svg|webp)$/.test(file) ? 'public, max-age=604800' : 'no-cache');
    if (path.extname(p) && !p.startsWith('/p/')) { res.writeHead(404); return res.end(); }
    return page(res, p, req.headers.host);
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, { error: e.status ? e.message : 'خطأ في الخادم' });
  }
});
server.requestTimeout = 0;
server.listen(PORT, '0.0.0.0', () => console.log(`The Queen web → http://0.0.0.0:${PORT}`));
process.on('SIGTERM', () => { server.close(); db.close(); process.exit(0); });
