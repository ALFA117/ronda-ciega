import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { groupDigits, ratio, slotsPerSecond, trim, type Sample } from "../lib/pulse.ts";

const s = (slot: number, at: number): Sample => ({ slot, at });

describe("slotsPerSecond", () => {
  test("nothing to say from fewer than two samples", () => {
    assert.equal(slotsPerSecond([]), null);
    assert.equal(slotsPerSecond([s(100, 0)]), null);
  });

  test("rate is measured across the whole window, not the last pair", () => {
    // 45 slots over 2s is the rate the TEE actually answered with.
    assert.equal(slotsPerSecond([s(100, 0), s(122, 1000), s(145, 2000)]), 22.5);
  });

  test("a window shorter than half a second is not a rate", () => {
    // Two responses landing together would divide by an interval dominated by
    // jitter and report a wild number as a measurement.
    assert.equal(slotsPerSecond([s(100, 0), s(101, 200)]), null);
  });

  test("a chain that appears to go backwards reports nothing, not a negative", () => {
    // An RPC behind a load balancer can answer from a node at a lower height.
    assert.equal(slotsPerSecond([s(500, 0), s(480, 2000)]), null);
  });

  test("a flat window reports nothing, not zero", () => {
    // Zero would render as a measurement claiming the chain had stopped.
    assert.equal(slotsPerSecond([s(500, 0), s(500, 2000)]), null);
  });
});

describe("trim", () => {
  test("keeps the most recent samples, in order", () => {
    const many = Array.from({ length: 20 }, (_, i) => s(i, i * 100));
    const kept = trim(many, 5);
    assert.equal(kept.length, 5);
    assert.deepEqual(
      kept.map((x) => x.slot),
      [15, 16, 17, 18, 19],
    );
  });

  test("leaves a short window alone", () => {
    const few = [s(1, 0), s(2, 100)];
    assert.deepEqual(trim(few, 12), few);
  });
});

describe("ratio", () => {
  test("a real ratio between two real rates", () => {
    assert.equal(ratio(22.5, 6.5)?.toFixed(1), "3.5");
  });

  test("a ratio against a missing rate is not a ratio", () => {
    assert.equal(ratio(null, 6.5), null);
    assert.equal(ratio(22.5, null), null);
  });

  test("never divides by a stopped chain", () => {
    assert.equal(ratio(22.5, 0), null);
  });
});

describe("groupDigits", () => {
  // U+2009 THIN SPACE, spelled with its escape rather than pasted: the two
  // are indistinguishable in a diff, and an assertion that fails while both
  // strings look identical on screen costs more than the escape does.
  const THIN = "\u2009";

  test("groups a slot height with thin spaces, not commas", () => {
    // Commas read as decimal separators to half the audience this is aimed at.
    assert.equal(groupDigits(296740510), `296${THIN}740${THIN}510`);
  });

  test("leaves small numbers alone", () => {
    assert.equal(groupDigits(45), "45");
  });
});
