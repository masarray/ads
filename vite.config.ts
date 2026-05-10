import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => ({
  // Local dev should run at http://127.0.0.1:5177/
  // Production build for GitHub Pages project site should run at /ads/
  base: command === "build" ? "/ads/" : "/",
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5177,
  },
}));
