import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#166534", // JOJO Green from Dashboard HTML
        "primary-dark": "#064C31",
        "primary-light": "#1A7F56",
        "background-light": "#fdf8f0", // Creamy white
        "background-dark": "#2c2a29", // Dark walnut/coffee bean
        "walnut-brown": "#704214",
        "antique-gold": "#d4af37",
        jojo: { // Keep existing for backward compat if needed, but primary/background-light are preferred
          green: "#166534",
          brown: "#704214",
          gold: "#d4af37",
          bg: "#fdf8f0",
          surface: "#FFFFFF",
          text: "#2B2B2B",
          "text-secondary": "#4A4A4A",
          border: "#E2E8F0",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Merriweather", "Playfair Display", "serif"],
        sans: ["var(--font-sans)", "Roboto", "Montserrat", "Inter", "system-ui", "sans-serif"],
        chart: ["Inter", "sans-serif"],
      },
      borderRadius: {
        lg: "0.5rem", // 8px default in HTML
        md: "0.375rem",
        xl: "1rem",
        "2xl": "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
