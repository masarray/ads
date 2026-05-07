import { AlertTriangle, BadgeCheck, ListChecks, MousePointer2 } from "lucide-react";
import { useAdsStore } from "../../lib/ads/store";

export function EngineerPanel() {
  const eventLog = useAdsStore((state) => state.eventLog);
  const decision = useAdsStore((state) => state.decision);
  const feeders = useAdsStore((state) => state.feeders);
  const openFeeders = feeders.filter((feeder) => feeder.breakerState === "open");
  const lastDecision = decision.selected?.feeders.map((feeder) => feeder.name).join(" + ") ?? "No trip executed";

  return (
    <section className="engineer-panel" aria-label="Engineer drawer">
      <header className="engineer-title">
        <ListChecks size={16} />
        <strong>Engineer Drawer</strong>
      </header>
      <div className="engineer-grid">
        <article>
          <small>Last ADS Action</small>
          <h3>{lastDecision}</h3>
          <p>{decision.constraint ?? "Waiting for contingency hover or trip."}</p>
        </article>
        <article>
          <small>Open / Tripped Loads</small>
          <h3>{openFeeders.length}</h3>
          <p>{openFeeders.map((feeder) => feeder.name).join(", ") || "All load feeders in service."}</p>
        </article>
        <article>
          <small>Operating Hint</small>
          <h3><MousePointer2 size={15} /> Hover CB</h3>
          <p>Hover contingency CB untuk preview arming. Click contingency CB untuk eksekusi ADS trip.</p>
        </article>
        <article>
          <small>Audit Trail</small>
          <h3><BadgeCheck size={15} /> {eventLog.length} events</h3>
          <p>{eventLog[0] ?? "No events yet."}</p>
        </article>
        <article className="wide">
          <small>Protection Note</small>
          <h3><AlertTriangle size={15} /> Explainable Shedding</h3>
          <p>ADS memilih kombinasi berdasar area constraint, lost MW minimum, overshed margin, prioritas load, dan jumlah operasi CB.</p>
        </article>
      </div>
    </section>
  );
}
