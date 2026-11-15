// قاعدة البيانات: SQLite المدمجة في Node (بدون أي مكتبات خارجية)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const DATA_DIR = process.env.QUEEN_DATA || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_FILE = path.join(DATA_DIR, 'queen.db');

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

// تحويل القيم لأنواع يقبلها SQLite
const v = (x) => (x === undefined ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x);
export const all = (sql, ...p) => db.prepare(sql).all(...p.map(v));
export const get = (sql, ...p) => db.prepare(sql).get(...p.map(v));
export const run = (sql, ...p) => db.prepare(sql).run(...p.map(v));

let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19);
};

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return `${salt}:${h}`;
}
export function checkPassword(pw, stored) {
  if (!stored) return false;
  const [salt, h] = stored.split(':');
  const x = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(x, 'hex'));
}

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE, password TEXT,
  pin TEXT, role TEXT NOT NULL DEFAULT 'cashier', active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT, barcode TEXT, category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  unit TEXT DEFAULT 'حبة', cost REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_barcode ON products(barcode) WHERE barcode IS NOT NULL AND barcode <> '';

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, tax_no TEXT, notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, tax_no TEXT, notes TEXT,
  currency TEXT NOT NULL DEFAULT 'IQD',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('asset','liability','equity','revenue','expense')),
  parent_id INTEGER REFERENCES accounts(id), is_group INTEGER NOT NULL DEFAULT 0, system INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY, no INTEGER NOT NULL, date TEXT NOT NULL, description TEXT,
  ref_type TEXT, ref_id INTEGER, user_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id), debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0,
  party_type TEXT, party_id INTEGER, note TEXT,
  currency TEXT, fx_debit REAL NOT NULL DEFAULT 0, fx_credit REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_jl_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS ix_jl_party ON journal_lines(party_type, party_id);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, opened_at TEXT NOT NULL, closed_at TEXT,
  opening_cash REAL NOT NULL DEFAULT 0, counted_cash REAL, expected_cash REAL, notes TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY, no INTEGER NOT NULL, type TEXT NOT NULL DEFAULT 'sale', source TEXT NOT NULL DEFAULT 'pos',
  date TEXT NOT NULL, customer_id INTEGER REFERENCES customers(id), ref_id INTEGER REFERENCES invoices(id),
  subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0, paid_cash REAL NOT NULL DEFAULT 0, paid_card REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0,
  tendered REAL, method TEXT, tax_rate REAL, tax_inclusive INTEGER, user_id INTEGER, shift_id INTEGER, notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_inv_date ON invoices(date);
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id), name TEXT NOT NULL, qty REAL NOT NULL, price REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL, cost REAL NOT NULL DEFAULT 0, returned_qty REAL NOT NULL DEFAULT 0,
  orig_item_id INTEGER
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY, no INTEGER NOT NULL, date TEXT NOT NULL, supplier_id INTEGER REFERENCES suppliers(id),
  ref TEXT, subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0, paid REAL NOT NULL DEFAULT 0, method TEXT, user_id INTEGER, notes TEXT,
  currency TEXT NOT NULL DEFAULT 'IQD', rate REAL NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY, purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id), name TEXT NOT NULL, qty REAL NOT NULL, cost REAL NOT NULL, total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY, no INTEGER NOT NULL, kind TEXT NOT NULL, date TEXT NOT NULL,
  party_type TEXT, party_id INTEGER, account_id INTEGER, amount REAL NOT NULL, method TEXT, notes TEXT,
  currency TEXT NOT NULL DEFAULT 'IQD', rate REAL NOT NULL DEFAULT 1, base_amount REAL,
  user_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), date TEXT NOT NULL,
  qty REAL NOT NULL, type TEXT NOT NULL, ref_type TEXT, ref_id INTEGER, cost REAL, note TEXT, user_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sm_product ON stock_moves(product_id);
