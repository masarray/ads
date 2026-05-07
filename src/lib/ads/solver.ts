import type { AdsDecision, Feeder, SheddingCandidate } from "./model";

const maxCombinationSize = 4;

export function rankShedding(feeders: Feeder[], requiredReliefMw: number): AdsDecision {
  if (requiredReliefMw <= 0) {
    return { status: "normal", requiredReliefMw: 0, alternatives: [], rejected: [] };
  }

  const eligible = feeders.filter((feeder) => feeder.shedEligible && feeder.breakerState === "closed" && feeder.mw > 0);
  const candidates = buildCandidates(eligible, requiredReliefMw).sort(compareCandidates);
  const selected = candidates[0];

  return {
    status: selected ? "armed" : "blocked",
    requiredReliefMw,
    selected,
    alternatives: candidates.slice(1, 5),
    rejected: candidates.slice(5, 10)
  };
}

function buildCandidates(feeders: Feeder[], requiredReliefMw: number): SheddingCandidate[] {
  const result: SheddingCandidate[] = [];

  function visit(start: number, combo: Feeder[]): void {
    if (combo.length > 0) {
      const selectedMw = combo.reduce((sum, feeder) => sum + feeder.mw, 0);
      if (selectedMw >= requiredReliefMw) {
        const overshedMw = selectedMw - requiredReliefMw;
        const priorityPenalty = combo.reduce((sum, feeder) => sum + feeder.priority * feeder.mw, 0);
        result.push({
          id: combo.map((feeder) => feeder.id).join("+"),
          feeders: combo,
          selectedMw,
          effectiveReliefMw: requiredReliefMw,
          overshedMw,
          score: overshedMw * 100 + combo.length * 10 + priorityPenalty,
          reason: explainChoice(combo, requiredReliefMw, overshedMw)
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

function explainChoice(feeders: Feeder[], requiredReliefMw: number, overshedMw: number): string {
  const names = feeders.map((feeder) => feeder.name).join(" + ");
  return `${names} memenuhi kebutuhan ${requiredReliefMw} MW dengan overshed ${overshedMw} MW dan jumlah operasi ${feeders.length}.`;
}
