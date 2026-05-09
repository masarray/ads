import type {
  BreakerState,
  BusId,
  ElectricalIsland,
  Feeder,
  SourceUnit,
  SystemSnapshot,
  TopologyModel,
} from "./model";

type TopologyNodeId = "A" | "B1" | "B2" | "C";

interface TopologyEdge {
  id: string;
  from: TopologyNodeId;
  to: TopologyNodeId;
}

const topologyNodes: TopologyNodeId[] = ["A", "B1", "B2", "C"];

const topologyEdges: TopologyEdge[] = [
  { id: "LINE_AB", from: "A", to: "B1" },
  { id: "LINE_COUPLER", from: "B1", to: "B2" },
  { id: "LINE_BC", from: "B2", to: "C" },
  { id: "LINE_AC", from: "A", to: "C" },
];

/**
 * Source modelling note:
 * - GEN_* are dispatchable local generation and may be selected for OGS.
 * - IBT_* are grid/import sources. They support island/area balance while closed,
 *   but they are NOT generator-shedding targets.
 *
 * This avoids the previous bug where an area backed by IBT was treated as a pure
 * generator island and the ADS tried to trip KIT units unnecessarily.
 */
const sourceUnits: SourceUnit[] = [
  { id: "IBT_A", name: "IBT A / Grid A", bus: "A", mw: 72, state: "closed", kind: "grid" },
  { id: "IBT_C", name: "IBT C / Grid C", bus: "C", mw: 124, state: "closed", kind: "grid" },
  { id: "GEN_A1", name: "KIT A1", bus: "A", mw: 180, state: "closed", kind: "generator" },
  { id: "GEN_A2", name: "KIT A2", bus: "A", mw: 135, state: "closed", kind: "generator" },
  { id: "GEN_C1", name: "KIT C1", bus: "C", mw: 165, state: "closed", kind: "generator" },
  { id: "GEN_C2", name: "KIT C2", bus: "C", mw: 145, state: "closed", kind: "generator" },
];

export function buildTopology(snapshot: SystemSnapshot): TopologyModel {
  return calculateIslands(snapshot);
}

export function calculateIslands(snapshot: SystemSnapshot): TopologyModel {
  const adjacency = new Map<TopologyNodeId, TopologyNodeId[]>(
    topologyNodes.map((node) => [node, []]),
  );

  for (const edge of topologyEdges) {
    if (!isClosed(snapshot.objectStates[edge.id])) continue;
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  const components = findComponents(adjacency);
  const nodeIslandMap = new Map<TopologyNodeId, string>();
  const islands = components.map((nodes) => {
    const id = nodes.join("-");
    for (const node of nodes) nodeIslandMap.set(node, id);
    return buildIsland(id, nodes, snapshot);
  });

  const deviceIslandMap: Record<string, string> = {};
  const loadIslandMap: Record<string, string> = {};
  const generatorIslandMap: Record<string, string> = {};

  for (const edge of topologyEdges) {
    const fromIsland = nodeIslandMap.get(edge.from);
    const toIsland = nodeIslandMap.get(edge.to);
    deviceIslandMap[edge.id] =
      fromIsland && fromIsland === toIsland ? fromIsland : fromIsland ?? toIsland ?? "unknown";
  }

  for (const feeder of snapshot.feeders) {
    const islandId = nodeIslandMap.get(feederTopologyNode(feeder));
    if (!islandId) continue;
    loadIslandMap[feeder.id] = islandId;
    deviceIslandMap[feeder.id] = islandId;
  }

  for (const source of sourceUnits) {
    const islandId = nodeIslandMap.get(busTopologyNode(source.bus));
    if (!islandId) continue;
    deviceIslandMap[source.id] = islandId;
    if ((source.kind ?? "generator") === "generator") {
      generatorIslandMap[source.id] = islandId;
    }
  }

  return {
    islands,
    deviceIslandMap,
    loadIslandMap,
    generatorIslandMap,
  };
}

export function getSourceUnits(): SourceUnit[] {
  return sourceUnits.map((source) => ({ ...source }));
}

function findComponents(
  adjacency: Map<TopologyNodeId, TopologyNodeId[]>,
): TopologyNodeId[][] {
  const visited = new Set<TopologyNodeId>();
  const components: TopologyNodeId[][] = [];

  for (const node of topologyNodes) {
    if (visited.has(node)) continue;
    const stack = [node];
    const component: TopologyNodeId[] = [];
    visited.add(node);

    while (stack.length) {
      const current = stack.pop() as TopologyNodeId;
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

function buildIsland(
  id: string,
  nodeIds: TopologyNodeId[],
  snapshot: SystemSnapshot,
): ElectricalIsland {
  const nodeSet = new Set(nodeIds);
  const loads = snapshot.feeders.filter(
    (feeder) => isClosed(feeder.breakerState) && nodeSet.has(feederTopologyNode(feeder)),
  );

  const onlineSources = sourceUnits.filter(
    (source) =>
      isClosed(snapshot.objectStates[source.id] ?? source.state) &&
      nodeSet.has(busTopologyNode(source.bus)),
  );

  const generators = onlineSources.filter((source) => (source.kind ?? "generator") === "generator");
  const gridSources = onlineSources.filter((source) => source.kind === "grid");

  const generationMw = generators.reduce((sum, generator) => sum + generator.mw, 0);
  const gridImportMw = gridSources.reduce((sum, source) => sum + source.mw, 0);
  const sourceMw = generationMw + gridImportMw;
  const loadMw = loads.reduce((sum, feeder) => sum + feeder.mw, 0);
  const reserveMw = sourceMw - loadMw;

  const localEdgeIds = topologyEdges
    .filter((edge) => nodeSet.has(edge.from) || nodeSet.has(edge.to))
    .map((edge) => edge.id);

  return {
    id,
    buses: [...new Set(nodeIds.map(displayBus))],
    nodeIds,
    sourceMw,
    generationMw,
    gridImportMw,
    loadMw,
    reserveMw,
    deficitMw: Math.max(0, loadMw - sourceMw),
    hasGridSource: gridSources.length > 0,
    loadIds: loads.map((feeder) => feeder.id),
    generatorIds: generators.map((generator) => generator.id),
    gridSourceIds: gridSources.map((source) => source.id),
    deviceIds: [
      ...localEdgeIds,
      ...onlineSources.map((source) => source.id),
    ],
  };
}

function isClosed(state: BreakerState | undefined): boolean {
  return state !== "open" && state !== "failed";
}

function feederTopologyNode(feeder: Feeder): TopologyNodeId {
  if (feeder.bus === "A" || feeder.bus === "C") return feeder.bus;
  return feeder.id === "LOAD_B2" ? "B2" : "B1";
}

function busTopologyNode(bus: BusId): TopologyNodeId {
  return bus;
}

function displayBus(node: TopologyNodeId): BusId {
  if (node === "A" || node === "C") return node;
  return "B";
}
