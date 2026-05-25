import { getSourceUnits } from "./topology";
import type {
  BranchFlowResult,
  BreakerState,
  DcBusId,
  Feeder,
  PowerFlowLiteResult,
  SourceUnit,
  SystemSnapshot,
  TerminalFlowResult,
} from "./model";

interface DcBranchTemplate {
  id: string;
  fromBus: DcBusId;
  toBus: DcBusId;
  x: number;
  ratingMw: number;
}

const dcBuses: DcBusId[] = ["GRID_A", "A", "B1", "B2", "C", "GRID_C"];
const internalDcBuses: DcBusId[] = ["A", "B1", "B2", "C"];

const branchTemplates: DcBranchTemplate[] = [
  { id: "IBT_A", fromBus: "GRID_A", toBus: "A", x: 0.08, ratingMw: 100 },
  { id: "LINE_AB", fromBus: "A", toBus: "B1", x: 0.1, ratingMw: 125 },
  { id: "LINE_COUPLER", fromBus: "B1", toBus: "B2", x: 0.01, ratingMw: 999 },
  { id: "LINE_BC", fromBus: "B2", toBus: "C", x: 0.12, ratingMw: 125 },
  { id: "LINE_AC", fromBus: "A", toBus: "C", x: 0.15, ratingMw: 125 },
  { id: "IBT_C", fromBus: "GRID_C", toBus: "C", x: 0.08, ratingMw: 250 },
];

const pickupPct = 110;
const targetMaxPct = 85;
const epsilonMw = 1e-6;

interface InjectionBuildResult {
  injections: Record<DcBusId, number>;
  gridBranchFlowMw: Record<string, number>;
  terminalFlows: TerminalFlowResult[];
  warnings: string[];
}

