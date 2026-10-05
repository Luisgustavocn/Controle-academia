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
        bg: "rgb(var(--bg-rgb) / <alpha-value>)",
        card: "rgb(var(--card-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        line: "rgb(var(--line-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        accentDark: "rgb(var(--accent-dark-rgb) / <alpha-value>)",
        accentSoft: "rgb(var(--accent-soft-rgb) / <alpha-value>)",
        sidebar: "rgb(var(--sidebar-rgb) / <alpha-value>)",
        sidebarLine: "rgb(var(--sidebar-line-rgb) / <alpha-value>)",
        neutralDark: "var(--color-text-primary)",
        primary: "var(--color-primary)",
        success: "var(--color-success)",
        successSoft: "var(--color-success-soft)",
        warning: "var(--color-warning)",
        warningSoft: "var(--color-warning-soft)",
        danger: "var(--color-danger)",
        dangerSoft: "var(--color-danger-soft)",
        info: "var(--color-info)",
        infoSoft: "var(--color-info-soft)"
      },
      spacing: {
        xs: "var(--space-xs)",
        sm: "var(--space-sm)",
        md: "var(--space-md)",
        lg: "var(--space-lg)",
        xl: "var(--space-xl)",
        "2xl": "var(--space-2xl)"
      },
      borderRadius: {
        "ds-sm": "var(--radius-sm)",
        "ds-md": "var(--radius-md)",
        "ds-lg": "var(--radius-lg)",
        "ds-xl": "var(--radius-xl)"
      },
      boxShadow: {
        "surface-sm": "var(--shadow-sm)",
        "surface-md": "var(--shadow-md)"
      },
      height: {
        "control-sm": "var(--control-sm)",
        "control-md": "var(--control-md)",
        "control-lg": "var(--control-lg)"
      },
      minHeight: {
        "control-sm": "var(--control-sm)",
        "control-md": "var(--control-md)",
        "control-lg": "var(--control-lg)"
      },
      fontSize: {
        "page-title": ["1.5rem", { lineHeight: "2rem", fontWeight: "750" }],
        "section-title": ["1.125rem", { lineHeight: "1.75rem", fontWeight: "700" }],
        "card-title": ["1rem", { lineHeight: "1.5rem", fontWeight: "700" }],
        body: ["0.875rem", { lineHeight: "1.5rem" }],
        helper: ["0.75rem", { lineHeight: "1.125rem" }],
        label: ["0.875rem", { lineHeight: "1.25rem", fontWeight: "600" }]
      }
    }
  },
  plugins: []
};

export default config;
