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

const sourceUnits: SourceUnit[] = [
  { id: "GEN_A1", name: "KIT A1", bus: "A", mw: 180, state: "closed" },
  { id: "GEN_A2", name: "KIT A2", bus: "A", mw: 135, state: "closed" },
  { id: "GEN_C1", name: "KIT C1", bus: "C", mw: 165, state: "closed" },
  { id: "GEN_C2", name: "KIT C2", bus: "C", mw: 145, state: "closed" },
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
    generatorIslandMap[source.id] = islandId;
    deviceIslandMap[source.id] = islandId;
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
  const generators = sourceUnits.filter(
    (source) =>
      isClosed(snapshot.objectStates[source.id] ?? source.state) &&
      nodeSet.has(busTopologyNode(source.bus)),
  );
  const sourceMw = generators.reduce((sum, generator) => sum + generator.mw, 0);
  const loadMw = loads.reduce((sum, feeder) => sum + feeder.mw, 0);
  const reserveMw = sourceMw - loadMw;

  return {
    id,
    buses: [...new Set(nodeIds.map(displayBus))],
    nodeIds,
    sourceMw,
    loadMw,
    reserveMw,
    deficitMw: Math.max(0, loadMw - sourceMw),
    loadIds: loads.map((feeder) => feeder.id),
    generatorIds: generators.map((generator) => generator.id),
    deviceIds: topologyEdges
      .filter((edge) => nodeSet.has(edge.from) || nodeSet.has(edge.to))
      .map((edge) => edge.id),
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
