import type {
  AdsDecision,
  BusId,
  DefenseActionType,
  Feeder,
  GeneratorAction,
  ScenarioKind,
  SheddingCandidate,
} from "./model";

const maxCombinationSize = 4;

interface RankOptions {
  title?: string;
  mode?: string;
  constraint?: string;
  affectedBuses?: BusId[];
  strictAffectedBuses?: boolean;
  explanation?: string;
  actionType?: DefenseActionType;
  scenarioKind?: ScenarioKind;
  detectedCondition?: string;
  operatorMessage?: string;
  frequencyHz?: number;
  frequencyZone?: string;
  islandGenerationMw?: number;
  islandLoadMw?: number;
  imbalanceBasis?: string;
  imbalanceFormula?: string;
  steps?: string[];
  passCriteria?: string[];
  allowedGeneratorIds?: string[];
}

export function rankShedding(feeders: Feeder[], requiredReliefMw: number, options: RankOptions = {}): AdsDecision {
  if (requiredReliefMw <= 0) {
    return {
      status: "normal",
      requiredReliefMw: 0,
      actionType: options.actionType,
      scenarioKind: options.scenarioKind,
      title: options.title,
      mode: options.mode,
      affectedBuses: options.affectedBuses,
      strictAffectedBuses: options.strictAffectedBuses,
      constraint: options.constraint,
      explanation: options.explanation,
      detectedCondition: options.detectedCondition,
      operatorMessage: options.operatorMessage,
      frequencyHz: options.frequencyHz,
      frequencyZone: options.frequencyZone,
      imbalanceBasis: options.imbalanceBasis,
      imbalanceFormula: options.imbalanceFormula,
      steps: options.steps,
      passCriteria: options.passCriteria,
      alternatives: [],
      rejected: []
    };
  }

  const eligible = feeders.filter((feeder) => feeder.shedEligible && feeder.breakerState === "closed" && feeder.mw > 0);
  const affectedBuses = new Set(options.affectedBuses ?? []);
  const scopedEligible = options.strictAffectedBuses && affectedBuses.size > 0
    ? eligible.filter((feeder) => affectedBuses.has(feeder.bus))
    : eligible;
  const candidates = buildGroupedCandidates(scopedEligible, requiredReliefMw, options);
  const selected = candidates[0];

  return {
    status: selected ? "armed" : "blocked",
    requiredReliefMw,
    actionType: options.actionType,
    scenarioKind: options.scenarioKind,
    title: options.title,
    mode: options.mode,
    affectedBuses: options.affectedBuses,
    strictAffectedBuses: options.strictAffectedBuses,
    constraint: options.constraint,
    explanation: options.explanation,
    detectedCondition: options.detectedCondition,
    operatorMessage: options.operatorMessage,
    frequencyHz: options.frequencyHz,
    frequencyZone: options.frequencyZone,
    imbalanceBasis: options.imbalanceBasis,
    imbalanceFormula: options.imbalanceFormula,
    steps: options.steps,
    passCriteria: options.passCriteria,
    selected,
    alternatives: candidates.slice(1, 5),
    rejected: candidates.slice(5, 10)
  };
}

const generatorActions: GeneratorAction[] = [
  { id: "GEN_C2", name: "KIT C2 trip", bus: "C", mw: 145, priority: 1, action: "trip" },
  { id: "GEN_C1", name: "KIT C1 trip", bus: "C", mw: 165, priority: 2, action: "trip" },
  { id: "GEN_A2", name: "KIT A2 trip", bus: "A", mw: 135, priority: 3, action: "trip" },
  { id: "GEN_A1", name: "KIT A1 trip", bus: "A", mw: 180, priority: 4, action: "trip" },
];

