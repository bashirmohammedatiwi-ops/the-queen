// يولّد أيقونة التطبيق (تاج أبيض على خلفية عنابية) بصيغة PNG بدون مكتبات
const zlib = require('zlib'), fs = require('fs');
const S = 512, px = Buffer.alloc(S * S * 4);
const inRound = (x, y, r) => { const cx = Math.min(Math.max(x, r), S - r), cy = Math.min(Math.max(y, r), S - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
const crown = [[120, 360], [120, 190], [190, 270], [256, 150], [322, 270], [392, 190], [392, 360]];
const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const circles = [[120, 175, 22], [256, 132, 24], [392, 175, 22]];
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  let a = 0, w = 0; // تنعيم الحواف 4x4
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const X = x + (sx + 0.5) / 4, Y = y + (sy + 0.5) / 4;
    if (!inRound(X, Y, 110)) continue; a++;
    if (inPoly(X, Y, crown) || (X >= 120 && X <= 392 && Y >= 380 && Y <= 412) || circles.some(([cx, cy, r]) => (X - cx) ** 2 + (Y - cy) ** 2 <= r * r)) w++;
  }
  const i = (y * S + x) * 4, t = w / 16;
  px[i] = Math.round(107 + (255 - 107) * (a ? w / a : 0)); px[i + 1] = Math.round(29 + (226 - 29) * (a ? w / a : 0)); px[i + 2] = Math.round(58 + (180 - 58) * (a ? w / a : 0)); px[i + 3] = Math.round((a / 16) * 255);
}
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
const crc = (b) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync(process.argv[2], Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
