# GridDefense ADS Simulator

Adaptive Defense Scheme Logic simulator for an operator-style HMI Single Line Diagram.

The active app is a React + Vite web application with an interactive SVG SLD, ADS Logic reasoning panel, contingency hover preview, and live trip execution history.

## Run Locally

```bash
corepack pnpm install
corepack pnpm run dev
```

Open:

```txt
http://127.0.0.1:5177/
```

## Build

```bash
corepack pnpm run build
```

The production output is written to `dist/`.

## GitHub Pages

The repository deploys the React app through `.github/workflows/pages.yml`.
On every push to `main`, GitHub Actions builds the app and publishes `dist/`.

Pages URL:

```txt
https://masarray.github.io/grifdefense-ads-simulator/
```

## Product Scope

- HMI-first Single Line Diagram using the transparent `SLD_ADS_HMI.svg` asset.
- Red means ON/Close/energized; white means OFF/Open/dead.
- Hover contingency CBs to preview smart ADS arming.
- Click/open contingency CBs to execute ADS logic and trip selected load CBs.
- Executed trips show orange `TRIPPED` chips on open CBs.
- ADS Logic explains selected loads, rejected alternatives, overshed margin, CB operations, and affected electrical area.
- Top command bar shows frequency injection, source, demand, reserve, and relief state.
