import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Gauge,
  GitBranch,
  MousePointer2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAdsStore } from "../../lib/ads/store";

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtMw(value: unknown): string {
  const parsed = n(value);
  return `${Math.round(parsed)} MW`;
}

function fmtPct(value: unknown): string {
  const parsed = n(value);
  return `${Math.round(parsed * 10) / 10}%`;
}

function shortId(value: unknown): string {
  const raw = String(value ?? "—");
  return raw
    .replace(/^ACTIVE_CONSTRAINT_/, "")
    .replace(/^CB_/, "")
    .replace(/_/g, " ");
}

function describeEvent(event: unknown): string {
  if (!event) return "No event recorded yet.";
  if (typeof event === "string") return event;
  if (typeof event === "object") {
    const record = event as Record<string, unknown>;
    return String(
      record.message ??
        record.title ??
        record.description ??
        record.type ??
        JSON.stringify(record),
    );
  }
  return String(event);
}

function summarizeTargets(targets: unknown[], fallback = "No target"): string {
  const list = targets.filter(Boolean).map(shortId);
  if (list.length === 0) return fallback;
  if (list.length <= 2) return list.join(" + ");
  return `${list.slice(0, 2).join(" + ")} +${list.length - 2}`;
}

function toneFor(status: string): "ok" | "watch" | "critical" {
  if (status === "critical" || status === "blocked") return "critical";
  if (status === "watch" || status === "armed") return "watch";
  return "ok";
}