export function solvePowerFlowLite(snapshot: SystemSnapshot): PowerFlowLiteResult {
  const closedInternalBranches = branchTemplates.filter(
    (branch) => !isGridBranch(branch.id) && isClosed(snapshot.objectStates[branch.id]),
  );
  const adjacency = buildAdjacency(closedInternalBranches, internalDcBuses);
  const components = findComponents(adjacency, internalDcBuses);
  const injectionBuild = buildBusInjections(snapshot, components);
  const injections = injectionBuild.injections;
  const angleByBus: Record<DcBusId, number> = Object.fromEntries(dcBuses.map((bus) => [bus, 0])) as Record<DcBusId, number>;
  const islandByBus: Record<DcBusId, string> = Object.fromEntries(dcBuses.map((bus) => [bus, bus])) as Record<DcBusId, string>;
  const slackByIsland: Record<string, DcBusId> = {};
  const warnings: string[] = [...injectionBuild.warnings];

  for (const component of components) {
    const islandId = component.join("-");
    for (const bus of component) islandByBus[bus] = islandId;
    const slack = chooseSlackBus(component, injections);
    slackByIsland[islandId] = slack;
    const componentBranches = closedInternalBranches.filter(
      (branch) => component.includes(branch.fromBus) && component.includes(branch.toBus),
    );

    if (component.length <= 1) continue;

    const nonSlack = component.filter((bus) => bus !== slack);
    if (nonSlack.length === 0) continue;

    const index = new Map<DcBusId, number>(nonSlack.map((bus, i) => [bus, i]));
    const bMatrix = Array.from({ length: nonSlack.length }, () => Array(nonSlack.length).fill(0));
    const pVector = nonSlack.map((bus) => injections[bus] ?? 0);

    for (const branch of componentBranches) {
      const b = 1 / branch.x;
      const fromIndex = index.get(branch.fromBus);
      const toIndex = index.get(branch.toBus);

      if (fromIndex !== undefined) bMatrix[fromIndex][fromIndex] += b;
      if (toIndex !== undefined) bMatrix[toIndex][toIndex] += b;
      if (fromIndex !== undefined && toIndex !== undefined) {
        bMatrix[fromIndex][toIndex] -= b;
        bMatrix[toIndex][fromIndex] -= b;
      }
    }

    try {
      const theta = solveLinearSystem(bMatrix, pVector);
      for (const [bus, i] of index) angleByBus[bus] = theta[i] ?? 0;
      angleByBus[slack] = 0;
    } catch {
      warnings.push(`PowerFlowLite could not solve island ${islandId}; branch flow set to 0 for that island.`);
    }
  }

  // Keep the external grid nodes coherent for diagnostics, while IBT flow itself
  // is solved as an import-only boundary injection. Positive IBT flow means
  // GRID -> bus. Export/back-feed is intentionally clamped to zero unless the
  // simulator later exposes an explicit export-enabled study mode.
  for (const branch of branchTemplates.filter((item) => isGridBranch(item.id))) {
    const status = isClosed(snapshot.objectStates[branch.id]) ? "closed" : "open";
    const importMw = status === "closed" ? injectionBuild.gridBranchFlowMw[branch.id] ?? 0 : 0;
    const internalBus = branch.toBus;
    const islandId = islandByBus[internalBus] ?? internalBus;
    islandByBus[branch.fromBus] = status === "closed" ? islandId : branch.fromBus;
    if (status === "closed") angleByBus[branch.fromBus] = angleByBus[branch.toBus] + importMw * branch.x;
    injections[branch.fromBus] = importMw;
  }

  const branches: BranchFlowResult[] = branchTemplates.map((branch) => {
    const status = isClosed(snapshot.objectStates[branch.id]) ? "closed" : "open";
    const rawFlow = status === "closed"
      ? isGridBranch(branch.id)
        ? injectionBuild.gridBranchFlowMw[branch.id] ?? 0
        : (angleByBus[branch.fromBus] - angleByBus[branch.toBus]) / branch.x
      : 0;
    const flowMw = roundMw(rawFlow);
    const absFlowMw = Math.abs(flowMw);
    const loadingPct = branch.ratingMw > 0 ? (absFlowMw / branch.ratingMw) * 100 : 0;
    const targetMaxMw = branch.ratingMw * (targetMaxPct / 100);
    const requiredReductionMw = Math.max(0, absFlowMw - targetMaxMw);
    const directionLabel = flowMw >= 0
      ? `${branch.fromBus} → ${branch.toBus}`
      : `${branch.toBus} → ${branch.fromBus}`;

    return {
      branchId: branch.id,
      fromBus: branch.fromBus,
      toBus: branch.toBus,
      status,
      flowMw,
      absFlowMw,
      ratingMw: branch.ratingMw,
      loadingPct: roundPct(loadingPct),
      targetMaxMw: roundMw(targetMaxMw),
      requiredReductionMw: Math.ceil(requiredReductionMw),
      isOverloaded: status === "closed" && loadingPct >= pickupPct,
      directionLabel,
    };
  });

  return {
    buses: dcBuses.map((bus) => ({
      id: bus,
      pInjectionMw: roundMw(injections[bus] ?? 0),
      angleRad: angleByBus[bus] ?? 0,
      islandId: islandByBus[bus] ?? bus,
    })),
    branches,
    terminalFlows: injectionBuild.terminalFlows,
    overloadedBranches: branches
      .filter((branch) => branch.isOverloaded)
      .sort((left, right) => right.loadingPct - left.loadingPct),
    slackByIsland,
    warnings,
  };
}

export function getWorstOverload(
  powerFlow: PowerFlowLiteResult,
  options: { excludeBranchId?: string; branchIds?: string[] } = {},
): BranchFlowResult | undefined {
  const branchFilter = options.branchIds ? new Set(options.branchIds) : null;
  return powerFlow.overloadedBranches.find((branch) => {
    if (options.excludeBranchId && branch.branchId === options.excludeBranchId) return false;
    if (branchFilter && !branchFilter.has(branch.branchId)) return false;
    return true;
  });
}

export function getBranchFlow(
  powerFlow: PowerFlowLiteResult,
  branchId: string,
): BranchFlowResult | undefined {
  return powerFlow.branches.find((branch) => branch.branchId === branchId);
}

