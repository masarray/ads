import { create } from "zustand";
import { initialFeeders } from "./initialSystem";
import { previewToggleWithEvaluator } from "./evaluator";
import { buildTripMatrixForState, initialContingencyRules, isContingencyObject, previewDecisionForObject } from "./engine";
import { rankGenerationShedding, rankShedding } from "./solver";
import type { AdsDecision, BreakerState, ContingencyRule, Feeder, LoadGroup, ScenarioKind, TripMatrix, TripMatrixRow } from "./model";

type ScenarioRunState = {
  active: boolean;
  title: string;
  step: number;
  total: number;
  message: string;
};

interface AdsStore {
  feeders: Feeder[];
  contingencyRules: Record<string, ContingencyRule>;
  objectStates: Record<string, BreakerState>;
  tripMatrix: TripMatrix;
  matrixVersion: number;
  snapshotHash: string;
  frequencyHz: number;
  sourceMw: number;
  minReserveMw: number;
  requiredReliefMw: number;
  decision: AdsDecision;
  hoverDecision: AdsDecision | null;
  hoverObjectId: string | null;
  eventLog: string[];
  activeContingencyId: string | null;
  scenarioRun: ScenarioRunState | null;
  reset: () => void;
  setRequiredReliefMw: (mw: number) => void;
  injectScenario: (kind: ScenarioKind, value?: number) => void;
  runTimedScenario: (kind: ScenarioKind, value?: number) => void;
  runBlackstartSequence: () => void;
  updateFeeder: (id: string, patch: Partial<Pick<Feeder, "mw" | "priority" | "group" | "shedEligible">>) => void;
  updateContingency: (id: string, patch: Partial<Pick<ContingencyRule, "requiredReliefMw" | "affectedBuses">>) => void;
  setReserveConfig: (patch: { sourceMw?: number; minReserveMw?: number }) => void;
  toggleObject: (objectId: string) => void;
  setHoverObject: (objectId: string | null) => void;
}

const equipmentIds = [
  "LINE_AB",
  "LINE_BC",
  "LINE_AC",
  "LINE_COUPLER",
  "IBT_A",
  "IBT_C",
  "GEN_A1",
  "GEN_A2",
  "GEN_C1",
  "GEN_C2"
];

const sourceCapacityMw: Record<string, number> = {
  IBT_A: 72,
  IBT_C: 124,
  GEN_A1: 180,
  GEN_A2: 135,
  GEN_C1: 165,
  GEN_C2: 145,
};

function closedLoadMw(feeders: Feeder[]): number {
  return feeders
    .filter((feeder) => feeder.breakerState !== "open" && feeder.breakerState !== "failed")
    .reduce((sum, feeder) => sum + feeder.mw, 0);
}

function closedSourceCapacityMw(objectStates: Record<string, BreakerState>): number {
  return Object.entries(sourceCapacityMw)
    .filter(([id]) => objectStates[id] !== "open" && objectStates[id] !== "failed")
    .reduce((sum, [, mw]) => sum + mw, 0);
}

/**
 * Blackstart dispatch note:
 * Closing a generator breaker during restoration does not mean the unit instantly
 * injects its nameplate MW. In real blackstart, online units follow staged load
 * pickup. This helper gives PowerFlowLite a temporary dispatch target so it
 * solves using restored load + small headroom instead of full installed source.
 */
function blackstartDispatchTargetMw(feeders: Feeder[], objectStates: Record<string, BreakerState>): number {
  const loadMw = closedLoadMw(feeders);
  const sourceCapacity = closedSourceCapacityMw(objectStates);
  if (sourceCapacity <= 0 || loadMw <= 0) return 0;
  return Math.min(sourceCapacity, Math.ceil(loadMw * 1.02));
}


const sequenceDelayMs = 800;

function wait(ms = sequenceDelayMs): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function scenarioTitle(kind: ScenarioKind): string {
  switch (kind) {
    case "topology_split":
      return "Split Bus B Demo";
    case "generation_derate":
      return "Derate KIT C2 Demo";
    case "frequency_islanding":
      return "Frequency Injection Demo";
    case "ols_overload":
      return "OLS IBT C Demo";
    case "ogs_surplus":
      return "OGS Island Demo";
    default:
      return "ADS Timed Scenario";
  }
}

const busCGeneratorMw: Record<string, number> = {
  GEN_C1: 165,
  GEN_C2: 145
};

function buildObjectStates(feeders: Feeder[]): Record<string, BreakerState> {
  return Object.fromEntries([
    ...equipmentIds.map((id) => [id, "closed" as BreakerState]),
    ...feeders.map((feeder) => [feeder.id, feeder.breakerState])
  ]);
}

function buildMatrix(
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>,
  contingencyRules: Record<string, ContingencyRule>,
  sourceMw = 625,
  minReserveMw = 80,
  frequencyHz = 50
): TripMatrix {
  return buildTripMatrixForState(
    feeders,
    objectStates,
    contingencyRules,
    sourceMw,
    minReserveMw,
    frequencyHz
  );
}

function matrixState(matrix: TripMatrix): Pick<AdsStore, "tripMatrix" | "matrixVersion" | "snapshotHash" | "decision"> {
  return {
    tripMatrix: matrix,
    matrixVersion: matrix.matrixVersion,
    snapshotHash: matrix.snapshotHash,
    decision: matrix.baseDecision,
  };
}


type BusbarId = "A" | "B1" | "B2" | "C";

const deadBusEdges: Array<{ id: string; from: BusbarId; to: BusbarId }> = [
  { id: "LINE_AB", from: "A", to: "B1" },
  { id: "LINE_COUPLER", from: "B1", to: "B2" },
  { id: "LINE_BC", from: "B2", to: "C" },
  { id: "LINE_AC", from: "A", to: "C" },
];

const deadBusSourceMap: Record<string, BusbarId> = {
  IBT_A: "A",
  GEN_A1: "A",
  GEN_A2: "A",
  IBT_C: "C",
  GEN_C1: "C",
  GEN_C2: "C",
};

function feederBusbar(feeder: Feeder): BusbarId {
  if (feeder.bus === "A") return "A";
  if (feeder.bus === "C") return "C";
  // The demo SLD has B bus split into two sections. LOAD_B2 sits on B2;
  // the other B loads are on B1.
  return feeder.id === "LOAD_B2" ? "B2" : "B1";
}

