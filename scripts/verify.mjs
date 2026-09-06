/**
 * Standing checks for the things that quietly rot.
 *
 * Contrast is parsed out of `globals.css` rather than restated here, so the
 * audit cannot drift from the tokens it is meant to be auditing — which is
 * exactly how the light theme shipped at 1.9:1 once already.
 *
 *   node scripts/verify.mjs
 *   BASE=http://localhost:3040 node scripts/verify.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = join(HERE, "..", "frontend", "app", "globals.css");
const BASE = process.env.BASE || "https://ronda-ciega.vercel.app";

let pass = 0;
let fail = 0;

const ok = (m) => {
  pass++;
  console.log(`  \x1b[32mpass\x1b[0m  ${m}`);
};
const bad = (m) => {
  fail++;
  console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
};
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

// ------------------------------------------------------------- colour ---
const hex = (h) => {
  h = h.replace("#", "").trim();
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lum = (h) => {
  const [r, g, b] = hex(h).map((n) => {
    n /= 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Pull one theme's token block out of the stylesheet. */
function tokens(css, selector) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector} block`);
  const block = css.slice(start, css.indexOf("\n}", start));
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

const css = readFileSync(CSS, "utf8");
const dark = tokens(css, ":root {");
const light = tokens(css, ':root[data-theme="light"]');

// Body text needs 4.5:1; chart marks are large shapes and need 3:1.
const RULES = [
  ["text", 4.5],
  ["text-muted", 4.5],
  ["text-dim", 4.5],
  ["sealed", 4.5],
  ["open", 4.5],
  ["chart-1", 3],
  ["chart-2", 3],
];

head("Contrast, read from globals.css");
for (const [name, theme] of [
  ["dark", dark],
  ["light", light],
]) {
  for (const [key, need] of RULES) {
    for (const surf of ["bg", "surface"]) {
      const fg = theme[key];
      const bgc = theme[surf];
      if (!fg || !bgc) {
        bad(`${name} ${key}/${surf} — token missing`);
        continue;
      }
      const r = ratio(fg, bgc);
      if (r >= need) ok(`${name} ${key.padEnd(11)} on ${surf.padEnd(7)} ${r.toFixed(2)}:1`);
      else bad(`${name} ${key} on ${surf} ${r.toFixed(2)}:1 (needs ${need})`);
    }
  }
  const onSealed = ratio(theme["on-sealed"], theme["sealed"]);
  if (onSealed >= 4.5) ok(`${name} on-sealed over sealed ${onSealed.toFixed(2)}:1`);
  else bad(`${name} on-sealed over sealed ${onSealed.toFixed(2)}:1`);
}

head("Light mode glare");
{
  const L = lum(light.bg);
  const S = lum(light.surface);
  // Above ~0.82 a full-screen light surface reads as glare at normal screen
  // brightness. Text contrast passing is not the same as being comfortable.
  if (L <= 0.82) ok(`ground luminance ${L.toFixed(3)} (ceiling 0.82)`);
  else bad(`ground luminance ${L.toFixed(3)} exceeds 0.82`);
  if (S <= 0.85) ok(`surface luminance ${S.toFixed(3)} (ceiling 0.85)`);
  else bad(`surface luminance ${S.toFixed(3)} exceeds 0.85`);
  if (!/--surface:\s*#ffffff/i.test(css.slice(css.indexOf(':root[data-theme="light"]'))))
    ok("no pure-white surface token in the light theme");
  else bad("light theme still has a pure-white surface");
}

head("Colourblind safety of the chart pair");
for (const [name, theme] of [
  ["dark", dark],
  ["light", light],
]) {
  // Deuteranope simulation (Viénot). The brand cyan and magenta collapse to
  // nearly the same colour here, which is why the chart series are not them.
  const toLin = (c) => c.map((n) => (n /= 255) <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4));
  const deut = (h) => {
    const [r, g, b] = toLin(hex(h));
    return [0.625 * r + 0.375 * g, 0.7 * r + 0.3 * g, 0.3 * g + 0.7 * b];
  };
  const d1 = deut(theme["chart-1"]);
  const d2 = deut(theme["chart-2"]);
  const dist = Math.sqrt(d1.reduce((a, v, i) => a + (v - d2[i]) ** 2, 0)) * 100;
  if (dist >= 8) ok(`${name} chart series separate under deuteranopia (${dist.toFixed(1)})`);
  else bad(`${name} chart series collapse under deuteranopia (${dist.toFixed(1)})`);
}

head("Mobile form fields");
{
  // iOS zooms the whole page when a focused text input is under 16px, and
  // leaves the user pinching back out. Our own type scale defines `text-base`
  // as 15px, so "base" is not safe here — the size has to be explicit.
  const RISKY = /text-(xs|sm|2xs|base)/;
  const files = ["JoinForm", "CreateRound"].map((n) =>
    join(HERE, "..", "frontend", "components", `${n}.tsx`),
  );
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const inputs = [...src.matchAll(/<input[\s\S]{0,600}?\/>/g)].map((m) => m[0]);
    const name = file.slice(file.lastIndexOf("components"));
    if (!inputs.length) {
      ok(`${name} has no inputs`);
      continue;
    }
    const risky = inputs.filter((i) => RISKY.test(i));
    if (risky.length === 0) ok(`${name}: ${inputs.length} field(s) at a zoom-safe size`);
    else bad(`${name}: ${risky.length} field(s) under 16px — iOS will zoom on focus`);

    const short = inputs.filter((i) => /h-[1-9]|h-10/.test(i));
    if (short.length === 0) ok(`${name}: field height meets the touch minimum`);
    else bad(`${name}: ${short.length} field(s) under 44px tall on touch`);
  }
}

// --------------------------------------------------------------- live ---
head(`Live routes at ${BASE}`);
const routes = [
  ["/", 200],
  ["/icon.svg", 200],
  ["/opengraph-image", 200],
  ["/no-such-page", 404],
];
for (const [path, want] of routes) {
  try {
    const res = await fetch(BASE + path, { redirect: "follow" });
    if (res.status === want) ok(`${path} → ${res.status}`);
    else bad(`${path} → ${res.status}, expected ${want}`);
  } catch (e) {
    bad(`${path} → ${e.message}`);
  }
}

head("Served stylesheet carries the tokens");
try {
  const html = await fetch(BASE).then((r) => r.text());
  const href = html.match(/\/_next\/static\/css\/[^"]+\.css/)?.[0];
  if (!href) throw new Error("no stylesheet link in the HTML");
  const served = await fetch(BASE + href).then((r) => r.text());
  for (const token of [light.bg, dark.bg, light["chart-1"], dark["chart-1"]]) {
    if (served.includes(token.replace("#", ""))) ok(`stylesheet ships ${token}`);
    else bad(`stylesheet is missing ${token}`);
  }
} catch (e) {
  bad(`stylesheet check: ${e.message}`);
}

console.log(
  `\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`,
);
process.exit(fail ? 1 : 0);
