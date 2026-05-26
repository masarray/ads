import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const fallbackByMode: Record<string, { base: string }> = {
  localhost: { base: "/" },
  local: { base: "/" },
  cloudflare: { base: "/" },
  production: { base: "/" },
  github: { base: "/ads/" },
};

function normalizeBasePath(value?: string) {
  const raw = (value || "/").trim();
  if (!raw || raw === ".") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const fallback = fallbackByMode[mode] || fallbackByMode.production;
  const base = normalizeBasePath(process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || fallback.base);

  return {
    base,
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          app: resolve(__dirname, "app/index.html"),
        },
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/framer-motion")) return "motion";
            if (id.includes("node_modules/lucide-react")) return "icons";
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react";
            if (id.includes("node_modules/zustand")) return "state";
          },
        },
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5177,
    },
    preview: {
      host: "127.0.0.1",
      port: 4177,
    },
  };
});
