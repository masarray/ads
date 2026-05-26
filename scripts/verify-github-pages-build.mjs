import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const required = [
  "index.html",
  "app/index.html",
  "app.html",
  "404.html",
  ".nojekyll",
  "sitemap.xml",
  "robots.txt",
];

let failed = false;
for (const file of required) {
  if (!existsSync(join(dist, file))) {
    console.error(`[verify-github] missing dist/${file}`);
    failed = true;
  }
}

const appHtmlPath = join(dist, "app/index.html");
if (existsSync(appHtmlPath)) {
  const appHtml = readFileSync(appHtmlPath, "utf8");
  if (!appHtml.includes('/ads/assets/')) {
    console.error('[verify-github] app/index.html does not reference /ads/assets/. Check VITE_BASE_PATH=/ads/.');
    failed = true;
  }
  if (appHtml.includes('src="/src/main.tsx"')) {
    console.error('[verify-github] app/index.html still references raw /src/main.tsx. Build output is invalid.');
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('[verify-github] GitHub Pages artifact OK: /ads/, /ads/app/, /ads/app.html, and 404 fallback are present.');
