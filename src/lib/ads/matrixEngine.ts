import { rankGenerationShedding, rankShedding } from "./solver";
import { buildTopology, calculateIslands } from "./topology";
import type {
  AdsDecision,
  BreakerState,
  ContingencyRule,
  ElectricalIsland,
  Feeder,
  SystemSnapshot,
  TopologyModel,
  TripMatrix,
  TripMatrixRow,
} from "./model";

let matrixSequence = 0;

export function buildTripMatrix(snapshot: SystemSnapshot): TripMatrix {
  const topology = buildTopology(snapshot);
  const matrixVersion = matrixSequence + 1;
  matrixSequence = matrixVersion;

  const rows = Object.fromEntries(
    Object.keys(snapshot.contingencyRules).map((triggerId) => {
      const row = simulateContingency(triggerId, snapshot, topology, matrixVersion);
      return [triggerId, row];
    }),
  );

  return {
    matrixVersion,
    snapshotHash: snapshot.snapshotHash,
    rows,
    topology,
  };
}

export function simulateContingency(
  triggerId: string,
  snapshot: SystemSnapshot,
  currentTopology: TopologyModel = buildTopology(snapshot),
  matrixVersion = matrixSequence,
): TripMatrixRow {
  const rule = snapshot.contingencyRules[triggerId];
  if (!rule) {
    return blockedRow(
      triggerId,
      snapshot,
      matrixVersion,
      [],
      undefined,
      "No contingency rule is registered for this trigger.",
    );
  }

  const nextSnapshot = withToggledState(snapshot, triggerId);
  const nextTopology = calculateIslands(nextSnapshot);
  const currentIslandId = currentTopology.deviceIslandMap[triggerId];
  const affectedIsland = findAffectedIsland(rule, nextTopology, currentIslandId);
  const formsNewIsland = nextTopology.islands.length > currentTopology.islands.length;
  const balanceDecision = formsNewIsland && affectedIsland
    ? evaluateIslandBalance(affectedIsland, rule, nextSnapshot, matrixVersion)
    : null;

  if (balanceDecision && balanceDecision.status !== "normal") {
    return buildRow(triggerId, nextSnapshot, matrixVersion, affectedIsland, balanceDecision);
  }

  if (!affectedIsland) {
    return blockedRow(
      triggerId,
      snapshot,
      matrixVersion,
      rule.affectedBuses,
      undefined,
      "Cannot resolve a valid electrical island for this contingency.",
      rule,
    );
  }

  const localFeeders = localEligibleFeeders(nextSnapshot.feeders, affectedIsland);
  if (localFeeders.length === 0 && rule.requiredReliefMw > 0) {
    return blockedRow(
      triggerId,
      snapshot,
      matrixVersion,
      rule.affectedBuses,
      affectedIsland.id,
      `No closed, shed-eligible local load exists inside island ${affectedIsland.id}.`,
      rule,
    );
  }

  const decision = rankShedding(localFeeders, rule.requiredReliefMw, {
    ...enrichRuleContext(triggerId, rule),
    mode: "TRIP MATRIX",
    strictAffectedBuses: true,
    affectedBuses: affectedIsland.buses,
    detectedCondition: `Contingency ${triggerId} evaluated in island ${affectedIsland.id}.`,
    operatorMessage:
      "Trip Matrix Engine membatasi arming hanya pada load lokal yang berada di electrical island terdampak.",
    steps: [
      "Build system snapshot.",
      "Simulate contingency state.",
      "Recalculate electrical islands.",
      "Filter shedding candidates to the affected island.",
      "Rank local target combinations.",
    ],
    passCriteria: [
      "Target berada di island yang sama.",
      "Target masih closed dan shedEligible.",
      "Trip row memakai snapshotHash yang sama saat dieksekusi.",
    ],
  });

  if (decision.status === "blocked") {
    return {
      ...buildRow(triggerId, snapshot, matrixVersion, affectedIsland, decision),
      blockedReason:
        decision.selected === undefined
          ? `No valid local target can satisfy ${rule.requiredReliefMw} MW inside island ${affectedIsland.id}.`
          : undefined,
    };
  }

  return buildRow(triggerId, snapshot, matrixVersion, affectedIsland, decision);
}

