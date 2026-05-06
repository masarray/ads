const settings = {
  overloadPickupPercent: 110,
  targetLoadingPercent: 80,
  islandMinRatio: 0.95,
  islandMaxRatio: 1.05,
  maxOvershedMw: 18
};

const scenarios = [
  ["TRIP_LINE_AB", "Trip Line A-B", "Line B-C and A-C overload"],
  ["TRIP_LINE_BC", "Trip Line B-C", "Remote OLS/OGS action"],
  ["TRIP_IBT_A", "Trip IBT A", "Event based IBT defense"],
  ["TRIP_IBT_C", "Trip IBT C", "External grid C loss"],
  ["TRIP_GEN_A1", "Trip KIT A1", "Generation deficit island"],
  ["TRIP_GEN_A2", "Trip KIT A2", "Generation deficit island"],
  ["TRIP_GEN_C1", "Trip KIT C1", "Generation deficit island"],
  ["TRIP_GEN_C2", "Trip KIT C2", "Generation deficit island"],
  ["DERATE_GEN_C2", "Derate KIT C2", "Frequency stress"],
  ["SPLIT_BUS_B", "Split Bus B", "Island operation"],
  ["FREQUENCY_DROP", "Frequency 48.25 Hz", "Frequency islanding"],
  ["PRE_TRIP_LOAD_A2", "Pre-trip Load A2", "Refresh arming test"]
];

const lineBreakerMap = {
  LINE_AB: ["CB_LINE_AB", "CB_LINE_AB_B"],
  LINE_BC: ["CB_LINE_BC_B", "CB_LINE_BC_C"],
  LINE_AC: ["CB_LINE_AC", "CB_LINE_AC_C"],
  LINE_COUPLER: ["CB_COUPLER"]
};

const ibtBreakerMap = {
  IBT_A: ["CB_IBT_A"],
  IBT_C: ["CB_IBT_C"]
};

const generatorBreakerMap = {
  GEN_A1: ["CB_GEN_A1"],
  GEN_A2: ["CB_GEN_A2"],
  GEN_C1: ["CB_GEN_C1"],
  GEN_C2: ["CB_GEN_C2"]
};

const loadBreakerMap = {
  LOAD_A1: ["CB_LOAD_A1"],
  LOAD_A2: ["CB_LOAD_A2"],
  LOAD_A3: ["CB_LOAD_A3"],
  LOAD_A4: ["CB_LOAD_A4"],
  LOAD_A5: ["CB_LOAD_A5"],
  LOAD_B1: ["CB_LOAD_B1"],
  LOAD_B2: ["CB_LOAD_B2"],
  LOAD_B3: ["CB_LOAD_B3"],
  LOAD_B4: ["CB_LOAD_B4"],
  LOAD_B5: ["CB_LOAD_B5"],
  LOAD_C1: ["CB_LOAD_C1"],
  LOAD_C2: ["CB_LOAD_C2"],
  LOAD_C3: ["CB_LOAD_C3"],
  LOAD_C4: ["CB_LOAD_C4"],
  LOAD_C5: ["CB_LOAD_C5"]
};

function initialSystem() {
  return {
    frequencyHz: 50,
    activeContingency: "NONE",
    lastExecutedDecision: null,
    generationLossMw: 0,
    busSplitB: false,
    cycle: 1,
    breakerFailureTarget: null,
    breakerFailures: [],
    loads: [
      load("LOAD_A1", "Load A1", "A", 42, 1, { LINE_AB: .82, LINE_AC: .55, IBT_A: .78 }),
      load("LOAD_A2", "Load A2", "A", 38, 1, { LINE_AB: .72, LINE_AC: .38, IBT_A: .70 }),
      load("LOAD_A3", "Load A3", "A", 52, 2, { LINE_AB: .58, LINE_AC: .46, IBT_A: .61 }),
      load("LOAD_A4", "Load A4", "A", 24, 3, { LINE_AB: .22, LINE_AC: .36, IBT_A: .24 }),
      load("LOAD_A5", "Load A5", "A", 18, 4, { LINE_AB: .15, LINE_AC: .18, IBT_A: .12 }, "BLOCKED"),
      load("LOAD_B1", "Load B1", "B", 44, 1, { LINE_AB: .56, LINE_BC: .64 }),
      load("LOAD_B2", "Load B2", "B", 36, 2, { LINE_AB: .43, LINE_BC: .52 }),
      load("LOAD_B3", "Load B3", "B", 31, 1, { LINE_AB: .40, LINE_BC: .60 }),
      load("LOAD_B4", "Load B4", "B", 21, 3, { LINE_AB: .20, LINE_BC: .32 }),
      load("LOAD_B5", "Load B5", "B", 16, 4, { LINE_AB: .15, LINE_BC: .16 }, "BLOCKED"),
      load("LOAD_C1", "Load C1", "C", 46, 1, { LINE_BC: .78, LINE_AC: .48, IBT_C: .72 }),
      load("LOAD_C2", "Load C2", "C", 40, 1, { LINE_BC: .68, LINE_AC: .40, IBT_C: .65 }),
      load("LOAD_C3", "Load C3", "C", 34, 2, { LINE_BC: .48, LINE_AC: .45, IBT_C: .50 }),
      load("LOAD_C4", "Load C4", "C", 26, 3, { LINE_BC: .30, LINE_AC: .34, IBT_C: .31 }),
      load("LOAD_C5", "Load C5", "C", 18, 4, { LINE_BC: .18, LINE_AC: .16, IBT_C: .20 }, "BLOCKED")
    ],
    generators: [
      generator("GEN_A1", "KIT A1", "A", 180, 250, 2),
      generator("GEN_A2", "KIT A2", "A", 135, 250, 1),
      generator("GEN_C1", "KIT C1", "C", 165, 250, 2),
      generator("GEN_C2", "KIT C2", "C", 145, 250, 1)
    ],
    lines: [
      line("LINE_AB", "Line A-B", "A", "B", 125, 88),
      line("LINE_BC", "Line B-C", "B", "C", 125, 92),
      line("LINE_AC", "Line A-C", "A", "C", 125, 70)
    ],
    ibts: [
      { id: "IBT_A", name: "IBT A", area: "A", limitMw: 100, flowMw: 72, status: "CLOSED" },
      { id: "IBT_C", name: "IBT C", area: "C", limitMw: 250, flowMw: 145, status: "CLOSED" }
    ],
    logs: []
  };
}

