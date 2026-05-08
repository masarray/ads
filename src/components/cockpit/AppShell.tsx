import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ChevronDown,
  Gauge,
  GitBranch,
  Grid3X3,
  ListChecks,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Waves,
  Zap,
} from "lucide-react";
import { ReasoningRail } from "./ReasoningRail";
import { EngineerPanel } from "./EngineerPanel";
import { EventLogView } from "./EventLogView";
import { SettingsView } from "./SettingsView";
import { TrippingMatrixView } from "./TrippingMatrixView";
import { SldCanvas } from "../sld/SldCanvas";
import { useAdsStore } from "../../lib/ads/store";

type AppView = "cockpit" | "settings" | "events" | "matrix";

const navItems: Array<{ id: AppView; label: string; icon: typeof Waves }> = [
  { id: "cockpit", label: "Cockpit", icon: Waves },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "events", label: "Event Log", icon: ListChecks },
  { id: "matrix", label: "Matrix", icon: Grid3X3 },
];

const viewVariants = {
  initial: { opacity: 0, y: 16, scale: 0.985, filter: "blur(6px)" },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.34, ease: [0.2, 0, 0, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.99,
    filter: "blur(4px)",
    transition: { duration: 0.18, ease: [0.3, 0, 1, 1] as const },
  },
};

export function AppShell() {
  const [activeView, setActiveView] = useState<AppView>("cockpit");
  const [frequencyHz, setFrequencyHz] = useState(50);
  const [draftFrequencyHz, setDraftFrequencyHz] = useState(48.25);
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  const reset = useAdsStore((state) => state.reset);
  const requiredReliefMw = useAdsStore((state) => state.requiredReliefMw);
  const setRequiredReliefMw = useAdsStore((state) => state.setRequiredReliefMw);
  const demandMw = useAdsStore((state) =>
    state.feeders
      .filter((feeder) => feeder.breakerState === "closed")
      .reduce((sum, feeder) => sum + feeder.mw, 0),
  );
  const sourceMw = useAdsStore((state) => state.sourceMw);
  const reserveMw = Math.max(0, sourceMw - demandMw);

  return (
    <main className="app-shell">
      <header className="top-app-bar">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Waves size={20} strokeWidth={2.5} />
          </span>
          <div>
            <h1>GridDefense ADS</h1>
            <p>Smart Defense Reasoning Cockpit</p>
          </div>
        </div>

        <nav className="command-strip" aria-label="Simulation commands">
          <button className="command-button" onClick={reset} type="button">
            <RotateCcw size={16} />
            Reset
          </button>

          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <span
                key={item.id}
                className={`nav-button-wrap ${active ? "is-active" : ""}`}
              >
                {active ? (
                  <motion.span
                    layoutId="nav-pill"
                    className="nav-pill-indicator"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <button
                  className="command-button"
                  onClick={() => setActiveView(item.id)}
                  type="button"
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              </span>
            );
          })}

          <div className="frequency-control">
            <button
              className="command-button"
              onClick={() => setFrequencyOpen((open) => !open)}
              type="button"
            >
              <Gauge size={16} />
              <strong>{frequencyHz.toFixed(2)} Hz</strong>
              <ChevronDown size={14} />
            </button>
            <AnimatePresence>
              {frequencyOpen ? (
                <motion.section
                  className="frequency-popover"
                  aria-label="Frequency injection"
                  initial={{ opacity: 0, scale: 0.92, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -4 }}
                  transition={{ duration: 0.22, ease: [0.3, 0, 0, 1] }}
                >
                  <header>
                    <Gauge size={16} />
                    <strong>Frequency Injection</strong>
                  </header>
                  <div className="freq-scale">
                    <span>47.5 Hz</span>
                    <b>{draftFrequencyHz.toFixed(2)} Hz</b>
                    <span>52.0 Hz</span>
                  </div>
                  <input
                    max={52}
                    min={47.5}
                    onChange={(event) =>
                      setDraftFrequencyHz(Number(event.target.value))
                    }
                    step={0.05}
                    type="range"
                    value={draftFrequencyHz}
                  />
                  <div className="freq-presets">
                    <button
                      onClick={() => setDraftFrequencyHz(48.25)}
                      type="button"
                    >
                      UFLS 48.25
                    </button>
                    <button
                      onClick={() => setDraftFrequencyHz(50)}
                      type="button"
                    >
                      Nominal 50
                    </button>
                    <button
                      onClick={() => setDraftFrequencyHz(51)}
                      type="button"
                    >
                      OFGS 51
                    </button>
                  </div>
                  <button
                    className="freq-inject"
                    onClick={() => {
                      setFrequencyHz(draftFrequencyHz);
                      setFrequencyOpen(false);
                    }}
                    type="button"
                  >
                    Inject {draftFrequencyHz.toFixed(2)} Hz
                  </button>
                </motion.section>
              ) : null}
            </AnimatePresence>
          </div>

          <button
            className="command-button"
            onClick={() => setRequiredReliefMw(72)}
            type="button"
          >
            <GitBranch size={16} />
            Split Bus B
          </button>
          <button
            className="command-button"
            onClick={() => setRequiredReliefMw(118)}
            type="button"
          >
            <Zap size={16} />
            Derate KIT C2
          </button>
        </nav>

        <div className="system-strip" aria-label="System balance">
          <div>
            <Activity size={14} />
            <span>Source</span>
            <strong>{sourceMw} MW</strong>
          </div>
          <div>
            <SlidersHorizontal size={14} />
            <span>Demand</span>
            <strong>{demandMw} MW</strong>
          </div>
          <div>
            <Zap size={14} />
            <span>Reserve</span>
            <strong>{reserveMw} MW</strong>
          </div>
          <div>
            <Gauge size={14} />
            <span>Relief</span>
            <strong>{requiredReliefMw} MW</strong>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeView}
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="view-shell"
          style={{ minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          {activeView === "cockpit" ? (
            <div className="workspace">
              <div className="main-column">
                <SldCanvas />
                <EngineerPanel />
              </div>
              <ReasoningRail />
            </div>
          ) : null}
          {activeView === "settings" ? <SettingsView /> : null}
          {activeView === "events" ? <EventLogView /> : null}
          {activeView === "matrix" ? <TrippingMatrixView /> : null}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
