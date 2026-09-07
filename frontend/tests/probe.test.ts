import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { probeOk, verdict, type ProbeResults } from "../lib/probe.ts";

function results(over: Partial<ProbeResults> = {}): ProbeResults {
  return {
    l1Control: true,
    teeControl: true,
    l1Found: 0,
    teeFound: 0,
    checked: 12,
    ...over,
  };
}

describe("verdict", () => {
  test("controls pass and nothing came back: shielded", () => {
    assert.equal(verdict(results()), "shielded");
  });

  test("any missing probe is pending, not a result", () => {
    assert.equal(verdict(results({ teeFound: null })), "pending");
    assert.equal(verdict(results({ l1Control: null })), "pending");
  });

  test("a lone zero from a lane that cannot read anything proves nothing", () => {
    // This is the bug the panel shipped with: a query pointed at the wrong
    // cluster returns exactly the same absence as a working privacy gate.
    assert.equal(verdict(results({ teeControl: false })), "inconclusive");
    assert.equal(verdict(results({ l1Control: false })), "inconclusive");
  });

  test("a list found on L1 is a leak", () => {
    assert.equal(verdict(results({ l1Found: 1 })), "leaked");
  });

  test("a list an outsider read off the rollup is a leak", () => {
    assert.equal(verdict(results({ teeFound: 1 })), "leaked");
  });

  test("a finding is not excused by a failed control", () => {
    // If a list came back it came back. A broken control cannot argue that
    // away, and reporting "inconclusive" here would bury the one result that
    // falsifies the whole project.
    assert.equal(
      verdict(results({ l1Control: false, teeControl: false, teeFound: 3 })),
      "leaked",
    );
  });

  test("a leak is reported even before every probe is in", () => {
    // Waiting for a complete set before admitting a finding would show
    // "pending" over a known failure.
    assert.equal(verdict(results({ teeFound: 2, l1Found: null })), "pending");
  });
});

describe("probeOk", () => {
  test("a control is satisfied by finding the thing", () => {
    assert.equal(probeOk("control", true), true);
    assert.equal(probeOk("control", false), false);
  });

  test("an absence is satisfied by zero and nothing else", () => {
    assert.equal(probeOk("absence", 0), true);
    assert.equal(probeOk("absence", 1), false);
    assert.equal(probeOk("absence", 12), false);
  });

  test("not yet run is neither pass nor fail", () => {
    assert.equal(probeOk("control", null), null);
    assert.equal(probeOk("absence", null), null);
  });
});
