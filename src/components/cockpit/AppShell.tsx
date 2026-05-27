import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  Gauge,
  GitBranch,
  Grid3X3,
  ListChecks,
  Power,
  RotateCcw,
  Settings,
  GitFork,
  UserStar,
  X,
  Zap,
} from "lucide-react";
import { ReasoningRail } from "./ReasoningRail";
import { useAdsStore } from "../../lib/ads/store";

import { SldCanvas } from "../sld/SldCanvas";
import { EngineerPanel } from "./EngineerPanel";
const EventLogView = lazy(() =>
  import("./EventLogView").then((module) => ({ default: module.EventLogView })),
);
const SettingsView = lazy(() =>
  import("./SettingsView").then((module) => ({ default: module.SettingsView })),
);
const TrippingMatrixView = lazy(() =>
  import("./TrippingMatrixView").then((module) => ({
    default: module.TrippingMatrixView,
  })),
);

type AppView = "cockpit" | "settings" | "events" | "matrix";

const navItems: Array<{ id: AppView; label: string; icon: typeof GitFork }> = [
  { id: "cockpit", label: "Cockpit", icon: GitFork },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "events", label: "Event Log", icon: ListChecks },
  { id: "matrix", label: "Matrix", icon: Grid3X3 },
];

function StartupSplash() {
  return (
    <main className="startup-splash" aria-label="Loading Mas Ari ADS cockpit">
      <div className="startup-orb" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <section className="startup-card">
        <div className="startup-brand-row">
          <span className="startup-brand-mark">
            <GitFork size={24} strokeWidth={2.6} />
          </span>
          <div>
            <h1>Mas Ari ADS</h1>
            <p>Preparing smart defense scheme cockpit</p>
          </div>
        </div>
        <div className="startup-progress" aria-hidden="true">
          <span />
        </div>
        <div className="startup-steps">
          <span>Loading SLD model</span>
          <span>Preparing Power Flow Lite</span>
          <span>Building Trip Matrix</span>
        </div>
      </section>
    </main>
  );
}

