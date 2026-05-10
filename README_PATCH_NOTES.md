# Phase 22 Patch Notes — Rename Safe GitHub Pages `/ads/`

Files included:

- `vite.config.ts`
- `index.html`
- `README.md`

## What changed

1. Vite base path changed from `./` to `/ads/`.
2. SEO, Open Graph, Twitter, canonical, and JSON-LD URLs now point to `https://masarray.github.io/ads/`.
3. README now includes:
   - Live Demo link
   - Repository link
   - animated demo GIF from `./public/demo/demo.gif`
   - GPL-3.0-only license note
   - GitHub Pages rename notes

## Important checks before deploy

- Confirm the repository is renamed to `ads`.
- Confirm `public/demo/demo.gif` exists in the repo.
- Confirm `public/assets/SLD_ADS_HMI.svg` exists.
- Run `pnpm build`.
- After deploy, test:
  - `https://masarray.github.io/ads/`
  - `https://masarray.github.io/ads/demo/demo.gif`
  - `https://masarray.github.io/ads/assets/SLD_ADS_HMI.svg`
