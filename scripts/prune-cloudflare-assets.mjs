import { readdir, rm, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const distDir = "dist";
const maxCloudflareAssetBytes = 25 * 1024 * 1024;
const removed = [];

async function walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;

    const info = await stat(fullPath);
    const extension = extname(entry.name).toLowerCase();

    // README demo GIFs are allowed in the repository, but Cloudflare Pages
    // validates the final output directory and rejects any file over 25 MiB.
    // Vite copies everything from /public into /dist, so remove GIFs and any
    // oversized accidental assets after the Cloudflare build only.
    const shouldRemove =
      extension === ".gif" || info.size >= maxCloudflareAssetBytes;

    if (shouldRemove) {
      await rm(fullPath, { force: true });
      removed.push(
        `${relative(process.cwd(), fullPath)} (${(info.size / 1024 / 1024).toFixed(1)} MiB)`,
      );
    }
  }
}

await walk(distDir);

if (removed.length === 0) {
  console.log("[cloudflare-prune] no GIF or oversized assets found in dist.");
} else {
  console.log("[cloudflare-prune] removed from Cloudflare deploy output:");
  for (const item of removed) console.log(`- ${item}`);
}
