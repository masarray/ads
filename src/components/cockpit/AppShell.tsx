import { useState } from "react";
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
  Zap
} from "lucide-react";
import { ReasoningRail } from "./ReasoningRail";
import { EngineerPanel } from "./EngineerPanel";
import { EventLogView } from "./EventLogView";
import { SettingsView } from "./SettingsView";
import { TrippingMatrixView } from "./TrippingMatrixView";
import { SldCanvas } from "../sld/SldCanvas";
import { useAdsStore } from "../../lib/ads/store";

type AppView = "cockpit" | "settings" | "events" | "matrix";

export function AppShell() {
  const [activeView, setActiveView] = useState<AppView>("cockpit");
  const [frequencyHz, setFrequencyHz] = useState(50);
  const [draftFrequencyHz, setDraftFrequencyHz] = useState(48.25);
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  const reset = useAdsStore((state) => state.reset);
  const requiredReliefMw = useAdsStore((state) => state.requiredReliefMw);
  const setRequiredReliefMw = useAdsStore((state) => state.setRequiredReliefMw);
  const demandMw = useAdsStore((state) =>
    state.feeders.filter((feeder) => feeder.breakerState === "closed").reduce((sum, feeder) => sum + feeder.mw, 0)
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
          <button className={`command-button ${activeView === "cockpit" ? "primary" : ""}`} onClick={() => setActiveView("cockpit")} type="button">
            <Waves size={16} />
            Cockpit
          </button>
          <button className={`command-button ${activeView === "settings" ? "primary" : ""}`} onClick={() => setActiveView("settings")} type="button">
            <Settings size={16} />
            Settings
          </button>
          <button className={`command-button ${activeView === "events" ? "primary" : ""}`} onClick={() => setActiveView("events")} type="button">
            <ListChecks size={16} />
            Event Log
          </button>
          <button className={`command-button ${activeView === "matrix" ? "primary" : ""}`} onClick={() => setActiveView("matrix")} type="button">
            <Grid3X3 size={16} />
            Matrix
          </button>

          <div className="frequency-control">
            <button className="command-button" onClick={() => setFrequencyOpen((open) => !open)} type="button">
              <Gauge size={16} />
              <strong>{frequencyHz.toFixed(2)} Hz</strong>
              <ChevronDown size={14} />
            </button>
            {frequencyOpen ? (
              <section className="frequency-popover" aria-label="Frequency injection">
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
                  onChange={(event) => setDraftFrequencyHz(Number(event.target.value))}
                  step={0.05}
                  type="range"
                  value={draftFrequencyHz}
                />
                <div className="freq-presets">
                  <button onClick={() => setDraftFrequencyHz(48.25)} type="button">UFLS 48.25</button>
                  <button onClick={() => setDraftFrequencyHz(50)} type="button">Nominal 50</button>
                  <button onClick={() => setDraftFrequencyHz(51)} type="button">OFGS 51</button>
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
              </section>
            ) : null}
          </div>

          <button className="command-button" onClick={() => setRequiredReliefMw(72)} type="button">
            <GitBranch size={16} />
            Split Bus B
          </button>
          <button className="command-button" onClick={() => setRequiredReliefMw(118)} type="button">
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
    </main>
  );
}
