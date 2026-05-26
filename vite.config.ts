import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = command === "build" ? env.VITE_BASE_PATH || "/" : "/";

  return {
    base,
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: 5177,
    },
  };
});
