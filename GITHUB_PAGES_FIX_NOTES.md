# GitHub Pages /ads/app/ Fix Notes

The GitHub Actions failure happened because the repository ignored `.env.*` files, so the runner did not receive `VITE_BASE_PATH=/ads/` and other `VITE_*` values. Vite then left `%VITE_BASE_PATH%` placeholders unresolved and generated app assets without the `/ads/` project-site prefix.

This version fixes it in two ways:

1. `scripts/run-vite-target.mjs` injects target variables directly before running Vite.
2. `.gitignore` now allows the public deploy env files to be tracked.

Required URLs:

- Localhost: `http://127.0.0.1:5177/` and `http://127.0.0.1:5177/app/`
- Cloudflare Pages: `https://powerflow.pages.dev/` and `https://powerflow.pages.dev/app/`
- GitHub Pages: `https://masarray.github.io/ads/` and `https://masarray.github.io/ads/app/`

Do not use `https://masarray.github.io/app/` for this repository. GitHub project sites require the repository path `/ads/`.
