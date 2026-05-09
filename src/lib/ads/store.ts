import { create } from "zustand";
import { initialFeeders } from "./initialSystem";
import { previewToggleWithEvaluator } from "./evaluator";
import { buildTripMatrixForState, initialContingencyRules, isContingencyObject, previewDecisionForObject } from "./engine";
import { rankGenerationShedding, rankShedding } from "./solver";
import type { AdsDecision, BreakerState, ContingencyRule, Feeder, LoadGroup, ScenarioKind, TripMatrix, TripMatrixRow } from "./model";

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
  reset: () => void;
  setRequiredReliefMw: (mw: number) => void;
  injectScenario: (kind: ScenarioKind, value?: number) => void;
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

function matrixState(matrix: TripMatrix): Pick<AdsStore, "tripMatrix" | "matrixVersion" | "snapshotHash"> {
  return {
    tripMatrix: matrix,
    matrixVersion: matrix.matrixVersion,
    snapshotHash: matrix.snapshotHash,
  };
}

function executeTripMatrixRowState(
  row: TripMatrixRow,
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>,
): { feeders: Feeder[]; objectStates: Record<string, BreakerState>; events: string[]; appliedTargets: string[] } {
  const nextStates = {
    ...objectStates,
    [row.triggerCommand.objectId]: "open" as BreakerState,
  };
  let nextFeeders = feeders;
  const events = [`Trip matrix trigger: ${row.triggerCommand.objectId} opened.`];
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

  const hypotheticalStates = {
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
  decision: rankShedding(initialFeeders, 0),
  hoverDecision: null,
  hoverObjectId: null,
  eventLog: [],
  activeContingencyId: null,
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
      decision: rankShedding(feeders, 0),
      hoverDecision: null,
      hoverObjectId: null,
      eventLog: ["System reset. All controllable breakers closed."],
      activeContingencyId: null
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
      decision,
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
      decision: get().decision.status === "executed" ? get().decision : rankShedding(feeders, 0),
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
      const feeders = currentStore.feeders.map((feeder) =>
        feeder.id === objectId ? { ...feeder, breakerState: nextState } : feeder
      );
      const objectStates = {
        ...currentStore.objectStates,
        [objectId]: nextState,
      };
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
        decision: currentStore.decision.status === "executed"
          ? currentStore.decision
          : rankShedding(feeders, 0),
        hoverDecision: hoverRow?.snapshotHash === tripMatrix.snapshotHash ? hoverRow.decision : null,
        activeContingencyId: Object.keys(objectStates).find((id) => isContingencyObject(id, rules) && objectStates[id] === "open") ?? null,
        eventLog: [`Manual load toggle: ${objectId} ${nextState}.`, ...currentStore.eventLog].slice(0, 120),
      });
      return;
    }

    const row = currentStore.tripMatrix.rows[objectId];
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
      decision,
      hoverDecision: null,
      activeContingencyId: Object.keys(objectStates).find((id) => isContingencyObject(id, rules) && objectStates[id] === "open") ?? null,
      eventLog: eventItems.length
        ? [...eventItems, ...currentStore.eventLog].slice(0, 120)
        : [`${objectId} ${nextState}.`, ...currentStore.eventLog].slice(0, 120),
    });
  },
  setHoverObject: (hoverObjectId) => {
    if (get().hoverObjectId === hoverObjectId) return;
    const matrixRow = hoverObjectId ? get().tripMatrix.rows[hoverObjectId] : undefined;
    const matrixDecision =
      matrixRow?.snapshotHash === get().snapshotHash ? matrixRow.decision : null;

    set({
      hoverObjectId,
      hoverDecision: matrixDecision,
    });
  }

}));
