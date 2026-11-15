// منطق العمل: المبيعات، المشتريات، القيود المحاسبية التلقائية، المخزون
import { all, get, run, tx, round, localNow, today, getSettings } from './db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (m) => new HttpError(400, m);

export const PREFIX = { sale: 'S', return: 'R', purchase: 'P', preturn: 'PR', receipt: 'RV', payment: 'PV', expense: 'EX', journal: 'JV' };
export const fmtNo = (type, no) => `${PREFIX[type] || ''}-${String(no).padStart(5, '0')}`;

const accCache = {};
export function acc(code) {
  if (accCache[code]) return accCache[code];
  const a = get('SELECT id FROM accounts WHERE code=?', code);
  if (!a) throw bad(`الحساب ${code} غير موجود`);
  return (accCache[code] = a.id);
}
const methodAccount = (m) => (m === 'card' || m === 'bank' ? acc('1102') : acc('1101'));

function nextNo(table, where = '', ...p) {
  return (get(`SELECT COALESCE(MAX(no),0)+1 n FROM ${table} ${where}`, ...p)).n;
}

// تقريب المبالغ حسب عملة النظام (الدينار بدون كسور افتراضياً). الدولار دائماً بخانتين.
export function moneyRounder(s = getSettings()) {
  const dec = Number.isInteger(Number(s.decimals)) ? Number(s.decimals) : 2;
  const f = 10 ** dec;
  return (x) => Math.round((Number(x) || 0) * f) / f;
}
const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : NaN; };

// ===== القيود =====
export function postEntry({ date, description, ref_type, ref_id, user_id, lines }) {
  lines = lines
    .map((l) => ({ ...l, debit: round(l.debit), credit: round(l.credit) }))
    .filter((l) => l.debit > 0 || l.credit > 0);
  if (!lines.length) return null;
  const d = round(lines.reduce((s, l) => s + l.debit, 0));
  const c = round(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(d - c) > 0.01) throw bad(`القيد غير متوازن (مدين ${d} / دائن ${c})`);
  for (const l of lines) {
    const a = get('SELECT is_group FROM accounts WHERE id=?', l.account_id);
    if (!a) throw bad('حساب غير موجود في القيد');
    if (a.is_group) throw bad('لا يمكن الترحيل على حساب رئيسي (مجموعة)');
  }
  const no = nextNo('journal_entries');
  const r = run('INSERT INTO journal_entries(no,date,description,ref_type,ref_id,user_id) VALUES(?,?,?,?,?,?)',
    no, date || today(), description || '', ref_type || 'manual', ref_id || null, user_id || null);
  const id = Number(r.lastInsertRowid);
  for (const l of lines) {
    run('INSERT INTO journal_lines(entry_id,account_id,debit,credit,party_type,party_id,note,currency,fx_debit,fx_credit) VALUES(?,?,?,?,?,?,?,?,?,?)',
      id, l.account_id, l.debit, l.credit, l.party_type || null, l.party_id || null, l.note || null,
      l.currency || null, round(l.fx_debit || 0), round(l.fx_credit || 0));
  }
  return id;
}

// ===== حركة المخزون مع متوسط التكلفة المرجح =====
// value: القيمة التي ستُرحّل على حساب المخزون 1301 لهذه الحركة (موجبة للدخول، سالبة للخروج).
// تُحدّث الكمية والتكلفة بحيث تبقى (الكمية × التكلفة) = رصيد حساب المخزون دائماً،
// وتُرجع أي فرق لا يمكن تمثيله (مثلاً عند وصول الكمية للصفر أو السالب) لتسويته في القيد.
function stockMove(product_id, qty, value, type, ref_type, ref_id, note, user_id, date) {
  const p = get('SELECT stock, cost FROM products WHERE id=?', product_id);
  if (!p) throw bad('صنف غير موجود');
  const target = p.stock * p.cost + value;
  const newStock = p.stock + qty;
  let cost = p.cost;
  if (newStock > 1e-9) cost = Math.max(0, target / newStock);
  run('UPDATE products SET stock = ?, cost = ? WHERE id=?', newStock, cost, product_id);
  run('INSERT INTO stock_moves(product_id,date,qty,type,ref_type,ref_id,cost,note,user_id) VALUES(?,?,?,?,?,?,?,?,?)',
    product_id, date || localNow(), qty, type, ref_type, ref_id, qty ? Math.abs(value / qty) : 0, note || null, user_id || null);
  return target - newStock * cost; // موجب = حساب المخزون أعلى من القيمة الفعلية
}
// سطور قيد تسوية فرق المخزون (إن وجد) مقابل حساب فروقات المخزون
function driftLines(drift) {
  drift = round(drift);
  if (Math.abs(drift) < 0.01) return [];
  return drift > 0
    ? [{ account_id: acc('5301'), debit: drift }, { account_id: acc('1301'), credit: drift }]
    : [{ account_id: acc('1301'), debit: -drift }, { account_id: acc('5301'), credit: -drift }];
}
// تجميع الكميات حسب المعرّف (لمنع تجاوز الحدود بتكرار نفس السطر)
function sumBy(list, key) {
  const m = new Map();
  for (const x of list) m.set(x[key], (m.get(x[key]) || 0) + x.qty);
  return m;
}

