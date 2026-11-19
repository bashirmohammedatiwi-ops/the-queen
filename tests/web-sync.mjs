// اختبار الربط الكامل: النظام الإداري ←→ المتجر الإلكتروني
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EP = 3970 + Math.floor(Math.random() * 5), WP = 3980 + Math.floor(Math.random() * 5);
const KEY = 'k_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + 'xxxxxxxx';
const ED = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-erp-')), WD = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-web-'));
let pass = 0, fail = 0; const failures = []; let errs = '';
const ok = (c, n, x = '') => (c ? pass++ : (fail++, failures.push(`✗ ${n} ${x}`)));
const procs = [
  spawn(process.execPath, ['--no-warnings', 'server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(EP), QUEEN_DATA: ED } }),
  spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: path.join(ROOT, 'web'), env: { ...process.env, PORT: String(WP), DATA_DIR: WD, SYNC_KEY: KEY } }),
];
procs.forEach((p) => p.stderr.on('data', (d) => (errs += d)));
const E = `http://127.0.0.1:${EP}/api`, W = `http://127.0.0.1:${WP}/api`;
async function req(base, token, method, p, body, extra = {}) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch { /* */ } return { status: r.status, d };
}
const near = (a, b, t = 0.6) => Math.abs(a - b) <= t;

