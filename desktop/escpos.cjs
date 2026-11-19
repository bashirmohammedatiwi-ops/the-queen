// طباعة مباشرة للطابعات الحرارية بلغة ESC/POS (تتجاوز محرك الطباعة وتعريف ويندوز بالكامل)
// الإيصال يُرسم صورة بعرض نقاط الطابعة ← أبيض وأسود (Floyd–Steinberg) ← أمر GS v 0 ← إرسال RAW للطابعة
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

// bitmap: BGRA من nativeImage.toBitmap() — يُقص من المنتصف إلى عرض النقاط المطلوب
function toMono(bitmap, w, h, dots) {
  const off = Math.max(0, Math.floor((w - dots) / 2));
  const W = Math.min(dots, w);
  const g = new Float32Array(W * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    const i = (y * w + x + off) * 4, a = bitmap[i + 3] / 255;
    const l = 0.114 * bitmap[i] + 0.587 * bitmap[i + 1] + 0.299 * bitmap[i + 2];
    g[y * W + x] = l * a + 255 * (1 - a);
  }
  // تحويل للأبيض والأسود مع تنعيم للصور (الشعار) — النص الأسود يبقى حاداً
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, o = g[k], n = o < 150 ? 0 : 255, e = o - n;
    g[k] = n;
    if (Math.abs(e) < 40) continue;
    if (x + 1 < W) g[k + 1] += (e * 7) / 16;
    if (y + 1 < h) { if (x > 0) g[k + W - 1] += (e * 3) / 16; g[k + W] += (e * 5) / 16; if (x + 1 < W) g[k + W + 1] += e / 16; }
  }
  // قص الأسطر البيضاء في الأسفل
  let last = h - 1;
  outer: for (; last > 0; last--) for (let x = 0; x < W; x++) if (g[last * W + x] === 0) break outer;
  return { g, W, h: Math.min(h, last + 1 + 8) };
}

function buildEscPos({ bitmap, width, height }, { dots = 576, cut = true, drawer = false, copies = 1 } = {}) {
  const { g, W, h } = toMono(bitmap, width, height, dots);
  const bpr = Math.ceil(dots / 8);
  const parts = [Buffer.from([0x1b, 0x40])]; // تهيئة
  if (drawer) parts.push(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa])); // فتح درج النقود
  const one = [];
  const CH = 120; // كتل صغيرة تناسب ذاكرة كل الطابعات
  for (let y0 = 0; y0 < h; y0 += CH) {
    const rows = Math.min(CH, h - y0);
    const data = Buffer.alloc(bpr * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < W; x++) if (g[(y0 + y) * W + x] === 0) data[y * bpr + (x >> 3)] |= 0x80 >> (x & 7);
    one.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, bpr & 0xff, bpr >> 8, rows & 0xff, rows >> 8]), data);
  }
  one.push(Buffer.from([0x1b, 0x64, 0x04])); // تغذية 4 أسطر
  if (cut) one.push(Buffer.from([0x1d, 0x56, 0x42, 0x00])); // قص جزئي بعد التغذية
  for (let c = 0; c < Math.max(1, copies); c++) parts.push(...one);
  return Buffer.concat(parts);
}

// ===== إرسال البيانات للطابعة كما هي (RAW) =====
const PS1 = String.raw`param([string]$Printer, [string]$File, [string]$Dll)
$ErrorActionPreference = 'Stop'
if (-not ('QueenRaw' -as [type])) {
  if ($Dll -and (Test-Path $Dll)) { Add-Type -Path $Dll } else {
    $src = @"
using System; using System.Runtime.InteropServices;
public class QueenRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] public static extern int StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, IntPtr buf, int n, out int written);
  public static string Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "ERR OpenPrinter " + Marshal.GetLastWin32Error();
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "The Queen Receipt"; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) return "ERR StartDocPrinter " + Marshal.GetLastWin32Error();
      StartPagePrinter(h);
      IntPtr p = Marshal.AllocCoTaskMem(data.Length);
      Marshal.Copy(data, 0, p, data.Length);
      int w; bool ok = WritePrinter(h, p, data.Length, out w);
      int err = Marshal.GetLastWin32Error();
      Marshal.FreeCoTaskMem(p);
      EndPagePrinter(h); EndDocPrinter(h);
      return (ok && w == data.Length) ? "OK" : "ERR WritePrinter " + err + " (" + w + "/" + data.Length + ")";
    } finally { ClosePrinter(h); }
  }
}
"@
    try { if ($Dll) { Add-Type -TypeDefinition $src -OutputAssembly $Dll -OutputType Library; Add-Type -Path $Dll } else { Add-Type -TypeDefinition $src } }
    catch { Add-Type -TypeDefinition $src }
  }
}
[QueenRaw]::Send($Printer, [System.IO.File]::ReadAllBytes($File))
`;

function sendRaw(printer, data) {
  return new Promise((resolve) => {
    if (!printer) return resolve({ ok: false, reason: 'اختر الطابعة الحرارية من إعدادات الجهاز أولاً' });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'queen-raw-'));
    const bin = path.join(dir, 'job.bin');
    fs.writeFileSync(bin, data);
    const done = (r) => { fs.rm(dir, { recursive: true, force: true }, () => {}); resolve(r); };
    if (process.platform === 'win32') {
      const ps1 = path.join(os.tmpdir(), 'queen-raw-print-v1.ps1');
      if (!fs.existsSync(ps1)) fs.writeFileSync(ps1, '﻿' + PS1, 'utf8');
      const dll = path.join(os.tmpdir(), 'queen-raw-print-v1.dll');
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, printer, bin, dll], { windowsHide: true, timeout: 30000 }, (err, out, errOut) => {
        const o = String(out || '').trim();
        if (/^OK/m.test(o)) return done({ ok: true });
        done({ ok: false, reason: (o || String(errOut || '') || String(err?.message || '')).trim().slice(0, 300) || 'تعذر الإرسال للطابعة' });
      });
    } else {
      execFile('lp', ['-d', printer, '-o', 'raw', bin], { timeout: 30000 }, (err, out, errOut) => done(err ? { ok: false, reason: String(errOut || err.message).trim() } : { ok: true }));
    }
  });
}

module.exports = { buildEscPos, sendRaw, toMono };
