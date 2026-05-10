# GridDefense ADS Simulator

![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)
![Built with React](https://img.shields.io/badge/React-19-61dafb.svg)
![Vite](https://img.shields.io/badge/Vite-7-646cff.svg)

**Live Demo:** https://masarray.github.io/ads/  
**Repository:** https://github.com/masarray/ads

## Demo Preview

<p align="center">
  <img src="./public/demo/demo.gif" alt="GridDefense ADS Simulator animated demo" width="100%" />
</p>

## Overview

**GridDefense ADS Simulator** is a personal open-source coding exploration for learning and teaching smart defense scheme logic based on fast power-flow-aware load shedding.

This demo explores a more explainable defense scheme concept using:

- topology awareness,
- Power Flow Lite calculation,
- source-load balance,
- island detection,
- trip-matrix reasoning,
- OLS / Overload Shedding,
- OGS / Over Generation Shedding,
- generator runback reasoning,
- frequency injection scenarios,
- and blackstart / restoration learning sequences.

The goal is to demonstrate that defense scheme actions should be based on electrical reasoning — power direction, source availability, grid/IBT support, island balance, equipment loading, and final system impact — not only on a fixed static trip list.

## Learning and Teaching Use

This project can be used by engineers, students, trainers, educators, and power-system practitioners to learn and teach smart defense scheme concepts, especially fast power-flow-aware load shedding and explainable trip-matrix logic.

It is intended as an educational and exploratory simulator, not as a protection-grade or operational control system.

## Features

- **Power Flow Lite**: lightweight flow-aware calculation for educational ADS reasoning.
- **Trip Matrix Reasoning**: hover a CB or source object to preview what would happen if it trips.
- **OLS / Overload Shedding**: evaluate overload scenarios and load-shedding reactions.
- **OGS / Over Generation Shedding**: evaluate island overgeneration, generator trip validity, and runback requirements.
- **Frequency Injection**: explore low-frequency and over-frequency behavior.
- **Blackstart Learning Mode**: replay source-first restoration steps from blackout to energized system.
- **Event Log and Matrix View**: trace every simulated action and reasoning result.

## Important Disclaimer

This project is a personal, independent, open-source exploration.

It is **not** a commercial product. It is **not** affiliated with, endorsed by, or representing any company, employer, utility, vendor, customer system, or project owner.

No confidential customer data, utility data, employer data, or proprietary project information is intended to be included in this repository.

## Development

Install dependencies:

```bash
pnpm install
```

Run locally:

```bash
pnpm dev
```

Build for GitHub Pages:

```bash
pnpm build
```

Preview the production build:

```bash
pnpm preview
```

## GitHub Pages Notes

This repository is intended to be published as:

```text
https://masarray.github.io/ads/
```

The Vite base path is configured as:

```ts
base: "/ads/"
```

If the repository is renamed again, update `base` in `vite.config.ts` and the public URLs in `index.html` and this README.

## License

This project is released under the **GNU General Public License v3.0 only**.

Copyright (C) 2026 Ari Sulistiono.

See the [`LICENSE`](./LICENSE) file for the full license text.

SPDX-License-Identifier: GPL-3.0-only
