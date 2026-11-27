// Builds a correct adaptive icon: gradient background layer + glyph foreground
// confined to the 66dp safe zone of the 108dp canvas.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";

const SRC = "work/brand/logo-source.png";
const OUT = "work/brand/out";
mkdirSync(OUT, { recursive: true });

function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, ct = 0, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), t = buf.toString("ascii", pos + 4, pos + 8);
    const d = buf.subarray(pos + 8, pos + 8 + len);
    if (t === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    else if (t === "IDAT") idat.push(d); else if (t === "IEND") break;
    pos += 12 + len;
  }
  const ch = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * ch;
  const out = Buffer.alloc(w * h * 4), cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++]; raw.copy(cur, 0, rp, rp + stride); rp += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = cur[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      out[o] = cur[s]; out[o + 1] = ch >= 3 ? cur[s + 1] : cur[s];
      out[o + 2] = ch >= 3 ? cur[s + 2] : cur[s]; out[o + 3] = ch === 4 ? cur[s + 3] : 255;
    }
    cur.copy(prev);
  }
  return { w, h, data: out };
}
const T = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- glyph: white line work on the brand tile ----------
const { w, h, data } = decodePNG(readFileSync(SRC));
let x0 = w, y0 = h, x1 = 0, y1 = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const o = (y * w + x) * 4, r = data[o], g = data[o + 1], b = data[o + 2];
  if (Math.max(r, g, b) - Math.min(r, g, b) > 80) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
}
x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(w - 1, x1 + 2); y1 = Math.min(h - 1, y1 + 2);
const cw = x1 - x0 + 1, chh = y1 - y0 + 1;

const alpha = new Uint8Array(cw * chh);
// the crop's outer fringe is the tile's antialiased edge against white — drop it
const inset = Math.round(cw * 0.08);
let gx0 = cw, gy0 = chh, gx1 = 0, gy1 = 0;
for (let y = inset; y < chh - inset; y++) for (let x = inset; x < cw - inset; x++) {
  const o = ((y + y0) * w + x + x0) * 4;
  const r = data[o], g = data[o + 1], b = data[o + 2];
  const minc = Math.min(r, g, b), sat = Math.max(r, g, b) - minc;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const a = Math.round(clamp01((clamp01((minc - 212) / 33) * clamp01((34 - sat) / 16) - 0.30) / 0.55) * 255);
  alpha[y * cw + x] = a;
  if (a > 60) { if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; if (y < gy0) gy0 = y; if (y > gy1) gy1 = y; }
}
for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
  if (x < inset || y < inset || x >= cw - inset || y >= chh - inset) alpha[y * cw + x] = 0;
}
// Keep faint mid-tones only next to a solid stroke: the source art has soft
// glow/shadow that would otherwise read as haze, while its thinnest lines
// must not drop out.
{
  const strong = new Uint8Array(cw * chh);
  for (let i = 0; i < cw * chh; i++) strong[i] = alpha[i] > 120 ? 1 : 0;
  const R = 7, dil = new Uint8Array(cw * chh);
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
    if (!strong[y * cw + x]) continue;
    for (let dy = -R; dy <= R; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= chh) continue;
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= cw) continue;
        if (dx * dx + dy * dy <= R * R) dil[yy * cw + xx] = 1;
      }
    }
  }
  for (let i = 0; i < cw * chh; i++) if (!dil[i]) alpha[i] = 0;
}
// two-tone line art: clean, no speckle from the source glow
for (let i = 0; i < cw * chh; i++) alpha[i] = alpha[i] > 105 ? 255 : 0;
console.log(`tile ${cw}x${chh}, glyph bbox ${gx0},${gy0} ${gx1 - gx0 + 1}x${gy1 - gy0 + 1}`);
const gw = gx1 - gx0 + 1, gh = gy1 - gy0 + 1;

// Composite the glyph as a solid colour, centred, scaled to `fill` of the canvas.
function renderGlyph(canvas, fill, colour) {
  const out = Buffer.alloc(canvas * canvas * 4);
  const scale = (canvas * fill) / Math.max(gw, gh);
  const dw = gw * scale, dh = gh * scale;
  const ox = (canvas - dw) / 2, oy = (canvas - dh) / 2;
  for (let y = 0; y < canvas; y++) for (let x = 0; x < canvas; x++) {
    let sum = 0;
    for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const sx = Math.floor((x + fx - ox) / scale) + gx0;
      const sy = Math.floor((y + fy - oy) / scale) + gy0;
      if (sx >= 0 && sx < cw && sy >= 0 && sy < chh) sum += alpha[sy * cw + sx];
    }
    const a = sum / 4;
    const o = (y * canvas + x) * 4;
    out[o] = colour[0]; out[o + 1] = colour[1]; out[o + 2] = colour[2]; out[o + 3] = a;
  }
  return out;
}

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const WHITE = [255, 255, 255], DARK = [11, 18, 32];
for (const [d, f] of Object.entries(DENS)) {
  const canvas = Math.round(108 * f);
  // foreground sits inside the 66/108 safe zone with a little breathing room
  for (const [name, colour] of [
    ["ic_launcher_foreground", WHITE],
    ["ic_launcher_foreground_desktop", WHITE],
    ["ic_launcher_foreground_black", WHITE],
    ["ic_launcher_foreground_white", DARK],
    ["ic_launcher_monochrome", WHITE],
  ]) {
    writeFileSync(`${OUT}/drawable-${d}_${name}.png`, encodePNG(canvas, canvas, renderGlyph(canvas, 0.60, colour)));
  }
}

// ---------- background layers ----------
const vector = (id, body) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">${body}</path>
</vector>
`;
const gradient = (start, center, end, x2, y2) => `
        <aapt:attr name="android:fillColor">
            <gradient android:type="linear"
                android:startX="0" android:startY="108"
                android:endX="${x2}" android:endY="${y2}"
                android:startColor="${start}"
                android:centerColor="${center}"
                android:endColor="${end}" />
        </aapt:attr>`;
const solid = (c) => `
        <aapt:attr name="android:fillColor">
            <gradient android:type="linear" android:startX="0" android:startY="0"
                android:endX="108" android:endY="108"
                android:startColor="${c}" android:endColor="${c}" />
        </aapt:attr>`;

// brand gradient sampled from the supplied logo: purple -> cobalt -> cyan
const bgDefault = vector("default", gradient("#7F09F5", "#2E6BF2", "#01E8FA", "108", "0"));
const bgDesktop = vector("desktop", gradient("#0B3FA8", "#0E7FD8", "#12E0F5", "108", "0"));
writeFileSync(`${OUT}/drawable_ic_launcher_bg.xml`, bgDefault);
writeFileSync(`${OUT}/drawable_ic_launcher_bg_desktop.xml`, bgDesktop);
writeFileSync(`${OUT}/drawable_ic_launcher_bg_white.xml`, vector("white", solid("#FFFFFF")));
writeFileSync(`${OUT}/drawable_ic_launcher_bg_black.xml`, vector("black", solid("#000000")));
console.log("adaptive layers written");
