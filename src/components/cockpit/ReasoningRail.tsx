import { useAdsStore } from "../../lib/ads/store";

export function ReasoningRail() {
  const { decision, requiredReliefMw, setRequiredReliefMw } = useAdsStore();

  return (
    <aside className="side-rail" aria-label="ADS decision reasoning">
      <section className="decision-card">
        <small>ADS BRAIN</small>
        <h2>{decision.status === "normal" ? "Normal Monitoring" : "Shedding Candidate Ready"}</h2>
        <div className="metrics-grid">
          <div className="metric">
            <small>Required Relief</small>
            <b>{requiredReliefMw} MW</b>
          </div>
          <div className="metric">
            <small>Selected Shedding</small>
            <b>{decision.selected?.selectedMw ?? 0} MW</b>
          </div>
        </div>
        <input
          aria-label="Required relief MW"
          max={180}
          min={0}
          onChange={(event) => setRequiredReliefMw(Number(event.target.value))}
          step={1}
          type="range"
          value={requiredReliefMw}
        />
      </section>

      {decision.selected ? (
        <section className="reasoning-step" data-tone="selected">
          <small>SELECTED DEFENSE TARGET</small>
          <h3>{decision.selected.feeders.map((feeder) => feeder.name).join(" + ")}</h3>
          <p>{decision.selected.reason}</p>
        </section>
      ) : (
        <section className="reasoning-step">
          <small>SELECTED DEFENSE TARGET</small>
          <h3>No target armed</h3>
          <p>Sistem aman atau belum ada kebutuhan relief.</p>
        </section>
      )}

      {decision.alternatives.slice(0, 3).map((candidate, index) => (
        <section className="reasoning-step" data-tone={index === 0 ? "warning" : undefined} key={candidate.id}>
          <small>WHY NOT OPTION {index + 2}</small>
          <h3>{candidate.feeders.map((feeder) => feeder.name).join(" + ")}</h3>
          <p>
            Alternatif ini memberi {candidate.selectedMw} MW, tetapi kalah skor karena overshed {candidate.overshedMw} MW atau
            operasi lebih banyak.
          </p>
        </section>
      ))}
    </aside>
  );
}
