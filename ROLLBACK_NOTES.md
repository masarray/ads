# ADS Stable Rollback Package

This package is intentionally rolled back to the last build-tested stable source state before the visual regression series.

## What was avoided

- No v10/v11/v12 broad `.feeder-on` / `.feeder-off` styling that can recolor SVG text labels.
- No clean-room simplified SLD replacement.
- No stacked replacement zip on top of a corrupted project.

## Build check

The source base used for this package was build-tested with:

```bash
npm run build
```

Result: successful Vite build.

## Recommended use

Extract as a new folder and run it separately first. Do not copy into the damaged folder until this package is visually confirmed.

```bash
npm install
npm run dev
```
