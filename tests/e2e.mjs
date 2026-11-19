// اختبار شامل للنظام: يشغّل خادماً مؤقتاً بقاعدة بيانات فارغة ويجرب كل العمليات
// التشغيل: npm test
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3990 + Math.floor(Math.random() * 8);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'queen-test-'));
const B = `http://127.0.0.1:${PORT}/api`;
let pass = 0, fail = 0;
const failures = [];

const srv = spawn(process.execPath, ['--no-warnings', 'server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), QUEEN_DATA: DATA }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvErr = '';
srv.stderr.on('data', (d) => (srvErr += d));

function ok(cond, name, extra = '') {
  if (cond) pass++; else { fail++; failures.push(`✗ ${name} ${extra}`); }
}
const near = (a, b, t = 0.6) => Math.abs(a - b) <= t;
async function api(token, method, p, body) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch { /* */ }
  return { status: r.status, d };
}
const mk = (t) => ({ get: (p) => api(t, 'GET', p), post: (p, b) => api(t, 'POST', p, b || {}), put: (p, b) => api(t, 'PUT', p, b || {}), del: (p) => api(t, 'DELETE', p) });
async function must(res, name) { ok(res.status === 200, name, res.status !== 200 ? `→ ${res.status} ${res.d?.error || ''}` : ''); return res.d; }
async function mustFail(res, name, code = 400) { ok(res.status === code, name, `→ expected ${code} got ${res.status} ${res.d?.error || ''}`); return res.d; }

// ثوابت محاسبية يجب أن تبقى صحيحة بعد كل عملية
async function invariants(A, label) {
  const tb = (await A.get('/reports/trial-balance')).d;
  const dr = tb.reduce((s, r) => s + r.debit, 0), cr = tb.reduce((s, r) => s + r.credit, 0);
  ok(near(dr, cr, 0.05), `[${label}] ميزان المراجعة متوازن`, `${dr} / ${cr}`);
  const bs = (await A.get('/reports/balance-sheet')).d;
  ok(near(bs.total_assets, bs.total_liabilities + bs.total_equity, 0.05), `[${label}] الميزانية متوازنة`, `${bs.total_assets} vs ${bs.total_liabilities + bs.total_equity}`);
  const inv = (await A.get('/reports/inventory')).d;
  const invAcc = tb.find((r) => r.code === '1301')?.closing || 0;
  const stockValue = inv.rows.reduce((s, r) => s + r.stock * r.cost, 0);
  ok(near(invAcc, stockValue, 1), `[${label}] حساب المخزون = قيمة المخزون الفعلية`, `${invAcc} vs ${stockValue}`);
  const cust = (await A.get('/customers')).d, ar = tb.find((r) => r.code === '1201')?.closing || 0;
  ok(near(cust.reduce((s, c) => s + c.balance, 0), ar, 0.05), `[${label}] أرصدة العملاء = حساب الذمم`);
  const sup = (await A.get('/suppliers')).d, ap = -(tb.find((r) => r.code === '2101')?.closing || 0);
  ok(near(sup.reduce((s, c) => s + c.balance, 0), ap, 0.05), `[${label}] أرصدة الموردين = حساب الذمم الدائنة`);
}

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/public'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

  // ===== صفحات الواجهة =====
  for (const p of ['/', '/erp/', '/pos/', '/shared/core.js', '/shared/print.js', '/shared/base.css', '/erp/erp.js', '/pos/pos.js']) {
    const r = await fetch(`http://127.0.0.1:${PORT}${p}`); ok(r.status === 200, `صفحة ${p}`);
  }
  ok((await fetch(`http://127.0.0.1:${PORT}/../server.js`)).status !== 200, 'منع الوصول لملفات خارج public');

  // ===== الدخول والصلاحيات =====
  await mustFail(await api(null, 'POST', '/login', { username: 'admin', password: 'x' }), 'رفض كلمة مرور خاطئة', 401);
  const A = mk((await must(await api(null, 'POST', '/login', { username: 'admin', password: 'admin123' }), 'دخول المدير')).token);
  const C = mk((await must(await api(null, 'POST', '/login', { pin: '1111' }), 'دخول الكاشير بالرمز')).token);
  await mustFail(await api(null, 'GET', '/products'), 'رفض بدون جلسة', 401);
  for (const p of ['/users', '/dashboard', '/reports/trial-balance', '/purchases', '/journal', '/backup', '/stock/moves'])
    await mustFail(await C.get(p), `الكاشير ممنوع من ${p}`, 403);
  await mustFail(await C.put('/settings', { currency: 'x' }), 'الكاشير لا يعدل الإعدادات', 403);
  await mustFail(await C.post('/products', { name: 'x', price: 1 }), 'الكاشير لا يضيف أصنافاً', 403);
  await mustFail(await C.post('/invoices', { source: 'erp', items: [] }), 'الكاشير لا يصدر فاتورة ERP', 403);
  const s0 = (await A.get('/settings')).d;
  ok(s0.currency === 'د.ع' && s0.decimals === 0 && s0.tax.enabled === false, 'الإعدادات الافتراضية: دينار بدون ضريبة');

  // ===== الأصناف =====
  const cat = await must(await A.post('/categories', { name: 'عطور' }), 'إضافة تصنيف');
  const p1 = await must(await A.post('/products', { name: 'عطر الملكة', price: 35000, cost: 18000, category_id: cat.id, opening_stock: 10, min_stock: 2 }), 'صنف برصيد افتتاحي');
  ok(p1.stock === 10 && p1.barcode === String(20000000 + p1.id), 'الكمية الافتتاحية والباركود التلقائي');
  const p2 = await must(await A.post('/products', { name: 'كريم', barcode: '628100', price: 12000, cost: 6000, opening_stock: 20 }), 'صنف بباركود');
  await mustFail(await A.post('/products', { name: 'مكرر', barcode: '628100', price: 1 }), 'منع تكرار الباركود');
  const imp = await must(await A.post('/products/import', { rows: [{ name: 'أحمر شفاه', category: 'مكياج', cost: '4,000', price: '9000', stock: '30' }, { name: '' }, { name: 'كريم' }] }), 'استيراد أصناف');
  ok(imp.created === 1 && imp.skipped.length === 2, 'نتيجة الاستيراد', JSON.stringify(imp));
  const p3 = (await A.get('/products?q=' + encodeURIComponent('أحمر'))).d[0];
  ok(p3 && p3.cost === 4000 && p3.stock === 30 && p3.category === 'مكياج', 'بيانات الصنف المستورد');
  const up = await must(await A.put('/products/' + p1.id, { ...p1, price: 36000 }), 'تعديل سعر صنف');
  ok(up.price === 36000 && up.stock === 10, 'التعديل لا يغير الكمية');
  await invariants(A, 'بعد الأصناف');

  // ===== الربط المباشر: POS يستلم التحديث فوراً =====
  const ctoken = (await api(null, 'POST', '/login', { pin: '1111' })).d.token;
  const ac = new AbortController();
  const got = [];
  const sse = fetch(`${B}/events?token=${ctoken}`, { signal: ac.signal }).then(async (r) => {
    const rd = r.body.getReader(); const dec = new TextDecoder();
    for (;;) { const { value, done } = await rd.read(); if (done) break; const t = dec.decode(value); for (const m of t.matchAll(/event: (\w+)/g)) got.push(m[1]); }
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  await A.put('/products/' + p2.id, { ...p2, price: 12500 });
  await new Promise((r) => setTimeout(r, 400));
  ok(got.includes('products'), 'نقطة البيع تستلم تحديث الأصناف لحظياً');
  await A.put('/settings', { pos: { cashier_max_discount: 10 } });
  await new Promise((r) => setTimeout(r, 300));
  ok(got.includes('settings'), 'نقطة البيع تستلم تحديث الإعدادات لحظياً');
  const posView = (await C.get('/products')).d.find((x) => x.id === p2.id);
  ok(posView.price === 12500, 'الكاشير يرى السعر الجديد من النظام الإداري');
  await mustFail(await api('bad', 'GET', '/events?token=bad'), 'رفض بث الأحداث بدون جلسة', 401);

  // ===== الموردين والعملاء والأرصدة الافتتاحية =====
  const sI = await must(await A.post('/suppliers', { name: 'مورد بغداد', opening_balance: 100000 }), 'مورد دينار برصيد');
  const sU = await must(await A.post('/suppliers', { name: 'مورد دبي', currency: 'USD', opening_balance: 500, rate: 1300 }), 'مورد دولار برصيد');
  const cu = await must(await A.post('/customers', { name: 'سارة', phone: '0770', opening_balance: 40000 }), 'عميل برصيد');
  let sup = (await A.get('/suppliers')).d;
  ok(sup.find((x) => x.id === sU.id).balance_fx === 500 && sup.find((x) => x.id === sU.id).balance === 650000, 'رصيد مورد الدولار $500 = 650,000');
  await mustFail(await A.put('/suppliers/' + sU.id, { name: 'مورد دبي', currency: 'IQD' }), 'منع تغيير عملة مورد عليه حركات');
  await invariants(A, 'بعد الأرصدة الافتتاحية');

  // ===== المشتريات =====
  const pu1 = await must(await A.post('/purchases', { supplier_id: sI.id, items: [{ product_id: p1.id, qty: 10, cost: 20000 }], paid: 50000, method: 'cash' }), 'شراء بالدينار جزئي');
  ok(pu1.total === 200000 && pu1.currency === 'IQD', 'إجمالي الشراء بالدينار');
  let pr1 = (await A.get('/products/' + p1.id)).d;
  ok(pr1.stock === 20 && near(pr1.cost, 19000), 'متوسط التكلفة المرجح', `${pr1.cost}`);
  const pu2 = await must(await A.post('/purchases', { supplier_id: sU.id, items: [{ product_id: p2.id, qty: 10, cost: 5 }], paid: 0, rate: 1310 }), 'شراء بالدولار آجل');
  ok(pu2.currency === 'USD' && pu2.total === 50 && pu2.rate === 1310, 'فاتورة الدولار');
  const pr2 = (await A.get('/products/' + p2.id)).d;
  ok(near(pr2.cost, (20 * 6000 + 10 * 6550) / 30), 'تكلفة الصنف بالدينار بعد شراء بالدولار', `${pr2.cost}`);
  await mustFail(await A.post('/purchases', { items: [{ product_id: p1.id, qty: 1, cost: 1 }], paid: 0 }), 'منع الشراء الآجل بدون مورد');
  await invariants(A, 'بعد المشتريات');
  // مرتجع مشتريات
  const pd2 = (await A.get('/purchases/' + pu2.id)).d;
  const prt = await must(await A.post(`/purchases/${pu2.id}/return`, { items: [{ item_id: pd2.items[0].id, qty: 4 }], refund_method: 'credit' }), 'مرتجع مشتريات بالدولار');
  ok(prt.number.startsWith('PR-') && prt.total === 20 && prt.currency === 'USD', 'بيانات مرتجع المشتريات');
  await mustFail(await A.post(`/purchases/${pu2.id}/return`, { items: [{ item_id: pd2.items[0].id, qty: 7 }] }), 'منع إرجاع أكثر من المتاح');
  sup = (await A.get('/suppliers')).d;
  ok(near(sup.find((x) => x.id === sU.id).balance_fx, 530, 0.01), 'رصيد مورد الدولار بعد المرتجع $530');
  await invariants(A, 'بعد مرتجع المشتريات');
  // سداد مورد دولار بسعر مختلف (فرق صرف)
  await must(await A.post('/vouchers', { kind: 'payment', party_id: sU.id, amount: 530, rate: 1320 }), 'سداد مورد الدولار بسعر جديد');
  sup = (await A.get('/suppliers')).d;
  ok(near(sup.find((x) => x.id === sU.id).balance_fx, 0, 0.01) && near(sup.find((x) => x.id === sU.id).balance, 0, 0.5), 'رصيد مورد الدولار صفر بالعملتين');
  const inc = (await A.get('/reports/income')).d;
  ok(inc.expense.some((e) => e.code === '5303'), 'تسجيل فروقات الصرف');
  await must(await A.post('/vouchers', { kind: 'payment', party_id: sI.id, amount: 100000, method: 'bank' }), 'سند صرف لمورد دينار');
  await invariants(A, 'بعد سداد الموردين');

  // ===== نقطة البيع =====
  await mustFail(await C.post('/invoices', { source: 'pos', items: [{ product_id: p1.id, qty: 1 }], paid_cash: 36000 }), 'منع البيع بدون وردية');
  const sh = await must(await C.post('/shifts/open', { opening_cash: 50000 }), 'فتح وردية');
  await mustFail(await C.post('/shifts/open', { opening_cash: 0 }), 'منع فتح ورديتين');
  const s1 = await must(await C.post('/invoices', { source: 'pos', items: [{ product_id: p1.id, qty: 2, price: 36000 }], paid_cash: 72000, tendered: 75000 }), 'بيع نقدي');
  ok(s1.total === 72000 && s1.method === 'cash' && s1.shift_id === sh.shift.id && s1.number === 'S-00001', 'بيانات فاتورة النقدي');
  const s2 = await must(await C.post('/invoices', { source: 'pos', items: [{ product_id: p2.id, qty: 1 }], paid_card: 12500 }), 'بيع شبكة');
  ok(s2.method === 'card', 'طريقة الدفع شبكة');
  const s3 = await must(await C.post('/invoices', { source: 'pos', items: [{ product_id: p3.id, qty: 2 }], paid_cash: 8000, paid_card: 10000 }), 'بيع مختلط');
  ok(s3.method === 'mixed' && s3.total === 18000, 'طريقة الدفع مختلط');
  const s4 = await must(await C.post('/invoices', { source: 'pos', customer_id: cu.id, items: [{ product_id: p3.id, qty: 1 }], paid_cash: 0 }), 'بيع آجل لعميل');
  ok(s4.credit === 9000, 'المبلغ الآجل');
  await mustFail(await C.post('/invoices', { source: 'pos', items: [{ product_id: p3.id, qty: 1 }], paid_cash: 0 }), 'منع الآجل بدون عميل');
  await mustFail(await C.post('/invoices', { source: 'pos', items: [{ product_id: p3.id, qty: 1, price: 5000 }], paid_cash: 5000 }), 'منع الكاشير من تغيير السعر');
  await mustFail(await C.post('/invoices', { source: 'pos', items: [{ product_id: p3.id, qty: 1 }], discount: 2000, paid_cash: 7000 }), 'منع خصم أكبر من الحد');
  const s5 = await must(await C.post('/invoices', { source: 'pos', items: [{ product_id: p3.id, qty: 1 }], discount: 900, paid_cash: 8100 }), 'خصم ضمن الحد');
  ok(s5.total === 8100, 'إجمالي بعد الخصم');
  await mustFail(await C.post('/invoices', { source: 'pos', items: [], paid_cash: 0 }), 'منع فاتورة فارغة');
  // منع البيع بالسالب عند تعطيل الخيار
  await A.put('/settings', { pos: { allow_negative_stock: false } });
  await mustFail(await C.post('/invoices', { source: 'pos', items: [{ product_id: p1.id, qty: 999 }], paid_cash: 1 }), 'منع البيع أكثر من المخزون');
  await A.put('/settings', { pos: { allow_negative_stock: true } });
  pr1 = (await A.get('/products/' + p1.id)).d;
  ok(pr1.stock === 18, 'خصم المخزون بعد البيع', `${pr1.stock}`);
  await invariants(A, 'بعد مبيعات نقطة البيع');

  // ===== المرتجعات =====
  const inv1 = (await C.get('/invoices/lookup/S-00001')).d;
  ok(inv1 && inv1.id === s1.id, 'البحث عن الفاتورة برقمها');
  const r1 = await must(await C.post(`/invoices/${s1.id}/return`, { items: [{ item_id: inv1.items[0].id, qty: 1 }], refund_method: 'cash' }), 'مرتجع نقدي جزئي');
  ok(r1.total === 36000 && r1.number === 'R-00001', 'مبلغ المرتجع');
  await mustFail(await C.post(`/invoices/${s1.id}/return`, { items: [{ item_id: inv1.items[0].id, qty: 2 }] }), 'منع إرجاع أكثر من المباع');
  const i4 = (await C.get('/invoices/' + s4.id)).d;
  await must(await C.post(`/invoices/${s4.id}/return`, { items: [{ item_id: i4.items[0].id, qty: 1 }], refund_method: 'credit' }), 'مرتجع على حساب العميل');
  const cBal = (await A.get('/customers')).d.find((x) => x.id === cu.id).balance;
  ok(cBal === 40000, 'رصيد العميل بعد المرتجع', `${cBal}`);
  await invariants(A, 'بعد المرتجعات');

  // ===== إغلاق الوردية =====
  const cur = (await C.get('/shifts/current')).d;
  const expected = 50000 + 72000 + 8000 + 8100 - 36000;
  ok(cur.expected_cash === expected, 'النقد المتوقع في الدرج', `${cur.expected_cash} vs ${expected}`);
  const cl = await must(await C.post(`/shifts/${cur.shift.id}/close`, { counted_cash: expected - 1000 }), 'إغلاق الوردية بعجز');
  ok(cl.shift.closed_at && cl.shift.counted_cash === expected - 1000, 'تسجيل الإغلاق');
  ok((await C.get('/shifts/current')).d === null, 'لا توجد وردية مفتوحة بعد الإغلاق');
  await invariants(A, 'بعد إغلاق الوردية');

  // ===== النظام الإداري: بيع A4 وسندات وقيود =====
  const e1 = await must(await A.post('/invoices', { source: 'erp', customer_id: cu.id, items: [{ product_id: p1.id, qty: 1, price: 36000, discount: 1000 }], paid_cash: 15000 }), 'فاتورة بيع A4 آجل جزئي');
  ok(e1.credit === 20000 && e1.source === 'erp' && !e1.shift_id, 'فاتورة ERP');
  await must(await A.post('/vouchers', { kind: 'receipt', party_id: cu.id, amount: 60000 }), 'سند قبض من عميل');
  ok((await A.get('/customers')).d.find((x) => x.id === cu.id).balance === 0, 'رصيد العميل صفر بعد القبض');
  const accs = (await A.get('/accounts')).d;
  const rent = accs.find((a) => a.code === '5202');
  await must(await A.post('/vouchers', { kind: 'expense', account_id: rent.id, amount: 250000 }), 'تسجيل مصروف إيجار');
  await mustFail(await A.post('/vouchers', { kind: 'expense', account_id: accs.find((a) => a.code === '5').id, amount: 1 }), 'منع المصروف على حساب رئيسي');
  const cash = accs.find((a) => a.code === '1101'), cap = accs.find((a) => a.code === '3101');
  await mustFail(await A.post('/journal', { description: 'x', lines: [{ account_id: cash.id, debit: 10 }, { account_id: cap.id, credit: 9 }] }), 'منع قيد غير متوازن');
  const je = await must(await A.post('/journal', { description: 'إيداع رأس مال', lines: [{ account_id: cash.id, debit: 1000000 }, { account_id: cap.id, credit: 1000000 }] }), 'قيد يدوي');
  const auto = (await A.get('/journal?ref_type=invoice')).d[0];
  await mustFail(await A.del('/journal/' + auto.id), 'منع حذف قيد تلقائي');
  await must(await A.del('/journal/' + je.id), 'حذف قيد يدوي');
  await must(await A.post('/stock/adjust', { product_id: p2.id, mode: 'set', qty: 20, note: 'جرد' }), 'تسوية جرد');
  ok((await A.get('/products/' + p2.id)).d.stock === 20, 'الكمية بعد الجرد');
  await invariants(A, 'بعد عمليات النظام الإداري');

  // ===== التقارير =====
  for (const p of ['/dashboard', '/reports/sales', '/reports/income', '/reports/balance-sheet', '/reports/trial-balance', '/reports/inventory', `/reports/ledger?account_id=${cash.id}`,
    `/customers/${cu.id}/statement`, `/suppliers/${sU.id}/statement`, '/shifts', '/stock/moves', '/journal', '/vouchers', '/purchases', '/invoices', '/users', '/accounts'])
    await must(await A.get(p), `تقرير ${p}`);
  const rs = (await A.get('/reports/sales')).d;
  ok(rs.sales.n === 6 && rs.returns.n === 2, 'عدد الفواتير والمرتجعات في التقرير', `${rs.sales.n}/${rs.returns.n}`);
  const st = (await A.get(`/suppliers/${sU.id}/statement`)).d;
  ok(st.currency === 'USD' && near(st.closing, 0, 0.01), 'كشف مورد الدولار بالدولار');
  const bk = await fetch(B + '/backup', { headers: { Authorization: 'Bearer ' + (await api(null, 'POST', '/login', { username: 'admin', password: 'admin123' })).d.token } });
  const buf = Buffer.from(await bk.arrayBuffer());
  ok(bk.status === 200 && buf.subarray(0, 15).toString() === 'SQLite format 3', 'النسخة الاحتياطية ملف قاعدة بيانات صالح');

  // ===== حالات نتائج المراجعة المستقلة =====
  const sh2 = await must(await C.post('/shifts/open', { opening_cash: 0 }), 'فتح وردية ثانية');
  // تكرار نفس السطر في المرتجع لا يتجاوز الكمية المباعة
  const sx = await must(await C.post('/invoices', { source: 'pos', items: [{ product_id: p2.id, qty: 1 }], paid_cash: 12500 }), 'بيع لاختبار التكرار');
  const sxi = (await C.get('/invoices/' + sx.id)).d.items[0].id;
  await mustFail(await C.post(`/invoices/${sx.id}/return`, { items: [{ item_id: sxi, qty: 1 }, { item_id: sxi, qty: 1 }, { item_id: sxi, qty: 1 }] }), 'منع تكرار السطر لتجاوز الكمية المرتجعة');
  await mustFail(await C.post(`/invoices/${sx.id}/return`, { items: [{ item_id: sxi, qty: 1 }], refund_method: 'xyz' }), 'رفض طريقة استرداد غير معروفة');
  // سعر غير رقمي من الكاشير لا يبيع بصفر
  await mustFail(await C.post('/invoices', { source: 'pos', items: [{ product_id: p2.id, qty: 1, price: 'x' }], paid_cash: 0 }), 'رفض سعر غير رقمي');
  // الكاشير لا يحدد التاريخ ولا الوردية
  const sd = await must(await C.post('/invoices', { source: 'pos', items: [{ product_id: p2.id, qty: 1 }], paid_cash: 12500, date: '2020-01-01', shift_id: 999 }), 'بيع بتاريخ ووردية مزورين');
  ok(sd.date.startsWith(new Date().getFullYear().toString()) && sd.shift_id === sh2.shift.id, 'الخادم يفرض التاريخ والوردية الصحيحين');
  // منع البيع بالسالب مع تكرار السطر
  await A.put('/settings', { pos: { allow_negative_stock: false } });
  const stk = (await A.get('/products/' + p2.id)).d.stock;
  await mustFail(await C.post('/invoices', { source: 'pos', items: [{ product_id: p2.id, qty: stk }, { product_id: p2.id, qty: stk }], paid_cash: 999999999 }), 'منع تجاوز المخزون بتكرار السطر');
  await A.put('/settings', { pos: { allow_negative_stock: true } });
  // الكاشير لا يرى بيانات الإدارة ولا ورديات غيره
  for (const p of ['/accounts', '/products/' + p1.id]) await mustFail(await C.get(p), `الكاشير ممنوع من ${p}`, 403);
  await mustFail(await C.post('/suppliers', { name: 'x' }), 'الكاشير لا يضيف موردين', 403);
  const adminPin = mk((await api(null, 'POST', '/login', { pin: '1234' })).d.token);
  await must(await adminPin.post('/shifts/open', { opening_cash: 0 }), 'المدير يفتح وردية بالرمز');
  const ash = (await adminPin.get('/shifts/current')).d.shift.id;
  await mustFail(await C.get('/shifts/' + ash), 'الكاشير لا يرى وردية غيره', 403);
  await mustFail(await adminPin.get('/dashboard'), 'دخول المدير بالرمز لا يفتح الإدارة', 403);
  await must(await adminPin.get('/products'), 'دخول المدير بالرمز يعمل في نقطة البيع');
  // تعديل الصنف لا يغير التكلفة يدوياً
  const before = (await A.get('/products/' + p1.id)).d;
  await must(await A.put('/products/' + p1.id, { ...before, cost: before.cost * 3 }), 'تعديل صنف مع تكلفة مختلفة');
  ok(near((await A.get('/products/' + p1.id)).d.cost, before.cost, 0.0001), 'التكلفة لا تتغير بالتعديل اليدوي');
  await invariants(A, 'بعد حالات المراجعة');
  // سيناريوهات المخزون الصعبة: بيع بالسالب ثم شراء، مرتجع بعد تغير التكلفة، مرتجع شراء بعد نفاد الكمية
  const pz = await must(await A.post('/products', { name: 'صنف اختبار', price: 1000, cost: 100, opening_stock: 0 }), 'صنف للسيناريوهات');
  await must(await C.post('/invoices', { source: 'pos', items: [{ product_id: pz.id, qty: 5 }], paid_cash: 5000 }), 'بيع بالسالب');
  await invariants(A, 'بعد البيع بالسالب');
  const bz = await must(await A.post('/purchases', { items: [{ product_id: pz.id, qty: 10, cost: 120 }], paid: 1200 }), 'شراء بعد السالب');
  await invariants(A, 'بعد الشراء على رصيد سالب');
  const sz = await must(await C.post('/invoices', { source: 'pos', items: [{ product_id: pz.id, qty: 5 }], paid_cash: 5000 }), 'بيع 5');
  await must(await A.post('/purchases', { items: [{ product_id: pz.id, qty: 5, cost: 300 }], paid: 1500 }), 'شراء بتكلفة أعلى');
  const szi = (await C.get('/invoices/' + sz.id)).d.items[0].id;
  await must(await C.post(`/invoices/${sz.id}/return`, { items: [{ item_id: szi, qty: 5 }] }), 'مرتجع بيع بعد تغير التكلفة');
  await invariants(A, 'بعد مرتجع بيع بتكلفة قديمة');
  const bzi = (await A.get('/purchases/' + bz.id)).d.items[0].id;
  const left = (await A.get('/products/' + pz.id)).d.stock;
  await must(await A.post('/stock/adjust', { product_id: pz.id, mode: 'set', qty: 2 }), 'جرد لتقليل الكمية');
  await must(await A.post(`/purchases/${bz.id}/return`, { items: [{ item_id: bzi, qty: 10 }], refund_method: 'cash' }), 'مرتجع شراء أكبر من الموجود');
  ok(left > 0, 'سيناريو المخزون مُعد بشكل صحيح');
  await invariants(A, 'بعد مرتجع شراء بعد نفاد الكمية');
  // مورد دولار: شراءان بسعرين، دفعة، ثم مرتجع — الرصيد يصفر بالعملتين
  const sU2 = await must(await A.post('/suppliers', { name: 'مورد دولار 2', currency: 'USD' }), 'مورد دولار جديد');
  const u1 = await must(await A.post('/purchases', { supplier_id: sU2.id, items: [{ product_id: pz.id, qty: 1, cost: 100 }], paid: 0, rate: 1300 }), 'شراء $100 بسعر 1300');
  await must(await A.post('/purchases', { supplier_id: sU2.id, items: [{ product_id: pz.id, qty: 1, cost: 100 }], paid: 0, rate: 1500 }), 'شراء $100 بسعر 1500');
  await must(await A.post('/vouchers', { kind: 'payment', party_id: sU2.id, amount: 100, rate: 1450 }), 'دفع $100 بسعر 1450');
  const u1i = (await A.get('/purchases/' + u1.id)).d.items[0].id;
  await must(await A.post(`/purchases/${u1.id}/return`, { items: [{ item_id: u1i, qty: 1 }], refund_method: 'credit' }), 'مرتجع شراء دولار');
  const s2b = (await A.get('/suppliers')).d.find((x) => x.id === sU2.id);
  ok(near(s2b.balance_fx, 0, 0.01) && near(s2b.balance, 0, 0.5), 'رصيد مورد الدولار صفر بالعملتين بعد المرتجع', `${s2b.balance_fx} / ${s2b.balance}`);
  await invariants(A, 'بعد سيناريو الدولار');
  // الدينار بدون كسور حتى مع ضريبة غير شاملة وخصم
  await A.put('/settings', { tax: { enabled: true, rate: 15, inclusive: false } });
  const tz = await must(await C.post('/invoices', { source: 'pos', items: [{ product_id: p3.id, qty: 1 }], discount: 333, paid_cash: 999999 }), 'بيع بضريبة غير شاملة');
  ok(Number.isInteger(tz.total) && Number.isInteger(tz.tax) && tz.paid_cash === tz.total, 'المبالغ بالدينار بدون كسور', `${tz.total} ${tz.tax}`);
  await A.put('/settings', { tax: { enabled: false, rate: 0, inclusive: true } });
  await invariants(A, 'بعد الضريبة');
  // روابط غير صالحة لا توقف الخادم
  ok((await fetch(`http://127.0.0.1:${PORT}/%E0%A4%A`)).status === 400, 'رابط تالف لا يوقف الخادم');
  ok((await fetch(B + '/public')).status === 200, 'الخادم ما زال يعمل');

  // ===== المستخدمين =====
  const nu = await must(await A.post('/users', { name: 'كاشير 2', pin: '2222', role: 'cashier', active: true }), 'إضافة كاشير');
  await mustFail(await A.post('/users', { name: 'x', pin: '2222' }), 'منع تكرار الرمز السري');
  await must(await A.put('/users/' + nu.id, { name: 'كاشير 2', pin: '2222', role: 'cashier', active: false }), 'إيقاف مستخدم');
  await mustFail(await api(null, 'POST', '/login', { pin: '2222' }), 'المستخدم الموقوف لا يدخل', 401);
  ok(!('pin' in (await A.get('/users')).d[0]), 'الرموز السرية لا تُرسل للواجهة');

  // ===== الحماية من تخمين الرمز (آخر اختبار لأنه يوقف هذا الجهاز مؤقتاً) =====
  for (let i = 0; i < 5; i++) await api(null, 'POST', '/login', { pin: '0000' + i });
  await mustFail(await api(null, 'POST', '/login', { pin: '1111' }), 'إيقاف مؤقت بعد 5 محاولات خاطئة', 429);

  ac.abort();
}

main().catch((e) => { fail++; failures.push('✗ استثناء: ' + e.stack); }).finally(() => {
  srv.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(`\n  النتيجة: ${pass} نجح · ${fail} فشل\n`);
  if (failures.length) console.log(failures.join('\n'));
  if (srvErr.trim()) console.log('\nأخطاء الخادم:\n' + srvErr);
  process.exit(fail ? 1 : 0);
});
