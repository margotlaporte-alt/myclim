import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/.netlify/functions": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
