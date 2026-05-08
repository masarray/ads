import { ChevronDown, Grid3X3 } from "lucide-react";
import { previewDecisionForObject } from "../../lib/ads/engine";
import { useAdsStore } from "../../lib/ads/store";
import type { LoadGroup } from "../../lib/ads/model";

export function TrippingMatrixView() {
  const feeders = useAdsStore((state) => state.feeders);
  const contingencyRules = useAdsStore((state) => state.contingencyRules);

  return (
    <section className="matrix-workspace" aria-label="Tripping matrix">
      <header className="config-hero">
        <div>
          <small>ADS Validation</small>
          <h2>Tripping Matrix</h2>
          <p>
            Matrix collapsible untuk melihat target shedding per contingency,
            group yang dipakai, MW terpenuhi, dan kandidat alternatif.
          </p>
        </div>
        <div className="config-summary">
          <span>
            <Grid3X3 size={14} /> Contingency{" "}
            <b>{Object.keys(contingencyRules).length}</b>
          </span>
          <span>
            <Grid3X3 size={14} /> Loads <b>{feeders.length}</b>
          </span>
        </div>
      </header>

      <div className="matrix-list">
        {Object.entries(contingencyRules).map(([id, rule]) => {
          const decision = previewDecisionForObject(
            id,
            feeders,
            contingencyRules,
          );
          const selectedFeeders = decision?.selected?.feeders ?? [];
          const selectedGroup = selectedFeeders.reduce<LoadGroup | 0>(
            (max, feeder) => Math.max(max, feeder.group) as LoadGroup,
            0,
          );

          return (
            <details className="matrix-item" key={id}>
              <summary>
                <div>
                  <small>{id}</small>
                  <strong>{rule.title}</strong>
                </div>
                <span>{rule.requiredReliefMw} MW need</span>
                <span>{decision?.selected?.selectedMw ?? 0} MW shed</span>
                <span>G{selectedGroup || "-"}</span>
                <ChevronDown size={16} />
              </summary>

              <div className="matrix-body">
                <section>
                  <small>Selected Trip</small>
                  <div className="trip-chip-row">
                    {selectedFeeders.length > 0 ? (
                      selectedFeeders.map((feeder) => (
                        <span key={feeder.id}>
                          G{feeder.group} {feeder.name} <b>{feeder.mw} MW</b>
                        </span>
                      ))
                    ) : (
                      <span>No valid shedding candidate</span>
                    )}
                  </div>
                </section>
                <section>
                  <small>Group Capacity</small>
                  <div className="group-bars">
                    {[1, 2, 3, 4].map((group) => {
                      const groupMw = feeders
                        .filter(
                          (feeder) =>
                            feeder.shedEligible &&
                            feeder.group === group &&
                            feeder.breakerState === "closed",
                        )
                        .reduce((sum, feeder) => sum + feeder.mw, 0);
                      return (
                        <span key={group}>
                          G{group}
                          <b>{groupMw} MW</b>
                        </span>
                      );
                    })}
                  </div>
                </section>
                <section>
                  <small>Alternatives</small>
                  <div className="matrix-alt-list">
                    {(decision?.alternatives ?? [])
                      .slice(0, 3)
                      .map((candidate) => (
                        <p key={candidate.id}>
                          <b>
                            {candidate.feeders
                              .map((feeder) => feeder.name)
                              .join(" + ")}
                          </b>
                          <span>
                            {candidate.selectedMw} MW, overshed{" "}
                            {candidate.overshedMw} MW
                          </span>
                        </p>
                      ))}
                    {(decision?.alternatives ?? []).length === 0 ? (
                      <p>
                        <b>No alternatives</b>
                        <span>Candidate set already minimal or blocked.</span>
                      </p>
                    ) : null}
                  </div>
                </section>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
