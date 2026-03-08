// ════════════════════════════════════════════════════════════════
// BLOC 1 — IMPORTS & CONSTANTES
// ════════════════════════════════════════════════════════════════
import { useState, useCallback } from "react";

const EXCHANGE_CURRENCY = {
  ".PA": "EUR",
  ".DE": "EUR",
  ".AS": "EUR",
  ".MI": "EUR",
  ".MC": "EUR",
  ".BR": "EUR",
  ".LS": "EUR",
  ".L": "GBP",
  ".IL": "GBX",
  ".T": "JPY",
  ".HK": "HKD",
  ".AX": "AUD",
  ".TO": "CAD",
  ".SW": "CHF",
  ".ST": "SEK",
  ".CO": "DKK",
  ".OL": "NOK",
  ".HE": "EUR",
  ".WA": "PLN",
  ".IS": "TRY",
};
function inferCurrency(ticker) {
  for (const [sfx, cur] of Object.entries(EXCHANGE_CURRENCY))
    if (ticker.toUpperCase().endsWith(sfx)) return cur;
  return "USD";
}

const TYPE_BADGE = {
  EQUITY: { label: "Action", color: "#60a5fa", bg: "#1e3a5f" },
  ETF: { label: "ETF", color: "#a78bfa", bg: "#2d1b69" },
  MUTUALFUND: { label: "Fonds", color: "#22d3ee", bg: "#0c3d4a" },
  INDEX: { label: "Indice", color: "#fbbf24", bg: "#3d2a00" },
  CRYPTOCURRENCY: { label: "Crypto", color: "#f0a500", bg: "#3d2800" },
  CURRENCY: { label: "Forex", color: "#34d399", bg: "#0a2e1a" },
};
const getBadge = (t) =>
  TYPE_BADGE[t?.toUpperCase()] || {
    label: t || "—",
    color: "#8b949e",
    bg: "#1a2235",
  };