function load(id, name, area, mw, priorityGroup, sensitivity, status = "IN_SERVICE") {
  return { id, name, area, mw, nominalMw: mw, priorityGroup, status, sensitivity };
}

function generator(id, name, area, mw, maxMw, priorityGroup) {
  return { id, name, area, mw, maxMw, priorityGroup, status: "CLOSED" };
}

function line(id, name, from, to, limitMw, flowMw) {
  return { id, name, from, to, limitMw, flowMw, status: "CLOSED" };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fmt(n) {
  return `${Math.round(n * 10) / 10}`;
}

function now() {
  const d = new Date();
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

function liveLoads(state) {
  return state.loads.filter(l => ["IN_SERVICE", "ARMED"].includes(l.status));
}

function liveGenerators(state) {
  return state.generators.filter(g => ["CLOSED", "DERATED"].includes(g.status));
}

function totalLoad(state) {
  return liveLoads(state).reduce((sum, l) => sum + l.mw, 0);
}

function totalGeneration(state) {
  return liveGenerators(state).reduce((sum, g) => sum + g.mw, 0);
}

function powerSummary(state) {
  const generation = totalGeneration(state);
  const loadMw = totalLoad(state);
  return { generation, loadMw, balance: generation - loadMw };
}

function areaPowerSummary(state, area) {
  const generation = liveGenerators(state).filter(g => g.area === area).reduce((sum, g) => sum + g.mw, 0);
  const loadMw = liveLoads(state).filter(l => l.area === area).reduce((sum, l) => sum + l.mw, 0);
  return { area, generation, loadMw, balance: generation - loadMw };
}

function subsetOptimizer(loads, requiredMw, protectedEquipmentId, blockedIds = new Set()) {
  const candidates = loads.filter(l => l.status === "IN_SERVICE" && l.priorityGroup < 4 && l.mw > 0 && !blockedIds.has(l.id));
  let best = null;
  const count = 1 << candidates.length;

  for (let mask = 1; mask < count; mask += 1) {
    const selected = [];
    let mw = 0;
    let effect = 0;
    let priorityCost = 0;

    for (let i = 0; i < candidates.length; i += 1) {
      if (!(mask & (1 << i))) continue;
      const l = candidates[i];
      const sensitivity = protectedEquipmentId ? (l.sensitivity[protectedEquipmentId] ?? .2) : 1;
      selected.push({ ...l, expectedEffectMw: Math.round(l.mw * sensitivity * 10) / 10 });
      mw += l.mw;
      effect += l.mw * sensitivity;
      priorityCost += l.priorityGroup * l.priorityGroup * 1000;
    }

    effect = Math.round(effect * 10) / 10;
    if (effect < requiredMw) continue;

    const overshed = effect - requiredMw;
    if (overshed > Math.max(settings.maxOvershedMw, requiredMw * .35)) continue;

    const score = priorityCost + overshed * 10 + mw * .25 + selected.length * .1;
    if (!best || score < best.score) {
      best = { score, selected, effect, mw, overshed };
    }
  }

  if (!best) return { selected: [], effect: 0, mw: 0, overshed: 0 };

  return {
    ...best,
    selected: best.selected
      .sort((a, b) => a.priorityGroup - b.priorityGroup || a.mw - b.mw)
      .map(l => ({
        id: l.id,
        name: l.name,
        mw: l.mw,
        priorityGroup: l.priorityGroup,
        expectedEffectMw: l.expectedEffectMw,
        reason: protectedEquipmentId
          ? `G${l.priorityGroup}, ${l.mw} MW, effect ${l.expectedEffectMw} MW to ${protectedEquipmentId}`
          : `G${l.priorityGroup}, ${l.mw} MW, island balance target`
      }))
  };
}

function selectGenerators(gens, requiredMw) {
  const candidates = gens
    .filter(g => ["CLOSED", "DERATED"].includes(g.status) && g.priorityGroup < 4 && g.mw > 0)
    .sort((a, b) => a.priorityGroup - b.priorityGroup || Math.abs(requiredMw - a.mw) - Math.abs(requiredMw - b.mw));
  const selected = [];
  let covered = 0;
  for (const g of candidates) {
    if (covered >= requiredMw) break;
    selected.push({ id: g.id, name: g.name, mw: g.mw, priorityGroup: g.priorityGroup, expectedEffectMw: g.mw, reason: `G${g.priorityGroup}, generation reduction` });
    covered += g.mw;
  }
  return selected;
}

function runAdsCycle(state) {
  const started = performance.now();
  const logs = [
    ["info", `ADS scan #${state.cycle}`],
    ["info", `Contingency input: ${state.activeContingency}`]
  ];
  const blockedIds = new Set([
    ...(state.breakerFailureTarget ? [state.breakerFailureTarget] : []),
    ...(state.breakerFailures ?? []).filter(id => state.loads.some(l => l.id === id))
  ]);

  const overloadedLine = state.lines
    .filter(l => l.status === "CLOSED")
    .map(l => ({ ...l, loadingPct: l.flowMw / l.limitMw * 100 }))
    .filter(l => l.loadingPct >= settings.overloadPickupPercent)
    .sort((a, b) => b.loadingPct - a.loadingPct)[0];

  const overloadedIbt = state.ibts
    .filter(i => i.status === "CLOSED")
    .map(i => ({ ...i, loadingPct: i.flowMw / i.limitMw * 100 }))
    .filter(i => i.loadingPct >= settings.overloadPickupPercent)
    .sort((a, b) => b.loadingPct - a.loadingPct)[0];

  const shouldIsland = state.busSplitB || state.frequencyHz <= 48.3 || state.lines.filter(l => l.status === "TRIPPED").length >= 2;

  if (state.generationLossMw > 0) {
    const required = state.generationLossMw;
    const result = subsetOptimizer(liveLoads(state), required, null, blockedIds);
    logs.push(["warn", `Generator source loss detected: ${fmt(required)} MW`]);
    logs.push(["trip", `Adaptive load shedding target follows lost generation: ${fmt(required)} MW`]);
    result.selected.forEach(t => logs.push(["trip", `ARM ${t.name}: ${t.reason}`]));
    if (state.breakerFailureTarget) logs.push(["warn", `Breaker failure excluded ${state.breakerFailureTarget}; alternative arming recalculated`]);
    return decision("FREQUENCY_ISLAND", "Generator Trip Load Shedding", "Generator/source trip requires load shedding equal to lost active power. ADS selects the smallest valid load combination by priority.", required, result, [], logs, performance.now() - started);
  }

  if (shouldIsland) {
    const gen = totalGeneration(state);
    const loadMw = totalLoad(state);
    const ratio = loadMw ? gen / loadMw : 0;
    logs.push(["warn", `Island detected. Gen ${fmt(gen)} MW, load ${fmt(loadMw)} MW, ratio ${fmt(ratio * 100)}%`]);

    if (ratio < settings.islandMinRatio) {
      const required = Math.max(0, loadMw - gen / settings.islandMinRatio);
      const result = subsetOptimizer(liveLoads(state), required, null, blockedIds);
      result.selected.forEach(t => logs.push(["trip", `ARM ${t.name}: ${t.reason}`]));
      if (state.breakerFailureTarget) logs.push(["warn", `Breaker failure excluded ${state.breakerFailureTarget}; alternative arming recalculated`]);
      return decision("ISLAND_OPERATION", "Island Load Shedding", "Generation deficit island. ADS selects the smallest valid load combination to restore 95-105% balance.", required, result, [], logs, performance.now() - started);
    }

    if (ratio > settings.islandMaxRatio) {
      const required = Math.max(0, gen - loadMw * settings.islandMaxRatio);
      const gens = selectGenerators(liveGenerators(state), required);
      gens.forEach(t => logs.push(["trip", `ARM ${t.name}: ${t.reason}`]));
      return decision("ISLAND_OPERATION", "Island Generation Shedding", "Generation surplus island. ADS arms generator shedding to restore active-power balance.", required, { selected: [], effect: 0, mw: 0 }, gens, logs, performance.now() - started);
    }

    return decision("ISLAND_OPERATION", "Island Stable", "Island is formed, but active power balance is inside the permitted band.", 0, { selected: [], effect: 0, mw: 0 }, [], logs, performance.now() - started, "PASS");
  }

  const overloaded = overloadedLine ?? overloadedIbt;
  if (overloaded) {
    const targetFlow = overloaded.limitMw * settings.targetLoadingPercent / 100;
    const required = Math.max(0, overloaded.flowMw - targetFlow);
    const result = subsetOptimizer(liveLoads(state), required, overloaded.id, blockedIds);
    logs.push(["warn", `${overloaded.name} overload ${fmt(overloaded.flowMw / overloaded.limitMw * 100)}%`]);
    logs.push(["trip", `Required relief ${fmt(required)} MW to reach ${settings.targetLoadingPercent}% loading`]);
    result.selected.forEach(t => logs.push(["trip", `ARM ${t.name}: ${t.reason}`]));
    if (state.breakerFailureTarget) logs.push(["warn", `Breaker failure excluded ${state.breakerFailureTarget}; alternative arming recalculated`]);
    return decision("OLS_OGS", "OLS/OGS Overload Defense", `${overloaded.name} exceeds pickup. ADS sheds remote load instead of tripping the overloaded equipment.`, required, result, [], logs, performance.now() - started);
  }

  return decision("NORMAL", "Normal Monitoring", "No overload or islanding condition detected.", 0, { selected: [], effect: 0, mw: 0 }, [], logs, performance.now() - started, "STANDBY");
}

function decision(mode, title, reason, required, result, generationTargets, logs, elapsed, verdictOverride) {
  const selectedTargets = result.selected ?? [];
  const verdict = verdictOverride ?? (selectedTargets.length || generationTargets.length ? "ARMED" : "BLOCKED");
  return {
    mode,
    title,
    reason,
    requiredActionMw: Math.round(required * 10) / 10,
    selectedTargets,
    selectedGenerationTargets: generationTargets,
    selectedMw: selectedTargets.reduce((sum, t) => sum + t.mw, 0) + generationTargets.reduce((sum, t) => sum + t.mw, 0),
    expectedEffectMw: result.effect ?? generationTargets.reduce((sum, t) => sum + t.expectedEffectMw, 0),
    overshedMw: result.overshed ?? 0,
    verdict,
    cycleTimeMs: Math.round(elapsed + 14 + Math.random() * 9),
    logs: [...logs, [verdict === "BLOCKED" ? "warn" : "pass", verdict === "BLOCKED" ? "No valid arming target available" : "Optimization completed"]]
  };
}

function applyContingency(current, type) {
  const state = clone(current);
  state.activeContingency = type;
  state.lastExecutedDecision = null;
  state.generationLossMw = 0;
  state.breakerFailureTarget = null;
  state.cycle += 1;
  state.loads = state.loads.map(l => l.status === "ARMED" ? { ...l, status: "IN_SERVICE" } : l);

  if (type === "TRIP_LINE_AB") {
    tripLine(state, "LINE_AB");
    setFlow(state, "LINE_BC", 151);
    setFlow(state, "LINE_AC", 139);
  }
  if (type === "TRIP_LINE_BC") {
    tripLine(state, "LINE_BC");
    setFlow(state, "LINE_AB", 148);
    setFlow(state, "LINE_AC", 136);
  }
  if (type === "TRIP_LINE_AC") {
    tripLine(state, "LINE_AC");
    setFlow(state, "LINE_AB", 142);
    setFlow(state, "LINE_BC", 132);
  }
  if (type === "TRIP_IBT_A") {
    state.ibts.find(i => i.id === "IBT_A").status = "TRIPPED";
    setFlow(state, "LINE_AB", 144);
    setFlow(state, "LINE_AC", 134);
  }
  if (type === "TRIP_IBT_C") {
    state.ibts.find(i => i.id === "IBT_C").status = "TRIPPED";
    setFlow(state, "LINE_BC", 149);
    setFlow(state, "LINE_AC", 137);
  }
  if (type === "TRIP_GEN_A1") {
    const g = state.generators.find(x => x.id === "GEN_A1");
    state.generationLossMw = g.mw;
    g.status = "TRIPPED";
    g.mw = 0;
    state.frequencyHz = 49.1;
  }
  if (type === "TRIP_GEN_A2") {
    const g = state.generators.find(x => x.id === "GEN_A2");
    state.generationLossMw = g.mw;
    g.status = "TRIPPED";
    g.mw = 0;
    state.frequencyHz = 49.1;
  }
  if (type === "TRIP_GEN_C1") {
    const g = state.generators.find(x => x.id === "GEN_C1");
    state.generationLossMw = g.mw;
    g.status = "TRIPPED";
    g.mw = 0;
    state.frequencyHz = 49.15;
  }
  if (type === "TRIP_GEN_C2") {
    const g = state.generators.find(x => x.id === "GEN_C2");
    state.generationLossMw = g.mw;
    g.status = "TRIPPED";
    g.mw = 0;
    state.frequencyHz = 49.15;
  }
  if (type === "DERATE_GEN_C2") {
    const g = state.generators.find(x => x.id === "GEN_C2");
    g.status = "DERATED";
    g.mw = 55;
    state.frequencyHz = 49.35;
  }
  if (type === "SPLIT_BUS_B") {
    state.busSplitB = true;
    tripLine(state, "LINE_AB");
    tripLine(state, "LINE_BC");
    state.frequencyHz = 49.2;
  }
  if (type === "FREQUENCY_DROP") {
    state.frequencyHz = 48.25;
  }
  if (type === "PRE_TRIP_LOAD_A2") {
    const l = state.loads.find(x => x.id === "LOAD_A2");
    l.status = "TRIPPED";
    l.mw = 0;
  }
  return state;
}

const manualOpenContingencyMap = {
  LINE_AB: "TRIP_LINE_AB",
  LINE_BC: "TRIP_LINE_BC",
  LINE_AC: "TRIP_LINE_AC",
  IBT_A: "TRIP_IBT_A",
  IBT_C: "TRIP_IBT_C",
  GEN_A1: "TRIP_GEN_A1",
  GEN_A2: "TRIP_GEN_A2",
  GEN_C1: "TRIP_GEN_C1",
  GEN_C2: "TRIP_GEN_C2"
};

function previewContingency(current, objectId) {
  const contingency = manualOpenContingencyMap[objectId];
  if (!contingency) return null;
  const simulated = applyContingency(current, contingency);
  const decisionPreview = runAdsCycle(simulated);
  return {
    objectId,
    contingency,
    simulated,
    decision: {
      ...decisionPreview,
      title: `Preview ${decisionPreview.title}`,
      reason: `Hover preview for ${objectId}: ${decisionPreview.reason}`,
      verdict: decisionPreview.verdict === "ARMED" ? "ARMED" : decisionPreview.verdict
    }
  };
}

function tripLine(state, id) {
  const lineRef = state.lines.find(l => l.id === id);
  if (lineRef) lineRef.status = "TRIPPED";
}

function setFlow(state, id, mw) {
  const lineRef = state.lines.find(l => l.id === id);
  if (lineRef) lineRef.flowMw = mw;
}

function applyArming(current, dec) {
  const state = clone(current);
  const ids = new Set([...dec.selectedTargets, ...dec.selectedGenerationTargets].map(t => t.id));
  state.loads = state.loads.map(l => ids.has(l.id) && l.status === "IN_SERVICE" ? { ...l, status: "ARMED" } : l);
  state.logs.push(["pass", `Armed ${ids.size} target(s)`]);
  return state;
}

function issueTrip(current, dec) {
  const state = clone(current);
  const loadIds = new Set(dec.selectedTargets.map(t => t.id));
  const genIds = new Set(dec.selectedGenerationTargets.map(t => t.id));
  const relief = dec.selectedTargets.reduce((sum, t) => sum + t.expectedEffectMw, 0);

  state.loads = state.loads.map(l => loadIds.has(l.id) ? { ...l, status: "TRIPPED", mw: 0 } : l);
  state.generators = state.generators.map(g => genIds.has(g.id) ? { ...g, status: "TRIPPED", mw: 0 } : g);
  state.lines = state.lines.map(l => l.status === "CLOSED" ? { ...l, flowMw: Math.max(0, l.flowMw - relief * .58) } : l);
  state.ibts = state.ibts.map(i => i.status === "CLOSED" ? { ...i, flowMw: Math.max(0, i.flowMw - relief * .45) } : i);
  state.frequencyHz = Math.min(50, state.frequencyHz + .22);
  state.generationLossMw = 0;
  state.cycle += 1;
  state.lastExecutedDecision = {
    ...dec,
    title: `${dec.title} Executed`,
    reason: `${dec.reason} Trip command has been issued and selected target CBs are now open.`,
    verdict: "TRIP_ISSUED"
  };
  state.logs.push(["trip", `Trip command issued: ${[...loadIds, ...genIds].join(", ")}`]);
  return state;
}

function toggleObject(current, objectId) {
  const state = clone(current);
  if ((state.breakerFailures ?? []).includes(objectId)) {
    state.logs.push(["warn", `${objectId} breaker fail active; open command blocked`]);
    state.cycle += 1;
    return state;
  }

  const loadRef = state.loads.find(x => x.id === objectId);
  if (loadRef) {
    state.lastExecutedDecision = null;
    if (loadRef.status === "TRIPPED") {
      loadRef.status = loadRef.priorityGroup === 4 ? "BLOCKED" : "IN_SERVICE";
      loadRef.mw = loadRef.nominalMw;
    } else {
      loadRef.status = "TRIPPED";
      loadRef.mw = 0;
    }
    state.activeContingency = `MANUAL_${objectId}`;
    state.cycle += 1;
    state.logs.push(["warn", `Operator toggled ${objectId} load CB to ${loadRef.status === "TRIPPED" ? "OPEN" : "CLOSE"}`]);
    return state;
  }

  const collections = [state.lines, state.ibts, state.generators];
  for (const collection of collections) {
    const item = collection.find(x => x.id === objectId);
    if (!item) continue;
    state.lastExecutedDecision = null;

    const isOpening = !(item.status === "TRIPPED" || item.status === "OPEN");
    const contingency = manualOpenContingencyMap[objectId];
    if (isOpening && contingency) {
      const contingencyState = applyContingency(current, contingency);
      const tripDecision = runAdsCycle(contingencyState);
      const tripped = issueTrip(contingencyState, tripDecision);
      tripped.activeContingency = `MANUAL_${contingency}`;
      tripped.logs.push(["warn", `Manual SLD open ${objectId}; ADS contingency model ${contingency} executed`]);
      if (tripDecision.selectedTargets.length || tripDecision.selectedGenerationTargets.length) {
        tripped.logs.push(["trip", `ADS executed armed targets immediately after ${objectId}: ${[...tripDecision.selectedTargets, ...tripDecision.selectedGenerationTargets].map(t => t.name).join(", ")}`]);
      }
      return tripped;
    }

    item.status = item.status === "TRIPPED" || item.status === "OPEN" ? "CLOSED" : "TRIPPED";
    if (item.status === "CLOSED" && "id" in item) {
      restoreEquipmentNominal(item);
    }
    if (item.status === "TRIPPED" && "mw" in item) item.mw = 0;
    state.activeContingency = `MANUAL_${objectId}`;
    state.cycle += 1;
    state.logs.push(["warn", `Operator toggled ${objectId} to ${item.status}`]);
    return state;
  }
  return state;
}

function toggleBreakerFailure(current, objectId) {
  const state = clone(current);
  const failures = new Set(state.breakerFailures ?? []);
  if (failures.has(objectId)) {
    failures.delete(objectId);
    state.logs.push(["pass", `${objectId} breaker fail cleared`]);
  } else {
    failures.add(objectId);
    state.logs.push(["warn", `${objectId} breaker fail simulated; CB cannot open`]);
  }
  state.breakerFailures = [...failures];
  state.breakerFailureTarget = state.breakerFailures.find(id => state.loads.some(l => l.id === id)) ?? null;
  state.lastExecutedDecision = null;
  state.cycle += 1;
  return state;
}

function restoreEquipmentNominal(item) {
  if (item.id === "GEN_A1") item.mw = 180;
  if (item.id === "GEN_A2") item.mw = 135;
  if (item.id === "GEN_C1") item.mw = 165;
  if (item.id === "GEN_C2") item.mw = 145;
}

let state = initialSystem();
let currentDecision = runAdsCycle(state);
let preview = null;
let hoveredObjectId = null;
let contextTargetObjectId = null;

async function boot() {
  await mountSvg();
  renderScenarioButtons();
  render();
}

async function mountSvg() {
  const response = await fetch("./SLD_ADS_HMI_v2.svg");
  document.querySelector("#sldMount").innerHTML = await response.text();
  document.querySelector("#sldMount").addEventListener("click", event => {
    const cb = event.target.closest("[data-role='open-close']");
    const loadTarget = event.target.closest("[data-kind='load']");
    const objectId = cb?.dataset.object ?? loadTarget?.dataset.object;
    if (!objectId) return;
    preview = null;
    state = toggleObject(state, objectId);
    render();
  });
  document.querySelector("#sldMount").addEventListener("contextmenu", event => {
    const cb = event.target.closest("[data-role='open-close']");
    const objectId = cb?.dataset.object;
    if (!objectId) return;
    event.preventDefault();
    preview = null;
    hoveredObjectId = null;
    showBreakerContextMenu(event, objectId);
  });
  document.querySelector("#simulateCbFail").addEventListener("click", () => {
    if (!contextTargetObjectId) return;
    state = toggleBreakerFailure(state, contextTargetObjectId);
    hideBreakerContextMenu();
    render();
  });
  document.addEventListener("click", event => {
    if (!event.target.closest("#cbContextMenu")) hideBreakerContextMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") hideBreakerContextMenu();
  });
  document.querySelector("#sldMount").addEventListener("pointerover", event => {
    const cb = event.target.closest("[data-role='open-close']");
    const objectId = cb?.dataset.object;
    if (!objectId) return;
    if (hoveredObjectId === objectId) return;
    const nextPreview = previewContingency(state, objectId);
    if (!nextPreview) return;
    hoveredObjectId = objectId;
    preview = nextPreview;
    render();
  });
  document.querySelector("#sldMount").addEventListener("pointerout", event => {
    const cb = event.target.closest("[data-role='open-close']");
    if (!cb) return;
    const related = event.relatedTarget;
    if (related instanceof Element && cb.contains(related)) return;
    hoveredObjectId = null;
    preview = null;
    render();
  });
}

function showBreakerContextMenu(event, objectId) {
  contextTargetObjectId = objectId;
  const menu = document.querySelector("#cbContextMenu");
  const button = document.querySelector("#simulateCbFail");
  const isFailed = (state.breakerFailures ?? []).includes(objectId);
  button.textContent = isFailed ? "Clear CB Fail" : "Simulate CB Fail";
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 196)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 56)}px`;
  menu.classList.add("is-open");
  menu.setAttribute("aria-hidden", "false");
}

function hideBreakerContextMenu() {
  const menu = document.querySelector("#cbContextMenu");
  contextTargetObjectId = null;
  menu.classList.remove("is-open");
  menu.setAttribute("aria-hidden", "true");
}

function renderScenarioButtons() {
  const grid = document.querySelector("#scenarioGrid");
  grid.innerHTML = scenarios.map(([id, title, subtitle]) => `
    <button class="scenario" data-scenario="${id}">
      <strong>${title}</strong>
      <span>${subtitle}</span>
    </button>
  `).join("");
  grid.addEventListener("click", event => {
    const button = event.target.closest("[data-scenario]");
    if (!button) return;
    state = applyContingency(state, button.dataset.scenario);
    render();
  });
}

function render() {
  currentDecision = runAdsCycle(state);
  updateSvg();
  updateDecision();
  updateSldOverlay();
  updateMatrix();
  updatePriorities();
  updateLog();
}

function updateSvg() {
  const root = document.querySelector("#sldMount svg");
  if (!root) return;
  const displayState = state;
  const displayDecision = preview?.decision ?? state.lastExecutedDecision ?? currentDecision;
  root.querySelector("#CONTINGENCY_LABEL").textContent = preview ? `Preview: ${preview.contingency}` : `Contingency: ${state.activeContingency}`;
  root.querySelector("#FREQUENCY_LABEL").textContent = `${state.frequencyHz.toFixed(2)} Hz`;
  root.querySelector("#ARMING_TOTAL").textContent = `${preview ? "Preview arming" : "Selected shedding"}: ${fmt(displayDecision.selectedMw)} MW`;

  clearRuntime(root);
  const selectedIds = new Set([...displayDecision.selectedTargets, ...displayDecision.selectedGenerationTargets].map(t => t.id));

  for (const lineRef of displayState.lines) {
    setText(root, `MW_${lineRef.id}`, `${fmt(lineRef.flowMw)} MW`);
    const loading = lineRef.flowMw / lineRef.limitMw * 100;
    setClass(root, lineRef.id, lineRef.status === "TRIPPED" ? "svg-tripped" : loading >= settings.overloadPickupPercent ? "svg-overload" : "svg-normal");
    for (const cb of lineBreakerMap[lineRef.id] ?? []) setBreakerState(root, cb, lineRef.status === "TRIPPED" ? "open" : "closed");
  }

  for (const ibt of displayState.ibts) {
    setText(root, `MW_${ibt.id}`, `${fmt(ibt.flowMw)} MW`);
    const loading = ibt.flowMw / ibt.limitMw * 100;
    setClass(root, ibt.id, ibt.status === "TRIPPED" ? "svg-tripped" : loading >= settings.overloadPickupPercent ? "svg-overload" : "svg-normal");
    for (const cb of ibtBreakerMap[ibt.id] ?? []) setBreakerState(root, cb, ibt.status === "TRIPPED" ? "open" : "closed");
  }

  for (const gen of displayState.generators) {
    setText(root, `MW_${gen.id}`, `${fmt(gen.mw)} MW`);
    setClass(root, gen.id, gen.status === "TRIPPED" ? "svg-tripped" : gen.status === "DERATED" ? "svg-overload" : "svg-normal");
    for (const cb of generatorBreakerMap[gen.id] ?? []) {
      setBreakerState(root, cb, gen.status === "TRIPPED" ? "open" : "closed");
      if (selectedIds.has(gen.id)) setClass(root, cb, "svg-selected");
    }
  }

  for (const loadRef of displayState.loads) {
    setText(root, `MW_${loadRef.id}`, `${fmt(loadRef.mw)} MW`);
    const cls = loadRef.status === "TRIPPED" ? "svg-tripped" : loadRef.status === "BLOCKED" ? "svg-blocked" : loadRef.status === "ARMED" || selectedIds.has(loadRef.id) ? "svg-selected" : "svg-normal";
    setClass(root, loadRef.id, cls);
    for (const cb of loadBreakerMap[loadRef.id] ?? []) {
      setBreakerState(root, cb, loadRef.status === "TRIPPED" ? "open" : "closed");
      if (selectedIds.has(loadRef.id) || loadRef.status === "ARMED") setClass(root, cb, "svg-selected");
      if (loadRef.status === "BLOCKED") ensureLockIcon(root, cb);
    }
  }

  for (const failedId of state.breakerFailures ?? []) {
    const cbIds = [
      ...(lineBreakerMap[failedId] ?? []),
      ...(ibtBreakerMap[failedId] ?? []),
      ...(generatorBreakerMap[failedId] ?? []),
      ...(loadBreakerMap[failedId] ?? [])
    ];
    for (const cbId of cbIds) {
      setClass(root, cbId, "cb-failed");
      ensureBreakerFailIcon(root, cbId);
    }
  }
}

function clearRuntime(root) {
  root.querySelectorAll(".svg-normal,.svg-selected,.svg-tripped,.svg-open,.svg-blocked,.svg-overload,.cb-open,.cb-closed,.cb-failed").forEach(el => {
    el.classList.remove("svg-normal", "svg-selected", "svg-tripped", "svg-open", "svg-blocked", "svg-overload", "cb-open", "cb-closed", "cb-failed");
  });
  root.querySelectorAll(".runtime-cb-fail-icon,.runtime-lock-icon").forEach(el => el.remove());
}

function setClass(root, id, className) {
  const el = root.querySelector(`#${CSS.escape(id)}`);
  if (el) el.classList.add(className);
}

