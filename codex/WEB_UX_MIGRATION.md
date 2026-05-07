# Web UX Direction

## Active Direction

The active app stays deployable from `codex/` while the visual language moves toward a modern Material 3 cockpit:

- Graphite surfaces with semantic theme tokens.
- Red means energized / closed / ON.
- Black means dead / open / OFF.
- Amber/orange means overload or warning.
- Teal means selected / armed / previewed ADS target.
- Critical Group 4 loads remain blocked/protected.

## SVG Contract

Use `SLD_ADS_HMI.svg` as the production asset name.

Required properties:

- Transparent SVG background.
- Stable equipment IDs: `LINE_AB`, `LINE_BC`, `LINE_AC`, `IBT_A`, `IBT_C`, `GEN_A1` through `GEN_C2`, and `LOAD_A1` through `LOAD_C5`.
- Stable breaker IDs: `CB_LINE_AB`, `CB_LINE_AB_B`, `CB_LINE_BC_B`, `CB_LINE_BC_C`, `CB_LINE_AC`, `CB_LINE_AC_C`, `CB_IBT_A`, `CB_IBT_C`, `CB_GEN_A1`, `CB_GEN_A2`, `CB_GEN_C1`, `CB_GEN_C2`, `CB_COUPLER`, and load CBs.
- Runtime binding attributes: `data-kind`, `data-object`, `data-role`, and `data-state`.
- Transparent `.hit-target` rectangles around breakers.
- Dedicated live MW text IDs such as `MW_LOAD_A1`, `MW_LINE_AB`, and `MW_IBT_A`.

## React Migration Strategy

When moving from static HTML to React, keep the ADS engine separate from UI:

1. `src/lib/ads/engine.ts`
   Pure state, solver, contingency, and execution logic.

2. `src/lib/ads/store.ts`
   Zustand or reducer store for simulation state, hover preview, and decision phase.

3. `src/components/sld/SldCanvas.tsx`
   Inline-fetch `SLD_ADS_HMI.svg`, bind click/context/hover events, and update SVG DOM classes directly for performance.

4. `src/components/cockpit/ReasoningRail.tsx`
   Material 3 right rail for:
   - event detected,
   - required relief,
   - selected combination,
   - rejected alternatives,
   - score breakdown.

5. `src/routes/index.tsx`
   TanStack Router cockpit route.

6. `src/styles.css`
   Tailwind theme tokens mapped to Material 3 surfaces and ADS semantic colors.

## Logic Upgrade Target

The next engine upgrade should replace single-overload selection with a multi-constraint solver:

- Detect all active overloads.
- Compute required relief for each overloaded branch.
- Enumerate candidate load combinations.
- Reject combinations that fail any branch.
- Reject protected Group 4 and breaker-failed CB targets.
- Rank valid combinations by tier cost, overshed, total MW, and CB count.
- Expose top rejected alternatives so the operator can see why another combination was not chosen.
