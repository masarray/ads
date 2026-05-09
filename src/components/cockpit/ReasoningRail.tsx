import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  MousePointer2,
  PlayCircle,
  Route,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useAdsStore } from "../../lib/ads/store";

function compactNumber(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return "0";
  return String(Math.round(value));
}

export function ReasoningRail() {
  const {
    decision,
    hoverDecision,
    requiredReliefMw,
    setRequiredReliefMw,
    feeders,
    frequencyHz,
    scenarioRun,
  } = useAdsStore();

  const displayDecision = hoverDecision ?? decision;
  const hasHover = Boolean(hoverDecision);
  const hasLiveDecision = !hoverDecision && decision.status !== "normal";
  const hasDecisionView = Boolean(hoverDecision || hasLiveDecision);
  const isExecuted = displayDecision.status === "executed";
  const isBlocked = displayDecision.status === "blocked";
  const isOgsDecision =
    displayDecision.actionType === "OGS_GENERATOR_SHEDDING" ||
    displayDecision.scenarioKind === "ogs_surplus";
  const decisionMessage = `${displayDecision.operatorMessage ?? ""} ${displayDecision.constraint ?? ""}`.toLowerCase();
  const needsRunback =
    hasDecisionView &&
    isOgsDecision &&
    isBlocked &&
    !displayDecision.selectedGeneration &&
    (decisionMessage.includes("runback") ||
      decisionMessage.includes("95-105") ||
      decisionMessage.includes("overgeneration") ||
      decisionMessage.includes("surplus") ||
      displayDecision.requiredReliefMw > 0);

  const totalLoad = feeders
    .filter((feeder) => feeder.breakerState === "closed")
    .reduce((sum, feeder) => sum + feeder.mw, 0);

  const selectedNames =
    displayDecision.selected?.feeders.map((feeder) => feeder.name).join(" + ") ??
    (displayDecision.status !== "blocked"
      ? displayDecision.selectedGeneration?.name
      : undefined) ??
    (needsRunback ? "Generator runback required" : "No target armed");

  const actionNeed = hasDecisionView ? displayDecision.requiredReliefMw : requiredReliefMw;
  const selectedMw = displayDecision.selected?.selectedMw ?? 0;
  const genMw = displayDecision.status !== "blocked" ? displayDecision.selectedGeneration?.mw ?? 0 : 0;
  const actionMw = selectedMw || genMw || (needsRunback ? actionNeed : 0);
  const cbCount =
    displayDecision.selected?.feeders.length ??
    (displayDecision.selectedGeneration ? 1 : 0);
  const overshed = displayDecision.selected?.overshedMw ?? 0;
  const primaryText = hasDecisionView
    ? displayDecision.operatorMessage ?? displayDecision.explanation
    : "Hover CB / line / IBT / generator untuk membaca preview Trip Matrix. Click menjalankan row yang sama dari snapshot sebelum event.";

  const displayMode = hasHover
    ? "Contingency Preview"
    : scenarioRun?.active
      ? "Scenario Runner"
      : hasLiveDecision
        ? decision.mode ?? "Live ADS"
        : "Operator Guide";

  const statusLabel = hasHover
    ? "Preview"
    : scenarioRun?.active
      ? `Step ${scenarioRun.step}/${scenarioRun.total}`
      : isExecuted
        ? "Executed"
        : isBlocked
          ? "Blocked"
          : hasDecisionView
            ? "Live"
            : "Ready";

  return (
    <aside className="side-rail side-rail-compact" aria-label="ADS decision reasoning">
      <section className="rail-header rail-header-compact">
        <div className="rail-icon" aria-hidden="true">
          <Brain size={21} strokeWidth={2.3} />
        </div>
        <div>
          <small>{displayMode}</small>
          <h2>ADS Logic</h2>
        </div>
      </section>

      {scenarioRun ? (
        <section className="scenario-run-card logic-animated" data-active={scenarioRun.active ? "true" : "false"}>
          <div className="scenario-run-icon">
            {scenarioRun.active ? <PlayCircle size={18} /> : <CheckCircle2 size={18} />}
          </div>
          <div>
            <small>{scenarioRun.active ? "Running sequence" : "Last sequence"}</small>
            <h3>{scenarioRun.title}</h3>
            <p>{scenarioRun.message}</p>
          </div>
        </section>
      ) : null}

      <section className="logic-hero logic-hero-compact logic-animated" key={`${displayMode}-${displayDecision.title ?? "guide"}`}>
        <div className="logic-hero-status-row">
          <small>{statusLabel}</small>
          <span className={`logic-status-chip logic-status-chip--${displayDecision.status}`}>{displayDecision.status}</span>
        </div>
        <h2>{hasDecisionView ? displayDecision.title : "Trip Matrix Preview"}</h2>
        <p className="rail-copy">{primaryText}</p>
      </section>

      <section className="logic-mini-metrics logic-animated" aria-label="ADS summary">
        <article>
          <Activity size={14} />
          <small>{isExecuted ? "Remain" : "Need"}</small>
          <b>{compactNumber(isExecuted ? 0 : actionNeed)}<span>MW</span></b>
        </article>
        <article>
          <Zap size={14} />
          <small>{isOgsDecision ? (needsRunback ? "Runback" : "Gen") : "Shed"}</small>
          <b>{compactNumber(actionMw)}<span>MW</span></b>
        </article>
        <article>
          <Route size={14} />
          <small>{isExecuted ? "Cleared" : "Over"}</small>
          <b>{compactNumber(isExecuted ? actionNeed : overshed)}<span>MW</span></b>
        </article>
        <article>
          <ShieldCheck size={14} />
          <small>CB</small>
          <b>{cbCount}</b>
        </article>
      </section>

      <section className="logic-target logic-target-compact logic-animated" data-active={hasDecisionView ? "true" : "false"} key={`target-${selectedNames}`}>
        <small>{isExecuted ? "Executed / Result" : needsRunback ? "Recommended Action" : "Target"}</small>
        <h3>{selectedNames}</h3>
        <p>
          {displayDecision.selected
            ? displayDecision.selected.reason
            : displayDecision.selectedGeneration && displayDecision.status !== "blocked"
              ? `${displayDecision.selectedGeneration.name} ${displayDecision.selectedGeneration.action} ${displayDecision.selectedGeneration.mw} MW. Final ratio ${displayDecision.balanceRatioPct?.toFixed(1) ?? "-"}%.`
              : needsRunback
                ? `OGS valid, tetapi hard trip generator tidak menjaga island 95–105%. Gunakan generator runback sekitar ${compactNumber(actionNeed)} MW.`
                : hasDecisionView
                  ? displayDecision.operatorMessage ?? "No target is armed for this row."
                  : "Hover object pada SLD untuk melihat target arming dari Trip Matrix."}
        </p>
      </section>

      {hasDecisionView && (displayDecision.imbalanceFormula || displayDecision.imbalanceBasis) ? (
        <section className="logic-equation-card logic-animated">
          <div>
            <AlertTriangle size={14} />
            <small>Reasoning</small>
          </div>
          <p>{displayDecision.imbalanceFormula ?? displayDecision.imbalanceBasis}</p>
        </section>
      ) : null}

      {hasDecisionView && displayDecision.steps?.length ? (
        <section className="logic-steps-compact logic-animated">
          <small>Decision flow</small>
          <ol>
            {displayDecision.steps.slice(0, 4).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : (
        <section className="logic-guide-compact logic-animated">
          <div>
            <MousePointer2 size={15} />
            <p>
              Hover = preview only. Click = execute selected Trip Matrix row. Blackstart = timed operator sequence using real CB actions.
            </p>
          </div>
        </section>
      )}

      <section className="logic-slider logic-slider-compact">
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

      <section className="logic-footer logic-footer-compact">
        <span>Freq <b>{frequencyHz.toFixed(2)} Hz</b></span>
        <span>Load <b>{totalLoad} MW</b></span>
        <span>Constraint <b>{hasDecisionView ? displayDecision.constraint : "Waiting hover"}</b></span>
      </section>
    </aside>
  );
}
