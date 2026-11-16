// The Queen — خادم النظام (ERP + POS) — بدون أي مكتبات خارجية
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import { MEDIA_DIR, saveMedia, reservedQty, syncNow, pushSoon, testConnection, scheduleSync, setOrderStatus, webState, onWebEvent } from './lib/web-sync.js';
import {
  db, all, get, run, tx, round, today, localNow, ROOT, DATA_DIR,
  getSettings, saveSettings, hashPassword, checkPassword,
} from './lib/db.js';
import {
  HttpError, bad, fmtNo, acc, postEntry, createSale, createReturn, createPurchase,
  createVoucher, adjustStock, shiftSummary, createPurchaseReturn, openingBalance,
} from './lib/services.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(ROOT, 'public');

// ===== أحداث مباشرة (SSE) لتحديث نقطة البيع فوراً =====
const clients = new Set();
function broadcast(type, data = {}) {
  if (type === 'products') pushSoon(); // الموقع يتحدث مباشرة مع أي تغيير في الأصناف أو المخزون
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) { try { c.write(msg); } catch { clients.delete(c); } }
}
setInterval(() => { for (const c of clients) { try { c.write(': ping\n\n'); } catch { clients.delete(c); } } }, 25000);

// ===== الموجّه =====
const routes = [];
function route(method, pattern, roles, handler) {
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
  routes.push({ method, re, roles, handler });
}
const ADMIN = ['admin', 'manager'];
const ANY = ['admin', 'manager', 'cashier'];

// ===== المصادقة =====
function userFromToken(token) {
  if (!token) return null;
  return get(`SELECT u.id, u.name, u.username, u.role, s.via FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND u.active=1`, token) || null;
}
function newSession(u, via) {
  const token = crypto.randomBytes(24).toString('hex');
  run('INSERT INTO sessions(token,user_id,via) VALUES(?,?,?)', token, u.id, via);
  return { token, user: { id: u.id, name: u.name, username: u.username, role: u.role } };
}

