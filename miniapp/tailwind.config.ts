import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#F7F5F2",
        card: "#FFFFFF",
        accent: "#8FBC8F",
        accentMuted: "#B0C7C7",
        textPrimary: "#2D2A32",
        textSecondary: "#5F5B62"
      },
      fontFamily: {
        sans: ["'Nunito'", "system-ui", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "sans-serif"]
      },
      boxShadow: {
        soft: "0 20px 40px -20px rgba(143, 188, 143, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