export function EngineerPanel() {
  const [open, setOpen] = useState(false);

  const feeders = useAdsStore((state) => state.feeders);
  const decision = useAdsStore((state) => state.decision);
  const hoverDecision = useAdsStore((state) => state.hoverDecision);
  const hoverObjectId = useAdsStore((state) => state.hoverObjectId);
  const eventLog = useAdsStore((state) => state.eventLog);
  const tripMatrix = useAdsStore((state) => state.tripMatrix);
  const requiredReliefMw = useAdsStore((state) => state.requiredReliefMw);
  const manualAdvisory = useAdsStore((state) => (state as any).manualAdvisory);
  const scenarioRun = useAdsStore((state) => (state as any).scenarioRun);

  const powerFlow = (tripMatrix as any)?.powerFlow;
  const branches = powerFlow?.branches ?? [];
  const overloadedBranches = powerFlow?.overloadedBranches ?? [];

  const previewRow = hoverObjectId
    ? (tripMatrix as any)?.rows?.[hoverObjectId]
    : null;

  const displayDecision = hoverDecision ?? decision;
  const selectedTargets: unknown[] = previewRow?.selectedTargets ?? [];
  const remedialCommands: unknown[] = previewRow?.remedialCommands ?? [];
  const runbackTargets: unknown[] =
    previewRow?.visualHints?.runbackCandidateIds ?? [];

  const openFeeders = useMemo(
    () => feeders.filter((feeder) => feeder.breakerState === "open"),
    [feeders],
  );

  const worstBranch = useMemo(() => {
    return [...branches]
      .filter((branch: any) => branch.status === "closed")
      .sort((a: any, b: any) => n(b.loadingPct) - n(a.loadingPct))[0];
  }, [branches]);

  const issueStatus =
    overloadedBranches.length > 0
      ? "critical"
      : displayDecision?.status === "blocked"
        ? "blocked"
        : displayDecision?.status === "armed"
          ? "armed"
          : "ok";

  const tone = toneFor(issueStatus);

  const issueTitle =
    scenarioRun?.active
      ? scenarioRun.title
      : previewRow?.decision?.title ??
        displayDecision?.title ??
        (worstBranch
          ? `${shortId(worstBranch.branchId ?? worstBranch.id)} ${fmtPct(
              worstBranch.loadingPct,
            )}`
          : "System stable");

  const issueLine =
    scenarioRun?.active
      ? `Step ${scenarioRun.step}/${scenarioRun.total}: ${scenarioRun.message}`
      : displayDecision?.operatorMessage ??
        displayDecision?.constraint ??
        (worstBranch
          ? `${shortId(worstBranch.branchId ?? worstBranch.id)} ${fmtMw(
              worstBranch.absFlowMw ?? worstBranch.flowMw,
            )} / ${fmtMw(worstBranch.ratingMw)}`
          : "Hover CB for ADS preview or hover open load for restoration check.");

  const branchLabel = worstBranch
    ? `${shortId(worstBranch.branchId ?? worstBranch.id)} ${fmtPct(
        worstBranch.loadingPct,
      )}`
    : "PF normal";

  const needLabel =
    requiredReliefMw > 0
      ? fmtMw(requiredReliefMw)
      : worstBranch?.requiredReductionMw
        ? fmtMw(worstBranch.requiredReductionMw)
        : "0 MW";

  const targetSummary =
    selectedTargets.length > 0
      ? summarizeTargets(selectedTargets)
      : runbackTargets.length > 0
        ? `${summarizeTargets(runbackTargets)} runback`
        : remedialCommands.length > 0
          ? summarizeTargets(
              remedialCommands.map((cmd: any) => `${cmd.objectId} ${cmd.action}`),
            )
          : displayDecision?.selectedTargets?.length
            ? summarizeTargets(displayDecision.selectedTargets)
            : "No target";

  const manualTitle = manualAdvisory
    ? `${manualAdvisory.targetName ?? "Manual close"} · ${manualAdvisory.verdict}`
    : "Hover open load";

  const manualText = manualAdvisory
    ? manualAdvisory.message
    : "Check whether closing an open feeder is safe before restoration.";

  const lastEvent = describeEvent(eventLog[0]);

  return (
    <section
      className={`engineer-panel engineer-coach-compact ${open ? "is-open" : ""}`}
      aria-label="Engineer coach drawer"
    >
      <button
        type="button"
        className="engineer-coach-strip"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`coach-dot tone-${tone}`} />
        <strong>Engineer Coach</strong>
        <span className={`coach-pill tone-${tone}`}>
          {tone === "critical" ? "PF Constraint" : tone === "watch" ? "ADS Armed" : "Stable"}
        </span>
        <span className="coach-metric">
          <Gauge size={14} /> {branchLabel}
        </span>
        <span className="coach-metric">
          <Zap size={14} /> Need {needLabel}
        </span>
        <span className="coach-target">
          Target: <b>{targetSummary}</b>
        </span>
        <span className="coach-metric">{openFeeders.length} open</span>
        <span className="coach-metric">{eventLog.length} events</span>
        <ChevronDown className="coach-chevron" size={16} />
      </button>

      <div className="engineer-coach-grid">
        <article className="coach-card coach-card-main">
          <div className="coach-card-head">
            <small>Current Issue</small>
            <span className={`coach-mini-chip tone-${tone}`}>{shortId(issueStatus)}</span>
          </div>
          <h3>{issueTitle}</h3>
          <p>{issueLine}</p>
        </article>

        <article className="coach-card">
          <div className="coach-card-head">
            <small>ADS Decision</small>
            <GitBranch size={15} />
          </div>
          <h3>{targetSummary}</h3>
          <p>
            {previewRow
              ? "This is the Trip Matrix preview for the hovered object."
              : displayDecision?.status === "armed"
                ? "ADS has an armed corrective target."
                : "No active armed target. Hover contingency CB to preview cause → reaction."}
          </p>
        </article>

        <article
          className={`coach-card ${
            manualAdvisory ? `manual-${manualAdvisory.verdict}` : ""
          }`}
        >
          <div className="coach-card-head">
            <small>Manual Restoration</small>
            <MousePointer2 size={15} />
          </div>
          <h3>{manualTitle}</h3>
          <p>{manualText}</p>
        </article>

        <article className="coach-card">
          <div className="coach-card-head">
            <small>Last Event</small>
            <Activity size={15} />
          </div>
          <h3>{eventLog.length} events</h3>
          <p>{lastEvent}</p>
        </article>

        {displayDecision?.status === "blocked" ? (
          <article className="coach-card coach-card-warning">
            <div className="coach-card-head">
              <small>Blocked Reason</small>
              <AlertTriangle size={15} />
            </div>
            <h3>{displayDecision.title ?? "Action blocked"}</h3>
            <p>
              {displayDecision.operatorMessage ??
                displayDecision.explanation ??
                "No safe corrective target found."}
            </p>
          </article>
        ) : (
          <article className="coach-card coach-card-tip">
            <div className="coach-card-head">
              <small>Operator Habit</small>
              <ShieldCheck size={15} />
            </div>
            <h3>Preview before action</h3>
            <p>Hover first, read the rail, then execute. Avoid blind switching.</p>
          </article>
        )}
      </div>
    </section>
  );
}
