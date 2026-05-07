import { Maximize2, Minus, Plus } from "lucide-react";
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
  LOAD_C5: ["LOAD_C5", "Arrow 12"]
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
  GEN_C2: "Generator C2"
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
  GEN_C2: "145 MW"
};

const sldViewBox = {
  x: 35,
  y: 170,
  width: 1850,
  height: 840
};
const sldNativeWidth = sldViewBox.width;
const sldNativeHeight = sldViewBox.height;
const minZoom = 0.45;
const maxZoom = 1.35;

export function SldCanvas() {
  const stageRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const hoverCommitTimerRef = useRef<number | null>(null);
  const hoverClearTimerRef = useRef<number | null>(null);
  const lastHoverObjectRef = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fitZoom, setFitZoom] = useState(0.7);
  const [zoom, setZoom] = useState(0.7);
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; body: string } | null>(null);
  const feeders = useAdsStore((state) => state.feeders);
  const contingencyRules = useAdsStore((state) => state.contingencyRules);
  const objectStates = useAdsStore((state) => state.objectStates);
  const decision = useAdsStore((state) => state.decision);
  const hoverDecision = useAdsStore((state) => state.hoverDecision);
  const toggleObject = useAdsStore((state) => state.toggleObject);
  const setHoverObject = useAdsStore((state) => state.setHoverObject);
  const displayDecision = hoverDecision ?? decision;
  const selectedIds = useMemo(
    () => new Set((hoverDecision ?? decision).selected?.feeders.map((feeder) => feeder.id) ?? []),
    [decision, hoverDecision]
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
    const nextFitZoom = Math.min(viewportWidth / sldNativeWidth, viewportHeight / sldNativeHeight) * 0.99;
    const nextZoom = Math.min(maxZoom, Math.max(minZoom, nextFitZoom));

    setFitZoom(nextZoom);
    setZoom(nextZoom);
    setZoomMode("fit");

    window.requestAnimationFrame(() => {
      if (!stageRef.current) return;
      stageRef.current.scrollLeft = Math.max(0, (sldNativeWidth * nextZoom - stageRef.current.clientWidth) / 2);
      stageRef.current.scrollTop = Math.max(0, (sldNativeHeight * nextZoom - stageRef.current.clientHeight) / 2);
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
      const nextFitZoom = Math.min(viewportWidth / sldNativeWidth, viewportHeight / sldNativeHeight) * 0.99;
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
      .then((response) => response.text())
      .then((markup) => {
        if (mounted && hostRef.current) {
          hostRef.current.innerHTML = markup;
          setLoaded(true);
        }
      })
      .catch(() => {
        if (mounted) setLoaded(false);
      });

    return () => {
      mounted = false;
      if (hoverCommitTimerRef.current) window.clearTimeout(hoverCommitTimerRef.current);
      if (hoverClearTimerRef.current) window.clearTimeout(hoverClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const root = host?.querySelector("svg");
    if (!host || !root || !loaded) return;

    root.setAttribute("preserveAspectRatio", "xMidYMid meet");
    root.setAttribute("shape-rendering", "geometricPrecision");
    root.setAttribute("text-rendering", "geometricPrecision");
    root.setAttribute("viewBox", `${sldViewBox.x} ${sldViewBox.y} ${sldViewBox.width} ${sldViewBox.height}`);
    root.setAttribute("width", String(sldNativeWidth));
    root.setAttribute("height", String(sldNativeHeight));
    root.classList.add("ads-sld-svg");
    root.querySelectorAll<SVGGraphicsElement>("[data-role='open-close']").forEach((element) => {
      element.setAttribute("tabindex", "0");
      element.setAttribute("aria-label", `Toggle ${element.getAttribute("data-object") ?? element.id}`);
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
      if (hoverCommitTimerRef.current) window.clearTimeout(hoverCommitTimerRef.current);
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
        if (hoverCommitTimerRef.current) window.clearTimeout(hoverCommitTimerRef.current);
        if (hoverClearTimerRef.current) window.clearTimeout(hoverClearTimerRef.current);
        hoverClearTimerRef.current = window.setTimeout(() => {
          lastHoverObjectRef.current = null;
          setHoverObject(null);
        }, 180);
        return;
      }
      if (hoverClearTimerRef.current) window.clearTimeout(hoverClearTimerRef.current);
      const copy = describe(objectId);
      setTooltip({ x: event.clientX, y: event.clientY, ...copy });
      if (lastHoverObjectRef.current === objectId) return;
      if (hoverCommitTimerRef.current) window.clearTimeout(hoverCommitTimerRef.current);
      lastHoverObjectRef.current = null;
      setHoverObject(null);
      hoverCommitTimerRef.current = window.setTimeout(() => {
        lastHoverObjectRef.current = objectId;
        setHoverObject(objectId);
      }, 120);
    };

    const onPointerLeave = () => {
      setTooltip(null);
      if (hoverCommitTimerRef.current) window.clearTimeout(hoverCommitTimerRef.current);
      if (hoverClearTimerRef.current) window.clearTimeout(hoverClearTimerRef.current);
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
      .querySelectorAll(".svg-armed,.svg-selected,.svg-tripped,.svg-open,.cb-open,.cb-closed,.feeder-on,.feeder-off,.runtime-trip-chip")
      .forEach((element) => {
        if (element.classList.contains("runtime-trip-chip")) {
          element.remove();
          return;
        }
        element.classList.remove("svg-armed", "svg-selected", "svg-tripped", "svg-open", "cb-open", "cb-closed", "feeder-on", "feeder-off");
      });

    const setText = (id: string, value: string) => {
      const node = root.querySelector(`#${CSS.escape(id)}`);
      if (node) node.textContent = value;
    };

    const setState = (objectId: string, isClosed: boolean) => {
      root.querySelectorAll(`[data-object="${CSS.escape(objectId)}"]`).forEach((node) => {
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

    const addTripChip = (node: Element, objectId: string) => {
      if (!(node instanceof SVGGraphicsElement)) return;
      const body = node.querySelector<SVGGraphicsElement>(".cb-body");
      const box = (body ?? node).getBBox();
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const chip = document.createElementNS("http://www.w3.org/2000/svg", "g");
      chip.setAttribute("class", "runtime-trip-chip");
      chip.setAttribute("data-chip-for", objectId);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(centerX - 20));
      rect.setAttribute("y", String(centerY - 8));
      rect.setAttribute("width", "40");
      rect.setAttribute("height", "16");
      rect.setAttribute("rx", "8");
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(centerX));
      text.setAttribute("y", String(centerY + 3));
      text.setAttribute("text-anchor", "middle");
      text.textContent = "TRIPPED";
      chip.append(rect, text);
      node.parentElement?.appendChild(chip);
    };

    for (const [objectId, state] of Object.entries(objectStates)) {
      setState(objectId, state === "closed");
      if (objectMwText[objectId]) {
        const configuredMw = contingencyRules[objectId]?.requiredReliefMw;
        setText(`MW_${objectId}`, state === "open" ? "0 MW" : `${configuredMw ?? objectMwText[objectId].replace(" MW", "")} MW`);
      }
      if (state === "open") {
        const node = root.querySelector(`[data-role="open-close"][data-object="${CSS.escape(objectId)}"]`);
        if (node) addTripChip(node, objectId);
      }
    }

    for (const feeder of feeders) {
      setText(`MW_${feeder.id}`, `${feeder.breakerState === "closed" ? feeder.mw : 0} MW`);
      if (hoverDecision && hoverDecision.status !== "executed" && selectedIds.has(feeder.id)) {
        root.querySelectorAll(`[data-object="${CSS.escape(feeder.id)}"]`).forEach((node) => {
          node.classList.add("svg-armed", "svg-selected");
        });
        for (const mappedId of feederElementMap[feeder.id] ?? [feeder.id]) {
          root.querySelector(`#${CSS.escape(mappedId)}`)?.classList.add("svg-armed", "svg-selected");
        }
      }
    }
  }, [contingencyRules, decision, displayDecision, feeders, hoverDecision, loaded, objectStates, selectedIds]);

  return (
    <section ref={stageRef} className="sld-stage" aria-label="Single line diagram">
      <div className="sld-zoom-toolbar" aria-label="SLD zoom controls">
        <button onClick={fitToStage} type="button" title="Fit all">
          <Maximize2 size={14} />
          Fit
        </button>
        <button onClick={() => setManualZoom(clampedZoom - 0.1)} type="button" title="Zoom out">
          <Minus size={14} />
        </button>
        <span>{Math.round(clampedZoom * 100)}%</span>
        <button onClick={() => setManualZoom(clampedZoom + 0.1)} type="button" title="Zoom in">
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
            transform: `scale(${clampedZoom})`
          }}
        />
      </div>
      {tooltip ? (
        <div className="sld-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <strong>{tooltip.title}</strong>
          <span>{tooltip.body}</span>
        </div>
      ) : null}
    </section>
  );
}