`);

// ===== الإعدادات الافتراضية =====
export const DEFAULT_SETTINGS = {
  store: {
    name: 'The Queen', name_ar: 'ذا كوين', activity: '', phone: '', address: '', email: '',
    tax_no: '', cr_no: '', logo: '',
  },
  currency: 'د.ع',
  decimals: 0,
  usd_rate: 1310,
  tax: { enabled: false, rate: 0, inclusive: true },
  pos: { allow_negative_stock: true, auto_print: true, require_shift: true, low_stock_warning: true,
    cashier_edit_price: false, cashier_discount: true, cashier_max_discount: 10 },
  print_thermal: {
    width: 80, font_size: 12, margin: 3, show_logo: true, logo_width: 45, show_name: true,
    show_address: true, show_phone: true, show_tax_no: true, header_note: '',
    title: 'فاتورة مبيعات', show_customer: true, show_cashier: true, show_sku: false,
    show_tax_summary: true, show_barcode: true, footer: 'شكراً لتسوقكم معنا', footer2: 'الاستبدال خلال 7 أيام مع الفاتورة',
    copies: 1,
  },
  print_a4: {
    title: 'فاتورة مبيعات', accent: '#6b1d3a', show_logo: true, show_tax_no: true, show_cr_no: true,
    show_customer_box: true, show_sku: true, show_signature: true, show_bank: false, bank_info: '',
    terms: 'البضاعة المباعة لا ترد بعد 7 أيام من تاريخ الفاتورة.', footer: '', show_barcode: true, show_words: true,
  },
};

export function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  const s = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) {
    try {
      const val = JSON.parse(r.value);
      s[r.key] = val && typeof val === 'object' && !Array.isArray(val) && typeof s[r.key] === 'object'
        ? { ...s[r.key], ...val } : val;
    } catch { /* ignore */ }
  }
  return s;
}
export function saveSettings(patch) {
  const cur = getSettings();
  for (const [k, val] of Object.entries(patch || {})) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    const merged = val && typeof val === 'object' && !Array.isArray(val) ? { ...cur[k], ...val } : val;
    run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(merged));
  }
  return getSettings();
}

// ===== البيانات الأولية =====
function seed() {
  if (get('SELECT COUNT(*) c FROM accounts').c > 0) return;
  tx(() => {
    const accs = [
      ['1', 'الأصول', 'asset', null, 1],
      ['11', 'الأصول المتداولة', 'asset', '1', 1],
      ['1101', 'الصندوق (النقدية)', 'asset', '11', 0],
      ['1102', 'البنك / الشبكة', 'asset', '11', 0],
      ['1201', 'ذمم العملاء', 'asset', '11', 0],
      ['1301', 'المخزون', 'asset', '11', 0],
      ['12', 'الأصول الثابتة', 'asset', '1', 1],
      ['1501', 'الأثاث والتجهيزات', 'asset', '12', 0],
      ['2', 'الخصوم', 'liability', null, 1],
      ['2101', 'ذمم الموردين', 'liability', '2', 0],
      ['2201', 'ضريبة القيمة المضافة', 'liability', '2', 0],
      ['2301', 'مستحقات أخرى', 'liability', '2', 0],
      ['3', 'حقوق الملكية', 'equity', null, 1],
      ['3101', 'رأس المال', 'equity', '3', 0],
      ['3201', 'جاري المالك (المسحوبات)', 'equity', '3', 0],
      ['3301', 'أرصدة افتتاحية', 'equity', '3', 0],
      ['4', 'الإيرادات', 'revenue', null, 1],
      ['4101', 'المبيعات', 'revenue', '4', 0],
      ['4102', 'مردودات المبيعات', 'revenue', '4', 0],
      ['4201', 'إيرادات أخرى', 'revenue', '4', 0],
      ['5', 'المصروفات', 'expense', null, 1],
      ['5101', 'تكلفة البضاعة المباعة', 'expense', '5', 0],
      ['52', 'المصروفات التشغيلية', 'expense', '5', 1],
      ['5201', 'الرواتب والأجور', 'expense', '52', 0],
      ['5202', 'الإيجار', 'expense', '52', 0],
      ['5203', 'الكهرباء والماء', 'expense', '52', 0],
      ['5204', 'الاتصالات والإنترنت', 'expense', '52', 0],
      ['5205', 'التسويق والإعلان', 'expense', '52', 0],
      ['5206', 'مصروفات عامة', 'expense', '52', 0],
      ['5301', 'فروقات وتسويات المخزون', 'expense', '5', 0],
      ['5302', 'عجز وزيادة الصندوق', 'expense', '5', 0],
      ['5303', 'فروقات أسعار الصرف', 'expense', '5', 0],
    ];
    const ids = {};
    for (const [code, name, type, parent, group] of accs) {
      const r = run('INSERT INTO accounts(code,name,type,parent_id,is_group,system) VALUES(?,?,?,?,?,1)',
        code, name, type, parent ? ids[parent] : null, group);
      ids[code] = Number(r.lastInsertRowid);
    }
    run("INSERT INTO users(name,username,password,pin,role) VALUES('المدير','admin',?,'1234','admin')", hashPassword('admin123'));
    run("INSERT INTO users(name,username,password,pin,role) VALUES('كاشير 1','cashier1',?,'1111','cashier')", hashPassword('cashier123'));
    run("INSERT INTO categories(name,sort) VALUES('عام',1)");
    run("INSERT INTO customers(name,notes) VALUES('عميل نقدي','العميل الافتراضي لنقطة البيع')");
  });
}
seed();

// ترقيات لقواعد بيانات قديمة
function addColumn(table, col, def) {
  if (!all(`PRAGMA table_info(${table})`).some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('suppliers', 'currency', "TEXT NOT NULL DEFAULT 'IQD'");
addColumn('journal_lines', 'currency', 'TEXT');
addColumn('journal_lines', 'fx_debit', 'REAL NOT NULL DEFAULT 0');
addColumn('journal_lines', 'fx_credit', 'REAL NOT NULL DEFAULT 0');
addColumn('purchases', 'currency', "TEXT NOT NULL DEFAULT 'IQD'");
addColumn('purchases', 'rate', 'REAL NOT NULL DEFAULT 1');
addColumn('vouchers', 'currency', "TEXT NOT NULL DEFAULT 'IQD'");
addColumn('vouchers', 'rate', 'REAL NOT NULL DEFAULT 1');
addColumn('vouchers', 'base_amount', 'REAL');
addColumn('purchases', 'type', "TEXT NOT NULL DEFAULT 'purchase'");
addColumn('purchases', 'ref_id', 'INTEGER');
addColumn('purchase_items', 'returned_qty', 'REAL NOT NULL DEFAULT 0');
addColumn('purchase_items', 'orig_item_id', 'INTEGER');
addColumn('sessions', 'via', "TEXT NOT NULL DEFAULT 'password'");
if (!get("SELECT 1 FROM accounts WHERE code='5303'")) {
  const p = get("SELECT id FROM accounts WHERE code='5'");
  if (p) run("INSERT INTO accounts(code,name,type,parent_id,is_group,system) VALUES('5303','فروقات أسعار الصرف','expense',?,0,1)", p.id);
}