function setBreakerState(root, id, stateName) {
  const el = root.querySelector(`#${CSS.escape(id)}`);
  if (!el) return;
  el.dataset.state = stateName;
  el.classList.add(stateName === "open" ? "cb-open" : "cb-closed");
  el.classList.add(stateName === "open" ? "svg-open" : "svg-normal");
}

function appendSvgIcon(parent, className, x, y, color, draw) {
  const ns = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(ns, "g");
  g.setAttribute("class", className);
  g.setAttribute("transform", `translate(${x} ${y})`);
  g.setAttribute("fill", "none");
  g.setAttribute("stroke", color);
  g.setAttribute("stroke-width", "2.6");
  g.setAttribute("stroke-linecap", "round");
  g.setAttribute("stroke-linejoin", "round");
  g.setAttribute("pointer-events", "none");
  draw(g, ns);
  parent.appendChild(g);
}

function ensureBreakerFailIcon(root, cbId) {
  const cb = root.querySelector(`#${CSS.escape(cbId)}`);
  const body = root.querySelector(`#${CSS.escape(cbId)}_BODY`) ?? cb?.querySelector(".cb-body");
  if (!cb || !body || cb.querySelector(".runtime-cb-fail-icon")) return;
  const x = Number(body.getAttribute("x") ?? 0) + Number(body.getAttribute("width") ?? 0) / 2 - 12;
  const y = Number(body.getAttribute("y") ?? 0) + Number(body.getAttribute("height") ?? 0) / 2 - 12;
  appendSvgIcon(cb, "runtime-cb-fail-icon", x, y, "#f97316", (g, ns) => {
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");
    g.appendChild(circle);
    const slash = document.createElementNS(ns, "path");
    slash.setAttribute("d", "M4.929 4.929 19.07 19.071");
    g.appendChild(slash);
  });
}