function buildBusInjections(
  snapshot: SystemSnapshot,
  components: DcBusId[][],
): InjectionBuildResult {
  const injections = Object.fromEntries(dcBuses.map((bus) => [bus, 0])) as Record<DcBusId, number>;
  const gridBranchFlowMw: Record<string, number> = { IBT_A: 0, IBT_C: 0 };
  const sourceTerminalMw: Record<string, number> = {};
  const warnings: string[] = [];
  const allSources = getSourceUnits();
  const sources = allSources.filter((source) => isClosed(snapshot.objectStates[source.id] ?? source.state));
  const generators = sources.filter((source) => (source.kind ?? "generator") === "generator");
  const gridSources = sources.filter((source) => source.kind === "grid");
  const closedLoads = snapshot.feeders.filter((feeder) => isClosed(feeder.breakerState));
  const rawGeneratorMw = generators.reduce((sum, source) => sum + source.mw, 0);
  const dispatchAware = snapshot.minReserveMw === 0 || snapshot.sourceMw === 0;
  const forcedGeneratorScale = dispatchAware && rawGeneratorMw > 0
    ? Math.min(1, Math.max(0, snapshot.sourceMw) / rawGeneratorMw)
    : undefined;

  for (const source of allSources) sourceTerminalMw[source.id] = 0;

  for (const feeder of closedLoads) {
    injections[feederBus(feeder)] -= feeder.mw;
  }

  for (const component of components) {
    const componentSet = new Set(component);
    const componentLoads = closedLoads.filter((feeder) => componentSet.has(feederBus(feeder)));
    const componentGenerators = generators.filter((source) => componentSet.has(equipmentBus(source)));
    const componentGridSources = gridSources.filter((source) => componentSet.has(equipmentBus(source)));
    const loadMw = componentLoads.reduce((sum, feeder) => sum + feeder.mw, 0);
    const generatorCapacityMw = componentGenerators.reduce((sum, source) => sum + source.mw, 0);
    const requestedGeneratorMw = forcedGeneratorScale === undefined
      ? generatorCapacityMw
      : generatorCapacityMw * forcedGeneratorScale;

    // In normal ADS study mode, source.mw represents the present generator
    // output available to the network, so a grid/IBT may legitimately import or
    // export. During blackstart/restoration (minReserveMw=0) the store provides
    // a dispatch target, so we curtail to restored demand and keep IBT export at
    // zero unless another source/load balance requires it.
    const gridExportEnabled = snapshot.minReserveMw > 0;
    const generatorDispatchMw =
      gridExportEnabled && componentGridSources.length > 0
        ? Math.max(0, requestedGeneratorMw)
        : Math.min(loadMw, Math.max(0, requestedGeneratorMw));
    const generatorShares = distributeSourceDispatch(
      injections,
      componentGenerators,
      generatorDispatchMw,
      (source) => Math.max(1, source.mw),
    );
    for (const [sourceId, shareMw] of Object.entries(generatorShares)) {
      sourceTerminalMw[sourceId] = (sourceTerminalMw[sourceId] ?? 0) + shareMw;
    }

    const islandNetDeficitMw = loadMw - generatorDispatchMw;

    if (islandNetDeficitMw > epsilonMw) {
      let remainingDeficitMw = islandNetDeficitMw;
      if (componentGridSources.length > 0) {
        const gridShares = distributeGridImport(injections, gridBranchFlowMw, componentGridSources, remainingDeficitMw);
        for (const [sourceId, shareMw] of Object.entries(gridShares)) {
          sourceTerminalMw[sourceId] = (sourceTerminalMw[sourceId] ?? 0) + shareMw;
        }
        remainingDeficitMw = 0;
      }

      if (remainingDeficitMw > epsilonMw) {
        // No grid/import source is available. Balance the DC equations by modelling
        // the unavailable demand as unserved load, while keeping an explicit warning
        // for the operator/ADS reasoning layer.
        distributeLoadRelief(injections, componentLoads, remainingDeficitMw);
        warnings.push(
          `PowerFlowLite island ${component.join("-")} has ${roundMw(remainingDeficitMw)} MW unserved load and no closed IBT/grid import.`,
        );
      }
    } else if (islandNetDeficitMw < -epsilonMw) {
      const exportMw = Math.abs(islandNetDeficitMw);
      if (gridExportEnabled && componentGridSources.length > 0) {
        const gridShares = distributeGridExport(injections, gridBranchFlowMw, componentGridSources, exportMw);
        for (const [sourceId, shareMw] of Object.entries(gridShares)) {
          sourceTerminalMw[sourceId] = (sourceTerminalMw[sourceId] ?? 0) - shareMw;
        }
      } else {
        warnings.push(
          `PowerFlowLite island ${component.join("-")} has ${roundMw(exportMw)} MW local surplus; generator runback is assumed because no export path is enabled.`,
        );
      }
    }
  }

  const terminalFlows = buildTerminalFlows(snapshot, allSources, sourceTerminalMw);

  return { injections, gridBranchFlowMw, terminalFlows, warnings };
}

