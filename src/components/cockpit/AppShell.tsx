import { ReasoningRail } from "./ReasoningRail";
import { SldCanvas } from "../sld/SldCanvas";

export function AppShell() {
  return (
    <main className="app-shell">
      <header className="top-app-bar">
        <div className="brand-lockup">
          <span className="brand-mark">ADS</span>
          <div>
            <h1>GridDefense ADS</h1>
            <p>Smart load shedding cockpit</p>
          </div>
        </div>

        <nav className="command-strip" aria-label="Simulation commands">
          <button className="command-button primary" type="button">
            Reset
          </button>
          <button className="command-button" type="button">
            Freq 48.25 Hz
          </button>
          <button className="command-button" type="button">
            Split Bus B
          </button>
          <button className="command-button" type="button">
            Derate KIT C2
          </button>
        </nav>

        <div className="state-pill">
          <span>System Frequency</span>
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
