import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Local development may be accessed through a temporary tunnel.
    allowedHosts: true,
    proxy: {
      "/api": apiTarget,
      "/socket.io": { target: apiTarget.replace(/^http/, "ws"), ws: true },
    },
  },
});