export function rankGenerationShedding(requiredReliefMw: number, options: RankOptions = {}): AdsDecision {
  if (requiredReliefMw <= 0) {
    return rankShedding([], 0, options);
  }

  const affectedBuses = new Set(options.affectedBuses ?? []);
  const islandGenerationMw = options.islandGenerationMw;
  const islandLoadMw = options.islandLoadMw;
  const allowedGeneratorIds = options.allowedGeneratorIds ? new Set(options.allowedGeneratorIds) : null;
  const selectedGeneration = [...generatorActions]
    .filter((generator) => !allowedGeneratorIds || allowedGeneratorIds.has(generator.id))
    .filter((generator) => affectedBuses.size === 0 || affectedBuses.has(generator.bus))
    .sort((left, right) => {
      if (islandGenerationMw !== undefined && islandLoadMw !== undefined && islandLoadMw > 0) {
        const leftRatio = ((islandGenerationMw - left.mw) / islandLoadMw) * 100;
        const rightRatio = ((islandGenerationMw - right.mw) / islandLoadMw) * 100;
        const leftPass = leftRatio >= 95 && leftRatio <= 105 ? 0 : 1;
        const rightPass = rightRatio >= 95 && rightRatio <= 105 ? 0 : 1;
        return leftPass - rightPass || Math.abs(leftRatio - 100) - Math.abs(rightRatio - 100) || left.priority - right.priority;
      }
      const leftOvershed = Math.abs(left.mw - requiredReliefMw);
      const rightOvershed = Math.abs(right.mw - requiredReliefMw);
      return leftOvershed - rightOvershed || left.priority - right.priority;
    })[0];

  return {
    status: selectedGeneration ? "armed" : "blocked",
    requiredReliefMw,
    actionType: options.actionType,
    scenarioKind: options.scenarioKind,
    title: options.title,
    mode: options.mode,
    affectedBuses: options.affectedBuses,
    constraint: options.constraint,
    explanation: options.explanation,
    detectedCondition: options.detectedCondition,
    operatorMessage: options.operatorMessage,
    frequencyHz: options.frequencyHz,
    frequencyZone: options.frequencyZone,
    generationBeforeMw: islandGenerationMw,
    loadBeforeMw: islandLoadMw,
    generationAfterMw: selectedGeneration && islandGenerationMw !== undefined
      ? islandGenerationMw - selectedGeneration.mw
      : undefined,
    balanceRatioPct: selectedGeneration && islandGenerationMw !== undefined && islandLoadMw
      ? ((islandGenerationMw - selectedGeneration.mw) / islandLoadMw) * 100
      : undefined,
    imbalanceBasis: options.imbalanceBasis,
    imbalanceFormula: options.imbalanceFormula,
    steps: options.steps,
    passCriteria: options.passCriteria,
    selectedGeneration,
    alternatives: [],
    rejected: [],
  };
}

function buildGroupedCandidates(feeders: Feeder[], requiredReliefMw: number, options: RankOptions): SheddingCandidate[] {
  for (const group of [1, 2, 3, 4] as const) {
    const groupedFeeders = feeders.filter((feeder) => feeder.group <= group);
    const candidates = buildCandidates(groupedFeeders, requiredReliefMw, options).sort(compareCandidates);
    if (candidates.length > 0) return candidates;
  }

  return [];
}

function buildCandidates(feeders: Feeder[], requiredReliefMw: number, options: RankOptions): SheddingCandidate[] {
  const result: SheddingCandidate[] = [];
  const affectedBuses = new Set(options.affectedBuses ?? []);

  function visit(start: number, combo: Feeder[]): void {
    if (combo.length > 0) {
      const selectedMw = combo.reduce((sum, feeder) => sum + feeder.mw, 0);
      if (selectedMw >= requiredReliefMw) {
        const overshedMw = selectedMw - requiredReliefMw;
        const priorityPenalty = combo.reduce((sum, feeder) => sum + feeder.priority * feeder.mw, 0);
        const remoteBusPenalty = combo.reduce(
          (sum, feeder) => sum + (affectedBuses.size > 0 && !affectedBuses.has(feeder.bus) ? feeder.mw * 60 : 0),
          0
        );
        const busCoverageReward = combo.some((feeder) => affectedBuses.has(feeder.bus)) ? -35 : 0;
        result.push({
          id: combo.map((feeder) => feeder.id).join("+"),
          feeders: combo,
          selectedMw,
          effectiveReliefMw: requiredReliefMw,
          overshedMw,
          score: overshedMw * 100 + combo.length * 10 + priorityPenalty + remoteBusPenalty + busCoverageReward,
          reason: explainChoice(combo, requiredReliefMw, overshedMw, options),
          rejection: explainRejection(combo, requiredReliefMw, overshedMw, affectedBuses)
        });
      }
    }

    if (combo.length === maxCombinationSize) return;

    for (let index = start; index < feeders.length; index += 1) {
      visit(index + 1, [...combo, feeders[index]]);
    }
  }

  visit(0, []);
  return result;
}

function compareCandidates(left: SheddingCandidate, right: SheddingCandidate): number {
  return left.score - right.score || left.selectedMw - right.selectedMw || left.feeders.length - right.feeders.length;
}

function explainChoice(feeders: Feeder[], requiredReliefMw: number, overshedMw: number, options: RankOptions): string {
  const names = feeders.map((feeder) => feeder.name).join(" + ");
  const busText = options.affectedBuses?.length ? ` pada bus ${options.affectedBuses.join("/")}` : "";
  return `${names} memenuhi kebutuhan ${requiredReliefMw} MW${busText} dengan overshed ${overshedMw} MW dan jumlah operasi ${feeders.length}.`;
}

function explainRejection(
  feeders: Feeder[],
  requiredReliefMw: number,
  overshedMw: number,
  affectedBuses: Set<BusId>
): string {
  const remoteMw = feeders
    .filter((feeder) => affectedBuses.size > 0 && !affectedBuses.has(feeder.bus))
    .reduce((sum, feeder) => sum + feeder.mw, 0);
  if (remoteMw > 0) return `${remoteMw} MW berada di luar area constraint, jadi efek relief kurang langsung.`;
  if (overshedMw > 0) return `Overshed ${overshedMw} MW lebih besar dari kandidat terbaik.`;
  return `Memenuhi ${requiredReliefMw} MW, tetapi kalah pada prioritas atau jumlah operasi CB.`;
}
