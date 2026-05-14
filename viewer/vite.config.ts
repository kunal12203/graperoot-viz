import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Force a single instance of three.js. Without this, react-force-graph-3d
  // bundles its own three and our `import * as THREE from "three"` resolves
  // to a different copy → instanceof checks fail and the layout crashes
  // with "Cannot read properties of undefined (reading 'tick')".
  resolve: {
    dedupe: ["three"],
  },
  optimizeDeps: {
    include: ["three"],
  },
  server: {
    port: 5174,
    proxy: {
      "/graph": "http://127.0.0.1:8765",
      "/event": "http://127.0.0.1:8765",
      "/ws": { target: "ws://127.0.0.1:8765", ws: true },
    },
  },
});
