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
import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = join(HERE, "..", "frontend", "app", "globals.css");
const BASE = process.env.BASE || "https://ronda-ciega.vercel.app";
/**
 * The endpoint the app itself falls back to, read out of its constants rather
 * than restated. An override lives in the environment, which this cannot see,
 * so the fallback is what gets checked — and it is the one a fresh clone uses.
 */
const DEVNET_RPC =
  readFileSync(join(HERE, "..", "frontend", "lib", "constants.ts"), "utf8").match(
    /NEXT_PUBLIC_DEVNET_RPC \|\| "([^"]+)"/,
  )?.[1] ?? "https://api.devnet.solana.com";

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
  // Amber and green are the two hues that fail hardest on a light ground, and
  // they are now the two that carry money. Held to the same 4.5 as the rest:
  // "your funds are locked" is not decoration, and a reader who cannot make
  // out the amber cannot tell locked from spent.
  ["escrow", 4.5],
  ["settled", 4.5],
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
// -------------------------------------------------- the README's numbers ---
//
// Every count the README states has been wrong at least once, because a
// number in prose is the one part of a repository nothing recompiles. The
// three below are derivable, so they are derived and compared: a suite that
// grows while the sentence does not now turns this red. The counts that are
// not derivable were taken out of the README instead of guessed at here.
head("The README counts what is actually there");
{
  const readme = readFileSync(join(HERE, "..", "README.md"), "utf8");
  const hits = (file, re) => (readFileSync(file, "utf8").match(re) || []).length;

  const testDir = join(HERE, "..", "frontend", "tests");
  let ts = 0;
  for (const f of readdirSync(testDir).filter((n) => n.endsWith(".test.ts"))) {
    ts += hits(join(testDir, f), /^\s*test\(/gm);
  }
  const rust = hits(
    join(HERE, "..", "programs", "ronda-ciega", "src", "lib.rs"),
    /#\[test\]/g,
  );
  const cases = hits(join(HERE, "ui-cases.js"), /^    async /gm);

  // The README spells small numbers out, so the check has to as well. Only
  // 0-99: nothing counted here is bigger, and a number that grows past that
  // wants a digit in the prose anyway.
  const ONES = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen",
  ];
  const TENS = [
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
    "eighty", "ninety",
  ];
  const spell = (n) => {
    if (n < 20) return ONES[n];
    if (n > 99) return null;
    const tens = TENS[Math.floor(n / 10)];
    const ones = n % 10;
    return ones ? `${tens}-${ONES[ones]}` : tens;
  };

  const claim = (label, re, actual) => {
    const m = readme.match(re);
    if (!m) return bad(`the README no longer states ${label}`);
    if (Number(m[1]) === actual) ok(`README: ${actual} ${label}`);
    else bad(`README says ${m[1]} ${label}; there are ${actual}`);
  };

  claim("TypeScript unit tests", /npm test\s+#\s*(\d+) unit tests/, ts);
  claim("Rust tests", /ronda-ciega\s+#\s*(\d+) tests, host target/, rust);

  // These are spelled out in prose rather than in a code block, so they are
  // matched as words. Prose is where a stale number survives longest: nobody
  // greps a paragraph for a figure they are about to invalidate.
  const inProse = (label, phrase, n) => {
    const word = spell(n);
    if (word && new RegExp(phrase.replace("{n}", word), "i").test(readme)) {
      ok(`README: ${n} ${label}`);
    } else {
      bad(`README does not say "${phrase.replace("{n}", word ?? n)}"; there are ${n}`);
    }
  };

  inProse("UI cases", "The {n} UI cases", cases);
  inProse("Rust unit tests", "{n} Rust unit tests", rust);

  const errors = JSON.parse(
    readFileSync(join(HERE, "..", "frontend", "lib", "idl.json"), "utf8"),
  ).errors.length;
  inProse("error codes", "the program's {n} error codes", errors);
}

// ------------------------------------------- nobody owns a round's progress ---
//
// Three places now say it in three registers: the README as a design claim,
// the video script out loud, and the panel a participant reads after sealing
// a list. All three rest on one fact about the program — close_round and tick
// take no signer — and that fact is one `Signer<'info>` field away from
// quietly becoming false. A round whose progress depends on whoever opened it
// still being around is a different product from the one being described.
head("Closing and ticking a round need no particular signer");
{
  const src = readFileSync(
    join(HERE, "..", "programs", "ronda-ciega", "src", "lib.rs"),
    "utf8",
  );
  for (const name of ["CloseRound", "Tick"]) {
    const at = src.indexOf(`pub struct ${name}<'info> {`);
    if (at < 0) {
      bad(`${name} is not in the program any more`);
      continue;
    }
    // Up to the closing brace in the first column: the end of the struct.
    const body = src.slice(at).split(/^\}/m)[0];
    if (body.includes("Signer<")) bad(`${name} now requires a signer`);
    else ok(`${name} takes no signer`);
  }
}

// -------------------------------------------------- markdown that renders ---
//
// A paragraph landing in the middle of a table does not fail loudly: the rows
// above it stay a table, and the rows below it become literal text full of
// pipe characters. It happened in the "On chain" section, where the addresses
// are — the part of the README somebody checks first — and it happened the
// same way the VRF paragraph broke a day earlier: two edits landing inside
// one another.
//
// The rule is the one the format actually has. A run of lines starting with a
// pipe is a table, and its second line has to be the separator.
head("Every markdown table has its separator");
{
  const SEPARATOR = /^\|[\s:|-]+\|\s*$/;
  for (const doc of ["README.md", "docs/VIDEO.md", "docs/ROADMAP.md", "docs/SPEC.md"]) {
    const lines = readFileSync(join(HERE, "..", doc), "utf8").split(/\r?\n/);
    const isRow = (n) => (lines[n] ?? "").startsWith("|");
    let broken = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!isRow(i) || isRow(i - 1)) continue; // only the first row of a run
      if (!SEPARATOR.test(lines[i + 1] ?? "")) {
        bad(`${doc}:${i + 1} starts a table with no separator row`);
        broken++;
      }
    }
    if (!broken) ok(`${doc}: tables are whole`);
  }
}

