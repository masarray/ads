export type BreakerState = "closed" | "open" | "failed";
export type FeederKind = "load" | "generator" | "ibt" | "line" | "coupler";
export type LoadGroup = 1 | 2 | 3 | 4;
export type BusId = "A" | "B" | "C";
export type DefenseActionType =
  | "NORMAL"
  | "MANUAL_RELIEF"
  | "OLS_LOAD_SHEDDING"
  | "DEFICIT_LOAD_SHEDDING"
  | "OGS_GENERATOR_SHEDDING"
  | "ISLAND_BALANCING";
export type ScenarioKind =
  | "manual_relief"
  | "topology_split"
  | "generation_derate"
  | "frequency_islanding"
  | "ols_overload"
  | "ogs_surplus";

export interface Feeder {
  id: string;
  name: string;
  kind: FeederKind;
  bus: BusId;
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
  affectedBuses: BusId[];
  requiredReliefMw: number;
  explanation: string;
  strictAffectedBuses?: boolean;
  actionType?: DefenseActionType;
  scenarioKind?: ScenarioKind;
  imbalanceBasis?: string;
  imbalanceFormula?: string;
}

export interface GeneratorAction {
  id: string;
  name: string;
  bus: BusId;
  mw: number;
  priority: number;
  action: "runback" | "trip";
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
  actionType?: DefenseActionType;
  scenarioKind?: ScenarioKind;
  title?: string;
  mode?: string;
  affectedBuses?: BusId[];
  strictAffectedBuses?: boolean;
  constraint?: string;
  explanation?: string;
  detectedCondition?: string;
  operatorMessage?: string;
  frequencyHz?: number;
  frequencyZone?: string;
  selectedGeneration?: GeneratorAction;
  generationBeforeMw?: number;
  loadBeforeMw?: number;
  generationAfterMw?: number;
  balanceRatioPct?: number;
  imbalanceBasis?: string;
  imbalanceFormula?: string;
  steps?: string[];
  passCriteria?: string[];
  selected?: SheddingCandidate;
  alternatives: SheddingCandidate[];
  rejected: SheddingCandidate[];
}

export interface SourceUnit {
  id: string;
  name: string;
  bus: BusId;
  mw: number;
  state: BreakerState;
}

export interface SystemSnapshot {
  feeders: Feeder[];
  objectStates: Record<string, BreakerState>;
  contingencyRules: Record<string, ContingencyRule>;
  sourceMw: number;
  minReserveMw: number;
  frequencyHz: number;
  snapshotHash: string;
}

export interface ElectricalIsland {
  id: string;
  buses: BusId[];
  nodeIds: string[];
  sourceMw: number;
  loadMw: number;
  reserveMw: number;
  deficitMw: number;
  loadIds: string[];
  generatorIds: string[];
  deviceIds: string[];
}

export interface TopologyModel {
  islands: ElectricalIsland[];
  deviceIslandMap: Record<string, string>;
  loadIslandMap: Record<string, string>;
  generatorIslandMap: Record<string, string>;
}

export interface TripMatrixRow {
  triggerId: string;
  matrixVersion: number;
  snapshotHash: string;
  status: AdsDecision["status"];
  islandId?: string;
  affectedBuses: BusId[];
  triggerCommand: {
    objectId: string;
    action: "open";
  };
  remedialCommands: Array<{
    objectId: string;
    action: "open" | "trip" | "runback";
    targetType: "load" | "generator";
    mw: number;
    reason: string;
  }>;
  selectedTargets: string[];
  blockedReason?: string;
  decision: AdsDecision;
}

export interface TripMatrix {
  matrixVersion: number;
  snapshotHash: string;
  rows: Record<string, TripMatrixRow>;
  topology: TopologyModel;
}
