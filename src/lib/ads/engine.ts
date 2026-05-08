import { rankShedding } from "./solver";
import { buildTripMatrix, tripMatrixRowToDecision } from "./matrixEngine";
import { buildSystemSnapshot } from "./snapshot";
import type { AdsDecision, BreakerState, ContingencyRule, Feeder, TripMatrix } from "./model";

const generatorGrossMw: Record<string, number> = {
  GEN_A1: 180,
  GEN_A2: 135,
  GEN_C1: 165,
  GEN_C2: 145,
};

export const initialContingencyRules: Record<string, ContingencyRule> = {
  IBT_A: {
    title: "IBT A Import Constraint",
    mode: "HOVER PREVIEW",
    constraint: "IBT A loading",
    affectedBuses: ["A"],
    requiredReliefMw: 72,
    explanation:
      "IBT A menanggung transfer ke bus A. Relief paling efektif adalah load bus A dengan prioritas rendah dan overshed kecil.",
  },
  IBT_C: {
    title: "IBT C Import Constraint",
    mode: "HOVER PREVIEW",
    constraint: "IBT C loading",
    affectedBuses: ["C"],
    requiredReliefMw: 124,
    explanation:
      "IBT C besar di sisi bus C. ADS mencari kombinasi load C terlebih dahulu sebelum mengambil load remote.",
  },
  LINE_AB: {
    title: "Line A-B Transfer Constraint",
    mode: "HOVER PREVIEW",
    constraint: "Line A-B",
    affectedBuses: ["A", "B"],
    requiredReliefMw: 88,
    explanation:
      "Line A-B mengikat area A dan B, sehingga load A/B diberi bobot relief lebih tinggi daripada load C.",
  },
  LINE_BC: {
    title: "Line B-C Transfer Constraint",
    mode: "HOVER PREVIEW",
    constraint: "Line B-C",
    affectedBuses: ["B", "C"],
    requiredReliefMw: 92,
    explanation:
      "Line B-C mengikat area B dan C. ADS menghindari shedding bus A jika kombinasi B/C masih cukup.",
  },
  LINE_AC: {
    title: "Line A-C Tie Constraint",
    mode: "HOVER PREVIEW",
    constraint: "Line A-C",
    affectedBuses: ["A", "C"],
    requiredReliefMw: 107,
    explanation:
      "Line A-C adalah tie utama antar area. Kombinasi A/C dinilai paling langsung untuk menurunkan transfer.",
  },
  LINE_COUPLER: {
    title: "Bus B Coupler Constraint",
    mode: "HOVER PREVIEW",
    constraint: "Bus B coupler",
    affectedBuses: ["B"],
    requiredReliefMw: 52,
    explanation:
      "Coupler bus B membuat beban B menjadi target paling efektif karena relief langsung menurunkan arus antar busbar.",
  },
  GEN_A1: {
    title: "KIT A1 Loss of Generation",
    mode: "HOVER PREVIEW",
    constraint: "Generation deficit A1",
    affectedBuses: ["A", "B"],
    requiredReliefMw: 95,
    explanation:
      "KIT A1 kehilangan output 180 MW, tetapi sebagian ditutup reserve/import support. ADS hanya mencari load shedding untuk sisa defisit 95 MW.",
  },
  GEN_A2: {
    title: "KIT A2 Loss of Generation",
    mode: "HOVER PREVIEW",
    constraint: "Generation deficit A2",
    affectedBuses: ["A", "B"],
    requiredReliefMw: 74,
    explanation:
      "KIT A2 kehilangan output 135 MW, tetapi action need setelah support adalah 74 MW dengan overshed minimum.",
  },
  GEN_C1: {
    title: "KIT C1 Loss of Generation",
    mode: "HOVER PREVIEW",
    constraint: "Generation deficit C1",
    affectedBuses: ["C", "B"],
    requiredReliefMw: 90,
    explanation:
      "KIT C1 kehilangan output 165 MW, tetapi reserve/import support menutup sebagian. ADS mencari kombinasi C/B untuk sisa defisit 90 MW.",
  },
  GEN_C2: {
    title: "KIT C2 Loss of Generation",
    mode: "HOVER PREVIEW",
    constraint: "Generation deficit C2",
    affectedBuses: ["C", "B"],
    requiredReliefMw: 80,
    explanation:
      "KIT C2 kehilangan output 145 MW, tetapi action need setelah support adalah 80 MW di area C/B.",
  },
};

