import { create } from "zustand";
import { initialFeeders } from "./initialSystem";
import { decisionForOpenContingencies, initialContingencyRules, isContingencyObject, previewDecisionForObject } from "./engine";
import { rankShedding } from "./solver";
import type { AdsDecision, BreakerState, ContingencyRule, Feeder, LoadGroup } from "./model";

interface AdsStore {
  feeders: Feeder[];
  contingencyRules: Record<string, ContingencyRule>;
  objectStates: Record<string, BreakerState>;
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

function buildObjectStates(feeders: Feeder[]): Record<string, BreakerState> {
  return Object.fromEntries([
    ...equipmentIds.map((id) => [id, "closed" as BreakerState]),
    ...feeders.map((feeder) => [feeder.id, feeder.breakerState])
  ]);
}

export const useAdsStore = create<AdsStore>((set, get) => ({
  feeders: initialFeeders,
  contingencyRules: initialContingencyRules,
  objectStates: buildObjectStates(initialFeeders),
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
    set({
      feeders,
      contingencyRules: initialContingencyRules,
      objectStates: buildObjectStates(feeders),
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
        explanation: "Operator memasukkan kebutuhan relief manual. ADS memilih kombinasi dengan overshed kecil, operasi CB sedikit, dan prioritas beban paling rendah."
      })
    });
  },
  updateFeeder: (id, patch) => {
    const nextPatch: Partial<Pick<Feeder, "mw" | "priority" | "group" | "shedEligible">> = {};
    if (patch.mw !== undefined) nextPatch.mw = Math.max(0, Math.round(patch.mw));
    if (patch.priority !== undefined) nextPatch.priority = Math.max(1, Math.min(5, Math.round(patch.priority)));
    if (patch.group !== undefined) nextPatch.group = Math.max(1, Math.min(4, Math.round(patch.group))) as LoadGroup;
    if (patch.shedEligible !== undefined) nextPatch.shedEligible = patch.shedEligible;
    const feeders = get().feeders.map((feeder) => feeder.id === id ? { ...feeder, ...nextPatch } : feeder);
    const objectStates = {
      ...get().objectStates,
      ...Object.fromEntries(feeders.map((feeder) => [feeder.id, feeder.breakerState]))
    };
    const decision = decisionForOpenContingencies(objectStates, feeders, get().contingencyRules) ?? rankShedding(feeders, get().requiredReliefMw);
    set({
      feeders,
      objectStates,
      decision,
      hoverDecision: previewDecisionForObject(get().hoverObjectId, feeders, get().contingencyRules)
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
    const decision = decisionForOpenContingencies(get().objectStates, feeders, contingencyRules) ?? rankShedding(feeders, get().requiredReliefMw);
    set({
      contingencyRules,
      decision,
      hoverDecision: previewDecisionForObject(get().hoverObjectId, feeders, contingencyRules)
    });
  },
  setReserveConfig: (patch) => {
    set({
      sourceMw: patch.sourceMw === undefined ? get().sourceMw : Math.max(0, Math.round(patch.sourceMw)),
      minReserveMw: patch.minReserveMw === undefined ? get().minReserveMw : Math.max(0, Math.round(patch.minReserveMw))
    });
  },
  toggleObject: (objectId) => {
    const rules = get().contingencyRules;
    const current = get().objectStates[objectId] ?? "closed";
    const next: BreakerState = current === "closed" ? "open" : "closed";
    const baseFeeders = get().feeders.map((feeder) =>
      feeder.id === objectId ? { ...feeder, breakerState: next } : feeder
    );
    const objectStates = {
      ...get().objectStates,
      [objectId]: next
    };
    let feeders = baseFeeders;
    let decision = decisionForOpenContingencies(objectStates, feeders, rules) ?? rankShedding(feeders, get().requiredReliefMw);
    const eventItems = [`${objectId} ${next === "closed" ? "closed/energized" : "opened/dead"}.`];

    if (next === "open" && isContingencyObject(objectId, rules)) {
      const clickedDecision = previewDecisionForObject(objectId, feeders, rules);
      if (clickedDecision?.selected) {
        const selectedIds = new Set(clickedDecision.selected.feeders.map((feeder) => feeder.id));
        feeders = feeders.map((feeder) => selectedIds.has(feeder.id) ? { ...feeder, breakerState: "open" as BreakerState } : feeder);
        for (const feeder of clickedDecision.selected.feeders) {
          objectStates[feeder.id] = "open";
          eventItems.push(`ADS trip command: ${feeder.id} opened for ${clickedDecision.constraint}.`);
        }
        decision = { ...clickedDecision, status: "executed", mode: "LIVE ADS EXECUTION" };
      } else if (clickedDecision) {
        decision = { ...clickedDecision, status: "blocked", mode: "LIVE ADS EXECUTION" };
      }
    }

    set({
      feeders,
      objectStates,
      decision,
      hoverDecision: Object.values(objectStates).some((state) => state === "open")
        ? null
        : previewDecisionForObject(get().hoverObjectId, feeders, rules),
      activeContingencyId: Object.keys(objectStates).find((id) => isContingencyObject(id, rules) && objectStates[id] === "open") ?? null,
      eventLog: [...eventItems, ...get().eventLog].slice(0, 120)
    });
  },
  setHoverObject: (hoverObjectId) => {
    if (get().hoverObjectId === hoverObjectId) return;
    const rules = get().contingencyRules;
    const isOpenContingency = Boolean(
      hoverObjectId && isContingencyObject(hoverObjectId, rules) && get().objectStates[hoverObjectId] === "open"
    );
    set({
      hoverObjectId,
      hoverDecision: isOpenContingency ? get().decision : previewDecisionForObject(hoverObjectId, get().feeders, rules)
    });
  }
}));