// ===== حساب الإجماليات =====
export function calcTotals(items, discount, taxCfg, rm = round) {
  const subtotal = rm(items.reduce((s, i) => s + rm(i.qty * i.price - (i.discount || 0)), 0));
  discount = Math.min(rm(discount), subtotal);
  const net = rm(subtotal - discount);
  const rate = taxCfg.enabled ? Number(taxCfg.rate) || 0 : 0;
  let tax, total;
  if (taxCfg.inclusive) { total = net; tax = rm(net - net / (1 + rate / 100)); }
  else { tax = rm(net * rate / 100); total = rm(net + tax); }
  return { subtotal, discount, tax, total, rate, inclusive: taxCfg.inclusive ? 1 : 0 };
}

const openShiftOf = (userId) => get('SELECT id FROM shifts WHERE user_id=? AND closed_at IS NULL ORDER BY id DESC LIMIT 1', userId)?.id || null;

// ===== فاتورة مبيعات =====
export function createSale(data, user) {
  const s = getSettings();
  const rm = moneyRounder(s);
  const items = (data.items || []).filter((i) => num(i.qty) > 0);
  if (!items.length) throw bad('الفاتورة لا تحتوي أصنافاً');
  const isCashier = user.role === 'cashier';
  return tx(() => {
    const lines = items.map((i) => {
      const p = get('SELECT * FROM products WHERE id=?', i.product_id);
      if (!p) throw bad('صنف غير موجود');
      const qty = num(i.qty);
      // صلاحيات الكاشير: تعديل السعر والخصم حسب إعدادات نقطة البيع
      let price = p.price;
      const asked = i.price == null || i.price === '' ? null : num(i.price);
      if (asked !== null && !(asked >= 0)) throw bad(`سعر غير صالح: ${p.name}`);
      if (asked !== null && Math.abs(asked - p.price) > 0.009) {
        if (isCashier && !s.pos.cashier_edit_price) throw bad('غير مسموح للكاشير بتعديل سعر البيع');
        price = rm(asked);
      }
      const discount = rm(num(i.discount) || 0);
      if (discount < 0) throw bad('خصم غير صالح');
      if (isCashier && discount > 0 && !s.pos.cashier_discount) throw bad('غير مسموح للكاشير بإعطاء خصم');
      return { p, qty, price, discount: Math.min(discount, rm(qty * price)), total: rm(qty * price - Math.min(discount, qty * price)) };
    });
    if (!s.pos.allow_negative_stock) {
      for (const [pid, q] of sumBy(lines.map((l) => ({ id: l.p.id, qty: l.qty })), 'id')) {
        const p = lines.find((l) => l.p.id === pid).p;
        if (p.stock < q - 1e-9) throw bad(`الكمية غير متوفرة: ${p.name} (المتوفر ${p.stock})`);
      }
    }
    const invDisc = num(data.discount) || 0;
    if (invDisc < 0) throw bad('خصم غير صالح');
    const t = calcTotals(lines, invDisc, s.tax, rm);
    if (isCashier) {
      const gross = lines.reduce((x, l) => x + l.qty * l.price, 0);
      const disc = t.discount + lines.reduce((x, l) => x + l.discount, 0);
      if (disc > 0 && !s.pos.cashier_discount) throw bad('غير مسموح للكاشير بإعطاء خصم');
      const max = Number(s.pos.cashier_max_discount) || 0;
      if (disc > 0 && max > 0 && gross > 0 && (disc / gross) * 100 > max + 0.01) throw bad(`الحد الأعلى لخصم الكاشير ${max}% من قيمة الفاتورة`);
    }
    let paid_cash = rm(Math.max(0, num(data.paid_cash) || 0));
    let paid_card = rm(Math.max(0, num(data.paid_card) || 0));
    if (paid_card > t.total) paid_card = t.total;
    if (paid_cash + paid_card > t.total) paid_cash = rm(t.total - paid_card);
    const credit = rm(t.total - paid_cash - paid_card);
    const customer_id = data.customer_id || null;
    if (credit > 0.009 && !customer_id) throw bad('البيع الآجل يتطلب اختيار عميل');
    if (customer_id && !get('SELECT 1 FROM customers WHERE id=?', customer_id)) throw bad('العميل غير موجود');
    const method = credit > 0.009 ? 'credit' : paid_cash > 0 && paid_card > 0 ? 'mixed' : paid_card > 0 ? 'card' : 'cash';
    // فواتير نقطة البيع: التاريخ والوردية يحددهما الخادم دائماً
    const fromErp = data.source === 'erp' && !isCashier;
    const date = fromErp && /^\d{4}-\d{2}-\d{2}$/.test(String(data.date || '')) ? `${data.date} ${localNow().slice(11)}` : localNow();
    const shift_id = fromErp ? null : openShiftOf(user.id);
    const no = nextNo('invoices', "WHERE type='sale'");
    const r = run(`INSERT INTO invoices(no,type,source,date,customer_id,subtotal,discount,tax,total,cost,paid_cash,paid_card,credit,tendered,method,tax_rate,tax_inclusive,user_id,shift_id,notes)
      VALUES(?,'sale',?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?)`,
      no, fromErp ? 'erp' : 'pos', date, customer_id, t.subtotal, t.discount, t.tax, t.total,
      paid_cash, paid_card, credit, num(data.tendered) > 0 ? rm(data.tendered) : null, method, t.rate, t.inclusive, user.id, shift_id, data.notes || null);
    const id = Number(r.lastInsertRowid);
    let cost = 0, drift = 0;
    for (const l of lines) {
      const unit = get('SELECT cost FROM products WHERE id=?', l.p.id).cost; // التكلفة الحالية (قد تتغير بسطر سابق لنفس الصنف)
      const value = round(l.qty * unit);
      cost += value;
      run('INSERT INTO invoice_items(invoice_id,product_id,name,qty,price,discount,total,cost) VALUES(?,?,?,?,?,?,?,?)',
        id, l.p.id, l.p.name, l.qty, l.price, l.discount, l.total, unit);
      drift += stockMove(l.p.id, -l.qty, -value, 'sale', 'invoice', id, fmtNo('sale', no), user.id, date);
    }
    cost = round(cost);
    run('UPDATE invoices SET cost=? WHERE id=?', cost, id);
    postEntry({
      date: date.slice(0, 10), description: `فاتورة مبيعات ${fmtNo('sale', no)}`, ref_type: 'invoice', ref_id: id, user_id: user.id,
      lines: [
        { account_id: acc('1101'), debit: paid_cash },
        { account_id: acc('1102'), debit: paid_card },
        { account_id: acc('1201'), debit: credit, party_type: 'customer', party_id: customer_id },
        { account_id: acc('4101'), credit: round(t.total - t.tax) },
        { account_id: acc('2201'), credit: t.tax },
        { account_id: acc('5101'), debit: cost },
        { account_id: acc('1301'), credit: cost },
        ...driftLines(drift),
      ],
    });
    return id;
  });
}

