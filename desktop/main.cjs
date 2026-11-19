// The Queen — تطبيق سطح المكتب (نسختان من نفس الكود):
//   admin: يشغّل الخادم وقاعدة البيانات + يفتح النظام الإداري (يُثبت على الجهاز الرئيسي)
//   pos:   يتصل بالخادم على الشبكة + يفتح نقطة البيع مع طباعة حرارية مباشرة
const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, nativeImage, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const dgram = require('node:dgram');
const { pathToFileURL } = require('node:url');

const pkg = require('./package.json');
const MODE = process.env.QUEEN_MODE || pkg.queenMode || 'admin';
const IS_ADMIN = MODE === 'admin';
const TITLE = IS_ADMIN ? 'The Queen — الإدارة' : 'The Queen — الكاشير';
const DISCOVERY_PORT = 41234;

app.setName(IS_ADMIN ? 'The Queen Admin' : 'The Queen POS');
if (process.platform === 'win32') app.setAppUserModelId(IS_ADMIN ? 'com.thequeen.admin' : 'com.thequeen.pos');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// ===== إعدادات الجهاز (ملف محلي) =====
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const DEFAULTS = { port: 3000, server: '', printer: '', silent: true, openAtLogin: true, closeToTray: true, printMode: 'escpos', pageSizeMode: 'auto', autoCut: true, cashDrawer: false };
let config = { ...DEFAULTS };
try { config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch { /* أول تشغيل */ }
// من الإصدار 1.0.3: الطباعة المباشرة ESC/POS هي الافتراضية للطابعات الحرارية
if (!config.escposDefault) { config.printMode = 'escpos'; config.escposDefault = true; }
const saveConfig = () => { fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); };

const resPath = (...p) => (app.isPackaged ? path.join(process.resourcesPath, ...p) : path.join(__dirname, ...p));
const iconPath = resPath('build', 'icon.png');
let win = null, tray = null, quitting = false, baseUrl = '';

// ===== تشغيل الخادم (نسخة الإدارة فقط) =====
async function startServer() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  process.env.QUEEN_DATA = dataDir;
  process.env.PORT = process.env.QUEEN_PORT || String(config.port || 3000);
  if (process.env.QUEEN_DATA_DIR) process.env.QUEEN_DATA = process.env.QUEEN_DATA_DIR;
  process.env.QUEEN_EMBEDDED = '1';
  const serverFile = app.isPackaged ? path.join(process.resourcesPath, 'server', 'server.js') : path.join(__dirname, '..', 'server.js');
  const mod = await import(pathToFileURL(serverFile).href);
  await mod.ready;
  return `http://127.0.0.1:${mod.PORT}`;
}

