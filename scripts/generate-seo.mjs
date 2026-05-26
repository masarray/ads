import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "vite";

const mode = process.argv[2] || process.env.DEPLOY_TARGET || "production";
const env = loadEnv(mode, process.cwd(), "");
const distDir = join(process.cwd(), "dist");
mkdirSync(distDir, { recursive: true });

function normalizeUrl(value, fallback) {
  const raw = (value || fallback || "").trim();
  if (!raw) throw new Error("Missing site URL for SEO generation.");
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function normalizeBasePath(value) {
  const raw = (value || "/").trim();
  if (!raw || raw === ".") return "/";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function stripLeadingSlash(value) {
  return String(value || "").replace(/^\/+/, "");
}

function publicPath(path = "") {
  return `${basePath}${stripLeadingSlash(path)}`;
}

function absoluteUrl(base, path = "") {
  return new URL(stripLeadingSlash(path), base).toString();
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const siteUrl = normalizeUrl(
  process.env.VITE_SITE_URL || process.env.SITE_URL || env.VITE_SITE_URL,
  "https://powerflow.pages.dev/",
);
const canonicalBase = normalizeUrl(
  process.env.VITE_CANONICAL_URL || env.VITE_CANONICAL_URL || siteUrl,
  siteUrl,
);
const siteName = process.env.VITE_SITE_NAME || env.VITE_SITE_NAME || "Mas Ari ADS Simulator";
const basePath = normalizeBasePath(process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || "/");
const today = new Date().toISOString().slice(0, 10);
const ogImageUrl = process.env.VITE_OG_IMAGE_URL || env.VITE_OG_IMAGE_URL || absoluteUrl(canonicalBase, "og-image.png");

const learnPages = [
  {
    slug: "power-flow",
    title: "Power Flow Simulator for Learning Electrical Grid Behavior",
    description:
      "Learn what power flow means, why MW direction matters, and how generators, loads, tie-lines, interconnectors, and busbars interact in an electrical network.",
    keywords: "power flow simulator, power flow visualization, MW flow direction, electrical grid simulator, power system learning",
    focus: "Power Flow",
    lede:
      "Power flow describes how active power moves from sources to loads through busbars, transformers, and transmission corridors. The simulator helps learners see MW direction, import/export behavior, and overloaded paths instead of reading a static one-line diagram.",
    sections: [
      ["What power flow shows", "Power flow helps engineers understand source-load balance, tie-line transfer, interconnector import/export, and where electrical stress appears before a trip or blackout sequence begins."],
      ["Why animated flow helps", "Animated line flow makes MW direction visible. A learner can quickly see whether a generator is supporting a local island, whether an interbus transformer is importing, or whether a corridor is overloaded."],
      ["Try it in the simulator", "Open the ADS simulator, toggle line breakers, split bus sections, derate generation, and watch how the flow map and trip-matrix reasoning change."],
    ],
    related: ["load-flow", "adaptive-defense-scheme", "load-shedding", "islanding"],
  },
  {
    slug: "load-flow",
    title: "Load Flow Study Basics for Power System Learners",
    description:
      "Understand load flow study concepts including generation, demand, bus balance, line loading, transformer import, and practical power system operating limits.",
    keywords: "load flow study, load flow simulator, power system load flow, bus load balance, line loading",
    focus: "Load Flow",
    lede:
      "Load flow study is the practical engineering view of how loads are supplied by available sources. It is used to check whether the network can serve demand without overloading lines, transformers, or generators.",
    sections: [
      ["Load flow in simple terms", "A load flow calculation asks: which source supplies which load, through which path, and at what loading level? In this learning app, the simplified model focuses on MW flow and defense-scheme decisions."],
      ["Why it matters for operation", "Incorrect load flow assumptions can hide overload risk. A defense scheme needs topology awareness so it does not trip the wrong feeder or accidentally worsen an islanded area."],
      ["Learning workflow", "Start from a healthy network, open a line, split a bus, or constrain IBT import. Then compare final balance, overload indication, and recommended trip target."],
    ],
    related: ["power-flow", "load-shedding", "blackout", "microgrid"],
  },
  {
    slug: "adaptive-defense-scheme",
    title: "Adaptive Defense Scheme Explained: Trip Matrix, OLS, OGS and Islanding Logic",
    description:
      "Learn adaptive defense scheme concepts including topology awareness, explainable trip matrix reasoning, overload shedding, over-generation shedding, islanding, and generator runback.",
    keywords: "adaptive defense scheme, defense scheme simulator, trip matrix, remedial action scheme, system integrity protection scheme",
    focus: "Adaptive Defense Scheme",
    lede:
      "An Adaptive Defense Scheme watches system conditions and chooses corrective actions based on topology, loading, generation, island status, and operational constraints. It is not only a fixed trip list; it should understand the current network state.",
    sections: [
      ["What makes it adaptive", "The same contingency can require different actions depending on which busbar is energized, which generators are running, and whether the area is grid-connected or islanded."],
      ["Trip matrix reasoning", "The simulator previews candidate trips and explains the need, target, and reasoning so learners can see why a feeder, generator, or interconnector action was selected."],
      ["Where it helps", "Adaptive logic is useful for overload shedding, over-generation shedding, islanded operation, blackstart restoration, and preventing cascading outage scenarios."],
    ],
    related: ["load-shedding", "islanding", "blackout", "generator-runback"],
  },
  {
    slug: "load-shedding",
    title: "Load Shedding and Overload Shedding in Power System Defense Schemes",
    description:
      "Learn load shedding, overload shedding, priority feeders, trip selection, UFLS concepts, and how defense schemes prevent network overload and collapse.",
    keywords: "load shedding, overload shedding, OLS, UFLS, feeder priority, trip matrix, power system defense",
    focus: "Load Shedding",
    lede:
      "Load shedding is a controlled reduction of demand to keep the remaining system stable. In defense-scheme logic, the best target depends on topology, load priority, island balance, and overload location.",
    sections: [
      ["OLS versus UFLS", "Overload shedding reacts to equipment or corridor overload, while under-frequency load shedding reacts to frequency decline caused by supply-demand imbalance."],
      ["Trip target selection", "A good trip matrix considers MW need, customer priority, restoration strategy, and whether the trip will actually relieve the overloaded path."],
      ["Learning in the app", "Use the simulator to create overload conditions and observe how the target feeder changes when bus topology or generation availability changes."],
    ],
    related: ["adaptive-defense-scheme", "power-flow", "blackout", "islanding"],
  },
  {
    slug: "islanding",
    title: "Power System Islanding and Island Mode Operation",
    description:
      "Understand power system islanding, grid separation, source-load balance, local generation, interconnector limits, and island mode operation.",
    keywords: "power system islanding, island mode, grid separation, microgrid islanding, local generation balance",
    focus: "Islanding",
    lede:
      "Islanding occurs when part of the network becomes electrically separated from the main grid. Once islanded, local generation and load must be balanced more carefully because external support is reduced or unavailable.",
    sections: [
      ["Island balance", "An island needs enough generation to supply local load, but not so much that over-generation creates a frequency or voltage problem."],
      ["Import/export constraints", "Interconnectors and transformers can support an area, but only within ratings and protection constraints. The simulator shows import and export direction explicitly."],
      ["Defense actions", "During islanding, load shedding, generator runback, or restoration steps may be needed depending on the resulting source-load balance."],
    ],
    related: ["microgrid", "blackstart", "generator-runback", "adaptive-defense-scheme"],
  },
  {
    slug: "blackout",
    title: "How Blackouts Happen and How Defense Schemes Help Prevent Cascading Trips",
    description:
      "Learn how overloads, wrong topology assumptions, islanding, insufficient generation, and cascading trips can lead to blackout events in power systems.",
    keywords: "blackout, power system blackout, cascading outage, blackout prevention, defense scheme, power system collapse",
    focus: "Blackout Prevention",
    lede:
      "A blackout is rarely a single event. It often develops through cascading overloads, protection operations, unstable islands, or delayed corrective actions. Defense schemes aim to interrupt that chain early.",
    sections: [
      ["Cascading risk", "When one line trips, power transfers to the remaining network. If those paths overload, more trips can follow and the system can degrade rapidly."],
      ["Why topology matters", "A fixed trip list can fail if the actual network configuration is different from the assumed configuration. Adaptive logic reduces this blind spot."],
      ["Using the simulator", "Create line outages, split buses, or constrain sources to watch how the defense scheme identifies risk and selects corrective actions."],
    ],
    related: ["load-shedding", "blackstart", "power-flow", "adaptive-defense-scheme"],
  },
  {
    slug: "blackstart",
    title: "Blackstart Restoration Basics for Power System Learners",
    description:
      "Learn blackstart restoration concepts including staged energization, source pickup, load pickup, island restoration, and operator decision logic after blackout.",
    keywords: "blackstart, blackstart restoration, power system restoration, blackout recovery, staged energization",
    focus: "Blackstart",
    lede:
      "Blackstart restoration is the process of rebuilding an electrical system after a major outage using sources that can start without external grid supply. The sequence must be staged, observable, and controlled.",
    sections: [
      ["Restoration sequence", "A practical blackstart sequence energizes sources, busbars, corridors, and loads gradually while checking that each step remains within operational limits."],
      ["Why learning tools help", "Animation and state indicators make it easier to understand why restoration should happen in stages instead of energizing everything at once."],
      ["Simulator practice", "Use the blackstart command to observe staged restoration behavior and connect it to islanding and load pickup concepts."],
    ],
    related: ["blackout", "islanding", "microgrid", "power-flow"],
  },
  {
    slug: "microgrid",
    title: "Microgrid and Islanded Power System Operation",
    description:
      "Learn microgrid islanding, local generation balance, load priority, interconnection, import/export behavior, and defense logic for small power systems.",
    keywords: "microgrid, islanded microgrid, microgrid simulator, distributed generation, island mode operation",
    focus: "Microgrid",
    lede:
      "A microgrid can operate connected to the main grid or separated in island mode. The same concepts behind adaptive defense schemes apply: topology, generation balance, load priority, and restoration strategy.",
    sections: [
      ["Connected versus islanded", "When connected, the grid can absorb imbalance. When islanded, the local system must manage generation and load with much less margin."],
      ["Defense logic", "Microgrids benefit from clear load priority, generator runback logic, and fast visualization of overload or imbalance conditions."],
      ["Learning connection", "The simulator is not a full microgrid solver, but it gives a practical visual bridge from power flow to island-mode decision making."],
    ],
    related: ["islanding", "generator-runback", "load-flow", "blackstart"],
  },
  {
    slug: "generator-runback",
    title: "Generator Runback and Over-Generation Shedding in Defense Scheme Logic",
    description:
      "Understand generator runback, over-generation shedding, island balance, generation limits, and when reducing generation helps stabilize a separated power system.",
    keywords: "generator runback, over generation shedding, OGS, generation shedding, island balance, power system protection",
    focus: "Generator Runback",
    lede:
      "Generator runback reduces generation output when the system has too much supply for the available load or when network constraints require lower injection. It is especially important in islanded systems.",
    sections: [
      ["When generation becomes the problem", "After islanding or load loss, generation may exceed the island demand. A defense scheme may need to run back or trip generation to maintain balance."],
      ["OGS concept", "Over-generation shedding selects generation reduction targets rather than load trips. This is the opposite of load shedding but follows the same need for explainable logic."],
      ["Simulator use", "Trigger OGS island scenarios and observe how generator output, capacity labels, and trip matrix reasoning respond."],
    ],
    related: ["adaptive-defense-scheme", "islanding", "microgrid", "power-flow"],
  },
];

const glossaryTerms = [
  ["Adaptive Defense Scheme", "A protection and automation strategy that selects corrective actions based on current system state, topology, loading, and constraints."],
  ["Power Flow", "The direction and magnitude of active power moving through network elements such as busbars, lines, transformers, and interconnectors."],
  ["Load Flow", "A study of how electrical demand is supplied by sources through the network under a given topology and operating condition."],
  ["OLS", "Overload Shedding; a controlled trip action intended to relieve overloaded equipment or corridors."],
  ["OGS", "Over Generation Shedding; a controlled reduction or trip of generation when there is too much generation for the remaining system."],
  ["IBT", "Interbus transformer or interconnection transformer, depending on project terminology; used here as an import/export path between areas."],
  ["Islanding", "Electrical separation of part of the network from the main grid, requiring local source-load balance."],
  ["Blackstart", "Restoration of a power system using sources that can start without external grid supply."],
  ["Trip Matrix", "A decision table or logic layer used to select the most suitable corrective action for a contingency."],
  ["Microgrid", "A local electrical network that can operate grid-connected or islanded with local generation and controlled loads."],
];

const pageBySlug = Object.fromEntries(learnPages.map((page) => [page.slug, page]));
const commonNav = `
  <nav class="nav" aria-label="Learning navigation">
    <a class="brand" href="${publicPath("")}"><span class="brand-mark">ADS</span><span><strong>${htmlEscape(siteName)}</strong><small>Power-system learning</small></span></a>
    <div class="nav-links">
      <a href="${publicPath("app/")}">Simulator</a>
      <a href="${publicPath("learn/power-flow/")}">Power Flow</a>
      <a href="${publicPath("learn/adaptive-defense-scheme/")}">Defense Scheme</a>
      <a href="${publicPath("glossary/")}">Glossary</a>
    </div>
  </nav>`;

function renderStructuredData(page, canonical) {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: canonicalBase },
          { "@type": "ListItem", position: 2, name: "Learn", item: absoluteUrl(canonicalBase, "learn/") },
          { "@type": "ListItem", position: 3, name: page.focus, item: canonical },
        ],
      },
      {
        "@type": ["Article", "TechArticle", "LearningResource"],
        headline: page.title,
        name: page.title,
        description: page.description,
        url: canonical,
        image: ogImageUrl,
        author: { "@type": "Person", name: "Ari Sulistiono" },
        publisher: { "@type": "Organization", name: siteName },
        about: page.focus,
        educationalLevel: "Beginner to intermediate electrical engineering",
        learningResourceType: "Interactive explanation",
        isAccessibleForFree: true,
        dateModified: today,
      },
    ],
  };
  return JSON.stringify(data, null, 2);
}

