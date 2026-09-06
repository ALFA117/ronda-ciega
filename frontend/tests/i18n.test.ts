import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { es } from "../lib/i18n/es.ts";
import { en } from "../lib/i18n/en.ts";

type Node = string | string[] | { [k: string]: Node } | Node[];

/** Every leaf, as "a.b.c" -> value, so the two dictionaries can be diffed. */
function flatten(node: Node, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === "string") {
    out.set(prefix, node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      for (const [k, val] of flatten(v as Node, `${prefix}[${i}]`)) out.set(k, val);
    });
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    for (const [kk, val] of flatten(v as Node, prefix ? `${prefix}.${k}` : k)) {
      out.set(kk, val);
    }
  }
  return out;
}

const ES = flatten(es as Node);
const EN = flatten(en as Node);

describe("Diccionarios ES / EN", () => {
  test("tienen exactamente las mismas claves", () => {
    const missing = [...ES.keys()].filter((k) => !EN.has(k));
    const extra = [...EN.keys()].filter((k) => !ES.has(k));
    assert.deepEqual(missing, [], `faltan en inglés: ${missing.join(", ")}`);
    assert.deepEqual(extra, [], `sobran en inglés: ${extra.join(", ")}`);
  });

  test("ningún texto está vacío", () => {
    const emptyEs = [...ES].filter(([, v]) => v.trim() === "").map(([k]) => k);
    const emptyEn = [...EN].filter(([, v]) => v.trim() === "").map(([k]) => k);
    assert.deepEqual(emptyEs, [], `vacíos en español: ${emptyEs.join(", ")}`);
    assert.deepEqual(emptyEn, [], `vacíos en inglés: ${emptyEn.join(", ")}`);
  });

  test("las listas tienen el mismo largo en ambos idiomas", () => {
    // A shorter array in one language silently drops a card or a bullet from
    // the page; TypeScript types the element, not the length.
    const lengths = (m: Map<string, string>) => {
      const counts = new Map<string, number>();
      for (const k of m.keys()) {
        const m2 = k.match(/^(.*)\[(\d+)\]/);
        if (!m2) continue;
        counts.set(m2[1], Math.max(counts.get(m2[1]) ?? 0, Number(m2[2]) + 1));
      }
      return counts;
    };
    const a = lengths(ES);
    const b = lengths(EN);
    const diffs: string[] = [];
    for (const [k, v] of a) if (b.get(k) !== v) diffs.push(`${k}: es=${v} en=${b.get(k)}`);
    assert.deepEqual(diffs, [], `listas desparejas: ${diffs.join(" | ")}`);
  });

  test("no quedó texto en español dentro del diccionario inglés", () => {
    // Tildes and ¿¡ do not occur in English copy; a match means the string was
    // copied over and never translated.
    const spanish = [...EN].filter(([k, v]) => {
      if (/[áéíóúñ¿¡]/i.test(v)) return true;
      // Same string in both AND long enough that it is not a proper noun,
      // a number, or a shared technical term.
      return ES.get(k) === v && v.length > 24 && /\s/.test(v);
    });
    assert.deepEqual(
      spanish.map(([k, v]) => `${k}: ${v.slice(0, 40)}`),
      [],
      "cadenas sin traducir en en.ts",
    );
  });

  test("los marcadores {x} coinciden entre idiomas", () => {
    const holes = (v: string) => (v.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(",");
    const bad: string[] = [];
    for (const [k, v] of ES) {
      const e = EN.get(k)!;
      if (holes(v) !== holes(e)) bad.push(`${k}: es=[${holes(v)}] en=[${holes(e)}]`);
    }
    assert.deepEqual(bad, [], `marcadores desparejos: ${bad.join(" | ")}`);
  });

  test("el diccionario no está vacío (el test sirve de algo)", () => {
    assert.ok(ES.size > 100, `solo ${ES.size} claves: ¿se aplanó bien?`);
  });
});
