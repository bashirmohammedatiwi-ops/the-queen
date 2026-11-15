// اختبار الربط الكامل: النظام الإداري ←→ المتجر الإلكتروني
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
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
  await A('PUT', '/web/products/' + p1.id, { web_published: true, web_images: [img], web_description: 'عطر فاخر', web_compare_price: 40000, web_featured: true });
  await A('PUT', '/web/products/' + p2.id, { web_published: true, web_new: true });
  // مزامنة
  const r1 = await A('POST', '/web/sync');
  ok(r1.status === 200 && r1.d.products === 2 && r1.d.images === 1, 'المزامنة الأولى', JSON.stringify(r1.d));
  const store = (await req(W, null, 'GET', '/store')).d;
  ok(store.store.whatsapp === '07701234567' && store.hero.title === 'عنوان تجريبي' && store.categories.length === 1, 'المحتوى والتصنيفات في الموقع');
  const list = (await req(W, null, 'GET', '/products')).d;
  ok(list.total === 2, 'فقط المنتجات المنشورة تظهر في الموقع');
  const wp1 = list.items.find((x) => x.id === p1.id);
  ok(wp1 && wp1.compare_price === 40000 && wp1.images[0] === img && wp1.featured, 'بيانات المنتج في الموقع');
  ok((await fetch(`http://127.0.0.1:${WP}/media/${img}`)).status === 200, 'الصورة مرفوعة للموقع');
  const det = (await req(W, null, 'GET', '/products/' + wp1.slug)).d;
  ok(det.description === 'عطر فاخر' && det.category.name === 'عطور', 'صفحة المنتج');
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
  for (const p of ['/', '/shop', '/cart', '/checkout', '/track', '/about', '/fonts/fonts.css', '/icon.png', '/robots.txt', '/healthz'])
    ok((await fetch(`http://127.0.0.1:${WP}${p}`)).status === 200, 'صفحة الموقع ' + p);
  ok((await fetch(`http://127.0.0.1:${WP}/p/not-found-1`)).status === 404, 'منتج غير موجود 404');
  ok((await fetch(`http://127.0.0.1:${WP}/%E0%A4%A`)).status === 400 && (await fetch(`http://127.0.0.1:${WP}/healthz`)).status === 200, 'رابط تالف لا يوقف الموقع');
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
