// Tiny ADB UI helper: dump the accessibility tree, or tap/type by text.
// Usage:
//   bun scripts/adbui.mjs dump
//   bun scripts/adbui.mjs tap "About" [--exact]
//   bun scripts/adbui.mjs tapxy 540 1200
import { execSync } from "node:child_process";

const ADB = `${process.env.ADB || "./android-sdk/platform-tools/adb"}`;
const run = (cmd, opts = {}) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });

function dump() {
  run(`${ADB} shell uiautomator dump /sdcard/ui.xml`, { stdio: "ignore" });
  return run(`${ADB} exec-out cat /sdcard/ui.xml`);
}

function nodes(xml) {
  const out = [];
  const re = /<node\b[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    const get = (attr) => {
      const mm = new RegExp(`${attr}="([^"]*)"`).exec(tag);
      return mm ? mm[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#10;/g, " ") : "";
    };
    const text = get("text"), desc = get("content-desc");
    const b = get("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!b) continue;
    const [_, x1, y1, x2, y2] = b.map(Number);
    out.push({
      text, desc,
      label: text || desc,
      x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2),
      w: x2 - x1, h: y2 - y1,
      clickable: get("clickable") === "true",
      cls: get("class"),
    });
  }
  return out;
}

const [cmd, ...rest] = process.argv.slice(2);
const xml = dump();
const list = nodes(xml).filter((n) => n.label || n.clickable);

if (cmd === "dump") {
  console.log(`nodes with label: ${list.filter((n) => n.label).length}`);
  for (const n of list.filter((n) => n.label)) {
    console.log(`${n.label.slice(0, 70).padEnd(72)} @${n.x},${n.y} ${n.clickable ? "[tap]" : ""}`);
  }
} else if (cmd === "tap" || cmd === "tapxy") {
  let target;
  if (cmd === "tapxy") {
    target = { x: Number(rest[0]), y: Number(rest[1]), label: "coords" };
  } else {
    const want = rest[0].toLowerCase();
    const exact = rest.includes("--exact");
    const match = list.filter((n) => n.label && (exact ? n.label.toLowerCase() === want : n.label.toLowerCase().includes(want)));
    match.sort((a, b) => (a.clickable === b.clickable ? 0 : a.clickable ? -1 : 1));
    target = match[0];
  }
  if (!target) { console.error("no matching node"); process.exit(1); }
  run(`${ADB} shell input tap ${target.x} ${target.y}`);
  console.log(`tapped "${target.label}" at ${target.x},${target.y}`);
}