function renderPage({ title, description, keywords, canonical, body, structuredData }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${htmlEscape(title)}</title>
    <meta name="description" content="${htmlEscape(description)}" />
    <meta name="keywords" content="${htmlEscape(keywords)}" />
    <meta name="author" content="Ari Sulistiono" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta name="theme-color" content="#06100e" />
    <link rel="canonical" href="${canonical}" />
    <link rel="sitemap" type="application/xml" href="${siteUrl}sitemap.xml" />
    <link rel="icon" type="image/svg+xml" href="${publicPath("favicon.svg")}" />
    <link rel="manifest" href="${publicPath("site.webmanifest")}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${htmlEscape(title)}" />
    <meta property="og:description" content="${htmlEscape(description)}" />
    <meta property="og:site_name" content="${htmlEscape(siteName)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${htmlEscape(title)}" />
    <meta name="twitter:description" content="${htmlEscape(description)}" />
    <meta name="twitter:image" content="${ogImageUrl}" />
    <script type="application/ld+json">${structuredData}</script>
    <style>
      :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#06100e;color:#e8fff8}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 16% 14%,rgba(86,255,232,.16),transparent 28%),radial-gradient(circle at 82% 18%,rgba(255,94,122,.12),transparent 32%),linear-gradient(135deg,#03100d,#071b16 54%,#030806)}body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(119,255,229,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(119,255,229,.045) 1px,transparent 1px);background-size:22px 22px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.85),rgba(0,0,0,.13))}.page{position:relative;z-index:1;width:min(1060px,calc(100% - 32px));margin:0 auto;padding:24px 0 58px}.nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0 36px}.brand{display:inline-flex;align-items:center;gap:12px;text-decoration:none;color:#eafff9}.brand-mark{width:38px;height:38px;display:grid;place-items:center;border-radius:14px;background:linear-gradient(135deg,#a9fff7,#35c7ae);color:#04110e;font-weight:760;box-shadow:0 14px 34px rgba(92,246,230,.18),inset 0 1px rgba(255,255,255,.45)}.brand strong{display:block;font-size:15px}.brand small{display:block;color:#8fbdb2;font-size:12px}.nav-links{display:flex;flex-wrap:wrap;gap:10px}.nav a:not(.brand),.cta{border:1px solid rgba(141,255,235,.2);border-radius:999px;padding:10px 14px;text-decoration:none;color:#dffdf7;background:rgba(10,34,29,.58);backdrop-filter:blur(12px);transition:transform .2s ease,border-color .2s ease,background .2s ease}.nav a:not(.brand):hover,.cta:hover{transform:translateY(-2px);border-color:rgba(124,247,235,.45);background:rgba(18,50,44,.72)}.article{border:1px solid rgba(141,255,235,.18);background:linear-gradient(180deg,rgba(13,39,34,.82),rgba(4,18,15,.82));box-shadow:0 24px 90px rgba(0,0,0,.36),inset 0 1px rgba(255,255,255,.05);border-radius:30px;padding:clamp(28px,5vw,58px)}.eyebrow{letter-spacing:.16em;text-transform:uppercase;color:#72fff0;font-size:12px;font-weight:680;margin:0 0 16px}h1{font-size:clamp(34px,4.8vw,56px);line-height:1.05;letter-spacing:-.042em;margin:0 0 20px;font-weight:650;text-wrap:balance}.lead{font-size:clamp(18px,2.1vw,23px);line-height:1.6;color:#d3e9e3;margin:0 0 26px}.content h2{font-size:clamp(24px,3vw,34px);letter-spacing:-.025em;margin:34px 0 10px}.content p,.content li{color:#bdd8d1;line-height:1.78;font-size:17px}.cta-row{display:flex;flex-wrap:wrap;gap:12px;margin:26px 0}.cta.primary{background:linear-gradient(135deg,#8bfff4,#53dac9);border-color:transparent;color:#03100d;font-weight:900}.related{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.related a{display:block;border:1px solid rgba(141,255,235,.16);border-radius:18px;padding:14px;text-decoration:none;background:rgba(3,14,12,.54);color:#e8fff8;transition:transform .2s ease,border-color .2s ease}.related a:hover{transform:translateY(-3px);border-color:rgba(124,247,235,.42)}.related span{display:block;color:#9fc3bb;font-size:13px;margin-top:4px}footer{color:#8fb4ab;padding:30px 0 0;font-size:13px}@media(max-width:760px){.nav{align-items:flex-start;flex-direction:column}.related{grid-template-columns:1fr}}
    </style>
  </head>
  <body><div class="page">${commonNav}${body}<footer>Created by Ari Sulistiono. Open-source educational content for power-system and substation automation learning.</footer></div></body>
</html>`;
}

function writeHtml(relativeDir, html) {
  const dir = join(distDir, relativeDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
}

for (const page of learnPages) {
  const canonical = absoluteUrl(canonicalBase, `learn/${page.slug}/`);
  const related = page.related
    .map((slug) => {
      const relatedPage = pageBySlug[slug];
      return `<a href="${publicPath(`learn/${slug}/`)}"><strong>${htmlEscape(relatedPage.focus)}</strong><span>${htmlEscape(relatedPage.description)}</span></a>`;
    })
    .join("\n");
  const body = `<article class="article">
    <p class="eyebrow">Power system learning / ${htmlEscape(page.focus)}</p>
    <h1>${htmlEscape(page.title)}</h1>
    <p class="lead">${htmlEscape(page.lede)}</p>
    <div class="cta-row"><a class="cta primary" href="${publicPath("app/")}">Try the live simulator</a><a class="cta" href="${publicPath("glossary/")}">Open glossary</a></div>
    <div class="content">
      ${page.sections
        .map(([heading, text]) => `<h2>${htmlEscape(heading)}</h2><p>${htmlEscape(text)}</p>`)
        .join("\n")}
      <h2>Related learning topics</h2>
      <div class="related">${related}</div>
    </div>
  </article>`;
  writeHtml(
    `learn/${page.slug}`,
    renderPage({
      title: `${page.title} | ${siteName}`,
      description: page.description,
      keywords: page.keywords,
      canonical,
      body,
      structuredData: renderStructuredData(page, canonical),
    }),
  );
}

const glossaryCanonical = absoluteUrl(canonicalBase, "glossary/");
const glossaryBody = `<article class="article"><p class="eyebrow">Power system glossary</p><h1>Glossary for Power Flow and Defense Scheme Learning</h1><p class="lead">A quick reference for key terms used in the ADS simulator: power flow, load shedding, OLS, OGS, islanding, blackstart, microgrid, trip matrix, and related protection concepts.</p><div class="content"><dl>${glossaryTerms
  .map(([term, definition]) => `<dt><h2>${htmlEscape(term)}</h2></dt><dd><p>${htmlEscape(definition)}</p></dd>`)
  .join("\n")}</dl><div class="cta-row"><a class="cta primary" href="${publicPath("app/")}">Open simulator</a><a class="cta" href="${publicPath("learn/power-flow/")}">Learn power flow</a></div></div></article>`;
const glossaryStructured = JSON.stringify(
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DefinedTermSet",
        name: "Power Flow and Defense Scheme Glossary",
        url: glossaryCanonical,
        hasDefinedTerm: glossaryTerms.map(([name, description]) => ({ "@type": "DefinedTerm", name, description })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: canonicalBase },
          { "@type": "ListItem", position: 2, name: "Glossary", item: glossaryCanonical },
        ],
      },
    ],
  },
  null,
  2,
);
writeHtml(
  "glossary",
  renderPage({
    title: `Power Flow and Defense Scheme Glossary | ${siteName}`,
    description: "Glossary for power flow, load flow, adaptive defense scheme, load shedding, OLS, OGS, blackstart, islanding, microgrid, and trip matrix learning.",
    keywords: "power system glossary, power flow terms, load shedding terms, adaptive defense scheme glossary, blackstart, islanding",
    canonical: glossaryCanonical,
    body: glossaryBody,
    structuredData: glossaryStructured,
  }),
);

const sitemapEntries = [
  { path: "", priority: "1.0", changefreq: "weekly" },
  { path: "app/", priority: "0.95", changefreq: "weekly" },
  ...learnPages.map((page) => ({ path: `learn/${page.slug}/`, priority: page.slug === "adaptive-defense-scheme" ? "0.95" : "0.88", changefreq: "monthly" })),
  { path: "glossary/", priority: "0.75", changefreq: "monthly" },
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries
  .map(
    (entry) => `  <url>
    <loc>${xmlEscape(absoluteUrl(siteUrl, entry.path))}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}sitemap.xml
