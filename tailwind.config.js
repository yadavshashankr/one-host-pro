/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'whatsapp': {
          'light-green': '#25D366',
          'green': '#128C7E',
          'dark-green': '#075E54',
          'light-bg': '#E5DDD5',
          'chat-bg': '#ECE5DD',
          'message-out': '#DCF8C6',
          'message-in': '#FFFFFF',
        }
      }
    },
  },
  plugins: [],
} 