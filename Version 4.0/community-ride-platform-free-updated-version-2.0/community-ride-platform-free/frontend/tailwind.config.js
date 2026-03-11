/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef8ff",
          100: "#d9efff",
          200: "#b6e0ff",
          300: "#7fc8ff",
          400: "#3ea8ff",
          500: "#0b84ff",
          600: "#0067db",
          700: "#0053b0",
          800: "#06488f",
          900: "#0a3b73"
        },
        mint: {
          500: "#16a34a"
        }
      }
    },
  },
  plugins: [],
}
