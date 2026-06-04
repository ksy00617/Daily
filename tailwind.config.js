/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./App.jsx"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        rose: {
          350: '#fda4af', // customized rose
        },
        sky: {
          450: '#38bdf8', // customized sky blue
          955: '#082f49', // customized dark sky
        },
        zinc: {
          750: '#27272a', // customized zinc dark
          855: '#18181b', // customized zinc deeper dark
        }
      }
    },
  },
  plugins: [],
}