`;

const manifest = {
  name: siteName,
  short_name: "ADS Simulator",
  description:
    "Open-source Adaptive Defense Scheme simulator for power-flow-aware load shedding, OLS, OGS, islanding, generator runback, blackstart restoration, and explainable trip-matrix reasoning.",
  start_url: publicPath("app/"),
  scope: basePath,
  display: "standalone",
  background_color: "#06100e",
  theme_color: "#06100e",
  icons: [
    { src: publicPath("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: publicPath("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any maskable" },
  ],
};

writeFileSync(join(distDir, "sitemap.xml"), sitemap);
writeFileSync(join(distDir, "robots.txt"), robots);
writeFileSync(join(distDir, "site.webmanifest"), JSON.stringify(manifest, null, 2));
writeFileSync(join(distDir, ".nojekyll"), "");
writeFileSync(
  join(distDir, "humans.txt"),
  `${siteName}\nCreated by Ari Sulistiono\nTopic: Adaptive Defense Scheme, Power Flow, Load Flow, OLS, OGS, Islanding, Blackstart, Microgrid learning.\nBuild target: ${mode}\nSite URL: ${siteUrl}\nCanonical base: ${canonicalBase}\n`,
);

writeFileSync(
  join(distDir, "_redirects"),
  `/app/* ${publicPath("app/index.html")} 200
/simulator ${publicPath("app/")} 301
/power-flow ${publicPath("learn/power-flow/")} 301
/load-flow ${publicPath("learn/load-flow/")} 301
/defense-scheme ${publicPath("learn/adaptive-defense-scheme/")} 301
/blackstart ${publicPath("learn/blackstart/")} 301
/islanding ${publicPath("learn/islanding/")} 301
`,
);

writeFileSync(
  join(distDir, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.png
  Cache-Control: public, max-age=31536000, immutable

/*.svg
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate

/sitemap.xml
  Cache-Control: public, max-age=0, must-revalidate

/robots.txt
  Cache-Control: public, max-age=0, must-revalidate
`,
);

function replaceTokensInHtml(relativePath) {
  const path = join(distDir, relativePath);
  if (!existsSync(path)) return;
  let html = readFileSync(path, "utf8");
  html = html
    .replaceAll("%VITE_SITE_URL%", siteUrl)
    .replaceAll("%VITE_CANONICAL_URL%", canonicalBase)
    .replaceAll("%VITE_OG_IMAGE_URL%", ogImageUrl)
    .replaceAll("%VITE_SITE_NAME%", siteName)
    .replaceAll("%VITE_BASE_PATH%", basePath);
  writeFileSync(path, html);
}
replaceTokensInHtml("index.html");
replaceTokensInHtml("app/index.html");

const notFoundHtml = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><meta name="robots" content="noindex"/><title>Page not found | ${htmlEscape(siteName)}</title><script>(function(){const base=${JSON.stringify(basePath)};const noSlashBase=base.endsWith("/")?base.slice(0,-1):base;const path=location.pathname;const target=base+"app/";if(path===noSlashBase+"/app"||path===base+"app"||path.startsWith(base+"app/")){location.replace(target+location.search+location.hash);return;}if(path===noSlashBase||path===base.slice(0,-1)){location.replace(base+location.search+location.hash);}})();</script><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#06100e;color:#e8fff8;font-family:Inter,system-ui,sans-serif}.card{max-width:620px;padding:38px;border:1px solid rgba(141,255,235,.2);border-radius:28px;background:rgba(10,34,29,.72)}a{color:#8bfff4}</style></head><body><main class="card"><h1>Page not found</h1><p>The simulator is available at the project-base path. On GitHub Pages use <strong>${publicPath("app/")}</strong>.</p><p><a href="${publicPath("")}">Home</a> · <a href="${publicPath("app/")}">Open simulator</a></p></main></body></html>`;
writeFileSync(join(distDir, "404.html"), notFoundHtml);

// Static safety aliases for hosts that preserve extension URLs or fail to normalize trailing slashes.
writeFileSync(
  join(distDir, "app.html"),
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="robots" content="noindex"/><meta http-equiv="refresh" content="0;url=${publicPath("app/")}"/><title>Open simulator</title><script>location.replace(${JSON.stringify(publicPath("app/"))}+location.search+location.hash);</script></head><body><p><a href="${publicPath("app/")}">Open simulator</a></p></body></html>`,
);

console.log(`[seo] generated ${sitemapEntries.length} sitemap URLs, learning pages, robots.txt, manifest, redirects, and 404 for ${siteUrl}`);