export function previewDecisionForObject(
  objectId: string | null,
  feeders: Feeder[],
  rules: Record<string, ContingencyRule> = initialContingencyRules,
  objectStates?: Record<string, BreakerState>,
): AdsDecision | null {
  if (!objectId) return null;
  if (feeders.some((feeder) => feeder.id === objectId)) return null;

  const matrix = buildTripMatrixForState(feeders, objectStates ?? buildObjectStatesFromFeeders(feeders), rules);
  return tripMatrixRowToDecision(matrix.rows[objectId]);
}

export function buildTripMatrixForState(
  feeders: Feeder[],
  objectStates: Record<string, BreakerState>,
  rules: Record<string, ContingencyRule> = initialContingencyRules,
  sourceMw = 625,
  minReserveMw = 80,
  frequencyHz = 50,
): TripMatrix {
  return buildTripMatrix(
    buildSystemSnapshot({
      feeders,
      objectStates,
      contingencyRules: rules,
      sourceMw,
      minReserveMw,
      frequencyHz,
    }),
  );
}

function enrichRuleContext(objectId: string, rule: ContingencyRule): ContingencyRule {
  if (rule.actionType) return rule;

  if (objectId.startsWith("GEN_")) {
    const grossLossMw = generatorGrossMw[objectId] ?? rule.requiredReliefMw;
    const coveredMw = Math.max(0, grossLossMw - rule.requiredReliefMw);
    return {
      ...rule,
      actionType: "DEFICIT_LOAD_SHEDDING",
      scenarioKind: "generation_derate",
      imbalanceBasis: `${rule.title}: angka pada SLD adalah output generator ${grossLossMw} MW. ADS tidak selalu shed sebesar itu karena reserve/import support masih bisa menutup ${coveredMw} MW.`,
      imbalanceFormula: `Action need = gen loss ${grossLossMw} - covered ${coveredMw} = ${rule.requiredReliefMw} MW`,
    };
  }

  return {
    ...rule,
    actionType: "OLS_LOAD_SHEDDING",
    scenarioKind: "ols_overload",
    imbalanceBasis: `${rule.constraint} diperkirakan overload. Load di area ${rule.affectedBuses.join("/")} dipilih karena paling langsung menurunkan arus/transfer pada constraint ini.`,
    imbalanceFormula: `Required action = estimated overload relief ${rule.requiredReliefMw} MW`,
  };
}

export function isContingencyObject(
  objectId: string,
  rules: Record<string, ContingencyRule> = initialContingencyRules,
): boolean {
  return objectId in rules;
}

export function decisionForOpenContingencies(
  objectStates: Record<string, string>,
  feeders: Feeder[],
  rules: Record<string, ContingencyRule> = initialContingencyRules,
): AdsDecision | null {
  const openContingencies = Object.keys(rules).filter(
    (id) => objectStates[id] === "open",
  );
  if (openContingencies.length === 0) return null;

  const ranked = openContingencies
    .map((id) => previewDecisionForObject(id, feeders, rules, normalizeObjectStates(objectStates, feeders)))
    .filter((decision): decision is AdsDecision => Boolean(decision))
    .sort((left, right) => right.requiredReliefMw - left.requiredReliefMw);

  return ranked[0]
    ? {
        ...ranked[0],
        status: ranked[0].selected ? "executed" : "blocked",
        mode: "LIVE ADS EXECUTION",
      }
    : null;
}

function buildObjectStatesFromFeeders(feeders: Feeder[]): Record<string, BreakerState> {
  return Object.fromEntries([
    ...Object.keys(initialContingencyRules).map((id) => [id, "closed" as BreakerState]),
    ...feeders.map((feeder) => [feeder.id, feeder.breakerState]),
  ]);
}

function normalizeObjectStates(
  objectStates: Record<string, string>,
  feeders: Feeder[],
): Record<string, BreakerState> {
  return {
    ...buildObjectStatesFromFeeders(feeders),
    ...Object.fromEntries(
      Object.entries(objectStates).map(([id, state]) => [
        id,
        state === "open" || state === "failed" ? state : "closed",
      ]),
    ),
  };
}
