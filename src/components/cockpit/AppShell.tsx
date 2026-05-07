import { useState } from "react";
import {
  Activity,
  ChevronDown,
  Gauge,
  GitBranch,
  RotateCcw,
  SlidersHorizontal,
  Waves,
  Zap
} from "lucide-react";
import { ReasoningRail } from "./ReasoningRail";
import { EngineerPanel } from "./EngineerPanel";
import { SldCanvas } from "../sld/SldCanvas";
import { useAdsStore } from "../../lib/ads/store";

export function AppShell() {
  const [frequencyHz, setFrequencyHz] = useState(50);
  const [draftFrequencyHz, setDraftFrequencyHz] = useState(48.25);
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  const reset = useAdsStore((state) => state.reset);
  const requiredReliefMw = useAdsStore((state) => state.requiredReliefMw);
  const setRequiredReliefMw = useAdsStore((state) => state.setRequiredReliefMw);
  const demandMw = useAdsStore((state) =>
    state.feeders.filter((feeder) => feeder.breakerState === "closed").reduce((sum, feeder) => sum + feeder.mw, 0)
  );
  const sourceMw = 625;
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

          <button className="command-button primary" onClick={() => setRequiredReliefMw(72)} type="button">
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

      <div className="workspace">
        <div className="main-column">
          <SldCanvas />
          <EngineerPanel />
        </div>
        <ReasoningRail />
      </div>
    </main>
  );
}
