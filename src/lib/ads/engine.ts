import { rankShedding } from "./solver";
import type { AdsDecision, ContingencyRule, Feeder } from "./model";

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
      "Jika KIT A1 turun, defisit paling terasa di area A/B. ADS memilih load prioritas rendah sebelum beban kritikal.",
  },
  GEN_A2: {
    title: "KIT A2 Loss of Generation",
    mode: "HOVER PREVIEW",
    constraint: "Generation deficit A2",
    affectedBuses: ["A", "B"],
    requiredReliefMw: 74,
    explanation:
      "KIT A2 loss membutuhkan relief sedang di area A/B dengan overshed minimum.",
  },
  GEN_C1: {
    title: "KIT C1 Loss of Generation",
    mode: "HOVER PREVIEW",
    constraint: "Generation deficit C1",
    affectedBuses: ["C", "B"],
    requiredReliefMw: 90,
    explanation:
      "KIT C1 loss lebih aman ditangani oleh kombinasi C/B agar transfer dari area lain tidak membesar.",
  },
  GEN_C2: {
    title: "KIT C2 Loss of Generation",
    mode: "HOVER PREVIEW",
    constraint: "Generation deficit C2",
    affectedBuses: ["C", "B"],
    requiredReliefMw: 80,
    explanation:
      "KIT C2 derate/loss memerlukan shedding C/B yang cukup tanpa melepas beban terlalu banyak.",
  },
};

export function previewDecisionForObject(
  objectId: string | null,
  feeders: Feeder[],
  rules: Record<string, ContingencyRule> = initialContingencyRules,
): AdsDecision | null {
  if (!objectId) return null;
  if (feeders.some((feeder) => feeder.id === objectId)) return null;

  const rule = rules[objectId];
  if (!rule) return null;
  return rankShedding(feeders, rule.requiredReliefMw, rule);
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
    .map((id) => previewDecisionForObject(id, feeders, rules))
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