function ensureLockIcon(root, cbId) {
  const cb = root.querySelector(`#${CSS.escape(cbId)}`);
  const body = root.querySelector(`#${CSS.escape(cbId)}_BODY`) ?? cb?.querySelector(".cb-body");
  if (!cb || !body || cb.querySelector(".runtime-lock-icon")) return;
  const x = Number(body.getAttribute("x") ?? 0) + Number(body.getAttribute("width") ?? 0) / 2 - 12;
  const y = Number(body.getAttribute("y") ?? 0) + Number(body.getAttribute("height") ?? 0) / 2 - 12;
  appendSvgIcon(cb, "runtime-lock-icon", x, y, "#f59e0b", (g, ns) => {
    const keyhole = document.createElementNS(ns, "circle");
    keyhole.setAttribute("cx", "12");
    keyhole.setAttribute("cy", "16");
    keyhole.setAttribute("r", "1");
    g.appendChild(keyhole);
    const bodyRect = document.createElementNS(ns, "rect");
    bodyRect.setAttribute("x", "3");
    bodyRect.setAttribute("y", "10");
    bodyRect.setAttribute("width", "18");
    bodyRect.setAttribute("height", "12");
    bodyRect.setAttribute("rx", "2");
    g.appendChild(bodyRect);
    const shackle = document.createElementNS(ns, "path");
    shackle.setAttribute("d", "M7 10V7a5 5 0 0 1 10 0v3");
    g.appendChild(shackle);
  });
}

