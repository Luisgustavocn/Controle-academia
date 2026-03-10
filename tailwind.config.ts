import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "#f0eded",
        card: "#ffffff",
        ink: "#1b1417",
        muted: "#6f6668",
        line: "#d9d2d4",
        accent: "#cf1621",
        accentDark: "#8d0f16",
        accentSoft: "#fbe7ea",
        neutralDark: "#2a2024",
        danger: "#0f0d0e",
        warning: "#7f1118"
      }
    }
  },
  plugins: []
};

export default config;
