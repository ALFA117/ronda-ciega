import { PublicKey } from "@solana/web3.js";
import idl from "./idl.json";

export const PROGRAM_ID = new PublicKey(idl.address);

export const DEVNET_RPC =
  process.env.NEXT_PUBLIC_DEVNET_RPC || "https://api.devnet.solana.com";

/** The TEE rollup. Private accounts only exist here. */
export const TEE_RPC =
  process.env.NEXT_PUBLIC_TEE_RPC || "https://devnet-tee.magicblock.app";

export const TEE_VALIDATOR = new PublicKey(
  "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo",
);

export const ROUND_SEED = Buffer.from("round");
export const PARTICIPANT_SEED = Buffer.from("participant");
export const PREFERENCES_SEED = Buffer.from("preferences");
export const MATCH_STATE_SEED = Buffer.from("match_state");

/** Matches `NONE` in the program: "no index here". */
export const NONE = 255;

export const MAX_PER_SIDE = 16;

export type Side = "founder" | "builder";

export const SIDE_LABEL: Record<Side, string> = {
  founder: "Founder",
  builder: "Builder",
};

export const SIDE_BLURB: Record<Side, string> = {
  founder: "Producto, go-to-market, distribución. Este lado propone.",
  builder: "Perfil técnico. Este lado recibe propuestas y elige.",
};

export { idl };
