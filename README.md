# GridDefense ADS Simulator

Adaptive Defense Scheme Logic simulator for an operator-style HMI Single Line Diagram.

The active web app is intentionally kept as a static site in `codex/`:

```txt
codex/
  index.html
  app.js
  styles.css
  SLD_ADS_HMI_v2.svg
  SLD_SVG_AUDIT.md
```

## Run Locally

```bash
cd codex
python -m http.server 4177 --bind 127.0.0.1
```

Open:

```txt
http://127.0.0.1:4177/
```

## GitHub Pages

The repository is ready for GitHub Pages through `.github/workflows/pages.yml`.
On every push to `main`, the workflow publishes the static site from `codex/`.

Expected Pages URL after deployment:

```txt
https://masarray.github.io/grifdefense-ads-simulator/
```

## Product Scope

- HMI-first Single Line Diagram.
- Closed CB uses solid red fill; open CB uses black fill.
- Source/contingency hover previews armed loads.
- Source/contingency click opens the source CB and trips armed load CBs together.
- Adaptive load shedding searches the smallest valid MW combination while respecting priority groups.
- Group 4 loads are blocked/VIP and marked with a lock icon on the load CB.
- Right-click CB context menu can simulate or clear breaker fail; failed CBs show an orange ban icon and cannot open.
- Live calculation panel shows total generation, total load, system delta, cycle time, and substation balance.

