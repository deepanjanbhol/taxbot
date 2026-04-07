import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 7330,
    proxy: {
      "/api": { target: "http://127.0.0.1:7329", changeOrigin: true },
      "/ws":  { target: "ws://127.0.0.1:7329",  ws: true },
    },
  },
  build: { outDir: "../server/public" },
});
