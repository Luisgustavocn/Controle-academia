import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#155E75",
        accent: "#F59E0B",
        bg: "#F8FAFC",
        card: "#FFFFFF",
      },
    },
  },
  plugins: [],
} satisfies Config;
