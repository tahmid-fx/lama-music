// Renders what Android's adaptive-icon mask shows, on light and dark launcher backgrounds.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";

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

// Android adaptive icon: 108dp canvas, ~72dp visible circular mask.
const fg = decodePNG(readFileSync(process.argv[2]));
const SIZE = fg.w;
const VISIBLE = Math.round(SIZE * (72 / 108));
const off = Math.round((SIZE - VISIBLE) / 2);
const PAD = 24, panels = 2, W = panels * (VISIBLE + PAD) + PAD, H = VISIBLE + 2 * PAD;
const out = Buffer.alloc(W * H * 4);
const bgs = [[242, 244, 250], [16, 15, 15]];
for (let p = 0; p < panels; p++) {
  const ox = PAD + p * (VISIBLE + PAD), oy = PAD;
  for (let y = 0; y < VISIBLE; y++) {
    for (let x = 0; x < VISIBLE; x++) {
      const o = ((oy + y) * W + ox + x) * 4;
      const sx = off + x, sy = off + y;
      const inside = Math.hypot(x - VISIBLE / 2 + 0.5, y - VISIBLE / 2 + 0.5) <= VISIBLE / 2;
      const so = (sy * SIZE + sx) * 4;
      let bg = bgs[p];
      if (p === 0 && process.argv[4] === "gradient") {
        // same stops as res/drawable/ic_launcher_bg.xml (purple -> cobalt -> cyan)
        const t = ((x / VISIBLE) + (1 - y / VISIBLE)) / 2;
        const stops = [[127, 9, 245], [46, 107, 242], [1, 232, 250]];
        const seg = t < 0.5 ? 0 : 1, lt = t < 0.5 ? t * 2 : (t - 0.5) * 2;
        bg = [0, 1, 2].map((c) => Math.round(stops[seg][c] * (1 - lt) + stops[seg + 1][c] * lt));
      }
      const a = inside ? fg.data[so + 3] / 255 : 0;
      out[o] = Math.round(fg.data[so] * a + bg[0] * (1 - a));
      out[o + 1] = Math.round(fg.data[so + 1] * a + bg[1] * (1 - a));
      out[o + 2] = Math.round(fg.data[so + 2] * a + bg[2] * (1 - a));
      out[o + 3] = 255;
    }
  }
}
writeFileSync(process.argv[3], encodePNG(W, H, out));
console.log("preview written", process.argv[3], `${W}x${H}`);