function distributeSourceDispatch(
  injections: Record<DcBusId, number>,
  sources: SourceUnit[],
  dispatchMw: number,
  weightOf: (source: SourceUnit) => number,
): Record<string, number> {
  const shares: Record<string, number> = {};
  if (sources.length === 0 || dispatchMw <= epsilonMw) return shares;
  const weights = sources.map((source) => Math.max(0.0001, weightOf(source)));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  sources.forEach((source, index) => {
    const shareMw = dispatchMw * (weights[index] / weightSum);
    injections[equipmentBus(source)] += shareMw;
    shares[source.id] = shareMw;
  });
  return shares;
}

function distributeGridImport(
  injections: Record<DcBusId, number>,
  gridBranchFlowMw: Record<string, number>,
  sources: SourceUnit[],
  importMw: number,
): Record<string, number> {
  const shares: Record<string, number> = {};
  if (sources.length === 0 || importMw <= epsilonMw) return shares;
  const weights = sources.map((source) => Math.max(0.0001, gridSlackWeightMw(source)));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  sources.forEach((source, index) => {
    const shareMw = importMw * (weights[index] / weightSum);
    const bus = equipmentBus(source);
    injections[bus] += shareMw;
    gridBranchFlowMw[source.id] = (gridBranchFlowMw[source.id] ?? 0) + shareMw;
    shares[source.id] = shareMw;
  });
  return shares;
}

function distributeGridExport(
  injections: Record<DcBusId, number>,
  gridBranchFlowMw: Record<string, number>,
  sources: SourceUnit[],
  exportMw: number,
): Record<string, number> {
  const shares: Record<string, number> = {};
  if (sources.length === 0 || exportMw <= epsilonMw) return shares;
  const weights = sources.map((source) => Math.max(0.0001, gridSlackWeightMw(source)));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  sources.forEach((source, index) => {
    const shareMw = exportMw * (weights[index] / weightSum);
    const bus = equipmentBus(source);
    injections[bus] -= shareMw;
    gridBranchFlowMw[source.id] = (gridBranchFlowMw[source.id] ?? 0) - shareMw;
    shares[source.id] = shareMw;
  });
  return shares;
}

function distributeLoadRelief(
  injections: Record<DcBusId, number>, feeders: Feeder[], reliefMw: number): void {
  if (feeders.length === 0 || reliefMw <= epsilonMw) return;
  const loadMw = feeders.reduce((sum, feeder) => sum + feeder.mw, 0);
  if (loadMw <= epsilonMw) return;
  for (const feeder of feeders) {
    injections[feederBus(feeder)] += reliefMw * (feeder.mw / loadMw);
  }
}

