/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        iron: {
          50: "#f8fafc",
          100: "#e4e7ec",
          200: "#c9d0dc",
          300: "#9ba8bb",
          400: "#69768b",
          500: "#4b5566",
          600: "#343b49",
          700: "#252a34",
          800: "#171b22",
          900: "#0d1016",
          950: "#07090d"
        },
        volt: "#b6f214",
        ember: "#f97316",
        steel: "#38bdf8"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(182,242,20,0.18), 0 18px 60px rgba(0,0,0,0.42)"
      }
    }
  },
  plugins: []
};
