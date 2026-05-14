import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["three"] },
  optimizeDeps: { include: ["three"] },
  server: {
    port: 5175,
    proxy: {
      "/graph": "http://127.0.0.1:8766",
      "/reload": "http://127.0.0.1:8766",
      "/health": "http://127.0.0.1:8766",
      "/ws": { target: "ws://127.0.0.1:8766", ws: true },
    },
  },
});