// ------------------------------------------------ the script's cue labels ---
//
// docs/VIDEO.md names the controls to click, in English, because that is the
// language the recording is in. A renamed label is invisible until somebody
// is on camera hunting for a button that no longer says that — so every
// label the script puts in bold quotes has to exist in the English
// dictionary. Recorded once a year, wrong at the worst possible moment.
head("The video script names controls that exist");
{
  const script = readFileSync(join(HERE, "..", "docs", "VIDEO.md"), "utf8");
  const en = readFileSync(join(HERE, "..", "frontend", "lib", "i18n", "en.ts"), "utf8");
  const quoted = [...script.matchAll(/\*\*"([^"]{3,60})"\*\*/g)].map((m) => m[1]);
  const unique = [...new Set(quoted)];
  if (unique.length === 0) bad("the script no longer names any control");
  for (const label of unique) {
    if (en.includes(label)) ok(`script cue: "${label}"`);
    else bad(`the script says to click "${label}", which is not in en.ts`);
  }
}

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

  // The two demo rounds the README points at are the demo. If either one
  // stops resolving — a redeploy that closed accounts, a devnet reset, an
  // address edited by hand — the front page of the repository sends a judge
  // to a page that says "round not found".
  //
  // And the sentence beside each address is checked against the account it
  // points at, because it was wrong: the README described both as 4×4 with
  // eight people when both hold twelve. Nothing recomputes a description.
  //
  // The offsets come out of the IDL rather than being written down. Every
  // field in Round is fixed width, so the position of any one of them is the
  // sum of the widths before it — which means adding a field to the program
  // moves these reads correctly instead of silently reading the wrong byte.
  head("The demo rounds match what the README says about them");
  {
    const idl = JSON.parse(
      readFileSync(join(HERE, "..", "frontend", "lib", "idl.json"), "utf8"),
    );
    const round = idl.types.find((t) => t.name === "Round").type.fields;

    const WIDTH = { pubkey: 32, u64: 8, i64: 8, u32: 4, u16: 2, u8: 1, bool: 1 };
    const sizeOf = (type) => {
      if (typeof type === "string") return WIDTH[type];
      if (type.array) return type.array[1] * sizeOf(type.array[0]);
      if (type.defined) return 1; // RoundStatus: a payload-free enum
      return undefined;
    };
    const offsets = {};
    let at = 8; // the account discriminator
    for (const f of round) {
      offsets[f.name] = at;
      const w = sizeOf(f.type);
      if (w === undefined) throw new Error(`cannot size Round.${f.name}`);
      at += w;
    }

    // Which byte means settled is the variant's position, and there are four
    // of them — Open, Sealing, Matching, Settled. Guessing at three would
    // have read Matching, which is a round that has not finished.
    const SETTLED = idl.types
      .find((t) => t.name === "RoundStatus")
      .type.variants.findIndex((v) => v.name === "Settled");

    const readme = readFileSync(join(HERE, "..", "README.md"), "utf8");
    const rows = [
      ...readme.matchAll(
        /\| Demo round, \*\*([\w ]+)\*\* \| \[`([1-9A-HJ-NP-Za-km-z]{32,44})`\][^|]*\| ?$/gm,
      ),
    ];
    if (rows.length === 0) bad("the README no longer lists any demo round");

    for (const row of rows) {
      const [line, kind, address] = row;
      try {
        const res = await fetch(DEVNET_RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getAccountInfo",
            params: [address, { encoding: "base64" }],
          }),
        });
        const value = (await res.json())?.result?.value;
        if (!value) {
          bad(`${kind} demo round ${address} is not on devnet any more`);
          continue;
        }
        const data = Buffer.from(value.data[0], "base64");
        const founders = data[offsets.founder_count];
        const builders = data[offsets.builder_count];
        const transparent = data[offsets.transparent] === 1;
        const settled = data[offsets.status] === SETTLED;

        const said = (claim, actual) =>
          actual
            ? ok(`${kind} demo round: ${claim}`)
            : bad(`${kind} demo round: the README says ${claim}, and it is not`);

        said(`it is ${founders}×${builders}`, line.includes(`${founders}×${builders}`));
        said("it settled", settled);
        // The label is only a claim about visibility when it says so. A row
        // headed "paid out" is making a different claim, and asserting
        // transparency against it would be inventing one to check.
        if (kind === "transparent" || kind === "private") {
          said(
            `it is ${transparent ? "transparent" : "private"}`,
            kind === (transparent ? "transparent" : "private"),
          );
        }
      } catch (e) {
        bad(`${kind} demo round: ${e.message}`);
      }
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
