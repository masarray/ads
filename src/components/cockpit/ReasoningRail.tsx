import { Brain } from "lucide-react";
import { useAdsStore } from "../../lib/ads/store";

export function ReasoningRail() {
  const {
    decision,
    hoverDecision,
    requiredReliefMw,
    setRequiredReliefMw,
    feeders,
  } = useAdsStore();
  const displayDecision = hoverDecision ?? decision;
  const hasLiveDecision = !hoverDecision && decision.status === "armed";
  const hasDecisionView = Boolean(hoverDecision || hasLiveDecision);
  const isExecuted = hoverDecision?.status === "executed";
  const displayMode = hoverDecision
    ? hoverDecision.status === "executed"
      ? "Trip History"
      : "Contingency Preview"
    : hasLiveDecision
      ? "Manual Pre-arm"
      : "Operator Guide";
  const displayRequired = hasDecisionView
    ? displayDecision.requiredReliefMw
    : requiredReliefMw;
  const remainingNeed = isExecuted ? 0 : displayRequired;
  const totalLoad = feeders
    .filter((feeder) => feeder.breakerState === "closed")
    .reduce((sum, feeder) => sum + feeder.mw, 0);
  const selectedNames =
    displayDecision.selected?.feeders
      .map((feeder) => feeder.name)
      .join(" + ") ?? "No target armed";
  const selectedMw = displayDecision.selected?.selectedMw ?? 0;
  const overshed = displayDecision.selected?.overshedMw ?? 0;
  const operations = displayDecision.selected?.feeders.length ?? 0;
  const firstAlternative = displayDecision.alternatives[0];
  const rejectedCount =
    displayDecision.alternatives.length + displayDecision.rejected.length;
  const rejectedToShow = [
    ...displayDecision.alternatives,
    ...displayDecision.rejected,
  ].slice(0, 3);

  return (
    <aside className="side-rail" aria-label="ADS decision reasoning">
      <section className="rail-header">
        <div className="rail-icon" aria-hidden="true">
          <Brain size={22} strokeWidth={2.3} />
        </div>
        <div>
          <small>{displayMode}</small>
          <h2>ADS Logic</h2>
        </div>
      </section>

      <section
        className="logic-hero logic-animated"
        key={`hero-${displayMode}-${displayDecision.title ?? "guide"}`}
      >
        <small>
          {hasDecisionView ? displayDecision.mode : "SMART LOAD SHEDDING"}
        </small>
        <h2>
          {hasDecisionView ? displayDecision.title : "How ADS Brain Chooses"}
        </h2>
        <p className="rail-copy">
          {hasDecisionView
            ? displayDecision.explanation
            : "Hover contingency CB seperti IBT, line, coupler, atau generator. ADS akan menghitung area terdampak, kebutuhan relief MW, lalu memilih load paling aman dengan lost MW minimum."}
        </p>
      </section>

      {hasDecisionView ? (
        <section
          className="logic-scoreboard logic-animated"
          aria-label="Shedding summary"
          key={`score-${displayDecision.constraint}-${displayDecision.status}`}
        >
          <div>
            <small>{isExecuted ? "Remain" : "Need"}</small>
            <b>
              {remainingNeed}
              <span>MW</span>
            </b>
          </div>
          <div>
            <small>{isExecuted ? "Tripped" : "Shed"}</small>
            <b>
              {selectedMw}
              <span>MW</span>
            </b>
          </div>
          <div>
            <small>{isExecuted ? "Cleared" : "Over"}</small>
            <b>
              {isExecuted ? displayRequired : overshed}
              <span>MW</span>
            </b>
          </div>
          <div>
            <small>CB</small>
            <b>{operations}</b>
          </div>
        </section>
      ) : (
        <section
          className="logic-guide-grid logic-animated"
          aria-label="ADS logic guide"
        >
          <div>
            <small>1 Detect</small>
            <p>
              Temukan constraint: overload, islanding, defisit generator, atau
              transfer IBT/line.
            </p>
          </div>
          <div>
            <small>2 Localize</small>
            <p>
              Prioritaskan load di bus/area yang benar-benar menurunkan arus
              constraint.
            </p>
          </div>
          <div>
            <small>3 Optimize</small>
            <p>
              Ranking kombinasi berdasarkan lost MW, overshed, prioritas, dan
              jumlah operasi CB.
            </p>
          </div>
          <div>
            <small>4 Explain</small>
            <p>
              Tampilkan target dan alasan kenapa alternatif lain tidak dipilih.
            </p>
          </div>
        </section>
      )}

      <section className="logic-slider">
        <label htmlFor="required-relief">Manual relief request</label>
        <input
          id="required-relief"
          aria-label="Required relief MW"
          max={180}
          min={0}
          onChange={(event) => setRequiredReliefMw(Number(event.target.value))}
          step={1}
          type="range"
          value={requiredReliefMw}
        />
      </section>

      {hasDecisionView ? (
        <>
          <section
            className="logic-target logic-animated"
            data-active={displayDecision.selected ? "true" : "false"}
            key={`target-${selectedNames}`}
          >
            <small>
              {isExecuted ? "Armed and Tripped" : "Selected Target"}
            </small>
            <h3>{selectedNames}</h3>
            <p>
              {displayDecision.selected
                ? isExecuted
                  ? `${selectedNames} sudah dikirim trip. Relief awal ${displayRequired} MW sudah terpenuhi; tidak ada arming tambahan yang diperlukan.`
                  : displayDecision.selected.reason
                : "Tidak ada shedding karena sistem masih aman atau belum ada constraint aktif."}
            </p>
          </section>

          <section
            className="logic-why logic-animated"
            key={`why-${displayDecision.constraint}-${selectedNames}`}
          >
            <div>
              <small>Why Accepted</small>
              <p>
                {displayDecision.selected
                  ? `Area ${displayDecision.affectedBuses?.join("/") ?? "system"} paling relevan, overshed ${overshed} MW, dan hanya ${operations} operasi CB.`
                  : "Tidak ada overload, islanding, atau relief request yang perlu dieksekusi."}
              </p>
            </div>
            <div>
              <small>Why Not Other</small>
              <p>
                {firstAlternative
                  ? `${rejectedCount} kandidat lain ditolak. ${firstAlternative.feeders.map((feeder) => feeder.name).join(" + ")}: ${firstAlternative.rejection ?? `score lebih buruk, overshed ${firstAlternative.overshedMw} MW.`}`
                  : "Tidak ada alternatif yang perlu dibandingkan saat sistem normal."}
              </p>
            </div>
            {rejectedToShow.length > 1 ? (
              <ul className="logic-reject-list">
                {rejectedToShow.slice(1).map((candidate) => (
                  <li key={candidate.id}>
                    <b>
                      {candidate.feeders
                        .map((feeder) => feeder.name)
                        .join(" + ")}
                    </b>
                    <span>
                      {candidate.rejection ??
                        `Overshed ${candidate.overshedMw} MW atau score lebih buruk.`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : (
        <section className="logic-target logic-animated" data-active="true">
          <small>What to Try</small>
          <h3>Hover contingency CB</h3>
          <p>
            Contoh: arahkan mouse ke IBT A, IBT C, CB line, coupler, atau
            generator. Load biasa hanya bisa diklik Open/Close dan tidak akan
            memicu arming.
          </p>
        </section>
      )}

      <section className="logic-footer">
        <span>
          Freq <b>50.00 Hz</b>
        </span>
        <span>
          Load <b>{totalLoad} MW</b>
        </span>
        <span>
          Constraint{" "}
          <b>
            {hasDecisionView ? displayDecision.constraint : "Waiting hover"}
          </b>
        </span>
      </section>
    </aside>
  );
}
