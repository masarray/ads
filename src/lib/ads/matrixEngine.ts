import { rankGenerationShedding, rankShedding } from "./solver";
import { buildTopology, calculateIslands, getSourceUnits } from "./topology";
import { getWorstOverload, solvePowerFlowLite } from "./powerFlowLite";
import type {
  AdsDecision,
  BranchFlowResult,
  BreakerState,
  ContingencyRule,
  ElectricalIsland,
  Feeder,
  SystemSnapshot,
  TopologyModel,
  TripMatrix,
  TripMatrixRow,
  PowerFlowLiteResult,
} from "./model";

let matrixSequence = 0;

export function buildTripMatrix(snapshot: SystemSnapshot): TripMatrix {
  const topology = buildTopology(snapshot);
  const powerFlow = solvePowerFlowLite(snapshot);
  const matrixVersion = matrixSequence + 1;
  matrixSequence = matrixVersion;

  const rows: Record<string, TripMatrixRow> = Object.fromEntries(
    Object.keys(snapshot.contingencyRules).map((triggerId) => {
      const row = simulateContingency(triggerId, snapshot, topology, matrixVersion);
      return [triggerId, row];
    }),
  );

  const activeFlowConstraint = getWorstOverload(powerFlow);
  const activeRow = activeFlowConstraint
    ? buildActiveFlowConstraintRow(activeFlowConstraint, snapshot, topology, matrixVersion, powerFlow)
    : undefined;

  if (activeRow) rows[activeRow.triggerId] = activeRow;

  return {
    matrixVersion,
    snapshotHash: snapshot.snapshotHash,
    rows,
    topology,
    powerFlow,
    baseDecision: activeRow?.decision ?? buildNormalBaseDecision(snapshot, powerFlow),
    activeRowId: activeRow?.triggerId,
    activeFlowConstraint,
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

  const triggerState = snapshot.objectStates[triggerId] ?? "closed";
  if (!isClosedState(triggerState)) {
    return alreadyOpenRow(triggerId, snapshot, matrixVersion, rule);
  }

  const currentIslandId = currentTopology.deviceIslandMap[triggerId];
  const currentIsland = currentIslandId
    ? currentTopology.islands.find((island) => island.id === currentIslandId)
    : undefined;

  // IMPORTANT BEHAVIOR CONTRACT:
  // A matrix row keyed by a controllable object is always a WHAT-IF
  // contingency row for that object. Hovering GEN_A1 means:
  // "if GEN_A1 trips/open, what will happen?"
  // It must NOT be reinterpreted as "GEN_A1 is a possible OGS target"
  // just because the CURRENT island is already overgenerated. That old shortcut
  // made generator hover show OGS/runback instead of source-loss preview.
  const nextSnapshot = withToggledState(snapshot, triggerId);
  const nextTopology = calculateIslands(nextSnapshot);
  const nextPowerFlow = solvePowerFlowLite(nextSnapshot);
  const affectedIsland = findAffectedIsland(rule, nextTopology, currentIslandId);
  const formsNewIsland = nextTopology.islands.length > currentTopology.islands.length;
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
    return buildRow(triggerId, nextSnapshot, matrixVersion, affectedIsland, supportedDecision, nextPowerFlow);
  }

  const activeFlowConstraint = getWorstOverload(nextPowerFlow, { excludeBranchId: triggerId });
  if (activeFlowConstraint && affectedIsland) {
    const flowDecision = evaluateFlowConstraint(triggerId, activeFlowConstraint, affectedIsland, rule, nextSnapshot);
    return buildRow(triggerId, nextSnapshot, matrixVersion, affectedIsland, flowDecision, nextPowerFlow, activeFlowConstraint);
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


function buildActiveFlowConstraintRow(
  constraint: BranchFlowResult,
  snapshot: SystemSnapshot,
  topology: TopologyModel,
  matrixVersion: number,
  powerFlow: PowerFlowLiteResult,
): TripMatrixRow | undefined {
  const island = findIslandForBranchConstraint(constraint, topology);
  if (!island) return undefined;

  const requiredReductionMw = Math.ceil(constraint.requiredReductionMw);
  const activeTriggerId = `ACTIVE_CONSTRAINT_${constraint.branchId}`;
  const affectedBuses = island.buses;
  const syntheticRule: ContingencyRule = {
    title: `${constraint.branchId} Power Flow Constraint`,
    mode: "LIVE POWER FLOW",
    constraint: `${constraint.branchId} loading`,
    affectedBuses,
    strictAffectedBuses: true,
    requiredReliefMw: requiredReductionMw,
    actionType: "OLS_LOAD_SHEDDING",
    scenarioKind: "ols_overload",
    explanation:
      "PowerFlowLite menemukan overload aktif pada snapshot sekarang. Ini adalah live/base decision, bukan sekadar contingency preview terakhir.",
    imbalanceBasis:
      `${constraint.branchId}: |flow| ${constraint.absFlowMw.toFixed(1)} MW, rating ${constraint.ratingMw} MW, loading ${constraint.loadingPct.toFixed(1)}%.`,
    imbalanceFormula:
      `Required reduction = |flow| ${constraint.absFlowMw.toFixed(1)} - 85% x ${constraint.ratingMw} = ${requiredReductionMw} MW`,
  };

  const decision = evaluateFlowConstraint(activeTriggerId, constraint, island, syntheticRule, snapshot);
  const row = buildRow(
    activeTriggerId,
    snapshot,
    matrixVersion,
    island,
    {
      ...decision,
      title: `${constraint.branchId} Active Flow Overload`,
      mode: "LIVE POWER FLOW",
      detectedCondition:
        `${constraint.branchId}: |flow| ${constraint.absFlowMw.toFixed(1)} MW, loading ${constraint.loadingPct.toFixed(1)}%, direction ${constraint.directionLabel}.`,
      operatorMessage:
        decision.operatorMessage ??
        `PowerFlowLite detects ${constraint.branchId} overload. ADS must reduce flow by ${requiredReductionMw} MW to reach <=85% rating target.`,
    },
    powerFlow,
    constraint,
    "none",
  );

  row.visualHints.highlightTriggerIds = [constraint.branchId];
  return row;
}

function buildNormalBaseDecision(
  snapshot: SystemSnapshot,
  powerFlow: PowerFlowLiteResult,
): AdsDecision {
  const closedLoadMw = snapshot.feeders
    .filter((feeder) => isClosedState(feeder.breakerState))
    .reduce((sum, feeder) => sum + feeder.mw, 0);

  return {
    status: "normal",
    requiredReliefMw: 0,
    actionType: "NORMAL",
    title: "PowerFlowLite Normal",
    mode: "LIVE POWER FLOW",
    constraint: powerFlow.warnings[0] ?? "No active branch overload",
    explanation:
      "PowerFlowLite tidak menemukan branch/IBT overload aktif pada snapshot sekarang.",
    detectedCondition:
      `Demand ${closedLoadMw} MW, active overloaded branches ${powerFlow.overloadedBranches.length}.`,
    operatorMessage:
      "Sistem tidak memiliki overload aktif menurut PowerFlowLite. Hover contingency CB untuk melihat preview arming.",
    alternatives: [],
    rejected: [],
  };
}

function findIslandForBranchConstraint(
  constraint: BranchFlowResult,
  topology: TopologyModel,
): ElectricalIsland | undefined {
  const direct = topology.deviceIslandMap[constraint.branchId];
  if (direct) {
    const island = topology.islands.find((item) => item.id === direct);
    if (island) return island;
  }

  const candidateBuses = dcBranchBusesToDisplayBuses(constraint);
  const scoped = topology.islands.filter((island) =>
    island.buses.some((bus) => candidateBuses.includes(bus)),
  );
  return scoped.sort((left, right) => right.loadMw - left.loadMw)[0] ?? topology.islands[0];
}

function dcBranchBusesToDisplayBuses(constraint: BranchFlowResult): Array<"A" | "B" | "C"> {
  const buses = new Set<"A" | "B" | "C">();
  const add = (bus: string) => {
    if (bus === "GRID_A" || bus === "A") buses.add("A");
    else if (bus === "GRID_C" || bus === "C") buses.add("C");
    else if (bus === "B1" || bus === "B2") buses.add("B");
  };
  add(constraint.fromBus);
  add(constraint.toBus);
  return [...buses];
}

function flowSendingBus(constraint: BranchFlowResult): BranchFlowResult["fromBus"] {
  return constraint.flowMw >= 0 ? constraint.fromBus : constraint.toBus;
}

function flowReceivingBus(constraint: BranchFlowResult): BranchFlowResult["fromBus"] {
  return constraint.flowMw >= 0 ? constraint.toBus : constraint.fromBus;
}

function isGridBus(bus: BranchFlowResult["fromBus"]): boolean {
  return bus === "GRID_A" || bus === "GRID_C";
}

function dcBusToDisplayBus(bus: BranchFlowResult["fromBus"]): "A" | "B" | "C" | undefined {
  if (bus === "A") return "A";
  if (bus === "B1" || bus === "B2") return "B";
  if (bus === "C") return "C";
  return undefined;
}


function isClosedState(state: BreakerState | undefined): boolean {
  return state !== "open" && state !== "failed";
}

function alreadyOpenRow(
  triggerId: string,
  snapshot: SystemSnapshot,
  matrixVersion: number,
  rule: ContingencyRule,
): TripMatrixRow {
  const decision: AdsDecision = {
    status: "normal",
    requiredReliefMw: 0,
    actionType: "NORMAL",
    scenarioKind: rule.scenarioKind,
    title: `${rule.title} - Already Open`,
    mode: "TRIP MATRIX",
    affectedBuses: rule.affectedBuses,
    constraint: rule.constraint,
    explanation:
      "This contingency object is already open/tripped in the current snapshot. The matrix does not arm the same contingency again.",
    detectedCondition: `${triggerId} is already open/tripped. No duplicate arming is generated.`,
    operatorMessage:
      "CB/contingency sudah open, jadi Trip Matrix tidak menampilkan arming ulang. Reclose dulu jika ingin membuat skenario baru.",
    imbalanceBasis: "Open trigger objects are treated as already executed contingencies.",
    imbalanceFormula: "ADS action need = 0 MW because duplicate arming is suppressed.",
    alternatives: [],
    rejected: [],
  };

  return {
    triggerId,
    matrixVersion,
    snapshotHash: snapshot.snapshotHash,
    status: "normal",
    affectedBuses: rule.affectedBuses,
    triggerCommand: {
      objectId: triggerId,
      action: "open",
    },
    remedialCommands: [],
    selectedTargets: [],
    visualHints: emptyVisualHints(triggerId),
    decision,
  };
}

function evaluateCurrentIslandOgsTarget(
  triggerId: string,
  island: ElectricalIsland,
  rule: ContingencyRule,
): AdsDecision | null {
  if (!triggerId.startsWith("GEN_")) return null;
  if (island.hasGridSource) return null;
  if (!island.generatorIds.includes(triggerId)) return null;

  const generationMw = island.generationMw;
  const loadMw = island.loadMw;
  if (generationMw <= 0) return null;

  if (loadMw <= 0) {
    return {
      status: "armed",
      requiredReliefMw: generationMw,
      actionType: "OGS_GENERATOR_SHEDDING",
      scenarioKind: "ogs_surplus",
      title: `OGS - ${island.id} No Load Island`,
      mode: "TRIP MATRIX",
      affectedBuses: island.buses,
      constraint: "Island has online generation but no closed load",
      explanation:
        "Current true island has generation with zero local load. OGS must trip local generators; no load shedding target is valid.",
      detectedCondition: `Island ${island.id}: Pgen ${generationMw} MW, Pload 0 MW.`,
      operatorMessage:
        "OGS armed: island tanpa beban lokal. Generator lokal harus dilepas, bukan load remote.",
      generationBeforeMw: generationMw,
      loadBeforeMw: 0,
      generationAfterMw: 0,
      balanceRatioPct: 100,
      imbalanceBasis: `Island ${island.id}: Pgen ${generationMw} MW, Pload 0 MW.`,
      imbalanceFormula: `Required generation trip = ${generationMw} MW`,
      selectedGeneration: {
        id: island.generatorIds.join("+"),
        name: `${island.generatorIds.join(" + ")} trip`,
        bus: island.buses[0] ?? "C",
        mw: generationMw,
        priority: 1,
        action: "trip",
      },
      alternatives: [],
      rejected: [],
    };
  }

  const upperLimitMw = loadMw * 1.05;
  if (generationMw <= upperLimitMw) return null;

  const generator = getSourceUnits().find((source) => source.id === triggerId && source.kind === "generator");
  if (!generator) {
    return {
      status: "blocked",
      requiredReliefMw: Math.ceil(generationMw - upperLimitMw),
      actionType: "OGS_GENERATOR_SHEDDING",
      scenarioKind: "ogs_surplus",
      title: `OGS - ${island.id} Generator Not Found`,
      mode: "TRIP MATRIX",
      affectedBuses: island.buses,
      constraint: "Invalid OGS generator target",
      explanation: "The hovered generator is not registered as a dispatchable OGS target.",
      operatorMessage: "OGS blocked: generator target tidak ditemukan di source model.",
      alternatives: [],
      rejected: [],
    };
  }

  const finalGenerationMw = generationMw - generator.mw;
  const finalRatioPct = (finalGenerationMw / loadMw) * 100;
  const requiredReductionMw = Math.ceil(generationMw - upperLimitMw);
  const pass = finalRatioPct >= 95 && finalRatioPct <= 105;

  return {
    status: pass ? "armed" : "blocked",
    requiredReliefMw: requiredReductionMw,
    actionType: "OGS_GENERATOR_SHEDDING",
    scenarioKind: "ogs_surplus",
    title: pass
      ? `OGS - Trip ${generator.name}`
      : `OGS - ${generator.name} Runback Required`,
    mode: "TRIP MATRIX",
    affectedBuses: island.buses,
    constraint: "True island overgeneration",
    explanation:
      "Current true island has generation above the 105% upper balance limit. The matrix checks whether tripping this local generator keeps the island inside 95-105%.",
    detectedCondition:
      `Island ${island.id}: Pgen ${generationMw} MW > 105% x Pload ${loadMw} MW (${upperLimitMw.toFixed(1)} MW).`,
    operatorMessage: pass
      ? `OGS armed: trip ${generator.name} keeps final balance at ${finalRatioPct.toFixed(1)}%.`
      : `OGS required, but tripping ${generator.name} would make final balance ${finalRatioPct.toFixed(1)}%. Use generator runback instead of hard trip.`,
    generationBeforeMw: generationMw,
    loadBeforeMw: loadMw,
    generationAfterMw: finalGenerationMw,
    balanceRatioPct: finalRatioPct,
    imbalanceBasis: `Island ${island.id}: Pgen ${generationMw} MW, Pload ${loadMw} MW.`,
    imbalanceFormula:
      `Required gen reduction >= ${requiredReductionMw} MW; trip ${generator.id} ${generator.mw} MW -> final Pgen ${finalGenerationMw} MW (${finalRatioPct.toFixed(1)}%).`,
    selectedGeneration: pass
      ? {
          id: generator.id,
          name: `${generator.name} trip`,
          bus: generator.bus,
          mw: generator.mw,
          priority: 1,
          action: "trip",
        }
      : undefined,
    alternatives: [],
    rejected: [],
  };
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


function evaluateFlowConstraint(
  triggerId: string,
  constraint: BranchFlowResult,
  island: ElectricalIsland,
  rule: ContingencyRule,
  snapshot: SystemSnapshot,
): AdsDecision {
  const requiredReductionMw = Math.ceil(constraint.requiredReductionMw);
  const sendingBus = flowSendingBus(constraint);
  const receivingBus = flowReceivingBus(constraint);
  const sendingArea = dcBusToDisplayBus(sendingBus);
  const receivingArea = dcBusToDisplayBus(receivingBus);
  const isExportOverload = isGridBus(receivingBus) && Boolean(sendingArea);

  if (isExportOverload && sendingArea) {
    const sourceUnits = getSourceUnits();
    const allowedGeneratorIds = sourceUnits
      .filter((source) => source.kind === "generator")
      .filter((source) => source.bus === sendingArea)
      .filter((source) => island.generatorIds.includes(source.id))
      .filter((source) => isClosedState(snapshot.objectStates[source.id] ?? source.state))
      .map((source) => source.id);

    const decision = rankGenerationShedding(requiredReductionMw, {
      ...enrichRuleContext(triggerId, rule),
      title: `${constraint.branchId} Export Flow Constraint`,
      mode: "POWER FLOW LITE",
      actionType: "OGS_GENERATOR_SHEDDING",
      scenarioKind: "ogs_surplus",
      strictAffectedBuses: true,
      affectedBuses: [sendingArea],
      allowedGeneratorIds,
      constraint: `${constraint.branchId} export loading ${constraint.loadingPct.toFixed(1)}%`,
      explanation:
        "Power Flow Lite sees this as export/back-feed overload toward the grid. Load shedding would reduce local demand and can increase export, so the safe remedial class is generator runback/shedding.",
      detectedCondition:
        `${constraint.branchId}: ${constraint.directionLabel}, |flow| ${constraint.absFlowMw.toFixed(1)} MW > 110% rating ${constraint.ratingMw} MW.`,
      operatorMessage:
        `Export overload on ${constraint.branchId}. Do not shed load for this constraint; reduce generation on Bus ${sendingArea} by about ${requiredReductionMw} MW or re-dispatch/tie-transfer.`,
      imbalanceBasis:
        `${constraint.branchId} flow is from ${sendingBus} toward ${receivingBus}; this is export/back-feed, not import load demand.`,
      imbalanceFormula:
        `Required export reduction = |flow| ${constraint.absFlowMw.toFixed(1)} - 85% x ${constraint.ratingMw} = ${requiredReductionMw} MW`,
      steps: [
        "Build system snapshot.",
        "Solve balanced DC-style Power Flow Lite per active island.",
        "Read branch direction, not only absolute MW.",
        "Classify grid-facing reverse flow as export/back-feed overload.",
        "Use generation reduction/redispatch, not load shedding, because load shedding worsens export.",
      ],
      passCriteria: [
        "IBT import and export are classified differently.",
        "Load shedding is inhibited for export/back-feed overload.",
        "Generator target is local to the sending/source side.",
      ],
    });

    return decision.status === "armed"
      ? decision
      : {
          ...decision,
          status: "blocked",
          selectedGeneration: undefined,
          operatorMessage:
            `Export overload on ${constraint.branchId}. No discrete generator trip fits the required reduction; use generator runback/redispatch or network reconfiguration instead of load shedding.`,
        };
  }

  const targetBus = receivingArea;
  const islandFeeders = localEligibleFeeders(snapshot.feeders, island);
  const localFeeders = targetBus
    ? islandFeeders.filter((feeder) => feeder.bus === targetBus)
    : islandFeeders;
  const fallbackFeeders = localFeeders.length > 0 ? localFeeders : islandFeeders;
  const affectedBuses = targetBus ? [targetBus] : island.buses;

  const decision = rankShedding(fallbackFeeders, requiredReductionMw, {
    ...enrichRuleContext(triggerId, rule),
    title: `${constraint.branchId} Flow Constraint`,
    mode: "POWER FLOW LITE",
    actionType: "OLS_LOAD_SHEDDING",
    scenarioKind: "ols_overload",
    strictAffectedBuses: true,
    affectedBuses,
    constraint: `${constraint.branchId} loading ${constraint.loadingPct.toFixed(1)}%`,
    explanation:
      "Power Flow Lite estimates branch MW flow after the contingency and arms only receiving-side local targets that can reduce the active constraint.",
    detectedCondition:
      `${constraint.branchId}: |flow| ${constraint.absFlowMw.toFixed(1)} MW > 110% rating ${constraint.ratingMw} MW. Direction ${constraint.directionLabel}.`,
    operatorMessage:
      targetBus
        ? `Power Flow Lite detects ${constraint.branchId} import/transfer overload. Required reduction ${requiredReductionMw} MW on receiving Bus ${targetBus} to reach <=85% loading target.`
        : `Power Flow Lite detects ${constraint.branchId} overload. Required reduction ${requiredReductionMw} MW to reach <=85% loading target.`,
    imbalanceBasis:
      `${constraint.branchId}: flow ${constraint.absFlowMw.toFixed(1)} MW, rating ${constraint.ratingMw} MW, loading ${constraint.loadingPct.toFixed(1)}%.`,
    imbalanceFormula:
      `Required reduction = |flow| ${constraint.absFlowMw.toFixed(1)} - 85% x ${constraint.ratingMw} = ${requiredReductionMw} MW`,
    steps: [
      "Build system snapshot.",
      "Solve balanced DC-style Power Flow Lite per active island.",
      "Detect branch loading above 110% pickup.",
      "Classify flow direction and receiving bus.",
      "Rank load combinations on the receiving side first.",
    ],
    passCriteria: [
      "Branch loading pickup is evaluated from Power Flow Lite.",
      "Targets are local to the receiving side of the constrained branch.",
      "Final target aims to reduce loading to <=85% rating.",
    ],
  });

  if (decision.status === "normal") return decision;
  if (fallbackFeeders.length === 0) {
    return {
      ...decision,
      status: "blocked",
      operatorMessage:
        `Power Flow Lite detects ${constraint.branchId} overload, but no closed receiving-side load target exists in island ${island.id}.`,
    };
  }
  return decision;
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
  powerFlow?: PowerFlowLiteResult,
  activeFlowConstraint?: BranchFlowResult,
  triggerAction: "open" | "none" = "open",
): TripMatrixRow {
  const remedialCommands = buildRemedialCommands(decision);
  const selectedTargets = remedialCommands.map((command) => command.objectId);

  return {
    triggerId,
    matrixVersion,
    snapshotHash: snapshot.snapshotHash,
    status: decision.status,
    islandId: island?.id,
    affectedBuses: island?.buses ?? decision.affectedBuses ?? [],
    triggerCommand: {
      objectId: triggerId,
      action: triggerAction,
    },
    remedialCommands,
    selectedTargets,
    visualHints: buildVisualHints(triggerId, island, decision, remedialCommands),
    blockedReason: decision.status === "blocked" ? decision.operatorMessage : undefined,
    activeFlowConstraint,
    powerFlow,
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
    visualHints: emptyVisualHints(triggerId),
    blockedReason: reason,
    decision,
  };
}

function emptyVisualHints(triggerId: string): TripMatrixRow["visualHints"] {
  return {
    highlightTriggerIds: [triggerId],
    blinkArmedTargetIds: [],
    runbackCandidateIds: [],
    dimOutOfScopeIds: [],
  };
}

function buildVisualHints(
  triggerId: string,
  island: ElectricalIsland | undefined,
  decision: AdsDecision,
  remedialCommands: TripMatrixRow["remedialCommands"],
): TripMatrixRow["visualHints"] {
  const blinkArmedTargetIds = decision.status === "armed"
    ? remedialCommands.map((command) => command.objectId)
    : [];

  const isOgs = decision.actionType === "OGS_GENERATOR_SHEDDING" || decision.scenarioKind === "ogs_surplus";
  const shouldShowRunbackCandidates =
    isOgs &&
    decision.status === "blocked" &&
    remedialCommands.length === 0 &&
    (decision.operatorMessage?.toLowerCase().includes("runback") ||
      decision.operatorMessage?.toLowerCase().includes("no generator target") ||
      decision.operatorMessage?.toLowerCase().includes("95-105") ||
      decision.constraint?.toLowerCase().includes("overgeneration") ||
      decision.constraint?.toLowerCase().includes("surplus"));

  return {
    highlightTriggerIds: [triggerId],
    blinkArmedTargetIds,
    runbackCandidateIds: shouldShowRunbackCandidates ? [...(island?.generatorIds ?? [])] : [],
    dimOutOfScopeIds: [],
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
