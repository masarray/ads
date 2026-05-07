import type { AdsDecision, Feeder, SheddingCandidate } from "./model";

const maxCombinationSize = 4;

interface RankOptions {
  title?: string;
  mode?: string;
  constraint?: string;
  affectedBuses?: Array<Feeder["bus"]>;
  explanation?: string;
}

export function rankShedding(feeders: Feeder[], requiredReliefMw: number, options: RankOptions = {}): AdsDecision {
  if (requiredReliefMw <= 0) {
    return {
      status: "normal",
      requiredReliefMw: 0,
      title: options.title,
      mode: options.mode,
      affectedBuses: options.affectedBuses,
      constraint: options.constraint,
      explanation: options.explanation,
      alternatives: [],
      rejected: []
    };
  }

  const eligible = feeders.filter((feeder) => feeder.shedEligible && feeder.breakerState === "closed" && feeder.mw > 0);
  const candidates = buildGroupedCandidates(eligible, requiredReliefMw, options);
  const selected = candidates[0];

  return {
    status: selected ? "armed" : "blocked",
    requiredReliefMw,
    title: options.title,
    mode: options.mode,
    affectedBuses: options.affectedBuses,
    constraint: options.constraint,
    explanation: options.explanation,
    selected,
    alternatives: candidates.slice(1, 5),
    rejected: candidates.slice(5, 10)
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
  affectedBuses: Set<Feeder["bus"]>
): string {
  const remoteMw = feeders
    .filter((feeder) => affectedBuses.size > 0 && !affectedBuses.has(feeder.bus))
    .reduce((sum, feeder) => sum + feeder.mw, 0);
  if (remoteMw > 0) return `${remoteMw} MW berada di luar area constraint, jadi efek relief kurang langsung.`;
  if (overshedMw > 0) return `Overshed ${overshedMw} MW lebih besar dari kandidat terbaik.`;
  return `Memenuhi ${requiredReliefMw} MW, tetapi kalah pada prioritas atau jumlah operasi CB.`;
}
