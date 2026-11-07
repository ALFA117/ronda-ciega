import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { payoutAction, type PayoutInput } from "../lib/payout.ts";

const NOW = 1_800_000_000;

function input(over: Partial<PayoutInput> = {}): PayoutInput {
  return {
    status: "settled",
    deadlineTs: NOW - 600,
    now: NOW,
    onL1: true,
    side: "founder",
    partner: 0,
    escrow: 20_000_000,
    ...over,
  };
}

describe("Qué se puede hacer con el depósito", () => {
  test("sin nada bloqueado no hay nada que hacer", () => {
    assert.equal(payoutAction(input({ escrow: 0 })), null);
    // Unknown is not empty, and it is not a reason to show a button either.
    assert.equal(payoutAction(input({ escrow: null })), null);
  });

  test("founder emparejado en una ronda resuelta y de vuelta en L1: paga", () => {
    assert.equal(payoutAction(input()), "pay");
  });

  test("founder sin par en una ronda resuelta: lo recupera", () => {
    assert.equal(payoutAction(input({ partner: null })), "refund");
  });

  test("builder emparejado con un founder que depositó: cobra", () => {
    assert.equal(payoutAction(input({ side: "builder" })), "collect");
  });

  test("builder sin par, o con la ronda sin resolver: nada", () => {
    assert.equal(payoutAction(input({ side: "builder", partner: null })), null);
    assert.equal(
      payoutAction(input({ side: "builder", status: "open", deadlineTs: NOW - 1 })),
      null,
    );
  });

  test("resuelta pero todavía en el rollup: el pago espera a L1", () => {
    // settle_pair reads the round as an account this program owns; on L1 a
    // delegated round belongs to the delegation program, so the instruction
    // fails before any of its checks.
    assert.equal(payoutAction(input({ onL1: false })), "waitSettled");
    assert.equal(payoutAction(input({ onL1: false, side: "builder" })), "waitSettled");
    assert.equal(payoutAction(input({ onL1: false, partner: null })), "waitSettled");
  });

  test("antes del plazo el dinero solo está bloqueado", () => {
    assert.equal(
      payoutAction(input({ status: "open", deadlineTs: NOW + 60 })),
      null,
    );
  });

  test("vencida sin resultado y en L1: lo recupera", () => {
    assert.equal(
      payoutAction(input({ status: "open", deadlineTs: NOW, partner: null })),
      "refund",
    );
    // Closed but never settled counts the same: check_refund only asks
    // whether the round settled and whether the deadline passed.
    assert.equal(
      payoutAction(input({ status: "matching", deadlineTs: NOW - 1, partner: null })),
      "refund",
    );
  });

  test("vencida sin resultado y todavía en el rollup: atorada, y se dice", () => {
    assert.equal(
      payoutAction(
        input({ status: "open", deadlineTs: NOW - 1, onL1: false, partner: null }),
      ),
      "waitExpired",
    );
  });
});
