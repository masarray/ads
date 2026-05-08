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
  GitFork,
  Info,
  X,
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

const navItems: Array<{ id: AppView; label: string; icon: typeof GitFork }> = [
  { id: "cockpit", label: "Cockpit", icon: GitFork },
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
  const [aboutOpen, setAboutOpen] = useState(false);
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
            <GitFork size={20} strokeWidth={2.5} />
          </span>
          <div>
            <h1>Adaptive Defense Scheme</h1>
            <p>Smart ADS Reasoning Cockpit</p>
          </div>
        </div>

        <nav className="command-strip" aria-label="Simulation commands">
          <button className="command-button" onClick={reset} type="button">
            <RotateCcw size={16} />
            Reset
          </button>

          <span className="topbar-separator" aria-hidden="true" />

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

          <span className="topbar-separator" aria-hidden="true" />

          <div className="frequency-control">
            <button
              className="command-button"
              onClick={() => {
                setFrequencyOpen((open) => !open);
                setAboutOpen(false);
              }}
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

        <div className="topbar-right">
          <span
            className="topbar-separator topbar-separator--metrics"
            aria-hidden="true"
          />

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

          <div className="about-control">
            <button
              aria-label="About developer"
              className="about-button"
              data-tooltip="About developer"
              onClick={() => {
                setAboutOpen((open) => !open);
                setFrequencyOpen(false);
              }}
              type="button"
            >
              <Info size={17} strokeWidth={2.7} />
            </button>

            <AnimatePresence>
              {aboutOpen ? (
                <>
                  <motion.button
                    aria-label="Close about developer"
                    className="about-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setAboutOpen(false)}
                    type="button"
                  />
                  <motion.section
                    aria-label="About Ari Sulistiono"
                    className="about-popover"
                    initial={{ opacity: 0, scale: 0.92, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: -6 }}
                    transition={{ duration: 0.22, ease: [0.3, 0, 0, 1] }}
                  >
                    <header className="about-card-header">
                      <span className="about-avatar">AS</span>
                      <div>
                        <small>Developed by</small>
                        <h3>Ari Sulistiono</h3>
                      </div>
                      <button
                        aria-label="Close developer card"
                        className="about-close"
                        onClick={() => setAboutOpen(false)}
                        type="button"
                      >
                        <X size={15} />
                      </button>
                    </header>

                    <p className="about-role">
                      Substation Automation Engineer · Digital Substation Tools
                    </p>

                    <div className="about-chips">
                      <span>ADS Logic</span>
                      <span>IEC 61850</span>
                      <span>Protection</span>
                      <span>SCADA</span>
                    </div>

                    <p className="about-copy">
                      GridDefense ADS is a smart defense reasoning cockpit
                      prototype for visualizing contingency impact, optimized
                      load shedding, and minimum lost MW decisions.
                    </p>
                  </motion.section>
                </>
              ) : null}
            </AnimatePresence>
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