function calculateBusbarEnergized(objectStates: Record<string, BreakerState>): Record<BusbarId, boolean> {
  const buses: BusbarId[] = ["A", "B1", "B2", "C"];
  const adjacency = new Map<BusbarId, BusbarId[]>();
  for (const bus of buses) adjacency.set(bus, []);

  for (const edge of deadBusEdges) {
    if (objectStates[edge.id] !== "open" && objectStates[edge.id] !== "failed") {
      adjacency.get(edge.from)?.push(edge.to);
      adjacency.get(edge.to)?.push(edge.from);
    }
  }

  const sourceBuses = new Set<BusbarId>();
  for (const [sourceId, bus] of Object.entries(deadBusSourceMap)) {
    if (objectStates[sourceId] !== "open" && objectStates[sourceId] !== "failed") {
      sourceBuses.add(bus);
    }
  }

  const result = Object.fromEntries(buses.map((bus) => [bus, false])) as Record<BusbarId, boolean>;
  const visited = new Set<BusbarId>();

  for (const start of buses) {
    if (visited.has(start)) continue;
    const component: BusbarId[] = [];
    const queue: BusbarId[] = [start];
    visited.add(start);

    while (queue.length) {
      const bus = queue.shift()!;
      component.push(bus);
      for (const next of adjacency.get(bus) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }

    const energized = component.some((bus) => sourceBuses.has(bus));
    for (const bus of component) result[bus] = energized;
  }

  return result;
}

function connectedDevicesForBus(bus: BusbarId, feeders: Feeder[]): string[] {
  const fixed: Record<BusbarId, string[]> = {
    A: ["IBT_A", "GEN_A1", "GEN_A2", "LINE_AB", "LINE_AC"],
    B1: ["LINE_AB", "LINE_COUPLER"],
    B2: ["LINE_COUPLER", "LINE_BC"],
    C: ["IBT_C", "GEN_C1", "GEN_C2", "LINE_BC", "LINE_AC"],
  };

  return [
    ...fixed[bus],
    ...feeders.filter((feeder) => feederBusbar(feeder) === bus).map((feeder) => feeder.id),
  ];
}

function applyDeadBusIsolation(
  previousObjectStates: Record<string, BreakerState>,
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>,
): { feeders: Feeder[]; objectStates: Record<string, BreakerState>; events: string[] } {
  const previous = calculateBusbarEnergized(previousObjectStates);
  const current = calculateBusbarEnergized(objectStates);
  const buses: BusbarId[] = ["A", "B1", "B2", "C"];
  let nextFeeders = feeders;
  const nextStates = { ...objectStates };
  const events: string[] = [];

  for (const bus of buses) {
    // One-shot transition guard: isolate only when a busbar moves from energized
    // to dead. This avoids continuous cascade on every render/rebuild.
    if (previous[bus] === true && current[bus] === false) {
      const devices = connectedDevicesForBus(bus, nextFeeders);
      const opened: string[] = [];

      for (const id of devices) {
        if (nextStates[id] === "open" || nextStates[id] === "failed") continue;
        nextStates[id] = "open";
        opened.push(id);
      }

      if (opened.length) {
        nextFeeders = nextFeeders.map((feeder) =>
          opened.includes(feeder.id)
            ? { ...feeder, breakerState: "open" as BreakerState }
            : feeder,
        );
        events.push(
          `Dead bus isolation: Bus ${bus} lost voltage. Opened connected CBs: ${opened.join(", ")}.`,
        );
      }
    }
  }

  return { feeders: nextFeeders, objectStates: nextStates, events };
}


function debugTripMatrixContext(
  label: string,
  row: TripMatrixRow | undefined,
  matrix: TripMatrix,
): void {
  if (!import.meta.env.DEV || !row) return;

  const branches = (row.powerFlow ?? matrix.powerFlow).branches
    .filter((branch) => branch.status === "closed")
    .sort((left, right) => right.loadingPct - left.loadingPct)
    .slice(0, 6)
    .map((branch) => ({
      branch: branch.branchId,
      flowMw: branch.flowMw,
      absMw: branch.absFlowMw,
      loadingPct: branch.loadingPct,
      ratingMw: branch.ratingMw,
      overloaded: branch.isOverloaded,
      direction: branch.directionLabel,
    }));

  // This is intentionally console-only debugging. It helps verify that hover
  // preview, click execution, and PowerFlowLite all read the same TripMatrix row.
  // It does not change application state.
  // eslint-disable-next-line no-console
  console.groupCollapsed(`[ADS Debug] ${label}: ${row.triggerId} · ${row.decision.title ?? row.status}`);
  // eslint-disable-next-line no-console
  console.log({
    snapshotHash: matrix.snapshotHash,
    rowSnapshotHash: row.snapshotHash,
    status: row.status,
    triggerCommand: row.triggerCommand,
    selectedTargets: row.selectedTargets,
    remedialCommands: row.remedialCommands,
    actionType: row.decision.actionType,
    scenarioKind: row.decision.scenarioKind,
    requiredReliefMw: row.decision.requiredReliefMw,
    formula: row.decision.imbalanceFormula,
    basis: row.decision.imbalanceBasis,
  });
  // eslint-disable-next-line no-console
  console.table(branches);
  // eslint-disable-next-line no-console
  console.groupEnd();
}

function executeTripMatrixRowState(
  row: TripMatrixRow,
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>,
): { feeders: Feeder[]; objectStates: Record<string, BreakerState>; events: string[]; appliedTargets: string[] } {
  const nextStates = { ...objectStates };
  const events: string[] = [];
  if (row.triggerCommand.action === "open") {
    nextStates[row.triggerCommand.objectId] = "open" as BreakerState;
    events.push(`Trip matrix trigger: ${row.triggerCommand.objectId} opened.`);
  } else {
    events.push(`Trip matrix active decision: ${row.triggerId} uses current snapshot; no trigger CB opened.`);
  }
  let nextFeeders = feeders;
  const appliedTargets: string[] = [];

  for (const command of row.remedialCommands) {
    const feeder = nextFeeders.find((item) => item.id === command.objectId);
    if (command.targetType === "load" && feeder) {
      nextFeeders = nextFeeders.map((item) =>
        item.id === command.objectId ? { ...item, breakerState: "open" as BreakerState } : item
      );
      nextStates[command.objectId] = "open";
      appliedTargets.push(command.objectId);
      events.push(`Trip matrix target: ${command.objectId} ${command.action} (${command.mw} MW).`);
      continue;
    }

    if (command.targetType === "generator" && (command.action === "open" || command.action === "trip")) {
      nextStates[command.objectId] = "open";
      appliedTargets.push(command.objectId);
      events.push(`Trip matrix target: ${command.objectId} ${command.action} (${command.mw} MW).`);
    }
  }

  return { feeders: nextFeeders, objectStates: nextStates, events, appliedTargets };
}

function isBusCIslanded(objectStates: Record<string, BreakerState>): boolean {
  return objectStates.LINE_AC === "open" && objectStates.LINE_BC === "open";
}

function contextualRulesForTopology(
  rules: Record<string, ContingencyRule>,
  objectStates: Record<string, BreakerState>
): Record<string, ContingencyRule> {
  if (!isBusCIslanded(objectStates)) return rules;

  const next = { ...rules };
  for (const id of ["GEN_C1", "GEN_C2", "IBT_C"] as const) {
    const rule = next[id];
    if (!rule) continue;
    next[id] = {
      ...rule,
      affectedBuses: ["C"],
      strictAffectedBuses: true,
      explanation:
        `${rule.title} sedang berada dalam island Bus C. ADS hanya boleh memilih target di Bus C; target A/B diblokir karena tidak lagi satu electrical island.`,
      imbalanceBasis:
        `Bus C sudah island. ${rule.constraint} hanya bisa dikoreksi oleh target lokal Bus C, bukan load dari substation lain.`,
      imbalanceFormula:
        `Local-only action need = ${rule.requiredReliefMw} MW on Bus C island`
    };
  }

  return next;
}

function evaluateBusCOgs(
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>,
  eventItems: string[]
): AdsDecision | null {
  if (!isBusCIslanded(objectStates)) return null;

  const ogsDecision = buildBusCOgsDecision(feeders, objectStates);
  if (!ogsDecision) return null;

  const ratio = ogsDecision.balanceRatioPct ?? 0;
  if (ogsDecision.selectedGeneration?.id === "GEN_C_ALL") {
    for (const id of Object.keys(busCGeneratorMw)) {
      if (objectStates[id] !== "open") objectStates[id] = "open";
    }
    eventItems.push("Auto OGS: KIT C1 and KIT C2 opened because Bus C island has no remaining load.");
    eventItems.push("Final island balance: Pgen 0 MW, Pload 0 MW. PASS no-load island shutdown.");
    return { ...ogsDecision, status: "executed", mode: "LIVE ADS EXECUTION" };
  }

  if (ogsDecision.selectedGeneration && ratio >= 95 && ratio <= 105) {
    objectStates[ogsDecision.selectedGeneration.id] = "open";
    eventItems.push(`Auto OGS: ${ogsDecision.selectedGeneration.name} opened for Bus C island surplus.`);
    eventItems.push(`Final island balance: Pgen ${ogsDecision.generationAfterMw} MW, Pload ${ogsDecision.loadBeforeMw} MW, ratio ${ratio.toFixed(1)}%. PASS.`);
    return { ...ogsDecision, status: "executed", mode: "LIVE ADS EXECUTION" };
  }

  eventItems.push("Auto OGS blocked: no local generator trip keeps Bus C inside 95-105% balance.");
  return {
    ...ogsDecision,
    selectedGeneration: undefined,
    status: "blocked",
    mode: "AUTO OGS EVALUATION",
    operatorMessage:
      "Bus C island surplus terdeteksi, tetapi tidak ada generator trip lokal yang menjaga balance 95-105%. ADS blocked agar tidak membuat island under-generation.",
  };
}

function buildBusCOgsDecision(
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>
): AdsDecision | null {
  if (!isBusCIslanded(objectStates)) return null;

  const islandLoadMw = feeders
    .filter((feeder) => feeder.bus === "C" && feeder.breakerState === "closed")
    .reduce((sum, feeder) => sum + feeder.mw, 0);
  const islandGenerationMw = Object.entries(busCGeneratorMw)
    .filter(([id]) => objectStates[id] !== "open")
    .reduce((sum, [, mw]) => sum + mw, 0);
  const maxAllowedGenerationMw = islandLoadMw * 1.05;

  if (islandLoadMw <= 0 && islandGenerationMw > 0) {
    return {
      status: "armed",
      requiredReliefMw: islandGenerationMw,
      actionType: "OGS_GENERATOR_SHEDDING",
      scenarioKind: "ogs_surplus",
      title: "OGS - Bus C No Load Island",
      mode: "AUTO OGS EVALUATION",
      affectedBuses: ["C"],
      constraint: "Bus C island has no load",
      explanation:
        "Bus C sudah island dan seluruh load C sudah lepas. Pgen tersisa harus dilepas karena tidak ada beban lokal yang menyerap pembangkitan.",
      detectedCondition: `Bus C island no-load: Pgen ${islandGenerationMw} MW, Pload 0 MW.`,
      operatorMessage:
        "Bus C island tanpa beban. ADS harus trip semua generator lokal C; load shedding tidak relevan karena load sudah habis.",
      generationBeforeMw: islandGenerationMw,
      loadBeforeMw: 0,
      generationAfterMw: 0,
      balanceRatioPct: 100,
      imbalanceBasis:
        "Kedua tie line Bus C open dan Pload Bus C = 0 MW. Semua Pgen lokal menjadi surplus.",
      imbalanceFormula: `Required gen trip = remaining island generation ${islandGenerationMw} MW`,
      selectedGeneration: {
        id: "GEN_C_ALL",
        name: "KIT C1 + KIT C2 trip",
        bus: "C",
        mw: islandGenerationMw,
        priority: 1,
        action: "trip"
      },
      steps: [
        "Mendeteksi Line A-C dan Line B-C open: Bus C island.",
        "Menghitung Pload Bus C = 0 MW.",
        "Menghitung Pgen Bus C yang masih online.",
        "Men-trip semua generator lokal karena island tidak punya beban."
      ],
      passCriteria: [
        "Tidak ada load shedding remote.",
        "Semua generator island tanpa beban dilepas.",
        "Final Pgen island menjadi 0 MW."
      ],
      alternatives: [],
      rejected: []
    };
  }

  if (islandLoadMw <= 0 || islandGenerationMw <= maxAllowedGenerationMw) return null;

  const requiredGenerationTripMw = Math.ceil(islandGenerationMw - maxAllowedGenerationMw);
  return rankGenerationShedding(requiredGenerationTripMw, {
    title: "OGS - Bus C Island Surplus",
    mode: "AUTO OGS EVALUATION",
    constraint: "Bus C island overgeneration",
    affectedBuses: ["C"],
    actionType: "OGS_GENERATOR_SHEDDING",
    scenarioKind: "ogs_surplus",
    islandGenerationMw,
    islandLoadMw,
    imbalanceBasis: "Bus C island memiliki Pgen lebih besar dari 105% Pload. ADS harus menurunkan pembangkit lokal, bukan melepas beban.",
    imbalanceFormula: `Required gen trip >= ${islandGenerationMw} - (1.05 x ${islandLoadMw}) = ${requiredGenerationTripMw} MW`,
    detectedCondition: `Bus C island: Pgen ${islandGenerationMw} MW, Pload ${islandLoadMw} MW.`,
    operatorMessage: `Bus C island surplus. ADS mencari generator lokal yang membuat Pgen/Pload kembali 95-105%.`,
    steps: [
      "Mendeteksi Bus C island dari status Line A-C dan Line B-C open.",
      "Menghitung ulang Pgen dan Pload hanya untuk Bus C.",
      "Mengecek batas atas 105% Pload.",
      "Memilih generator trip lokal yang membuat ratio akhir 95-105%."
    ],
    passCriteria: [
      "Target generator berada di Bus C.",
      "Tidak ada load shedding remote dari Bus A/B.",
      "Final Pgen/Pload masuk 95-105% bila kandidat tersedia."
    ],
    explanation: "OGS otomatis mengevaluasi island surplus. Jika ada kandidat generator yang valid, ADS mengirim generator trip; jika tidak, status blocked."
  });
}

function previewDecisionForTopology(
  objectId: string | null,
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>,
  rules: Record<string, ContingencyRule>
): AdsDecision | null {
  if (!objectId) return null;

  const statePreview = previewToggleWithEvaluator(feeders, objectStates, objectId);
  if (statePreview.status !== "normal") {
    return {
      ...statePreview,
      mode: "STATE PREVIEW",
    };
  }

  const hypotheticalStates: Record<string, BreakerState> = {
    ...objectStates,
    [objectId]: objectStates[objectId] === "open" ? "closed" : "open"
  };
  const formsBusCIsland =
    objectStates[objectId] !== "open" &&
    (objectId === "LINE_AC" || objectId === "LINE_BC") &&
    isBusCIslanded(hypotheticalStates);

  if (formsBusCIsland) {
    const ogsPreview = buildBusCOgsDecision(feeders, hypotheticalStates);
    if (ogsPreview) {
      const ratio = ogsPreview.balanceRatioPct ?? 0;
      return {
        ...ogsPreview,
        status:
          ogsPreview.selectedGeneration && ratio >= 95 && ratio <= 105
            ? "armed"
            : "blocked",
        mode: "ISLAND-FORMING PREVIEW",
        selectedGeneration:
          ogsPreview.selectedGeneration && ratio >= 95 && ratio <= 105
            ? ogsPreview.selectedGeneration
            : undefined,
        operatorMessage:
          ogsPreview.selectedGeneration && ratio >= 95 && ratio <= 105
            ? "Membuka line ini akan membentuk Bus C island. ADS akan menjalankan OGS, bukan load shedding line overload."
            : "Membuka line ini akan membentuk Bus C island, tetapi tidak ada generator trip lokal yang menjaga balance 95-105%. ADS akan blocked.",
      };
    }
  }

  return previewDecisionForObject(objectId, feeders, rules, objectStates);
}

const initialObjectStates = buildObjectStates(initialFeeders);
const initialTripMatrix = buildMatrix(
  initialFeeders,
  initialObjectStates,
  initialContingencyRules
);

export const useAdsStore = create<AdsStore>((set, get) => ({
  feeders: initialFeeders,
  contingencyRules: initialContingencyRules,
  objectStates: initialObjectStates,
  ...matrixState(initialTripMatrix),
  frequencyHz: 50,
  sourceMw: 625,
  minReserveMw: 80,
  requiredReliefMw: 0,
  decision: initialTripMatrix.baseDecision,
  hoverDecision: null,
  hoverObjectId: null,
  eventLog: [],
  activeContingencyId: null,
  scenarioRun: null,
  reset: () => {
    const feeders = initialFeeders.map((feeder) => ({ ...feeder, breakerState: "closed" as BreakerState }));
    const objectStates = buildObjectStates(feeders);
    const tripMatrix = buildMatrix(feeders, objectStates, initialContingencyRules);
    set({
      feeders,
      contingencyRules: initialContingencyRules,
      objectStates,
      ...matrixState(tripMatrix),
      frequencyHz: 50,
      sourceMw: 625,
      minReserveMw: 80,
      requiredReliefMw: 0,
      decision: tripMatrix.baseDecision,
      hoverDecision: null,
      hoverObjectId: null,
      eventLog: ["System reset. All controllable breakers closed."],
      activeContingencyId: null,
      scenarioRun: null
    });
  },
  setRequiredReliefMw: (requiredReliefMw) => {
    const feeders = get().feeders;
    set({
      requiredReliefMw,
      decision: rankShedding(feeders, requiredReliefMw, {
        title: "Manual Relief Request",
        mode: "OPERATOR PRE-ARM",
        constraint: "Manual system relief",
        affectedBuses: ["A", "B", "C"],
        actionType: "MANUAL_RELIEF",
        scenarioKind: "manual_relief",
        imbalanceBasis: "Operator-defined relief request.",
        imbalanceFormula: `Manual request = ${requiredReliefMw} MW`,
        detectedCondition: "Operator meminta relief MW tanpa contingency spesifik.",
        operatorMessage: "Mode manual hanya untuk latihan optimasi target. Untuk uji compliance, gunakan scenario event seperti Split Bus, Derate, OLS, OGS, atau Frequency Injection.",
        steps: [
          "Menerima input relief manual dari operator.",
          "Mencari load yang masih closed dan eligible.",
          "Membandingkan kombinasi berdasarkan prioritas, overshed, dan jumlah CB.",
          "Menampilkan target arming tanpa mengeksekusi trip otomatis."
        ],
        passCriteria: [
          "Target memenuhi MW request.",
          "Overshed minimum.",
          "Beban prioritas rendah dipilih lebih dulu."
        ],
        explanation: "Operator memasukkan kebutuhan relief manual. ADS memilih kombinasi dengan overshed kecil, operasi CB sedikit, dan prioritas beban paling rendah."
      })
    });
  },
  runTimedScenario: async (kind, value) => {
    if (get().scenarioRun?.active) return;

    const title = scenarioTitle(kind);
    set({
      scenarioRun: {
        active: true,
        title,
        step: 0,
        total: 2,
        message: "Preparing timed scenario. This uses the same application command path as operator actions.",
      },
      eventLog: [`Scenario started: ${title}. Step timing ${sequenceDelayMs / 1000}s.`, ...get().eventLog].slice(0, 120),
    });

    await wait();

    set({
      scenarioRun: {
        active: true,
        title,
        step: 1,
        total: 2,
        message:
          kind === "topology_split"
            ? "Operator action: open Bus B coupler."
            : kind === "frequency_islanding"
              ? `Parameter action: inject ${(value ?? 48.25).toFixed(2)} Hz.`
              : "Scenario action: apply system event and rebuild Trip Matrix.",
      },
    });

    if (kind === "topology_split") {
      if (get().objectStates.LINE_COUPLER !== "open") get().toggleObject("LINE_COUPLER");
    } else {
      get().injectScenario(kind, value);
    }

    await wait();

    set({
      scenarioRun: {
        active: false,
        title,
        step: 2,
        total: 2,
        message: "Scenario complete. Review Power Flow cards, Trip Matrix, and Event Log.",
      },
      eventLog: [`Scenario complete: ${title}.`, ...get().eventLog].slice(0, 120),
    });
  },
  runBlackstartSequence: async () => {
    if (get().scenarioRun?.active) return;

    const title = "Blackstart Learning Sequence";

    /**
     * Source-first restoration philosophy:
     * - All blackout opens every load, source, line, coupler, and IBT first.
     * - Local generator sources are closed first, but dispatch stays load-following.
     * - The empty network/tie path is energized before any B-area pickup.
     * - Loads are restored one feeder at a time after the source/tie path is ready.
     * - IBTs/grid support are synchronized near the end only after the island is stable.
     *
     * Important: each step is applied through a restoration-close operation, not
     * through contingency execution. This keeps blackstart from accidentally using
     * TripMatrix remedial action as if the user had created a fault.
     */
    const blackstartSteps: Array<{ label: string; objectId?: string; message: string; optional?: boolean }> = [
      { label: "Total blackout", message: "All controllable breakers opened. Loads stay disconnected so bus energization does not pick up hidden load blocks." },

      { label: "Start GEN A1", objectId: "GEN_A1", message: "Close the first blackstart-capable local source. The unit is online/available; dispatch remains load-following." },
      { label: "Synchronize GEN A2", objectId: "GEN_A2", message: "Close the second A-area source before restoring A and B load blocks." },
      { label: "Start GEN C1", objectId: "GEN_C1", message: "Close the first C-area source while all C loads remain open." },
      { label: "Synchronize GEN C2", objectId: "GEN_C2", message: "Close the second C-area source. Sources are ready before load pickup." },

      { label: "Energize Line A-B", objectId: "LINE_AB", message: "Energize the A-B path with B loads still open. Bus energization is not load pickup." },
      { label: "Close Bus B coupler", objectId: "LINE_COUPLER", message: "Tie B bus sections while all B feeders remain open." },
      { label: "Energize Line B-C", objectId: "LINE_BC", message: "Create a parallel A/B/C restoration path before B load pickup." },
      { label: "Energize Line A-C", objectId: "LINE_AC", message: "Complete the source-backed ring before adding larger load blocks." },

      { label: "Pick up LOAD A5", objectId: "LOAD_A5", message: "Restore small A essential load." },
      { label: "Pick up LOAD B5", objectId: "LOAD_B5", message: "Restore small B load after the B bus is energized." },
      { label: "Pick up LOAD C5", objectId: "LOAD_C5", message: "Restore small C load after local C sources are online." },
      { label: "Pick up LOAD B4", objectId: "LOAD_B4", message: "Continue staged B restoration." },
      { label: "Pick up LOAD A4", objectId: "LOAD_A4", message: "Continue staged A restoration." },
      { label: "Pick up LOAD C4", objectId: "LOAD_C4", message: "Continue staged C restoration." },
      { label: "Pick up LOAD B3", objectId: "LOAD_B3", message: "Restore medium B load after the parallel network is established." },
      { label: "Pick up LOAD C3", objectId: "LOAD_C3", message: "Restore medium C load." },
      { label: "Pick up LOAD A2", objectId: "LOAD_A2", message: "Restore medium A load." },
      { label: "Pick up LOAD C2", objectId: "LOAD_C2", message: "Restore additional C load." },
      { label: "Pick up LOAD A1", objectId: "LOAD_A1", message: "Restore additional A load." },
      { label: "Pick up LOAD B2", objectId: "LOAD_B2", message: "Restore B2 load after both B sections are tied." },
      { label: "Pick up LOAD B1", objectId: "LOAD_B1", message: "Restore the largest B block only after the ring is already carrying flow." },
      { label: "Pick up LOAD A3", objectId: "LOAD_A3", message: "Restore the remaining A load." },
      { label: "Pick up LOAD C1", objectId: "LOAD_C1", message: "Restore the remaining C load." },

      { label: "Synchronize IBT A", objectId: "IBT_A", optional: true, message: "Return Grid/IBT A support only after the local restoration island is stable." },
      { label: "Synchronize IBT C", objectId: "IBT_C", optional: true, message: "Return Grid/IBT C support and validate final flow." },
    ];

    const makeClosedState = (
      feeders: Feeder[],
      objectStates: Record<string, BreakerState>,
      objectId: string,
    ): { feeders: Feeder[]; objectStates: Record<string, BreakerState> } => {
      const isLoad = feeders.some((feeder) => feeder.id === objectId);
      const nextStates = { ...objectStates, [objectId]: "closed" as BreakerState };
      const nextFeeders = isLoad
        ? feeders.map((feeder) =>
            feeder.id === objectId ? { ...feeder, breakerState: "closed" as BreakerState } : feeder,
          )
        : feeders;
      return {
        feeders: nextFeeders,
        objectStates: {
          ...nextStates,
          ...Object.fromEntries(nextFeeders.map((feeder) => [feeder.id, feeder.breakerState])),
        },
      };
    };

    const buildBlackstartMatrix = (
      feeders: Feeder[],
      objectStates: Record<string, BreakerState>,
    ): { matrix: TripMatrix; dispatchMw: number; restoredLoadMw: number; onlineSourceMw: number } => {
      const dispatchMw = blackstartDispatchTargetMw(feeders, objectStates);
      const restoredLoadMw = closedLoadMw(feeders);
      const onlineSourceMw = closedSourceCapacityMw(objectStates);
      return {
        dispatchMw,
        restoredLoadMw,
        onlineSourceMw,
        matrix: buildMatrix(
          feeders,
          objectStates,
          get().contingencyRules,
          dispatchMw,
          0,
          get().frequencyHz,
        ),
      };
    };

    const validateCandidate = (
      label: string,
      feeders: Feeder[],
      objectStates: Record<string, BreakerState>,
    ): { safe: boolean; message: string; matrix: TripMatrix; dispatchMw: number; restoredLoadMw: number; onlineSourceMw: number } => {
      const result = buildBlackstartMatrix(feeders, objectStates);
      const worst = result.matrix.powerFlow.overloadedBranches[0];
      if (worst) {
        return {
          ...result,
          safe: false,
          message: `${label} forecast blocked: ${worst.branchId} would load ${worst.loadingPct.toFixed(1)}% (${worst.absFlowMw} MW).`,
        };
      }
      return {
        ...result,
        safe: true,
        message: `${label} forecast safe. Restored load ${result.restoredLoadMw} MW, dispatch target ${result.dispatchMw} MW, online capacity ${result.onlineSourceMw} MW.`,
      };
    };

    const openFeeders = get().feeders.map((feeder) => ({ ...feeder, breakerState: "open" as BreakerState }));
    const openStates = buildObjectStates(openFeeders);
    for (const id of equipmentIds) openStates[id] = "open";
    for (const feeder of openFeeders) openStates[feeder.id] = "open";

    const blackoutMatrix = buildMatrix(
      openFeeders,
      openStates,
      get().contingencyRules,
      0,
      0,
      get().frequencyHz,
    );

    set({
      feeders: openFeeders,
      objectStates: openStates,
      ...matrixState(blackoutMatrix),
      decision: blackoutMatrix.baseDecision,
      sourceMw: 0,
      minReserveMw: 0,
      requiredReliefMw: 0,
      hoverDecision: null,
      hoverObjectId: null,
      activeContingencyId: null,
      scenarioRun: {
        active: true,
        title,
        step: 0,
        total: blackstartSteps.length - 1,
        message: blackstartSteps[0].message,
      },
      eventLog: [
        "Blackstart: all load feeders, generators, lines, couplers, and IBTs opened. Hidden load pickup is prevented.",
        ...get().eventLog,
      ].slice(0, 120),
    });

    await wait();

    for (let index = 1; index < blackstartSteps.length; index += 1) {
      const step = blackstartSteps[index];
      const current = get();

      set({
        scenarioRun: {
          active: true,
          title,
          step: index,
          total: blackstartSteps.length - 1,
          message: `${step.label}: ${step.message}`,
        },
        eventLog: [`Blackstart step ${index}: ${step.label}.`, ...current.eventLog].slice(0, 120),
      });

      let feeders = current.feeders;
      let objectStates = current.objectStates;
      let matrix = current.tripMatrix;
      let dispatchMw = current.sourceMw;
      let restoredLoadMw = closedLoadMw(feeders);
      let onlineSourceMw = closedSourceCapacityMw(objectStates);

      if (step.objectId) {
        if (objectStates[step.objectId] !== "closed") {
          const candidate = makeClosedState(feeders, objectStates, step.objectId);
          const forecast = validateCandidate(step.label, candidate.feeders, candidate.objectStates);

          if (!forecast.safe) {
            set({
              scenarioRun: {
                active: false,
                title: "Blackstart paused",
                step: index,
                total: blackstartSteps.length - 1,
                message: `${forecast.message} Restoration should not continue until this step is changed.`,
              },
              ...matrixState(forecast.matrix),
              decision: forecast.matrix.baseDecision,
              sourceMw: forecast.dispatchMw,
              minReserveMw: 0,
              hoverDecision: null,
              hoverObjectId: null,
              eventLog: [
                `Blackstart paused before applying ${step.label}: ${forecast.message}`,
                ...get().eventLog,
              ].slice(0, 120),
            });
            return;
          }

          feeders = candidate.feeders;
          objectStates = candidate.objectStates;
          matrix = forecast.matrix;
          dispatchMw = forecast.dispatchMw;
          restoredLoadMw = forecast.restoredLoadMw;
          onlineSourceMw = forecast.onlineSourceMw;
        } else {
          const state = buildBlackstartMatrix(feeders, objectStates);
          matrix = state.matrix;
          dispatchMw = state.dispatchMw;
          restoredLoadMw = state.restoredLoadMw;
          onlineSourceMw = state.onlineSourceMw;
        }
      }

      set({
        feeders,
        objectStates,
        ...matrixState(matrix),
        decision: matrix.baseDecision,
        sourceMw: dispatchMw,
        minReserveMw: 0,
        hoverDecision: null,
        hoverObjectId: null,
        activeContingencyId: null,
        eventLog: [
          `Blackstart applied: ${step.label}. Restored load ${restoredLoadMw} MW, dispatch ${dispatchMw} MW, online source capacity ${onlineSourceMw} MW.`,
          ...get().eventLog,
        ].slice(0, 120),
      });

      await wait();
    }

    const final = get();
    const finalMatrixState = buildBlackstartMatrix(final.feeders, final.objectStates);
    const finalWorst = finalMatrixState.matrix.powerFlow.overloadedBranches[0];
    const finalLoad = closedLoadMw(final.feeders);
    const restoredFeeders = final.feeders.filter((feeder) => feeder.breakerState === "closed").length;

    set({
      ...matrixState(finalMatrixState.matrix),
      decision: finalMatrixState.matrix.baseDecision,
      sourceMw: finalMatrixState.dispatchMw,
      minReserveMw: 0,
      scenarioRun: {
        active: false,
        title: finalWorst ? "Blackstart completed with warning" : "Blackstart complete",
        step: blackstartSteps.length - 1,
        total: blackstartSteps.length - 1,
        message: finalWorst
          ? `${finalWorst.branchId} still loads ${finalWorst.loadingPct.toFixed(1)}%. Review restoration path before declaring normal service.`
          : `Source-first blackstart complete. ${restoredFeeders} feeders restored, total load ${finalLoad} MW, no branch above 110%.`,
      },
      eventLog: [
        finalWorst
          ? `Blackstart completed with warning: ${finalWorst.branchId} loading ${finalWorst.loadingPct.toFixed(1)}%.`
          : `Blackstart complete: restored ${restoredFeeders} feeders, load ${finalLoad} MW, no active overload.`,
        ...get().eventLog,
      ].slice(0, 120),
    });
  },
  injectScenario: (kind, value) => {
    const current = get();
    const baseFeeders = current.feeders;
    const objectStates = { ...current.objectStates };
    let feeders = baseFeeders;
    let sourceMw = current.sourceMw;
    let frequencyHz = current.frequencyHz;
    let requiredReliefMw = current.requiredReliefMw;
    let decision: AdsDecision;
    const events: string[] = [];

    const executeLoadDecision = (input: AdsDecision) => {
      if (!input.selected) return input;
      const selectedIds = new Set(input.selected.feeders.map((feeder) => feeder.id));
      feeders = feeders.map((feeder) =>
        selectedIds.has(feeder.id) ? { ...feeder, breakerState: "open" as BreakerState } : feeder
      );
      for (const feeder of input.selected.feeders) {
        objectStates[feeder.id] = "open";
        events.push(`ADS trip command: ${feeder.id} opened for ${input.constraint}.`);
      }
      return { ...input, status: "executed" as const, mode: "LIVE ADS EXECUTION" };
    };

    if (kind === "topology_split") {
      requiredReliefMw = 72;
      objectStates.LINE_COUPLER = "open";
      events.push("Topology event injected: Bus B coupler opened, Bus B constrained/island candidate.");
      decision = executeLoadDecision(rankShedding(feeders, requiredReliefMw, {
        title: "Split Bus B Topology Event",
        mode: "TOPOLOGY-BASED ADS",
        constraint: "Bus B split / coupler open",
        affectedBuses: ["B"],
        actionType: "ISLAND_BALANCING",
        scenarioKind: "topology_split",
        imbalanceBasis: "Bus B split membuat area lokal kekurangan keseimbangan/transfer margin.",
        imbalanceFormula: "Required action = estimated local imbalance 72 MW",
        detectedCondition: "Topology split detected. ADS treats Bus B as a constrained electrical area, not just an open CB.",
        operatorMessage: "Bus B dipisah. ADS menghitung ulang area lokal lalu memilih load B terlebih dahulu agar area baru tetap balance.",
        steps: [
          "Membaca status coupler Bus B menjadi open.",
          "Mengelompokkan load dan source berdasarkan area Bus B.",
          "Mengecek imbalance/overload lokal setelah split.",
          "Memilih target trip di area relevan dengan lost MW minimum."
        ],
        passCriteria: [
          "Area Bus B dikenali sebagai area terdampak.",
          "Target remote dihindari bila load Bus B cukup.",
          "Relief cukup tanpa overshed berlebihan."
        ],
        explanation: "Split Bus B adalah event topologi. ADS membaca perubahan konektivitas, melokalisasi dampak ke Bus B, lalu menjalankan balancing/OLS lokal bila area baru membutuhkan relief."
      }));
    } else if (kind === "generation_derate") {
      requiredReliefMw = 118;
      sourceMw = Math.max(0, 625 - requiredReliefMw);
      events.push("Generation event injected: KIT C2 derated from 250 MW to 132 MW.");
      decision = executeLoadDecision(rankShedding(feeders, requiredReliefMw, {
        title: "Derate KIT C2",
        mode: "GENERATION DEFICIT ADS",
        constraint: "KIT C2 output reduction",
        affectedBuses: ["C", "B"],
        actionType: "DEFICIT_LOAD_SHEDDING",
        scenarioKind: "generation_derate",
        imbalanceBasis: "KIT C2 turun dari 250 MW ke 132 MW sehingga supply berkurang.",
        imbalanceFormula: "Required action = 250 - 132 = 118 MW deficit",
        detectedCondition: "Generation derating detected at KIT C2. Reserve margin turun dan defisit aktif dihitung ulang.",
        operatorMessage: "KIT C2 kehilangan 118 MW. ADS memilih load shedding C/B dengan kombinasi paling dekat, bukan melepas semua group secara buta.",
        steps: [
          "Membaca MW KIT C2 turun dari nilai normal.",
          "Menghitung lost generation dan reserve margin baru.",
          "Menentukan area C/B sebagai area paling terdampak.",
          "Memilih load shedding minimum yang memenuhi defisit."
        ],
        passCriteria: [
          "Selisih MW derate dihitung.",
          "Load prioritas rendah dipilih lebih dulu.",
          "Total shed mendekati kebutuhan tanpa overshed besar."
        ],
        explanation: "Derating pembangkit diperlakukan sebagai defisit pembangkitan. ADS menghitung MW yang hilang, update reserve, lalu memilih load C/B sesuai prioritas dan minimum lost MW."
      }));
    } else if (kind === "frequency_islanding") {
      frequencyHz = value ?? 48.25;
      const zone = frequencyHz <= 48.3
        ? "Islanding frequency zone"
        : frequencyHz < 49
          ? "UFLS coordination zone"
          : "Normal frequency zone";
      requiredReliefMw = frequencyHz <= 48.3 ? 96 : frequencyHz < 49 ? 54 : 0;
      events.push(`Frequency injection: ${frequencyHz.toFixed(2)} Hz, ${zone}.`);
      decision = executeLoadDecision(rankShedding(feeders, requiredReliefMw, {
        title: "Frequency Injection",
        mode: "PARAMETER-BASED ISLAND ADS",
        constraint: zone,
        affectedBuses: ["A", "B", "C"],
        actionType: "ISLAND_BALANCING",
        scenarioKind: "frequency_islanding",
        frequencyHz,
        frequencyZone: zone,
        imbalanceBasis: frequencyHz <= 48.3
          ? "Frekuensi islanding berarti pembangkitan tidak cukup mengikuti beban aktual."
          : "Frekuensi berada di zona UFLS, ADS menyiapkan relief koordinasi.",
        imbalanceFormula: requiredReliefMw > 0
          ? `Required action = frequency-stage target ${requiredReliefMw} MW`
          : "Required action = 0 MW, frequency normal",
        detectedCondition: `${frequencyHz.toFixed(2)} Hz detected. ADS checks UFLS coordination and island arming target.`,
        operatorMessage: frequencyHz <= 48.3
          ? "Frekuensi sudah masuk zona islanding. ADS tidak memakai target lama; beban yang masih closed dihitung ulang sebelum arming/trip."
          : "Frekuensi masih di zona koordinasi UFLS. ADS menyiapkan target dan menunggu batas islanding.",
        steps: [
          "Membaca frekuensi aktual dari injection.",
          "Mengklasifikasikan zona normal, UFLS, atau islanding.",
          "Mengabaikan load yang sudah open/trip dari kandidat baru.",
          "Menghitung target island balancing terbaru."
        ],
        passCriteria: [
          "Zona UFLS/islanding dikenali.",
          "Target lama tidak dipakai setelah load berubah.",
          "Balance island diarahkan ke kisaran 95-105% beban."
        ],
        explanation: "Frequency Injection adalah event parameter-based. ADS membaca penurunan frekuensi, mengoordinasikan UFLS, lalu menyiapkan island operation saat mendekati 48.3 Hz."
      }));
    } else if (kind === "ols_overload") {
      requiredReliefMw = 124;
      events.push("OLS event injected: IBT C overload, load-side relief required.");
      decision = executeLoadDecision(rankShedding(feeders, requiredReliefMw, {
        title: "OLS - IBT C Overload",
        mode: "OVER LOAD SHEDDING",
        constraint: "IBT C loading above limit",
        affectedBuses: ["C"],
        actionType: "OLS_LOAD_SHEDDING",
        scenarioKind: "ols_overload",
        imbalanceBasis: "IBT C membawa arus/transfer di atas limit aman.",
        imbalanceFormula: "Required action = estimated overload relief 124 MW",
        detectedCondition: "Overload terdeteksi pada IBT C. Relief efektif berasal dari load Bus C terlebih dahulu.",
        operatorMessage: "OLS melepas beban, bukan generator. Tujuannya menurunkan arus/transfer pada equipment yang overload.",
        steps: [
          "Membaca loading IBT C melewati limit.",
          "Mengubah overload menjadi kebutuhan relief MW.",
          "Memprioritaskan load Bus C karena efeknya langsung.",
          "Mengirim trip command hingga loading kembali aman."
        ],
        passCriteria: [
          "Constraint overload jelas.",
          "Target berada di area yang menurunkan arus constraint.",
          "Loading akhir kembali di bawah limit."
        ],
        explanation: "OLS digunakan saat line/IBT/trafo overload. ADS memilih load di area yang paling langsung menurunkan arus constraint, dengan overshed sekecil mungkin."
      }));
    } else {
      feeders = initialFeeders.map((feeder) => ({ ...feeder, breakerState: "closed" as BreakerState }));
      for (const [id, state] of Object.entries(buildObjectStates(feeders))) {
        objectStates[id] = state;
      }
      objectStates.LINE_AC = "open";
      objectStates.LINE_BC = "open";

      const islandGenerationMw = 310;
      const islandLoadMw = 164;
      const maxAllowedGenerationMw = islandLoadMw * 1.05;
      requiredReliefMw = Math.ceil(islandGenerationMw - maxAllowedGenerationMw);
      sourceMw = islandGenerationMw;
      events.push("OGS scenario injected: Bus C island formed by opening Line A-C and Line B-C.");
      events.push(`Island balance check: Pgen ${islandGenerationMw} MW, Pload ${islandLoadMw} MW, upper limit ${maxAllowedGenerationMw.toFixed(1)} MW.`);
      decision = rankGenerationShedding(requiredReliefMw, {
        title: "OGS - Island Surplus Generation",
        mode: "OVER GENERATION SHEDDING",
        constraint: "Generation exceeds island demand",
        affectedBuses: ["C"],
        actionType: "OGS_GENERATOR_SHEDDING",
        scenarioKind: "ogs_surplus",
        islandGenerationMw,
        islandLoadMw,
        imbalanceBasis: "Pgen island lebih besar dari batas atas 105% Pload.",
        imbalanceFormula: `Required gen trip >= ${islandGenerationMw} - (1.05 x ${islandLoadMw}) = ${requiredReliefMw} MW`,
        detectedCondition: `Bus C island surplus: Pgen ${islandGenerationMw} MW, Pload ${islandLoadMw} MW, ratio ${((islandGenerationMw / islandLoadMw) * 100).toFixed(1)}%.`,
        operatorMessage: `Bus C island surplus. Pgen ${islandGenerationMw} MW terhadap Pload ${islandLoadMw} MW terlalu tinggi; ADS mencari generator trip yang membuat final balance 95-105%.`,
        steps: [
          "Membentuk island Bus C dengan membuka Line A-C dan Line B-C.",
          "Menghitung Pgen island 310 MW dan Pload island 164 MW.",
          "Mengecek threshold OGS: Pgen harus maksimum 105% Pload.",
          "Memilih generator trip yang membuat ratio akhir paling dekat 100%."
        ],
        passCriteria: [
          "Target adalah generator, bukan load.",
          "KIT C2 trip 145 MW membuat final Pgen 165 MW.",
          "Final ratio 165/164 = 100.6%, masuk 95-105%."
        ],
        explanation: "OGS digunakan saat pembangkitan island lebih besar dari beban. ADS memilih trip generator paling sesuai agar island tidak mengalami overfrequency."
      });
      if (decision.selectedGeneration) {
        objectStates[decision.selectedGeneration.id] = "open";
        events.push(`ADS generator command: ${decision.selectedGeneration.name} ${decision.selectedGeneration.action} for ${decision.constraint}.`);
        if (decision.balanceRatioPct !== undefined && decision.generationAfterMw !== undefined) {
          events.push(`Final island balance: Pgen ${decision.generationAfterMw} MW, Pload ${islandLoadMw} MW, ratio ${decision.balanceRatioPct.toFixed(1)}%. PASS.`);
        }
        decision = { ...decision, status: "executed", mode: "LIVE ADS EXECUTION" };
      }
    }

    const finalObjectStates = {
      ...objectStates,
      ...Object.fromEntries(feeders.map((feeder) => [feeder.id, feeder.breakerState]))
    };
    const tripMatrix = buildMatrix(
      feeders,
      finalObjectStates,
      current.contingencyRules,
      sourceMw,
      current.minReserveMw,
      frequencyHz
    );

    set({
      feeders,
      objectStates: finalObjectStates,
      ...matrixState(tripMatrix),
      sourceMw,
      frequencyHz,
      requiredReliefMw,
      // Live/base decision always comes from the rebuilt Trip Matrix.
      // Executed/hover preview is not latched here; hover uses hoverDecision only.
      decision: tripMatrix.baseDecision,
      hoverDecision: null,
      hoverObjectId: null,
      activeContingencyId: kind === "topology_split" ? "LINE_COUPLER" : null,
      eventLog: [...events, ...get().eventLog].slice(0, 120)
    });
  },
  updateFeeder: (id, patch) => {
    const nextPatch: Partial<Pick<Feeder, "mw" | "priority" | "group" | "shedEligible">> = {};
    if (patch.mw !== undefined) nextPatch.mw = Math.max(0, Math.round(patch.mw));
    if (patch.priority !== undefined) nextPatch.priority = Math.max(1, Math.min(5, Math.round(patch.priority)));
    if (patch.group !== undefined) nextPatch.group = Math.max(1, Math.min(4, Math.round(patch.group))) as LoadGroup;
    if (patch.shedEligible !== undefined) nextPatch.shedEligible = patch.shedEligible;

    const feeders = get().feeders.map((feeder) =>
      feeder.id === id ? { ...feeder, ...nextPatch } : feeder
    );
    const objectStates = {
      ...get().objectStates,
      ...Object.fromEntries(feeders.map((feeder) => [feeder.id, feeder.breakerState]))
    };
    const scopedRules = contextualRulesForTopology(get().contingencyRules, objectStates);
    const tripMatrix = buildMatrix(feeders, objectStates, scopedRules, get().sourceMw, get().minReserveMw, get().frequencyHz);
    const hoverRow = get().hoverObjectId ? tripMatrix.rows[get().hoverObjectId] : undefined;

    set({
      feeders,
      objectStates,
      ...matrixState(tripMatrix),
      decision: tripMatrix.baseDecision,
      hoverDecision: hoverRow?.snapshotHash === tripMatrix.snapshotHash ? hoverRow.decision : null
    });
  },
  updateContingency: (id, patch) => {
    const currentRule = get().contingencyRules[id];
    if (!currentRule) return;
    const contingencyRules = {
      ...get().contingencyRules,
      [id]: {
        ...currentRule,
        ...patch,
        requiredReliefMw: patch.requiredReliefMw === undefined
          ? currentRule.requiredReliefMw
          : Math.max(0, Math.round(patch.requiredReliefMw))
      }
    };
    const feeders = get().feeders;
    const scopedRules = contextualRulesForTopology(contingencyRules, get().objectStates);
    const tripMatrix = buildMatrix(feeders, get().objectStates, scopedRules, get().sourceMw, get().minReserveMw, get().frequencyHz);
    const hoverRow = get().hoverObjectId ? tripMatrix.rows[get().hoverObjectId] : undefined;

    set({
      contingencyRules,
      ...matrixState(tripMatrix),
      hoverDecision: hoverRow?.snapshotHash === tripMatrix.snapshotHash ? hoverRow.decision : null
    });
  },
  setReserveConfig: (patch) => {
    const sourceMw = patch.sourceMw === undefined ? get().sourceMw : Math.max(0, Math.round(patch.sourceMw));
    const minReserveMw = patch.minReserveMw === undefined ? get().minReserveMw : Math.max(0, Math.round(patch.minReserveMw));
    const tripMatrix = buildMatrix(
      get().feeders,
      get().objectStates,
      get().contingencyRules,
      sourceMw,
      minReserveMw,
      get().frequencyHz
    );
    set({
      sourceMw,
      minReserveMw,
      ...matrixState(tripMatrix)
    });
  },
  toggleObject: (objectId) => {
    const currentStore = get();
    const currentState = currentStore.objectStates[objectId] ?? "closed";
    const nextState: BreakerState = currentState === "closed" ? "open" : "closed";
    const isLoad = currentStore.feeders.some((feeder) => feeder.id === objectId);
    const eventItems: string[] = [];

    // Operator load operation is always manual. It must never execute ADS targets.
    if (isLoad) {
      let feeders = currentStore.feeders.map((feeder) =>
        feeder.id === objectId ? { ...feeder, breakerState: nextState } : feeder
      );
      let objectStates = {
        ...currentStore.objectStates,
        [objectId]: nextState,
      };
      const isolated = applyDeadBusIsolation(currentStore.objectStates, feeders, objectStates);
      feeders = isolated.feeders;
      objectStates = isolated.objectStates;

      const rules = contextualRulesForTopology(currentStore.contingencyRules, objectStates);
      const tripMatrix = buildMatrix(
        feeders,
        objectStates,
        rules,
        currentStore.sourceMw,
        currentStore.minReserveMw,
        currentStore.frequencyHz,
      );
      const hoverRow = currentStore.hoverObjectId ? tripMatrix.rows[currentStore.hoverObjectId] : undefined;

      set({
        feeders,
        objectStates,
        ...matrixState(tripMatrix),
        decision: tripMatrix.baseDecision,
        hoverDecision: hoverRow?.snapshotHash === tripMatrix.snapshotHash ? hoverRow.decision : null,
        activeContingencyId: Object.keys(objectStates).find((id) => isContingencyObject(id, rules) && objectStates[id] === "open") ?? null,
        eventLog: [`Manual load toggle: ${objectId} ${nextState}.`, ...isolated.events, ...currentStore.eventLog].slice(0, 120),
      });
      return;
    }

    const row = currentStore.tripMatrix.rows[objectId];
    debugTripMatrixContext("CLICK PRE-EVENT ROW", row, currentStore.tripMatrix);
    const rowIsFresh = Boolean(row && row.snapshotHash === currentStore.snapshotHash);
    const isContingencyTrigger = isContingencyObject(objectId, currentStore.contingencyRules);

    let feeders = currentStore.feeders;
    let objectStates = { ...currentStore.objectStates };
    let decision: AdsDecision = currentStore.decision;

    if (nextState === "open" && isContingencyTrigger) {
      if (!rowIsFresh || !row) {
        objectStates[objectId] = nextState;
        decision = {
          status: "blocked",
          requiredReliefMw: 0,
          actionType: "ISLAND_BALANCING",
          title: "Stale Trip Matrix",
          mode: "LIVE ADS EXECUTION",
          constraint: "Matrix snapshot mismatch",
          explanation: "ADS menolak eksekusi karena Trip Matrix tidak cocok dengan snapshot sistem saat click.",
          operatorMessage: "Matrix stale. Rebuild matrix sebelum mengirim command trip.",
          alternatives: [],
          rejected: [],
        };
        eventItems.push(`Trip matrix stale: trigger=${objectId}, currentSnapshot=${currentStore.snapshotHash}.`);
      } else if (row.status === "armed") {
        const applied = executeTripMatrixRowState(row, currentStore.feeders, currentStore.objectStates);
        feeders = applied.feeders;
        objectStates = applied.objectStates;
        decision = { ...row.decision, status: "executed", mode: "LIVE ADS EXECUTION" };
        eventItems.push(
          `Trip matrix executed: trigger=${objectId}, snapshot=${row.snapshotHash}, targets=${row.selectedTargets.join(", ") || "none"}.`,
          ...applied.events,
          `Trip matrix applied targets: ${applied.appliedTargets.join(", ") || "none"}.`,
        );
      } else {
        objectStates[objectId] = nextState;
        decision = { ...row.decision, mode: "LIVE ADS EXECUTION" };
        eventItems.push(`Trip matrix row not armed: trigger=${objectId}, status=${row.status}. Trigger opened only.`);
      }
    } else {
      // Manual network operation / reclose. Do not execute ADS targets.
      objectStates[objectId] = nextState;
      decision = currentStore.decision.status === "executed"
        ? currentStore.decision
        : rankShedding(feeders, 0);
      eventItems.push(`Manual network toggle: ${objectId} ${nextState}.`);
    }

    const isolated = applyDeadBusIsolation(currentStore.objectStates, feeders, objectStates);
    feeders = isolated.feeders;
    objectStates = isolated.objectStates;
    if (isolated.events.length) eventItems.push(...isolated.events);

    const rules = contextualRulesForTopology(currentStore.contingencyRules, objectStates);
    const tripMatrix = buildMatrix(
      feeders,
      objectStates,
      rules,
      currentStore.sourceMw,
      currentStore.minReserveMw,
      currentStore.frequencyHz,
    );

    set({
      feeders,
      objectStates,
      ...matrixState(tripMatrix),
      // Live/base decision always comes from the rebuilt Trip Matrix.
      // Executed/hover preview is not latched here; hover uses hoverDecision only.
      decision: tripMatrix.baseDecision,
      hoverDecision: null,
      activeContingencyId: Object.keys(objectStates).find((id) => isContingencyObject(id, rules) && objectStates[id] === "open") ?? null,
      eventLog: eventItems.length
        ? [...eventItems, ...currentStore.eventLog].slice(0, 120)
        : [`${objectId} ${nextState}.`, ...currentStore.eventLog].slice(0, 120),
    });
  },
  setHoverObject: (hoverObjectId) => {
    if (get().hoverObjectId === hoverObjectId) return;

    // Hover is a pure Trip Matrix preview. It never reads PowerFlowLite directly,
    // never uses legacy evaluator fallback, and never latches a live/base row.
    if (!hoverObjectId) {
      set({ hoverObjectId: null, hoverDecision: null });
      return;
    }

    const matrix = get().tripMatrix;
    const matrixRow = matrix.rows[hoverObjectId];
    debugTripMatrixContext("HOVER PREVIEW ROW", matrixRow, matrix);
    const matrixDecision =
      matrixRow?.snapshotHash === get().snapshotHash ? matrixRow.decision : null;

    set({
      hoverObjectId,
      hoverDecision: matrixDecision,
    });
  }

}));
