import { Check, Gauge, Layers3, SlidersHorizontal, Zap } from "lucide-react";
import { useAdsStore } from "../../lib/ads/store";
import type { Feeder, LoadGroup } from "../../lib/ads/model";

const busOptions: Array<Feeder["bus"]> = ["A", "B", "C"];

export function SettingsView() {
  const {
    contingencyRules,
    feeders,
    minReserveMw,
    setReserveConfig,
    sourceMw,
    updateContingency,
    updateFeeder,
  } = useAdsStore();
  const demandMw = feeders
    .filter((feeder) => feeder.breakerState === "closed")
    .reduce((sum, feeder) => sum + feeder.mw, 0);
  const reserveMw = Math.max(0, sourceMw - demandMw);

  return (
    <section className="config-workspace" aria-label="ADS settings">
      <header className="config-hero">
        <div>
          <small>Engineering Settings</small>
          <h2>ADS Configuration</h2>
          <p>
            Atur MW load, group shedding, priority, contingency relief, area
            terdampak, dan reserve margin dari satu source of truth.
          </p>
        </div>
        <div className="config-summary">
          <span>
            <Zap size={14} /> Source <b>{sourceMw} MW</b>
          </span>
          <span>
            <SlidersHorizontal size={14} /> Demand <b>{demandMw} MW</b>
          </span>
          <span>
            <Gauge size={14} /> Reserve <b>{reserveMw} MW</b>
          </span>
        </div>
      </header>

      <div className="config-grid">
        <section className="config-panel reserve-panel">
          <header>
            <Gauge size={17} />
            <div>
              <small>Spinning Reserve</small>
              <h3>Source and Margin</h3>
            </div>
          </header>
          <label>
            <span>Available source MW</span>
            <input
              min={0}
              onChange={(event) =>
                setReserveConfig({ sourceMw: Number(event.target.value) })
              }
              type="number"
              value={sourceMw}
            />
          </label>
          <label>
            <span>Minimum reserve MW</span>
            <input
              min={0}
              onChange={(event) =>
                setReserveConfig({ minReserveMw: Number(event.target.value) })
              }
              type="number"
              value={minReserveMw}
            />
          </label>
          <p data-state={reserveMw >= minReserveMw ? "healthy" : "low"}>
            <Check size={14} />
            Reserve {reserveMw >= minReserveMw
              ? "mencukupi"
              : "di bawah batas"}{" "}
            terhadap margin {minReserveMw} MW.
          </p>
        </section>

        <section className="config-panel load-panel">
          <header>
            <Layers3 size={17} />
            <div>
              <small>Load List</small>
              <h3>Priority and Group 1-4</h3>
            </div>
          </header>
          <div
            className="load-table"
            role="table"
            aria-label="Load configuration"
          >
            <div className="load-row table-head" role="row">
              <span>Load</span>
              <span>Bus</span>
              <span>MW</span>
              <span>Group</span>
              <span>Priority</span>
              <span>Eligible</span>
            </div>
            {feeders.map((feeder) => (
              <div className="load-row" role="row" key={feeder.id}>
                <strong>{feeder.name}</strong>
                <span className="bus-chip">{feeder.bus}</span>
                <input
                  min={0}
                  onChange={(event) =>
                    updateFeeder(feeder.id, { mw: Number(event.target.value) })
                  }
                  type="number"
                  value={feeder.mw}
                />
                <select
                  onChange={(event) =>
                    updateFeeder(feeder.id, {
                      group: Number(event.target.value) as LoadGroup,
                    })
                  }
                  value={feeder.group}
                >
                  <option value={1}>G1</option>
                  <option value={2}>G2</option>
                  <option value={3}>G3</option>
                  <option value={4}>G4</option>
                </select>
                <input
                  min={1}
                  max={5}
                  onChange={(event) =>
                    updateFeeder(feeder.id, {
                      priority: Number(event.target.value),
                    })
                  }
                  type="number"
                  value={feeder.priority}
                />
                <button
                  className={`mini-toggle ${feeder.shedEligible ? "is-on" : ""}`}
                  onClick={() =>
                    updateFeeder(feeder.id, {
                      shedEligible: !feeder.shedEligible,
                    })
                  }
                  type="button"
                >
                  {feeder.shedEligible ? "Yes" : "No"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="config-panel contingency-panel">
          <header>
            <Zap size={17} />
            <div>
              <small>Contingency</small>
              <h3>Relief MW and Area</h3>
            </div>
          </header>
          <div className="contingency-list">
            {Object.entries(contingencyRules).map(([id, rule]) => (
              <article className="contingency-editor" key={id}>
                <div>
                  <small>{id}</small>
                  <strong>{rule.title}</strong>
                </div>
                <label>
                  <span>Required MW</span>
                  <input
                    min={0}
                    onChange={(event) =>
                      updateContingency(id, {
                        requiredReliefMw: Number(event.target.value),
                      })
                    }
                    type="number"
                    value={rule.requiredReliefMw}
                  />
                </label>
                <div
                  className="bus-toggle-row"
                  aria-label={`${id} affected buses`}
                >
                  {busOptions.map((bus) => {
                    const active = rule.affectedBuses.includes(bus);
                    const nextBuses = active
                      ? rule.affectedBuses.filter((item) => item !== bus)
                      : [...rule.affectedBuses, bus];
                    return (
                      <button
                        className={active ? "is-on" : ""}
                        key={bus}
                        onClick={() =>
                          updateContingency(id, { affectedBuses: nextBuses })
                        }
                        type="button"
                      >
                        Bus {bus}
                      </button>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