function setText(root, id, value) {
  const el = root.querySelector(`#${CSS.escape(id)}`);
  if (el) el.textContent = value;
}

function updateDecision() {
  const displayDecision = preview?.decision ?? state.lastExecutedDecision ?? currentDecision;
  document.querySelector("#decisionTitle").textContent = displayDecision.title;
  document.querySelector("#decisionReason").textContent = displayDecision.reason;
  document.querySelector("#selectedMw").textContent = `${fmt(displayDecision.selectedMw)} MW`;
  document.querySelector("#lossAvoided").textContent = `${fmt(Math.max(0, displayDecision.expectedEffectMw - displayDecision.requiredActionMw))} MW`;
  const verdict = document.querySelector("#decisionVerdict");
  verdict.textContent = preview ? `PREVIEW ${displayDecision.verdict}` : displayDecision.verdict;
  verdict.className = `pill ${displayDecision.verdict === "ARMED" ? "armed" : displayDecision.verdict === "TRIP_ISSUED" ? "trip" : displayDecision.verdict === "PASS" ? "pass" : displayDecision.verdict === "BLOCKED" ? "blocked" : "standby"}`;

  const targets = [...displayDecision.selectedTargets, ...displayDecision.selectedGenerationTargets];
  document.querySelector("#targetList").innerHTML = targets.length
    ? targets.map(t => `<article class="target-card"><div><strong>${t.name}</strong><span>${t.reason}</span></div><b>${fmt(t.mw)} MW</b></article>`).join("")
    : `<article class="target-card"><div><strong>No target armed</strong><span>System is secure or no valid target is available.</span></div><b>0 MW</b></article>`;
}

