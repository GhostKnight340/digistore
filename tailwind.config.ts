import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Neutral, near-black base with layered surfaces.
        base: "#0a0b0d",
        surface: "#121319",
        surface2: "#171922",
        elevated: "#1b1d27",
        card: "#121319",
        // Solid hexes approximating translucent white borders so /opacity
        // modifiers keep working.
        border: "#1d1f27",
        "border-strong": "#2c2f3a",
        accent: {
          DEFAULT: "#3e7bfa",
          hover: "#5e92ff",
          strong: "#5e92ff",
          soft: "rgba(62,123,250,0.13)",
        },
        // Code/price highlight — on-brand blue rather than cyan.
        "cyan-glow": "#5e92ff",
        text: "#f3f4f7",
        muted: "#9a9fab",
        faint: "#646a77",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        soft: "0 16px 40px rgba(0,0,0,0.4)",
        card: "0 30px 70px rgba(0,0,0,0.5)",
        glow: "0 8px 24px rgba(62,123,250,0.3)",
        "glow-strong": "0 12px 30px rgba(62,123,250,0.42)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        pulse2: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        pulse2: "pulse2 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
