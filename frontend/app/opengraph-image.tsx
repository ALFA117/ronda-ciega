import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "Ronda Ciega — blind stable matching on Solana. You say who you want, nobody learns you said it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share card carries the one sentence that explains the product, on the
 * same dark ground as the app. No screenshot: a shrunk UI reads as noise at
 * card size, and the claim is what makes someone click.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#060a12",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: "#22d3ee",
            }}
          />
          <div style={{ color: "#7f93b0", fontSize: 26, letterSpacing: 2 }}>
            RONDA CIEGA
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ color: "#eaf2ff", fontSize: 76, lineHeight: 1.05 }}>
            Dices a quién quieres
          </div>
          <div style={{ color: "#7f93b0", fontSize: 76, lineHeight: 1.05 }}>
            sin que nadie sepa que lo dijiste.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ color: "#22d3ee", fontSize: 26 }}>
            Private Ephemeral Rollup · Solana Devnet
          </div>
          <div style={{ color: "#7f93b0", fontSize: 26 }}>Solana Blitz v8</div>
        </div>
      </div>
    ),
    size,
  );
}
