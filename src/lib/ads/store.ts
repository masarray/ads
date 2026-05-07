import { create } from "zustand";
import { initialFeeders } from "./initialSystem";
import { decisionForOpenContingencies, isContingencyObject, previewDecisionForObject } from "./engine";
import { rankShedding } from "./solver";
import type { AdsDecision, Feeder, BreakerState } from "./model";

interface AdsStore {
  feeders: Feeder[];
  objectStates: Record<string, BreakerState>;
  requiredReliefMw: number;
  decision: AdsDecision;
  hoverDecision: AdsDecision | null;
  hoverObjectId: string | null;
  eventLog: string[];
  activeContingencyId: string | null;
  reset: () => void;
  setRequiredReliefMw: (mw: number) => void;
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
  objectStates: buildObjectStates(initialFeeders),
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
      objectStates: buildObjectStates(feeders),
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
  toggleObject: (objectId) => {
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
    let decision = decisionForOpenContingencies(objectStates, feeders) ?? rankShedding(feeders, get().requiredReliefMw);
    const eventItems = [`${objectId} ${next === "closed" ? "closed/energized" : "opened/dead"}.`];

    if (next === "open" && isContingencyObject(objectId) && decision.selected) {
      const selectedIds = new Set(decision.selected.feeders.map((feeder) => feeder.id));
      feeders = feeders.map((feeder) => selectedIds.has(feeder.id) ? { ...feeder, breakerState: "open" as BreakerState } : feeder);
      for (const feeder of decision.selected.feeders) {
        objectStates[feeder.id] = "open";
        eventItems.push(`ADS trip command: ${feeder.id} opened for ${decision.constraint}.`);
      }
      decision = { ...decision, status: "executed" };
    }

    set({
      feeders,
      objectStates,
      decision,
      hoverDecision: Object.values(objectStates).some((state) => state === "open")
        ? null
        : previewDecisionForObject(get().hoverObjectId, feeders),
      activeContingencyId: Object.keys(objectStates).find((id) => isContingencyObject(id) && objectStates[id] === "open") ?? null,
      eventLog: [...eventItems, ...get().eventLog].slice(0, 24)
    });
  },
  setHoverObject: (hoverObjectId) => {
    if (get().hoverObjectId === hoverObjectId) return;
    const isOpenContingency = Boolean(
      hoverObjectId && isContingencyObject(hoverObjectId) && get().objectStates[hoverObjectId] === "open"
    );
    set({
      hoverObjectId,
      hoverDecision: isOpenContingency ? get().decision : previewDecisionForObject(hoverObjectId, get().feeders)
    });
  }
}));
