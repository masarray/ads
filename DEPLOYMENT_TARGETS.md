# ADS deployment targets

This project is configured to run in three environments from one source tree.

## Localhost

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5177/
http://127.0.0.1:5177/app/
```

Local static build test:

```bash
npm run build:local
npm run preview:local
```

Preview opens at `http://127.0.0.1:4177/`.

## GitHub Pages

GitHub Pages uses base path `/ads/`.

```bash
npm run build:github
```

Output:

```text
https://masarray.github.io/ads/
https://masarray.github.io/ads/app/
```

Use GitHub repository settings: `Settings -> Pages -> Source -> GitHub Actions`.

## Cloudflare Pages

Cloudflare uses root base path `/`.

```text
Build command: npm run build:cloudflare
Build output directory: dist
```

Output:

```text
https://powerflow.pages.dev/
https://powerflow.pages.dev/app/
```

Cloudflare is the canonical SEO domain. GitHub Pages is a working mirror.


## GitHub Pages route rule

This repository is a GitHub Pages **project site**, so the simulator URL is:

```txt
https://masarray.github.io/ads/app/
```

The shorter URL below belongs to the GitHub account root site and cannot be served from this repository:

```txt
https://masarray.github.io/app/
```

For GitHub Pages, use `npm run build:github`. The build uses `VITE_BASE_PATH=/ads/`, generates `dist/app/index.html`, and verifies that generated JS/CSS assets are referenced as `/ads/assets/...`.

Quick route check after deploy:

```txt
https://masarray.github.io/ads/
https://masarray.github.io/ads/app/
https://masarray.github.io/ads/sitemap.xml
```

## v19 note: GitHub Actions env safety

The build scripts no longer depend only on `.env.github` being present in CI. `scripts/run-vite-target.mjs` injects the correct target variables before Vite starts, so `pnpm build:github` reliably builds with `base=/ads/`.

