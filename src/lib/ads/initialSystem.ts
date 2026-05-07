import type { Feeder } from "./model";

export const initialFeeders: Feeder[] = [
  { id: "LOAD_A1", name: "Load A1", kind: "load", bus: "A", mw: 42, group: 3, priority: 3, breakerId: "CB_LOAD_A1", breakerState: "closed", shedEligible: true },
  { id: "LOAD_A2", name: "Load A2", kind: "load", bus: "A", mw: 38, group: 3, priority: 3, breakerId: "CB_LOAD_A2", breakerState: "closed", shedEligible: true },
  { id: "LOAD_A3", name: "Load A3", kind: "load", bus: "A", mw: 52, group: 2, priority: 2, breakerId: "CB_LOAD_A3", breakerState: "closed", shedEligible: true },
  { id: "LOAD_A4", name: "Load A4", kind: "load", bus: "A", mw: 24, group: 2, priority: 2, breakerId: "CB_LOAD_A4", breakerState: "closed", shedEligible: true },
  { id: "LOAD_A5", name: "Load A5", kind: "load", bus: "A", mw: 18, group: 1, priority: 1, breakerId: "CB_LOAD_A5", breakerState: "closed", shedEligible: true },
  { id: "LOAD_B1", name: "Load B1", kind: "load", bus: "B", mw: 44, group: 3, priority: 3, breakerId: "CB_LOAD_B1", breakerState: "closed", shedEligible: true },
  { id: "LOAD_B3", name: "Load B3", kind: "load", bus: "B", mw: 31, group: 2, priority: 2, breakerId: "CB_LOAD_B3", breakerState: "closed", shedEligible: true },
  { id: "LOAD_B4", name: "Load B4", kind: "load", bus: "B", mw: 21, group: 2, priority: 2, breakerId: "CB_LOAD_B4", breakerState: "closed", shedEligible: true },
  { id: "LOAD_B5", name: "Load B5", kind: "load", bus: "B", mw: 16, group: 1, priority: 1, breakerId: "CB_LOAD_B5", breakerState: "closed", shedEligible: true },
  { id: "LOAD_B2", name: "Load B2", kind: "load", bus: "B", mw: 36, group: 3, priority: 3, breakerId: "CB_LOAD_B2", breakerState: "closed", shedEligible: true },
  { id: "LOAD_C4", name: "Load C4", kind: "load", bus: "C", mw: 26, group: 2, priority: 2, breakerId: "CB_LOAD_C4", breakerState: "closed", shedEligible: true },
  { id: "LOAD_C3", name: "Load C3", kind: "load", bus: "C", mw: 34, group: 2, priority: 2, breakerId: "CB_LOAD_C3", breakerState: "closed", shedEligible: true },
  { id: "LOAD_C1", name: "Load C1", kind: "load", bus: "C", mw: 46, group: 3, priority: 3, breakerId: "CB_LOAD_C1", breakerState: "closed", shedEligible: true },
  { id: "LOAD_C2", name: "Load C2", kind: "load", bus: "C", mw: 40, group: 3, priority: 3, breakerId: "CB_LOAD_C2", breakerState: "closed", shedEligible: true },
  { id: "LOAD_C5", name: "Load C5", kind: "load", bus: "C", mw: 18, group: 1, priority: 1, breakerId: "CB_LOAD_C5", breakerState: "closed", shedEligible: true }
];
