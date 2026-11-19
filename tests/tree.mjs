// اختبار شجرة المواد: الفروع متعددة المستويات، الترميز، النقل، الحذف، التصفية، الاستيراد، التقارير
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 3990 + Math.floor(Math.random() * 8);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-tree-'));
let pass = 0, fail = 0; const failures = []; let errs = '';
const ok = (c, n, x = '') => (c ? pass++ : (fail++, failures.push(`✗ ${n} ${x}`)));
const srv = spawn(process.execPath, ['--no-warnings', 'server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), QUEEN_DATA: DIR } });
srv.stderr.on('data', (d) => (errs += d));
const B = `http://127.0.0.1:${PORT}/api`;
let tok = '';
async function A(method, p, body) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch { /* */ } return { status: r.status, d };
}
async function main() {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/public'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  tok = (await A('POST', '/login', { username: 'admin', password: 'admin123' })).d.token;
  const cats0 = (await A('GET', '/categories')).d;
  ok(cats0.every((c) => c.code && /^\d{2}$/.test(c.code)), 'ترميز تلقائي للفروع الموجودة', JSON.stringify(cats0));
  const perf = (await A('POST', '/categories', { name: 'عطور' })).d;
  const women = (await A('POST', '/categories', { name: 'نسائية', parent_id: perf.id })).d;
  const edp = (await A('POST', '/categories', { name: 'أو دو برفيوم', parent_id: women.id })).d;
  const men = (await A('POST', '/categories', { name: 'رجالية', parent_id: perf.id })).d;
  ok(women.code === perf.code + '01' && edp.code === women.code + '01' && men.code === perf.code + '02', 'رموز الفروع المتسلسلة', [perf.code, women.code, edp.code, men.code].join(' '));
  ok(edp.path === 'عطور › نسائية › أو دو برفيوم' && edp.depth === 2, 'المسار الكامل والعمق');
  ok((await A('POST', '/categories', { name: 'نسائية', parent_id: perf.id })).status === 400, 'لا يتكرر اسم الفرع في نفس المستوى');
  ok((await A('POST', '/categories', { name: 'نسائية', parent_id: men.id })).status === 200, 'نفس الاسم مسموح في مستوى آخر');
  ok((await A('PUT', '/categories/' + perf.id, { parent_id: edp.id })).status === 400, 'منع نقل الفرع داخل أحد فروعه');
  // أصناف
  const p1 = (await A('POST', '/products', { name: 'ديور جادور', price: 90000, cost: 50000, category_id: edp.id, opening_stock: 3 })).d;
  const p2 = (await A('POST', '/products', { name: 'شانيل شانس', price: 110000, cost: 60000, category_id: edp.id })).d;
  const p3 = (await A('POST', '/products', { name: 'سوفاج', price: 95000, cost: 55000, category_id: men.id, opening_stock: 2 })).d;
  ok(p1.sku === edp.code + '-0001' && p2.sku === edp.code + '-0002' && p3.sku === men.code + '-0001', 'رمز الصنف التلقائي من رمز الفرع', [p1.sku, p2.sku, p3.sku].join(' '));
  ok((await A('POST', '/products', { name: 'x', price: 1, sku: p1.sku })).status === 400, 'لا يتكرر رمز الصنف');
  ok((await A('POST', '/products', { name: 'x', price: 1, category_id: 99999 })).status === 400, 'العائدية يجب أن تكون موجودة');
  const sub = (await A('GET', '/products?category_id=' + perf.id)).d;
  ok(sub.length === 3 && sub.find((x) => x.id === p1.id).category === 'عطور › نسائية › أو دو برفيوم', 'تصفية الأصناف بالفرع تشمل الفروع التابعة');
  ok((await A('GET', '/products?category_id=' + men.id)).d.length === 1, 'تصفية بفرع فرعي');
  const tree = (await A('GET', '/categories')).d;
  const tp = tree.find((c) => c.id === perf.id), tw = tree.find((c) => c.id === women.id);
  ok(tp.total === 3 && tp.products === 0 && tp.children === 2 && tw.total === 2 && tp.total_value === 3 * 50000 + 2 * 55000, 'العدد والقيمة تشمل الفروع التابعة', JSON.stringify(tp));
  // نقل فرع: يعاد ترميزه وفروعه
  const care = (await A('POST', '/categories', { name: 'عناية' })).d;
  const mv = await A('PUT', '/categories/' + women.id, { parent_id: care.id });
  const t2 = (await A('GET', '/categories')).d;
  ok(mv.status === 200 && t2.find((c) => c.id === women.id).code === care.code + '01' && t2.find((c) => c.id === edp.id).code === care.code + '0101' && t2.find((c) => c.id === edp.id).path.startsWith('عناية › نسائية'), 'نقل فرع مع إعادة الترميز', JSON.stringify(mv.d));
  ok((await A('GET', '/products?category_id=' + care.id)).d.length === 2, 'الأصناف تتبع الفرع بعد نقله');
  await A('PUT', '/categories/' + women.id, { parent_id: perf.id });
  // الحذف
  ok((await A('DELETE', '/categories/' + women.id)).status === 400, 'لا يُحذف فرع له فروع تابعة');
  ok((await A('DELETE', '/categories/' + edp.id)).status === 400, 'لا يُحذف فرع فيه أصناف بدون اختيار بديل');
  const del = await A('DELETE', `/categories/${edp.id}?move_to=${women.id}`);
  ok(del.status === 200 && del.d.moved === 2 && (await A('GET', '/products/' + p1.id)).d.category_id === women.id, 'حذف فرع مع نقل أصنافه');
  // الاستيراد بمسار
  const imp = await A('POST', '/products/import', { rows: [{ name: 'كريم ليلي', category: 'عناية / بشرة / كريمات', price: 20000, cost: 9000, stock: 5 }, { name: 'كريم نهاري', category: 'عناية › بشرة › كريمات', price: 21000, stock: 1 }] });
  const t3 = (await A('GET', '/categories')).d;
  const creams = t3.find((c) => c.path === 'عناية › بشرة › كريمات');
  ok(imp.status === 200 && creams && creams.products === 2 && t3.filter((c) => c.name === 'بشرة').length === 1, 'الاستيراد ينشئ مسار الشجرة مرة واحدة', JSON.stringify(imp.d));
  // التقارير
  const cust = null;
  const sale = await A('POST', '/invoices', { source: 'erp', items: [{ product_id: p1.id, qty: 1, price: 90000 }, { product_id: p3.id, qty: 1, price: 95000 }], paid_cash: 185000, customer_id: cust });
  ok(sale.status === 200, 'فاتورة بيع', JSON.stringify(sale.d));
  const today = new Date().toISOString().slice(0, 10);
  const rep = (await A('GET', `/reports/sales?from=2000-01-01&to=2999-12-31`)).d;
  const root = (rep.byRoot || []).find((r) => r.name === 'عطور');
  ok(root && root.total === 185000 && rep.byCategory.some((r) => r.name === 'عطور › رجالية'), 'تقرير المبيعات حسب الفرع الرئيسي والمسار', JSON.stringify(rep.byRoot));
  const inv = (await A('GET', '/reports/inventory?category_id=' + perf.id)).d;
  ok(inv.rows.length === 3 && inv.rows.every((r) => r.root === 'عطور'), 'تقييم المخزون لفرع معين', String(inv.rows.length));
  // الكاشير يقرأ الشجرة
  const ct = (await fetch(B + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '1111' }) }).then((r) => r.json())).token;
  const pc = await fetch(B + '/categories', { headers: { Authorization: 'Bearer ' + ct } }).then((r) => r.json());
  ok(Array.isArray(pc) && pc.some((c) => c.parent_id === perf.id && c.total > 0), 'الكاشير يستلم الشجرة مع الأعداد');
  ok((await fetch(B + '/categories', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ct }, body: '{"name":"x"}' })).status === 403, 'الكاشير لا يعدّل الشجرة');
}
main().catch((e) => { fail++; failures.push('✗ استثناء: ' + e.stack); }).finally(() => {
  srv.kill(); fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`\n  اختبار شجرة المواد: ${pass} نجح · ${fail} فشل\n`);
  if (failures.length) console.log(failures.join('\n'));
  if (errs.trim()) console.log('\nأخطاء:\n' + errs);
  process.exit(fail ? 1 : 0);
});
