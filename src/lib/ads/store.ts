import { create } from "zustand";
import { initialFeeders } from "./initialSystem";
import { rankShedding } from "./solver";
import type { AdsDecision, Feeder } from "./model";

interface AdsStore {
  feeders: Feeder[];
  requiredReliefMw: number;
  decision: AdsDecision;
  setRequiredReliefMw: (mw: number) => void;
}

export const useAdsStore = create<AdsStore>((set, get) => ({
  feeders: initialFeeders,
  requiredReliefMw: 0,
  decision: rankShedding(initialFeeders, 0),
  setRequiredReliefMw: (requiredReliefMw) => {
    set({
      requiredReliefMw,
      decision: rankShedding(get().feeders, requiredReliefMw)
    });
  }
}));