function updateSldOverlay() {
  const overlay = document.querySelector("#sldOverlay");
  if (!overlay) return;

  const displayDecision = preview?.decision ?? state.lastExecutedDecision ?? currentDecision;
  const sourceLabel = preview
    ? `${preview.objectId} hover preview`
    : state.lastExecutedDecision
      ? state.activeContingency
      : state.activeContingency === "NONE"
        ? "Live ADS scan"
        : state.activeContingency;
  const targets = [...displayDecision.selectedTargets, ...displayDecision.selectedGenerationTargets];
  const balance = powerSummary(state);
  const areas = ["A", "B", "C"].map(area => areaPowerSummary(state, area));
  const tone = preview ? "preview" : state.lastExecutedDecision ? "executed" : "live";
  const title = preview
    ? "Arming Preview"
    : state.lastExecutedDecision
      ? "Executed Trip Result"
      : displayDecision.mode === "NORMAL"
        ? "Live Calculation"
        : "ADS Calculation";

  overlay.className = `sld-overlay ${tone}`;
  overlay.innerHTML = `
    <div class="overlay-eyebrow">
      <span>${sourceLabel}</span>
      <b>${displayDecision.mode}</b>
    </div>
    <h3>${title}</h3>
    <p>${displayDecision.reason}</p>
    <div class="overlay-metrics">
      <article>
        <span>Gen</span>
        <strong>${fmt(balance.generation)} MW</strong>
      </article>
      <article>
        <span>Load</span>
        <strong>${fmt(balance.loadMw)} MW</strong>
      </article>
      <article>
        <span>Delta</span>
        <strong>${fmt(balance.balance)} MW</strong>
      </article>
      <article>
        <span>Cycle</span>
        <strong>${displayDecision.cycleTimeMs} ms</strong>
      </article>
    </div>
    <div class="overlay-balance">
      ${areas.map(a => `
        <div class="balance-chip">
          <span>GI ${a.area}</span>
          <strong>${fmt(a.balance)} MW</strong>
        </div>
      `).join("")}
    </div>
    <div class="overlay-metrics">
      <article>
        <span>Required</span>
        <strong>${fmt(displayDecision.requiredActionMw)} MW</strong>
      </article>
      <article>
        <span>Selected</span>
        <strong>${fmt(displayDecision.selectedMw)} MW</strong>
      </article>
      <article>
        <span>Margin</span>
        <strong>${fmt(Math.max(0, displayDecision.selectedMw - displayDecision.requiredActionMw))} MW</strong>
      </article>
      <article>
        <span>Fail</span>
        <strong>${(state.breakerFailures ?? []).length}</strong>
      </article>
    </div>
    <div class="overlay-targets">
      ${targets.length ? targets.map(t => `
        <div class="overlay-target">
          <div>
            <strong>${t.name}</strong>
          </div>
          <b>${fmt(t.mw)} MW</b>
        </div>
      `).join("") : `
        <div class="overlay-target">
          <div>
            <strong>No arming target</strong>
            <small>System is inside secure operating range.</small>
          </div>
          <b>0 MW</b>
        </div>
      `}
    </div>
  `;
}

