export type BreakerState = "closed" | "open" | "failed";
export type FeederKind = "load" | "generator" | "ibt" | "line" | "coupler";
export type LoadGroup = 1 | 2 | 3 | 4;

export interface Feeder {
  id: string;
  name: string;
  kind: FeederKind;
  bus: "A" | "B" | "C";
  mw: number;
  group: LoadGroup;
  priority: number;
  breakerId: string;
  breakerState: BreakerState;
  shedEligible: boolean;
}

export interface ContingencyRule {
  title: string;
  mode: string;
  constraint: string;
  affectedBuses: Array<Feeder["bus"]>;
  requiredReliefMw: number;
  explanation: string;
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
