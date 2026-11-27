// Applies the Lama Music rebrand to the decoded LastWave APK resource tree.
// Usage: bun scripts/rebrand.mjs <decoded-apk-dir> <icons-dir> [--apply]
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync, copyFileSync } from "node:fs";

const APK = process.argv[2] || "work/apk-full";
const ICONS = process.argv[3] || "work/brand/out";
const apply = process.argv.includes("--apply");
const BRAND = "Lama Music";

const log = [];
const plan = (msg) => { log.push(msg); if (!apply) console.log("PLAN " + msg); };

// ---------- 1. launcher / adaptive / logo bitmaps ----------
for (const f of readdirSync(ICONS).filter((n) => /^drawable_.+\.xml$/.test(n))) {
  const name = f.replace(/^drawable_/, "");
  plan(`layer ${f} -> res/drawable/${name}`);
  if (apply) copyFileSync(`${ICONS}/${f}`, `${APK}/res/drawable/${name}`);
}
const iconFiles = readdirSync(ICONS).filter((f) => f.endsWith(".png"));
for (const f of iconFiles) {
  const m = /^(mipmap|drawable)-(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)_(.+)\.png$/.exec(f);
  if (!m) continue;
  const dest = `${APK}/res/${m[1]}-${m[2]}/${m[3]}.png`;
  plan(`icon ${f} -> res/${m[1]}-${m[2]}/${m[3]}.png`);
  if (apply) copyFileSync(`${ICONS}/${f}`, dest);
}

// vector drawables replaced by the generated bitmaps must be removed
const replacedXml = [
  "ic_launcher_foreground", "ic_launcher_foreground_black",
  "ic_launcher_foreground_white", "ic_launcher_foreground_desktop",
  "ic_launcher_logo", "ic_launcher_logo_black",
  "ic_launcher_logo_white", "ic_launcher_logo_desktop",
  "ic_lastwave_logo_mono", "ic_widget_logo_mark",
];
for (const name of replacedXml) {
  const p = `${APK}/res/drawable/${name}.xml`;
  if (existsSync(p)) {
    plan(`remove superseded vector res/drawable/${name}.xml`);
    if (apply) rmSync(p);
  }
}

// ---------- 2. adaptive icons: themed monochrome layer ----------
const anydpi = `${APK}/res/mipmap-anydpi`;
for (const f of readdirSync(anydpi).filter((n) => n.endsWith(".xml"))) {
  const p = `${anydpi}/${f}`;
  const src = readFileSync(p, "utf8");
  if (!src.includes("ic_launcher_foreground")) continue;
  let out = src.replace(/(<monochrome android:drawable=")@drawable\/ic_launcher_foreground(_[a-z]+)?"/g,
    '$1@drawable/ic_launcher_monochrome"');
  // the flat signature-lime background becomes the brand gradient layer
  out = out.replace(/@color\/ic_launcher_background(_[a-z]+)?"/g, (m, v) => `@drawable/ic_launcher_bg${v || ""}"`);
  plan(`adaptive ${f}: gradient background + monochrome glyph`);
  if (apply) writeFileSync(p, out);
}

// ---------- 3. launcher background colours (were signature lime) ----------
const colorsPath = `${APK}/res/values/colors.xml`;
const colorMap = {
  ic_launcher_background: "#ff3358f5",          // cobalt (brand blue)
  ic_launcher_background_desktop: "#ff0fb3e8",  // cyan
  ic_launcher_background_white: "#ffffffff",
  ic_launcher_background_black: "#ff000000",
};
if (existsSync(colorsPath)) {
  let xml = readFileSync(colorsPath, "utf8");
  for (const [name, value] of Object.entries(colorMap)) {
    const re = new RegExp(`(<color name="${name}">)[^<]*(</color>)`);
    if (re.test(xml)) {
      const before = re.exec(xml)[0];
      xml = xml.replace(re, `$1${value}$2`);
      if (before !== `<color name="${name}">${value}</color>`) plan(`color ${name} -> ${value}`);
    }
  }
  if (apply) writeFileSync(colorsPath, xml);
}

// ---------- 4. user-facing strings ----------
const resDir = `${APK}/res`;
const stringDirs = readdirSync(resDir).filter((d) => /^values(-|$)/.test(d));
let stringHits = 0;
for (const d of stringDirs) {
  const p = `${resDir}/${d}/strings.xml`;
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  if (!src.includes("LastWave")) continue;
  let out = src;
  // brand palette description references the old lime identity
  out = out.replace(/Bespoke logo palette • Electric Lime &amp; Obsidian Teal/g,
    "Bespoke signature palette • Electric Lime &amp; Obsidian Teal");
  out = out.replace(/LastWave/g, BRAND);
  const n = (src.match(/LastWave/g) || []).length;
  stringHits += n;
  plan(`${d}/strings.xml: ${n} brand string(s)`);
  if (apply) writeFileSync(p, out);
}
console.log(`total resource brand strings: ${stringHits}`);

// ---------- 5. hard-coded UI literals in DEX (presentation only) ----------
const smaliDirs = readdirSync(APK).filter((d) => d === "smali" || d.startsWith("smali_classes"));
const explicit = {
  "/LastWave/": "/Lama Music/",
  "/LastWave/Backups": "/Lama Music/Backups",
  "/LastWave/Backups/": "/Lama Music/Backups/",
  "LastWave (Line-Sync)": "Lama Music (Line-Sync)",
};
const skipChars = /[./_()=%]/;
const changed = new Map();
for (const dir of smaliDirs) {
  for (const file of walk(`${APK}/${dir}`)) {
    if (!file.endsWith(".smali")) continue;
    const src = readFileSync(file, "utf8");
    if (!src.includes("LastWave")) continue;
    let out = "";
    let last = 0;
    let touched = false;
    const re = /const-string(?:-jumbo)?\s+[^\s,]+,\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(src))) {
      const lit = m[1];
      let next = null;
      if (explicit[lit] !== undefined) next = explicit[lit];
      else if (lit.includes("LastWave") && !skipChars.test(lit)) {
        const t = lit.trim();
        // only prose/UI copy: brand as a word, never CamelCase identifiers
        if (/^LastWave(\s|$)/.test(t) || /\sLastWave(\s|$)/.test(t)) {
          next = lit.replace(/LastWave/g, BRAND);
        }
      }
      if (next !== null && next !== lit) {
        changed.set(lit, next);
        out += src.slice(last, m.index) + m[0].replace(`"${lit}"`, `"${next}"`);
        last = m.index + m[0].length;
        touched = true;
      }
    }
    if (touched) {
      out += src.slice(last);
      if (apply) writeFileSync(file, out);
    }
  }
}
for (const [a, b] of changed) plan(`dex literal "${a}" -> "${b}"`);
console.log(`distinct dex literals changed: ${changed.size}`);
console.log(apply ? "APPLIED" : "DRY RUN (pass --apply)");

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}