function updateMatrix() {
  const rows = scenarios.map(([id, title]) => {
    const simulated = runAdsCycle(applyContingency(state, id));
    const targets = [...simulated.selectedTargets, ...simulated.selectedGenerationTargets];
    return `
      <tr>
        <td>${title}</td>
        <td>${simulated.mode}</td>
        <td>${fmt(simulated.requiredActionMw)} MW</td>
        <td>${targets.length ? targets.map(t => `${t.name} (${fmt(t.mw)} MW, G${t.priorityGroup})`).join(", ") : "-"}</td>
        <td>${fmt(simulated.selectedMw)} MW</td>
        <td>${simulated.verdict}</td>
      </tr>
    `;
  }).join("");
  document.querySelector("#armingMatrix").innerHTML = rows;
}

function updatePriorities() {
  document.querySelector("#priorityEditor").innerHTML = state.loads.map(l => `
    <article class="load-row">
      <div>
        <strong>${l.name}</strong>
        <span>${fmt(l.mw)} MW | ${l.status}</span>
      </div>
      <select data-priority="${l.id}" ${l.status === "TRIPPED" ? "disabled" : ""}>
        ${[1, 2, 3, 4].map(g => `<option value="${g}" ${l.priorityGroup === g ? "selected" : ""}>G${g}</option>`).join("")}
      </select>
      <span>${l.priorityGroup === 4 ? "Blocked" : "Ready"}</span>
    </article>
  `).join("");

  document.querySelectorAll("[data-priority]").forEach(select => {
    select.addEventListener("change", event => {
      const id = event.target.dataset.priority;
      const group = Number(event.target.value);
      state = clone(state);
      const l = state.loads.find(x => x.id === id);
      l.priorityGroup = group;
      l.status = group === 4 ? "BLOCKED" : l.status === "BLOCKED" ? "IN_SERVICE" : l.status;
      state.cycle += 1;
      state.logs.push(["info", `${l.name} priority changed to Group ${group}`]);
      render();
    });
  });
}

function updateLog() {
  const merged = [...state.logs, ...currentDecision.logs].slice(-24).reverse();
  document.querySelector("#eventLog").innerHTML = merged.map(([severity, message]) => `
    <article class="log-row ${severity}">
      <span>${now()}</span>
      <b>${severity.toUpperCase()}</b>
      <div>${message}</div>
    </article>
  `).join("");
}

boot();
