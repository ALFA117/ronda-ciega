import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  checkMinutes,
  formatCountdown,
  MAX_MINUTES,
  MIN_MINUTES,
  minutesToSeconds,
} from "../lib/duration.ts";

describe("checkMinutes", () => {
  test("an ordinary value passes", () => {
    assert.equal(checkMinutes("10"), null);
    assert.equal(checkMinutes(" 45 "), null);
  });

  test("an empty box is caught", () => {
    // Number("") is 0, which sailed through as a deadline of "now": the round
    // was created past its own deadline and nobody could join it.
    assert.equal(checkMinutes(""), "empty");
    assert.equal(checkMinutes("   "), "empty");
  });

  test("garbage is caught", () => {
    // Number("abc") is NaN, and new BN(NaN).toString() is "0" — silently. The
    // round's deadline landed in 1970 with no error anywhere.
    assert.equal(checkMinutes("abc"), "notNumber");
    assert.equal(checkMinutes("1e"), "notNumber");
    assert.equal(checkMinutes("Infinity"), "notNumber");
  });

  test("zero and negatives are too short, not merely odd", () => {
    assert.equal(checkMinutes("0"), "tooShort");
    assert.equal(checkMinutes("-5"), "tooShort");
  });

  test("the bounds are inclusive", () => {
    assert.equal(checkMinutes(String(MIN_MINUTES)), null);
    assert.equal(checkMinutes(String(MAX_MINUTES)), null);
    assert.equal(checkMinutes(String(MAX_MINUTES + 1)), "tooLong");
  });

  test("a fat-fingered extra digit is refused", () => {
    // 1000000 minutes is the year 3871. It is a typo, not a round.
    assert.equal(checkMinutes("1000000"), "tooLong");
  });

  test("a fraction of a minute is allowed", () => {
    assert.equal(checkMinutes("1.5"), null);
  });
});

describe("minutesToSeconds", () => {
  test("converts and rounds", () => {
    assert.equal(minutesToSeconds("10"), 600);
    assert.equal(minutesToSeconds("1.5"), 90);
    assert.equal(minutesToSeconds(" 2 "), 120);
  });

  test("never produces a fractional second", () => {
    // A fractional unix timestamp is not a timestamp, and BN would refuse it.
    assert.equal(Number.isInteger(minutesToSeconds("1.234")), true);
  });
});

describe("formatCountdown", () => {
  test("under an hour reads as minutes and seconds", () => {
    assert.equal(formatCountdown(754), "12:34");
    assert.equal(formatCountdown(45), "0:45");
    assert.equal(formatCountdown(5), "0:05");
  });

  test("over an hour switches units rather than counting to 1440", () => {
    // The old format printed floor(left/60), so a one-day round counted down
    // from "1440:00" — a number nobody reads as a day.
    assert.equal(formatCountdown(3_600), "1h 0m");
    assert.equal(formatCountdown(3_600 * 3 + 60 * 12), "3h 12m");
  });

  test("over a day reads as days and hours", () => {
    assert.equal(formatCountdown(86_400), "1d 0h");
    assert.equal(formatCountdown(86_400 * 2 + 3_600 * 4), "2d 4h");
  });

  test("zero and negative both read as zero, never as a negative clock", () => {
    assert.equal(formatCountdown(0), "0:00");
    assert.equal(formatCountdown(-30), "0:00");
  });

  test("fractional seconds do not leak into the display", () => {
    assert.equal(formatCountdown(65.9), "1:05");
  });
});
