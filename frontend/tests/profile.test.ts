import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  byteLength,
  checkProfile,
  MAX_HANDLE_BYTES,
  MAX_LINK_BYTES,
  truncateToBytes,
} from "../lib/profile.ts";

describe("byteLength", () => {
  test("ASCII costs one byte a letter, which is why this went unnoticed", () => {
    assert.equal(byteLength("axel"), 4);
    assert.equal(byteLength("axel".repeat(8)), 32);
  });

  test("an accent costs two", () => {
    // "Rodríguez" is nine characters and ten bytes.
    assert.equal("Rodríguez".length, 9);
    assert.equal(byteLength("Rodríguez"), 10);
  });

  test("an emoji costs four while spending two of maxLength's budget", () => {
    assert.equal("😀".length, 2);
    assert.equal(byteLength("😀"), 4);
  });
});

describe("checkProfile", () => {
  test("an ordinary handle passes", () => {
    assert.equal(checkProfile("@axel", "github.com/alfa117"), null);
  });

  test("a handle is required", () => {
    assert.equal(checkProfile("", "github.com/x"), "handleEmpty");
    assert.equal(checkProfile("   ", ""), "handleEmpty");
  });

  test("thirty-two ASCII characters is the limit, and it is allowed", () => {
    assert.equal(checkProfile("a".repeat(32), ""), null);
    assert.equal(checkProfile("a".repeat(33), ""), "handleTooLong");
  });

  test("a handle that fits the box but not the program is caught here", () => {
    // Thirty characters, three of them accented: thirty-three bytes. The
    // input's maxLength={32} let this through and the program refused it.
    const name = "Rodríguez_Frías_Martín_abcdefg";
    assert.equal(name.length <= 32, true);
    assert.equal(byteLength(name) > MAX_HANDLE_BYTES, true);
    assert.equal(checkProfile(name, ""), "handleTooLong");
  });

  test("sixteen emoji spend thirty-two of maxLength and sixty-four bytes", () => {
    const handle = "😀".repeat(16);
    assert.equal(handle.length, 32);
    assert.equal(checkProfile(handle, ""), "handleTooLong");
  });

  test("the link is measured the same way", () => {
    assert.equal(checkProfile("@a", "x".repeat(MAX_LINK_BYTES)), null);
    assert.equal(checkProfile("@a", "x".repeat(MAX_LINK_BYTES + 1)), "linkTooLong");
    assert.equal(checkProfile("@a", "é".repeat(49)), "linkTooLong");
  });

  test("the link is optional", () => {
    assert.equal(checkProfile("@a", ""), null);
  });

  test("surrounding whitespace is not charged for", () => {
    // The client trims before sending, so the check has to trim too or it
    // refuses a handle the program would have accepted.
    assert.equal(checkProfile("  " + "a".repeat(32) + "  ", ""), null);
  });
});

describe("truncateToBytes", () => {
  test("leaves something that already fits", () => {
    assert.equal(truncateToBytes("axel", 32), "axel");
  });

  test("cuts to the budget", () => {
    assert.equal(truncateToBytes("a".repeat(40), 32), "a".repeat(32));
  });

  test("never splits a multi-byte character", () => {
    // Slicing by byte would leave half of "é" and render a replacement glyph.
    const out = truncateToBytes("é".repeat(20), 5);
    assert.equal(byteLength(out) <= 5, true);
    assert.equal(out, "éé");
    assert.equal(out.includes("�"), false);
  });

  test("never splits a surrogate pair", () => {
    const out = truncateToBytes("😀😀😀", 6);
    assert.equal(out, "😀");
    assert.equal(byteLength(out), 4);
  });

  test("a budget smaller than the first character yields nothing, not half of one", () => {
    assert.equal(truncateToBytes("😀", 2), "");
  });
});