// حماية من التخمين: 5 محاولات خاطئة لكل جهاز ثم إيقاف مؤقت يتضاعف
const attempts = new Map();
function guard(ip) {
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) throw new HttpError(429, `محاولات كثيرة خاطئة، حاول بعد ${Math.ceil((a.until - Date.now()) / 1000)} ثانية`);
}
function failed(ip) {
  const a = attempts.get(ip) || { n: 0, until: 0 };
  a.n++;
  if (a.n >= 5) a.until = Date.now() + Math.min(15 * 60, 30 * 2 ** (a.n - 5)) * 1000;
  attempts.set(ip, a);
}
route('POST', '/api/login', null, ({ body, req }) => {
  const ip = req.socket.remoteAddress || '';
  guard(ip);
  if (body.pin != null && body.pin !== '') {
    const u = get('SELECT * FROM users WHERE pin=? AND active=1', String(body.pin));
    if (!u) { failed(ip); throw new HttpError(401, 'الرمز السري غير صحيح'); }
    attempts.delete(ip);
    return newSession(u, 'pin');
  }
  const u = get('SELECT * FROM users WHERE username=? AND active=1', String(body.username || '').trim());
  if (!u || !checkPassword(body.password || '', u.password)) { failed(ip); throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة'); }
  attempts.delete(ip);
  return newSession(u, 'password');
});
route('POST', '/api/logout', ANY, ({ token }) => { run('DELETE FROM sessions WHERE token=?', token); return { ok: true }; });
route('GET', '/api/me', ANY, ({ user }) => user);
route('GET', '/api/public', null, () => {
  const s = getSettings();
  return { store: { name: s.store.name, name_ar: s.store.name_ar, logo: s.store.logo } };
});

// ===== الإعدادات =====
// مفتاح ربط الموقع لا يظهر إلا للمدير
const publicSettings = (s, user) => (user.role === 'admin' ? s : { ...s, web: { enabled: s.web.enabled, url: s.web.url } });
route('GET', '/api/settings', ANY, ({ user }) => publicSettings(getSettings(), user));
route('PUT', '/api/settings', ['admin'], ({ body, user }) => {
  const s = saveSettings(body); broadcast('settings');
  if (body.web) scheduleSync();
  return publicSettings(s, user);
});

// ===== المستخدمين =====
route('GET', '/api/users', ['admin'], () => all("SELECT id,name,username,role,active,created_at, CASE WHEN pin IS NOT NULL AND pin<>'' THEN 1 ELSE 0 END has_pin FROM users ORDER BY id"));
route('POST', '/api/users', ['admin'], ({ body }) => saveUser(null, body));
route('PUT', '/api/users/:id', ['admin'], ({ body, params }) => saveUser(Number(params.id), body));
function saveUser(id, b) {
  if (!b.name) throw bad('الاسم مطلوب');
  if (b.pin && !/^\d{4,8}$/.test(String(b.pin))) throw bad('الرمز السري يجب أن يكون من 4 إلى 8 أرقام');
  if (b.pin) {
    const dup = get('SELECT id FROM users WHERE pin=? AND id<>?', String(b.pin), id || 0);
    if (dup) throw bad('الرمز السري مستخدم لمستخدم آخر');
  }
  const role = ['admin', 'manager', 'cashier'].includes(b.role) ? b.role : 'cashier';
  try {
    if (id) {
      if (id === 1 && (role !== 'admin' || !b.active)) throw bad('لا يمكن إيقاف أو تغيير صلاحية المدير الرئيسي');
      run('UPDATE users SET name=?, username=?, role=?, active=? WHERE id=?', b.name, b.username || null, role, b.active ? 1 : 0, id);
      if (b.pin) run('UPDATE users SET pin=? WHERE id=?', String(b.pin), id);
      if (b.password) run('UPDATE users SET password=? WHERE id=?', hashPassword(b.password), id);
      if (!b.active) run('DELETE FROM sessions WHERE user_id=?', id);
    } else {
      id = Number(run('INSERT INTO users(name,username,password,pin,role,active) VALUES(?,?,?,?,?,?)', b.name, b.username || null,
        b.password ? hashPassword(b.password) : null, b.pin || null, role, b.active === false ? 0 : 1).lastInsertRowid);
    }
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw bad('اسم المستخدم مستخدم مسبقاً'); throw e; }
  return get('SELECT id,name,username,role,active FROM users WHERE id=?', id);
}

// ===== التصنيفات =====
route('GET', '/api/categories', ANY, () => all(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1) products
  FROM categories c ORDER BY sort, name`));
route('POST', '/api/categories', ADMIN, ({ body }) => {
  if (!body.name) throw bad('الاسم مطلوب');
  const id = run('INSERT INTO categories(name,sort) VALUES(?,?)', body.name, Number(body.sort) || 0).lastInsertRowid;
  broadcast('products'); return get('SELECT * FROM categories WHERE id=?', id);
});
route('PUT', '/api/categories/:id', ADMIN, ({ body, params }) => {
  run('UPDATE categories SET name=?, sort=? WHERE id=?', body.name, Number(body.sort) || 0, params.id);
  broadcast('products'); return get('SELECT * FROM categories WHERE id=?', params.id);
});
route('DELETE', '/api/categories/:id', ADMIN, ({ params }) => {
  run('UPDATE products SET category_id=NULL WHERE category_id=?', params.id);
  run('DELETE FROM categories WHERE id=?', params.id); broadcast('products'); return { ok: true };
});

// ===== المنتجات =====
route('GET', '/api/products', ANY, ({ query }) => {
  const w = []; const p = [];
  if (query.active !== 'all') w.push('p.active=1');
  if (query.category_id) { w.push('p.category_id=?'); p.push(query.category_id); }
  if (query.q) { w.push('(p.name LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)'); p.push(`%${query.q}%`, `%${query.q}%`, `%${query.q}%`); }
  if (query.low) w.push('p.stock <= p.min_stock');
  return all(`SELECT p.*, c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY p.name`, ...p);
});
route('GET', '/api/products/:id', ADMIN, ({ params }) => {
  const p = get('SELECT p.*, c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?', params.id);
  if (!p) throw new HttpError(404, 'الصنف غير موجود');
  p.moves = all(`SELECT m.*, u.name user_name FROM stock_moves m LEFT JOIN users u ON u.id=m.user_id WHERE product_id=? ORDER BY m.id DESC LIMIT 200`, params.id);
  return p;
});
route('POST', '/api/products', ADMIN, ({ body, user }) => {
  const id = tx(() => {
    const id = Number(saveProduct(null, body));
    const qty = Number(body.opening_stock) || 0;
    if (qty) adjustStock({ product_id: id, qty, mode: 'add', opening: true, note: 'رصيد افتتاحي' }, user);
    return id;
  });
  broadcast('products'); return get('SELECT * FROM products WHERE id=?', id);
});
route('PUT', '/api/products/:id', ADMIN, ({ body, params }) => {
  saveProduct(Number(params.id), body); broadcast('products'); return get('SELECT * FROM products WHERE id=?', params.id);
});
route('DELETE', '/api/products/:id', ADMIN, ({ params }) => {
  const used = get('SELECT 1 FROM stock_moves WHERE product_id=? LIMIT 1', params.id)
    || get('SELECT 1 FROM invoice_items WHERE product_id=? LIMIT 1', params.id);
  if (used) { run('UPDATE products SET active=0 WHERE id=?', params.id); broadcast('products'); return { ok: true, archived: true }; }
  run('DELETE FROM products WHERE id=?', params.id); broadcast('products'); return { ok: true };
});
function saveProduct(id, b) {
  if (!b.name) throw bad('اسم الصنف مطلوب');
  const f = [b.name.trim(), b.sku || null, (b.barcode || '').trim() || null, b.category_id || null, b.unit || 'حبة',
    round(b.cost), round(b.price), Number(b.min_stock) || 0, b.active === false || b.active === 0 ? 0 : 1, b.notes || null];
  try {
    if (id) {
      // التكلفة لا تُعدّل يدوياً بعد الإنشاء: تُحسب تلقائياً من المشتريات (حفاظاً على تطابق المخزون مع الحسابات)
      const [n1, n2, n3, n4, n5, , n7, n8, n9, n10] = f;
      run('UPDATE products SET name=?, sku=?, barcode=?, category_id=?, unit=?, price=?, min_stock=?, active=?, notes=? WHERE id=?', n1, n2, n3, n4, n5, n7, n8, n9, n10, id);
    } else {
      id = Number(run('INSERT INTO products(name,sku,barcode,category_id,unit,cost,price,min_stock,active,notes) VALUES(?,?,?,?,?,?,?,?,?,?)', ...f).lastInsertRowid);
    }
    if (!f[2]) run('UPDATE products SET barcode=? WHERE id=?', String(20000000 + id), id);
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw bad('الباركود مستخدم لصنف آخر'); throw e; }
  return id;
}
route('POST', '/api/stock/adjust', ADMIN, ({ body, user }) => { const p = adjustStock(body, user); broadcast('products'); return p; });
route('GET', '/api/stock/moves', ADMIN, ({ query }) => {
  const w = ['date(m.date) BETWEEN ? AND ?']; const p = [query.from || '2000-01-01', query.to || '2999-12-31'];
  if (query.type) { w.push('m.type=?'); p.push(query.type); }
  if (query.product_id) { w.push('m.product_id=?'); p.push(query.product_id); }
  return all(`SELECT m.*, pr.name product, u.name user_name FROM stock_moves m JOIN products pr ON pr.id=m.product_id
    LEFT JOIN users u ON u.id=m.user_id WHERE ${w.join(' AND ')} ORDER BY m.id DESC LIMIT 1000`, ...p);
});

// ===== العملاء والموردين =====
for (const [tbl, party, accCode, sign] of [['customers', 'customer', '1201', 'debit-credit'], ['suppliers', 'supplier', '2101', 'credit-debit']]) {
  route('GET', `/api/${tbl}`, ANY, ({ query }) => {
    const q = query.q ? `%${query.q}%` : null;
    return all(`SELECT t.*, COALESCE((SELECT SUM(${sign}) FROM journal_lines WHERE party_type='${party}' AND party_id=t.id AND account_id=?),0) balance
      ${party === 'supplier' ? `, COALESCE((SELECT SUM(fx_credit-fx_debit) FROM journal_lines WHERE party_type='supplier' AND party_id=t.id AND account_id=?),0) balance_fx` : ''}
      FROM ${tbl} t ${q ? 'WHERE t.name LIKE ? OR t.phone LIKE ?' : ''} ORDER BY t.name`, acc(accCode), ...(party === 'supplier' ? [acc(accCode)] : []), ...(q ? [q, q] : []))
      .map((r) => ({ ...r, balance: round(r.balance), ...(r.balance_fx != null ? { balance_fx: round(r.balance_fx) } : {}) }));
  });
  route('POST', `/api/${tbl}`, party === 'supplier' ? ADMIN : ANY, ({ body, user }) => {
    if (!body.name) throw bad('الاسم مطلوب');
    const id = tx(() => {
      const id = Number(run(`INSERT INTO ${tbl}(name,phone,email,address,tax_no,notes) VALUES(?,?,?,?,?,?)`,
        body.name, body.phone || null, body.email || null, body.address || null, body.tax_no || null, body.notes || null).lastInsertRowid);
      if (party === 'supplier') run('UPDATE suppliers SET currency=? WHERE id=?', body.currency === 'USD' ? 'USD' : 'IQD', id);
      if (Number(body.opening_balance) && ADMIN.includes(user.role)) openingBalance(party, id, { amount: body.opening_balance, rate: body.rate }, user);
      return id;
    });
    return get(`SELECT * FROM ${tbl} WHERE id=?`, id);
  });
  route('POST', `/api/${tbl}/:id/opening`, ADMIN, ({ body, params, user }) => {
    if (!get(`SELECT 1 FROM ${tbl} WHERE id=?`, params.id)) throw new HttpError(404, 'غير موجود');
    if (!Number(body.amount)) throw bad('أدخل المبلغ');
    openingBalance(party, Number(params.id), body, user); return { ok: true };
  });
  route('PUT', `/api/${tbl}/:id`, ADMIN, ({ body, params }) => {
    if (party === 'supplier') {
      const cur = get('SELECT currency FROM suppliers WHERE id=?', params.id)?.currency;
      const next = body.currency === 'USD' ? 'USD' : 'IQD';
      if (cur && cur !== next && get("SELECT 1 FROM journal_lines WHERE party_type='supplier' AND party_id=? LIMIT 1", params.id))
        throw bad('لا يمكن تغيير عملة مورد عليه حركات');
      run('UPDATE suppliers SET currency=? WHERE id=?', next, params.id);
    }
    run(`UPDATE ${tbl} SET name=?, phone=?, email=?, address=?, tax_no=?, notes=? WHERE id=?`,
      body.name, body.phone || null, body.email || null, body.address || null, body.tax_no || null, body.notes || null, params.id);
    return get(`SELECT * FROM ${tbl} WHERE id=?`, params.id);
  });
  route('DELETE', `/api/${tbl}/:id`, ADMIN, ({ params }) => {
    const used = get(`SELECT 1 FROM journal_lines WHERE party_type='${party}' AND party_id=? LIMIT 1`, params.id)
      || get(`SELECT 1 FROM ${party === 'customer' ? 'invoices WHERE customer_id' : 'purchases WHERE supplier_id'}=? LIMIT 1`, params.id);
    if (used) throw bad('لا يمكن الحذف: توجد حركات مرتبطة');
    run(`DELETE FROM ${tbl} WHERE id=?`, params.id); return { ok: true };
  });
  route('GET', `/api/${tbl}/:id/statement`, ADMIN, ({ params, query }) => {
    const fx = party === 'supplier' && get('SELECT currency FROM suppliers WHERE id=?', params.id)?.currency === 'USD';
    return { ...ledger({ account_id: acc(accCode), party_type: party, party_id: params.id, from: query.from, to: query.to, sign, fx }), currency: fx ? 'USD' : 'IQD' };
  });
}

// ===== الحسابات =====
route('GET', '/api/accounts', ADMIN, () => all(`SELECT a.*,
  COALESCE((SELECT SUM(debit) FROM journal_lines WHERE account_id=a.id),0) debit,
  COALESCE((SELECT SUM(credit) FROM journal_lines WHERE account_id=a.id),0) credit FROM accounts a ORDER BY code`));
route('POST', '/api/accounts', ['admin'], ({ body }) => {
  if (!body.code || !body.name) throw bad('الرمز والاسم مطلوبان');
  const parent = body.parent_id ? get('SELECT * FROM accounts WHERE id=?', body.parent_id) : null;
  const type = parent ? parent.type : body.type;
  try {
    const id = run('INSERT INTO accounts(code,name,type,parent_id,is_group) VALUES(?,?,?,?,?)', body.code, body.name, type, body.parent_id || null, body.is_group ? 1 : 0).lastInsertRowid;
    return get('SELECT * FROM accounts WHERE id=?', id);
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw bad('رمز الحساب مستخدم'); throw e; }
});
route('PUT', '/api/accounts/:id', ['admin'], ({ body, params }) => {
  const a = get('SELECT * FROM accounts WHERE id=?', params.id);
  if (!a) throw new HttpError(404, 'غير موجود');
  if (a.system) run('UPDATE accounts SET name=? WHERE id=?', body.name, a.id);
  else run('UPDATE accounts SET name=?, code=? WHERE id=?', body.name, body.code || a.code, a.id);
  return get('SELECT * FROM accounts WHERE id=?', a.id);
});
route('DELETE', '/api/accounts/:id', ['admin'], ({ params }) => {
  const a = get('SELECT * FROM accounts WHERE id=?', params.id);
  if (!a) throw new HttpError(404, 'غير موجود');
  if (a.system) throw bad('لا يمكن حذف حساب نظامي');
  if (get('SELECT 1 FROM journal_lines WHERE account_id=? LIMIT 1', a.id) || get('SELECT 1 FROM accounts WHERE parent_id=? LIMIT 1', a.id))
    throw bad('لا يمكن الحذف: الحساب عليه حركات أو حسابات فرعية');
  run('DELETE FROM accounts WHERE id=?', a.id); return { ok: true };
});

// ===== القيود =====
route('GET', '/api/journal', ADMIN, ({ query }) => {
  const w = ['date BETWEEN ? AND ?']; const p = [query.from || '2000-01-01', query.to || '2999-12-31'];
  if (query.ref_type) { w.push('ref_type=?'); p.push(query.ref_type); }
  if (query.q) { w.push('description LIKE ?'); p.push(`%${query.q}%`); }
  return all(`SELECT e.*, u.name user_name, (SELECT SUM(debit) FROM journal_lines WHERE entry_id=e.id) amount
    FROM journal_entries e LEFT JOIN users u ON u.id=e.user_id WHERE ${w.join(' AND ')} ORDER BY e.id DESC LIMIT 1000`, ...p);
});
route('GET', '/api/journal/:id', ADMIN, ({ params }) => entryDetail(params.id));
function entryDetail(id) {
  const e = get('SELECT e.*, u.name user_name FROM journal_entries e LEFT JOIN users u ON u.id=e.user_id WHERE e.id=?', id);
  if (!e) throw new HttpError(404, 'القيد غير موجود');
  e.lines = all(`SELECT l.*, a.code, a.name account,
    CASE l.party_type WHEN 'customer' THEN (SELECT name FROM customers WHERE id=l.party_id) WHEN 'supplier' THEN (SELECT name FROM suppliers WHERE id=l.party_id) END party
    FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE entry_id=? ORDER BY l.id`, id);
  return e;
}
route('POST', '/api/journal', ADMIN, ({ body, user }) => {
  const id = tx(() => postEntry({ date: body.date, description: body.description, ref_type: 'manual', user_id: user.id, lines: body.lines || [] }));
  if (!id) throw bad('القيد فارغ');
  return entryDetail(id);
});
route('DELETE', '/api/journal/:id', ['admin'], ({ params }) => {
  const e = get('SELECT * FROM journal_entries WHERE id=?', params.id);
  if (!e) throw new HttpError(404, 'غير موجود');
  if (e.ref_type !== 'manual') throw bad('لا يمكن حذف قيد تلقائي، استخدم المرتجع أو قيداً عكسياً');
  run('DELETE FROM journal_entries WHERE id=?', e.id); return { ok: true };
});

// ===== فواتير المبيعات =====
function invoiceDetail(id) {
  const inv = get(`SELECT i.*, c.name customer_name, c.phone customer_phone, c.address customer_address, c.tax_no customer_tax_no,
    u.name user_name, o.no ref_no FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id LEFT JOIN users u ON u.id=i.user_id
    LEFT JOIN invoices o ON o.id=i.ref_id WHERE i.id=?`, id);
  if (!inv) throw new HttpError(404, 'الفاتورة غير موجودة');
  inv.items = all('SELECT ii.*, p.sku, p.barcode, p.unit FROM invoice_items ii LEFT JOIN products p ON p.id=ii.product_id WHERE invoice_id=? ORDER BY ii.id', id);
  inv.number = fmtNo(inv.type, inv.no);
  if (inv.ref_no) inv.ref_number = fmtNo('sale', inv.ref_no);
  inv.returns = all("SELECT id, no, total, date FROM invoices WHERE ref_id=? AND type='return'", id).map((r) => ({ ...r, number: fmtNo('return', r.no) }));
  return inv;
}
route('GET', '/api/invoices', ANY, ({ query, user }) => {
  const w = ['date(i.date) BETWEEN ? AND ?']; const p = [query.from || '2000-01-01', query.to || '2999-12-31'];
  if (query.type) { w.push('i.type=?'); p.push(query.type); }
  if (query.source) { w.push('i.source=?'); p.push(query.source); }
  if (query.method) { w.push('i.method=?'); p.push(query.method); }
  if (query.customer_id) { w.push('i.customer_id=?'); p.push(query.customer_id); }
  if (query.shift_id) { w.push('i.shift_id=?'); p.push(query.shift_id); }
  if (user.role === 'cashier') { w.push('i.user_id=?'); p.push(user.id); }
  if (query.q) {
    const n = String(query.q).replace(/\D/g, '');
    w.push('(c.name LIKE ? OR i.no = ?)'); p.push(`%${query.q}%`, n ? Number(n) : -1);
  }
  return all(`SELECT i.id, i.no, i.type, i.source, i.date, i.total, i.tax, i.discount, i.method, i.paid_cash, i.paid_card, i.credit,
    c.name customer_name, u.name user_name FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id LEFT JOIN users u ON u.id=i.user_id
    WHERE ${w.join(' AND ')} ORDER BY i.id DESC LIMIT ${Math.min(Number(query.limit) || 500, 5000)}`, ...p)
    .map((r) => ({ ...r, number: fmtNo(r.type, r.no) }));
});
route('GET', '/api/invoices/lookup/:no', ANY, ({ params }) => {
  const n = Number(String(params.no).replace(/\D/g, ''));
  const i = get("SELECT id FROM invoices WHERE type='sale' AND no=?", n);
  if (!i) throw new HttpError(404, 'لم يتم العثور على الفاتورة');
  return invoiceDetail(i.id);
});
route('GET', '/api/invoices/:id', ANY, ({ params }) => invoiceDetail(params.id));
route('POST', '/api/invoices', ANY, ({ body, user }) => {
  const s = getSettings();
  if (body.source !== 'erp' && s.pos.require_shift) {
    const sh = get('SELECT id FROM shifts WHERE user_id=? AND closed_at IS NULL', user.id);
    if (!sh) throw bad('يجب فتح وردية قبل البيع');
  }
  if (body.source === 'erp' && !ADMIN.includes(user.role)) throw new HttpError(403, 'غير مصرح');
  const id = createSale(body, user); broadcast('products', { stock: true }); return invoiceDetail(id);
});
route('POST', '/api/invoices/:id/return', ANY, ({ body, params, user }) => {
  const id = createReturn(Number(params.id), body, user); broadcast('products', { stock: true }); return invoiceDetail(id);
});

// ===== المشتريات =====
route('GET', '/api/purchases', ADMIN, ({ query }) => {
  const w = ['p.date BETWEEN ? AND ?']; const p = [query.from || '2000-01-01', query.to || '2999-12-31'];
  if (query.supplier_id) { w.push('p.supplier_id=?'); p.push(query.supplier_id); }
  return all(`SELECT p.*, s.name supplier_name, u.name user_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id
    LEFT JOIN users u ON u.id=p.user_id WHERE ${w.join(' AND ')} ORDER BY p.id DESC LIMIT 2000`, ...p).map((r) => ({ ...r, number: fmtNo(r.type, r.no) }));
});
route('GET', '/api/purchases/:id', ADMIN, ({ params }) => purchaseDetail(params.id));
function purchaseDetail(id) {
  const p = get(`SELECT p.*, s.name supplier_name, s.phone supplier_phone, s.address supplier_address, s.tax_no supplier_tax_no, u.name user_name,
    o.no ref_no FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN users u ON u.id=p.user_id LEFT JOIN purchases o ON o.id=p.ref_id WHERE p.id=?`, id);
  if (!p) throw new HttpError(404, 'غير موجود');
  p.items = all('SELECT pi.*, pr.sku, pr.barcode, pr.unit FROM purchase_items pi LEFT JOIN products pr ON pr.id=pi.product_id WHERE purchase_id=?', id);
  p.number = fmtNo(p.type, p.no);
  if (p.ref_no) p.ref_number = fmtNo('purchase', p.ref_no);
  p.returns = all("SELECT id, no, total, date FROM purchases WHERE ref_id=? AND type='preturn'", id).map((r) => ({ ...r, number: fmtNo('preturn', r.no) }));
  return p;
}
route('POST', '/api/purchases', ADMIN, ({ body, user }) => { const id = createPurchase(body, user); broadcast('products', { stock: true }); return purchaseDetail(id); });
route('POST', '/api/purchases/:id/return', ADMIN, ({ body, params, user }) => {
  const id = createPurchaseReturn(Number(params.id), body, user); broadcast('products', { stock: true }); return purchaseDetail(id);
});

// ===== استيراد الأصناف من ملف (Excel محفوظ CSV) =====
route('POST', '/api/products/import', ADMIN, ({ body, user }) => {
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) throw bad('الملف لا يحتوي بيانات');
  const res = { created: 0, updated: 0, skipped: [] };
  tx(() => {
    const catId = (name) => {
      name = String(name || '').trim(); if (!name) return null;
      const c = get('SELECT id FROM categories WHERE name=?', name);
      return c ? c.id : Number(run('INSERT INTO categories(name) VALUES(?)', name).lastInsertRowid);
    };
    rows.forEach((r, i) => {
      const name = String(r.name || '').trim();
      if (!name) { res.skipped.push(`سطر ${i + 2}: بدون اسم`); return; }
      const barcode = String(r.barcode || '').trim();
      const ex = barcode ? get('SELECT * FROM products WHERE barcode=?', barcode) : get('SELECT * FROM products WHERE name=?', name);
      const num = (x) => Number(String(x ?? '').replace(/,/g, '')) || 0;
      if (ex) {
        if (!body.update) { res.skipped.push(`سطر ${i + 2}: "${name}" موجود مسبقاً`); return; }
        run('UPDATE products SET name=?, price=?, category_id=COALESCE(?,category_id), unit=COALESCE(?,unit), min_stock=?, active=1 WHERE id=?',
          name, r.price !== '' && r.price != null ? num(r.price) : ex.price, catId(r.category), r.unit || null, r.min_stock !== '' && r.min_stock != null ? num(r.min_stock) : ex.min_stock, ex.id);
        res.updated++;
      } else {
        let id;
        try { id = saveProduct(null, { name, barcode, sku: r.sku, category_id: catId(r.category), unit: r.unit || 'حبة', cost: num(r.cost), price: num(r.price), min_stock: num(r.min_stock) }); }
        catch (e) { res.skipped.push(`سطر ${i + 2}: ${e.message}`); return; }
        const q = num(r.stock);
        if (q) adjustStock({ product_id: id, qty: q, mode: 'add', opening: true, note: 'رصيد افتتاحي (استيراد)' }, user);
        res.created++;
      }
    });
  });
  broadcast('products');
  return res;
});

// ===== السندات والمصروفات =====
route('GET', '/api/vouchers', ADMIN, ({ query }) => {
  const w = ['v.date BETWEEN ? AND ?']; const p = [query.from || '2000-01-01', query.to || '2999-12-31'];
  if (query.kind) { w.push('v.kind=?'); p.push(query.kind); }
  return all(`SELECT v.*, a.name account_name, u.name user_name,
    CASE v.party_type WHEN 'customer' THEN (SELECT name FROM customers WHERE id=v.party_id) WHEN 'supplier' THEN (SELECT name FROM suppliers WHERE id=v.party_id) END party_name
    FROM vouchers v LEFT JOIN accounts a ON a.id=v.account_id LEFT JOIN users u ON u.id=v.user_id
    WHERE ${w.join(' AND ')} ORDER BY v.id DESC LIMIT 2000`, ...p).map((r) => ({ ...r, number: fmtNo(r.kind, r.no) }));
});
route('POST', '/api/vouchers', ADMIN, ({ body, user }) => {
  const id = createVoucher(body, user);
  const v = get('SELECT * FROM vouchers WHERE id=?', id); v.number = fmtNo(v.kind, v.no); return v;
});

// ===== الورديات =====
route('GET', '/api/shifts/current', ANY, ({ user }) => {
  const sh = get('SELECT id FROM shifts WHERE user_id=? AND closed_at IS NULL ORDER BY id DESC LIMIT 1', user.id);
  return sh ? shiftSummary(sh.id) : null;
});
route('POST', '/api/shifts/open', ANY, ({ body, user }) => {
  if (get('SELECT id FROM shifts WHERE user_id=? AND closed_at IS NULL', user.id)) throw bad('لديك وردية مفتوحة بالفعل');
  const id = run('INSERT INTO shifts(user_id,opened_at,opening_cash) VALUES(?,?,?)', user.id, localNow(), round(body.opening_cash)).lastInsertRowid;
  return shiftSummary(id);
});
route('POST', '/api/shifts/:id/close', ANY, ({ body, params, user }) => {
  const sh = get('SELECT * FROM shifts WHERE id=? AND closed_at IS NULL', params.id);
  if (!sh) throw bad('الوردية غير مفتوحة');
  if (sh.user_id !== user.id && !ADMIN.includes(user.role)) throw new HttpError(403, 'غير مصرح');
  const sum = shiftSummary(sh.id);
  const counted = round(body.counted_cash);
  tx(() => {
    run('UPDATE shifts SET closed_at=?, counted_cash=?, expected_cash=?, notes=? WHERE id=?', localNow(), counted, sum.expected_cash, body.notes || null, sh.id);
    const diff = round(counted - sum.expected_cash);
    if (Math.abs(diff) > 0.009) {
      postEntry({
        date: today(), description: `${diff > 0 ? 'زيادة' : 'عجز'} صندوق - إغلاق وردية #${sh.id}`, ref_type: 'shift', ref_id: sh.id, user_id: user.id,
        lines: diff > 0
          ? [{ account_id: acc('1101'), debit: diff }, { account_id: acc('5302'), credit: diff }]
          : [{ account_id: acc('5302'), debit: -diff }, { account_id: acc('1101'), credit: -diff }],
      });
    }
  });
  return shiftSummary(sh.id);
});
route('GET', '/api/shifts', ADMIN, ({ query }) => all(`SELECT s.*, u.name user_name,
  (SELECT COALESCE(SUM(total),0) FROM invoices WHERE shift_id=s.id AND type='sale') sales,
  (SELECT COALESCE(SUM(total),0) FROM invoices WHERE shift_id=s.id AND type='return') returns
  FROM shifts s LEFT JOIN users u ON u.id=s.user_id WHERE date(s.opened_at) BETWEEN ? AND ? ORDER BY s.id DESC`,
  query.from || '2000-01-01', query.to || '2999-12-31'));