// ===== البحث عن الخادم على الشبكة (نسخة الكاشير) =====
function discover(timeout = 1500) {
  return new Promise((resolve) => {
    const found = new Map();
    const sock = dgram.createSocket('udp4');
    sock.on('message', (msg, rinfo) => {
      try { const d = JSON.parse(msg.toString()); if (d.app === 'the-queen') found.set(rinfo.address, { address: `http://${rinfo.address}:${d.port}`, name: d.name, ip: rinfo.address }); } catch { /* */ }
    });
    sock.on('error', () => resolve([]));
    sock.bind(0, () => {
      sock.setBroadcast(true);
      const targets = new Set(['255.255.255.255', '127.0.0.1']);
      for (const i of Object.values(os.networkInterfaces()).flat()) {
        if (i && i.family === 'IPv4' && !i.internal && i.netmask) {
          const ip = i.address.split('.').map(Number), m = i.netmask.split('.').map(Number);
          targets.add(ip.map((b, k) => (b & m[k]) | (~m[k] & 255)).join('.'));
        }
      }
      for (const t of targets) sock.send('QUEEN?', DISCOVERY_PORT, t, () => {});
    });
    setTimeout(() => { try { sock.close(); } catch { /* */ } resolve([...found.values()]); }, timeout);
  });
}
// نفس الجهاز قد يرد من أكثر من عنوان (المحلي وعنوان الشبكة): نعتبره جهازاً واحداً
const localIps = () => new Set(['127.0.0.1', ...Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4').map((i) => i.address)]);
function dedupe(list) {
  const local = localIps(), out = new Map();
  for (const f of list) {
    const isLocal = local.has(f.ip);
    const key = isLocal ? 'local:' + f.address.split(':').pop() : f.address;
    if (!out.has(key)) out.set(key, isLocal ? { ...f, ip: '127.0.0.1', address: `http://127.0.0.1:${f.address.split(':').pop()}`, name: (f.name || 'The Queen') + ' (هذا الجهاز)' } : f);
  }
  return [...out.values()];
}
async function reachable(url) {
  try { const r = await fetch(url + '/api/public', { signal: AbortSignal.timeout(2500) }); return r.ok; } catch { return false; }
}

// ===== النافذة =====
function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 1000, minHeight: 640, show: false, title: TITLE,
    icon: fs.existsSync(iconPath) ? iconPath : undefined, backgroundColor: '#f4f5f7', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    // روابط النظام نفسه تُفتح كنافذة داخل التطبيق، والخارجية في المتصفح
    if (baseUrl && url.startsWith(baseUrl)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: iconPath, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true } } };
    if (url === 'about:blank') return { action: 'allow' };
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (isMain && !IS_ADMIN && code !== -3) showConnect(`تعذر الاتصال بالخادم: ${desc}`);
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) win.webContents.reload();
    if (input.control && input.shift && input.key.toLowerCase() === 'i') win.webContents.toggleDevTools();
  });
  win.on('close', (e) => {
    if (IS_ADMIN && !quitting && config.closeToTray && tray) {
      e.preventDefault(); win.hide();
      if (!config._trayHint && Notification.isSupported()) {
        new Notification({ title: 'The Queen', body: 'النظام مستمر بالعمل في الخلفية لخدمة أجهزة الكاشير. للإغلاق النهائي: أيقونة التاج بجانب الساعة ← خروج.' }).show();
        config._trayHint = true; saveConfig();
      }
    }
  });
  buildMenu();
}

