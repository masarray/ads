import { motion, useDragControls } from "framer-motion";
import {
  Activity,
  Gauge,
  Grip,
  Maximize2,
  Minus,
  Plus,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdsStore } from "../../lib/ads/store";

const feederElementMap: Record<string, string[]> = {
  IBT_A: ["IBT_A", "Line 5", "Ellipse 1", "Ellipse 2", "Ellipse 3"],
  IBT_C: ["IBT_C", "LIBTA", "Ellipse 1_2", "Ellipse 2_2", "Ellipse 3_2"],
  GEN_A1: ["GEN_A1", "Line 6", "Ellipse 4"],
  GEN_A2: ["GEN_A2", "Line 6_4", "Ellipse 4_4"],
  GEN_C1: ["GEN_C1", "Line 6_2", "Ellipse 4_2"],
  GEN_C2: ["GEN_C2", "Line 6_3", "Ellipse 4_3"],
  LOAD_A1: ["LOAD_A1", "Arrow 3"],
  LOAD_A2: ["LOAD_A2", "Arrow 4"],
  LOAD_A3: ["LOAD_A3", "Arrow 5"],
  LOAD_A4: ["LOAD_A4", "Arrow 6"],
  LOAD_A5: ["LOAD_A5", "Arrow 7"],
  LOAD_B1: ["LOAD_B1", "Arrow 13"],
  LOAD_B3: ["LOAD_B3", "Arrow 14"],
  LOAD_B4: ["LOAD_B4", "Arrow 15"],
  LOAD_B5: ["LOAD_B5", "Arrow 16"],
  LOAD_B2: ["LOAD_B2", "Arrow 17"],
  LOAD_C4: ["LOAD_C4", "Arrow 8"],
  LOAD_C3: ["LOAD_C3", "Arrow 9"],
  LOAD_C1: ["LOAD_C1", "Arrow 10"],
  LOAD_C2: ["LOAD_C2", "Arrow 11"],
  LOAD_C5: ["LOAD_C5", "Arrow 12"],
};

const breakerNames: Record<string, string> = {
  LINE_AB: "Line A-B",
  LINE_BC: "Line B-C",
  LINE_AC: "Line A-C",
  LINE_COUPLER: "Bus coupler",
  IBT_A: "IBT A",
  IBT_C: "IBT C",
  GEN_A1: "Generator A1",
  GEN_A2: "Generator A2",
  GEN_C1: "Generator C1",
  GEN_C2: "Generator C2",
};

const objectMwText: Record<string, string> = {
  LINE_AC: "70 MW",
  LINE_AB: "88 MW",
  LINE_BC: "92 MW",
  LINE_COUPLER: "0 MW",
  IBT_A: "72 MW",
  IBT_C: "145 MW",
  GEN_A1: "180 MW",
  GEN_A2: "135 MW",
  GEN_C1: "165 MW",
  GEN_C2: "145 MW",
};

const sldViewBox = {
  x: 35,
  y: 170,
  width: 1850,
  height: 840,
};
const sldNativeWidth = sldViewBox.width;
const sldNativeHeight = sldViewBox.height;
const minZoom = 0.45;
const maxZoom = 1.35;

type AreaCardId = "A" | "B" | "C";

const areaCardBusMap: Record<AreaCardId, string[]> = {
  A: ["A"],
  B: ["B1", "B2"],
  C: ["C"],
};

const areaCardPositions: Array<{
  id: AreaCardId;
  name: string;
  x: number;
  y: number;
}> = [
  // Keep the cards small and parked near the edge of each electrical area.
  // The SLD conductors/breakers remain the primary visual layer.
  { id: "A", name: "Substation A", x: 320, y: 420 },
  { id: "B", name: "Substation B", x: 690, y: 32 },
  { id: "C", name: "Substation C", x: 1358, y: 420 },
];

const localGenerationByArea: Record<
  AreaCardId,
  Array<{ id: string; mw: number }>
> = {
  A: [
    { id: "GEN_A1", mw: 180 },
    { id: "GEN_A2", mw: 135 },
  ],
  B: [],
  C: [
    { id: "GEN_C1", mw: 165 },
    { id: "GEN_C2", mw: 145 },
  ],
};

const ibtBranchByArea: Partial<Record<AreaCardId, string>> = {
  A: "IBT_A",
  C: "IBT_C",
};

const branchLabelMap: Record<string, string> = {
  IBT_A: "IBT A",
  LINE_AB: "Line A-B",
  LINE_COUPLER: "Bus Coupler B",
  LINE_BC: "Line B-C",
  LINE_AC: "Line A-C",
  IBT_C: "IBT C",
};