route('GET', '/api/shifts/:id', ANY, ({ params, user }) => {
  const sh = get('SELECT user_id FROM shifts WHERE id=?', params.id);
  if (sh && user.role === 'cashier' && sh.user_id !== user.id) throw new HttpError(403, 'ليست لديك صلاحية لهذا الإجراء');
  return shiftSummary(params.id);
});

// ===== التقارير =====
function ledger({ account_id, party_type, party_id, from, to, sign = 'debit-credit', fx = false }) {
  from = from || '2000-01-01'; to = to || '2999-12-31';
  const pw = party_type ? 'AND l.party_type=? AND l.party_id=?' : '';
  const pp = party_type ? [party_type, party_id] : [];
  // fx: كشف مورد بالدولار — الأرقام بالدولار مع المعادل بالدينار
  const d = fx ? 'fx_debit' : 'debit', c = fx ? 'fx_credit' : 'credit';
  const s = sign === 'debit-credit' ? `l.${d}-l.${c}` : `l.${c}-l.${d}`;
  const ob = get(`SELECT COALESCE(SUM(${s}),0) b, COALESCE(SUM(${sign === 'debit-credit' ? 'l.debit-l.credit' : 'l.credit-l.debit'}),0) base FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
    WHERE l.account_id=? ${pw} AND e.date < ?`, account_id, ...pp, from);
  let bal = ob.b, baseBal = ob.base;
  const rows = all(`SELECT e.id entry_id, e.no, e.date, e.description, e.ref_type, e.ref_id, l.${d} debit, l.${c} credit, l.debit base_debit, l.credit base_credit FROM journal_lines l
    JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_id=? ${pw} AND e.date BETWEEN ? AND ? ORDER BY e.date, e.id`,
    account_id, ...pp, from, to).map((r) => {
    bal = round(bal + (sign === 'debit-credit' ? r.debit - r.credit : r.credit - r.debit));
    baseBal = round(baseBal + (sign === 'debit-credit' ? r.base_debit - r.base_credit : r.base_credit - r.base_debit));
    return { ...r, balance: bal, base_balance: baseBal };
  });
  return { opening: round(ob.b), rows, closing: round(bal), base_closing: round(baseBal), fx,
    debit: round(rows.reduce((x, r) => x + r.debit, 0)), credit: round(rows.reduce((x, r) => x + r.credit, 0)) };
}
route('GET', '/api/reports/ledger', ADMIN, ({ query }) => {
  const a = get('SELECT * FROM accounts WHERE id=?', query.account_id);
  if (!a) throw bad('اختر الحساب');
  const sign = ['asset', 'expense'].includes(a.type) ? 'debit-credit' : 'credit-debit';
  return { account: a, ...ledger({ account_id: a.id, from: query.from, to: query.to, sign }) };
});
route('GET', '/api/reports/trial-balance', ADMIN, ({ query }) => {
  const from = query.from || '2000-01-01', to = query.to || '2999-12-31';
  const rows = all(`SELECT a.id, a.code, a.name, a.type,
    COALESCE(SUM(CASE WHEN e.date < ? THEN l.debit-l.credit END),0) opening,
    COALESCE(SUM(CASE WHEN e.date BETWEEN ? AND ? THEN l.debit END),0) debit,
    COALESCE(SUM(CASE WHEN e.date BETWEEN ? AND ? THEN l.credit END),0) credit
    FROM accounts a LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journal_entries e ON e.id=l.entry_id
    WHERE a.is_group=0 GROUP BY a.id ORDER BY a.code`, from, from, to, from, to)
    .map((r) => ({ ...r, opening: round(r.opening), debit: round(r.debit), credit: round(r.credit), closing: round(r.opening + r.debit - r.credit) }))
    .filter((r) => r.opening || r.debit || r.credit);
  return rows;
});
function sumType(type, from, to) {
  return all(`SELECT a.id, a.code, a.name, COALESCE(SUM(${type === 'revenue' ? 'l.credit-l.debit' : 'l.debit-l.credit'}),0) amount
    FROM accounts a JOIN journal_lines l ON l.account_id=a.id JOIN journal_entries e ON e.id=l.entry_id
    WHERE a.type=? AND e.date BETWEEN ? AND ? GROUP BY a.id HAVING amount<>0 ORDER BY a.code`, type, from, to)
    .map((r) => ({ ...r, amount: round(r.amount) }));
}
route('GET', '/api/reports/income', ADMIN, ({ query }) => {
  const from = query.from || '2000-01-01', to = query.to || '2999-12-31';
  const revenue = sumType('revenue', from, to), expense = sumType('expense', from, to);
  const tr = round(revenue.reduce((s, r) => s + r.amount, 0)), te = round(expense.reduce((s, r) => s + r.amount, 0));
  const cogs = expense.find((e) => e.code === '5101')?.amount || 0;
  return { revenue, expense, total_revenue: tr, total_expense: te, cogs, gross_profit: round(tr - cogs), net: round(tr - te) };
});
route('GET', '/api/reports/balance-sheet', ADMIN, ({ query }) => {
  const to = query.to || today();
  const bal = (type, s) => all(`SELECT a.id, a.code, a.name, COALESCE(SUM(${s}),0) amount FROM accounts a JOIN journal_lines l ON l.account_id=a.id
    JOIN journal_entries e ON e.id=l.entry_id WHERE a.type=? AND e.date <= ? GROUP BY a.id HAVING amount<>0 ORDER BY a.code`, type, to)
    .map((r) => ({ ...r, amount: round(r.amount) }));
  const assets = bal('asset', 'l.debit-l.credit'), liabilities = bal('liability', 'l.credit-l.debit'), equity = bal('equity', 'l.credit-l.debit');
  const inc = round(sumType('revenue', '2000-01-01', to).reduce((s, r) => s + r.amount, 0) - sumType('expense', '2000-01-01', to).reduce((s, r) => s + r.amount, 0));
  equity.push({ code: '', name: 'صافي الربح (الخسارة) المتراكم', amount: inc });
  const t = (a) => round(a.reduce((s, r) => s + r.amount, 0));
  return { to, assets, liabilities, equity, total_assets: t(assets), total_liabilities: t(liabilities), total_equity: t(equity) };
});
route('GET', '/api/reports/sales', ADMIN, ({ query }) => {
  const from = query.from || today(), to = query.to || today();
  const W = 'date(i.date) BETWEEN ? AND ?';
  const tot = (type) => get(`SELECT COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(tax),0) tax, COALESCE(SUM(discount),0) discount,
    COALESCE(SUM(cost),0) cost, COALESCE(SUM(paid_cash),0) cash, COALESCE(SUM(paid_card),0) card, COALESCE(SUM(credit),0) credit
    FROM invoices i WHERE ${W} AND type=?`, from, to, type);
  const s = tot('sale'), r = tot('return');
  const net = round(s.total - r.total), netTax = round(s.tax - r.tax), netCost = round(s.cost - r.cost);
  const byDay = all(`SELECT date(i.date) d, SUM(CASE WHEN type='sale' THEN total ELSE -total END) total, SUM(CASE WHEN type='sale' THEN 1 ELSE 0 END) n
    FROM invoices i WHERE ${W} GROUP BY d ORDER BY d`, from, to);
  const byUser = all(`SELECT u.name, SUM(CASE WHEN type='sale' THEN total ELSE -total END) total, COUNT(*) n FROM invoices i LEFT JOIN users u ON u.id=i.user_id
    WHERE ${W} GROUP BY i.user_id ORDER BY total DESC`, from, to);
  const byProduct = all(`SELECT ii.product_id, ii.name, SUM(CASE WHEN i.type='sale' THEN ii.qty ELSE -ii.qty END) qty,
    SUM(CASE WHEN i.type='sale' THEN ii.total ELSE -ii.total END) total, SUM(CASE WHEN i.type='sale' THEN ii.qty*ii.cost ELSE -ii.qty*ii.cost END) cost
    FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE ${W} GROUP BY ii.product_id, ii.name ORDER BY total DESC`, from, to);
  const byCategory = all(`SELECT COALESCE(c.name,'بدون تصنيف') name, SUM(CASE WHEN i.type='sale' THEN ii.total ELSE -ii.total END) total,
    SUM(CASE WHEN i.type='sale' THEN ii.qty ELSE -ii.qty END) qty FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
    LEFT JOIN products p ON p.id=ii.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE ${W} GROUP BY c.id ORDER BY total DESC`, from, to);
  return { from, to, sales: s, returns: r, net, net_tax: netTax, net_cost: netCost, profit: round(net - netTax - netCost), byDay, byUser, byProduct, byCategory };
});
route('GET', '/api/reports/inventory', ADMIN, () => {
  const rows = all(`SELECT p.id, p.name, p.sku, p.barcode, p.unit, p.stock, p.min_stock, p.cost, p.price, c.name category,
    ROUND(p.stock*p.cost,2) value, ROUND(p.stock*p.price,2) retail FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.active=1 OR ABS(p.stock) > 0.000001 ORDER BY p.name`);
  return { rows, total_cost: round(rows.reduce((s, r) => s + r.value, 0)), total_retail: round(rows.reduce((s, r) => s + r.retail, 0)) };
});
route('GET', '/api/dashboard', ADMIN, () => {
  const t = today(), m = t.slice(0, 8) + '01';
  const range = (a, b) => get(`SELECT COALESCE(SUM(CASE WHEN type='sale' THEN total ELSE -total END),0) total,
    COALESCE(SUM(CASE WHEN type='sale' THEN total-tax-cost ELSE -(total-tax-cost) END),0) profit,
    SUM(CASE WHEN type='sale' THEN 1 ELSE 0 END) n FROM invoices WHERE date(date) BETWEEN ? AND ?`, a, b);
  const d = new Date(); d.setDate(d.getDate() - 13);
  const from14 = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const days = all(`SELECT date(date) d, SUM(CASE WHEN type='sale' THEN total ELSE -total END) total FROM invoices WHERE date(date) >= ? GROUP BY d`, from14);
  const bal = (code) => round(get('SELECT COALESCE(SUM(debit-credit),0) b FROM journal_lines WHERE account_id=?', acc(code)).b);
  return {
    today: range(t, t), month: range(m, t),
    cash: bal('1101'), bank: bal('1102'), receivable: bal('1201'), payable: round(-bal('2101')), inventory: bal('1301'),
    low_stock: all('SELECT id, name, stock, min_stock, unit FROM products WHERE active=1 AND stock <= min_stock ORDER BY stock LIMIT 10'),
    low_count: get('SELECT COUNT(*) n FROM products WHERE active=1 AND stock <= min_stock').n,
    products: get('SELECT COUNT(*) n FROM products WHERE active=1').n,
    days, from14,
    top: all(`SELECT ii.name, SUM(ii.qty) qty, SUM(ii.total) total FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
      WHERE i.type='sale' AND date(i.date) >= ? GROUP BY ii.product_id, ii.name ORDER BY total DESC LIMIT 6`, m),
    recent: all(`SELECT i.id, i.no, i.type, i.date, i.total, i.method, c.name customer_name FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
      ORDER BY i.id DESC LIMIT 8`).map((r) => ({ ...r, number: fmtNo(r.type, r.no) })),
    open_shifts: all('SELECT s.id, s.opened_at, u.name user_name FROM shifts s JOIN users u ON u.id=s.user_id WHERE s.closed_at IS NULL'),
  };
});

