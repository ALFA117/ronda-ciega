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
  const files = ["JoinForm", "RoundCreator"].map((n) =>
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

// ------------------------------------------------------- focus ---
// Keyboard focus has to be visible, and it has to be visible GLOBALLY: a rule
// per component is a rule somebody forgets. :focus-visible rather than :focus
// so a mouse click does not draw a ring nobody asked for.
head("Keyboard focus is visible");
{
  const css = readFileSync(CSS, "utf8");
  const rule = css.match(/:focus-visible\s*\{[^}]*\}/);
  if (!rule) bad("no global :focus-visible rule in globals.css");
  else if (/outline:[^;]*(solid|auto)/.test(rule[0])) {
    ok("a global :focus-visible outline is defined");
  } else {
    bad(":focus-visible exists but sets no outline");
  }
}

// --------------------------------------------------- reduced motion ---
// The stylesheet's prefers-reduced-motion block cannot reach Framer, which
// animates through inline styles from JavaScript. One MotionConfig covers
// every component at once; without it each one has to remember to ask, and
// three had already forgotten.
head("Reduced motion is handled once, globally");
{
  const providers = readFileSync(
    join(HERE, "..", "frontend", "app", "providers.tsx"),
    "utf8",
  );
  if (/<MotionConfig[^>]*reducedMotion=["']user["']/.test(providers)) {
    ok("MotionConfig reducedMotion=\"user\" wraps the tree");
  } else {
    bad("providers.tsx has no MotionConfig reducedMotion=\"user\"");
  }

  const css = readFileSync(CSS, "utf8");
  if (css.includes("@media (prefers-reduced-motion: reduce)")) {
    ok("the stylesheet still covers CSS animations and transitions");
  } else {
    bad("no prefers-reduced-motion block in globals.css");
  }
}

// ------------------------------------------------- account sizes ---
// The page answers "how many preference lists are on L1" by filtering a public
// RPC call on account size. That only stays an honest question while the size
// it filters on is the size the program actually writes, so the constant is
// recomputed here from the Rust rather than trusted.
head("Account sizes match the program");
{
  const rust = readFileSync(join(HERE, "..", "programs", "ronda-ciega", "src", "state.rs"), "utf8");
  const facts = readFileSync(join(HERE, "..", "frontend", "lib", "chain-facts.ts"), "utf8");

  // Resolve the named constants the LEN expressions refer to.
  const consts = {};
  for (const m of rust.matchAll(/pub const ([A-Z_]+): usize = (\d+);/g)) {
    consts[m[1]] = Number(m[2]);
  }

  /** The arithmetic in `impl X { pub const LEN: usize = ...; }`, evaluated. */
  const arith = (expr) => {
    const resolved = expr.replace(/[A-Z_]{3,}/g, (k) => String(consts[k] ?? NaN));
    // Digits, + and parentheses only: nothing else can survive to be executed.
    if (!/^[\d+()\s*]+$/.test(resolved)) return null;
    return Function(`return ${resolved}`)();
  };

  const rustLen = (name) => {
    const m = rust.match(
      new RegExp(`impl ${name} \\{\\s*pub const LEN: usize = ([^;]+);`, "m"),
    );
    return m ? arith(m[1]) : null;
  };

  // Anchored to its own line: an unanchored version walks past the closing
  // paren and swallows the rest of the file, which then fails `arith` and
  // reports a mismatch that is really a bad regex.
  const frontLen = (key) => {
    const m = facts.match(new RegExp(`^\\s*${key}: 8 \\+ \\((.+)\\),\\s*$`, "m"));
    return m ? arith(m[1]) : null;
  };

  for (const [name, key] of [
    ["Preferences", "preferences"],
    ["Participant", "participant"],
  ]) {
    const a = rustLen(name);
    const b = frontLen(key);
    if (a === null) bad(`${name}: could not read LEN from state.rs`);
    else if (b === null) bad(`${name}: could not read the size from chain-facts.ts`);
    else if (a === b) ok(`${name} is ${a + 8} bytes in both places`);
    else bad(`${name}: Rust says ${a + 8}, frontend says ${b + 8}`);
  }

  // The two limits a person can hit by typing their own name.
  //
  // join_round checks handle.len(), and String::len() in Rust counts bytes.
  // The form used to count characters, so an accented handle passed the box
  // and was refused on chain. lib/profile.ts now measures bytes, and these
  // two numbers have to keep agreeing with the program or it is back.
  const profile = readFileSync(
    join(HERE, "..", "frontend", "lib", "profile.ts"),
    "utf8",
  );
  for (const [rustName, tsName] of [
    ["MAX_HANDLE_LEN", "MAX_HANDLE_BYTES"],
    ["MAX_LINK_LEN", "MAX_LINK_BYTES"],
  ]) {
    const a = consts[rustName];
    const m = profile.match(new RegExp(`export const ${tsName} = (\\d+);`));
    const b = m ? Number(m[1]) : null;
    if (a === undefined) bad(`${rustName}: not found in state.rs`);
    else if (b === null) bad(`${tsName}: not found in lib/profile.ts`);
    else if (a === b) ok(`${rustName} is ${a} in both places`);
    else bad(`${rustName}: Rust says ${a}, frontend says ${b}`);
  }
}

// --------------------------------------------------------------- live ---
// Everything above reads the repository and is deterministic. What follows
// asks the deployed site questions, so it belongs to a different category:
// it can fail for reasons that have nothing to do with the commit. CI runs
// with OFFLINE=1, because a pipeline that goes red when Vercel hiccups is a
// pipeline people learn to ignore.
if (process.env.OFFLINE === "1") {
  head("Live checks");
  console.log("  \x1b[2mskip\x1b[0m  OFFLINE=1 — se omiten las que dependen del sitio\n");
} else {
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
}

console.log(
  `\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`,
);
process.exit(fail ? 1 : 0);
