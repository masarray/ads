const SITE_NAME = "Mas Ari ADS Simulator";

export const targetEnvMap = {
  localhost: {
    VITE_BASE_PATH: "/",
    VITE_SITE_URL: "http://127.0.0.1:5177/",
    VITE_CANONICAL_URL: "http://127.0.0.1:5177/",
    VITE_OG_IMAGE_URL: "http://127.0.0.1:5177/og-image.png",
    VITE_SITE_NAME: SITE_NAME,
    VITE_DEPLOY_TARGET: "localhost",
  },
  local: {
    VITE_BASE_PATH: "/",
    VITE_SITE_URL: "http://127.0.0.1:4177/",
    VITE_CANONICAL_URL: "http://127.0.0.1:4177/",
    VITE_OG_IMAGE_URL: "http://127.0.0.1:4177/og-image.png",
    VITE_SITE_NAME: SITE_NAME,
    VITE_DEPLOY_TARGET: "localhost",
  },
  cloudflare: {
    VITE_BASE_PATH: "/",
    VITE_SITE_URL: "https://powerflow.pages.dev/",
    VITE_CANONICAL_URL: "https://powerflow.pages.dev/",
    VITE_OG_IMAGE_URL: "https://powerflow.pages.dev/og-image.png",
    VITE_SITE_NAME: SITE_NAME,
    VITE_DEPLOY_TARGET: "cloudflare",
  },
  production: {
    VITE_BASE_PATH: "/",
    VITE_SITE_URL: "https://powerflow.pages.dev/",
    VITE_CANONICAL_URL: "https://powerflow.pages.dev/",
    VITE_OG_IMAGE_URL: "https://powerflow.pages.dev/og-image.png",
    VITE_SITE_NAME: SITE_NAME,
    VITE_DEPLOY_TARGET: "cloudflare",
  },
  github: {
    VITE_BASE_PATH: "/ads/",
    VITE_SITE_URL: "https://masarray.github.io/ads/",
    // Cloudflare remains the canonical public SEO target. GitHub Pages is a mirror.
    VITE_CANONICAL_URL: "https://powerflow.pages.dev/",
    VITE_OG_IMAGE_URL: "https://powerflow.pages.dev/og-image.png",
    VITE_SITE_NAME: SITE_NAME,
    VITE_DEPLOY_TARGET: "github",
  },
};

export function resolveTargetEnv(target = "production") {
  const normalized = String(target || "production").trim().toLowerCase();
  return targetEnvMap[normalized] || targetEnvMap.production;
}

export function applyTargetEnv(target = "production") {
  const resolved = resolveTargetEnv(target);
  for (const [key, value] of Object.entries(resolved)) {
    if (!process.env[key]) process.env[key] = value;
  }
  return resolved;
}