async function main() {
  for (const u of [E + '/public', `http://127.0.0.1:${WP}/healthz`]) for (let i = 0; i < 60; i++) { try { await fetch(u); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const tok = (await req(E, null, 'POST', '/login', { username: 'admin', password: 'admin123' })).d.token;
  const A = (m, p, b) => req(E, tok, m, p, b);
  // مفتاح خاطئ مرفوض
  ok((await req(W, null, 'GET', '/sync/ping', null, { 'X-Sync-Key': 'wrong' })).status === 401, 'الموقع يرفض مفتاح مزامنة خاطئ');
  ok((await A('POST', '/web/test', { url: `http://127.0.0.1:${WP}`, key: KEY })).status === 200, 'اختبار الاتصال من النظام الإداري');
  // الكاشير لا يرى المفتاح
  const ct = (await req(E, null, 'POST', '/login', { pin: '1111' })).d.token;
  await A('PUT', '/settings', { web: { url: `http://127.0.0.1:${WP}`, key: KEY, enabled: false }, web_content: { whatsapp: '07701234567', fee_baghdad: 5000, fee_other: 8000, hero_title: 'عنوان تجريبي' } });
  ok(!('key' in (await req(E, ct, 'GET', '/settings')).d.web), 'مفتاح الربط مخفي عن الكاشير');
  // أصناف
  const cat = (await A('POST', '/categories', { name: 'عطور' })).d;
  const p1 = (await A('POST', '/products', { name: 'عطر الملكة', price: 35000, cost: 18000, category_id: cat.id, opening_stock: 5 })).d;
  const p2 = (await A('POST', '/products', { name: 'كريم', price: 12000, cost: 6000, opening_stock: 10 })).d;
  await A('POST', '/products', { name: 'غير منشور', price: 1000, cost: 500, opening_stock: 3 });
  // صورة
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const img = (await A('POST', '/web/media', { data: png })).d.name;
  ok(/^[a-f0-9]{40}\.png$/.test(img), 'رفع صورة منتج');
  ok((await fetch(`http://127.0.0.1:${EP}/media/${img}`)).status === 200, 'عرض الصورة من النظام الإداري');
  // أقسام الموقع (رئيسي/فرعي) والبراند
  const wc = (await A('POST', '/web/categories', { name: 'عطور' })).d;
  const ws = (await A('POST', '/web/categories', { name: 'عطور نسائية', parent_id: wc.id })).d;
  const wc2 = (await A('POST', '/web/categories', { name: 'مكياج' })).d;
  ok((await A('POST', '/web/categories', { name: 'x', parent_id: ws.id })).status === 400, 'لا قسم فرعي داخل قسم فرعي');
  const br = (await A('POST', '/web/brands', { name: 'Dior' })).d;
  ok((await A('POST', '/web/brands', { name: 'Dior' })).status === 400, 'لا يتكرر البراند');
  ok((await A('PUT', '/web/products/' + p1.id, { web_cat_id: wc2.id, web_sub_id: ws.id })).status === 400, 'القسم الفرعي يجب أن يتبع الرئيسي');
  await A('PUT', '/web/products/' + p1.id, { web_published: true, web_images: [img], web_description: 'عطر فاخر', web_compare_price: 40000, web_featured: true, web_sub_id: ws.id, web_brand_id: br.id });
  const wpp = (await A('GET', '/web/products')).d.find((x) => x.id === p1.id);
  ok(wpp.web_cat_id === wc.id && wpp.web_sub_id === ws.id && wpp.web_brand_id === br.id, 'اختيار الفرعي يحدد الرئيسي تلقائياً');
  // بنرات
  ok((await A('POST', '/web/banners', { place: 'hero' })).status === 400, 'البنر يتطلب صورة');
  const bn = (await A('POST', '/web/banners', { place: 'hero', image: img, title: 'عرض', link_type: 'category', link_value: ws.id })).d;
  await A('POST', '/web/banners', { place: 'mid', image: img, link_type: 'brand', link_value: br.id });
  await A('POST', '/web/banners', { place: 'tiles', image: img, link_type: 'offers', ends: '2000-01-01' });
  ok(bn.id && (await A('GET', '/web/banners')).d.length === 3, 'إضافة البنرات');
  await A('PUT', '/web/products/' + p2.id, { web_published: true, web_new: true });
  // مزامنة
  const r1 = await A('POST', '/web/sync');
  ok(r1.status === 200 && r1.d.products === 2 && r1.d.images === 1, 'المزامنة الأولى', JSON.stringify(r1.d));
  const store = (await req(W, null, 'GET', '/store')).d;
  ok(store.store.whatsapp === '07701234567' && store.hero.title === 'عنوان تجريبي' && store.categories.length === 2, 'المحتوى والتصنيفات في الموقع', JSON.stringify(store.categories));
  ok(store.categories.find((c) => c.id === ws.id).parent_id === wc.id && !store.categories.find((c) => c.id === wc2.id), 'شجرة الأقسام (المستخدمة فقط)');
  ok(store.brands.length === 1 && store.brands[0].name === 'Dior', 'البراندات في الموقع');
  ok(store.banners.length === 2 && store.banners.find((b) => b.place === 'hero').link.startsWith('/c/') && store.banners.find((b) => b.place === 'mid').link.startsWith('/brand/'), 'البنرات وروابطها (المنتهي لا يظهر)', JSON.stringify(store.banners));
  ok((await req(W, null, 'GET', '/products?category=' + wc.id)).d.total === 1 && (await req(W, null, 'GET', '/products?category=' + ws.id)).d.total === 1 && (await req(W, null, 'GET', '/products?brand=' + br.id)).d.total === 1, 'التصفية بالقسم الرئيسي والفرعي والبراند');
  ok((await req(W, null, 'GET', '/products?q=Dior')).d.total === 1, 'البحث باسم البراند');
  const list = (await req(W, null, 'GET', '/products')).d;
  ok(list.total === 2, 'فقط المنتجات المنشورة تظهر في الموقع');
  const wp1 = list.items.find((x) => x.id === p1.id);
  ok(wp1 && wp1.compare_price === 40000 && wp1.images[0] === img && wp1.featured, 'بيانات المنتج في الموقع');
  ok((await fetch(`http://127.0.0.1:${WP}/media/${img}`)).status === 200, 'الصورة مرفوعة للموقع');
  const det = (await req(W, null, 'GET', '/products/' + wp1.slug)).d;
  ok(det.description === 'عطر فاخر' && det.category.name === 'عطور' && det.sub.name === 'عطور نسائية' && det.brand.name === 'Dior', 'صفحة المنتج');
  const html = await (await fetch(`http://127.0.0.1:${WP}/p/${encodeURIComponent(wp1.slug)}`)).text();
  ok(html.includes('<title>عطر الملكة'), 'عنوان صفحة المنتج للمشاركة ومحركات البحث');
  // طلب من الموقع
  ok((await req(W, null, 'POST', '/orders', { name: 'سارة', phone: '0770123456', governorate: 'بغداد', address: 'الكرادة شارع 62', items: [{ id: p1.id, qty: 1 }] })).status === 400, 'رفض رقم هاتف ناقص');
  ok((await req(W, null, 'POST', '/orders', { name: 'سارة', phone: '07701234567', governorate: 'بغداد', address: 'الكرادة', items: [{ id: p1.id, qty: 9 }] })).status === 400, 'رفض كمية أكبر من المتوفر');
  const o = await req(W, null, 'POST', '/orders', { name: 'سارة أحمد', phone: '٠٧٧٠١٢٣٤٥٦٧', governorate: 'بغداد', city: 'الكرادة', address: 'شارع 62 قرب الجسر', notes: 'مساءً', items: [{ id: p1.id, qty: 2 }, { id: p2.id, qty: 1 }] });
  ok(o.status === 200 && o.d.total === 2 * 35000 + 12000 + 5000 && o.d.delivery_fee === 5000, 'إنشاء طلب مع أجور توصيل بغداد', JSON.stringify(o.d));
  const o2 = await req(W, null, 'POST', '/orders', { name: 'زينب', phone: '07801112233', governorate: 'البصرة', address: 'العشار شارع الكويت', items: [{ id: p2.id, qty: 2 }] });
  ok(o2.d.delivery_fee === 8000, 'أجور توصيل المحافظات');
  ok((await req(W, null, 'GET', '/products/' + wp1.slug)).d.in_stock && (await req(W, null, 'POST', '/cart/check', { items: [{ id: p1.id }] })).d.items[0].max === 3, 'حجز الكمية في الموقع فوراً');
  // سحب الطلبات
  const r2 = await A('POST', '/web/sync');
  ok(r2.d.orders === 2, 'وصول الطلبات للنظام الإداري', JSON.stringify(r2.d));
  const orders = (await A('GET', '/web/orders?status=new')).d;
  const eo = orders.find((x) => x.no === o.d.no);
  ok(eo && eo.name === 'سارة أحمد' && eo.phone === '07701234567' && eo.items.length === 2, 'تفاصيل الطلب في النظام الإداري');
  const wprods = (await A('GET', '/web/products')).d;
  ok(wprods.find((x) => x.id === p1.id).reserved === 2, 'الكمية المحجوزة ظاهرة في الإدارة');
  ok((await req(W, null, 'POST', '/cart/check', { items: [{ id: p1.id }] })).d.items[0].max === 3, 'المتاح في الموقع بعد المزامنة = المخزون - المحجوز');
  ok((await req(W, null, 'GET', '/sync/orders', null, { 'X-Sync-Key': KEY })).d.orders.length === 0, 'لا تُسحب الطلبات مرتين');
  // تغيير الحالات
  for (const s of ['confirmed', 'shipping']) ok((await A('PUT', '/web/orders/' + eo.id, { status: s })).status === 200, 'حالة ' + s);
  await A('POST', '/web/sync');
  const tr = (await req(W, null, 'GET', `/orders/track?no=${o.d.no}&phone=07701234567`)).d;
  ok(tr.status === 'shipping' && tr.history.length === 3, 'الزبون يرى حالة الطلب', JSON.stringify(tr.status));
  ok((await req(W, null, 'GET', `/orders/track?no=${o.d.no}&phone=07709999999`)).status === 404, 'التتبع يتطلب رقم الهاتف الصحيح');
  const bp = (await req(W, null, 'GET', '/orders/by-phone?phone=' + encodeURIComponent('+964 770 123 4567'))).d;
  ok(bp.orders.length === 1 && bp.orders[0].status === 'shipping' && bp.orders[0].items.length === 2 && !('address' in bp.orders[0]) && !('name' in bp.orders[0]), 'تتبع كل الطلبات برقم الهاتف فقط (بدون العنوان)');
  ok((await req(W, null, 'GET', '/orders/by-phone?phone=123')).status === 400, 'رقم هاتف غير صحيح للتتبع');
  const d = await A('PUT', '/web/orders/' + eo.id, { status: 'delivered', payment: 'cash' });
  ok(d.status === 200 && d.d.invoice_id, 'التسليم يصدر فاتورة');
  const inv = (await A('GET', '/invoices/' + d.d.invoice_id)).d;
  ok(inv.source === 'web' && inv.total === 82000 && inv.paid_cash === 82000 && inv.customer_name === 'سارة أحمد', 'بيانات فاتورة الطلب', `${inv.source} ${inv.total}`);
  ok((await A('GET', '/products/' + p1.id)).d.stock === 3, 'خصم المخزون عند التسليم');
  ok((await A('PUT', '/web/orders/' + eo.id, { status: 'cancelled' })).status === 400, 'لا يمكن إلغاء طلب مُسلّم');
  // إلغاء الطلب الثاني يعيد المتاح
  const eo2 = (await A('GET', '/web/orders?status=new')).d.find((x) => x.no === o2.d.no);
  await A('PUT', '/web/orders/' + eo2.id, { status: 'cancelled' });
  await A('POST', '/web/sync');
  ok((await req(W, null, 'POST', '/cart/check', { items: [{ id: p2.id }] })).d.items[0].max === 9, 'الإلغاء يعيد الكمية للموقع');
  ok((await req(W, null, 'GET', `/orders/track?no=${o2.d.no}&phone=07801112233`)).d.status === 'cancelled', 'الزبون يرى الإلغاء');
  // إلغاء النشر يحذف المنتج من الموقع
  await A('PUT', '/web/products/' + p2.id, { web_published: false });
  await A('POST', '/web/sync');
  ok((await req(W, null, 'GET', '/products')).d.total === 1, 'إلغاء النشر يخفي المنتج من الموقع');
  // سلامة الحسابات بعد كل ذلك
  const tb = (await A('GET', '/reports/trial-balance')).d;
  ok(near(tb.reduce((s, r) => s + r.debit, 0), tb.reduce((s, r) => s + r.credit, 0), 0.05), 'ميزان المراجعة متوازن');
  const invr = (await A('GET', '/reports/inventory')).d;
  ok(near(tb.find((r) => r.code === '1301').closing, invr.rows.reduce((s, r) => s + r.stock * r.cost, 0), 1), 'المخزون = حساب المخزون');
  // صفحات الموقع
  for (const p of ['/admin.js', '/admin.css', '/', '/shop', '/cart', '/checkout', '/track', '/orders', '/wishlist', '/categories', '/brand/x', '/about', '/sw.js', '/fonts/fonts.css', '/icon.png', '/robots.txt', '/healthz'])
    ok((await fetch(`http://127.0.0.1:${WP}${p}`)).status === 200, 'صفحة الموقع ' + p);
  ok((await fetch(`http://127.0.0.1:${WP}/p/not-found-1`)).status === 404, 'منتج غير موجود 404');
  ok((await fetch(`http://127.0.0.1:${WP}/%E0%A4%A`)).status === 400 && (await fetch(`http://127.0.0.1:${WP}/healthz`)).status === 200, 'رابط تالف لا يوقف الموقع');
  // ===== لوحة التحكم عن بعد =====
  const AW = (tk) => (m, p, b) => req(W, null, m, '/admin' + p, b, tk ? { Authorization: 'Bearer ' + tk } : {});
  ok((await AW()('POST', '/login', { username: 'admin', password: 'wrong' })).status === 401, 'لوحة التحكم ترفض كلمة مرور خاطئة');
  ok((await AW()('GET', '/state')).status === 401, 'لوحة التحكم تتطلب تسجيل الدخول');
  ok((await AW()('POST', '/login', { username: 'cashier1', password: 'x' })).status === 401, 'الكاشير لا يدخل لوحة التحكم');
  const lg = await AW()('POST', '/login', { username: 'Admin', password: 'admin123' });
  ok(lg.status === 200 && lg.d.token, 'دخول لوحة التحكم بحساب النظام الإداري');
  const RW = AW(lg.d.token);
  const st0 = (await RW('GET', '/state')).d;
  ok(st0.products.length === 3 && !('users' in st0) && st0.web_categories.length >= 3 && st0.content.whatsapp === '07701234567', 'اللوحة ترى كل الأصناف (حتى غير المنشورة) بدون كلمات المرور');
  const tb1 = 'tbrand' + Date.now(), tp1 = 'tprod' + Date.now();
  ok((await RW('POST', '/change', { kind: 'brand.save', payload: { id: tb1, fields: { name: 'Chanel' } } })).status === 200, 'إنشاء براند عن بعد');
  ok((await RW('POST', '/change', { kind: 'product.save', payload: { id: tp1, fields: { name: 'أحمر شفاه', price: 15000, opening_stock: 4, cost: 7000, web_published: true, web_sub_id: ws.id, web_brand_id: tb1, web_description: 'ثابت طويل', web_images: [img] } } })).status === 200, 'إنشاء منتج عن بعد');
  await RW('POST', '/change', { kind: 'product.save', payload: { id: p2.id, fields: { price: 13000, web_published: true } } });
  await RW('POST', '/change', { kind: 'content.save', payload: { fields: { whatsapp: '07709998877', free_over: 100000 } } });
  await RW('POST', '/change', { kind: 'product.save', payload: { id: 999999, fields: { price: 1 } } });
  ok((await RW('POST', '/change', { kind: 'product.save', payload: { id: 'tnew12345', fields: { price: 5 } } })).status === 400, 'منتج جديد يتطلب الاسم والسعر');
  const st1 = (await RW('GET', '/state')).d;
  ok(st1.products.find((x) => x.id === tp1)?._pending && st1.products.find((x) => x.id === p2.id).price === 13000 && st1.content.whatsapp === '07709998877', 'التعديلات تظهر فوراً في اللوحة قبل تطبيقها');
  const ro = await req(W, null, 'POST', '/orders', { name: 'هدى', phone: '07501234567', governorate: 'بغداد', address: 'زيونة شارع الربيعي', items: [{ id: p1.id, qty: 1 }] });
  const r0 = await A('POST', '/web/sync');
  ok((await RW('PUT', '/orders/' + ro.d.no, { status: 'delivered', payment: 'cash' })).status === 200, 'تسليم طلب من اللوحة');
  ok((await req(W, null, 'GET', '/orders/by-phone?phone=07501234567')).d.orders[0].status === 'delivered', 'الزبون يرى الحالة فوراً');
  const rs = await A('POST', '/web/sync');
  ok(r0.d.remote === 4 && rs.status === 200 && rs.d.remote === 1, 'النظام يطبّق تعديلات اللوحة', JSON.stringify([r0.d, rs.d]));
  const ep = (await A('GET', '/products')).d.find((x) => x.name === 'أحمر شفاه');
  const ewp = (await A('GET', '/web/products')).d.find((x) => x.id === ep?.id);
  ok(ep && ep.stock === 4 && ep.price === 15000 && ewp.web_sub_id === ws.id && ewp.web_cat_id === wc.id && ewp.web_brand_id && ewp.web_images[0] === img, 'المنتج الجديد في النظام بكل تفاصيله', JSON.stringify(ewp));
  ok((await A('GET', '/web/taxonomy')).d.brands.some((b) => b.name === 'Chanel' && b.id === ewp.web_brand_id), 'البراند الجديد مرتبط بالمنتج');
  ok((await A('GET', '/products/' + p2.id)).d.price === 13000, 'تعديل السعر عن بعد');
  ok((await A('GET', '/settings')).d.web_content.whatsapp === '07709998877', 'تعديل محتوى الموقع عن بعد');
  const ero = (await A('GET', '/web/orders')).d.find((x) => x.no === ro.d.no);
  ok(ero && ero.status === 'delivered' && ero.invoice_id, 'تسليم الطلب عن بعد يصدر فاتورة في النظام');
  const chs = (await RW('GET', '/changes')).d.changes;
  ok(chs.filter((c) => c.status === 'applied').length === 5 && chs.find((c) => c.status === 'failed')?.error, 'سجل التعديلات يوضح الناجح والفاشل');
  ok((await req(W, null, 'GET', '/products?q=' + encodeURIComponent('أحمر شفاه'))).d.total === 1 && (await req(W, null, 'GET', '/store')).d.store.whatsapp === '07709998877', 'التعديلات ظاهرة في الموقع');
  await RW('POST', '/change', { kind: 'product.save', payload: { id: tp1, fields: { name: 'أحمر شفاه مات', price: 16000 } } });
  await RW('POST', '/change', { kind: 'product.stock', payload: { id: tp1, qty: 7 } });
  await A('POST', '/web/sync');
  const ep2 = (await A('GET', '/products/' + ep.id)).d;
  ok(ep2.name === 'أحمر شفاه مات' && ep2.price === 16000 && ep2.stock === 7 && (await A('GET', '/products')).d.filter((x) => x.name.startsWith('أحمر شفاه')).length === 1, 'تعديل منتج أُنشئ عن بعد وجرده بدون تكرار');
  ok((await fetch(`http://127.0.0.1:${WP}/admin`)).status === 200, 'صفحة لوحة التحكم');
  ok((await RW('POST', '/logout')).status === 200 && (await RW('GET', '/state')).status === 401, 'تسجيل الخروج');
  // ===== التحديث المباشر =====
  const sse = async (url, headers = {}) => {
    const ctl = new AbortController(); const r = await fetch(url, { headers, signal: ctl.signal });
    const events = []; let buf = '';
    (async () => { try { for await (const c of r.body) { buf += new TextDecoder().decode(c); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const b = buf.slice(0, i); buf = buf.slice(i + 2); const ev = (b.match(/^event: (.+)$/m) || [])[1]; if (ev) events.push({ ev, data: JSON.parse((b.match(/^data: (.+)$/m) || [])[1] || '{}') }); } } } catch { /* */ } })();
    return { events, close: () => ctl.abort(), status: r.status };
  };
  const wait = async (fn, ms = 6000) => { for (let t = 0; t < ms; t += 100) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
  ok((await fetch(`http://127.0.0.1:${WP}/api/sync/events`)).status === 401, 'قناة النظام الإداري المباشرة تتطلب المفتاح');
  const pub = await sse(`http://127.0.0.1:${WP}/api/live`);
  ok(pub.status === 200, 'قناة الزوار المباشرة');
  // تفعيل الربط التلقائي: تغيير السعر في النظام يصل للموقع بدون مزامنة يدوية، والطلب يصل للنظام فوراً
  await A('PUT', '/settings', { web: { url: `http://127.0.0.1:${WP}`, key: KEY, enabled: true, interval: 3600 } });
  await new Promise((r) => setTimeout(r, 1500));
  ok(await wait(async () => (await A('GET', '/web/status')).d.live === true), 'اتصال مباشر دائم بين النظام والموقع');
  await A('PUT', '/products/' + p1.id, { ...(await A('GET', '/products/' + p1.id)).d, price: 33000 });
  ok(await wait(async () => (await req(W, null, 'GET', '/products/' + wp1.slug)).d.price === 33000), 'تعديل السعر يصل للموقع تلقائياً خلال ثوانٍ');
  ok(pub.events.some((e) => e.ev === 'catalog'), 'الزوار يُبلَّغون بتحديث الكتالوج مباشرة');
  const o3 = await req(W, null, 'POST', '/orders', { name: 'مريم', phone: '07901234567', governorate: 'بغداد', address: 'المنصور قرب المول', items: [{ id: p1.id, qty: 1 }] });
  ok(o3.status === 200 && o3.d.token, 'رمز تتبع مباشر للطلب');
  ok(await wait(async () => (await A('GET', '/web/orders')).d.some((x) => x.no === o3.d.no)), 'الطلب الجديد يصل للنظام الإداري فوراً');
  const eo3 = (await A('GET', '/web/orders')).d.find((x) => x.no === o3.d.no);
  await A('PUT', '/web/orders/' + eo3.id, { status: 'confirmed' });
  ok(await wait(() => pub.events.some((e) => e.ev === 'order' && e.data.t === o3.d.token && e.data.status === 'confirmed')), 'الزبون يرى تغيير حالة طلبه مباشرة');
  pub.close();
  await A('PUT', '/settings', { web: { url: `http://127.0.0.1:${WP}`, key: KEY, enabled: false } });
  // الحد من الإغراق بالطلبات
  let limited = false;
  for (let i = 0; i < 8; i++) { const r = await req(W, null, 'POST', '/orders', { name: 'x y', phone: '07700000000', governorate: 'بغداد', address: 'عنوان طويل', items: [{ id: p1.id, qty: 1 }] }); if (r.status === 429) limited = true; }
  ok(limited, 'الحد من تكرار الطلبات من نفس الجهاز');
}
main().catch((e) => { fail++; failures.push('✗ استثناء: ' + e.stack); }).finally(() => {
  procs.forEach((p) => p.kill());
  fs.rmSync(ED, { recursive: true, force: true }); fs.rmSync(WD, { recursive: true, force: true });
  console.log(`\n  اختبار ربط الموقع: ${pass} نجح · ${fail} فشل\n`);
  if (failures.length) console.log(failures.join('\n'));
  if (errs.trim()) console.log('\nأخطاء:\n' + errs);
  process.exit(fail ? 1 : 0);
});