// ===== المتجر الإلكتروني =====
onWebEvent((type, data) => broadcast(type, data));
route('GET', '/api/web/status', ADMIN, () => ({
  ...webState(), configured: !!(getSettings().web.url && getSettings().web.key),
  counts: Object.fromEntries(all('SELECT status, COUNT(*) n FROM web_orders GROUP BY status').map((r) => [r.status, r.n])),
  published: get('SELECT COUNT(*) n FROM products WHERE active=1 AND web_published=1').n,
}));
route('POST', '/api/web/test', ['admin'], async ({ body }) => {
  const cfg = { ...getSettings().web, ...(body.url ? { url: body.url } : {}), ...(body.key ? { key: body.key } : {}) };
  return testConnection(cfg);
});
route('POST', '/api/web/sync', ADMIN, async () => syncNow());
route('POST', '/api/web/media', ADMIN, ({ body }) => ({ name: saveMedia(body.data) }));
route('GET', '/api/web/products', ADMIN, () => {
  const reserved = reservedQty();
  return all(`SELECT p.id, p.name, p.barcode, p.price, p.stock, p.unit, p.category_id, c.name category, p.web_published, p.web_description, p.web_images,
    p.web_featured, p.web_new, p.web_compare_price, p.web_cat_id, p.web_sub_id, p.web_brand_id FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY p.name`)
    .map((p) => ({ ...p, web_images: JSON.parse(p.web_images || '[]'), reserved: reserved.get(p.id) || 0 }));
});
route('PUT', '/api/web/products/:id', ADMIN, ({ body, params }) => {
  const p = get('SELECT * FROM products WHERE id=?', params.id);
  if (!p) throw new HttpError(404, 'الصنف غير موجود');
  const imgs = Array.isArray(body.web_images) ? body.web_images.filter((x) => /^[a-f0-9]{40}\.(jpg|png|webp)$/.test(x)).slice(0, 10) : JSON.parse(p.web_images || '[]');
  const v = (k, d) => (k in body ? body[k] : d);
  const { cat, sub } = webCatPair(v('web_cat_id', p.web_cat_id), v('web_sub_id', p.web_sub_id));
  const brand = Number(v('web_brand_id', p.web_brand_id)) || null;
  if (brand && !get('SELECT 1 FROM web_brands WHERE id=?', brand)) throw bad('البراند غير موجود');
  run(`UPDATE products SET web_published=?, web_description=?, web_images=?, web_featured=?, web_new=?, web_compare_price=?, web_cat_id=?, web_sub_id=?, web_brand_id=? WHERE id=?`,
    v('web_published', p.web_published) ? 1 : 0, v('web_description', p.web_description) || null, JSON.stringify(imgs),
    v('web_featured', p.web_featured) ? 1 : 0, v('web_new', p.web_new) ? 1 : 0, Number(v('web_compare_price', p.web_compare_price)) || null, cat, sub, brand, p.id);
  pushSoon();
  return { ok: true };
});
route('POST', '/api/web/products/bulk', ADMIN, ({ body }) => {
  const ids = (body.ids || []).map(Number).filter(Boolean);
  if (!ids.length) throw bad('لا يوجد تحديد');
  if (body.field === 'category') {
    const { cat, sub } = webCatPair(body.value, body.sub);
    tx(() => { for (const id of ids) run('UPDATE products SET web_cat_id=?, web_sub_id=? WHERE id=?', cat, sub, id); });
    pushSoon(); return { ok: true, n: ids.length };
  }
  if (body.field === 'brand') {
    const b = Number(body.value) || null;
    if (b && !get('SELECT 1 FROM web_brands WHERE id=?', b)) throw bad('البراند غير موجود');
    tx(() => { for (const id of ids) run('UPDATE products SET web_brand_id=? WHERE id=?', b, id); });
    pushSoon(); return { ok: true, n: ids.length };
  }
  const field = { publish: 'web_published', featured: 'web_featured', new: 'web_new' }[body.field];
  if (!field) throw bad('لا يوجد تحديد');
  tx(() => { for (const id of ids) run(`UPDATE products SET ${field}=? WHERE id=?`, body.value ? 1 : 0, id); });
  pushSoon();
  return { ok: true, n: ids.length };
});
// ===== أقسام الموقع (رئيسي/فرعي) والبراندات =====
function webCatPair(catIn, subIn) {
  let cat = Number(catIn) || null, sub = Number(subIn) || null;
  if (sub) {
    const sc = get('SELECT id, parent_id FROM web_categories WHERE id=?', sub);
    if (!sc || !sc.parent_id) throw bad('القسم الفرعي غير صحيح');
    if (cat && cat !== sc.parent_id) throw bad('القسم الفرعي لا يتبع القسم الرئيسي المختار');
    cat = sc.parent_id;
  }
  if (cat) { const c = get('SELECT parent_id FROM web_categories WHERE id=?', cat); if (!c) throw bad('القسم غير موجود'); if (c.parent_id) throw bad('اختر قسماً رئيسياً'); }
  return { cat, sub };
}
const mediaName = (x) => (x && /^[a-f0-9]{40}\.(jpg|png|webp)$/.test(x) ? x : null);
route('GET', '/api/web/taxonomy', ADMIN, () => ({
  categories: all(`SELECT w.*, (SELECT COUNT(*) FROM products p WHERE p.active=1 AND (p.web_cat_id=w.id OR p.web_sub_id=w.id)) n,
    (SELECT COUNT(*) FROM products p WHERE p.active=1 AND p.web_published=1 AND (p.web_cat_id=w.id OR p.web_sub_id=w.id)) pub FROM web_categories w ORDER BY w.sort, w.name`),
  brands: all(`SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.active=1 AND p.web_brand_id=b.id) n FROM web_brands b ORDER BY b.sort, b.name`),
}));
route('POST', '/api/web/categories', ADMIN, ({ body }) => {
  const name = String(body.name || '').trim(); if (!name) throw bad('اكتب اسم القسم');
  const parent = Number(body.parent_id) || null;
  if (parent) { const pc = get('SELECT parent_id FROM web_categories WHERE id=?', parent); if (!pc) throw bad('القسم الرئيسي غير موجود'); if (pc.parent_id) throw bad('لا يمكن إضافة قسم فرعي داخل قسم فرعي'); }
  const id = run('INSERT INTO web_categories(name,parent_id,sort,image) VALUES(?,?,?,?)', name, parent, Number(body.sort) || 0, mediaName(body.image)).lastInsertRowid;
  pushSoon(); return get('SELECT * FROM web_categories WHERE id=?', id);
});
route('PUT', '/api/web/categories/:id', ADMIN, ({ body, params }) => {
  const c = get('SELECT * FROM web_categories WHERE id=?', params.id); if (!c) throw new HttpError(404, 'القسم غير موجود');
  const name = String(body.name ?? c.name).trim(); if (!name) throw bad('اكتب اسم القسم');
  run('UPDATE web_categories SET name=?, sort=?, image=? WHERE id=?', name, Number(body.sort ?? c.sort) || 0, 'image' in body ? mediaName(body.image) : c.image, c.id);
  pushSoon(); return get('SELECT * FROM web_categories WHERE id=?', c.id);
});
route('DELETE', '/api/web/categories/:id', ADMIN, ({ params }) => {
  const id = Number(params.id);
  tx(() => {
    const subs = all('SELECT id FROM web_categories WHERE parent_id=?', id).map((r) => r.id);
    run('UPDATE products SET web_cat_id=NULL, web_sub_id=NULL WHERE web_cat_id=?', id);
    for (const sid of subs) run('UPDATE products SET web_sub_id=NULL WHERE web_sub_id=?', sid);
    run('UPDATE products SET web_sub_id=NULL WHERE web_sub_id=?', id);
    run('DELETE FROM web_categories WHERE parent_id=?', id);
    run('DELETE FROM web_categories WHERE id=?', id);
  });
  pushSoon(); return { ok: true };
});
route('POST', '/api/web/brands', ADMIN, ({ body }) => {
  const name = String(body.name || '').trim(); if (!name) throw bad('اكتب اسم البراند');
  if (get('SELECT 1 FROM web_brands WHERE name=?', name)) throw bad('البراند موجود مسبقاً');
  const id = run('INSERT INTO web_brands(name,logo,sort) VALUES(?,?,?)', name, mediaName(body.logo), Number(body.sort) || 0).lastInsertRowid;
  pushSoon(); return get('SELECT * FROM web_brands WHERE id=?', id);
});
route('PUT', '/api/web/brands/:id', ADMIN, ({ body, params }) => {
  const b = get('SELECT * FROM web_brands WHERE id=?', params.id); if (!b) throw new HttpError(404, 'البراند غير موجود');
  const name = String(body.name ?? b.name).trim(); if (!name) throw bad('اكتب اسم البراند');
  if (get('SELECT 1 FROM web_brands WHERE name=? AND id<>?', name, b.id)) throw bad('البراند موجود مسبقاً');
  run('UPDATE web_brands SET name=?, logo=?, sort=? WHERE id=?', name, 'logo' in body ? mediaName(body.logo) : b.logo, Number(body.sort ?? b.sort) || 0, b.id);
  pushSoon(); return get('SELECT * FROM web_brands WHERE id=?', b.id);
});
route('DELETE', '/api/web/brands/:id', ADMIN, ({ params }) => {
  tx(() => { run('UPDATE products SET web_brand_id=NULL WHERE web_brand_id=?', params.id); run('DELETE FROM web_brands WHERE id=?', params.id); });
  pushSoon(); return { ok: true };
});
// ===== بنرات الموقع =====
const BANNER_PLACES = ['hero', 'mid', 'tiles'];
const BANNER_LINKS = ['none', 'category', 'brand', 'product', 'offers', 'new', 'shop', 'url'];
function bannerData(b, old = {}) {
  const x = { ...old, ...b };
  const image = mediaName(x.image); if (!image) throw bad('اختر صورة البنر');
  const place = BANNER_PLACES.includes(x.place) ? x.place : 'hero';
  const link_type = BANNER_LINKS.includes(x.link_type) ? x.link_type : 'none';
  let link_value = x.link_value == null ? null : String(x.link_value).trim().slice(0, 500) || null;
  if (['category', 'brand', 'product'].includes(link_type) && !link_value) throw bad('اختر وجهة الرابط');
  if (link_type === 'url' && !/^(https?:\/\/|\/)/.test(link_value || '')) throw bad('الرابط يجب أن يبدأ بـ https:// أو /');
  const d = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return [place, image, mediaName(x.image_m), String(x.title || '').slice(0, 120) || null, String(x.subtitle || '').slice(0, 240) || null, String(x.cta || '').slice(0, 40) || null,
    link_type, link_value, Number(x.sort) || 0, x.active === false || x.active === 0 ? 0 : 1, d(x.starts), d(x.ends), x.theme === 'light' ? 'light' : 'dark'];
}
route('GET', '/api/web/banners', ADMIN, () => all('SELECT * FROM web_banners ORDER BY place, sort, id'));
route('POST', '/api/web/banners', ADMIN, ({ body }) => {
  const id = run('INSERT INTO web_banners(place,image,image_m,title,subtitle,cta,link_type,link_value,sort,active,starts,ends,theme) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', ...bannerData(body)).lastInsertRowid;
  pushSoon(); return get('SELECT * FROM web_banners WHERE id=?', id);
});
route('PUT', '/api/web/banners/:id', ADMIN, ({ body, params }) => {
  const b = get('SELECT * FROM web_banners WHERE id=?', params.id); if (!b) throw new HttpError(404, 'البنر غير موجود');
  run('UPDATE web_banners SET place=?,image=?,image_m=?,title=?,subtitle=?,cta=?,link_type=?,link_value=?,sort=?,active=?,starts=?,ends=?,theme=? WHERE id=?', ...bannerData(body, b), b.id);
  pushSoon(); return get('SELECT * FROM web_banners WHERE id=?', b.id);
});
route('POST', '/api/web/banners/order', ADMIN, ({ body }) => {
  tx(() => (body.ids || []).forEach((id, i) => run('UPDATE web_banners SET sort=? WHERE id=?', i + 1, Number(id))));
  pushSoon(); return { ok: true };
});
route('DELETE', '/api/web/banners/:id', ADMIN, ({ params }) => { run('DELETE FROM web_banners WHERE id=?', params.id); pushSoon(); return { ok: true }; });
route('GET', '/api/web/orders', ADMIN, ({ query }) => {
  const w = []; const p = [];
  if (query.status) { w.push('o.status=?'); p.push(query.status); }
  if (query.q) { w.push('(o.no LIKE ? OR o.name LIKE ? OR o.phone LIKE ?)'); p.push(`%${query.q}%`, `%${query.q}%`, `%${query.q}%`); }
  return all(`SELECT o.*, i.no invoice_no FROM web_orders o LEFT JOIN invoices i ON i.id=o.invoice_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 1000`, ...p)
    .map((o) => ({ ...o, items: JSON.parse(o.items || '[]'), invoice_number: o.invoice_no ? fmtNo('sale', o.invoice_no) : null }));
});
route('PUT', '/api/web/orders/:id', ADMIN, async ({ body, params, user }) => {
  const o = setOrderStatus(Number(params.id), body.status, user, { payment: body.payment, notes: body.staff_notes });
  broadcast('products', { stock: true }); broadcast('web_orders');
  syncNow().catch(() => {}); // إرسال الحالة الجديدة للموقع فوراً
  return o;
});

