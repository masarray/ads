import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "vite";

const mode = process.argv[2] || process.env.DEPLOY_TARGET || "production";
const env = loadEnv(mode, process.cwd(), "");

function normalizeUrl(value, fallback) {
  const raw = (value || fallback || "").trim();
  if (!raw) throw new Error("Missing site URL for SEO generation.");
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const distDir = join(process.cwd(), "dist");
mkdirSync(distDir, { recursive: true });

const siteUrl = normalizeUrl(
  process.env.VITE_SITE_URL || process.env.SITE_URL || env.VITE_SITE_URL,
  "https://ads.pages.dev/",
);
const canonicalUrl = normalizeUrl(
  process.env.VITE_CANONICAL_URL || env.VITE_CANONICAL_URL || siteUrl,
  siteUrl,
);
const siteName = process.env.VITE_SITE_NAME || env.VITE_SITE_NAME || "Mas Ari ADS Simulator";
const basePath = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || "/";
const today = new Date().toISOString().slice(0, 10);

const urls = [
  {
    loc: siteUrl,
    lastmod: today,
    changefreq: "weekly",
    priority: "1.0",
  },
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${xmlEscape(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}sitemap.xml
`;

const manifest = {
  name: siteName,
  short_name: "ADS Simulator",
  description:
    "Smart Adaptive Defense Scheme simulator for power-flow-aware load shedding, OLS, OGS, islanding, generator runback, blackstart restoration, and explainable trip-matrix reasoning.",
  start_url: basePath,
  scope: basePath,
  display: "standalone",
  background_color: "#06100e",
  theme_color: "#06100e",
  icons: [
    { src: `${basePath}icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: `${basePath}icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" },
  ],
};

writeFileSync(join(distDir, "sitemap.xml"), sitemap);
writeFileSync(join(distDir, "robots.txt"), robots);
writeFileSync(join(distDir, "site.webmanifest"), JSON.stringify(manifest, null, 2));
writeFileSync(
  join(distDir, "humans.txt"),
  `${siteName}\nCreated by Ari Sulistiono\nTopic: Adaptive Defense Scheme, Power Flow Lite, OLS, OGS, Trip Matrix learning.\nPrimary URL: ${canonicalUrl}\n`,
);

const indexPath = join(distDir, "index.html");
if (existsSync(indexPath)) {
  let html = readFileSync(indexPath, "utf8");
  html = html
    .replaceAll("%VITE_SITE_URL%", siteUrl)
    .replaceAll("%VITE_CANONICAL_URL%", canonicalUrl)
    .replaceAll("%VITE_OG_IMAGE_URL%", `${siteUrl}og-image.png`)
    .replaceAll("%VITE_SITE_NAME%", siteName)
    .replaceAll("%VITE_BASE_PATH%", basePath);
  writeFileSync(indexPath, html);
  // GitHub Pages SPA fallback for direct refresh/deep links.
  copyFileSync(indexPath, join(distDir, "404.html"));
}

console.log(`[seo] generated sitemap.xml, robots.txt, manifest, 404.html for ${siteUrl}`);