function buildMenu() {
  const items = [
    { label: 'التطبيق', submenu: [
      ...(IS_ADMIN ? [{ label: 'فتح نقطة البيع على هذا الجهاز', click: () => openPos() }, { label: 'فتح مجلد البيانات', click: () => shell.openPath(path.join(app.getPath('userData'), 'data')) }]
        : [{ label: 'تغيير عنوان الخادم…', click: () => showConnect() }]),
      { type: 'separator' },
      { label: 'إعادة تحميل', accelerator: 'F5', click: () => win?.webContents.reload() },
      { label: 'ملء الشاشة', accelerator: 'F11', click: () => win?.setFullScreen(!win.isFullScreen()) },
      { label: 'تكبير', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' }, { label: 'تصغير', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' }, { label: 'الحجم الطبيعي', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
      { type: 'separator' },
      { label: 'خروج', click: () => { quitting = true; app.quit(); } },
    ] },
    { label: 'تحرير', submenu: [{ role: 'undo', label: 'تراجع' }, { role: 'redo', label: 'إعادة' }, { type: 'separator' }, { role: 'cut', label: 'قص' }, { role: 'copy', label: 'نسخ' }, { role: 'paste', label: 'لصق' }, { role: 'selectAll', label: 'تحديد الكل' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(items));
}

function openPos() {
  const w = new BrowserWindow({ width: 1366, height: 820, title: 'The Queen — الكاشير', icon: iconPath, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true } });
  w.maximize(); w.loadURL(baseUrl + '/pos/');
}

function createTray() {
  if (!IS_ADMIN || !fs.existsSync(iconPath)) return;
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('The Queen — النظام يعمل');
  const menu = () => Menu.buildFromTemplate([
    { label: 'فتح النظام الإداري', click: () => { win.show(); win.focus(); } },
    { label: 'فتح نقطة البيع', click: () => openPos() },
    { type: 'separator' },
    { label: 'التشغيل تلقائياً مع ويندوز', type: 'checkbox', checked: !!config.openAtLogin, click: (i) => { config.openAtLogin = i.checked; saveConfig(); applyLogin(); } },
    { type: 'separator' },
    { label: 'خروج نهائي (يتوقف الكاشير عن العمل)', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', () => { win.show(); win.focus(); });
}
const applyLogin = () => { if (app.isPackaged && process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: !!config.openAtLogin, args: ['--hidden'] }); };

// ===== شاشة الاتصال (الكاشير) =====
function showConnect(error = '') {
  win.loadFile(path.join(__dirname, 'connect.html'), { query: { error, server: config.server || '' } });
}
async function connectPos() {
  const candidates = [config.server, 'http://127.0.0.1:3000'].filter(Boolean);
  for (const c of candidates) if (await reachable(c)) return go(c);
  const found = dedupe(await discover());
  if (found.length === 1 && (await reachable(found[0].address))) return go(found[0].address);
  showConnect(config.server ? `لا يمكن الوصول إلى الخادم ${config.server}` : '');
}
function go(url) {
  baseUrl = url.replace(/\/+$/, '');
  if (!IS_ADMIN && config.server !== baseUrl && !baseUrl.includes('127.0.0.1')) { config.server = baseUrl; saveConfig(); }
  win.loadURL(baseUrl + (IS_ADMIN ? '/erp/' : '/pos/'));
}

// ===== الطباعة المباشرة (بدون نافذة) =====
ipcMain.handle('printers', async (e) => (await e.sender.getPrintersAsync()).map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: p.isDefault })));
// ===== الطباعة =====
// الإيصال الحراري يُطبع افتراضياً كصورة بدقة الطابعة (203 نقطة/إنش): يمنع اختفاء النص العربي في تعريفات
// الطابعات الحرارية التي تستبدل خطوط ويندوز بخطوطها الداخلية (السبب الشائع للورقة البيضاء)
const { renderReceiptImage, wait } = require('./print-image.cjs');
const { buildEscPos, sendRaw } = require('./escpos.cjs');
// سجل الطباعة لتشخيص أي مشكلة (آخر 200 سطر)
const printLog = (line) => { try { const f = path.join(app.getPath('userData'), 'print-log.txt'); const old = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').slice(-200) : []; fs.writeFileSync(f, [...old, `${new Date().toISOString()} ${line}`].join('\n')); } catch { /* */ } };
ipcMain.handle('print', async (_e, html, opts = {}) => {
  const tmp = path.join(os.tmpdir(), `queen-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  const tmp2 = tmp.replace('.html', '-img.html');
  fs.writeFileSync(tmp, html, 'utf8');
  let pw = null;
  try {
    const silent = opts.silent ?? (config.silent && !!(opts.printer ?? config.printer));
    const printOpts = { silent, printBackground: true, copies: Math.max(1, Number(opts.copies) || 1), margins: { marginType: 'none' } };
    const deviceName = opts.printer ?? config.printer;
    if (deviceName) printOpts.deviceName = deviceName;
    const mode = opts.mode || config.printMode || 'escpos';
    const sizeMode = opts.sizeMode || config.pageSizeMode || 'auto';
    const paperMm = Number(opts.width) || 80;
    let file = tmp, hMm = 0;
    // الطريقة المباشرة: أوامر ESC/POS للطابعة الحرارية بدون أي تعريف أو محرك طباعة
    if (opts.thermal && mode === 'escpos' && deviceName) {
      const dots = paperMm >= 76 ? 576 : paperMm >= 56 ? 384 : Math.round(((paperMm - 4) / 25.4) * 203);
      const contentMm = paperMm >= 76 ? 72 : paperMm >= 56 ? 48 : paperMm - 4;
      const r = await renderReceiptImage(tmp, paperMm, dots / ((contentMm / 25.4) * 96));
      const sz = r.img.getSize();
      const data = buildEscPos({ bitmap: r.img.toBitmap(), width: sz.width, height: sz.height }, { dots, cut: config.autoCut !== false, drawer: !!opts.drawer && !!config.cashDrawer, copies: printOpts.copies });
      const res = await sendRaw(deviceName, data);
      printLog(`escpos printer="${deviceName}" ${sz.width}x${sz.height} bytes=${data.length} -> ${res.ok ? 'OK' : res.reason}`);
      return res.ok ? res : { ok: false, reason: res.reason + ' — جرّب طريقة «صورة» من إعدادات الطابعة' };
    }
    if (opts.thermal && mode === 'image') {
      const r = await renderReceiptImage(tmp, paperMm);
      hMm = r.hMm;
      fs.writeFileSync(tmp2, `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}html,body{margin:0;padding:0;background:#fff}
        img{display:block;width:${paperMm}mm;height:auto;image-rendering:pixelated}</style></head><body><img src="data:image/png;base64,${r.png.toString('base64')}"></body></html>`, 'utf8');
      file = tmp2;
    }
    pw = new BrowserWindow({ show: false, width: 420, height: 900, webPreferences: { backgroundThrottling: false } });
    await pw.loadFile(file);
    await pw.webContents.executeJavaScript('Promise.all([...document.images].map((i) => i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; })))');
    await wait(200);
    if (opts.thermal && sizeMode === 'auto') {
      // طول الورقة حسب طول الإيصال، والعرض حسب الورق (80 أو 58 مم)
      if (!hMm) hMm = ((await pw.webContents.executeJavaScript('Math.ceil(document.documentElement.scrollHeight)')) * 25.4) / 96;
      printOpts.pageSize = { width: paperMm * 1000, height: Math.max(50000, Math.ceil(hMm + 6) * 1000) };
    }
    const res = await new Promise((resolve) => pw.webContents.print(printOpts, (ok, reason) => resolve({ ok, reason: ok ? '' : reason || 'فشل الطباعة' })));
    printLog(`${opts.thermal ? mode : 'a4'} printer="${deviceName || ''}" size=${sizeMode} -> ${res.ok ? 'OK' : res.reason}`);
    return res;
  } catch (e) {
    printLog('ERROR ' + e.message);
    return { ok: false, reason: e.message };
  } finally {
    pw?.destroy(); fs.rm(tmp, () => {}); fs.rm(tmp2, () => {});
  }
});
// معاينة صورة الإيصال كما ستُطبع (للتشخيص من إعدادات الجهاز)
ipcMain.handle('print:preview', async (_e, html, opts = {}) => {
  const tmp = path.join(os.tmpdir(), `queen-prev-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  try { const r = await renderReceiptImage(tmp, Number(opts.width) || 80); return 'data:image/png;base64,' + r.png.toString('base64'); }
  catch (e) { return { error: e.message }; } finally { fs.rm(tmp, () => {}); }
});
ipcMain.handle('print:log', () => { try { return fs.readFileSync(path.join(app.getPath('userData'), 'print-log.txt'), 'utf8').split('\n').slice(-30).join('\n'); } catch { return ''; } });
ipcMain.handle('config:get', () => ({ ...config, mode: MODE, version: app.getVersion(), server: baseUrl || config.server }));
ipcMain.handle('config:set', (_e, patch) => {
  for (const k of ['printer', 'silent', 'server', 'openAtLogin', 'closeToTray', 'printMode', 'pageSizeMode', 'autoCut', 'cashDrawer']) if (k in patch) config[k] = patch[k];
  saveConfig(); applyLogin(); return { ...config };
});
ipcMain.handle('discover', async () => dedupe(await discover(1800)));
ipcMain.handle('connect', async (_e, url) => {
  url = String(url || '').trim();
  if (!/^https?:\/\//.test(url)) url = 'http://' + url;
  if (!/:\d+/.test(url.replace(/^https?:\/\//, ''))) url += ':3000';
  if (!(await reachable(url))) return { ok: false, error: 'لا يوجد خادم The Queen على هذا العنوان' };
  config.server = url.replace(/\/+$/, ''); saveConfig(); go(config.server); return { ok: true };
});
ipcMain.handle('show-connect', () => { if (!IS_ADMIN) showConnect(); });

// ===== البدء =====
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (!IS_ADMIN || quitting || !tray) app.quit(); });

app.whenReady().then(async () => {
  createWindow();
  if (IS_ADMIN) {
    try {
      go(await startServer());
      createTray(); applyLogin();
      if (process.argv.includes('--hidden')) win.once('ready-to-show', () => setTimeout(() => win.hide(), 50));
    } catch (e) {
      dialog.showErrorBox('The Queen', 'تعذر تشغيل الخادم:\n' + e.message);
      quitting = true; app.quit();
    }
  } else {
    win.loadFile(path.join(__dirname, 'connect.html'), { query: { searching: '1' } });
    connectPos();
  }
});
