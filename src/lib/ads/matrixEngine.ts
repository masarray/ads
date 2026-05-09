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
  const isTrueIsland = Boolean(affectedIsland && !affectedIsland.hasGridSource);
  const isSourceLossTrigger = isSourceLoss(triggerId);
  const mustEvaluateIslandBalance = Boolean(
    affectedIsland &&
      !affectedIsland.hasGridSource &&
      (formsNewIsland || isSourceLossTrigger),
  );

  const balanceDecision = mustEvaluateIslandBalance && affectedIsland
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

  if (isSourceLossTrigger) {
    const sourceLossDecision = evaluateSourceLossTrigger(triggerId, affectedIsland, rule, nextSnapshot);
    return buildRow(triggerId, nextSnapshot, matrixVersion, affectedIsland, sourceLossDecision);
  }

  if (formsNewIsland && affectedIsland.hasGridSource && affectedIsland.reserveMw >= 0) {
    const supportedDecision = buildGridSupportedNoActionDecision(triggerId, affectedIsland, rule);
    return buildRow(triggerId, nextSnapshot, matrixVersion, affectedIsland, supportedDecision);
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


function isSourceLoss(triggerId: string): boolean {
  return triggerId.startsWith("GEN_") || triggerId.startsWith("IBT_");
}

function evaluateSourceLossTrigger(
  triggerId: string,
  island: ElectricalIsland,
  rule: ContingencyRule,
  snapshot: SystemSnapshot,
): AdsDecision {
  // Source-loss rows must be driven by the post-contingency power balance,
  // not by the old static requiredReliefMw table.
  // Example: GEN_C1 trips while IBT_C is still closed. The local source may
  // still be higher than the local load, so load shedding must be NO ACTION.
  if (island.loadMw <= 0) {
    return {
      status: "normal",
      requiredReliefMw: 0,
      actionType: "NORMAL",
      scenarioKind: rule.scenarioKind,
      title: `${rule.title} - No Local Load`,
      mode: "TRIP MATRIX",
      affectedBuses: island.buses,
      constraint: "No closed local load",
      explanation:
        "Source contingency was evaluated using post-event island balance. No load shedding is possible or required because local load is zero.",
      detectedCondition: `Area ${island.id}: source ${island.sourceMw} MW, load 0 MW.`,
      operatorMessage:
        "Tidak ada beban lokal closed pada area terdampak; matrix tidak melakukan load shedding.",
      imbalanceBasis: `Area ${island.id}: source ${island.sourceMw} MW, load 0 MW.`,
      imbalanceFormula: "Required load shed = 0 MW",
      alternatives: [],
      rejected: [],
    };
  }

  // Use the 95% lower balance window from the ADS island-balance rule.
  // Required load shed is the amount needed so Psource / Pload_final >= 95%.
  const minimumAllowedSourceMw = island.loadMw * 0.95;

  if (island.sourceMw >= minimumAllowedSourceMw) {
    return {
      status: "normal",
      requiredReliefMw: 0,
      actionType: "NORMAL",
      scenarioKind: rule.scenarioKind,
      title: `${rule.title} - Supported`,
      mode: "TRIP MATRIX",
      affectedBuses: island.buses,
      constraint: rule.constraint,
      explanation:
        "Source-loss contingency was evaluated from the post-event power balance. Remaining local generation plus IBT/grid import is still enough, so no load shedding is armed.",
      detectedCondition:
        `Area ${island.id}: source ${island.sourceMw} MW, load ${island.loadMw} MW, ` +
        `grid/import ${island.gridImportMw} MW, reserve ${island.reserveMw} MW.`,
      operatorMessage:
        "IBT/grid/source margin masih cukup pada area terdampak. Trip Matrix tidak memakai requiredRelief statis untuk membuang load.",
      imbalanceBasis:
        `Area ${island.id}: Psource ${island.sourceMw} MW = local gen ${island.generationMw} MW + ` +
        `IBT/grid ${island.gridImportMw} MW, Pload ${island.loadMw} MW.`,
      imbalanceFormula:
        `No action: ${island.sourceMw} MW >= 95% x ${island.loadMw} MW (${minimumAllowedSourceMw.toFixed(1)} MW).`,
      alternatives: [],
      rejected: [],
    };
  }

  const requiredLoadShedMw = Math.max(0, Math.ceil(island.loadMw - island.sourceMw / 0.95));
  const localFeeders = localEligibleFeeders(snapshot.feeders, island);

  if (requiredLoadShedMw <= 0) {
    return {
      status: "normal",
      requiredReliefMw: 0,
      actionType: "NORMAL",
      scenarioKind: rule.scenarioKind,
      title: `${rule.title} - Balanced`,
      mode: "TRIP MATRIX",
      affectedBuses: island.buses,
      constraint: rule.constraint,
      explanation: "Post-contingency area balance remains inside allowed limits.",
      detectedCondition: `Area ${island.id}: source ${island.sourceMw} MW, load ${island.loadMw} MW.`,
      operatorMessage: "Tidak ada load shedding yang diperlukan.",
      alternatives: [],
      rejected: [],
    };
  }

  return rankShedding(localFeeders, requiredLoadShedMw, {
    ...enrichRuleContext(triggerId, rule),
    mode: "TRIP MATRIX",
    actionType: "DEFICIT_LOAD_SHEDDING",
    scenarioKind: "generation_derate",
    strictAffectedBuses: true,
    affectedBuses: island.buses,
    detectedCondition:
      `Source loss at ${triggerId}: post-event source ${island.sourceMw} MW below ` +
      `95% balance requirement for local load ${island.loadMw} MW.`,
    operatorMessage:
      "Trip Matrix menghitung kebutuhan load shedding dari balance lokal setelah source trip, bukan dari requiredRelief statis.",
    imbalanceBasis:
      `Area ${island.id}: Psource ${island.sourceMw} MW = local gen ${island.generationMw} MW + ` +
      `IBT/grid ${island.gridImportMw} MW, Pload ${island.loadMw} MW.`,
    imbalanceFormula:
      `Required load shed = ceil(${island.loadMw} - ${island.sourceMw} / 0.95) = ${requiredLoadShedMw} MW`,
    steps: [
      "Build pre-event system snapshot.",
      "Apply source-loss contingency virtually.",
      "Recalculate affected electrical island/area.",
      "Read remaining local generation plus IBT/grid import.",
      "Arm load shedding only if local source is below balance threshold.",
    ],
    passCriteria: [
      "IBT/grid source is counted as local support while closed.",
      "Static requiredReliefMw is not used when post-event source margin is enough.",
      "Targets are local to the affected island only.",
    ],
  });
}

function buildGridSupportedNoActionDecision(
  triggerId: string,
  island: ElectricalIsland,
  rule: ContingencyRule,
): AdsDecision {
  return {
    status: "normal",
    requiredReliefMw: 0,
    actionType: "NORMAL",
    scenarioKind: rule.scenarioKind,
    title: `${rule.title} - Grid Supported`,
    mode: "TRIP MATRIX",
    affectedBuses: island.buses,
    constraint: rule.constraint,
    explanation:
      "Topology split was evaluated from the post-event area balance. The affected area still has closed IBT/grid support and non-negative reserve, so ADS does not arm remedial trip targets.",
    detectedCondition:
      `Area ${island.id}: source ${island.sourceMw} MW, load ${island.loadMw} MW, ` +
      `grid/import ${island.gridImportMw} MW, reserve ${island.reserveMw} MW.`,
    operatorMessage:
      "Area masih memiliki IBT/grid support dan margin cukup. Matrix tidak menjalankan OGS/OLS hanya dari rule statis.",
    imbalanceBasis:
      `Area ${island.id}: Psource ${island.sourceMw} MW, Pload ${island.loadMw} MW, reserve ${island.reserveMw} MW.`,
    imbalanceFormula:
      `No action: reserve after ${triggerId} = ${island.reserveMw} MW.`,
    alternatives: [],
    rejected: [],
  };
}

export function evaluateIslandBalance(
  island: ElectricalIsland,
  rule: ContingencyRule,
  snapshot: SystemSnapshot,
  _matrixVersion = matrixSequence,
): AdsDecision {
  if (island.hasGridSource) {
    return {
      status: "normal",
      requiredReliefMw: 0,
      actionType: "NORMAL",
      title: `${island.id} Grid-Supported`,
      mode: "TRIP MATRIX",
      affectedBuses: island.buses,
      constraint: "Area has closed IBT/grid source",
      explanation:
        "Area ini masih disuplai IBT/grid source, sehingga tidak diperlakukan sebagai island murni untuk OGS/UFLS balance.",
      detectedCondition: `Area ${island.id}: Pgen ${island.generationMw} MW, grid/import ${island.gridImportMw} MW, Pload ${island.loadMw} MW.`,
      operatorMessage:
        "IBT/grid source dikenali sebagai support daya. ADS tidak menjalankan generator shedding hanya karena area terpisah topologi.",
      alternatives: [],
      rejected: [],
    };
  }

  const islandGenerationMw = island.generationMw;

  if (island.loadMw <= 0 && islandGenerationMw > 0 && island.generatorIds.length === 0) {
    return {
      status: "blocked",
      requiredReliefMw: islandGenerationMw,
      actionType: "OGS_GENERATOR_SHEDDING",
      scenarioKind: "ogs_surplus",
      title: `OGS - ${island.id} No Dispatchable Generator`,
      mode: "TRIP MATRIX",
      affectedBuses: island.buses,
      constraint: "No dispatchable local generator target",
      explanation:
        "Area memiliki source MW, tetapi tidak ada generator lokal yang valid untuk OGS. IBT/grid source tidak diperlakukan sebagai generator shedding target.",
      operatorMessage:
        "OGS blocked: tidak ada generator lokal yang dapat ditrip secara aman di island ini.",
      alternatives: [],
      rejected: [],
    };
  }

  if (island.loadMw <= 0 && islandGenerationMw > 0) {
    return {
      status: "armed",
      requiredReliefMw: islandGenerationMw,
      actionType: "OGS_GENERATOR_SHEDDING",
      scenarioKind: "ogs_surplus",
      title: `OGS - ${island.id} No Load Island`,
      mode: "TRIP MATRIX",
      affectedBuses: island.buses,
      constraint: "Island has generation but no load",
      explanation:
        "Contingency membentuk island tanpa beban lokal. ADS harus melepas pembangkit lokal, bukan mencari load remote.",
      detectedCondition: `Island ${island.id}: Pgen ${islandGenerationMw} MW, Pload 0 MW.`,
      operatorMessage:
        "Tidak ada target load yang valid di island ini; action valid adalah generator shedding lokal.",
      generationBeforeMw: islandGenerationMw,
      loadBeforeMw: 0,
      generationAfterMw: 0,
      balanceRatioPct: 100,
      imbalanceBasis: `Island ${island.id} has ${islandGenerationMw} MW generation and 0 MW load.`,
      imbalanceFormula: `Required gen trip = ${islandGenerationMw} MW`,
      selectedGeneration: island.generatorIds.length > 0 ? {
        id: island.generatorIds.length > 1 ? island.generatorIds.join("+") : island.generatorIds[0],
        name: `${island.generatorIds.join(" + ")} trip`,
        bus: island.buses[0] ?? "C",
        mw: islandGenerationMw,
        priority: 1,
        action: "trip",
      } : undefined,
      alternatives: [],
      rejected: [],
    };
  }

  if (island.loadMw > 0 && islandGenerationMw > island.loadMw * 1.05) {
    const requiredReduction = Math.ceil(islandGenerationMw - island.loadMw * 1.05);
    const decision = rankGenerationShedding(requiredReduction, {
      ...enrichRuleContext("ISLAND_OGS", rule),
      mode: "TRIP MATRIX",
      actionType: "OGS_GENERATOR_SHEDDING",
      scenarioKind: "ogs_surplus",
      affectedBuses: island.buses,
      islandGenerationMw,
      islandLoadMw: island.loadMw,
      allowedGeneratorIds: island.generatorIds,
      detectedCondition: `Island ${island.id}: Pgen ${islandGenerationMw} MW > 105% x Pload ${island.loadMw} MW.`,
      operatorMessage:
        "Island overgeneration terdeteksi. Matrix memilih generator lokal jika final balance tetap 95-105%.",
      imbalanceBasis: `Island ${island.id}: Pgen ${islandGenerationMw} MW, Pload ${island.loadMw} MW.`,
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
      detectedCondition: `Island ${island.id}: source ${island.sourceMw} MW below local load ${island.loadMw} MW.`,
      operatorMessage:
        "Island deficit detected. Matrix only arms local loads inside the same electrical island.",
      imbalanceBasis: `Island ${island.id}: Pgen ${islandGenerationMw} MW, Pload ${island.loadMw} MW.`,
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
  const remedialCommands = buildRemedialCommands(decision);

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
    remedialCommands,
    selectedTargets: remedialCommands.map((command) => command.objectId),
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
