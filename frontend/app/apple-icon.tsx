import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The favicon's two columns and the one wire between them, at home-screen size.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#060a12", position: "relative" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <circle cx="9" cy="10" r="2.4" fill="#22d3ee" />
          <circle cx="23" cy="22" r="2.4" fill="#22d3ee" />
          <path d="M9 10 L23 22" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />
          <circle cx="9" cy="22" r="2.4" fill="#2e4262" />
          <circle cx="23" cy="10" r="2.4" fill="#2e4262" />
        </svg>
      </div>
    ),
    size,
  );
}
