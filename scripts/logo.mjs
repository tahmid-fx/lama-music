// Lama Music icon pipeline: decode PNG, crop logo tile, emit Android densities.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";

const SRC = process.argv[2] || "work/brand/logo-source.png";
const OUT = process.argv[3] || "work/brand/out";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

// ---------- PNG decode ----------
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not png");
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced png unsupported");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("bit depth " + bitDepth);
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : -1;
  if (ch < 0) throw new Error("color type " + colorType);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  const cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    raw.copy(cur, 0, rp, rp + stride); rp += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = cur[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      out[o] = cur[s];
      out[o + 1] = ch >= 3 ? cur[s + 1] : cur[s];
      out[o + 2] = ch >= 3 ? cur[s + 2] : cur[s];
      out[o + 3] = ch === 4 ? cur[s + 3] : 255;
    }
    cur.copy(prev);
  }
  return { w, h, data: out };
}

// ---------- PNG encode (RGBA) ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- helpers ----------
function boxResize(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * sh) / dh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * sw) / dw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const o = (yy * sw + xx) * 4;
          const al = src[o + 3] / 255;
          r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += src[o + 3]; n++;
        }
      }
      const o = (y * dw + x) * 4;
      const av = a / n;
      const norm = av > 0 ? av / 255 : 0;
      out[o] = norm > 0 ? Math.round(r / n / norm) : 0;
      out[o + 1] = norm > 0 ? Math.round(g / n / norm) : 0;
      out[o + 2] = norm > 0 ? Math.round(b / n / norm) : 0;
      out[o + 3] = Math.round(av);
    }
  }
  return out;
}
function roundedMask(size, radiusRatio, circular = false) {
  const m = new Float32Array(size * size);
  const r = circular ? size / 2 : radiusRatio * size;
  const cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      let d;
      if (circular) {
        d = Math.hypot(px - cx, py - cy) - r;
      } else {
        const qx = Math.abs(px - cx) - (size / 2 - r);
        const qy = Math.abs(py - cy) - (size / 2 - r);
        d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      }
      m[y * size + x] = Math.max(0, Math.min(1, 0.5 - d));
    }
  }
  return m;
}

// ---------- 1. load + locate tile ----------
const src = decodePNG(readFileSync(SRC));
const { w, h, data } = src;
let x0 = w, y0 = h, x1 = 0, y1 = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat > 80) { // saturated tile pixels only (ignores white art, grey shadow)
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
}
// include the tile's white/art border pixels adjacent to saturated area
x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2);
x1 = Math.min(w - 1, x1 + 2); y1 = Math.min(h - 1, y1 + 2);
const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
console.log(`source ${w}x${h}  tile bbox ${x0},${y0} ${cw}x${chh}`);

const tile = Buffer.alloc(cw * chh * 4);
for (let y = 0; y < chh; y++) {
  data.copy(tile, y * cw * 4, ((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + cw) * 4);
}

// sample gradient anchors for the adaptive background fallback colour
const sample = (fx, fy) => {
  const o = (Math.round(fy * (chh - 1)) * cw + Math.round(fx * (cw - 1))) * 4;
  return [tile[o], tile[o + 1], tile[o + 2]];
};
console.log("gradient samples TL", sample(0.08, 0.08), "TR", sample(0.92, 0.08),
  "BL", sample(0.08, 0.92), "BR", sample(0.92, 0.92), "C", sample(0.5, 0.5));

// ---------- 2. line-art extraction ----------
// The mark is white line work on a saturated gradient. Alpha comes from
// whiteness (min channel), which the gradient never approaches.
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const alpha = new Uint8Array(cw * chh);
for (let i = 0; i < cw * chh; i++) {
  const o = i * 4;
  const r = tile[o], g = tile[o + 1], b = tile[o + 2];
  const minc = Math.min(r, g, b), sat = Math.max(r, g, b) - minc;
  // white line work: bright AND achromatic (the pale cyan gradient is not)
  alpha[i] = Math.round(clamp01((clamp01((minc - 212) / 33) * clamp01((34 - sat) / 16) - 0.30) / 0.55) * 255);
}
// drop the tile's antialiased outer fringe so it cannot read as a glyph outline
const inset = Math.round(cw * 0.08);
for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
  if (x < inset || y < inset || x >= cw - inset || y >= chh - inset) alpha[y * cw + x] = 0;
}
// faint mid-tones survive only next to solid strokes (removes glow/shadow haze)
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
// tint the same alpha mask into a solid-colour glyph (keeps alpha for tinting)
function makeArt([cr, cg, cb]) {
  const buf = Buffer.alloc(cw * chh * 4);
  for (let i = 0; i < cw * chh; i++) {
    const o = i * 4;
    buf[o] = cr; buf[o + 1] = cg; buf[o + 2] = cb; buf[o + 3] = alpha[i];
  }
  return buf;
}
const art = makeArt([255, 255, 255]);
const artDark = makeArt([11, 18, 32]);

// ---------- 3. emit densities ----------
const RADIUS_RATIO = 0.185;

function writeTile(size, file, { circular = false, radius = RADIUS_RATIO } = {}) {
  const resized = boxResize(tile, cw, chh, size, size);
  const mask = roundedMask(size, radius, circular);
  for (let i = 0; i < size * size; i++) {
    resized[i * 4 + 3] = Math.round(resized[i * 4 + 3] * mask[i]);
    if (resized[i * 4 + 3] === 0) { resized[i * 4] = resized[i * 4 + 1] = resized[i * 4 + 2] = 0; }
  }
  writeFileSync(`${OUT}/${file}`, encodePNG(size, size, resized));
}

function writeArt(size, file, src = art) {
  const resized = boxResize(src, cw, chh, size, size);
  writeFileSync(`${OUT}/${file}`, encodePNG(size, size, resized));
}

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, f] of Object.entries(DENS)) {
  const legacy = Math.round(48 * f);
  const adaptive = Math.round(108 * f);
  const logo = Math.round(48 * f);
  for (const name of ["ic_launcher", "ic_launcher_desktop", "ic_launcher_white", "ic_launcher_black"]) {
    writeTile(legacy, `mipmap-${d}_${name}.png`);
    writeTile(legacy, `mipmap-${d}_${name.replace("ic_launcher", "ic_launcher_round")}.png`, { circular: true });
    writeTile(adaptive, `drawable-${d}_${name.replace("ic_launcher", "ic_launcher_foreground")}.png`);
    const logoName = name.replace("ic_launcher", "ic_launcher_logo");
    // white icon variant is a white tile, so its glyph must be dark
    writeArt(logo, `drawable-${d}_${logoName}.png`, name.endsWith("_white") ? artDark : art);
  }
  writeArt(logo, `drawable-${d}_ic_lastwave_logo_mono.png`);
  writeArt(logo, `drawable-${d}_ic_widget_logo_mark.png`);
  writeArt(logo, `drawable-${d}_ic_launcher_monochrome.png`);
}
console.log("wrote icons to", OUT);
