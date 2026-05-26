# Deployment + SEO Guide

This project can be deployed in parallel to GitHub Pages and Cloudflare Pages from the same source code.

## Build targets

```bash
npm run build:github
npm run build:cloudflare
```

GitHub Pages uses `base=/ads/` because the project is deployed at `https://masarray.github.io/ads/`.
Cloudflare Pages uses `base=/` because Pages normally serves the project at the domain root.

## GitHub Pages

1. Push to `main`.
2. In GitHub repository settings, open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. The workflow `.github/workflows/pages.yml` runs `pnpm build:github` and uploads `dist`.

## Cloudflare Pages

Connect the same GitHub repository to Cloudflare Pages.

Recommended settings:

```txt
Framework preset: Vite
Build command: npm run build:cloudflare
Build output directory: dist
Root directory: /
```

Set environment variables in Cloudflare Pages when you already know the final domain:

```txt
VITE_SITE_URL=https://your-domain.example/
VITE_CANONICAL_URL=https://your-domain.example/
VITE_OG_IMAGE_URL=https://your-domain.example/og-image.png
```

If Cloudflare is the primary SEO domain and GitHub Pages is only a mirror, set GitHub's `VITE_CANONICAL_URL` to the Cloudflare/custom domain to avoid duplicate-content signals.

## Generated SEO files

After every production build, `scripts/generate-seo.mjs` creates:

- `dist/sitemap.xml`
- `dist/robots.txt`
- `dist/site.webmanifest`
- `dist/404.html` for GitHub Pages SPA fallback
- `dist/humans.txt`

## SEO checklist after deploy

1. Submit the production URL to Google Search Console.
2. Submit `sitemap.xml`.
3. Check that the canonical URL points to the preferred production domain.
4. Share the app from the canonical URL in LinkedIn, YouTube descriptions, GitHub README, and engineering forums.
5. Add a short learning article or README section with keywords naturally: Adaptive Defense Scheme, Power Flow Lite, OLS, OGS, trip matrix, islanding, generator runback.

## Cloudflare Pages: exclude README GIF demo

Cloudflare Pages rejects any file in the final `dist` output that is larger than 25 MiB. The project demo GIF is only for the GitHub README, so it must not be deployed as a web asset.

The Cloudflare build now runs:

```bash
npm run build:cloudflare
```

This command automatically runs:

```bash
node scripts/prune-cloudflare-assets.mjs
```

The prune script removes from `dist`:
- all `.gif` files
- any accidental asset with size `>= 25 MiB`

Recommended repository structure:

```txt
demo/demo.gif            # OK: GitHub README only, not copied by Vite
public/demo/demo.gif     # Avoid: Vite copies this to dist/demo/demo.gif
```

For README, prefer:

```md
![Adaptive Defense Scheme demo](demo/demo.gif)
```

Cloudflare Pages settings stay:

```txt
Build command: npm run build:cloudflare
Build output directory: dist
```

The messages `No Wrangler configuration file found` and `No functions dir at /functions found` are not the problem for this static Vite app. The real failure was the oversized GIF inside `dist`.

