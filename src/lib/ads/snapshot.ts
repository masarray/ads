import type {
  BreakerState,
  ContingencyRule,
  Feeder,
  SystemSnapshot,
} from "./model";

interface SnapshotInput {
  feeders: Feeder[];
  objectStates: Record<string, BreakerState>;
  contingencyRules: Record<string, ContingencyRule>;
  sourceMw?: number;
  minReserveMw?: number;
  frequencyHz?: number;
}

export function buildSystemSnapshot(input: SnapshotInput): SystemSnapshot {
  const feeders = input.feeders.map((feeder) => ({
    ...feeder,
    breakerState: input.objectStates[feeder.id] ?? feeder.breakerState,
  }));
  const objectStates = {
    ...input.objectStates,
    ...Object.fromEntries(feeders.map((feeder) => [feeder.id, feeder.breakerState])),
  };

  const snapshotHash = hashSnapshot({
    feeders,
    objectStates,
    contingencyRules: input.contingencyRules,
    sourceMw: input.sourceMw ?? 0,
    minReserveMw: input.minReserveMw ?? 0,
    frequencyHz: input.frequencyHz ?? 50,
  });

  return {
    feeders,
    objectStates,
    contingencyRules: input.contingencyRules,
    sourceMw: input.sourceMw ?? 0,
    minReserveMw: input.minReserveMw ?? 0,
    frequencyHz: input.frequencyHz ?? 50,
    snapshotHash,
  };
}

function hashSnapshot(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