function buildTerminalFlows(
  snapshot: SystemSnapshot,
  allSources: SourceUnit[],
  sourceTerminalMw: Record<string, number>,
): TerminalFlowResult[] {
  const loadFlows: TerminalFlowResult[] = snapshot.feeders.map((feeder) => {
    const status = isClosed(feeder.breakerState) ? "closed" : "open";
    const flowMw = status === "closed" ? roundMw(feeder.mw) : 0;
    const bus = feederBus(feeder);
    return {
      objectId: feeder.id,
      kind: "load",
      bus,
      status,
      flowMw,
      absFlowMw: Math.abs(flowMw),
      directionLabel: flowMw > epsilonMw ? `${bus} → ${feeder.id}` : `${feeder.id} open`,
      capacityMw: feeder.mw,
      loadingPct: status === "closed" && feeder.mw > epsilonMw ? 100 : 0,
      isOverloaded: false,
    };
  });

  const sourceFlows: TerminalFlowResult[] = allSources.map((source) => {
    const status = isClosed(snapshot.objectStates[source.id] ?? source.state) ? "closed" : "open";
    const flowMw = status === "closed" ? roundMw(sourceTerminalMw[source.id] ?? 0) : 0;
    const bus = equipmentBus(source);
    const kind = source.kind === "grid" ? "grid" : "generator";
    const capacityMw = kind === "grid" ? gridSlackWeightMw(source) : Math.max(0, source.mw);
    const loadingPct = capacityMw > epsilonMw ? roundPct((Math.abs(flowMw) / capacityMw) * 100) : 0;
    const directionLabel = kind === "grid"
      ? flowMw > epsilonMw
        ? `${source.id} → ${bus}`
        : flowMw < -epsilonMw
          ? `${bus} → ${source.id}`
          : `${source.id} standby`
      : flowMw > epsilonMw ? `${source.id} → ${bus}` : `${source.id} standby`;
    return {
      objectId: source.id,
      kind,
      bus,
      status,
      flowMw,
      absFlowMw: Math.abs(flowMw),
      directionLabel,
      capacityMw,
      loadingPct,
      // Treat generator / grid terminal overload as a true over-capacity condition,
      // not merely 100% utilisation. At exactly rated output the terminal is fully
      // loaded but should not flash as overload. A small tolerance avoids UI churn
      // from rounding (e.g. 165/165 MW displaying as overload).
      isOverloaded:
        status === "closed" &&
        capacityMw > epsilonMw &&
        Math.abs(flowMw) > capacityMw + 0.5,
    };
  });

  return [...loadFlows, ...sourceFlows];
}

function gridSlackWeightMw(source: SourceUnit): number {
  const branch = branchTemplates.find((item) => item.id === source.id);
  return branch?.ratingMw ?? source.mw ?? 1;
}

function equipmentBus(source: SourceUnit): DcBusId {
  if (source.id === "IBT_A") return "A";
  if (source.id === "IBT_C") return "C";
  if (source.bus === "C") return "C";
  return "A";
}

function feederBus(feeder: Feeder): DcBusId {
  if (feeder.bus === "A" || feeder.bus === "C") return feeder.bus;
  return feeder.id === "LOAD_B2" ? "B2" : "B1";
}

function isGridBranch(branchId: string): boolean {
  return branchId === "IBT_A" || branchId === "IBT_C";
}

function buildAdjacency(branches: DcBranchTemplate[], buses: DcBusId[] = dcBuses): Map<DcBusId, DcBusId[]> {
  const adjacency = new Map<DcBusId, DcBusId[]>(buses.map((bus) => [bus, []]));
  for (const branch of branches) {
    adjacency.get(branch.fromBus)?.push(branch.toBus);
    adjacency.get(branch.toBus)?.push(branch.fromBus);
  }
  return adjacency;
}

function findComponents(adjacency: Map<DcBusId, DcBusId[]>, buses: DcBusId[] = dcBuses): DcBusId[][] {
  const visited = new Set<DcBusId>();
  const components: DcBusId[][] = [];

  for (const bus of buses) {
    if (visited.has(bus)) continue;
    const component: DcBusId[] = [];
    const stack = [bus];
    visited.add(bus);

    while (stack.length) {
      const current = stack.pop() as DcBusId;
      component.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    components.push(component);
  }

  return components;
}

function chooseSlackBus(component: DcBusId[], injections: Record<DcBusId, number>): DcBusId {
  return [...component].sort((left, right) => Math.abs(injections[right] ?? 0) - Math.abs(injections[left] ?? 0))[0] ?? component[0];
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-9) throw new Error("Singular matrix");
    if (pivot !== col) [a[pivot], a[col]] = [a[col], a[pivot]];

    const pivotValue = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= pivotValue;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }

  return a.map((row) => row[n]);
}

function isClosed(state: BreakerState | undefined): boolean {
  return state !== "open" && state !== "failed";
}

function roundMw(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}
