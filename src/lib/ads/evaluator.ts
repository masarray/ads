import { rankGenerationShedding, rankShedding } from "./solver";
import type { AdsDecision, BreakerState, BusId, Feeder } from "./model";

type TopologyBus = "A" | "B1" | "B2" | "C";

interface ElectricalArea {
  id: string;
  buses: TopologyBus[];
  isIsland: boolean;
  onlineGenerationMw: number;
  onlineLoadMw: number;
  generators: Array<{ id: string; name: string; bus: BusId; mw: number }>;
  loads: Feeder[];
}

const topologyBuses: TopologyBus[] = ["A", "B1", "B2", "C"];

const topologyEdges: Array<{ id: string; from: TopologyBus; to: TopologyBus }> = [
  { id: "LINE_AB", from: "A", to: "B1" },
  { id: "LINE_COUPLER", from: "B1", to: "B2" },
  { id: "LINE_BC", from: "B2", to: "C" },
  { id: "LINE_AC", from: "A", to: "C" },
];

const generators: Array<{ id: string; name: string; bus: TopologyBus; mw: number }> = [
  { id: "GEN_A1", name: "KIT A1", bus: "A", mw: 180 },
  { id: "GEN_A2", name: "KIT A2", bus: "A", mw: 135 },
  { id: "GEN_C1", name: "KIT C1", bus: "C", mw: 165 },
  { id: "GEN_C2", name: "KIT C2", bus: "C", mw: 145 },
];

export function evaluateSystemState(
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>,
): AdsDecision {
  const areas = calculateElectricalAreas(feeders, objectStates);
  const islandAreas = areas.filter((area) => area.isIsland);

  for (const area of islandAreas) {
    const overGeneration = evaluateIslandOverGeneration(area);
    if (overGeneration.status !== "normal") return overGeneration;
  }

  for (const area of islandAreas) {
    const deficit = evaluateIslandDeficit(area);
    if (deficit.status !== "normal") return deficit;
  }

  return {
    status: "normal",
    requiredReliefMw: 0,
    actionType: "NORMAL" as never,
    title: "System Normal",
    mode: "STATE EVALUATOR",
    constraint: "No active ADS action",
    explanation: "Topology and Pgen/Pload balance are inside the prototype limits.",
    imbalanceBasis: "No island imbalance or state-based ADS action is active.",
    imbalanceFormula: "Required action = 0 MW",
    alternatives: [],
    rejected: [],
  };
}

export function previewToggleWithEvaluator(
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>,
  objectId: string,
): AdsDecision {
  return evaluateSystemState(feeders, {
    ...objectStates,
    [objectId]: objectStates[objectId] === "open" ? "closed" : "open",
  });
}

export function applyDecisionTargets(
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>,
  decision: AdsDecision,
): { feeders: Feeder[]; objectStates: Record<string, BreakerState>; events: string[] } {
  const nextStates = { ...objectStates };
  let nextFeeders = feeders;
  const events: string[] = [];

  if (decision.status !== "armed") {
    return { feeders: nextFeeders, objectStates: nextStates, events };
  }

  if (decision.selectedGeneration?.id === "GEN_C_ALL") {
    for (const id of ["GEN_C1", "GEN_C2"]) nextStates[id] = "open";
    events.push("ADS generator command: KIT C1 and KIT C2 opened for no-load island OGS.");
    return { feeders: nextFeeders, objectStates: nextStates, events };
  }

  if (decision.selectedGeneration) {
    nextStates[decision.selectedGeneration.id] = "open";
    events.push(`ADS generator command: ${decision.selectedGeneration.name} opened for ${decision.constraint}.`);
    return { feeders: nextFeeders, objectStates: nextStates, events };
  }

  if (decision.selected) {
    const selectedIds = new Set(decision.selected.feeders.map((feeder) => feeder.id));
    nextFeeders = nextFeeders.map((feeder) =>
      selectedIds.has(feeder.id) ? { ...feeder, breakerState: "open" as BreakerState } : feeder,
    );
    for (const feeder of decision.selected.feeders) {
      nextStates[feeder.id] = "open";
      events.push(`ADS trip command: ${feeder.id} opened for ${decision.constraint}.`);
    }
  }

  return { feeders: nextFeeders, objectStates: nextStates, events };
}

