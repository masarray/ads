import { spawn } from "node:child_process";
import { join } from "node:path";
import { applyTargetEnv } from "./target-env.mjs";

const [, , target = "production", command = "build", ...extraArgs] = process.argv;
const targetEnv = applyTargetEnv(target);

const viteBin = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
const args = [viteBin, command, "--mode", target, ...extraArgs];

console.log(`[vite-target] ${command} target=${target} base=${targetEnv.VITE_BASE_PATH} site=${targetEnv.VITE_SITE_URL}`);

const child = spawn(process.execPath, args, {
  cwd: process.cwd(),
  env: { ...process.env, ...targetEnv },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[vite-target] terminated by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