function formatMw(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  const rounded = Math.abs(value) < 0.05 ? 0 : Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  return `${Math.round(value * 10) / 10}`;
}

function signedMw(value: number): string {
  const formatted = formatMw(value);
  if (formatted === "0") return "0";
  return value > 0 ? `+${formatted}` : formatted;
}

export function SldCanvas() {
  const stageRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const powerCardConstraintsRef = useRef<HTMLDivElement>(null);
  const powerCardDragControls = useDragControls();
  const hoverCommitTimerRef = useRef<number | null>(null);
  const hoverClearTimerRef = useRef<number | null>(null);
  const lastHoverObjectRef = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fitZoom, setFitZoom] = useState(0.7);
  const [zoom, setZoom] = useState(0.7);
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    body: string;
  } | null>(null);
  const feeders = useAdsStore((state) => state.feeders);
  const contingencyRules = useAdsStore((state) => state.contingencyRules);
  const objectStates = useAdsStore((state) => state.objectStates);
  const decision = useAdsStore((state) => state.decision);
  const tripMatrix = useAdsStore((state) => state.tripMatrix);
  const sourceMw = useAdsStore((state) => state.sourceMw);
  const requiredReliefMw = useAdsStore((state) => state.requiredReliefMw);
  const frequencyHz = useAdsStore((state) => state.frequencyHz);
  const hoverDecision = useAdsStore((state) => state.hoverDecision);
  const hoverObjectId = useAdsStore((state) => state.hoverObjectId);
  const toggleObject = useAdsStore((state) => state.toggleObject);
  const setHoverObject = useAdsStore((state) => state.setHoverObject);
  const displayDecision = hoverDecision ?? decision;
  const displayNeedMw =
    displayDecision.status === "normal"
      ? requiredReliefMw
      : displayDecision.requiredReliefMw;
  const demandMw = useMemo(
    () =>
      feeders
        .filter((feeder) => feeder.breakerState === "closed")
        .reduce((sum, feeder) => sum + feeder.mw, 0),
    [feeders],
  );
  const displaySourceMw = displayDecision.generationBeforeMw ?? sourceMw;
  const displayDemandMw = displayDecision.loadBeforeMw ?? demandMw;
  const reserveMw = Math.max(0, displaySourceMw - displayDemandMw);
  const isOgsView = displayDecision.actionType === "OGS_GENERATOR_SHEDDING";
  // Preview overlay is intentionally hover-only.
  // PowerFlowLite/base live constraints are shown in cards/rail, but they must not
  // create SLD arming glow by themselves. This keeps hover preview and live
  // diagnostic separated.
  const previewMatrixRow = useMemo(() => {
    if (!hoverObjectId) return undefined;
    const row = tripMatrix.rows[hoverObjectId];
    return row?.snapshotHash === tripMatrix.snapshotHash ? row : undefined;
  }, [hoverObjectId, tripMatrix]);

  const activeMatrixRow = previewMatrixRow;

  const currentPowerFlow = tripMatrix.powerFlow;
  // Cards may show the hovered contingency's post-contingency power-flow snapshot,
  // but only while there is an actual hover preview row. Otherwise they show the
  // current live PowerFlowLite snapshot.
  const previewPowerFlow = previewMatrixRow?.powerFlow ?? currentPowerFlow;
  const branchFlowById = useMemo(
    () =>
      new Map(
        (currentPowerFlow?.branches ?? []).map((branch) => [
          branch.branchId,
          branch,
        ]),
      ),
    [currentPowerFlow],
  );
  const previewBranchFlowById = useMemo(
    () =>
      new Map(
        (previewPowerFlow?.branches ?? []).map((branch) => [
          branch.branchId,
          branch,
        ]),
      ),
    [previewPowerFlow],
  );

  const activeFlowBranch = useMemo(() => {
    if (hoverObjectId && previewBranchFlowById.has(hoverObjectId)) {
      return previewBranchFlowById.get(hoverObjectId);
    }
    if (activeMatrixRow?.activeFlowConstraint)
      return activeMatrixRow.activeFlowConstraint;
    const worstPreview = previewPowerFlow?.overloadedBranches?.[0];
    if (worstPreview) return worstPreview;
    return [...(previewPowerFlow?.branches ?? [])]
      .filter((branch) => branch.status === "closed")
      .sort((left, right) => right.loadingPct - left.loadingPct)[0];
  }, [activeMatrixRow, hoverObjectId, previewBranchFlowById, previewPowerFlow]);

  const topBranchFlows = useMemo(
    () =>
      [...(previewPowerFlow?.branches ?? [])]
        .filter((branch) => branch.status === "closed")
        .sort((left, right) => right.loadingPct - left.loadingPct)
        .slice(0, 4),
    [previewPowerFlow],
  );

  const substationPowerCards = useMemo(
    () =>
      areaCardPositions.map((card) => {
        const nodeSet = new Set(areaCardBusMap[card.id]);
        const localGen = localGenerationByArea[card.id]
          .filter(
            (source) =>
              objectStates[source.id] !== "open" &&
              objectStates[source.id] !== "failed",
          )
          .reduce((sum, source) => sum + source.mw, 0);
        const load = feeders
          .filter((feeder) => feeder.breakerState === "closed")
          .filter((feeder) => {
            if (card.id === "A") return feeder.bus === "A";
            if (card.id === "C") return feeder.bus === "C";
            return feeder.bus === "B";
          })
          .reduce((sum, feeder) => sum + feeder.mw, 0);
        const isSplit = tripMatrix.topology.islands.length > 1;
        const branchFlows = previewPowerFlow?.branches ?? [];
        const ibtId = ibtBranchByArea[card.id];
        const ibtBranch = ibtId
          ? branchFlows.find((branch) => branch.branchId === ibtId)
          : undefined;
        let ibtFlow = 0;
        if (ibtBranch && ibtBranch.status === "closed") {
          // Branch template direction is GRID_A -> A and GRID_C -> C.
          // Positive flow therefore means import into the substation.
          ibtFlow = ibtBranch.flowMw;
        }

        let tieImport = 0;
        let tieExport = 0;
        const tieDetails: string[] = [];

        for (const branch of branchFlows) {
          if (branch.status !== "closed") continue;
          if (branch.branchId.startsWith("IBT_")) continue;
          const fromInside = nodeSet.has(branch.fromBus);
          const toInside = nodeSet.has(branch.toBus);
          if (fromInside === toInside) continue;

          const importIntoArea = toInside ? branch.flowMw : -branch.flowMw;
          if (importIntoArea >= 0) tieImport += importIntoArea;
          else tieExport += Math.abs(importIntoArea);
          tieDetails.push(
            `${branchLabelMap[branch.branchId] ?? branch.branchId}: ${signedMw(importIntoArea)} MW`,
          );
        }

        const hasGridSource = Boolean(
          ibtBranch && ibtBranch.status === "closed" && ibtFlow > 0,
        );
        const totalInflow = localGen + Math.max(0, ibtFlow) + tieImport;
        const servedByFlow = totalInflow - tieExport;
        const pfBalance = servedByFlow - load;
        const sourceForAds = localGen + Math.max(0, ibtFlow) + tieImport;
        const lowerLimit = load * 0.95;
        const upperLimit = load * 1.05;
        const adsBalancePct =
          load > 0
            ? (sourceForAds / load) * 100
            : sourceForAds > 0
              ? Infinity
              : 100;
        const isPureIsland = isSplit && !hasGridSource && tieImport <= 0;
        const ogsRequired = isPureIsland && load > 0 && localGen > upperLimit;
        const noLoadOgs = isPureIsland && load === 0 && localGen > 0;

        // Important power-system rule:
        // a local substation card is diagnostic only. It must not declare
        // load shedding just because local generation is below local load
        // while the area is still interconnected or grid/tie supported.
        const sheddingRequired =
          isPureIsland && load > 0 && sourceForAds < lowerLimit;
        const withinTolerance =
          load > 0 && sourceForAds < load && sourceForAds >= lowerLimit;
        const importing =
          !isPureIsland &&
          load > 0 &&
          (hasGridSource || tieImport > 0 || sourceForAds >= lowerLimit);
        const watch =
          withinTolerance || (!isPureIsland && Math.abs(pfBalance) > 0.05);
        const adsNeed = ogsRequired
          ? Math.ceil(localGen - upperLimit)
          : noLoadOgs
            ? localGen
            : sheddingRequired
              ? Math.ceil(load - sourceForAds / 0.95)
              : 0;
        const status = noLoadOgs
          ? "ogs"
          : ogsRequired
            ? "ogs"
            : sheddingRequired
              ? "shedding"
              : importing
                ? "importing"
                : watch
                  ? "watch"
                  : "supported";
        const statusLabel = noLoadOgs
          ? "OGS · No load"
          : ogsRequired
            ? "OGS required"
            : sheddingRequired
              ? "Island deficit"
              : importing
                ? "Import supported"
                : withinTolerance
                  ? "Within tolerance"
                  : hasGridSource
                    ? "Grid supported"
                    : "PF balanced";

        return {
          ...card,
          localGen,
          availableGridImport: Math.max(0, ibtFlow),
          ibtFlow,
          tieImport,
          tieExport,
          load,
          totalInflow,
          servedByFlow,
          pfBalance,
          sourceForAds,
          lowerLimit,
          upperLimit,
          adsBalancePct,
          adsNeed,
          status,
          statusLabel,
          islanded: isSplit,
          hasGridSource,
          tieDetails,
        };
      }),
    [feeders, objectStates, previewPowerFlow, tripMatrix],
  );

  const armedTargetIds = useMemo(() => {
    const ids = new Set<string>();

    for (const id of activeMatrixRow?.visualHints?.blinkArmedTargetIds ?? []) {
      ids.add(id);
    }

    for (const command of activeMatrixRow?.remedialCommands ?? []) {
      if (activeMatrixRow?.status === "armed") ids.add(command.objectId);
    }

    return ids;
  }, [activeMatrixRow]);

  const runbackTargetIds = useMemo(
    () => new Set(activeMatrixRow?.visualHints?.runbackCandidateIds ?? []),
    [activeMatrixRow],
  );
  const clampedZoom = Math.min(maxZoom, Math.max(minZoom, zoom));
  const scaledWidth = sldNativeWidth * clampedZoom;
  const scaledHeight = sldNativeHeight * clampedZoom;
  const canvasWidth = Math.max(stageSize.width, scaledWidth);
  const canvasHeight = Math.max(stageSize.height, scaledHeight);
  const layerOffsetX = Math.max(0, (canvasWidth - scaledWidth) / 2);
  const layerOffsetY = Math.max(0, (canvasHeight - scaledHeight) / 2);

  const fitToStage = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const viewportWidth = Math.max(1, stage.clientWidth - 18);
    const viewportHeight = Math.max(1, stage.clientHeight - 18);
    const nextFitZoom =
      Math.min(
        viewportWidth / sldNativeWidth,
        viewportHeight / sldNativeHeight,
      ) * 0.99;
    const nextZoom = Math.min(maxZoom, Math.max(minZoom, nextFitZoom));

    setFitZoom(nextZoom);
    setZoom(nextZoom);
    setZoomMode("fit");

    window.requestAnimationFrame(() => {
      if (!stageRef.current) return;
      stageRef.current.scrollLeft = Math.max(
        0,
        (sldNativeWidth * nextZoom - stageRef.current.clientWidth) / 2,
      );
      stageRef.current.scrollTop = Math.max(
        0,
        (sldNativeHeight * nextZoom - stageRef.current.clientHeight) / 2,
      );
    });
  }, []);

  const setManualZoom = (nextZoom: number) => {
    setZoomMode("manual");
    setZoom(Math.min(maxZoom, Math.max(minZoom, nextZoom)));
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const observer = new ResizeObserver(() => {
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
      const viewportWidth = Math.max(1, stage.clientWidth - 18);
      const viewportHeight = Math.max(1, stage.clientHeight - 18);
      const nextFitZoom =
        Math.min(
          viewportWidth / sldNativeWidth,
          viewportHeight / sldNativeHeight,
        ) * 0.99;
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, nextFitZoom));
      setFitZoom(nextZoom);
      if (zoomMode === "fit") setZoom(nextZoom);
    });

    setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [zoomMode]);

  useEffect(() => {
    if (loaded) fitToStage();
  }, [fitToStage, loaded]);

  useEffect(() => {
    let mounted = true;

    fetch(`${import.meta.env.BASE_URL}assets/SLD_ADS_HMI.svg`)
      .then((response) => {
        if (!response.ok) throw new Error(`SVG ${response.status}`);
        const ct = response.headers.get("content-type") ?? "";
        if (
          !ct.includes("svg") &&
          !ct.includes("xml") &&
          !ct.includes("text")
        ) {
          throw new Error("Not an SVG response");
        }
        return response.text();
      })
      .then((markup) => {
        if (!mounted || !hostRef.current) return;
        if (!markup.trim().startsWith("<"))
          throw new Error("Invalid SVG markup");
        hostRef.current.innerHTML = markup;
        setLoaded(true);
      })
      .catch(() => {
        if (mounted) setLoaded(false);
      });

    return () => {
      mounted = false;
      if (hoverCommitTimerRef.current)
        window.clearTimeout(hoverCommitTimerRef.current);
      if (hoverClearTimerRef.current)
        window.clearTimeout(hoverClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const root = host?.querySelector("svg");
    if (!host || !root || !loaded) return;

    root.setAttribute("preserveAspectRatio", "xMidYMid meet");
    root.setAttribute("shape-rendering", "geometricPrecision");
    root.setAttribute("text-rendering", "geometricPrecision");
    root.setAttribute(
      "viewBox",
      `${sldViewBox.x} ${sldViewBox.y} ${sldViewBox.width} ${sldViewBox.height}`,
    );
    root.setAttribute("width", String(sldNativeWidth));
    root.setAttribute("height", String(sldNativeHeight));
    root.classList.add("ads-sld-svg");
    root
      .querySelectorAll<SVGGraphicsElement>("[data-role='open-close']")
      .forEach((element) => {
        element.setAttribute("tabindex", "0");
        element.setAttribute(
          "aria-label",
          `Toggle ${element.getAttribute("data-object") ?? element.id}`,
        );
      });

    const describe = (objectId: string) => {
      const feeder = feeders.find((item) => item.id === objectId);
      const state = objectStates[objectId] ?? "closed";
      const title = feeder?.name ?? breakerNames[objectId] ?? objectId;
      const body = `${state === "closed" ? "ON / Close / energized" : "OFF / Open / dead"} - click to toggle`;
      return { title, body };
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      const node = target.closest<SVGElement>("[data-role='open-close']");
      const objectId = node?.getAttribute("data-object") ?? node?.id;
      if (!objectId) return;
      if (hoverCommitTimerRef.current)
        window.clearTimeout(hoverCommitTimerRef.current);
      lastHoverObjectRef.current = objectId;
      setHoverObject(objectId);
      toggleObject(objectId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const target = event.target as Element;
      const node = target.closest<SVGElement>("[data-role='open-close']");
      const objectId = node?.getAttribute("data-object") ?? node?.id;
      if (!objectId) {
        setTooltip(null);
        if (hoverCommitTimerRef.current)
          window.clearTimeout(hoverCommitTimerRef.current);
        if (hoverClearTimerRef.current)
          window.clearTimeout(hoverClearTimerRef.current);
        hoverClearTimerRef.current = window.setTimeout(() => {
          lastHoverObjectRef.current = null;
          setHoverObject(null);
        }, 180);
        return;
      }
      if (hoverClearTimerRef.current)
        window.clearTimeout(hoverClearTimerRef.current);
      const copy = describe(objectId);
      setTooltip({ x: event.clientX, y: event.clientY, ...copy });
      if (lastHoverObjectRef.current === objectId) return;
      if (hoverCommitTimerRef.current)
        window.clearTimeout(hoverCommitTimerRef.current);
      lastHoverObjectRef.current = null;
      setHoverObject(null);
      hoverCommitTimerRef.current = window.setTimeout(() => {
        lastHoverObjectRef.current = objectId;
        setHoverObject(objectId);
      }, 120);
    };

    const onPointerLeave = () => {
      setTooltip(null);
      if (hoverCommitTimerRef.current)
        window.clearTimeout(hoverCommitTimerRef.current);
      if (hoverClearTimerRef.current)
        window.clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = window.setTimeout(() => {
        lastHoverObjectRef.current = null;
        setHoverObject(null);
      }, 220);
    };

    host.addEventListener("click", onClick);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);

    return () => {
      host.removeEventListener("click", onClick);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [feeders, loaded, objectStates, setHoverObject, toggleObject]);

  useEffect(() => {
    const root = hostRef.current?.querySelector("svg");
    if (!root || !loaded) return;

    root
      .querySelectorAll(
        ".svg-armed,.svg-selected,.svg-runback,.svg-tripped,.svg-open,.cb-open,.cb-closed,.feeder-on,.feeder-off,.runtime-trip-chip,.runtime-arm-chip,.runtime-runback-chip",
      )
      .forEach((element) => {
        if (
          element.classList.contains("runtime-trip-chip") ||
          element.classList.contains("runtime-arm-chip") ||
          element.classList.contains("runtime-runback-chip")
        ) {
          element.remove();
          return;
        }
        element.classList.remove(
          "svg-armed",
          "svg-selected",
          "svg-runback",
          "svg-tripped",
          "svg-open",
          "cb-open",
          "cb-closed",
          "feeder-on",
          "feeder-off",
        );
      });

    const setText = (id: string, value: string) => {
      const node = root.querySelector(`#${CSS.escape(id)}`);
      if (node) node.textContent = value;
    };

    const setState = (objectId: string, isClosed: boolean) => {
      root
        .querySelectorAll(`[data-object="${CSS.escape(objectId)}"]`)
        .forEach((node) => {
          node.setAttribute("data-state", isClosed ? "closed" : "open");
          node.classList.add(isClosed ? "cb-closed" : "cb-open");
          if (!isClosed) node.classList.add("svg-open", "svg-tripped");
        });

      for (const mappedId of feederElementMap[objectId] ?? [objectId]) {
        const mapped = root.querySelector(`#${CSS.escape(mappedId)}`);
        if (mapped) {
          mapped.classList.add(isClosed ? "feeder-on" : "feeder-off");
          if (!isClosed) mapped.classList.add("svg-tripped");
        }
      }
    };

    const addRuntimeChip = (
      node: Element,
      objectId: string,
      label: "TRIPPED" | "ARMED" | "RUNBACK",
    ) => {
      if (!(node instanceof SVGGraphicsElement)) return;
      const chipClass =
        label === "RUNBACK"
          ? "runtime-runback-chip"
          : label === "ARMED"
            ? "runtime-arm-chip"
            : "runtime-trip-chip";
      const body = node.querySelector<SVGGraphicsElement>(".cb-body");
      const box = (body ?? node).getBBox();
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const chip = document.createElementNS("http://www.w3.org/2000/svg", "g");
      chip.setAttribute("class", chipClass);
      chip.setAttribute("data-chip-for", objectId);
      const width = label === "RUNBACK" ? 50 : 42;
      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      rect.setAttribute("x", String(centerX - width / 2));
      rect.setAttribute("y", String(centerY - 8));
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", "16");
      rect.setAttribute("rx", "8");
      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      text.setAttribute("x", String(centerX));
      text.setAttribute("y", String(centerY + 3));
      text.setAttribute("text-anchor", "middle");
      text.textContent = label;
      chip.append(rect, text);
      node.parentElement?.appendChild(chip);
    };

    const addTripChip = (node: Element, objectId: string) =>
      addRuntimeChip(node, objectId, "TRIPPED");

    const applyVisualHint = (objectId: string, classes: string[]) => {
      if (
        objectStates[objectId] === "open" ||
        objectStates[objectId] === "failed"
      )
        return;

      root
        .querySelectorAll(`[data-object="${CSS.escape(objectId)}"]`)
        .forEach((node) => {
          node.classList.add(...classes);
        });

      for (const mappedId of feederElementMap[objectId] ?? [objectId]) {
        root
          .querySelector(`#${CSS.escape(mappedId)}`)
          ?.classList.add(...classes);
      }
    };

    for (const [objectId, state] of Object.entries(objectStates)) {
      setState(objectId, state === "closed");
      if (objectMwText[objectId]) {
        const branchFlow = branchFlowById.get(objectId);
        const useRuleRelief =
          objectId.startsWith("LINE_") || objectId.startsWith("IBT_");
        const configuredMw = useRuleRelief
          ? (branchFlow?.absFlowMw ??
            contingencyRules[objectId]?.requiredReliefMw)
          : undefined;
        setText(
          `MW_${objectId}`,
          state === "open"
            ? "0 MW"
            : `${configuredMw ?? objectMwText[objectId].replace(" MW", "")} MW`,
        );
      }
      if (state === "open") {
        const node = root.querySelector(
          `[data-role="open-close"][data-object="${CSS.escape(objectId)}"]`,
        );
        if (node) addTripChip(node, objectId);
      }
    }

    for (const feeder of feeders) {
      setText(
        `MW_${feeder.id}`,
        `${feeder.breakerState === "closed" ? feeder.mw : 0} MW`,
      );
    }

    for (const objectId of activeMatrixRow?.visualHints?.highlightTriggerIds ??
      []) {
      applyVisualHint(objectId, ["svg-trigger-preview"]);
    }

    for (const objectId of armedTargetIds) {
      applyVisualHint(objectId, ["svg-armed", "svg-selected"]);
    }

    for (const objectId of runbackTargetIds) {
      applyVisualHint(objectId, ["svg-runback"]);
    }
  }, [
    activeMatrixRow,
    branchFlowById,
    contingencyRules,
    decision,
    displayDecision,
    feeders,
    armedTargetIds,
    hoverDecision,
    loaded,
    objectStates,
    runbackTargetIds,
  ]);

  return (
    <section
      ref={stageRef}
      className="sld-stage"
      aria-label="Single line diagram"
    >
      <div
        ref={powerCardConstraintsRef}
        className="power-card-layer"
        aria-hidden="true"
      />
      <motion.aside
        className="power-flow-card"
        aria-label="Power flow and ADS calculation"
        drag
        dragConstraints={powerCardConstraintsRef}
        dragControls={powerCardDragControls}
        dragElastic={0.05}
        dragListener={false}
        dragMomentum={false}
        initial={false}
      >
        <header
          className="power-flow-card__header"
          onPointerDown={(event) =>
            powerCardDragControls.start(event.nativeEvent)
          }
        >
          <Grip size={14} />
          <div>
            <small>Power Flow</small>
            <strong>ADS Calculation</strong>
          </div>
          <span>{frequencyHz.toFixed(2)} Hz</span>
        </header>

        <div className="power-flow-metrics">
          <div>
            <Activity size={14} />
            <span>Branch</span>
            <strong>
              {activeFlowBranch
                ? (branchLabelMap[activeFlowBranch.branchId] ??
                  activeFlowBranch.branchId)
                : "N/A"}
            </strong>
          </div>
          <div>
            <SlidersHorizontal size={14} />
            <span>Flow</span>
            <strong>
              {activeFlowBranch
                ? `${formatMw(activeFlowBranch.absFlowMw)} MW`
                : "0 MW"}
            </strong>
          </div>
          <div>
            <Zap size={14} />
            <span>Loading</span>
            <strong>
              {activeFlowBranch
                ? `${formatPct(activeFlowBranch.loadingPct)}%`
                : "0%"}
            </strong>
          </div>
          <div>
            <Gauge size={14} />
            <span>
              {activeFlowBranch?.isOverloaded ? "ADS Need" : "To 85%"}
            </span>
            <strong>
              {activeFlowBranch
                ? `${formatMw(activeFlowBranch.isOverloaded ? activeFlowBranch.requiredReductionMw : Math.max(0, activeFlowBranch.requiredReductionMw))} MW`
                : "0 MW"}
            </strong>
          </div>
        </div>

        <div className="power-flow-story">
          <small>Power Flow Lite source of truth</small>
          <p>
            {activeFlowBranch
              ? activeFlowBranch.isOverloaded
                ? `${branchLabelMap[activeFlowBranch.branchId] ?? activeFlowBranch.branchId} exceeds the ADS pickup. Direction ${activeFlowBranch.directionLabel}. Rating ${formatMw(activeFlowBranch.ratingMw)} MW, target <= ${formatMw(activeFlowBranch.targetMaxMw)} MW.`
                : `${branchLabelMap[activeFlowBranch.branchId] ?? activeFlowBranch.branchId} is below ADS pickup. It may be above the preferred 85% band, but no ADS trip is required yet.`
              : "No active branch flow is available from Power Flow Lite."}
          </p>
        </div>

        <div className="power-flow-equation">
          <span>Constraint formula</span>
          <b>
            {activeFlowBranch
              ? activeFlowBranch.isOverloaded
                ? `ADS Need = |${formatMw(activeFlowBranch.flowMw)}| - 85%×${formatMw(activeFlowBranch.ratingMw)} = ${formatMw(activeFlowBranch.requiredReductionMw)} MW`
                : `ADS Need = 0 MW · preferred-band reduction ${formatMw(Math.max(0, activeFlowBranch.requiredReductionMw))} MW`
              : "No active constraint"}
          </b>
          <span>ADS row</span>
          <b>
            {activeMatrixRow
              ? `${activeMatrixRow.status.toUpperCase()} · ${activeMatrixRow.decision.title ?? activeMatrixRow.triggerId}`
              : "Current PF snapshot"}
          </b>
        </div>

        <div
          className="branch-flow-list"
          aria-label="Top branch loading from Power Flow Lite"
        >
          {topBranchFlows.map((branch) => (
            <div
              className={branch.isOverloaded ? "is-overload" : ""}
              key={branch.branchId}
            >
              <span>{branchLabelMap[branch.branchId] ?? branch.branchId}</span>
              <b>{formatMw(branch.absFlowMw)} MW</b>
              <small>{formatPct(branch.loadingPct)}%</small>
            </div>
          ))}
        </div>
      </motion.aside>
      <div className="sld-zoom-toolbar" aria-label="SLD zoom controls">
        <button onClick={fitToStage} type="button" title="Fit all">
          <Maximize2 size={14} />
          Fit
        </button>
        <button
          onClick={() => setManualZoom(clampedZoom - 0.1)}
          type="button"
          title="Zoom out"
        >
          <Minus size={14} />
        </button>
        <span>{Math.round(clampedZoom * 100)}%</span>
        <button
          onClick={() => setManualZoom(clampedZoom + 0.1)}
          type="button"
          title="Zoom in"
        >
          <Plus size={14} />
        </button>
      </div>
      <div
        className="sld-canvas"
        style={{ height: canvasHeight, width: canvasWidth }}
      >
        <div
          ref={hostRef}
          className="sld-scale-layer"
          style={{
            left: layerOffsetX,
            top: layerOffsetY,
            transform: `scale(${clampedZoom})`,
          }}
        />
        {loaded ? (
          <div
            className="substation-flow-layer"
            style={{
              left: layerOffsetX,
              top: layerOffsetY,
              transform: `scale(${clampedZoom})`,
            }}
          >
            {substationPowerCards.map((card) => (
              <article
                className={`substation-flow-card is-${card.status}`}
                key={card.id}
                style={{ left: card.x, top: card.y }}
              >
                <header>
                  <span>{card.name.replace("Substation", "S/S")}</span>
                  <b>{card.statusLabel}</b>
                </header>
                <div className="substation-flow-card__metric">
                  <small>Src</small>
                  <strong>{formatMw(card.sourceForAds)} MW</strong>
                </div>
                <div className="substation-flow-card__metric">
                  <small>Load</small>
                  <strong>{formatMw(card.load)} MW</strong>
                </div>
                <div className="substation-flow-card__metric">
                  <small>Bal</small>
                  <strong>
                    {Number.isFinite(card.adsBalancePct)
                      ? `${formatPct(card.adsBalancePct)}%`
                      : "∞"}
                  </strong>
                </div>
                <div className="substation-flow-card__metric">
                  <small>Need</small>
                  <strong>{formatMw(card.adsNeed)} MW</strong>
                </div>
                <footer>
                  <span>PF {signedMw(card.pfBalance)} MW</span>
                  <span>
                    {card.hasGridSource
                      ? `IBT ${signedMw(card.ibtFlow)}`
                      : `Tie ${signedMw(card.tieImport - card.tieExport)}`}
                  </span>
                </footer>
                <section className="substation-flow-tooltip">
                  <strong>{card.name} Power Flow Lite reasoning</strong>
                  <p>
                    Local Gen {formatMw(card.localGen)} MW, IBT/Grid flow{" "}
                    {signedMw(card.ibtFlow)} MW, tie import{" "}
                    {formatMw(card.tieImport)} MW, tie export{" "}
                    {formatMw(card.tieExport)} MW, load {formatMw(card.load)}{" "}
                    MW.
                  </p>
                  <p>
                    PF balance = Gen + IBT + Tie import - Tie export - Load ={" "}
                    {signedMw(card.pfBalance)} MW. This card follows the current
                    PowerFlowLite branch-flow result, not static relief MW.
                  </p>
                  <p>
                    ADS source basis = Gen + positive IBT import + tie import ={" "}
                    {formatMw(card.sourceForAds)} MW. ADS balance ={" "}
                    {Number.isFinite(card.adsBalancePct)
                      ? `${formatPct(card.adsBalancePct)}%`
                      : "∞"}
                    .
                  </p>
                  <p>
                    ADS lower limit = 95% × {formatMw(card.load)} ={" "}
                    {formatMw(card.lowerLimit)} MW. Upper limit = 105% ×{" "}
                    {formatMw(card.load)} = {formatMw(card.upperLimit)} MW.
                  </p>
                  {card.tieDetails.length ? (
                    <p>Interchange: {card.tieDetails.join(" · ")}</p>
                  ) : null}
                  <p>
                    {card.status === "watch"
                      ? "PowerFlowLite shows a small shortage, but ADS source is still inside the 95% tolerance band. No load shedding is required."
                      : card.status === "shedding"
                        ? "This is a true island deficit: ADS source is below the 95% lower limit. Local load shedding is required only for this island scope."
                        : card.status === "ogs"
                          ? "Pure island generation is above the 105% upper limit. OGS/runback is required if a valid generator target exists."
                          : "PowerFlowLite and ADS balance show supported operation. No ADS action is required."}
                  </p>
                </section>
              </article>
            ))}
          </div>
        ) : null}
        {!loaded ? (
          <div className="sld-empty">
            <div className="sld-empty-card">
              <h3>SLD belum termuat</h3>
              <p>
                Letakkan file <code>SLD_ADS_HMI.svg</code> di folder{" "}
                <code>public/assets/</code> untuk menampilkan single line
                diagram. Reasoning rail, event log, dan matrix tetap berjalan
                tanpa SVG.
              </p>
            </div>
          </div>
        ) : null}
      </div>
      {tooltip ? (
        <div
          className="sld-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          <strong>{tooltip.title}</strong>
          <span>{tooltip.body}</span>
        </div>
      ) : null}
    </section>
  );
}
