# ADS Simulator Deployment + SEO Guide

## Public URL strategy

- Cloudflare Pages is the primary SEO canonical domain: `https://powerflow.pages.dev/`
- GitHub Pages remains a working mirror: `https://masarray.github.io/ads/`
- The interactive simulator runs at `/app/`.
- The root `/` is now a fast static SEO landing page.
- Learning pages are static HTML under `/learn/.../`, so they are crawler-friendly and do not depend on React hydration.

## Build commands

### GitHub Pages

```bash
pnpm build:github
```

Output: `dist/` with base path `/ads/`.

GitHub Pages setting must be:

```txt
Settings > Pages > Source: GitHub Actions
```

### Cloudflare Pages

```bash
npm run build:cloudflare
```

Cloudflare Pages settings:

```txt
Build command: npm run build:cloudflare
Build output directory: dist
```

The Cloudflare build automatically removes `.gif` files and assets larger than 25 MiB from `dist`.

## SEO pages generated

- `/`
- `/app/`
- `/learn/power-flow/`
- `/learn/load-flow/`
- `/learn/adaptive-defense-scheme/`
- `/learn/load-shedding/`
- `/learn/islanding/`
- `/learn/blackout/`
- `/learn/blackstart/`
- `/learn/microgrid/`
- `/learn/generator-runback/`
- `/glossary/`

## Generated SEO files

- `sitemap.xml`
- `robots.txt`
- `site.webmanifest`
- `humans.txt`
- `_headers`
- `_redirects`
- `404.html`
- `.nojekyll`

## Why GitHub Pages used to look stuck

The previous root page was being used as both SEO fallback and React app boot shell. If the JavaScript bundle failed to load or GitHub Pages served the wrong build source, the page stayed on the static loading message.

V16 separates them:

- `/` is a real static landing page.
- `/app/` is the React simulator.
- `/learn/.../` pages are static HTML for SEO.

This makes failure modes clearer and makes the site easier for search engines and humans to understand.
