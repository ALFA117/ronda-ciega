import type { Config } from "tailwindcss";
import path from "path";

// Content globs are resolved against the process cwd, not against this file.
// The dev server is sometimes launched from the repo root rather than from
// here, which silently produces a stylesheet with the reset and no utilities —
// so anchor the globs to this directory instead.
const here = (glob: string) => path.join(__dirname, glob);

const config: Config = {
  content: [here("app/**/*.{ts,tsx}"), here("components/**/*.{ts,tsx}")],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        edge: "var(--edge)",
        edgeStrong: "var(--edge-strong)",
        chalk: "var(--text)",
        muted: "var(--text-muted)",
        dim: "var(--text-dim)",
        onSealed: "var(--on-sealed)",
        sealed: "var(--sealed)",
        sealedDim: "var(--sealed-dim)",
        open: "var(--open)",
        escrow: "var(--escrow)",
        settled: "var(--settled)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // A fixed scale beats ad-hoc sizes: 12 13 14 16 18 24 32 44 60
        "2xs": ["11px", { lineHeight: "1.4" }],
        xs: ["12px", { lineHeight: "1.5" }],
        sm: ["13px", { lineHeight: "1.6" }],
        base: ["15px", { lineHeight: "1.65" }],
        lg: ["18px", { lineHeight: "1.55" }],
        xl: ["24px", { lineHeight: "1.3" }],
        "2xl": ["32px", { lineHeight: "1.2" }],
        "3xl": ["44px", { lineHeight: "1.08" }],
        "4xl": ["60px", { lineHeight: "1.03" }],
      },
      maxWidth: {
        prose: "62ch",
      },
    },
  },
  plugins: [],
};

export default config;