function calculateElectricalAreas(
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>,
): ElectricalArea[] {
  const adjacency = new Map<TopologyBus, TopologyBus[]>(
    topologyBuses.map((bus) => [bus, []]),
  );

  for (const edge of topologyEdges) {
    if (objectStates[edge.id] === "open") continue;
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  const visited = new Set<TopologyBus>();
  const components: TopologyBus[][] = [];

  for (const bus of topologyBuses) {
    if (visited.has(bus)) continue;
    const stack = [bus];
    const component: TopologyBus[] = [];
    visited.add(bus);

    while (stack.length) {
      const current = stack.pop() as TopologyBus;
      component.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    components.push(component);
  }

  const allConnected = components.length === 1;
  return components.map((buses, index) => {
    const loads = feeders.filter(
      (feeder) =>
        feeder.breakerState === "closed" &&
        buses.includes(feederTopologyBus(feeder)),
    );
    const areaGenerators = generators.filter(
      (generator) =>
        objectStates[generator.id] !== "open" && buses.includes(generator.bus),
    );

    return {
      id: buses.join("-") || `AREA_${index + 1}`,
      buses,
      isIsland: !allConnected,
      onlineGenerationMw: areaGenerators.reduce((sum, generator) => sum + generator.mw, 0),
      onlineLoadMw: loads.reduce((sum, feeder) => sum + feeder.mw, 0),
      generators: areaGenerators.map((generator) => ({
        ...generator,
        bus: generator.bus === "C" ? "C" : generator.bus === "A" ? "A" : "B",
      })),
      loads,
    };
  });
}

function evaluateIslandOverGeneration(area: ElectricalArea): AdsDecision {
  const pGen = area.onlineGenerationMw;
  const pLoad = area.onlineLoadMw;
  if (pGen <= 0) return normalAreaDecision(area);

  if (pLoad === 0) {
    return {
      status: "armed",
      requiredReliefMw: pGen,
      actionType: "OGS_GENERATOR_SHEDDING",
      scenarioKind: "ogs_surplus",
      title: `OGS - ${area.id} No Load Island`,
      mode: "STATE EVALUATOR",
      affectedBuses: area.buses.map(toDisplayBus),
      constraint: "Island has generation but zero load",
      explanation: "Island masih memiliki pembangkitan online tetapi tidak ada beban lokal.",
      operatorMessage: "ADS harus trip semua generator lokal di island tanpa beban.",
      generationBeforeMw: pGen,
      loadBeforeMw: 0,
      generationAfterMw: 0,
      balanceRatioPct: 100,
      imbalanceBasis: `Area ${area.id} island: Pgen ${pGen} MW, Pload 0 MW.`,
      imbalanceFormula: `Required gen trip = ${pGen} MW`,
      selectedGeneration: {
        id: area.generators.every((generator) => generator.bus === "C") ? "GEN_C_ALL" : area.generators[0]?.id ?? "GEN_ALL",
        name: area.generators.map((generator) => generator.name).join(" + ") + " trip",
        bus: area.generators[0]?.bus ?? "C",
        mw: pGen,
        priority: 1,
        action: "trip",
      },
      steps: [
        "Build topology and detect island area.",
        "Calculate Pload = 0 MW while generation remains online.",
        "Select all local generators for trip.",
      ],
      passCriteria: ["No remote load shedding.", "Final Pgen island = 0 MW."],
      alternatives: [],
      rejected: [],
    };
  }

  const upper = pLoad * 1.05;
  if (pGen <= upper) return normalAreaDecision(area);

  const requiredReduction = Math.ceil(pGen - upper);
  const decision = rankGenerationShedding(requiredReduction, {
    title: `OGS - ${area.id} Island Overgeneration`,
    mode: "STATE EVALUATOR",
    constraint: "Island generation exceeds 105% of load",
    affectedBuses: area.buses.map(toDisplayBus),
    actionType: "OGS_GENERATOR_SHEDDING",
    scenarioKind: "ogs_surplus",
    islandGenerationMw: pGen,
    islandLoadMw: pLoad,
    imbalanceBasis: `Area ${area.id} island: Pgen ${pGen} MW > 105% x Pload ${pLoad} MW.`,
    imbalanceFormula: `Required gen trip >= ${pGen} - (1.05 x ${pLoad}) = ${requiredReduction} MW`,
    explanation: "Island overgeneration detected. ADS must shed local generation.",
    operatorMessage: "ADS evaluates local generator shedding only; load shedding is not valid for overgeneration.",
    steps: [
      "Build topology and detect island area.",
      "Calculate Pgen/Pload inside the island.",
      "Select generator trip that keeps final ratio 95-105%.",
    ],
    passCriteria: ["Generator target is local to the island.", "Final Pgen/Pload is 95-105%."],
  });

  const ratio = decision.balanceRatioPct ?? 0;
  if (decision.selectedGeneration && ratio >= 95 && ratio <= 105) return decision;
  return {
    ...decision,
    status: "blocked",
    selectedGeneration: undefined,
    operatorMessage: "OGS required, but no available generator trip keeps the island inside 95-105%.",
  };
}

function evaluateIslandDeficit(area: ElectricalArea): AdsDecision {
  const pGen = area.onlineGenerationMw;
  const pLoad = area.onlineLoadMw;
  if (pLoad <= 0) return normalAreaDecision(area);
  const lower = pLoad * 0.95;
  if (pGen >= lower) return normalAreaDecision(area);

  const requiredLoadReduction = Math.ceil(pLoad - pGen / 0.95);
  return rankShedding(area.loads, requiredLoadReduction, {
    title: `Island Deficit - ${area.id}`,
    mode: "STATE EVALUATOR",
    constraint: "Island generation below 95% of load",
    affectedBuses: area.buses.map(toDisplayBus),
    strictAffectedBuses: true,
    actionType: "ISLAND_BALANCING",
    scenarioKind: "frequency_islanding",
    imbalanceBasis: `Area ${area.id} island: Pgen ${pGen} MW < 95% x Pload ${pLoad} MW.`,
    imbalanceFormula: `Required load shed >= ${pLoad} - (${pGen} / 0.95) = ${requiredLoadReduction} MW`,
    explanation: "Island deficit detected. ADS may shed local load only.",
    operatorMessage: "ADS selects only local island loads; remote substations are excluded.",
  });
}

function normalAreaDecision(area: ElectricalArea): AdsDecision {
  return {
    status: "normal",
    requiredReliefMw: 0,
    actionType: "NORMAL" as never,
    title: `${area.id} Balanced`,
    mode: "STATE EVALUATOR",
    affectedBuses: area.buses.map(toDisplayBus),
    constraint: "Area balanced",
    explanation: "No area action is required.",
    alternatives: [],
    rejected: [],
  };
}

function feederTopologyBus(feeder: Feeder): TopologyBus {
  if (feeder.bus === "A" || feeder.bus === "C") return feeder.bus;
  return feeder.id === "LOAD_B2" ? "B2" : "B1";
}

function toDisplayBus(bus: TopologyBus): BusId {
  if (bus === "A" || bus === "C") return bus;
  return "B";
}