// ════════════════════════════════════════════════════════════════
// BLOC 2 — HELPERS
// ════════════════════════════════════════════════════════════════
function fmt(n, dec = 2) {
  if (n == null || isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (a >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return Number(n).toFixed(dec);
}
function pct(n) {
  return n == null || isNaN(n) ? "—" : (n * 100).toFixed(2) + "%";
}
function scoreVal(val, low, mid, high, invert = false) {
  if (val == null || isNaN(val)) return null;
  let s;
  if (val <= low) s = invert ? 10 : 2;
  else if (val >= high) s = invert ? 2 : 10;
  else if (val <= mid) s = invert ? 7 : 4;
  else s = invert ? 4 : 7;
  return s;
}
function scoreColor(s) {
  if (s == null) return "#555";
  if (s >= 7) return "#22c55e";
  if (s >= 4) return "#f59e0b";
  return "#ef4444";
}
function scoreEmoji(s) {
  if (s == null) return "·";
  if (s >= 7) return "🟢";
  if (s >= 4) return "🟡";
  return "🔴";
}
function getVerdict(g) {
  if (g == null) return null;
  if (g >= 7.5)
    return {
      label: "Opportunité",
      color: "#22c55e",
      emoji: "🚀",
      desc: "Fondamentaux solides — potentiel fort.",
    };
  if (g >= 5.5)
    return {
      label: "Neutre",
      color: "#f59e0b",
      emoji: "⚖️",
      desc: "Profil équilibré — surveiller avant d'investir.",
    };
  if (g >= 3.5)
    return {
      label: "Prudence",
      color: "#f97316",
      emoji: "⚠️",
      desc: "Signaux mitigés — risques à ne pas négliger.",
    };
  return {
    label: "Risque élevé",
    color: "#ef4444",
    emoji: "🔴",
    desc: "Fondamentaux dégradés — investissement spéculatif.",
  };
}

// ════════════════════════════════════════════════════════════════
// BLOC 3 — COUCHE RÉSEAU
// ════════════════════════════════════════════════════════════════
const PROXY = "https://screener.etheryoh.workers.dev";
const CG_BASE = "https://api.coingecko.com/api/v3";
const ECB_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=jsondata";

const getJson = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

async function yfChart(ticker, addLog) {
  const url = `${PROXY}?ticker=${encodeURIComponent(ticker)}&type=chart`;
  addLog(`  📡 Yahoo Chart: ${ticker}...`);
  try {
    const d = await getJson(url);
    const res = d?.chart?.result?.[0];
    if (!res) throw new Error("Pas de résultat");
    const meta = res.meta;
    const closes =
      res.indicators?.adjclose?.[0]?.adjclose ||
      res.indicators?.quote?.[0]?.close ||
      [];
    addLog(`  ✅ Yahoo Chart: ${meta.regularMarketPrice} ${meta.currency}`);
    return { meta, closes };
  } catch (e) {
    addLog(`  ⚠️ Yahoo Chart: ${e.message}`);
    return null;
  }
}

async function yfFundamentals(ticker, addLog) {
  const url = `${PROXY}?ticker=${encodeURIComponent(ticker)}&type=fundamentals`;
  addLog(`  📡 Yahoo Fundamentals: ${ticker}...`);
  try {
    const d = await getJson(url);
    const res = d?.quoteSummary?.result?.[0];
    if (!res) throw new Error("Pas de résultat");
    addLog(`  ✅ Fondamentaux reçus`);
    return res;
  } catch (e) {
    addLog(`  ⚠️ Fondamentaux: ${e.message}`);
    return null;
  }
}

async function cgSearch(q) {
  try {
    const d = await getJson(`${CG_BASE}/search?query=${encodeURIComponent(q)}`);
    const coin = d?.coins?.[0];
    if (!coin) return null;
    const match =
      coin.symbol.toLowerCase() === q.toLowerCase() ||
      coin.id.toLowerCase() === q.toLowerCase() ||
      coin.name.toLowerCase().startsWith(q.toLowerCase());
    return match ? coin.id : null;
  } catch {
    return null;
  }
}

async function cgCoin(id) {
  try {
    return await getJson(
      `${CG_BASE}/coins/${id}?localization=false&tickers=false&community_data=false`
    );
  } catch {
    return null;
  }
}

async function ecbRates() {
  try {
    const d = await getJson(ECB_URL);
    const series = d.dataSets?.[0]?.series;
    const dims = d.structure?.dimensions?.series;
    const ci = dims?.findIndex((k) => k.id === "CURRENCY");
    const rates = {};
    for (const [sk, sv] of Object.entries(series ?? {})) {
      const code = dims[ci]?.values?.[parseInt(sk.split(":")[ci])]?.id;
      const obs = Object.values(sv.observations ?? {});
      if (code && obs.length) rates[code] = obs[obs.length - 1][0];
    }
    return rates;
  } catch {
    return {};
  }
}

// ════════════════════════════════════════════════════════════════
// BLOC 4 — MOTEUR D'ANALYSE
// ════════════════════════════════════════════════════════════════
function buildMetrics(yf, meta) {
  if (!yf && !meta) return null;
  const sd = yf?.summaryDetail || {};
  const ks = yf?.defaultKeyStatistics || {};
  const fd = yf?.financialData || {};
  const pr = yf?.price || {};

  const pe = sd.trailingPE?.raw;
  const pb = sd.priceToBook?.raw ?? ks.priceToBook?.raw;
  const ps = ks.priceToSalesTrailing12Months?.raw;
  const roe = fd.returnOnEquity?.raw;
  const roa = fd.returnOnAssets?.raw;
  const grossMargin =
    fd.grossMargins?.raw != null && fd.grossMargins.raw <= 1
      ? fd.grossMargins.raw
      : null;
  const opMargin = fd.operatingMargins?.raw;
  const netMargin = fd.profitMargins?.raw ?? ks.profitMargins?.raw;
  const divYield = sd.dividendYield?.raw ?? sd.trailingAnnualDividendYield?.raw;
  const payoutRatio = sd.payoutRatio?.raw;
  const debtEq =
    fd.debtToEquity?.raw != null ? fd.debtToEquity.raw / 100 : null;
  const currentRatio = fd.currentRatio?.raw;
  const fcf = fd.freeCashflow?.raw;
  const sharesOut = ks.sharesOutstanding?.raw;
  const shortRatio = ks.shortRatio?.raw;
  const beta = sd.beta?.raw;
  const mktCap = pr.marketCap?.raw ?? sd.marketCap?.raw ?? meta?.marketCap;
  const price = pr.regularMarketPrice?.raw ?? meta?.regularMarketPrice;
  const change1d =
    pr.regularMarketChangePercent?.raw ?? meta?.regularMarketChangePercent;
  const change52w = sd["52WeekChange"]?.raw ?? ks["52WeekChange"]?.raw;
  const name =
    pr.longName || pr.shortName || meta?.longName || meta?.shortName || "";
  const sector = yf?.assetProfile?.sector || "";
  const industry = yf?.assetProfile?.industry || "";
  const currency = pr.currency || meta?.currency || "USD";
  const exchange = pr.exchangeName || meta?.exchangeName || "";
  const quoteType = pr.quoteType || meta?.instrumentType || "EQUITY";

  const scores = {
    pe: pe ? scoreVal(pe, 15, 25, 40, true) : null,
    pb: pb ? scoreVal(pb, 1, 3, 6, true) : null,
    roe: roe ? scoreVal(roe, 0.05, 0.15, 0.25, false) : null,
    netMargin: netMargin ? scoreVal(netMargin, 0.03, 0.1, 0.2, false) : null,
    debtEq: debtEq != null ? scoreVal(debtEq, 0.3, 0.8, 1.5, true) : null,
    currentRatio: currentRatio
      ? scoreVal(currentRatio, 1, 1.5, 2.5, false)
      : null,
    divYield: divYield ? scoreVal(divYield, 0.01, 0.03, 0.06, false) : null,
    beta:
      beta != null
        ? beta < 0
          ? 4
          : scoreVal(Math.abs(beta - 1), 0, 0.3, 0.8, true)
        : null,
  };
  if (change52w != null) {
    if (change52w >= 0.2) scores.perf52w = 8;
    else if (change52w >= 0) scores.perf52w = 6;
    else if (change52w >= -0.2) scores.perf52w = 4;
    else scores.perf52w = 2;
  }
  const adjustedScores = { ...scores };
  if (roe != null && roe < 0 && adjustedScores.pb != null) {
    adjustedScores.pb = Math.min(adjustedScores.pb, 4);
  }
  const vals = Object.values(adjustedScores).filter((s) => s != null);
  const globalScore = vals.length
    ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
    : null;

  return {
    name,
    sector,
    industry,
    currency,
    exchange,
    quoteType,
    mktCap,
    price,
    change1d,
    change52w,
    pe,
    pb,
    ps,
    roe,
    roa,
    grossMargin,
    opMargin,
    netMargin,
    divYield,
    payoutRatio,
    debtEq,
    currentRatio,
    fcf,
    sharesOut,
    shortRatio,
    beta,
    scores,
    globalScore,
  };
}

// ════════════════════════════════════════════════════════════════
// BLOC 5 — COMPOSANTS UI
// ════════════════════════════════════════════════════════════════
function TypeBadge({ type }) {
  const b = getBadge(type);
  return (
    <span
      style={{
        background: b.bg,
        color: b.color,
        border: `1px solid ${b.color}66`,
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 800,
        padding: "2px 7px",
        letterSpacing: 1.2,
        textTransform: "uppercase",
        verticalAlign: "middle",
        marginLeft: 10,
      }}
    >
      {b.label}
    </span>
  );
}

function Sparkline({ data }) {
  if (!data || data.length < 2)
    return (
      <div
        style={{
          color: "#445",
          fontSize: 12,
          padding: "20px 0",
          textAlign: "center",
        }}
      >
        Graphique indisponible
      </div>
    );
  const clean = data.filter((v) => v != null && !isNaN(v));
  if (clean.length < 2) return null;
  const min = Math.min(...clean),
    max = Math.max(...clean);
  const range = max - min || 1;
  const W = 500,
    H = 80;
  const pts = clean
    .map((v, i) => {
      const x = (i / (clean.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 12) - 6;
      return `${x},${y}`;
    })
    .join(" ");
  const up = clean[clean.length - 1] >= clean[0];
  const c = up ? "#22c55e" : "#ef4444";
  const chg = (((clean[clean.length - 1] - clean[0]) / clean[0]) * 100).toFixed(
    1
  );
  return (
    <div>
      <div style={{ fontSize: 11, color: c, marginBottom: 4, fontWeight: 700 }}>
        {up ? "▲" : "▼"} {Math.abs(chg)}% sur 12 mois
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity="0.25" />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#sg)" />
        <polyline
          points={pts}
          fill="none"
          stroke={c}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function ScoreGauge({ score }) {
  if (score == null) return null;
  const r = 50,
    cx = 70,
    cy = 62;
  const toRad = (d) => (d * Math.PI) / 180;
  const arcPath = (startDeg, endDeg, color) => {
    const x1 = cx + r * Math.cos(toRad(startDeg));
    const y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy + r * Math.sin(toRad(endDeg));
    return (
      <path
        d={`M${x1},${y1} A${r},${r} 0 0 0 ${x2},${y2}`}
        stroke={color}
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />
    );
  };
  const needleDeg = 180 - (score / 10) * 180;
  const nx = cx + r * 0.75 * Math.cos(toRad(needleDeg));
  const ny = cy + r * 0.75 * Math.sin(toRad(needleDeg));
  return (
    <svg width="140" height="75" viewBox="0 0 140 75">
      {arcPath(180, 120, "#ef4444")}
      {arcPath(120, 60, "#f59e0b")}
      {arcPath(60, 0, "#22c55e")}
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="4" fill="white" />
      <text
        x={cx}
        y={cy + 13}
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill="white"
      >
        {score}
      </text>
      <text x={cx} y={cy + 23} textAnchor="middle" fontSize="9" fill="#666">
        /10
      </text>
    </svg>
  );
}

function MetricRow({ label, value, s, explain, good, bad }) {
  const [open, setOpen] = useState(false);
  const hasDetail = explain || good || bad;
  return (
    <div
      onClick={() => hasDetail && setOpen((o) => !o)}
      style={{
        padding: "11px 16px",
        borderBottom: "1px solid #1a2030",
        cursor: hasDetail ? "pointer" : "default",
        background: open ? "#111825" : "transparent",
        transition: "background .15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, width: 18 }}>{scoreEmoji(s)}</span>
        <span
          style={{
            flex: 1,
            fontSize: 13,
            color: "#b0bec5",
            fontFamily: "'IBM Plex Mono',monospace",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: s ? scoreColor(s) : "#e6edf3",
            fontFamily: "'IBM Plex Mono',monospace",
          }}
        >
          {value}
        </span>
        {s != null && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: scoreColor(s),
              background: scoreColor(s) + "22",
              borderRadius: 4,
              padding: "2px 7px",
              minWidth: 30,
              textAlign: "center",
            }}
          >
            {s}/10
          </span>
        )}
        {hasDetail && (
          <span style={{ color: "#445", fontSize: 11 }}>
            {open ? "▲" : "▼"}
          </span>
        )}
      </div>
      {open && (
        <div
          style={{
            marginTop: 8,
            paddingLeft: 28,
            fontSize: 12,
            color: "#8b949e",
            lineHeight: 1.7,
          }}
        >
          {explain && <p style={{ margin: "0 0 4px" }}>{explain}</p>}
          {good && (
            <p style={{ margin: "0 0 2px", color: "#22c55e" }}>✅ {good}</p>
          )}
          {bad && <p style={{ margin: 0, color: "#ef4444" }}>⚠️ {bad}</p>}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// BLOC 6 — VUE ACTION / ETF
// ════════════════════════════════════════════════════════════════
function MetricCard({ label, value, s, explain, good, bad }) {
  const [open, setOpen] = useState(false);
  const hasDetail = explain || good || bad;
  const bg =
    s == null ? "#111825" : s >= 7 ? "#0a2e1a" : s >= 4 ? "#2a1f00" : "#2a0a0a";
  const border =
    s == null
      ? "#1e2a3a"
      : s >= 7
      ? "#22c55e44"
      : s >= 4
      ? "#f59e0b44"
      : "#ef444444";

  return (
    <div
      onClick={() => hasDetail && setOpen((o) => !o)}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "12px 14px",
        cursor: hasDetail ? "pointer" : "default",
        transition: "all .15s",
        position: "relative",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#556",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: s == null ? "#8b949e" : scoreColor(s),
            fontFamily: "'IBM Plex Mono',monospace",
          }}
        >
          {value}
        </span>
        {s != null && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: scoreColor(s),
              background: scoreColor(s) + "22",
              borderRadius: 4,
              padding: "2px 7px",
            }}
          >
            {scoreEmoji(s)} {s}/10
          </span>
        )}
      </div>
      {hasDetail && (
        <div style={{ fontSize: 9, color: "#445", marginTop: 4 }}>
          {open ? "▲ réduire" : "▼ détail"}
        </div>
      )}
      {open && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: `1px solid ${border}`,
            fontSize: 11,
            color: "#8b949e",
            lineHeight: 1.7,
          }}
        >
          {explain && <p style={{ margin: "0 0 4px" }}>{explain}</p>}
          {good && (
            <p style={{ margin: "0 0 2px", color: "#22c55e" }}>✅ {good}</p>
          )}
          {bad && <p style={{ margin: 0, color: "#ef4444" }}>⚠️ {bad}</p>}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ icon, label }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        color: "#445",
        textTransform: "uppercase",
        letterSpacing: 2,
        margin: "20px 0 10px",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span>{icon}</span> {label}
    </div>
  );
}

function StockView({ metrics, chartData }) {
  if (!metrics) return null;
  const {
    name,
    sector,
    industry,
    currency,
    exchange,
    quoteType,
    price,
    change1d,
    scores = {},
    globalScore,
  } = metrics;
  const v = getVerdict(globalScore);

  const SECTIONS = [
    {
      icon: "💰",
      label: "Valorisation",
      cards: [
        {
          label: "P/E Ratio",
          value: fmt(metrics.pe),
          s: scores.pe,
          explain:
            "Prix payé pour 1€ de bénéfice. Plus c'est bas, moins l'action est chère.",
          good: "Sous 15 : valorisation attractive",
          bad: "Au-dessus de 40 : très cher",
        },
        {
          label: "P/B Ratio",
          value: fmt(metrics.pb),
          s: scores.pb,
          explain:
            "Prix vs valeur comptable. Sous 1 = potentiellement sous-évalué.",
          good: "Entre 1 et 3 : zone saine",
          bad: "Au-dessus de 6 : valorisation élevée",
        },
        {
          label: "P/S Ratio",
          value: fmt(metrics.ps),
          s: null,
          explain: "Prix vs chiffre d'affaires.",
          good: "Sous 2 : bon rapport",
          bad: "Au-dessus de 10 : risque de bulle",
        },
        {
          label: "Market Cap",
          value: `${currency} ${fmt(metrics.mktCap)}`,
          s: null,
          explain: "Valeur totale en bourse = prix × nombre d'actions.",
        },
      ],
    },
    {
      icon: "📈",
      label: "Rentabilité",
      cards: [
        {
          label: "ROE",
          value: pct(metrics.roe),
          s: scores.roe,
          explain: "Retour sur capitaux propres.",
          good: "Au-dessus de 15% : excellent",
          bad: "Sous 5% : peu rentable",
        },
        {
          label: "ROA",
          value: pct(metrics.roa),
          s: null,
          explain: "Retour sur actifs totaux.",
          good: "Au-dessus de 5% : efficace",
          bad: "Sous 1% : actifs mal utilisés",
        },
        {
          label: "Marge Brute",
          value: pct(metrics.grossMargin),
          s: null,
          explain: "% du CA conservé après coûts de production.",
          good: "Au-dessus de 40% : sain",
          bad: "Sous 20% : coûts élevés",
        },
        {
          label: "Marge Opé.",
          value: pct(metrics.opMargin),
          s: null,
          explain: "Rentabilité avant impôts et intérêts.",
          good: "Au-dessus de 15%",
          bad: "Sous 5% : fragile",
        },
        {
          label: "Marge Nette",
          value: pct(metrics.netMargin),
          s: scores.netMargin,
          explain: "Ce qui reste pour les actionnaires après tout.",
          good: "Au-dessus de 10%",
          bad: "Négative : perd de l'argent",
        },
      ],
    },
    {
      icon: "🏦",
      label: "Santé Financière",
      cards: [
        {
          label: "Dette/Equity",
          value: fmt(metrics.debtEq),
          s: scores.debtEq,
          explain: "Niveau d'endettement vs capitaux propres.",
          good: "Sous 0.5 : peu endetté",
          bad: "Au-dessus de 1.5 : risque financier",
        },
        {
          label: "Current Ratio",
          value: fmt(metrics.currentRatio),
          s: scores.currentRatio,
          explain: "Capacité à rembourser les dettes court terme.",
          good: "Au-dessus de 1.5 : confortable",
          bad: "Sous 1 : alerte liquidité",
        },
        {
          label: "Free Cash Flow",
          value: `${currency} ${fmt(metrics.fcf)}`,
          s: null,
          explain: "Cash généré après investissements.",
          good: "Positif : génère du cash",
          bad: "Négatif : consomme du cash",
        },
        {
          label: "Actions en circ.",
          value: fmt(metrics.sharesOut, 0),
          s: null,
          explain: "Nombre total d'actions. Surveiller la dilution.",
        },
      ],
    },
    {
      icon: "💵",
      label: "Dividende",
      cards: [
        {
          label: "Rendement Div.",
          value: pct(metrics.divYield),
          s: scores.divYield,
          explain: "Dividende annuel / prix.",
          good: "Entre 2% et 5% : attractif et durable",
          bad: "Au-dessus de 8% : souvent insoutenable",
        },
        {
          label: "Payout Ratio",
          value: pct(metrics.payoutRatio),
          s: null,
          explain: "% des bénéfices distribués en dividendes.",
          good: "Entre 30% et 60% : équilibré",
          bad: "Au-dessus de 90% : peu de marge",
        },
      ],
    },
    {
      icon: "⚡",
      label: "Risque",
      cards: [
        {
          label: "Bêta (1y)",
          value: fmt(metrics.beta),
          s: scores.beta,
          explain: "Volatilité vs le marché. 1 = suit le marché.",
          good: "Entre 0.7 et 1.3 : risque modéré",
          bad: "Au-dessus de 2 : très spéculatif",
        },
        {
          label: "Short Ratio",
          value: fmt(metrics.shortRatio),
          s: null,
          explain: "Jours pour couvrir les positions baissières.",
          good: "Sous 3 jours : normal",
          bad: "Au-dessus de 10 : forte défiance",
        },
        {
          label: "Perf. 52 sem.",
          value:
            metrics.change52w != null
              ? (metrics.change52w * 100).toFixed(1) + "%"
              : "—",
          s: null,
          explain: "Performance sur les 12 derniers mois.",
        },
      ],
    },
  ];

  return (
    <div style={{ animation: "fadeIn .4s ease" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          gap: 20,
          marginBottom: 22,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div
            style={{
              fontSize: 11,
              color: "#445",
              textTransform: "uppercase",
              letterSpacing: 1.5,
              marginBottom: 4,
            }}
          >
            {[exchange, sector, industry].filter(Boolean).join(" · ")}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#e6edf3",
              marginBottom: 8,
              lineHeight: 1.3,
            }}
          >
            {name}
            <TypeBadge type={quoteType} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 34,
                fontWeight: 900,
                color: "#f0a500",
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            >
              {currency} {fmt(price)}
            </span>
            {change1d != null && (
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: change1d >= 0 ? "#22c55e" : "#ef4444",
                }}
              >
                {change1d >= 0 ? "▲" : "▼"}{" "}
                {Math.abs(change1d * 100).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        {v && (
          <div
            style={{
              background: v.color + "12",
              border: `1px solid ${v.color}44`,
              borderRadius: 14,
              padding: "14px 22px",
              textAlign: "center",
              minWidth: 170,
            }}
          >
            <ScoreGauge score={globalScore} />
            <div
              style={{
                fontSize: 18,
                fontWeight: 900,
                color: v.color,
                marginTop: 2,
              }}
            >
              {v.emoji} {v.label}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#8b949e",
                marginTop: 5,
                lineHeight: 1.5,
              }}
            >
              {v.desc}
            </div>
          </div>
        )}
      </div>

      {/* GRAPHIQUE */}
      <div
        style={{
          background: "#0d1420",
          border: "1px solid #1e2a3a",
          borderRadius: 12,
          padding: "14px 18px",
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#445",
            textTransform: "uppercase",
            letterSpacing: 1.2,
            marginBottom: 6,
          }}
        >
          Performance 12 mois
        </div>
        <Sparkline data={chartData} />
      </div>

      {/* DASHBOARD CARTES */}
      {SECTIONS.map((sec) => (
        <div key={sec.label}>
          <SectionTitle icon={sec.icon} label={sec.label} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            {sec.cards.map((c, i) => (
              <MetricCard key={i} {...c} />
            ))}
          </div>
        </div>
      ))}

      <div
        style={{
          fontSize: 10,
          color: "#333",
          textAlign: "right",
          marginTop: 16,
        }}
      >
        Source : Yahoo Finance via proxy · Données indicatives, non
        contractuelles
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// BLOC 7 — VUE CRYPTO
// ════════════════════════════════════════════════════════════════
function CryptoView({ data }) {
  const md = data.market_data || {};
  const price = md.current_price?.usd;
  const chg24h = md.price_change_percentage_24h;
  const chg7d = md.price_change_percentage_7d;
  const mktCap = md.market_cap?.usd;
  const vol24h = md.total_volume?.usd;
  const supply = md.circulating_supply;
  const maxSup = md.max_supply;
  const ath = md.ath?.usd;
  const athPct = md.ath_change_percentage?.usd;
  const up24 = chg24h >= 0;

  return (
    <div style={{ animation: "fadeIn .4s ease" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        {data.image?.small && (
          <img
            src={data.image.small}
            alt=""
            style={{ width: 52, height: 52, borderRadius: "50%", marginTop: 4 }}
          />
        )}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#e6edf3",
              marginBottom: 6,
            }}
          >
            {data.name}
            <TypeBadge type="CRYPTOCURRENCY" />
            <span
              style={{
                color: "#445",
                fontSize: 13,
                fontWeight: 400,
                marginLeft: 8,
              }}
            >
              {data.symbol?.toUpperCase()}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 34,
                fontWeight: 900,
                color: "#f0a500",
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            >
              ${fmt(price)}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: up24 ? "#22c55e" : "#ef4444",
              }}
            >
              {up24 ? "▲" : "▼"} {Math.abs(chg24h || 0).toFixed(2)}% 24h
            </span>
            {chg7d != null && (
              <span
                style={{
                  fontSize: 12,
                  color: chg7d >= 0 ? "#22c55e" : "#ef4444",
                }}
              >
                {chg7d >= 0 ? "▲" : "▼"} {Math.abs(chg7d).toFixed(2)}% 7j
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            background: "#151f30",
            border: "1px solid #2a3548",
            borderRadius: 12,
            padding: "12px 20px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 10, color: "#445", marginBottom: 3 }}>
            Rang CoinGecko
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#f0a500" }}>
            #{data.market_cap_rank}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: 10,
          marginBottom: 18,
        }}
      >
        {[
          ["Market Cap", "$" + fmt(mktCap)],
          ["Volume 24h", "$" + fmt(vol24h)],
          ["Offre circulante", fmt(supply, 0)],
          ["Offre max", maxSup ? fmt(maxSup, 0) : "∞"],
          ["ATH", ath ? "$" + fmt(ath) : "—"],
          ["Depuis ATH", athPct != null ? athPct.toFixed(1) + "%" : "—"],
        ].map(([k, v]) => (
          <div
            key={k}
            style={{
              background: "#151f30",
              border: "1px solid #2a3548",
              borderRadius: 10,
              padding: "11px 14px",
            }}
          >
            <div style={{ fontSize: 10, color: "#445", marginBottom: 3 }}>
              {k}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#e6edf3",
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      {data.description?.en && (
        <div
          style={{
            background: "#151f30",
            border: "1px solid #2a3548",
            borderRadius: 10,
            padding: 16,
            fontSize: 12,
            color: "#8b949e",
            lineHeight: 1.8,
          }}
        >
          <div style={{ color: "#f0a500", fontWeight: 700, marginBottom: 8 }}>
            📖 À propos
          </div>
          {data.description.en.replace(/<[^>]+>/g, "").slice(0, 600)}…
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// BLOC 8 — APPLICATION PRINCIPALE
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [log, setLog] = useState([]);
  const [error, setError] = useState("");

  const addLog = (msg) => setLog((l) => [...l, msg]);

  const doAnalyze = useCallback(
    async (forceTicker) => {
      const raw = (forceTicker || query).trim();
      if (!raw) return;
      const upper = raw.toUpperCase();
      const lower = raw.toLowerCase();
      setLoading(true);
      setResult(null);
      setLog([]);
      setError("");
      addLog(`🔍 Analyse : ${raw}`);

      // ── 1. FOREX ─────────────────────────────────────────────
      const isForexPattern =
        /^[A-Z]{3}$/.test(upper) ||
        /^[A-Z]{3}[/][A-Z]{3}$/.test(upper) ||
        /^[A-Z]{6}$/.test(upper) ||
        upper.endsWith("=X");

      if (isForexPattern) {
        addLog("💱 Pattern Forex → ECB...");
        const rates = await ecbRates();
        const cur =
          upper.replace(/EUR|=X|\//g, "").slice(-3) || upper.slice(0, 3);
        const rate = rates[cur];
        if (rate) {
          addLog(`✅ EUR/${cur} = ${rate}`);
          setResult({ type: "forex", currency: cur, rate, allRates: rates });
          setLoading(false);
          return;
        }
        addLog(`  → ${cur} absent ECB, on continue`);
      }

      // ── 2. PARALLÈLE : Yahoo + CoinGecko ─────────────────────
      addLog("⚡ Recherche parallèle Yahoo Finance + CoinGecko...");
      const [yfData, cgId] = await Promise.all([
        yfChart(upper, addLog),
        cgSearch(lower),
      ]);

      // Si CoinGecko trouve une vraie crypto ET Yahoo retourne un ETF → priorité crypto
      if (cgId) {
        const d = await cgCoin(cgId);
        if (d?.market_data?.current_price?.usd) {
          // Vérifie que Yahoo n'a pas trouvé une VRAIE action (pas ETF crypto)
          const yfType =
            yfData?.meta?.instrumentType || yfData?.meta?.quoteType || "";
          const isCryptoETF =
            yfType === "ETF" &&
            (upper === "BTC" ||
              upper === "ETH" ||
              upper === "SOL" ||
              d.symbol?.toUpperCase() === upper);
          if (!yfData?.meta?.regularMarketPrice || isCryptoETF) {
            addLog(`✅ CoinGecko : ${cgId}`);
            setResult({ type: "crypto", data: d });
            setLoading(false);
            return;
          }
        }
      }

      // Cas Yahoo → action/ETF/indice
      if (yfData?.meta?.regularMarketPrice) {
        addLog(`✅ Yahoo Finance : ${yfData.meta.quoteType || "EQUITY"}`);
        const yf = await yfFundamentals(upper, addLog);
        const metrics = buildMetrics(yf, yfData.meta);
        setResult({ type: "stock", metrics, chartData: yfData.closes });
        setLoading(false);
        return;
      }

      // ── 3. ÉCHEC ──────────────────────────────────────────────
      addLog("❌ Introuvable sur toutes les sources");
      setError(
        `"${raw}" introuvable. Vérifiez le ticker (ex: AAPL, MC.PA, BTC, USD)`
      );
      setLoading(false);
    },
    [query]
  );

  const ForexView = ({ currency, rate, allRates }) => (
    <div style={{ animation: "fadeIn .4s ease" }}>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 11,
            color: "#445",
            textTransform: "uppercase",
            letterSpacing: 1.5,
            marginBottom: 4,
          }}
        >
          Banque Centrale Européenne · Officiel
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#e6edf3",
            marginBottom: 8,
          }}
        >
          EUR / {currency}
          <TypeBadge type="CURRENCY" />
        </div>
        <span
          style={{
            fontSize: 38,
            fontWeight: 900,
            color: "#f0a500",
            fontFamily: "'IBM Plex Mono',monospace",
          }}
        >
          {parseFloat(rate).toFixed(4)}
        </span>
        <span style={{ fontSize: 13, color: "#556", marginLeft: 8 }}>
          1 EUR = {rate} {currency}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))",
          gap: 7,
        }}
      >
        {Object.entries(allRates)
          .sort()
          .map(([cur, r]) => (
            <div
              key={cur}
              style={{
                background: "#151f30",
                border: `1px solid ${cur === currency ? "#f0a500" : "#2a3548"}`,
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              <div style={{ fontSize: 9, color: "#445" }}>EUR / {cur}</div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'IBM Plex Mono',monospace",
                }}
              >
                {parseFloat(r).toFixed(4)}
              </div>
            </div>
          ))}
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 10,
          color: "#333",
          textAlign: "right",
        }}
      >
        Source : Banque Centrale Européenne · Temps réel
      </div>
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080d14",
        fontFamily: "'IBM Plex Sans','Segoe UI',sans-serif",
        color: "#e6edf3",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=IBM+Plex+Sans:wght@400;600;700;800&display=swap');
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#2a3548;border-radius:3px}
        input,button{font-family:inherit}
      `}</style>

      <div
        style={{
          borderBottom: "1px solid #141e2e",
          padding: "10px 28px",
          background: "#090f1a",
        }}
      >
        <div
          style={{
            fontSize: 9,
            color: "#445",
            letterSpacing: 2.5,
            textTransform: "uppercase",
            marginBottom: 2,
          }}
        >
          Multi-sources · Gratuit · Mondial
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#e6edf3" }}>
          Stock Screener <span style={{ color: "#2a3548" }}>—</span>{" "}
          <span style={{ color: "#f0a500" }}>
            Méthodologie d'Investissement
          </span>
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
          {[
            ["Yahoo Finance", "#22c55e"],
            ["CoinGecko", "#f59e0b"],
            ["ECB", "#60a5fa"],
          ].map(([l, c]) => (
            <span key={l} style={{ fontSize: 9, color: "#556" }}>
              <span style={{ color: c }}>●</span> {l}
            </span>
          ))}
        </div>
      </div>

      <div style={{ padding: "24px 28px 0" }}>
        <div style={{ maxWidth: 740 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doAnalyze()}
              placeholder="Ticker : AAPL · MC.PA · BTC · bitcoin · USD · EUR/GBP..."
              style={{
                flex: 1,
                background: "#0d1420",
                border: "1px solid #2a3548",
                borderRadius: 10,
                color: "#e6edf3",
                padding: "14px 18px",
                fontSize: 15,
                fontWeight: 600,
                outline: "none",
              }}
            />
            <button
              onClick={() => doAnalyze()}
              disabled={loading}
              style={{
                background: loading ? "#141e2e" : "#f0a500",
                color: loading ? "#445" : "#000",
                border: "none",
                borderRadius: 10,
                padding: "14px 26px",
                fontSize: 14,
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {loading ? "…" : "Analyser →"}
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#445" }}>
            💡 Actions :{" "}
            <span style={{ color: "#8b949e" }}>
              AAPL · MC.PA · AIR.PA · SAP.DE · 7203.T
            </span>{" "}
            · Crypto :{" "}
            <span style={{ color: "#8b949e" }}>BTC · ethereum · SOL</span> ·
            Forex : <span style={{ color: "#8b949e" }}>USD · EUR/GBP</span>
          </div>
        </div>
      </div>

      {log.length > 0 && (
        <div
          style={{
            margin: "14px 28px 0",
            background: "#090f1a",
            border: "1px solid #141e2e",
            borderRadius: 8,
            padding: "8px 14px",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: "#445",
              textTransform: "uppercase",
              letterSpacing: 1.5,
              marginBottom: 5,
            }}
          >
            Journal
          </div>
          {log.map((l, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: "#556",
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            >
              {l}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div
          style={{
            margin: "14px 28px 0",
            background: "#1e0a0a",
            border: "1px solid #5a1a1a",
            borderRadius: 8,
            padding: "12px 16px",
            color: "#ef4444",
            fontSize: 13,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <div
            style={{
              width: 34,
              height: 34,
              border: "3px solid #141e2e",
              borderTopColor: "#f0a500",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      )}

      {result && !loading && (
        <div style={{ padding: "22px 28px", maxWidth: 880 }}>
          {result.type === "stock" && (
            <StockView metrics={result.metrics} chartData={result.chartData} />
          )}
          {result.type === "crypto" && <CryptoView data={result.data} />}
          {result.type === "forex" && <ForexView {...result} />}
        </div>
      )}
    </div>
  );
}
