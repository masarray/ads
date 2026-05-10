import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // GitHub Pages project site for https://masarray.github.io/ads/
  // If the repository name changes again, update this base path to match.
  base: "/ads/",
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5177
  }
});