// ===== النسخ الاحتياطي =====
route('GET', '/api/backup', ['admin'], ({ res }) => {
  const file = path.join(DATA_DIR, `backup-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const buf = fs.readFileSync(file); fs.unlinkSync(file);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="the-queen-backup-${today()}.db"`,
  });
  res.end(buf);
  return Symbol.for('handled');
});

// ===== الخادم =====
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/erp' || pathname === '/pos') { res.writeHead(302, { Location: pathname + '/' }); return res.end(); }
  // صور منتجات المتجر الإلكتروني المحفوظة محلياً
  if (pathname.startsWith('/media/')) {
    const f = path.basename(pathname);
    if (!/^[a-f0-9]{40}\.(jpg|png|webp)$/.test(f)) { res.writeHead(404); return res.end(); }
    return fs.readFile(path.join(MEDIA_DIR, f), (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
      res.end(data);
    });
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end(); }
  const file = path.normalize(path.join(PUBLIC, decoded));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('غير موجود'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 8e6) { reject(new HttpError(413, 'حجم البيانات كبير')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(bad('بيانات غير صالحة')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token');

    if (pathname === '/api/events') {
      const user = userFromToken(token);
      if (!user) return send(401, { error: 'غير مسجل' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n'); clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.re);
      if (!m) continue;
      let user = null;
      if (r.roles) {
        user = userFromToken(token);
        if (!user) throw new HttpError(401, 'انتهت الجلسة، سجّل الدخول مجدداً');
        if (!r.roles.includes(user.role)) throw new HttpError(403, 'ليست لديك صلاحية لهذا الإجراء');
        // الدخول بالرمز السري (نقطة البيع) يسمح بعمليات الكاشير فقط حتى للمدير
        if (user.via === 'pin' && !r.roles.includes('cashier')) throw new HttpError(403, 'هذا الإجراء يتطلب الدخول بكلمة المرور من النظام الإداري');
      }
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const result = await r.handler({ req, res, body, query: Object.fromEntries(url.searchParams), params: m.groups || {}, user, token });
      if (result === Symbol.for('handled')) return;
      return send(200, result === undefined ? { ok: true } : result);
    }
    throw new HttpError(404, 'المسار غير موجود');
  } catch (e) {
    if (!e.status) console.error(e);
    send(e.status || 500, { error: e.status ? e.message : 'خطأ في الخادم: ' + e.message });
  }
});

export const lanAddresses = () => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);

// ===== اكتشاف الخادم تلقائياً على الشبكة (UDP) =====
// أجهزة الكاشير ترسل "QUEEN?" على المنفذ 41234 والخادم يرد بعنوانه
export const DISCOVERY_PORT = 41234;
function startDiscovery() {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('message', (msg, rinfo) => {
    if (msg.toString() !== 'QUEEN?') return;
    const reply = JSON.stringify({ app: 'the-queen', name: getSettings().store.name, port: PORT });
    sock.send(reply, rinfo.port, rinfo.address);
  });
  sock.on('error', (e) => console.warn('  تنبيه: الاكتشاف التلقائي غير متاح:', e.message));
  sock.bind(DISCOVERY_PORT, '0.0.0.0');
  return sock;
}

export const ready = new Promise((resolve, reject) => {
  server.once('error', (e) => {
    reject(e.code === 'EADDRINUSE' ? new Error(`المنفذ ${PORT} مستخدم من برنامج آخر (ربما النظام يعمل بالفعل)`) : e);
  });
  server.listen(PORT, '0.0.0.0', () => {
    try { startDiscovery(); } catch { /* */ }
    scheduleSync();
    console.log('\n  👑  The Queen — النظام يعمل\n');
    console.log(`  النظام الإداري (ERP):  http://localhost:${PORT}/erp/`);
    console.log(`  نقطة البيع (POS):      http://localhost:${PORT}/pos/`);
    for (const ip of lanAddresses()) console.log(`  من أجهزة الشبكة:       http://${ip}:${PORT}/pos/`);
    console.log('\n  لإيقاف النظام اضغط Ctrl+C\n');
    resolve({ port: PORT });
  });
});
export { server, PORT };

if (!process.env.QUEEN_EMBEDDED) {
  ready.catch((e) => { console.error('\n  ✗ ' + e.message + '\n'); process.exit(1); });
}

// معلومات الخادم (لصفحة الإعدادات وتطبيق الكاشير)
route('GET', '/api/server-info', ANY, () => ({ port: PORT, addresses: lanAddresses(), data_dir: DATA_DIR }));
