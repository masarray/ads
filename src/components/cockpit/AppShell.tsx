import { ReasoningRail } from "./ReasoningRail";
import { SldCanvas } from "../sld/SldCanvas";
import { useAdsStore } from "../../lib/ads/store";

export function AppShell() {
  const reset = useAdsStore((state) => state.reset);
  const requiredReliefMw = useAdsStore((state) => state.requiredReliefMw);
  const setRequiredReliefMw = useAdsStore((state) => state.setRequiredReliefMw);

  return (
    <main className="app-shell">
      <header className="top-app-bar">
        <div className="brand-lockup">
          <span className="brand-mark">~</span>
          <div>
            <h1>GridDefense ADS</h1>
            <p>Smart Defense Reasoning Cockpit</p>
          </div>
        </div>

        <nav className="command-strip" aria-label="Simulation commands">
          <button className="command-button" onClick={reset} type="button">
            Reset
          </button>
          <button className="command-button" type="button">
            50.00 Hz
          </button>
          <button className="command-button primary" onClick={() => setRequiredReliefMw(48)} type="button">
            Pre-arm 48 MW
          </button>
          <button className="command-button" onClick={() => setRequiredReliefMw(72)} type="button">
            Split Bus B
          </button>
          <button className="command-button" onClick={() => setRequiredReliefMw(118)} type="button">
            Derate KIT C2
          </button>
        </nav>

        <div className="state-pill">
          <span>Selected</span>
          <strong>{requiredReliefMw} MW</strong>
        </div>

        <div className="story-toggle">
          <span>Storyteller</span>
          <i />
        </div>

        <div className="state-pill compact">
          <span>Frequency</span>
          <strong>50.00 Hz</strong>
        </div>
      </header>

      <div className="workspace">
        <SldCanvas />
        <ReasoningRail />
      </div>
    </main>
  );
}