// ===== مرتجع مبيعات =====
export function createReturn(origId, data, user) {
  const s = getSettings();
  const rm = moneyRounder(s);
  return tx(() => {
    const o = get("SELECT * FROM invoices WHERE id=? AND type='sale'", origId);
    if (!o) throw bad('الفاتورة الأصلية غير موجودة');
    const m = data.refund_method || 'cash';
    if (!['cash', 'card', 'credit'].includes(m)) throw bad('طريقة الاسترداد غير صحيحة');
    if (m === 'credit' && !o.customer_id) throw bad('لا يمكن إرجاع آجل بدون عميل');
    const oitems = all('SELECT * FROM invoice_items WHERE invoice_id=?', origId);
    const req = (data.items || []).map((i) => ({ item_id: Number(i.item_id), qty: num(i.qty) })).filter((i) => i.qty > 0);
    if (!req.length) throw bad('حدد الأصناف والكميات المرتجعة');
    const lines = [...sumBy(req, 'item_id')].map(([itemId, qty]) => {
      const it = oitems.find((x) => x.id === itemId);
      if (!it) throw bad('صنف غير موجود في الفاتورة');
      if (qty > it.qty - it.returned_qty + 1e-9) throw bad(`الكمية المرتجعة أكبر من المتاح: ${it.name}`);
      return { it, qty, total: rm((it.total / it.qty) * qty) };
    });
    const sub = rm(lines.reduce((x, l) => x + l.total, 0));
    const ratio = o.subtotal > 0 ? sub / o.subtotal : 0;
    const discount = rm(o.discount * ratio);
    // لا يتجاوز مجموع المرتجعات إجمالي الفاتورة الأصلية (بسبب التقريب)
    const prev = get("SELECT COALESCE(SUM(total),0) t, COALESCE(SUM(tax),0) x FROM invoices WHERE ref_id=? AND type='return'", o.id);
    const total = Math.min(rm(o.total * ratio), rm(o.total - prev.t));
    const tax = Math.min(rm(o.tax * ratio), rm(o.tax - prev.x), total);
    const date = localNow();
    const shift_id = openShiftOf(user.id);
    const no = nextNo('invoices', "WHERE type='return'");
    const r = run(`INSERT INTO invoices(no,type,source,date,customer_id,ref_id,subtotal,discount,tax,total,cost,paid_cash,paid_card,credit,method,tax_rate,tax_inclusive,user_id,shift_id,notes)
      VALUES(?,'return',?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?)`,
      no, data.source === 'erp' && user.role !== 'cashier' ? 'erp' : 'pos', date, o.customer_id, o.id, sub, discount, tax, total,
      m === 'cash' ? total : 0, m === 'card' ? total : 0, m === 'credit' ? total : 0, m, o.tax_rate, o.tax_inclusive, user.id, shift_id, data.notes || null);
    const id = Number(r.lastInsertRowid);
    let cost = 0, drift = 0;
    for (const l of lines) {
      const value = round(l.qty * l.it.cost); // ترجع البضاعة بتكلفة بيعها الأصلية ويُعاد حساب المتوسط
      cost += value;
      run('INSERT INTO invoice_items(invoice_id,product_id,name,qty,price,discount,total,cost,orig_item_id) VALUES(?,?,?,?,?,?,?,?,?)',
        id, l.it.product_id, l.it.name, l.qty, l.it.price, rm((l.it.discount / l.it.qty) * l.qty), l.total, l.it.cost, l.it.id);
      run('UPDATE invoice_items SET returned_qty = returned_qty + ? WHERE id=?', l.qty, l.it.id);
      if (l.it.product_id) drift += stockMove(l.it.product_id, l.qty, value, 'return', 'invoice', id, fmtNo('return', no), user.id, date);
    }
    cost = round(cost);
    run('UPDATE invoices SET cost=? WHERE id=?', cost, id);
    const refundAcc = m === 'credit' ? acc('1201') : methodAccount(m);
    postEntry({
      date: date.slice(0, 10), description: `مرتجع مبيعات ${fmtNo('return', no)} عن ${fmtNo('sale', o.no)}`,
      ref_type: 'invoice', ref_id: id, user_id: user.id,
      lines: [
        { account_id: acc('4102'), debit: round(total - tax) },
        { account_id: acc('2201'), debit: tax },
        { account_id: refundAcc, credit: total, ...(m === 'credit' ? { party_type: 'customer', party_id: o.customer_id } : {}) },
        { account_id: acc('1301'), debit: cost },
        { account_id: acc('5101'), credit: cost },
        ...driftLines(drift),
      ],
    });
    return id;
  });
}

