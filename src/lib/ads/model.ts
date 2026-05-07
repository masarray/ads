export type BreakerState = "closed" | "open" | "failed";
export type FeederKind = "load" | "generator" | "ibt" | "line" | "coupler";

export interface Feeder {
  id: string;
  name: string;
  kind: FeederKind;
  bus: "A" | "B" | "C";
  mw: number;
  priority: number;
  breakerId: string;
  breakerState: BreakerState;
  shedEligible: boolean;
}

export interface SheddingCandidate {
  id: string;
  feeders: Feeder[];
  selectedMw: number;
  effectiveReliefMw: number;
  overshedMw: number;
  score: number;
  reason: string;
  rejection?: string;
}

export interface AdsDecision {
  status: "normal" | "armed" | "executed" | "blocked";
  requiredReliefMw: number;
  title?: string;
  mode?: string;
  affectedBuses?: Array<Feeder["bus"]>;
  constraint?: string;
  explanation?: string;
  selected?: SheddingCandidate;
  alternatives: SheddingCandidate[];
  rejected: SheddingCandidate[];
}
