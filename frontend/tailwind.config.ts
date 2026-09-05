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
        ink: "#0a0a0b",
        panel: "#131316",
        edge: "#232329",
        muted: "#8a8a93",
        chalk: "#ededf0",
        // Sealed things are violet, public things are amber. The palette
        // carries the one distinction the whole product is about.
        sealed: "#8b7cf6",
        open: "#f0a742",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