// ===== الموردين =====
export function supplierCurrency(id) {
  if (!id) return 'IQD';
  return get('SELECT currency FROM suppliers WHERE id=?', id)?.currency || 'IQD';
}
// رصيد المورد بالدينار وبالدولار
export function supplierBalance(id) {
  const b = get(`SELECT COALESCE(SUM(credit-debit),0) iqd, COALESCE(SUM(fx_credit-fx_debit),0) usd FROM journal_lines
    WHERE party_type='supplier' AND party_id=? AND account_id=?`, id, acc('2101'));
  return { iqd: round(b.iqd), usd: round(b.usd) };
}
// القيمة الدفترية بالدينار لمبلغ دولار يُخصم من حساب مورد (بمتوسط سعر الرصيد القائم)
function usdCarrying(supplierId, usd, xr) {
  const bal = supplierBalance(supplierId);
  if (bal.usd <= 0.009) return round(usd * xr);
  if (usd >= bal.usd - 0.009) return round(bal.iqd + Math.max(0, usd - bal.usd) * xr); // تصفير الرصيد بالعملتين
  return round((bal.iqd / bal.usd) * usd);
}

// ===== فاتورة مشتريات (بعملة المورد: دينار أو دولار) =====
export function createPurchase(data, user) {
  const s = getSettings();
  const items = (data.items || []).filter((i) => num(i.qty) > 0);
  if (!items.length) throw bad('فاتورة الشراء لا تحتوي أصنافاً');
  return tx(() => {
    if (data.supplier_id && !get('SELECT 1 FROM suppliers WHERE id=?', data.supplier_id)) throw bad('المورد غير موجود');
    const currency = supplierCurrency(data.supplier_id);
    const fx = currency === 'USD';
    const xr = fx ? num(data.rate) || Number(s.usd_rate) : 1;
    if (!(xr > 0)) throw bad('أدخل سعر صرف الدولار');
    const dm = fx ? round : moneyRounder(s); // تقريب مبالغ المستند بعملته
    const bm = moneyRounder(s); // تقريب المعادل بالدينار
    const lines = items.map((i) => {
      const p = get('SELECT * FROM products WHERE id=?', i.product_id);
      if (!p) throw bad('صنف غير موجود');
      const qty = num(i.qty), cost = num(i.cost);
      if (!(cost >= 0)) throw bad(`تكلفة غير صالحة: ${p.name}`);
      return { p, qty, cost: fx ? round(cost) : cost, total: dm(qty * cost) };
    });
    const subtotal = dm(lines.reduce((x, l) => x + l.total, 0));
    const discount = Math.min(dm(Math.max(0, num(data.discount) || 0)), subtotal);
    const net = dm(subtotal - discount);
    const rate = data.apply_tax && s.tax.enabled ? Number(s.tax.rate) : 0;
    const tax = dm(net * rate / 100);
    const total = dm(net + tax);
    const paid = Math.min(dm(Math.max(0, num(data.paid) || 0)), total);
    const remain = dm(total - paid);
    if (remain > 0.009 && !data.supplier_id) throw bad('الشراء الآجل يتطلب اختيار مورد');
    // المعادل بالدينار العراقي (العملة الأساسية للحسابات والمخزون)
    const totalB = bm(total * xr), netB = bm(net * xr), taxB = round(totalB - netB);
    const paidB = bm(paid * xr), remainB = round(totalB - paidB);
    const method = data.method === 'bank' ? 'bank' : 'cash';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(data.date || '')) ? data.date : today();
    const no = nextNo('purchases', "WHERE type='purchase'");
    const r = run(`INSERT INTO purchases(no,date,supplier_id,ref,subtotal,discount,tax,total,paid,method,user_id,notes,currency,rate) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      no, date, data.supplier_id || null, data.ref || null, subtotal, discount, tax, total, paid, method, user.id, data.notes || null, currency, xr);
    const id = Number(r.lastInsertRowid);
    // توزيع صافي الشراء بالدينار على الأصناف (بعد الخصم) بحيث يساوي المجموع netB تماماً
    const values = lines.map((l) => round(subtotal > 0 ? (l.total / subtotal) * netB : 0));
    if (values.length) values[values.length - 1] = round(values[values.length - 1] + netB - values.reduce((a, b) => a + b, 0));
    let drift = 0;
    lines.forEach((l, k) => {
      run('INSERT INTO purchase_items(purchase_id,product_id,name,qty,cost,total) VALUES(?,?,?,?,?,?)', id, l.p.id, l.p.name, l.qty, l.cost, l.total);
      drift += stockMove(l.p.id, l.qty, values[k], 'purchase', 'purchase', id, fmtNo('purchase', no), user.id, `${date} ${localNow().slice(11)}`);
    });
    postEntry({
      date, description: `فاتورة مشتريات ${fmtNo('purchase', no)}${fx ? ` (${total} دولار × ${xr})` : ''}${data.ref ? ' - مرجع المورد ' + data.ref : ''}`,
      ref_type: 'purchase', ref_id: id, user_id: user.id,
      lines: [
        { account_id: acc('1301'), debit: netB },
        { account_id: acc('2201'), debit: taxB },
        { account_id: methodAccount(method), credit: paidB },
        { account_id: acc('2101'), credit: remainB, party_type: 'supplier', party_id: data.supplier_id, ...(fx ? { currency: 'USD', fx_credit: remain } : {}) },
        ...driftLines(drift),
      ],
    });
    return id;
  });
}

// ===== مرتجع مشتريات (إرجاع بضاعة للمورد) =====
export function createPurchaseReturn(origId, data, user) {
  const s = getSettings();
  return tx(() => {
    const o = get("SELECT * FROM purchases WHERE id=? AND type='purchase'", origId);
    if (!o) throw bad('فاتورة الشراء الأصلية غير موجودة');
    const m = data.refund_method || (o.supplier_id ? 'credit' : 'cash');
    if (!['cash', 'bank', 'credit'].includes(m)) throw bad('طريقة التسوية غير صحيحة');
    if (m === 'credit' && !o.supplier_id) throw bad('لا يمكن الخصم من حساب مورد غير محدد');
    const fx = o.currency === 'USD', xr = o.rate || 1;
    const dm = fx ? round : moneyRounder(s), bm = moneyRounder(s);
    const oitems = all('SELECT * FROM purchase_items WHERE purchase_id=?', origId);
    const req = (data.items || []).map((i) => ({ item_id: Number(i.item_id), qty: num(i.qty) })).filter((i) => i.qty > 0);
    if (!req.length) throw bad('حدد الأصناف والكميات المرتجعة');
    const lines = [...sumBy(req, 'item_id')].map(([itemId, qty]) => {
      const it = oitems.find((x) => x.id === itemId);
      if (!it) throw bad('صنف غير موجود في الفاتورة');
      if (qty > it.qty - it.returned_qty + 1e-9) throw bad(`الكمية المرتجعة أكبر من المتاح: ${it.name}`);
      return { it, qty, total: dm(it.cost * qty) };
    });
    if (!s.pos.allow_negative_stock) {
      for (const [pid, q] of sumBy(lines.map((l) => ({ id: l.it.product_id, qty: l.qty })), 'id')) {
        const p = get('SELECT stock, name FROM products WHERE id=?', pid);
        if (p && p.stock < q - 1e-9) throw bad(`الكمية الموجودة في المخزن من "${p.name}" أقل من المرتجع`);
      }
    }
    // المبالغ بعملة المورد وبنفس نسب الفاتورة الأصلية (خصم وضريبة) وبنفس سعر الصرف
    const sub = dm(lines.reduce((x, l) => x + l.total, 0));
    const ratio = o.subtotal > 0 ? sub / o.subtotal : 0;
    const discount = dm(o.discount * ratio), tax = dm(o.tax * ratio), total = dm(o.total * ratio);
    const net = dm(total - tax);
    const totalB = bm(total * xr), netB = bm(net * xr), taxB = round(totalB - netB);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(data.date || '')) ? data.date : today();
    // لمورد الدولار: يُخصم من حسابه بمتوسط سعر رصيده، والفرق فروقات صرف
    const apDebit = m === 'credit' && fx ? usdCarrying(o.supplier_id, total, xr) : totalB;
    const no = nextNo('purchases', "WHERE type='preturn'");
    const r = run(`INSERT INTO purchases(no,type,ref_id,date,supplier_id,subtotal,discount,tax,total,paid,method,user_id,notes,currency,rate)
      VALUES(?,'preturn',?,?,?,?,?,?,?,?,?,?,?,?,?)`, no, o.id, date, o.supplier_id, sub, discount, tax, total,
      m === 'credit' ? 0 : total, m, user.id, data.notes || null, o.currency, xr);
    const id = Number(r.lastInsertRowid);
    // قيمة البضاعة المرتجعة بالدينار موزعة على الأصناف بحيث يساوي المجموع netB
    const values = lines.map((l) => round(sub > 0 ? (l.total / sub) * netB : 0));
    if (values.length) values[values.length - 1] = round(values[values.length - 1] + netB - values.reduce((a, b) => a + b, 0));
    let drift = 0;
    lines.forEach((l, k) => {
      run('INSERT INTO purchase_items(purchase_id,product_id,name,qty,cost,total,orig_item_id) VALUES(?,?,?,?,?,?,?)', id, l.it.product_id, l.it.name, l.qty, l.it.cost, l.total, l.it.id);
      run('UPDATE purchase_items SET returned_qty = returned_qty + ? WHERE id=?', l.qty, l.it.id);
      if (l.it.product_id) drift += stockMove(l.it.product_id, -l.qty, -values[k], 'preturn', 'purchase', id, fmtNo('preturn', no), user.id, `${date} ${localNow().slice(11)}`);
    });
    const fxDiff = round(totalB - apDebit);
    postEntry({
      date, description: `مرتجع مشتريات ${fmtNo('preturn', no)} عن ${fmtNo('purchase', o.no)}${fx ? ` (${total} دولار × ${xr})` : ''}`,
      ref_type: 'purchase', ref_id: id, user_id: user.id,
      lines: [
        m === 'credit'
          ? { account_id: acc('2101'), debit: apDebit, party_type: 'supplier', party_id: o.supplier_id, ...(fx ? { currency: 'USD', fx_debit: total } : {}) }
          : { account_id: methodAccount(m), debit: totalB },
        fxDiff > 0 ? { account_id: acc('5303'), debit: fxDiff } : { account_id: acc('5303'), credit: -fxDiff },
        { account_id: acc('1301'), credit: netB },
        { account_id: acc('2201'), credit: taxB },
        ...driftLines(drift),
      ],
    });
    return id;
  });
}

// ===== الرصيد الافتتاحي للعميل أو المورد =====
export function openingBalance(party, id, data, user) {
  const s = getSettings();
  return tx(() => {
    if (party === 'customer') {
      const amount = moneyRounder(s)(num(data.amount) || 0);
      if (!amount) return null;
      return postEntry({
        date: data.date || today(), description: 'رصيد افتتاحي للعميل', ref_type: 'opening', ref_id: id, user_id: user.id,
        lines: amount > 0
          ? [{ account_id: acc('1201'), debit: amount, party_type: 'customer', party_id: id }, { account_id: acc('3301'), credit: amount }]
          : [{ account_id: acc('3301'), debit: -amount }, { account_id: acc('1201'), credit: -amount, party_type: 'customer', party_id: id }],
      });
    }
    const fx = supplierCurrency(id) === 'USD';
    const amount = (fx ? round : moneyRounder(s))(num(data.amount) || 0);
    if (!amount) return null;
    const xr = fx ? num(data.rate) || Number(s.usd_rate) : 1;
    if (!(xr > 0)) throw bad('أدخل سعر الصرف');
    const base = moneyRounder(s)(Math.abs(amount) * xr);
    const fxv = fx ? { currency: 'USD', [amount > 0 ? 'fx_credit' : 'fx_debit']: Math.abs(amount) } : {};
    return postEntry({
      date: data.date || today(), description: `رصيد افتتاحي للمورد${fx ? ` (${amount} دولار × ${xr})` : ''}`, ref_type: 'opening', ref_id: id, user_id: user.id,
      lines: amount > 0
        ? [{ account_id: acc('3301'), debit: base }, { account_id: acc('2101'), credit: base, party_type: 'supplier', party_id: id, ...fxv }]
        : [{ account_id: acc('2101'), debit: base, party_type: 'supplier', party_id: id, ...fxv }, { account_id: acc('3301'), credit: base }],
    });
  });
}

// ===== سندات القبض والصرف والمصروفات =====
export function createVoucher(data, user) {
  const s = getSettings();
  const kind = data.kind;
  const method = data.method === 'bank' ? 'bank' : 'cash';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(data.date || '')) ? data.date : today();
  return tx(() => {
    let lines, desc, currency = 'IQD', xr = 1;
    const usdPayment = kind === 'payment' && data.party_id && supplierCurrency(data.party_id) === 'USD';
    const amount = (usdPayment ? round : moneyRounder(s))(num(data.amount) || 0);
    if (!(amount > 0)) throw bad('أدخل مبلغاً صحيحاً');
    let base = amount;
    if (kind === 'receipt') {
      if (!data.party_id || !get('SELECT 1 FROM customers WHERE id=?', data.party_id)) throw bad('اختر العميل');
      lines = [
        { account_id: methodAccount(method), debit: amount },
        { account_id: acc('1201'), credit: amount, party_type: 'customer', party_id: data.party_id },
      ];
      desc = 'سند قبض من عميل';
    } else if (kind === 'payment') {
      if (!data.party_id || !get('SELECT 1 FROM suppliers WHERE id=?', data.party_id)) throw bad('اختر المورد');
      if (usdPayment) {
        // الدفع بالدولار: يُحوَّل بسعر صرف يوم الدفع، والفرق عن سعر الشراء يُسجّل كفروقات صرف
        currency = 'USD';
        xr = num(data.rate) || Number(s.usd_rate);
        if (!(xr > 0)) throw bad('أدخل سعر صرف الدولار');
        base = moneyRounder(s)(amount * xr);
        const carry = usdCarrying(data.party_id, amount, xr);
        const diff = round(base - carry);
        lines = [
          { account_id: acc('2101'), debit: carry, party_type: 'supplier', party_id: data.party_id, currency: 'USD', fx_debit: amount },
          { account_id: methodAccount(method), credit: base },
          diff > 0 ? { account_id: acc('5303'), debit: diff } : { account_id: acc('5303'), credit: -diff },
        ];
        desc = `سند صرف لمورد (${amount} دولار × ${xr})`;
      } else {
        lines = [
          { account_id: acc('2101'), debit: amount, party_type: 'supplier', party_id: data.party_id },
          { account_id: methodAccount(method), credit: amount },
        ];
        desc = 'سند صرف لمورد';
      }
    } else if (kind === 'expense') {
      const a = get('SELECT * FROM accounts WHERE id=?', data.account_id);
      if (!a || a.is_group || a.type !== 'expense') throw bad('اختر حساب المصروف');
      lines = [
        { account_id: a.id, debit: amount },
        { account_id: methodAccount(method), credit: amount },
      ];
      desc = `مصروف: ${a.name}`;
    } else throw bad('نوع السند غير معروف');
    const no = nextNo('vouchers', 'WHERE kind=?', kind);
    const r = run('INSERT INTO vouchers(no,kind,date,party_type,party_id,account_id,amount,method,notes,user_id,currency,rate,base_amount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      no, kind, date, kind === 'receipt' ? 'customer' : kind === 'payment' ? 'supplier' : null,
      data.party_id || null, kind === 'expense' ? data.account_id : null, amount, method, data.notes || null, user.id, currency, xr, base);
    const id = Number(r.lastInsertRowid);
    postEntry({ date, description: `${desc} ${fmtNo(kind, no)}${data.notes ? ' - ' + data.notes : ''}`, ref_type: 'voucher', ref_id: id, user_id: user.id, lines });
    return id;
  });
}

// ===== تسوية المخزون =====
export function adjustStock(data, user) {
  return tx(() => {
    const p = get('SELECT * FROM products WHERE id=?', data.product_id);
    if (!p) throw bad('صنف غير موجود');
    const q = num(data.qty);
    if (!Number.isFinite(q)) throw bad('أدخل الكمية');
    const delta = data.mode === 'set' ? q - p.stock : q;
    if (Math.abs(delta) < 1e-9) throw bad('لا يوجد تغيير في الكمية');
    const value = round(delta * p.cost);
    const drift = stockMove(p.id, delta, value, 'adjust', 'adjust', null, data.note || 'تسوية جرد', user.id);
    const other = data.opening ? acc('3301') : acc('5301');
    postEntry({
      date: today(), description: `${data.opening ? 'رصيد افتتاحي' : 'تسوية مخزون'}: ${p.name} (${delta > 0 ? '+' : ''}${delta})`,
      ref_type: 'adjust', ref_id: p.id, user_id: user.id,
      lines: [
        ...(value > 0 ? [{ account_id: acc('1301'), debit: value }, { account_id: other, credit: value }]
          : [{ account_id: other, debit: -value }, { account_id: acc('1301'), credit: -value }]),
        ...driftLines(drift),
      ],
    });
    return get('SELECT * FROM products WHERE id=?', p.id);
  });
}

// ===== الورديات =====
export function shiftSummary(shiftId) {
  const sh = get('SELECT s.*, u.name user_name FROM shifts s LEFT JOIN users u ON u.id=s.user_id WHERE s.id=?', shiftId);
  if (!sh) throw new HttpError(404, 'الوردية غير موجودة');
  const q = (type) => get(`SELECT COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(paid_cash),0) cash,
    COALESCE(SUM(paid_card),0) card, COALESCE(SUM(credit),0) credit, COALESCE(SUM(discount),0) discount, COALESCE(SUM(tax),0) tax
    FROM invoices WHERE shift_id=? AND type=?`, shiftId, type);
  const sales = q('sale'), returns = q('return');
  const expected = round(sh.opening_cash + sales.cash - returns.cash);
  return { shift: sh, sales, returns, expected_cash: expected, net: round(sales.total - returns.total) };
}
