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
