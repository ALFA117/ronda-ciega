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
        // Channels, not hex, so opacity modifiers (bg-sealed/10) compile.
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        surface2: "rgb(var(--c-surface-2) / <alpha-value>)",
        edge: "rgb(var(--c-edge) / <alpha-value>)",
        edgeStrong: "rgb(var(--c-edge-strong) / <alpha-value>)",
        chalk: "rgb(var(--c-text) / <alpha-value>)",
        muted: "rgb(var(--c-text-muted) / <alpha-value>)",
        dim: "rgb(var(--c-text-dim) / <alpha-value>)",
        onSealed: "rgb(var(--c-on-sealed) / <alpha-value>)",
        sealed: "rgb(var(--c-sealed) / <alpha-value>)",
        sealedDim: "rgb(var(--c-sealed-dim) / <alpha-value>)",
        open: "rgb(var(--c-open) / <alpha-value>)",
        escrow: "rgb(var(--c-escrow) / <alpha-value>)",
        settled: "rgb(var(--c-settled) / <alpha-value>)",
        danger: "rgb(var(--c-danger) / <alpha-value>)",
      },
      borderRadius: {
        // Formal corners: nothing rounder than 12px on a sheet.
        md: "6px",
        lg: "8px",
        xl: "10px",
        "2xl": "12px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      fontSize: {
        // A fixed scale beats ad-hoc sizes: 12 13 14 16 18 24 32 44 60
        // 12px floor: 11px read as fine print on phones and failed the size audit.
        "2xs": ["12px", { lineHeight: "1.45" }],
        xs: ["12px", { lineHeight: "1.5" }],
        sm: ["14px", { lineHeight: "1.6" }],
        base: ["16px", { lineHeight: "1.65" }],
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
