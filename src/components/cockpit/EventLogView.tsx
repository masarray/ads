import { BadgeCheck, ClipboardList } from "lucide-react";
import { useMemo } from "react";
import { useAdsStore } from "../../lib/ads/store";

export function EventLogView() {
  const eventLog = useAdsStore((state) => state.eventLog);
  const feeders = useAdsStore((state) => state.feeders);
  const objectStates = useAdsStore((state) => state.objectStates);
  const contingencyRules = useAdsStore((state) => state.contingencyRules);
  const openFeeders = useMemo(
    () => feeders.filter((feeder) => feeder.breakerState === "open"),
    [feeders]
  );
  const openContingencies = useMemo(
    () => Object.entries(objectStates).filter(([id, value]) => id in contingencyRules && value === "open"),
    [contingencyRules, objectStates]
  );

  return (
    <section className="audit-workspace" aria-label="Event log">
      <header className="config-hero">
        <div>
          <small>Audit Trail</small>
          <h2>Event Log</h2>
          <p>Riwayat operasi CB, contingency, dan ADS trip command dalam urutan terbaru supaya validasi percobaan random lebih mudah dibaca.</p>
        </div>
        <div className="config-summary">
          <span><ClipboardList size={14} /> Events <b>{eventLog.length}</b></span>
          <span><BadgeCheck size={14} /> Open loads <b>{openFeeders.length}</b></span>
          <span><BadgeCheck size={14} /> Contingency <b>{openContingencies.length}</b></span>
        </div>
      </header>

      <div className="audit-grid">
        <section className="config-panel">
          <header>
            <ClipboardList size={17} />
            <div>
              <small>Latest First</small>
              <h3>Runtime Sequence</h3>
            </div>
          </header>
          <div className="audit-list">
            {eventLog.length > 0 ? eventLog.map((event, index) => (
              <article key={`${event}-${index}`}>
                <span>{String(eventLog.length - index).padStart(2, "0")}</span>
                <p>{event}</p>
              </article>
            )) : (
              <article>
                <span>00</span>
                <p>No event recorded. Trigger a contingency or open a load breaker.</p>
              </article>
            )}
          </div>
        </section>

        <section className="config-panel">
          <header>
            <BadgeCheck size={17} />
            <div>
              <small>Current State</small>
              <h3>Opened Objects</h3>
            </div>
          </header>
          <div className="state-list">
            {openContingencies.map(([id]) => <span key={id}>Contingency: <b>{id}</b></span>)}
            {openFeeders.map((feeder) => <span key={feeder.id}>Load: <b>{feeder.name}</b> {feeder.mw} MW</span>)}
            {openContingencies.length === 0 && openFeeders.length === 0 ? <span>All monitored objects are closed.</span> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