function ViewLoadingSkeleton({ title }: { title: string }) {
  return (
    <section className="view-loading-skeleton" aria-label={title}>
      <div className="view-loading-card">
        <span className="skeleton-dot" aria-hidden="true" />
        <div>
          <h3>{title}</h3>
          <p>Loading only when needed to keep the cockpit startup fast.</p>
        </div>
      </div>
      <div className="skeleton-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

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
  const [bootReady, setBootReady] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("cockpit");
  const [draftFrequencyHz, setDraftFrequencyHz] = useState(48.25);
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const aboutDragConstraintsRef = useRef<HTMLDivElement>(null);
  const aboutDragControls = useDragControls();
  const reset = useAdsStore((state) => state.reset);
  const frequencyHz = useAdsStore((state) => state.frequencyHz);
  const runTimedScenario = useAdsStore((state) => state.runTimedScenario);
  const runBlackstartSequence = useAdsStore(
    (state) => state.runBlackstartSequence,
  );
  const scenarioRun = useAdsStore((state) => state.scenarioRun);

  useEffect(() => {
    const timer = window.setTimeout(() => setBootReady(true), 760);
    return () => window.clearTimeout(timer);
  }, []);

  if (!bootReady) return <StartupSplash />;

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
          <button
            className="command-button blackstart-command"
            disabled={scenarioRun?.active}
            onClick={runBlackstartSequence}
            type="button"
          >
            <Power size={16} />
            Blackstart
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
                setHelpOpen(false);
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
                    disabled={scenarioRun?.active}
                    onClick={() => {
                      runTimedScenario("frequency_islanding", draftFrequencyHz);
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
            disabled={scenarioRun?.active}
            onClick={() => runTimedScenario("topology_split")}
            type="button"
          >
            <GitBranch size={16} />
            Split Bus B
          </button>
          <button
            className="command-button"
            disabled={scenarioRun?.active}
            onClick={() => runTimedScenario("generation_derate")}
            type="button"
          >
            <Zap size={16} />
            Derate KIT C2
          </button>
          <button
            className="command-button"
            disabled={scenarioRun?.active}
            onClick={() => runTimedScenario("ols_overload")}
            type="button"
          >
            <AlertTriangle size={16} />
            OLS IBT C
          </button>
          <button
            className="command-button"
            disabled={scenarioRun?.active}
            onClick={() => runTimedScenario("ogs_surplus")}
            type="button"
          >
            <Gauge size={16} />
            OGS Island
          </button>
        </nav>

        <div className="topbar-right">
          <div className="about-control">
            <button
              aria-label="Cara penggunaan app"
              className="about-button help-button"
              data-tooltip="Cara penggunaan app"
              onClick={() => {
                setHelpOpen((open) => !open);
                setAboutOpen(false);
                setFrequencyOpen(false);
              }}
              type="button"
            >
              <span className="help-question-mark" aria-hidden="true">
                ?
              </span>
            </button>
          </div>

          <div className="about-control">
            <button
              aria-label="About developer"
              className="about-button"
              data-tooltip="About developer"
              onClick={() => {
                setAboutOpen((open) => !open);
                setHelpOpen(false);
                setFrequencyOpen(false);
              }}
              type="button"
            >
              <UserStar size={17} strokeWidth={2.7} />
            </button>
          </div>
        </div>
      </header>

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
            <motion.div
              ref={aboutDragConstraintsRef}
              className="about-floating-layer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.3, 0, 0, 1] }}
            >
              <motion.section
                aria-label="About Ari Sulistiono"
                className="about-floating-card"
                drag
                dragConstraints={aboutDragConstraintsRef}
                dragControls={aboutDragControls}
                dragElastic={0.07}
                dragListener={false}
                dragMomentum={false}
                initial={{ opacity: 0, scale: 0.88, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 10 }}
                transition={{ duration: 0.24, ease: [0.3, 0, 0, 1] }}
              >
                <header
                  aria-label="Drag about developer card"
                  className="about-card-header about-card-drag-handle"
                  onPointerDown={(event) =>
                    aboutDragControls.start(event.nativeEvent)
                  }
                >
                  <span className="about-drag-grip" aria-hidden="true">
                    <span />
                    <span />
                  </span>
                  <span className="about-avatar">AS</span>
                  <div>
                    <small>Developed by</small>
                    <h3>Ari Sulistiono</h3>
                  </div>
                  <button
                    aria-label="Close developer card"
                    className="about-close"
                    onClick={() => setAboutOpen(false)}
                    onPointerDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    <X size={15} />
                  </button>
                </header>

                <p className="about-role">
                  Substation Automation Engineer · Personal Defense Scheme Logic
                  Exploration
                </p>

                <div className="about-chips">
                  <span>Power Flow Lite</span>
                  <span>Trip Matrix</span>
                  <span>ADS / OLS / OGS</span>
                  <span>GPL-3.0</span>
                </div>

                <p className="about-copy">
                  This application is a personal coding exploration of a smarter
                  Defense Scheme reasoning concept based on topology awareness,
                  fast Power Flow Lite calculation, source-load balance, island
                  detection, and explainable trip-matrix logic.
                </p>
                <p className="about-copy">
                  The purpose of this demo is to show how a defense scheme can
                  make more reasoned decisions: understanding power direction,
                  local source availability, grid/IBT support, island balance,
                  and whether load shedding, generator runback, or no action is
                  actually justified.
                </p>
                <p className="about-copy about-disclaimer">
                  This is a personal demo and learning project. It is not a
                  commercial product, not affiliated with any company, and not
                  an official representation of any employer, utility, customer,
                  or vendor system. It may be used by anyone to learn and teach
                  smart defense scheme concepts based on fast power-flow load
                  shedding reasoning.
                </p>
                <p className="about-copy about-license">
                  Open-source GPL-3.0 personal exploration for better, more
                  transparent, and more explainable power-system defense logic.
                </p>
              </motion.section>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {helpOpen ? (
          <>
            <motion.button
              aria-label="Close app guide"
              className="about-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHelpOpen(false)}
              type="button"
            />
            <motion.div
              className="about-floating-layer help-floating-layer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.3, 0, 0, 1] }}
            >
              <motion.section
                aria-label="Cara penggunaan Adaptive Defense Scheme app"
                className="about-floating-card help-floating-card"
                initial={{ opacity: 0, scale: 0.9, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 10 }}
                transition={{ duration: 0.24, ease: [0.3, 0, 0, 1] }}
              >
                <header className="about-card-header help-card-header">
                  <span className="about-avatar help-avatar">?</span>
                  <div>
                    <small>Operator Guide</small>
                    <h3>Cara Penggunaan App</h3>
                  </div>
                  <button
                    aria-label="Close app guide"
                    className="about-close"
                    onClick={() => setHelpOpen(false)}
                    type="button"
                  >
                    <X size={15} />
                  </button>
                </header>

                <div className="help-grid">
                  <section className="help-section help-section--wide">
                    <h4>1. Cara membaca cockpit</h4>
                    <p>
                      SLD adalah area simulasi. Arahkan mouse ke CB, IBT, line,
                      coupler, atau generator untuk melihat preview contingency
                      dari Trip Matrix. Hover hanya preview; tidak mengubah
                      kondisi sistem.
                    </p>
                    <p>
                      Panel Power Flow menampilkan hasil Power Flow Lite: aliran
                      MW, loading branch, dan kebutuhan pengurangan flow. Rail
                      kanan menjelaskan keputusan Trip Matrix yang sedang
                      di-hover atau kondisi live sistem.
                    </p>
                  </section>

                  <section className="help-section">
                    <h4>2. Simulasi OGS</h4>
                    <p>
                      Gunakan skenario island dengan pembangkitan lebih besar
                      dari beban. App akan mengecek apakah CB generator trip
                      bisa menjaga balance 95–105%. Jika tidak aman, app akan
                      menyarankan generator runback, bukan hard trip.
                    </p>
                  </section>

                  <section className="help-section">
                    <h4>3. Simulasi OLS</h4>
                    <p>
                      Gunakan skenario overload IBT/line. Power Flow Lite
                      membaca branch loading, kemudian Trip Matrix memilih
                      target yang relevan terhadap constraint, bukan asal trip
                      beban global.
                    </p>
                  </section>

                  <section className="help-section">
                    <h4>4. Frequency Injection</h4>
                    <p>
                      Klik tombol frekuensi di top bar, pilih nilai seperti
                      48.25 Hz atau 50.00 Hz, lalu tekan Inject. App akan
                      memperbarui kondisi sistem dan Trip Matrix berdasarkan
                      zona frekuensi tersebut.
                    </p>
                  </section>

                  <section className="help-section">
                    <h4>5. Derate Generator</h4>
                    <p>
                      Derate berarti generator masih online, tetapi kemampuan MW
                      turun. App menghitung ulang source, reserve, flow, dan
                      apakah shedding atau action lain benar-benar diperlukan.
                    </p>
                  </section>

                  <section className="help-section">
                    <h4>6. Ubah setting prioritas dan MW</h4>
                    <p>
                      Masuk ke tab Settings untuk mengubah prioritas target,
                      nilai MW load/generator, dan constraint simulasi. Setelah
                      data berubah, Trip Matrix akan dibangun ulang dari kondisi
                      terbaru.
                    </p>
                  </section>

                  <section className="help-section">
                    <h4>7. Event Log</h4>
                    <p>
                      Tab Event Log mencatat operasi, trip, reset, dan keputusan
                      penting. Gunakan ini untuk audit urutan kejadian saat
                      menganalisa skenario defense scheme.
                    </p>
                  </section>

                  <section className="help-section">
                    <h4>8. Trip Matrix</h4>
                    <p>
                      Tab Matrix adalah inti logika app. Setiap row menjawab:
                      “kalau contingency ini terjadi, apa yang akan di-arming,
                      kenapa dipilih, dan kenapa alternatif lain ditolak?”
                    </p>
                  </section>
                </div>

                <footer className="help-footer">
                  <strong>Workflow singkat:</strong> Reset → hover contingency
                  CB → baca rail kanan → cek Power Flow card → buka Matrix →
                  ubah Settings bila perlu → review Event Log.
                </footer>
              </motion.section>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

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
          {activeView === "settings" ? (
            <Suspense
              fallback={
                <ViewLoadingSkeleton title="Loading cockpit settings" />
              }
            >
              <SettingsView />
            </Suspense>
          ) : null}
          {activeView === "events" ? (
            <Suspense
              fallback={<ViewLoadingSkeleton title="Loading event log" />}
            >
              <EventLogView />
            </Suspense>
          ) : null}
          {activeView === "matrix" ? (
            <Suspense
              fallback={<ViewLoadingSkeleton title="Loading trip matrix" />}
            >
              <TrippingMatrixView />
            </Suspense>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
