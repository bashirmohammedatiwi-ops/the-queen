// تحويل الإيصال إلى صورة بدقة الطابعة الحرارية قبل الطباعة
const { BrowserWindow } = require('electron');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function renderReceiptImage(htmlFile, paperMm) {
  const SCALE = 2; // ≈ 192 نقطة/إنش — مطابق تقريباً لدقة الطابعات الحرارية
  const cssW = Math.round((paperMm / 25.4) * 96);
  const pw = new BrowserWindow({ show: false, width: cssW * SCALE, height: 600, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } });
  try {
    let last = null;
    pw.webContents.on('paint', (_e, _dirty, img) => { last = img; });
    pw.webContents.setFrameRate(30);
    await pw.loadFile(htmlFile);
    pw.webContents.setZoomFactor(SCALE);
    await pw.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => 1) : 1');
    await wait(150);
    const hCss = await pw.webContents.executeJavaScript('Math.ceil(document.documentElement.scrollHeight)');
    pw.setContentSize(cssW * SCALE, Math.min(16000, hCss * SCALE + 4));
    await wait(400);
    let img = await pw.webContents.capturePage().catch(() => null);
    if (!img || img.isEmpty()) img = last;
    if (!img || img.isEmpty()) throw new Error('تعذر تجهيز صورة الإيصال');
    return { png: img.toPNG(), wPx: img.getSize().width, hPx: img.getSize().height, hMm: (hCss * 25.4) / 96 };
  } finally { pw.destroy(); }
}
module.exports = { renderReceiptImage, wait };