export function evaluateIslandBalance(
  island: ElectricalIsland,
  rule: ContingencyRule,
  snapshot: SystemSnapshot,
  _matrixVersion = matrixSequence,
): AdsDecision {
  if (island.loadMw <= 0 && island.sourceMw > 0) {
    return {
      status: "armed",
      requiredReliefMw: island.sourceMw,
      actionType: "OGS_GENERATOR_SHEDDING",
      scenarioKind: "ogs_surplus",
      title: `OGS - ${island.id} No Load Island`,
      mode: "TRIP MATRIX",
      affectedBuses: island.buses,
      constraint: "Island has generation but no load",
      explanation:
        "Contingency membentuk island tanpa beban lokal. ADS harus melepas pembangkit lokal, bukan mencari load remote.",
      detectedCondition: `Island ${island.id}: Pgen ${island.sourceMw} MW, Pload 0 MW.`,
      operatorMessage:
        "Tidak ada target load yang valid di island ini; action valid adalah generator shedding lokal.",
      generationBeforeMw: island.sourceMw,
      loadBeforeMw: 0,
      generationAfterMw: 0,
      balanceRatioPct: 100,
      imbalanceBasis: `Island ${island.id} has ${island.sourceMw} MW source and 0 MW load.`,
      imbalanceFormula: `Required gen trip = ${island.sourceMw} MW`,
      selectedGeneration: {
        id: island.generatorIds.length > 1 ? island.generatorIds.join("+") : island.generatorIds[0] ?? "GEN_LOCAL",
        name: `${island.generatorIds.join(" + ")} trip`,
        bus: island.buses[0] ?? "C",
        mw: island.sourceMw,
        priority: 1,
        action: "trip",
      },
      alternatives: [],
      rejected: [],
    };
  }

  if (island.loadMw > 0 && island.sourceMw > island.loadMw * 1.05) {
    const requiredReduction = Math.ceil(island.sourceMw - island.loadMw * 1.05);
    const decision = rankGenerationShedding(requiredReduction, {
      ...enrichRuleContext("ISLAND_OGS", rule),
      mode: "TRIP MATRIX",
      actionType: "OGS_GENERATOR_SHEDDING",
      scenarioKind: "ogs_surplus",
      affectedBuses: island.buses,
      islandGenerationMw: island.sourceMw,
      islandLoadMw: island.loadMw,
      detectedCondition: `Island ${island.id}: Pgen ${island.sourceMw} MW > 105% x Pload ${island.loadMw} MW.`,
      operatorMessage:
        "Island overgeneration terdeteksi. Matrix memilih generator lokal jika final balance tetap 95-105%.",
      imbalanceBasis: `Island ${island.id}: Pgen ${island.sourceMw} MW, Pload ${island.loadMw} MW.`,
      imbalanceFormula: `Required gen trip >= ${requiredReduction} MW`,
    });
    const ratio = decision.balanceRatioPct ?? 0;
    return decision.selectedGeneration && ratio >= 95 && ratio <= 105
      ? decision
      : {
          ...decision,
          status: "blocked",
          selectedGeneration: undefined,
          operatorMessage:
            "OGS required, but no generator target keeps this island inside 95-105% balance.",
        };
  }

  if (island.deficitMw > 0) {
    const requiredLoadShedMw = Math.ceil(island.loadMw - island.sourceMw / 0.95);
    return rankShedding(localEligibleFeeders(snapshot.feeders, island), requiredLoadShedMw, {
      ...enrichRuleContext("ISLAND_DEFICIT", rule),
      mode: "TRIP MATRIX",
      actionType: "ISLAND_BALANCING",
      scenarioKind: "frequency_islanding",
      strictAffectedBuses: true,
      affectedBuses: island.buses,
      detectedCondition: `Island ${island.id}: Pgen ${island.sourceMw} MW below local load ${island.loadMw} MW.`,
      operatorMessage:
        "Island deficit detected. Matrix only arms local loads inside the same electrical island.",
      imbalanceBasis: `Island ${island.id}: Pgen ${island.sourceMw} MW, Pload ${island.loadMw} MW.`,
      imbalanceFormula: `Required load shed >= ${requiredLoadShedMw} MW`,
    });
  }

  return {
    status: "normal",
    requiredReliefMw: 0,
    actionType: "NORMAL",
    title: `${island.id} Balanced`,
    mode: "TRIP MATRIX",
    affectedBuses: island.buses,
    constraint: "Island balance inside limits",
    explanation: "No island balance action is required.",
    alternatives: [],
    rejected: [],
  };
}

export function tripMatrixRowToDecision(row: TripMatrixRow | undefined): AdsDecision | null {
  return row?.decision ?? null;
}

function buildRow(
  triggerId: string,
  snapshot: SystemSnapshot,
  matrixVersion: number,
  island: ElectricalIsland | undefined,
  decision: AdsDecision,
): TripMatrixRow {
  return {
    triggerId,
    matrixVersion,
    snapshotHash: snapshot.snapshotHash,
    status: decision.status,
    islandId: island?.id,
    affectedBuses: island?.buses ?? decision.affectedBuses ?? [],
    triggerCommand: {
      objectId: triggerId,
      action: "open",
    },
    remedialCommands: buildRemedialCommands(decision),
    selectedTargets:
      decision.selected?.feeders.map((feeder) => feeder.id) ??
      (decision.selectedGeneration ? [decision.selectedGeneration.id] : []),
    blockedReason: decision.status === "blocked" ? decision.operatorMessage : undefined,
    decision,
  };
}

