import { getSourceUnits } from "./topology";
import type {
  BranchFlowResult,
  BreakerState,
  DcBusId,
  Feeder,
  PowerFlowLiteResult,
  SystemSnapshot,
} from "./model";

interface DcBranchTemplate {
  id: string;
  fromBus: DcBusId;
  toBus: DcBusId;
  x: number;
  ratingMw: number;
}

const dcBuses: DcBusId[] = ["GRID_A", "A", "B1", "B2", "C", "GRID_C"];

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

export function solvePowerFlowLite(snapshot: SystemSnapshot): PowerFlowLiteResult {
  const closedBranches = branchTemplates.filter((branch) => isClosed(snapshot.objectStates[branch.id]));
  const adjacency = buildAdjacency(closedBranches);
  const components = findComponents(adjacency);
  const injections = buildBusInjections(snapshot);
  const angleByBus: Record<DcBusId, number> = Object.fromEntries(dcBuses.map((bus) => [bus, 0])) as Record<DcBusId, number>;
  const islandByBus: Record<DcBusId, string> = Object.fromEntries(dcBuses.map((bus) => [bus, bus])) as Record<DcBusId, string>;
  const slackByIsland: Record<string, DcBusId> = {};
  const warnings: string[] = [];

  for (const component of components) {
    const islandId = component.join("-");
    for (const bus of component) islandByBus[bus] = islandId;
    const slack = chooseSlackBus(component, injections);
    slackByIsland[islandId] = slack;
    const componentBranches = closedBranches.filter(
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

  const branches: BranchFlowResult[] = branchTemplates.map((branch) => {
    const status = isClosed(snapshot.objectStates[branch.id]) ? "closed" : "open";
    const rawFlow = status === "closed" ? (angleByBus[branch.fromBus] - angleByBus[branch.toBus]) / branch.x : 0;
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

function buildBusInjections(snapshot: SystemSnapshot): Record<DcBusId, number> {
  const injections = Object.fromEntries(dcBuses.map((bus) => [bus, 0])) as Record<DcBusId, number>;
  const sources = getSourceUnits().filter((source) => isClosed(snapshot.objectStates[source.id] ?? source.state));
  const rawSourceMw = sources.reduce((sum, source) => sum + source.mw, 0);
  const dispatchScale = rawSourceMw > 0 && snapshot.sourceMw > 0
    ? Math.min(1, snapshot.sourceMw / rawSourceMw)
    : 1;

  for (const source of sources) {
    injections[sourceBus(source.id, source.bus)] += source.mw * dispatchScale;
  }

  for (const feeder of snapshot.feeders) {
    if (!isClosed(feeder.breakerState)) continue;
    injections[feederBus(feeder)] -= feeder.mw;
  }

  return injections;
}

function sourceBus(sourceId: string, bus: "A" | "B" | "C"): DcBusId {
  if (sourceId === "IBT_A") return "GRID_A";
  if (sourceId === "IBT_C") return "GRID_C";
  if (bus === "C") return "C";
  return "A";
}

function feederBus(feeder: Feeder): DcBusId {
  if (feeder.bus === "A" || feeder.bus === "C") return feeder.bus;
  return feeder.id === "LOAD_B2" ? "B2" : "B1";
}

function buildAdjacency(branches: DcBranchTemplate[]): Map<DcBusId, DcBusId[]> {
  const adjacency = new Map<DcBusId, DcBusId[]>(dcBuses.map((bus) => [bus, []]));
  for (const branch of branches) {
    adjacency.get(branch.fromBus)?.push(branch.toBus);
    adjacency.get(branch.toBus)?.push(branch.fromBus);
  }
  return adjacency;
}

function findComponents(adjacency: Map<DcBusId, DcBusId[]>): DcBusId[][] {
  const visited = new Set<DcBusId>();
  const components: DcBusId[][] = [];

  for (const bus of dcBuses) {
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
  const grid = component.find((bus) => bus === "GRID_A" || bus === "GRID_C");
  if (grid) return grid;
  return [...component].sort((left, right) => (injections[right] ?? 0) - (injections[left] ?? 0))[0] ?? component[0];
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
