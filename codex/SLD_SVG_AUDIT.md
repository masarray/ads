# Audit SVG SLD ADS HMI

Source: `src/assets/SLD_ADS_HMI_ids_cleaned.svg`

## Findings

1. The SVG is still mostly a raw design export. Labels are converted to long `<path>` glyphs, so the HMI cannot update names, MW values, contingency labels, or translations cleanly at runtime.
2. Runtime object IDs are only partially clean. Top-level groups like `LOAD_A1`, `CB_LINE_AB`, and `LINE_AC` exist, but several real clickable bodies still use generic IDs such as `Rectangle_1_6`, which makes CB state control brittle.
3. There is no machine-readable HMI metadata. The SVG does not expose `data-kind`, `data-object`, `data-mw-target`, `data-priority`, `data-contingency`, or click roles for controller logic.
4. The drawing has no dedicated active-power fields. Load/line/IBT/generator MW must be overlaid by React or hard-coded elsewhere instead of being anchored to the SLD object.
5. Energized/de-energized semantics are not encoded. All primary conductors are black by default, while the requested HMI behavior is energized red and dead black.
6. Clickable breaker targets are too small. The visible 26 px breaker rectangles are not enough for operator-grade click/touch interaction; each CB needs a larger transparent hit area.
7. Breaker failure and alternate arming UX needs explicit visual hooks. The current SVG can color selected loads, but it has no dedicated arming badges, priority chips, or alternative-target indicator anchors.

## Corrected SVG Contract

The corrected working SVG in this folder uses:

- Stable equipment IDs aligned with the app state: `LINE_AB`, `LINE_BC`, `LINE_AC`, `IBT_A`, `IBT_C`, `GEN_A1`, `GEN_A2`, `GEN_C1`, `GEN_C2`, and `LOAD_A1` through `LOAD_C5`.
- Stable breaker IDs aligned with current React maps: `CB_LINE_AB`, `CB_LINE_AB_B`, `CB_LINE_BC_B`, `CB_LINE_BC_C`, `CB_LINE_AC`, `CB_LINE_AC_C`, `CB_IBT_A`, `CB_IBT_C`, `CB_GEN_A1`, `CB_GEN_A2`, `CB_GEN_C1`, `CB_GEN_C2`, and `CB_COUPLER`.
- Dedicated MW text IDs: `MW_LOAD_A1`, `MW_LINE_AB`, `MW_IBT_A`, etc.
- Dedicated arming text IDs: `ARM_LOAD_A1`, `ARM_LOAD_B3`, etc.
- `data-kind`, `data-object`, `data-role`, and `data-state` attributes so logic can bind without parsing presentation geometry.
- Red energized conductors by default and black de-energized state through `.state-dead` / `.svg-tripped`.
- Transparent `.hit-target` rectangles around CBs for open/close control when the operator clicks an SLD CB object.

## Integration Note

The app CSS currently colors `.svg-tripped` / `.svg-open` red. For the requested PLN HMI convention, the application stylesheet should later be adjusted so tripped/open/dead primary objects become black while energized/closed objects remain red.