function blockedRow(
  triggerId: string,
  snapshot: SystemSnapshot,
  matrixVersion: number,
  affectedBuses: ContingencyRule["affectedBuses"],
  islandId: string | undefined,
  reason: string,
  rule?: ContingencyRule,
): TripMatrixRow {
  const decision: AdsDecision = {
    status: "blocked",
    requiredReliefMw: rule?.requiredReliefMw ?? 0,
    actionType: rule?.actionType ?? "ISLAND_BALANCING",
    scenarioKind: rule?.scenarioKind,
    title: rule?.title ?? triggerId,
    mode: "TRIP MATRIX",
    affectedBuses,
    constraint: rule?.constraint,
    explanation: rule?.explanation ?? reason,
    operatorMessage: reason,
    imbalanceBasis: "Trip Matrix Engine could not build a valid local action row.",
    imbalanceFormula: "Required action blocked by topology/candidate validation.",
    alternatives: [],
    rejected: [],
  };

  return {
    triggerId,
    matrixVersion,
    snapshotHash: snapshot.snapshotHash,
    status: "blocked",
    islandId,
    affectedBuses,
    triggerCommand: {
      objectId: triggerId,
      action: "open",
    },
    remedialCommands: [],
    selectedTargets: [],
    blockedReason: reason,
    decision,
  };
}

function withToggledState(snapshot: SystemSnapshot, triggerId: string): SystemSnapshot {
  const current = snapshot.objectStates[triggerId] ?? "closed";
  const next: BreakerState = current === "closed" ? "open" : "closed";
  const objectStates = {
    ...snapshot.objectStates,
    [triggerId]: next,
  };
  return {
    ...snapshot,
    objectStates,
    feeders: snapshot.feeders.map((feeder) =>
      feeder.id === triggerId ? { ...feeder, breakerState: next } : feeder,
    ),
  };
}

function findAffectedIsland(
  rule: ContingencyRule,
  topology: TopologyModel,
  fallbackIslandId: string | undefined,
): ElectricalIsland | undefined {
  const busScoped = topology.islands.filter((island) =>
    island.buses.some((bus) => rule.affectedBuses.includes(bus)),
  );
  if (busScoped.length === 1) return busScoped[0];
  if (fallbackIslandId) {
    const fallback = topology.islands.find((island) => island.id === fallbackIslandId);
    if (fallback) return fallback;
  }
  return busScoped.sort((left, right) => right.loadMw - left.loadMw)[0] ?? topology.islands[0];
}

function localEligibleFeeders(feeders: Feeder[], island: ElectricalIsland): Feeder[] {
  const localLoadIds = new Set(island.loadIds);
  return feeders.filter((feeder) => localLoadIds.has(feeder.id));
}

function enrichRuleContext(triggerId: string, rule: ContingencyRule): ContingencyRule {
  if (rule.actionType) return rule;
  if (triggerId.startsWith("GEN_")) {
    return {
      ...rule,
      actionType: "DEFICIT_LOAD_SHEDDING",
      scenarioKind: "generation_derate",
      imbalanceBasis:
        rule.imbalanceBasis ??
        `${rule.title}: generator loss is converted into local load relief after support margin.`,
      imbalanceFormula:
        rule.imbalanceFormula ?? `Required action = ${rule.requiredReliefMw} MW`,
    };
  }

  return {
    ...rule,
    actionType: "OLS_LOAD_SHEDDING",
    scenarioKind: "ols_overload",
    imbalanceBasis:
      rule.imbalanceBasis ??
      `${rule.constraint} requires relief from the local affected island.`,
    imbalanceFormula:
      rule.imbalanceFormula ?? `Required action = ${rule.requiredReliefMw} MW`,
  };
}

function buildRemedialCommands(
  decision: AdsDecision,
): TripMatrixRow["remedialCommands"] {
  if (decision.selected) {
    return decision.selected.feeders.map((feeder) => ({
      objectId: feeder.id,
      action: "open",
      targetType: "load",
      mw: feeder.mw,
      reason: decision.selected?.reason ?? decision.constraint ?? "ADS load shedding",
    }));
  }

  if (decision.selectedGeneration) {
    const ids = decision.selectedGeneration.id.split("+").filter(Boolean);
    if (ids.length > 1) {
      const perUnitMw = Math.round(decision.selectedGeneration.mw / ids.length);
      return ids.map((id) => ({
        objectId: id,
        action: decision.selectedGeneration?.action ?? "trip",
        targetType: "generator",
        mw: perUnitMw,
        reason: decision.constraint ?? "ADS generation shedding",
      }));
    }

    return [{
      objectId: decision.selectedGeneration.id,
      action: decision.selectedGeneration.action,
      targetType: "generator",
      mw: decision.selectedGeneration.mw,
      reason: decision.constraint ?? "ADS generation shedding",
    }];
  }

  return [];
}
