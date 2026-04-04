// ════════════════════════════════════════════════════════════════
// COUCHE 1 — CONSTANTES & TYPES COMMUNS
// ════════════════════════════════════════════════════════════════
import { useState, useCallback, useRef, useEffect } from "react";

const THEME = {
  // Fonds
  bgPage:       "#080d14",
  bgHeader:     "#090f1a",
  bgPanel:      "#0d1420",
  bgCard:       "#111825",
  bgCardAlt:    "#151f30",

  // Bordures
  borderSubtle: "#141e2e",
  borderPanel:  "#1e2a3a",
  borderMid:    "#2a3548",

  // Texte — hiérarchie 3 niveaux
  textPrimary:   "#e6edf3",
  textSecondary: "#94a3b8",
  textMuted:     "#64748b",

  // Accent
  accent:  "#f0a500",

  // Scores
  scoreGreen:  "#22c55e",
  scoreAmber:  "#f59e0b",
  scoreRed:    "#ef4444",
  scoreOrange: "#f97316",
} as const;

const EXCHANGE_CURRENCY: Record<string, string> = {
  ".PA":"EUR",".DE":"EUR",".AS":"EUR",".MI":"EUR",".MC":"EUR",
  ".BR":"EUR",".LS":"EUR",".L":"GBP",".IL":"GBX",".T":"JPY",
  ".HK":"HKD",".AX":"AUD",".TO":"CAD",".SW":"CHF",".ST":"SEK",
  ".CO":"DKK",".OL":"NOK",".HE":"EUR",".WA":"PLN",".IS":"TRY",
};

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  EQUITY:         { label:"Action", color:"#60a5fa", bg:"#1e3a5f" },
  ETF:            { label:"ETF",    color:"#a78bfa", bg:"#2d1b69" },
  MUTUALFUND:     { label:"Fonds",  color:"#22d3ee", bg:"#0c3d4a" },
  INDEX:          { label:"Indice", color:"#fbbf24", bg:"#3d2a00" },
  CRYPTOCURRENCY: { label:"Crypto", color:"#f0a500", bg:"#3d2800" },
  CURRENCY:       { label:"Forex",  color:"#34d399", bg:"#0a2e1a" },
};
const getBadge = (t?: string) =>
  TYPE_BADGE[t?.toUpperCase() ?? ""] || { label: t || "—", color: "#94a3b8", bg: "#1a2235" };

// ════════════════════════════════════════════════════════════════
// BLOC 2 — HELPERS
// ════════════════════════════════════════════════════════════════
function fmt(n: number | null | undefined, dec = 2): string {
  if (n == null || isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return (n/1e12).toFixed(1)+"T";
  if (a >= 1e9)  return (n/1e9).toFixed(1)+"B";
  if (a >= 1e6)  return (n/1e6).toFixed(1)+"M";
  if (a >= 1e3)  return (n/1e3).toFixed(1)+"k";
  return Number(n).toFixed(dec);
}
function pct(n: number | null | undefined): string {
  return n == null || isNaN(n) ? "—" : (n*100).toFixed(2)+"%";
}
function scoreVal(val: number, low: number, mid: number, high: number, invert = false): number {
  let s: number;
  if (val <= low)       s = invert ? 10 : 2;
  else if (val >= high) s = invert ? 2  : 10;
  else if (val <= mid)  s = invert ? 7  : 4;
  else                  s = invert ? 4  : 7;
  return s;
}
function scoreColor(s: number | null): string {
  if (s == null) return "#555";
  if (s >= 6.67) return "#22c55e";
  if (s >= 3.34) return "#f59e0b";
  return "#ef4444";
}
function getVerdict(g: number | null) {
  if (g == null) return null;
  if (g >= 7.5) return { label:"Opportunité Technique", color:"#22c55e", emoji:"🚀", desc:"Signal technique fort — fondamentaux confirment." };
  if (g >= 5.5) return { label:"Signal Intéressant",    color:"#f59e0b", emoji:"⚖️", desc:"Contexte en construction — surveiller l'entrée." };
  if (g >= 3.5) return { label:"Prudence",              color:"#f97316", emoji:"⚠️", desc:"Signaux mitigés ou contexte défavorable." };
  return         { label:"Risque Élevé",         color:"#ef4444", emoji:"🔴", desc:"Chaos ou excès spéculatif — risque élevé." };
}

// ════════════════════════════════════════════════════════════════
// COUCHE 1b — TYPES NORMALISÉS
// ════════════════════════════════════════════════════════════════

interface MacroContext {
  rate10y:       number | null;  // Taux 10 ans US (%)
  spreadCurve:   number | null;  // Spread 2/10 ans (points de base)
  vix:           number | null;  // VIX — volatilité implicite S&P500
  cpi:           number | null;  // CPI annuel US (%)
  fedFunds:      number | null;  // Taux Fed Funds (%)
  indexRegional: number | null;  // Indice régional (STOXX50E / FTSE / N225)
  indexLabel:    string | null;  // Libellé lisible de l'indice régional
  fetchedAt:     number;         // timestamp Unix
  error?:        string;
}

type MacroZone = "us" | "eur" | "gbp" | "jpy" | "hkd" | "other";

function detectZone(ticker: string): MacroZone {
  const eur = [".PA", ".DE", ".AS", ".MI", ".MC", ".BR", ".LS", ".HE", ".WA", ".IS"];
  const gbp = [".L", ".IL"];
  const jpy = [".T"];
  const hkd = [".HK"];
  const upper = ticker.toUpperCase();
  if (eur.some(s => upper.endsWith(s))) return "eur";
  if (gbp.some(s => upper.endsWith(s))) return "gbp";
  if (jpy.some(s => upper.endsWith(s))) return "jpy";
  if (hkd.some(s => upper.endsWith(s))) return "hkd";
  if (!upper.includes(".")) return "us";
  return "other";
}

// ════════════════════════════════════════════════════════════════
// COUCHE 2 — ADAPTERS (sources de données)
// ════════════════════════════════════════════════════════════════
const PROXY   = "https://screener.etheryoh.workers.dev";
const ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=jsondata";

const getJson = async (url: string): Promise<any> => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 12000);
  const r = await fetch(url, { signal: controller.signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

// Périodes supportées par Yahoo Finance chart API
const CHART_RANGES: Record<string, { range: string; interval: string; label: string }> = {
  "3m":  { range: "3mo",  interval: "1d",  label: "3 mois" },
  "1a":  { range: "1y",   interval: "1d",  label: "1 an"   },
  "2a":  { range: "2y",   interval: "1d",  label: "2 ans"  },
  "3a":  { range: "3y",   interval: "1wk", label: "3 ans"  },
  "5a":  { range: "5y",   interval: "1wk", label: "5 ans"  },
  "10a": { range: "10y",  interval: "1mo", label: "10 ans" },
};

const STOCK_UT_CONFIG: Record<string, {
  range: string; interval: string; label: string; displayLabel: string;
}> = {
  "1D": { range: "1y",  interval: "1d",  label: "1D", displayLabel: "Journalier"   },
  "1W": { range: "10y", interval: "1wk", label: "1W", displayLabel: "Hebdomadaire" },
  "1M": { range: "max", interval: "1mo", label: "1M", displayLabel: "Mensuel"      },
};
const STOCK_UT_PERIODS = Object.entries(STOCK_UT_CONFIG)
  .map(([key, cfg]) => ({ key, label: cfg.label }));

// ── DÉTECTION UNIFIÉE DU TYPE D'ACTIF ────────────────────────
const KNOWN_CRYPTO_SYMBOLS = new Set([
  "BTC","ETH","SOL","BNB","XRP","ADA","DOGE","AVAX","DOT","MATIC",
  "LINK","UNI","ATOM","LTC","BCH","XLM","ALGO","VET","ICP","FIL",
  "HBAR","ETC","MANA","SAND","AXS","THETA","XTZ","EOS","AAVE","MKR",
  "COMP","SNX","CRV","YFI","SUSHI","1INCH","GRT","ENJ","CHZ","BAT",
  "ZEC","DASH","XMR","NEO","WAVES","QTUM","ONT","ZIL","ICX","IOTA",
  "OP","ARB","APT","SUI","SEI","TIA","INJ","PYTH","JUP","WIF",
]);

const FOREX_CURRENCY_CODES = new Set([
  "USD","EUR","GBP","JPY","CHF","CAD","AUD","NZD","SEK","NOK",
  "DKK","PLN","HUF","CZK","TRY","ZAR","SGD","HKD","MXN","BRL",
  "CNY","INR","KRW","THB","IDR","MYR","PHP","AED","SAR","ILS",
]);

const INDEX_PREFIXES = ["^", "^GSPC","^FCHI","^GDAXI","^FTSE","^N225","^DJI","^IXIC","^STOXX50E","^VIX","^TNX","^IRX","^HSI"];

function detectAssetType(raw: string, mode?: string): "crypto" | "forex" | "index" | "stock" {
  const upper = raw.trim().toUpperCase();

  // Mode explicite (sélection via filtre UI)
  if (mode === "crypto")  return "crypto";
  if (mode === "forex")   return "forex";
  if (mode === "index")   return "index";

  // Index : commence par ^ ou ticker connu
  if (upper.startsWith("^")) return "index";

  // Forex : ticker =X, paire slash, devise iso 3 lettres connue, 6 lettres devises
  if (upper.endsWith("=X")) return "forex";
  if (/^[A-Z]{3}[/][A-Z]{3}$/.test(upper)) return "forex";
  if (FOREX_CURRENCY_CODES.has(upper)) return "forex";
  if (/^[A-Z]{6}$/.test(upper) &&
      FOREX_CURRENCY_CODES.has(upper.slice(0,3)) &&
      FOREX_CURRENCY_CODES.has(upper.slice(3,6))) return "forex";

  // Crypto : symbole connu ou pattern -USD/-USDT
  if (KNOWN_CRYPTO_SYMBOLS.has(upper)) return "crypto";
  if (/^[A-Z0-9]{2,10}-(USD|USDT|EUR|BTC)$/i.test(raw)) return "crypto";

  return "stock";
}

// ── MODES DE RECHERCHE ────────────────────────────────────────
type SearchMode = "all" | "equity" | "etf" | "futures" | "forex" | "crypto" | "index" | "bond";

const SEARCH_MODES: { key: SearchMode; label: string; yfTypes?: string[]; color: string }[] = [
  { key: "all",     label: "Tout",             color: "#94a3b8" },
  { key: "equity",  label: "Actions",          color: "#60a5fa", yfTypes: ["EQUITY"] },
  { key: "etf",     label: "Fonds",            color: "#a78bfa", yfTypes: ["ETF", "MUTUALFUND"] },
  { key: "futures", label: "Contrats à terme", color: "#fb923c", yfTypes: ["FUTURE"] },
  { key: "forex",   label: "Forex",            color: "#34d399", yfTypes: ["CURRENCY"] },
  { key: "crypto",  label: "Crypto",           color: "#f0a500", yfTypes: ["CRYPTOCURRENCY"] },
  { key: "index",   label: "Indices",          color: "#fbbf24", yfTypes: ["INDEX"] },
  { key: "bond",    label: "Obligations",      color: "#22d3ee", yfTypes: ["BOND"] },
];

interface SearchSuggestion {
  symbol:    string;
  name:      string;
  type:      string;
  exchange?: string;
}

// ── Adapter Yahoo Finance ─────────────────────────────────────
async function yfChart(ticker: string, addLog: (s: string) => void, period = "1a") {
  const { range, interval } = CHART_RANGES[period] || CHART_RANGES["1a"];
  const url = `${PROXY}?ticker=${encodeURIComponent(ticker)}&type=chart&range=${range}&interval=${interval}`;
  addLog(`  📡 Yahoo Chart: ${ticker} (${range})...`);
  try {
    const d = await getJson(url);
    const res = d?.chart?.result?.[0];
    if (!res) throw new Error("Pas de résultat");
    const meta       = res.meta;
    const timestamps = (res.timestamp || []) as number[];
    const q          = res.indicators?.quote?.[0] || {};
    const closes     = (res.indicators?.adjclose?.[0]?.adjclose || q.close || []) as (number | null)[];
    const opens      = (q.open   || []) as (number | null)[];
    const highs      = (q.high   || []) as (number | null)[];
    const lows       = (q.low    || []) as (number | null)[];
    const volumes    = (q.volume || []) as (number | null)[];
    addLog(`  ✅ Yahoo Chart: ${meta.regularMarketPrice} ${meta.currency}`);
    return { meta, closes, timestamps, opens, highs, lows, volumes };
  } catch(e: any) {
    addLog(`  ⚠️ Yahoo Chart: ${e.message}`);
    return null;
  }
}

async function yfFundamentals(ticker: string, addLog: (s: string) => void) {
  const url = `${PROXY}?ticker=${encodeURIComponent(ticker)}&type=fundamentals`;
  addLog(`  📡 Yahoo Fundamentals: ${ticker}...`);
  try {
    const d = await getJson(url);
    const res = d?.quoteSummary?.result?.[0];
    if (!res) throw new Error("Pas de résultat");
    addLog(`  ✅ Fondamentaux reçus`);
    return res;
  } catch(e: any) {
    addLog(`  ⚠️ Fondamentaux: ${e.message}`);
    return null;
  }
}

// ── Adapter CoinGecko ─────────────────────────────────────────
async function cgSearch(q: string): Promise<string | null> {
  try {
    const d = await getJson(`${PROXY}?type=cg&path=${encodeURIComponent(`search?query=${encodeURIComponent(q)}`)}`);
    const coins = d?.coins ?? [];
    if (coins.length === 0) return null;

    // 1. Correspondances exactes symbole — meilleur rang market_cap
    const bySymbol = coins
      .filter((c: any) => c.symbol.toLowerCase() === q.toLowerCase())
      .sort((a: any, b: any) => (a.market_cap_rank ?? 9999) - (b.market_cap_rank ?? 9999));
    if (bySymbol.length > 0) return bySymbol[0].id;

    // 2. Correspondance exacte id
    const byId = coins.find((c: any) => c.id.toLowerCase() === q.toLowerCase());
    if (byId) return byId.id;

    // 3. Correspondance début de nom
    const byName = coins.find((c: any) => c.name.toLowerCase().startsWith(q.toLowerCase()));
    if (byName) return byName.id;

    // 4. Fallback : premier résultat si rang market_cap_rank <= 200
    const first = coins[0];
    if (first && first.market_cap_rank != null && first.market_cap_rank <= 200) {
      return first.id;
    }

    return null;
  } catch { return null; }
}

async function cgCoin(id: string): Promise<any> {
  try {
    return await getJson(
      `${PROXY}?type=cg&path=${encodeURIComponent(`coins/${id}?localization=true&tickers=false&community_data=false`)}`
    );
  } catch { return null; }
}

async function binanceOHLCV(symbol: string, interval: string, limit: number): Promise<{
  closes: (number|null)[]; opens: (number|null)[]; highs: (number|null)[]; lows: (number|null)[];
  volumes: (number|null)[]; timestamps: number[];
} | null> {
  try {
    const data = await getJson(
      `${PROXY}?type=klines&symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`
    );
    if (!Array.isArray(data) || data.length === 0) return null;
    return {
      closes:     data.map((k: any) => parseFloat(k[4]) as number | null),
      opens:      data.map((k: any) => parseFloat(k[1]) as number | null),
      highs:      data.map((k: any) => parseFloat(k[2]) as number | null),
      lows:       data.map((k: any) => parseFloat(k[3]) as number | null),
      volumes:    data.map((k: any) => parseFloat(k[5]) as number | null),
      timestamps: data.map((k: any) => Math.floor(k[0] / 1000)),
    };
  } catch { return null; }
}

async function cgOHLCV(id: string): Promise<{
  closes:     (number|null)[];
  opens:      (number|null)[];
  highs:      (number|null)[];
  lows:       (number|null)[];
  volumes:    (number|null)[];
  timestamps: number[];
} | null> {
  try {
    const path = `coins/${id}/market_chart?vs_currency=usd&days=max`;
    const data = await getJson(`${PROXY}?type=cg&path=${encodeURIComponent(path)}`);
    if (!data?.prices?.length) return null;
    const closes     = data.prices.map(([, p]: [number, number]) => p as number | null);
    const timestamps = data.prices.map(([ts]: [number, number]) => ts > 1e12 ? Math.floor(ts / 1000) : ts);
    const volumes    = (data.total_volumes ?? []).map(([, v]: [number, number]) => v as number | null);
    return {
      closes,
      opens:  closes.map(() => null),
      highs:  closes.map(() => null),
      lows:   closes.map(() => null),
      volumes,
      timestamps,
    };
  } catch { return null; }
}

// ── Adapter ECB ───────────────────────────────────────────────
async function ecbRates(): Promise<Record<string, number>> {
  try {
    const d = await getJson(ECB_URL);
    const series = d.dataSets?.[0]?.series;
    const dims   = d.structure?.dimensions?.series;
    const ci     = dims?.findIndex((k: any) => k.id === "CURRENCY");
    const rates: Record<string, number> = {};
    for (const [sk, sv] of Object.entries(series ?? {})) {
      const code = dims[ci]?.values?.[parseInt(sk.split(":")[ci])]?.id;
      const obs  = Object.values((sv as any).observations ?? {});
      if (code && obs.length) rates[code] = (obs[obs.length - 1] as any)[0];
    }
    return rates;
  } catch { return {}; }
}

// ── SUGGESTIONS DE RECHERCHE ──────────────────────────────────
// Nécessite proxy ?type=search → ajouter dans le Worker CF :
//   const q = url.searchParams.get("q");
//   const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=10&newsCount=0`);

// ── Adapter Yahoo Finance (suite) ────────────────────────────
async function yfSearch(q: string): Promise<SearchSuggestion[]> {
  try {
    const d = await getJson(`${PROXY}?q=${encodeURIComponent(q)}&type=search`);
    return (d?.quotes ?? []).slice(0, 10).map((r: any) => ({
      symbol:   r.symbol,
      name:     r.shortname || r.longname || r.symbol,
      type:     r.quoteType || "EQUITY",
      exchange: r.exchDisp  || r.exchange || "",
    }));
  } catch { return []; }
}

async function cgSearchSuggest(q: string): Promise<SearchSuggestion[]> {
  try {
    const d = await getJson(`${PROXY}?type=cg&path=${encodeURIComponent(`search?query=${encodeURIComponent(q)}`)}`);
    return (d?.coins ?? []).slice(0, 5).map((c: any) => ({
      symbol:   c.symbol.toUpperCase(),
      name:     c.name,
      type:     "CRYPTOCURRENCY",
      exchange: "CoinGecko",
    }));
  } catch { return []; }
}

// ── Adapter Macro (via Yahoo Finance) ────────────────────────
// Utilise Yahoo Finance pour les indicateurs macro — pas de clé
// requise, pas de CORS, passe par le proxy existant.
// Séries :
//   ^VIX  → volatilité implicite S&P500
//   ^TNX  → taux 10 ans US (%)
//   ^IRX  → taux 3 mois US (%) — spread avec TNX = courbe
//   ^GSPC → S&P500 PE via fundamentals

async function fetchMacroYahoo(symbol: string): Promise<number | null> {
  try {
    const url = `${PROXY}?ticker=${encodeURIComponent(symbol)}&type=chart&range=5d&interval=1d`;
    const d = await getJson(url);
    const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price != null ? parseFloat(parseFloat(price).toFixed(3)) : null;
  } catch { return null; }
}

const ZONE_INDEX: Record<string, { symbol: string; label: string }> = {
  eur: { symbol: "^STOXX50E", label: "Euro Stoxx 50" },
  gbp: { symbol: "^FTSE",     label: "FTSE 100"      },
  jpy: { symbol: "^N225",     label: "Nikkei 225"    },
  hkd: { symbol: "^HSI",      label: "Hang Seng"     },
};

const ZONE_TICKERS: Record<MacroZone, string> = {
  us:    "^VIX · ^TNX · ^IRX",
  eur:   "^VIX · ^STOXX50E · ^TNX",
  gbp:   "^VIX · ^FTSE · ^TNX",
  jpy:   "^VIX · ^N225 · ^TNX",
  hkd:   "^VIX · ^HSI · ^TNX",
  other: "^VIX · ^TNX",
};

async function fetchMacroContext(zone: MacroZone): Promise<MacroContext> {
  const regionalDef = ZONE_INDEX[zone] ?? null;

  const [vix, rate10y, thirdVal] = await Promise.all([
    fetchMacroYahoo("^VIX"),
    fetchMacroYahoo("^TNX"),
    zone === "us"    ? fetchMacroYahoo("^IRX")
    : regionalDef   ? fetchMacroYahoo(regionalDef.symbol)
    :                  Promise.resolve(null),
  ]);

  const spreadCurve = (zone === "us" && rate10y != null && thirdVal != null)
    ? parseFloat((rate10y - thirdVal).toFixed(3))
    : null;

  const indexRegional = (zone !== "us" && zone !== "other") ? thirdVal : null;
  const indexLabel    = (zone !== "us" && zone !== "other" && regionalDef) ? regionalDef.label : null;

  return {
    rate10y,
    spreadCurve,
    vix,
    cpi:      null,
    fedFunds: null,
    indexRegional,
    indexLabel,
    fetchedAt: Date.now(),
  };
}

// ════════════════════════════════════════════════════════════════
// COUCHE 3 — ANALYSE (scoring & signaux)
// ════════════════════════════════════════════════════════════════
type SentSignal = { color: string; label: string; detail: string; edu: TechSignal["edu"] };

function scoreSentimentInstitutional(
  heldInsiders:      number | undefined,
  heldInstitutions:  number | undefined,
  shortPercentFloat: number | undefined,
  shortRatio:        number | undefined,
  mktCap:            number | undefined,
): { score: number; signals: SentSignal[] } {
  let score = 5;
  const signals: SentSignal[] = [];

  const eduInstitutions: TechSignal["edu"] = {
    concept: "Les investisseurs institutionnels (fonds de pension, hedge funds, ETF) représentent les 'mains fortes' du marché. Une forte présence institutionnelle signifie que des équipes d'analystes professionnels ont validé le dossier.",
    howToRead: "Plus de 70% : forte validation institutionnelle. Entre 40% et 70% : présence modérée. Sous 40% : peu suivi par les grands fonds — liquidité potentiellement réduite.",
    example: heldInstitutions != null
      ? `${(heldInstitutions*100).toFixed(1)}% du capital est détenu par des institutionnels. ${heldInstitutions > 0.70 ? "Forte validation — les grands fonds ont fait leur due diligence." : heldInstitutions > 0.40 ? "Présence modérée." : "Faible intérêt institutionnel — couverture analytique limitée."}`
      : "Données institutionnelles non disponibles.",
  };

  const eduShortFloat: TechSignal["edu"] = {
    concept: "Le short float mesure la part du flottant (actions disponibles à la vente) vendue à découvert. Les vendeurs à découvert sont généralement des hedge funds qui ont fait une analyse approfondie et parient sur la baisse.",
    howToRead: "Sous 3% : quasi-absence de conviction baissière professionnelle. Entre 3% et 8% : pression modérée. Entre 8% et 15% : forte conviction baissière. Au-dessus de 15% : signal extrême — soit le marché a raison, soit un short squeeze est possible.",
    example: shortPercentFloat != null
      ? `${(shortPercentFloat*100).toFixed(1)}% du flottant est vendu à découvert. ${shortPercentFloat < 0.03 ? "Très faible pression short — les professionnels ne voient pas de catalyseur baissier évident." : shortPercentFloat < 0.08 ? "Pression modérée — surveillance recommandée." : "Forte conviction baissière des professionnels."}`
      : "Données short float non disponibles.",
  };

  const eduShortRatio: TechSignal["edu"] = {
    concept: "Le Days to Cover (ou short ratio) = positions short totales / volume quotidien moyen. Il indique combien de jours il faudrait aux vendeurs à découvert pour racheter toutes leurs positions sans perturber le marché.",
    howToRead: "Sous 3 jours : positions short légères, faciles à dénouer. Au-dessus de 8 jours : positions lourdes — si le titre monte, les vendeurs sont piégés et doivent racheter en urgence, ce qui amplifie la hausse (short squeeze).",
    example: shortRatio != null
      ? `Days to cover : ${shortRatio.toFixed(1)} jours. ${shortRatio < 3 ? "Positions short légères — peu de risque de squeeze, pression vendeuse structurellement faible." : "Positions importantes — surveiller tout catalyseur positif qui pourrait déclencher un squeeze."}`
      : "Données days to cover non disponibles.",
  };

  // Insiders — contextualisé par la taille de l'entreprise
  if (heldInsiders != null) {
    const isMegaCap  = mktCap != null && mktCap > 100e9;
    const isLargeCap = mktCap != null && mktCap > 10e9;

    if (heldInsiders > 0.10) {
      score += 1.5;
      signals.push({
        color: "#22c55e",
        label: `Insiders ${(heldInsiders*100).toFixed(1)}%`,
        detail: "Forte détention par les dirigeants — alignement fort avec les actionnaires.",
        edu: {
          concept: "Les insiders (dirigeants, administrateurs) qui détiennent une part significative du capital ont un intérêt financier direct dans la performance du titre.",
          howToRead: "Plus de 10% : engagement fort. Entre 3% et 10% : intérêt modéré. Sous 3% : faible exposition personnelle — normal sur les mega-caps où les dirigeants ont vendu progressivement au fil des années.",
          example: `Les insiders détiennent ${(heldInsiders*100).toFixed(1)}% du capital — signal de confiance élevée.`,
        },
      });
    } else if (heldInsiders > 0.03) {
      score += 0.5;
      signals.push({
        color: "#f59e0b",
        label: `Insiders ${(heldInsiders*100).toFixed(1)}%`,
        detail: "Détention modérée des dirigeants — intérêt aligné mais limité.",
        edu: {
          concept: "Les insiders (dirigeants, administrateurs) qui détiennent une part significative du capital ont un intérêt financier direct dans la performance du titre.",
          howToRead: "Plus de 10% : engagement fort. Entre 3% et 10% : intérêt modéré. Sous 3% : faible exposition personnelle — normal sur les mega-caps.",
          example: `Les insiders détiennent ${(heldInsiders*100).toFixed(1)}% du capital — alignement modéré.`,
        },
      });
    } else if (isMegaCap) {
      signals.push({
        color: "#94a3b8",
        label: `Insiders ${(heldInsiders*100).toFixed(1)}%`,
        detail: "Faible détention relative — normal sur une très grande capitalisation où les dirigeants ont progressivement cédé des titres au fil des années.",
        edu: {
          concept: "Les insiders (dirigeants, administrateurs) qui détiennent une part significative du capital ont un intérêt financier direct dans la performance du titre.",
          howToRead: "Sur les très grandes capitalisations (>100B$), un faible pourcentage d'insiders est structurel et ne reflète pas un manque de confiance — les dirigeants ont vendu progressivement sur des décennies. Ce signal est à pondérer différemment des small/mid caps.",
          example: `Les insiders détiennent ${(heldInsiders*100).toFixed(1)}% du capital. Sur une capitalisation de cette taille, c'est attendu et ne constitue pas un signal négatif.`,
        },
      });
    } else if (isLargeCap) {
      score -= 0.25;
      signals.push({
        color: "#94a3b8",
        label: `Insiders ${(heldInsiders*100).toFixed(1)}%`,
        detail: "Faible détention des dirigeants — exposition personnelle limitée au titre.",
        edu: {
          concept: "Les insiders (dirigeants, administrateurs) qui détiennent une part significative du capital ont un intérêt financier direct dans la performance du titre.",
          howToRead: "Plus de 10% : engagement fort. Entre 3% et 10% : intérêt modéré. Sous 3% sur une large-cap : signal légèrement défavorable mais à relativiser selon la taille.",
          example: `Les insiders détiennent ${(heldInsiders*100).toFixed(1)}% du capital.`,
        },
      });
    } else {
      score -= 0.5;
      signals.push({
        color: "#ef4444",
        label: `Insiders ${(heldInsiders*100).toFixed(1)}%`,
        detail: "Faible détention des dirigeants sur une entreprise de taille moyenne — signal d'alignement insuffisant.",
        edu: {
          concept: "Les insiders (dirigeants, administrateurs) qui détiennent une part significative du capital ont un intérêt financier direct dans la performance du titre.",
          howToRead: "Sur une small/mid cap, une faible détention insider (<3%) est un signal négatif réel — les dirigeants n'ont pas mis leur propre argent dans l'entreprise qu'ils dirigent.",
          example: `Les insiders détiennent seulement ${(heldInsiders*100).toFixed(1)}% du capital — faible alignement avec les actionnaires.`,
        },
      });
    }
  }

  // Institutionnels
  if (heldInstitutions != null) {
    if (heldInstitutions > 0.70) {
      score += 1.0;
      signals.push({ color: "#22c55e", label: `Institutionnels ${(heldInstitutions*100).toFixed(1)}%`, detail: "Forte présence institutionnelle — validation par les grands fonds.", edu: eduInstitutions });
    } else if (heldInstitutions > 0.40) {
      score += 0.5;
      signals.push({ color: "#f59e0b", label: `Institutionnels ${(heldInstitutions*100).toFixed(1)}%`, detail: "Présence institutionnelle modérée.", edu: eduInstitutions });
    } else {
      score -= 0.5;
      signals.push({ color: "#ef4444", label: `Institutionnels ${(heldInstitutions*100).toFixed(1)}%`, detail: "Faible intérêt institutionnel — couverture analytique limitée, liquidité réduite.", edu: eduInstitutions });
    }
  }

  // Short float
  if (shortPercentFloat != null) {
    if (shortPercentFloat < 0.03) {
      score += 1.5;
      signals.push({ color: "#22c55e", label: `Short float ${(shortPercentFloat*100).toFixed(1)}%`, detail: "Très peu de positions short — les professionnels ne parient pas contre ce titre.", edu: eduShortFloat });
    } else if (shortPercentFloat < 0.08) {
      score += 0.0;
      signals.push({ color: "#f59e0b", label: `Short float ${(shortPercentFloat*100).toFixed(1)}%`, detail: "Pression short modérée — surveillance recommandée.", edu: eduShortFloat });
    } else if (shortPercentFloat < 0.15) {
      score -= 1.0;
      signals.push({ color: "#f97316", label: `Short float ${(shortPercentFloat*100).toFixed(1)}%`, detail: "Pression short élevée — conviction baissière des professionnels.", edu: eduShortFloat });
    } else {
      score -= 2.0;
      signals.push({ color: "#ef4444", label: `Short float ${(shortPercentFloat*100).toFixed(1)}%`, detail: "Short float très élevé — forte conviction baissière ou potentiel short squeeze.", edu: eduShortFloat });
    }
  }

  // Short ratio (days to cover)
  if (shortRatio != null) {
    if (shortRatio < 3) {
      score += 0.5;
      signals.push({ color: "#22c55e", label: `Days to cover ${shortRatio.toFixed(1)}j`, detail: "Couverture rapide — peu de risque de squeeze, pression vendeuse faible.", edu: eduShortRatio });
    } else if (shortRatio > 8) {
      score -= 1.0;
      signals.push({ color: "#ef4444", label: `Days to cover ${shortRatio.toFixed(1)}j`, detail: "Couverture lente — positions short importantes, risque de squeeze en cas de bonne nouvelle.", edu: eduShortRatio });
    }
  }

  return { score: parseFloat(Math.max(1, Math.min(10, score)).toFixed(1)), signals };
}

function scoreSentimentPressure(
  change52w:         number | undefined,
  shortPercentFloat: number | undefined,
  vix:               number | null | undefined,
): { score: number; signals: SentSignal[] } {
  let score = 5;
  const signals: SentSignal[] = [];

  const edu52w: TechSignal["edu"] = {
    concept: "La performance sur 52 semaines reflète le momentum moyen terme et la perception du marché sur la période récente. Elle influence le point d'entrée : un titre en repli modéré offre souvent une meilleure marge de sécurité qu'un titre au plus haut.",
    howToRead: "Forte hausse (+20% et plus) : le momentum est positif mais la valorisation est déjà intégrée. Repli modéré (-10% à -30%) : possible décote temporaire si les fondamentaux restent solides. Forte chute (sous -30%) : le marché intègre un risque sérieux.",
    example: change52w != null
      ? `Performance 52 semaines : ${(change52w*100).toFixed(1)}%. ${change52w >= 0.20 ? "Fort momentum — valorisation déjà reflétée dans le prix." : change52w >= -0.10 ? "Momentum neutre à modéré — point d'entrée potentiellement favorable." : "Repli significatif — surveiller si les fondamentaux justifient un retour."}`
      : "Données de performance 52 semaines non disponibles.",
  };

  const eduPression: TechSignal["edu"] = {
    concept: "Quand plus de 10% du flottant est vendu à découvert, cela indique une méfiance structurelle des investisseurs professionnels vis-à-vis du titre.",
    howToRead: "Ce niveau de short float combiné à d'autres signaux négatifs renforce le signal baissier. Combiné à des fondamentaux solides, il peut au contraire signaler une opportunité de short squeeze.",
    example: shortPercentFloat != null
      ? `${(shortPercentFloat*100).toFixed(1)}% du flottant est vendu à découvert — niveau de méfiance institutionnelle notable.`
      : "Données short float non disponibles.",
  };

  const eduVix: TechSignal["edu"] = {
    concept: "Le VIX mesure la volatilité implicite du marché sur 30 jours. Dans le contexte du sentiment, il module la prime de risque globale qui s'applique à tous les titres indépendamment de leurs fondamentaux.",
    howToRead: "VIX élevé (>30) : le marché est en mode peur — même les bons titres souffrent. VIX bas (<15) : environnement serein, favorable à la prise de risque et aux entrées en position.",
    example: vix != null
      ? `VIX à ${vix}. ${vix > 30 ? "Stress élevé — prime de risque marché accrue, prudence sur le timing d'entrée même sur de bons dossiers." : "Marché serein — faible prime de risque, environnement favorable."}`
      : "Données VIX non disponibles.",
  };

  // Position dans le range 52 semaines (momentum moyen terme)
  if (change52w != null) {
    if (change52w >= 0.20) {
      score -= 1.0;
      signals.push({ color: "#f59e0b", label: `+${(change52w*100).toFixed(0)}% sur 52 sem.`, detail: "Fort momentum haussier — valorisation déjà reflétée dans le prix, marge de sécurité réduite.", edu: edu52w });
    } else if (change52w >= 0.05) {
      score += 0.5;
      signals.push({ color: "#22c55e", label: `+${(change52w*100).toFixed(0)}% sur 52 sem.`, detail: "Momentum positif modéré — le marché récompense progressivement le titre.", edu: edu52w });
    } else if (change52w >= -0.10) {
      score += 1.0;
      signals.push({ color: "#22c55e", label: `${(change52w*100).toFixed(0)}% sur 52 sem.`, detail: "Titre stable — pas de momentum excessif, point d'entrée potentiellement neutre.", edu: edu52w });
    } else if (change52w >= -0.30) {
      score += 1.5;
      signals.push({ color: "#22c55e", label: `${(change52w*100).toFixed(0)}% sur 52 sem.`, detail: "Titre en repli modéré — possible décote temporaire si les fondamentaux restent solides.", edu: edu52w });
    } else {
      score += 0.5;
      signals.push({ color: "#f97316", label: `${(change52w*100).toFixed(0)}% sur 52 sem.`, detail: "Forte baisse annuelle — le marché intègre un risque sérieux, vérifier les fondamentaux.", edu: edu52w });
    }
  }

  // Short float comme proxy pression vendeuse
  if (shortPercentFloat != null && shortPercentFloat > 0.10) {
    score -= 1.0;
    signals.push({ color: "#ef4444", label: "Pression vendeuse structurelle", detail: `${(shortPercentFloat*100).toFixed(1)}% du flottant vendu à découvert — signal de méfiance institutionnelle.`, edu: eduPression });
  }

  // VIX contextuel
  if (vix != null) {
    if (vix > 30) {
      score -= 1.0;
      signals.push({ color: "#ef4444", label: `VIX ${vix} — stress élevé`, detail: "Volatilité implicite élevée — prime de risque marché accrue, prudence sur le timing.", edu: eduVix });
    } else if (vix < 15) {
      score += 0.5;
      signals.push({ color: "#22c55e", label: `VIX ${vix} — marché serein`, detail: "Faible volatilité implicite — environnement favorable à la prise de position.", edu: eduVix });
    }
  }

  return { score: parseFloat(Math.max(1, Math.min(10, score)).toFixed(1)), signals };
}

// ── PROFIL D'ENTREPRISE ───────────────────────────────────────
type CompanyProfile =
  | "mega_cap_quality"
  | "dividend_compounder"
  | "growth_premium"
  | "capital_heavy"
  | "financial_sector"
  | "standard";

function detectCompanyProfile(
  mktCap:      number | undefined,
  netMargin:   number | undefined,
  divYield:    number | undefined,
  payoutRatio: number | undefined,
  ps:          number | undefined,
  change52w:   number | undefined,
  debtEq:      number | null | undefined,
  sector:      string,
  isFinancial: boolean,
): CompanyProfile {
  if (isFinancial) return "financial_sector";

  const capitalHeavySectors = ["utilities", "real estate", "energy", "telecommunication"];
  const isCapitalHeavy =
    capitalHeavySectors.some(s => sector.toLowerCase().includes(s)) ||
    (debtEq != null && debtEq > 1.5 && netMargin != null && netMargin > 0);
  if (isCapitalHeavy) return "capital_heavy";

  const isMegaCap =
    mktCap != null && mktCap > 200e9 &&
    netMargin != null && netMargin > 0.15;
  if (isMegaCap) return "mega_cap_quality";

  const isDividendCompounder =
    divYield != null && divYield > 0 && divYield < 0.025 &&
    payoutRatio != null && payoutRatio > 0 && payoutRatio < 0.65 &&
    netMargin != null && netMargin > 0.08;
  if (isDividendCompounder) return "dividend_compounder";

  const isGrowthPremium =
    ps != null && ps > 5 &&
    netMargin != null && netMargin > 0.10 &&
    change52w != null && change52w > 0.10;
  if (isGrowthPremium) return "growth_premium";

  return "standard";
}

function buildMetrics(yf: any, meta: any) {
  if (!yf && !meta) return null;
  const sd = yf?.summaryDetail        || {};
  const ks = yf?.defaultKeyStatistics || {};
  const fd = yf?.financialData        || {};
  const pr = yf?.price                || {};

  const pe          = sd.trailingPE?.raw as number | undefined;
  const pb          = (sd.priceToBook?.raw ?? ks.priceToBook?.raw) as number | undefined;
  const ps          = ks.priceToSalesTrailing12Months?.raw as number | undefined;
  const peg         = ks.pegRatio?.raw as number | undefined;
  const evEbitda    = ks.enterpriseToEbitda?.raw as number | undefined;
  const roe         = fd.returnOnEquity?.raw as number | undefined;
  const roa         = fd.returnOnAssets?.raw as number | undefined;
  const grossMargin = (fd.grossMargins?.raw != null && fd.grossMargins.raw <= 1
                        ? fd.grossMargins.raw : null) as number | null;
  const opMargin    = fd.operatingMargins?.raw as number | undefined;
  const netMargin   = (fd.profitMargins?.raw ?? ks.profitMargins?.raw) as number | undefined;
  const divYield    = (sd.dividendYield?.raw ?? sd.trailingAnnualDividendYield?.raw) as number | undefined;
  const payoutRatio = sd.payoutRatio?.raw as number | undefined;
  const debtEq      = fd.debtToEquity?.raw != null ? (fd.debtToEquity.raw / 100) as number : null;
  const currentRatio= fd.currentRatio?.raw as number | undefined;
  const fcf         = fd.freeCashflow?.raw as number | undefined;
  const sharesOut   = ks.sharesOutstanding?.raw as number | undefined;
  const shortRatio        = ks.shortRatio?.raw as number | undefined;
  const heldInsiders      = ks.heldPercentInsiders?.raw as number | undefined;
  const heldInstitutions  = ks.heldPercentInstitutions?.raw as number | undefined;
  const shortPercentFloat = ks.shortPercentOfFloat?.raw as number | undefined;
  const floatShares       = ks.floatShares?.raw as number | undefined;
  const beta              = sd.beta?.raw as number | undefined;
  const mktCap      = (pr.marketCap?.raw ?? sd.marketCap?.raw ?? meta?.marketCap) as number | undefined;
  const price       = (pr.regularMarketPrice?.raw ?? meta?.regularMarketPrice) as number | undefined;
  const change1d    = (pr.regularMarketChangePercent?.raw ?? meta?.regularMarketChangePercent) as number | undefined;
  // Yahoo Finance retourne parfois 52WeekChange en % (ex: 21.1) au lieu de décimal (0.211)
  // Si |valeur| > 15, c'est forcément un pourcentage → on normalise
  let change52w = (sd["52WeekChange"]?.raw ?? ks["52WeekChange"]?.raw) as number | undefined;
  if (change52w != null && Math.abs(change52w) > 15) change52w = change52w / 100;
  const name        = (pr.longName || pr.shortName || meta?.longName || meta?.shortName || "") as string;
  const longBusinessSummary = (
    yf?.assetProfile?.longBusinessSummary ||
    yf?.summaryProfile?.longBusinessSummary ||
    yf?.quoteType?.longBusinessSummary ||
    ""
  ) as string;
  const sector      = (yf?.assetProfile?.sector   || "") as string;
  const industry    = (yf?.assetProfile?.industry || "") as string;
  const isFinancial = ["Financial Services", "Banks", "Insurance", "Real Estate"]
    .some(s => sector.toLowerCase().includes(s.toLowerCase()));
  const companyProfile = detectCompanyProfile(mktCap, netMargin, divYield, payoutRatio, ps, change52w, debtEq, sector, isFinancial);
  const currency    = (pr.currency || meta?.currency || "USD") as string;
  const exchange    = (pr.exchangeName || meta?.exchangeName || "") as string;
  const quoteType   = (pr.quoteType || meta?.instrumentType || "EQUITY") as string;

  // ── SCORES INDIVIDUELS ────────────────────────────────────────

  // VALORISATION (40% du score global)
  const scorePE = pe != null ? scoreVal(pe, 15, 25, 40, true) : null;

  // P/B contextualisé par profil entreprise
  let scorePB: number | null = null;
  if (pb != null) {
    if (roe != null && roe < 0) {
      scorePB = Math.min(scoreVal(pb, 1, 3, 6, true), 4);
    } else if (companyProfile === "mega_cap_quality") {
      // Mega-cap : P/B très élevé est structurel (brand equity, buybacks)
      scorePB = scoreVal(pb, 10, 20, 40, true);
    } else if (roe != null && roe > 0.20) {
      scorePB = scoreVal(pb, 3, 6, 10, true);
    } else {
      scorePB = scoreVal(pb, 1, 3, 6, true);
    }
  }

  // P/S : important pour les boîtes à forte marge (tech)
  const scorePS = ps != null ? scoreVal(ps, 1, 3, 8, true) : null;

  // EV/EBITDA : meilleure mesure de valorisation que PE (neutre sur structure capital)
  const scoreEvEbitda = evEbitda != null ? scoreVal(evEbitda, 8, 15, 25, true) : null;

  // RENTABILITÉ (30% du score global)
  // ROE plafonné à 7/10 si > 50% (peut être artificiel via buybacks/levier)
  let scoreROE: number | null = null;
  if (roe != null) {
    if (roe < 0) {
      scoreROE = 2;
    } else if (roe > 0.50) {
      scoreROE = 7; // plafonné : ROE > 50% = ambigu
    } else {
      scoreROE = scoreVal(roe, 0.05, 0.15, 0.25, false);
    }
  }
  const scoreNetMargin  = netMargin  != null ? scoreVal(netMargin,  0.03, 0.10, 0.20, false) : null;
  const scoreOpMargin   = opMargin   != null
    ? isFinancial
      ? scoreVal(opMargin, 0.15, 0.25, 0.35, false)
      : scoreVal(opMargin, 0.05, 0.12, 0.20, false)
    : null;

  // SANTÉ FINANCIÈRE (20% du score global)
  const scoreDebtEq      = (!isFinancial && debtEq       != null) ? scoreVal(debtEq,      0.3, 0.8, 1.5, true)  : null;
  const scoreCurrentRatio = (() => {
    if (isFinancial || currentRatio == null) return null;
    if (companyProfile === "mega_cap_quality") {
      return currentRatio >= 0.7 ? 6 : scoreVal(currentRatio, 0.7, 1, 1.5, false);
    }
    if (companyProfile === "capital_heavy") {
      return scoreVal(currentRatio, 0.8, 1.2, 2.0, false);
    }
    return scoreVal(currentRatio, 1, 1.5, 2.5, false);
  })();

  // RISQUE / MOMENTUM (10% du score global)
  const scoreBeta = beta != null
    ? (beta < 0 ? 4 : scoreVal(Math.abs(beta - 1), 0, 0.3, 0.8, true))
    : null;
  let scorePerf52w: number | null = null;
  if (change52w != null) {
    if      (change52w >= 0.20)  scorePerf52w = 8;
    else if (change52w >= 0)     scorePerf52w = 6;
    else if (change52w >= -0.20) scorePerf52w = 4;
    else                         scorePerf52w = 2;
  }
  const scoreDivYield = (() => {
    if (divYield == null) return null;
    if (companyProfile === "dividend_compounder" || companyProfile === "mega_cap_quality") {
      if (divYield > 0 && divYield < 0.025) return 6;
      if (divYield >= 0.025) return scoreVal(divYield, 0.02, 0.04, 0.07, false);
    }
    return scoreVal(divYield, 0.01, 0.03, 0.06, false);
  })();

  // ── SCORE GLOBAL PONDÉRÉ ──────────────────────────────────────
  // Valorisation 40% | Rentabilité 30% | Santé 20% | Risque 10%

  const avg = (scores: (number | null)[]): number | null => {
    const v = scores.filter((s): s is number => s != null);
    return v.length ? parseFloat((v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)) : null;
  };

  // Règle : entreprise déficitaire → PB bas = signal de détresse, pas d'opportunité
  // On neutralise le PB (plafonné à 4) pour ne pas gonfler la valorisation
  const scorePBAdj = (netMargin != null && netMargin < 0 && scorePB != null)
    ? Math.min(scorePB, 4)
    : scorePB;

  const gValorisation = avg([scorePE, scorePBAdj, scorePS, scoreEvEbitda]);
  const gRentabilite  = avg([scoreROE, scoreNetMargin, scoreOpMargin]);
  const gSante        = avg([scoreDebtEq, scoreCurrentRatio]);
  const gRisque       = avg([scoreBeta, scorePerf52w, scoreDivYield]);

  const groups: [number | null, number][] = [
    [gValorisation, 0.40],
    [gRentabilite,  0.30],
    [gSante,        0.20],
    [gRisque,       0.10],
  ];

  let totalWeight = 0, totalScore = 0;
  for (const [g, w] of groups) {
    if (g != null) { totalScore += g * w; totalWeight += w; }
  }
  let globalScore = totalWeight > 0
    ? parseFloat((totalScore / totalWeight).toFixed(1))
    : null;

  // ── PLAFONNEMENTS RÉALISTES ──────────────────────────────────────
  // Règle 1 : valorisation très tendue → plafond 5.0
  // Une action surévaluée reste risquée même si l'entreprise est excellente.
  // C'est le PRIX payé aujourd'hui qui détermine le rendement futur.
  if (globalScore != null && gValorisation != null && gValorisation <= 2.0) {
    globalScore = Math.min(globalScore, 4.5);
  } else if (globalScore != null && gValorisation != null && gValorisation <= 3.0) {
    globalScore = Math.min(globalScore, 5.0);
  }
  // Règle 2 : santé financière critique → plafond 4.5
  // Liquidités insuffisantes = risque de faillite ou dilution en cas de choc.
  if (globalScore != null && gSante != null && gSante <= 2.5 && !isFinancial) {
    globalScore = Math.min(globalScore, 4.5);
  }
  // Règle 3 : combo valorisation tendue + santé faible → plafond 4.0
  if (globalScore != null && gValorisation != null && gSante != null
      && gValorisation <= 3.5 && gSante <= 3.0 && !isFinancial) {
    globalScore = Math.min(globalScore, 4.0);
  }
  // Règle 4 : entreprise déficitaire + chute > 30% sur 12 mois → risque élevé
  // Un débutant ne doit pas voir "Prudence" pour une boîte qui coule.
  if (globalScore != null && netMargin != null && netMargin < 0
      && change52w != null && change52w < -0.30) {
    globalScore = Math.min(globalScore, 3.4);
  }
  if (globalScore != null) globalScore = parseFloat(globalScore.toFixed(1));


  // ── Règle 5 : couverture fondamentale insuffisante ────────────
  // Si moins de 2 groupes ont des données réelles, le score est non significatif.
  const coveredGroups = [gValorisation, gRentabilite, gSante, gRisque]
    .filter(g => g != null).length;
  if (coveredGroups < 2) globalScore = null;

  // ── Règle 6 : types sans fondamentaux d'entreprise ───────────
  // INDEX, FUTURE, BOND ne se lisent pas avec des ratios PE/PB/ROE.
  const noFundaTypes = ["INDEX", "FUTURE", "BOND", "MUTUALFUND", "ETF", "CURRENCY"];
  if (noFundaTypes.indexOf((quoteType || "").toUpperCase()) !== -1) globalScore = null;

  const scores: Record<string, number | null> = {
    pe: scorePE, pb: scorePB, ps: scorePS, evEbitda: scoreEvEbitda,
    roe: scoreROE, netMargin: scoreNetMargin, opMargin: scoreOpMargin,
    debtEq: scoreDebtEq, currentRatio: scoreCurrentRatio,
    beta: scoreBeta, perf52w: scorePerf52w, divYield: scoreDivYield,
  };

  return {
    name, sector, industry, currency, exchange, quoteType, longBusinessSummary, companyProfile,
    mktCap, price, change1d, change52w,
    pe, pb, ps, peg, evEbitda,
    roe, roa, grossMargin, opMargin, netMargin,
    divYield, payoutRatio, debtEq, currentRatio, fcf,
    sharesOut, shortRatio, heldInsiders, heldInstitutions, shortPercentFloat, floatShares, beta,
    scores, globalScore,
    gValorisation, gRentabilite, gSante, gRisque,
    isFinancial,
    assetProfile: yf?.assetProfile,
  };
}

// ════════════════════════════════════════════════════════════════
// COUCHE 3b — CALCULS TECHNIQUES
// ════════════════════════════════════════════════════════════════

function calcRSI(closes: (number|null)[], period = 14): number | null {
  const c = closes.filter((v): v is number => v != null);
  if (c.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = c.length - period; i < c.length; i++) {
    const d = c[i] - c[i-1];
    if (d > 0) gains += d; else losses -= d;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

function calcEMA(closes: (number|null)[], period: number): number | null {
  const c = closes.filter((v): v is number => v != null);
  if (c.length < period) return null;
  const k = 2 / (period + 1);
  let ema = c.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < c.length; i++) ema = c[i] * k + ema * (1 - k);
  return parseFloat(ema.toFixed(2));
}

function calcBollingerBands(
  closes: (number|null)[],
  period = 20,
  mult   = 2,
): { upper: (number|null)[]; middle: (number|null)[]; lower: (number|null)[] } | null {
  const validPairs: { val: number; origIdx: number }[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (closes[i] != null) validPairs.push({ val: closes[i] as number, origIdx: i });
  }
  if (validPairs.length < period) return null;

  const upper:  (number|null)[] = new Array(closes.length).fill(null);
  const middle: (number|null)[] = new Array(closes.length).fill(null);
  const lower:  (number|null)[] = new Array(closes.length).fill(null);

  for (let j = period - 1; j < validPairs.length; j++) {
    const slice = validPairs.slice(j - period + 1, j + 1).map(p => p.val);
    const mean  = slice.reduce((a, b) => a + b, 0) / period;
    const std   = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
    const oi    = validPairs[j].origIdx;
    upper[oi]   = parseFloat((mean + mult * std).toFixed(4));
    middle[oi]  = parseFloat(mean.toFixed(4));
    lower[oi]   = parseFloat((mean - mult * std).toFixed(4));
  }
  return { upper, middle, lower };
}

function calcEMASeries(closes: (number|null)[], period: number): (number|null)[] {
  const result: (number|null)[] = new Array(closes.length).fill(null);
  const validPairs: { val: number; origIdx: number }[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (closes[i] != null) validPairs.push({ val: closes[i] as number, origIdx: i });
  }
  if (validPairs.length < period) return result;
  const k = 2 / (period + 1);
  let ema = validPairs.slice(0, period).reduce((a, b) => a + b.val, 0) / period;
  for (let j = period; j < validPairs.length; j++) {
    ema = validPairs[j].val * k + ema * (1 - k);
    result[validPairs[j].origIdx] = parseFloat(ema.toFixed(4));
  }
  return result;
}

function calcMACD(closes: (number|null)[]): { macd: number; signal: number; hist: number } | null {
  const c = closes.filter((v): v is number => v != null);
  if (c.length < 35) return null;
  // EMA 12 et 26 sur les N derniers points
  const ema12Series: number[] = [];
  const ema26Series: number[] = [];
  const k12 = 2/13, k26 = 2/27;
  let e12 = c.slice(0,12).reduce((a,b)=>a+b)/12;
  let e26 = c.slice(0,26).reduce((a,b)=>a+b)/26;
  for (let i = 12; i < c.length; i++) { e12 = c[i]*k12 + e12*(1-k12); if(i>=25) ema12Series.push(e12); }
  for (let i = 26; i < c.length; i++) { e26 = c[i]*k26 + e26*(1-k26); ema26Series.push(e26); }
  const macdLine = ema12Series.map((v,i) => v - ema26Series[i]);
  if (macdLine.length < 9) return null;
  const k9 = 2/10;
  let signal = macdLine.slice(0,9).reduce((a,b)=>a+b)/9;
  for (let i = 9; i < macdLine.length; i++) signal = macdLine[i]*k9 + signal*(1-k9);
  const macd = macdLine[macdLine.length-1];
  return { macd: parseFloat(macd.toFixed(3)), signal: parseFloat(signal.toFixed(3)), hist: parseFloat((macd-signal).toFixed(3)) };
}

function calcVolumeAnomaly(volumes: (number|null)[]): { ratio: number; anomaly: boolean } | null {
  const v = volumes.filter((x): x is number => x != null && x > 0);
  if (v.length < 10) return null;
  const avg = v.slice(0, -5).reduce((a,b)=>a+b,0) / Math.max(v.slice(0,-5).length, 1);
  const recent = v.slice(-5).reduce((a,b)=>a+b,0) / 5;
  const ratio = parseFloat((recent / avg).toFixed(2));
  return { ratio, anomaly: ratio > 1.8 };
}

function calcRegressionDeviation(closes: (number|null)[]): {
  deviation: number;
  r2: number;
  slope: "haussière" | "baissière" | "neutre";
  periodYears: number;
  trendPrice: number;
} | null {
  const c = closes.filter((v): v is number => v != null && v > 0);
  if (c.length < 50) return null;

  const n = c.length;
  const logPrices = c.map(v => Math.log(v));

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += logPrices[i];
    sumXY += i * logPrices[i]; sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const trendLogPrice = slope * (n - 1) + intercept;
  const trendPrice = Math.exp(trendLogPrice);
  const lastPrice = c[n - 1];
  const deviation = ((lastPrice - trendPrice) / trendPrice) * 100;

  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += Math.pow(logPrices[i] - meanY, 2);
    ssRes += Math.pow(logPrices[i] - (slope * i + intercept), 2);
  }
  const r2 = ssTot > 0 ? parseFloat((1 - ssRes / ssTot).toFixed(2)) : 0;

  const annualizedSlope = slope * 252;
  const slopeLabel: "haussière" | "baissière" | "neutre" =
    annualizedSlope > 0.05 ? "haussière" :
    annualizedSlope < -0.05 ? "baissière" : "neutre";

  const periodYears = parseFloat((n / 252).toFixed(1));

  return {
    deviation: parseFloat(deviation.toFixed(1)),
    r2,
    slope: slopeLabel,
    periodYears,
    trendPrice: parseFloat(trendPrice.toFixed(2)),
  };
}

function calcHiddenDivergence(
  closes: (number|null)[],
  macdData: { macd: number; signal: number; hist: number } | null
): { type: "bull" | "bear"; strength: "strong" | "moderate" } | null {
  if (!macdData) return null;
  const c = closes.filter((v): v is number => v != null && v > 0);
  if (c.length < 60) return null;

  const prices = c.slice(-60);
  const n = prices.length;

  const k12 = 2/13, k26 = 2/27;
  let e12 = prices.slice(0,12).reduce((a,b)=>a+b)/12;
  let e26 = prices.slice(0,26).reduce((a,b)=>a+b)/26;
  for (let i=12; i<26; i++) e12 = prices[i]*k12 + e12*(1-k12);

  const macdSeries: number[] = [];
  for (let i=26; i<n; i++) {
    e12 = prices[i]*k12 + e12*(1-k12);
    e26 = prices[i]*k26 + e26*(1-k26);
    macdSeries.push(e12 - e26);
  }
  if (macdSeries.length < 9) return null;

  const findPivots = (arr: number[], type: "low" | "high", window = 5): number[] => {
    const pivots: number[] = [];
    for (let i = window; i < arr.length - window; i++) {
      const slice = arr.slice(i - window, i + window + 1);
      const val = arr[i];
      if (type === "low"  && val === Math.min(...slice)) pivots.push(i);
      if (type === "high" && val === Math.max(...slice)) pivots.push(i);
    }
    return pivots.slice(-3);
  };

  const pricePivotsLow  = findPivots(prices, "low");
  const pricePivotsHigh = findPivots(prices, "high");
  const macdPivotsLow   = findPivots(macdSeries, "low");
  const macdPivotsHigh  = findPivots(macdSeries, "high");

  if (pricePivotsLow.length >= 2 && macdPivotsLow.length >= 2) {
    const p1 = pricePivotsLow[pricePivotsLow.length - 2];
    const p2 = pricePivotsLow[pricePivotsLow.length - 1];
    const m1 = macdPivotsLow[macdPivotsLow.length - 2];
    const m2 = macdPivotsLow[macdPivotsLow.length - 1];
    if (prices[p2] > prices[p1] && macdSeries[m2] < macdSeries[m1]) {
      const gap = Math.abs(macdSeries[m2] - macdSeries[m1]);
      return { type: "bull", strength: gap > 0.5 ? "strong" : "moderate" };
    }
  }

  if (pricePivotsHigh.length >= 2 && macdPivotsHigh.length >= 2) {
    const p1 = pricePivotsHigh[pricePivotsHigh.length - 2];
    const p2 = pricePivotsHigh[pricePivotsHigh.length - 1];
    const m1 = macdPivotsHigh[macdPivotsHigh.length - 2];
    const m2 = macdPivotsHigh[macdPivotsHigh.length - 1];
    if (prices[p2] < prices[p1] && macdSeries[m2] > macdSeries[m1]) {
      const gap = Math.abs(macdSeries[m2] - macdSeries[m1]);
      return { type: "bear", strength: gap > 0.5 ? "strong" : "moderate" };
    }
  }

  return null;
}

// ── ENCART SIGNAUX TECHNIQUES ─────────────────────────────────
interface TechSignal {
  emoji: string;
  color: string;
  plain: string;    // phrase en langage courant
  label: string;    // terme technique
  detail: string;   // valeurs chiffrées
  edu: {
    concept:   string;
    howToRead: string;
    example:   string;
    good?:     string;
    bad?:      string;
  };
  strength: "bull" | "bear" | "neutral";
}

interface SinewaveResult {
  sine:           number;
  leadSine:       number;
  dominantPeriod: number;
  phase:          number;
  mode:           "trending" | "cycling";
  cycleTurn:      "peak" | "trough" | null;
  momentum14:     number;
  optimalUT: { label: string; horizon: string; note: string; };
}

// ── SINEWAVE EHLERS (Hilbert Transform) + ROC MOMENTUM ─────────
function calcSinewave(closes: (number|null)[]): SinewaveResult | null {
  const c = closes.filter((v): v is number => v != null);
  if (c.length < 50) return null;
  const N = c.length;

  // Smooth price (WMA-4)
  const sp = new Array(N).fill(0);
  for (let i = 3; i < N; i++) sp[i] = (c[i] + 2*c[i-1] + 2*c[i-2] + c[i-3]) / 6;

  const Per = new Array(N).fill(10);
  const Smp = new Array(N).fill(10);
  const Det = new Array(N).fill(0);
  const Q1  = new Array(N).fill(0);
  const I1  = new Array(N).fill(0);
  const jI  = new Array(N).fill(0);
  const jQ  = new Array(N).fill(0);
  const I2  = new Array(N).fill(0);
  const Q2  = new Array(N).fill(0);
  const Re  = new Array(N).fill(0);
  const Im  = new Array(N).fill(0);
  const Ph  = new Array(N).fill(0);
  const Sn  = new Array(N).fill(0);
  const LSn = new Array(N).fill(0);

  for (let i = 10; i < N; i++) {
    const a = 0.075 * Smp[i-1] + 0.54;
    Det[i] = (0.0962*sp[i] + 0.5769*sp[i-2] - 0.5769*sp[i-4] - 0.0962*sp[i-6]) * a;
    Q1[i]  = (0.0962*Det[i] + 0.5769*Det[i-2] - 0.5769*Det[i-4] - 0.0962*Det[i-6]) * a;
    I1[i]  = Det[i-3];
    jI[i]  = 0.33*I1[i] + 0.67*I1[i-1];
    jQ[i]  = 0.33*Q1[i] + 0.67*Q1[i-1];
    I2[i]  = 0.2*(I1[i] - jQ[i]) + 0.8*I2[i-1];
    Q2[i]  = 0.2*(Q1[i] + jI[i]) + 0.8*Q2[i-1];
    Re[i]  = 0.2*(I2[i]*I2[i-1] + Q2[i]*Q2[i-1]) + 0.8*Re[i-1];
    Im[i]  = 0.2*(I2[i]*Q2[i-1] - Q2[i]*I2[i-1]) + 0.8*Im[i-1];
    let p  = Per[i-1];
    if (Im[i] !== 0 && Re[i] !== 0) {
      const ang = Math.atan(Im[i] / Re[i]);
      if (ang !== 0) p = 2 * Math.PI / Math.abs(ang);
    }
    if (p > 1.5*Per[i-1]) p = 1.5*Per[i-1];
    if (p < 0.67*Per[i-1]) p = 0.67*Per[i-1];
    if (p < 6) p = 6; if (p > 50) p = 50;
    Per[i] = p;
    Smp[i] = 0.33*p + 0.67*Smp[i-1];
    Ph[i]  = I1[i] !== 0 ? (180/Math.PI) * Math.atan(Q1[i]/I1[i]) : Ph[i-1];
    Sn[i]  = Math.sin(Ph[i] * Math.PI / 180);
    LSn[i] = Math.sin((Ph[i] + 45) * Math.PI / 180);
  }

  const L = N - 1;
  const sine     = parseFloat(Sn[L].toFixed(3));
  const leadSine = parseFloat(LSn[L].toFixed(3));
  const phase    = parseFloat(Ph[L].toFixed(1));
  const dp       = Math.max(6, Math.round(Smp[L]));

  const crossBull = Sn[L-1] < LSn[L-1] && Sn[L] >= LSn[L];
  const crossBear = Sn[L-1] > LSn[L-1] && Sn[L] <= LSn[L];
  const cycleTurn: "peak" | "trough" | null = crossBull ? "trough" : crossBear ? "peak" : null;

  const phAdv = Math.abs(Ph[L] - Ph[Math.max(10, L-5)]);
  const mode: "trending" | "cycling" = phAdv > 30 ? "trending" : "cycling";

  const momentum14 = N >= 15
    ? parseFloat((((c[N-1] - c[N-15]) / c[N-15]) * 100).toFixed(1))
    : 0;

  const optimalUT =
    dp <= 10  ? { label:"Journalier",             horizon:"Court terme · Swing 1-2 sem.",           note:`Cycle dominant ~${dp}j — le journalier est l'UT optimale pour piloter les entrées/sorties.` } :
    dp <= 22  ? { label:"Journalier / Hebdomadaire", horizon:"Swing 2-6 semaines",                  note:`Cycle ~${dp}j — journalier pour l'entrée, hebdomadaire pour le contexte.` } :
    dp <= 40  ? { label:"Hebdomadaire",            horizon:"Position 1-3 mois",                     note:`Cycle ~${dp}j — l'hebdomadaire filtre le bruit et aligne sur les mouvements de fond.` } :
                { label:"Mensuel / Hebdomadaire",  horizon:"Long terme 3-12 mois",                  note:`Cycle long ~${dp}j — les fondamentaux reprennent le dessus sur les signaux techniques.` };

  return { sine, leadSine, dominantPeriod: dp, phase, mode, cycleTurn, momentum14, optimalUT };
}

// ── RÉGRESSION LOG-LINÉAIRE (déviation prix / tendance) ───────
interface TrendDevResult {
  deviation:   number;   // % écart au-dessus (+) ou en dessous (-) de la tendance
  trendPrice:  number;   // prix estimé par la droite de tendance
  r2:          number;   // R² — qualité d'ajustement (0-1)
}

function calcTrendDeviation(closes: (number|null)[]): TrendDevResult | null {
  const c = closes.filter((v): v is number => v != null && v > 0);
  const N = c.length;
  if (N < 40) return null;

  // ln(price) = slope * i + intercept
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < N; i++) {
    const y = Math.log(c[i]);
    sumX  += i;
    sumY  += y;
    sumXY += i * y;
    sumX2 += i * i;
  }
  const denom = N * sumX2 - sumX * sumX;
  if (denom === 0) return null;

  const slope     = (N * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / N;

  // R²
  const meanY = sumY / N;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < N; i++) {
    const y    = Math.log(c[i]);
    const yHat = slope * i + intercept;
    ssTot += (y - meanY) * (y - meanY);
    ssRes += (y - yHat) * (y - yHat);
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const trendPrice   = Math.exp(slope * (N - 1) + intercept);
  const currentPrice = c[N - 1];
  const deviation    = ((currentPrice - trendPrice) / trendPrice) * 100;

  return {
    deviation:  parseFloat(deviation.toFixed(1)),
    trendPrice: parseFloat(trendPrice.toFixed(2)),
    r2:         parseFloat(r2.toFixed(3)),
  };
}

// ── ADX PROXY (force de tendance) ─────────────────────────────
function calcADX(
  highs:  (number|null)[],
  lows:   (number|null)[],
  closes: (number|null)[],
  period = 14
): number | null {
  const H = highs.filter((v): v is number => v != null);
  const L = lows.filter((v): v is number => v != null);
  const C = closes.filter((v): v is number => v != null);
  const N = Math.min(H.length, L.length, C.length);
  if (N < period * 2 + 1) return null;

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < N; i++) {
    tr.push(Math.max(H[i]-L[i], Math.abs(H[i]-C[i-1]), Math.abs(L[i]-C[i-1])));
    const up   = H[i] - H[i-1];
    const down = L[i-1] - L[i];
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }

  const wilderSmooth = (arr: number[], p: number): number[] => {
    const res: number[] = [];
    let val = arr.slice(0, p).reduce((a, b) => a + b, 0);
    res.push(val);
    for (let i = p; i < arr.length; i++) { val = val - val / p + arr[i]; res.push(val); }
    return res;
  };

  const atr14 = wilderSmooth(tr,      period);
  const pdm14 = wilderSmooth(plusDM,  period);
  const mdm14 = wilderSmooth(minusDM, period);

  const dx: number[] = [];
  for (let i = 0; i < atr14.length; i++) {
    if (atr14[i] === 0) continue;
    const pdi = (pdm14[i] / atr14[i]) * 100;
    const mdi = (mdm14[i] / atr14[i]) * 100;
    const sum = pdi + mdi;
    if (sum === 0) continue;
    dx.push((Math.abs(pdi - mdi) / sum) * 100);
  }
  if (dx.length < period) return null;

  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adx = (adx * (period - 1) + dx[i]) / period;
  return parseFloat(adx.toFixed(1));
}

// ── STRUCTURE HH/HL OU LL/LH ─────────────────────────────────
interface TrendStructureResult {
  type:   "bullish" | "bearish" | "mixed" | "flat";
  swings: number;
}

function detectTrendStructure(
  highs:   (number|null)[],
  lows:    (number|null)[],
  closes:  (number|null)[] = [],
  _lookback = 20
): TrendStructureResult {
  // Lookback adaptatif basé sur la volatilité ATR relative
  let lookback = 30;
  const c = closes.filter((v): v is number => v != null);
  const h = highs.filter((v): v is number => v != null);
  const l = lows.filter((v): v is number => v != null);
  if (c.length >= 50 && h.length >= 50 && l.length >= 50) {
    const n = Math.min(h.length, l.length, c.length);
    const trs: number[] = [];
    for (let i = 1; i < n; i++) {
      trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i-1]), Math.abs(l[i] - c[i-1])));
    }
    const atr14   = trs.length >= 14 ? trs.slice(-14).reduce((a, b) => a + b, 0) / 14 : 0;
    const base50  = trs.length >= 50 ? trs.slice(-50).reduce((a, b) => a + b, 0) / 50 : 0;
    if (base50 > 0) {
      if (atr14 > 2 * base50)   lookback = 40;
      else if (atr14 < 0.7 * base50) lookback = 20;
      else                           lookback = 30;
    }
  }
  const H = highs.filter((v): v is number => v != null).slice(-lookback);
  const L = lows.filter((v): v is number => v != null).slice(-lookback);
  const N = Math.min(H.length, L.length);
  if (N < 4) return { type: "flat", swings: 0 };

  const swingHighs: number[] = [];
  const swingLows:  number[] = [];
  for (let i = 1; i < N - 1; i++) {
    if (H[i] > H[i-1] && H[i] > H[i+1]) swingHighs.push(H[i]);
    if (L[i] < L[i-1] && L[i] < L[i+1]) swingLows.push(L[i]);
  }

  const swings = swingHighs.length + swingLows.length;
  if (swings < 2) return { type: "flat", swings };

  let hh = 0, hl = 0, ll = 0, lh = 0;
  for (let i = 1; i < swingHighs.length; i++) { if (swingHighs[i] > swingHighs[i-1]) hh++; else lh++; }
  for (let i = 1; i < swingLows.length;  i++) { if (swingLows[i]  > swingLows[i-1])  hl++; else ll++; }

  const bullScore = hh + hl;
  const bearScore = ll + lh;
  const type: "bullish" | "bearish" | "mixed" | "flat" =
    bullScore > bearScore + 1 ? "bullish" :
    bearScore > bullScore + 1 ? "bearish" :
    bullScore + bearScore > 0 ? "mixed"   : "flat";
  return { type, swings };
}

// ── DIVERGENCE RSI / PRIX ─────────────────────────────────────
interface DivergenceResult {
  type:     "bullish" | "bearish" | null;
  strength: "weak" | "strong";
}

function detectDivergence(
  closes:  (number|null)[],
  period   = 14,
  lookback = 30
): DivergenceResult {
  const c = closes.filter((v): v is number => v != null);
  if (c.length < period + lookback) return { type: null, strength: "weak" };

  const slice = c.slice(-(lookback + period));
  const rsiSeries: number[] = [];
  for (let i = period; i <= slice.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period; j < i; j++) {
      const d = slice[j] - (j > 0 ? slice[j-1] : slice[j]);
      if (d > 0) gains += d; else losses -= d;
    }
    const rs = losses === 0 ? 100 : gains / losses;
    rsiSeries.push(100 - 100 / (1 + rs));
  }

  const prices = slice.slice(period);
  const N = Math.min(rsiSeries.length, prices.length);
  if (N < 4) return { type: null, strength: "weak" };

  const mid = Math.floor(N / 2);
  const p1 = Math.max(...prices.slice(0, mid));
  const p2 = Math.max(...prices.slice(mid));
  const r1 = Math.max(...rsiSeries.slice(0, mid));
  const r2 = Math.max(...rsiSeries.slice(mid));
  const p1l = Math.min(...prices.slice(0, mid));
  const p2l = Math.min(...prices.slice(mid));
  const r1l = Math.min(...rsiSeries.slice(0, mid));
  const r2l = Math.min(...rsiSeries.slice(mid));

  if (p2 > p1 * 1.01 && r2 < r1 * 0.97) {
    const strength: "weak" | "strong" = (p2/p1 - 1 > 0.05 && r1/r2 - 1 > 0.05) ? "strong" : "weak";
    return { type: "bearish", strength };
  }
  if (p2l < p1l * 0.99 && r2l > r1l * 1.03) {
    const strength: "weak" | "strong" = (p1l/p2l - 1 > 0.05 && r2l/r1l - 1 > 0.05) ? "strong" : "weak";
    return { type: "bullish", strength };
  }
  return { type: null, strength: "weak" };
}

// ── PHASE DE MARCHÉ ──────────────────────────────────────────
type MarketPhase =
  | "accumulation"
  | "breakout"
  | "tendance_haussiere"
  | "tendance_baissiere"
  | "distribution"
  | "exces"
  | "chaos"
  | "range"
  | "undefined";

interface MarketPhaseResult {
  phase:       MarketPhase;
  label:       string;
  color:       string;
  emoji:       string;
  confidence:  number;   // 0-100
  description: string;
}

// ── SQUEEZE DE VOLATILITÉ ────────────────────────────────────
interface SqueezeResult {
  isSqueeze:   boolean;
  intensity:   "low" | "medium" | "high";
  bbWidth:     number;   // largeur des bandes de Bollinger normalisée
  atrRatio:    number;   // ATR actuel / ATR moyen
  description: string;
}

function calcSqueeze(closes: (number|null)[]): SqueezeResult | null {
  const c = closes.filter((v): v is number => v != null);
  if (c.length < 50) return null;

  // Bandes de Bollinger (20 périodes, 2 écarts-types)
  const period = 20;
  const slice  = c.slice(-period);
  const mean   = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upperBB = mean + 2 * stdDev;
  const lowerBB = mean - 2 * stdDev;
  const bbWidth = mean > 0 ? (upperBB - lowerBB) / mean : 0;

  // Largeur BB historique (50 périodes) pour comparaison
  const historical: number[] = [];
  for (let i = period; i <= c.length; i++) {
    const s   = c.slice(i - period, i);
    const m   = s.reduce((a, b) => a + b, 0) / period;
    const sd  = Math.sqrt(s.reduce((a, b) => a + Math.pow(b - m, 2), 0) / period);
    const w   = m > 0 ? (4 * sd) / m : 0;
    historical.push(w);
  }
  const bbMean = historical.length > 0
    ? historical.reduce((a, b) => a + b, 0) / historical.length
    : bbWidth;

  // ATR ratio
  const h = c.map((v, i) => i > 0 ? Math.max(v, c[i-1]) : v);
  const l = c.map((v, i) => i > 0 ? Math.min(v, c[i-1]) : v);
  const trs: number[] = [];
  for (let i = 1; i < c.length; i++) {
    trs.push(Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
  }
  const atr14    = trs.length >= 14 ? trs.slice(-14).reduce((a,b)=>a+b)/14 : null;
  const atrMean  = trs.length >= 50 ? trs.slice(-50).reduce((a,b)=>a+b)/50 : atr14;
  const atrRatio = (atr14 != null && atrMean != null && atrMean > 0)
    ? parseFloat((atr14 / atrMean).toFixed(2))
    : 1;

  // Squeeze : BB width < 60% de sa moyenne historique ET ATR faible
  const bbRatio    = bbMean > 0 ? bbWidth / bbMean : 1;
  const isSqueeze  = bbRatio < 0.6 && atrRatio < 0.8;
  const intensity: "low" | "medium" | "high" =
    bbRatio < 0.35 ? "high" :
    bbRatio < 0.5  ? "medium" : "low";

  return {
    isSqueeze,
    intensity,
    bbWidth:  parseFloat(bbWidth.toFixed(4)),
    atrRatio,
    description: isSqueeze
      ? `Compression de volatilité ${intensity === "high" ? "extrême" : intensity === "medium" ? "forte" : "modérée"} détectée — mouvement potentiellement imminent (direction indéterminée).`
      : "Pas de compression de volatilité significative.",
  };
}

// ── OBJECTIF DE BREAKOUT ─────────────────────────────────────
interface BreakoutTargetResult {
  hasTarget:       boolean;
  targetPrice:     number | null;
  targetPct:       number | null;   // % depuis le prix actuel
  direction:       "up" | "down" | null;
  validBars:       number;          // bougies de validité restantes (max 30)
  barsElapsed:     number;          // bougies écoulées depuis le breakout
  description:     string;
}

function calcBreakoutTarget(
  closes:  (number|null)[],
  highs:   (number|null)[],
  lows:    (number|null)[],
): BreakoutTargetResult {
  const NONE: BreakoutTargetResult = {
    hasTarget: false, targetPrice: null, targetPct: null,
    direction: null, validBars: 0, barsElapsed: 0,
    description: "Aucun breakout récent détecté.",
  };

  const c = closes.filter((v): v is number => v != null);
  const h = highs.filter((v): v is number => v != null);
  const l = lows.filter((v): v is number => v != null);
  if (c.length < 50 || h.length < 50 || l.length < 50) return NONE;

  const last = c[c.length - 1];

  // Range de référence : 20 bougies avant les 10 dernières
  const rangeSlice = c.slice(-30, -10);
  if (rangeSlice.length < 10) return NONE;
  const rangeHigh = Math.max(...h.slice(-30, -10));
  const rangeLow  = Math.min(...l.slice(-30, -10));
  const rangeAmp  = rangeHigh - rangeLow;
  if (rangeAmp <= 0) return NONE;

  // Détection breakout haussier : prix actuel > rangeHigh
  if (last > rangeHigh * 1.005) {
    const target     = rangeHigh + rangeAmp;
    const targetPct  = ((target - last) / last) * 100;
    // Estimer les bougies écoulées depuis le breakout
    let barsElapsed = 0;
    for (let i = c.length - 1; i >= Math.max(0, c.length - 30); i--) {
      if ((c[i] ?? 0) > rangeHigh * 1.005) barsElapsed++;
      else break;
    }
    const validBars = Math.max(0, 30 - barsElapsed);
    if (validBars === 0) return NONE;
    return {
      hasTarget: true,
      targetPrice: parseFloat(target.toFixed(2)),
      targetPct:   parseFloat(targetPct.toFixed(1)),
      direction:   "up",
      validBars,
      barsElapsed,
      description: `Objectif potentiel indicatif : +${targetPct.toFixed(1)}% / ${target.toFixed(2)} (valide encore ~${validBars} bougies).`,
    };
  }

  // Détection breakout baissier : prix actuel < rangeLow
  if (last < rangeLow * 0.995) {
    const targetRaw = rangeLow - rangeAmp;
    // Un prix ne peut pas être négatif ou nul — invalider la target
    if (targetRaw <= 0) return NONE;
    const target    = targetRaw;
    const targetPct = ((target - last) / last) * 100;
    let barsElapsed = 0;
    for (let i = c.length - 1; i >= Math.max(0, c.length - 30); i--) {
      if ((c[i] ?? 0) < rangeLow * 0.995) barsElapsed++;
      else break;
    }
    const validBars = Math.max(0, 30 - barsElapsed);
    if (validBars === 0) return NONE;
    return {
      hasTarget: true,
      targetPrice: parseFloat(target.toFixed(2)),
      targetPct:   parseFloat(targetPct.toFixed(1)),
      direction:   "down",
      validBars,
      barsElapsed,
      description: `Objectif potentiel indicatif : ${targetPct.toFixed(1)}% / ${target.toFixed(2)} (valide encore ~${validBars} bougies).`,
    };
  }

  return NONE;
}

// ── SCORE DE CONFLUENCE ──────────────────────────────────────
interface ConfluenceResult {
  score:       number;   // 0 à 4
  priceOk:     boolean;
  contextOk:   boolean;
  momentumOk:  boolean;
  sinewaveOk:  boolean;
  label:       string;
  color:       string;
  details:     string[];
}

function calcConfluenceScore(
  closes:  (number|null)[],
  highs:   (number|null)[],
  lows:    (number|null)[],
  volumes: (number|null)[],
): ConfluenceResult {
  const c = closes.filter((v): v is number => v != null);

  const rsi    = calcRSI(closes);
  const ema200 = calcEMA(closes, 200);
  const macd   = calcMACD(closes);
  const sw     = calcSinewave(closes);
  const reg    = calcRegressionDeviation(closes);
  const phase  = c.length >= 50
    ? classifyMarketContext(closes, highs, lows, volumes)
    : null;
  const last   = c.length > 0 ? c[c.length - 1] : null;

  // PRICE OK : prix dans une zone d'intérêt
  // → décote sur régression OU rebond depuis EMA200 OU RSI extrême
  const nearEma200   = (ema200 != null && last != null)
    ? Math.abs(last - ema200) / ema200 < 0.05
    : false;
  const rsiExtreme   = rsi != null && (rsi < 35 || rsi > 65);
  const regDiscount  = reg != null && reg.r2 >= 0.4 && reg.deviation < -5;
  const priceOk      = nearEma200 || rsiExtreme || regDiscount;

  // CONTEXT OK : phase de marché identifiée et exploitable
  const contextOk = phase != null &&
    phase.type !== "chaos";

  // MOMENTUM OK : RSI entre 35 et 65 ET MACD dans la bonne direction
  const rsiNeutral  = rsi != null && rsi >= 35 && rsi <= 65;
  const macdBull    = macd != null && macd.hist > 0;
  const macdBear    = macd != null && macd.hist < 0;
  const momentumOk  = rsiNeutral && (macdBull || macdBear);

  // SINEWAVE OK : phase cyclique favorable
  const sinewaveOk = sw != null &&
    (sw.cycleTurn === "trough" || sw.sine < -0.3);

  const score = [priceOk, contextOk, momentumOk, sinewaveOk]
    .filter(Boolean).length;

  const label =
    score <= 1 ? "Conditions défavorables" :
    score === 2 ? "Confluence partielle"   :
    score === 3 ? "Setup intéressant"      :
                  "Confluence maximale ✓";

  const color =
    score <= 1 ? "#ef4444" :
    score === 2 ? "#f59e0b" :
    score === 3 ? "#22c55e" :
                  "#22c55e";

  const details: string[] = [];
  details.push(`${priceOk    ? "✅" : "❌"} Prix dans une zone d'intérêt`);
  details.push(`${contextOk  ? "✅" : "❌"} Contexte de marché exploitable`);
  details.push(`${momentumOk ? "✅" : "❌"} Momentum favorable (RSI + MACD)`);
  details.push(`${sinewaveOk ? "✅" : "❌"} Phase cyclique favorable`);

  return { score, priceOk, contextOk, momentumOk, sinewaveOk, label, color, details };
}


// ── PHASE CYCLIQUE ───────────────────────────────────────────
interface CyclePhaseResult {
  cyclePosition:    number;          // 0 à 1+
  phase:            "rising" | "peak" | "falling" | "trough";
  bougiesEstimated: number;          // avant prochain retournement estimé
  confidence:       "low" | "medium";
  description:      string;
}

function calcCyclePhase(closes: (number|null)[]): CyclePhaseResult | null {
  const c = closes.filter((v): v is number => v != null);
  if (c.length < 50) return null;

  // Approximation via RSI comme proxy de la Sinewave d'Ehlers
  // LIMITE : ce n'est pas la vraie Sinewave — afficher avec ±30% de marge
  const period = 14;
  const rsiSeries: number[] = [];
  for (let i = period; i <= c.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period; j < i; j++) {
      const d = c[j] - (j > 0 ? c[j-1] : c[j]);
      if (d > 0) gains += d; else losses -= d;
    }
    const rs = losses === 0 ? 100 : gains / losses;
    rsiSeries.push(100 - 100 / (1 + rs));
  }

  if (rsiSeries.length < 20) return null;

  // Cycle dominant via Sinewave si disponible
  const sw = calcSinewave(closes);
  const dominantPeriod = sw?.dominantPeriod ?? 20;

  // Position dans le cycle via RSI normalisé (0-100 → -1 à +1)
  const lastRsi    = rsiSeries[rsiSeries.length - 1];
  const cyclePos   = (lastRsi - 50) / 50;  // -1 (survente) à +1 (surachat)

  // Détecter la phase via pente RSI sur 3 périodes
  const rsiSlope = rsiSeries.length >= 4
    ? rsiSeries[rsiSeries.length - 1] - rsiSeries[rsiSeries.length - 4]
    : 0;

  const phase: "rising" | "peak" | "falling" | "trough" =
    lastRsi > 65 && rsiSlope <= 0  ? "peak"    :
    lastRsi < 35 && rsiSlope >= 0  ? "trough"  :
    rsiSlope > 2                   ? "rising"  :
    rsiSlope < -2                  ? "falling" :
    lastRsi > 50                   ? "peak"    : "trough";

  // Estimation bougies avant prochain retournement
  // Basé sur le cycle dominant et la position actuelle
  const halfCycle = Math.round(dominantPeriod * 0.6);  // ratio 60/40 montée/descente
  const posInCycle = Math.abs(cyclePos);
  const bougiesEstimated = Math.max(1, Math.round(halfCycle * (1 - posInCycle)));

  const phaseLabel = {
    rising:  "montée",
    peak:    "sommet",
    falling: "descente",
    trough:  "creux",
  }[phase];

  return {
    cyclePosition:    parseFloat(cyclePos.toFixed(2)),
    phase,
    bougiesEstimated,
    confidence:       "medium",
    description:      `Phase cyclique estimée : ${phaseLabel} — ~${bougiesEstimated} bougies avant potentiel retournement (±30%). Cycle dominant ~${dominantPeriod}j.`,
  };
}


// ── MATURITÉ DE TENDANCE ──────────────────────────────────────
function calcTrendMaturity(
  closes: (number|null)[],
  highs:  (number|null)[],
  lows:   (number|null)[],
): "jeune" | "en_developpement" | "mature" | "divergence" | null {
  const adx = calcADX(highs, lows, closes);
  if (adx == null) return null;
  const rsi    = calcRSI(closes);
  const div    = detectDivergence(closes);
  const ema200 = calcEMA(closes, 200);
  const c      = closes.filter((v): v is number => v != null);
  const last   = c.length > 0 ? c[c.length - 1] : null;

  if (div.type === "bearish" || div.type === "bullish") return "divergence";
  if (adx > 40 || (rsi != null && rsi > 70) || (ema200 != null && last != null && last > ema200 * 1.25)) return "mature";
  if (adx >= 30) return "en_developpement";
  if (adx >= 20) return "jeune";
  return null;
}

// ── CLASSIFICATEUR DE CONTEXTE DE MARCHÉ ─────────────────────
interface MarketContext {
  type:               "range" | "tendance" | "exces" | "chaos";
  subtype?:           string;
  maturity?:          "jeune" | "en_developpement" | "mature" | "divergence";
  confidence:         number;
  fundamentalConfirm: "confirms" | "neutral" | "warns" | null;
  adx:                number | null;
  structure:          TrendStructureResult;
  divergence:         DivergenceResult;
}

function classifyMarketContext(
  closes:  (number|null)[],
  highs:   (number|null)[],
  lows:    (number|null)[],
  volumes: (number|null)[],
): MarketContext {
  const adx    = calcADX(highs, lows, closes);
  const rsi    = calcRSI(closes);
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const ema20  = calcEMA(closes, 20);
  const struct = detectTrendStructure(highs, lows, closes);
  const div    = detectDivergence(closes);
  const vol    = calcVolumeAnomaly(volumes);
  const c      = closes.filter((v): v is number => v != null);
  const last   = c.length > 0 ? c[c.length - 1] : null;

  // ATR-based volatility
  const hArr = highs.filter((v): v is number => v != null);
  const lArr = lows.filter((v): v is number => v != null);
  const cArr = closes.filter((v): v is number => v != null);
  const trArr: number[] = [];
  for (let i = 1; i < Math.min(hArr.length, lArr.length, cArr.length); i++) {
    trArr.push(Math.max(hArr[i]-lArr[i], Math.abs(hArr[i]-cArr[i-1]), Math.abs(lArr[i]-cArr[i-1])));
  }
  const atr14    = trArr.length >= 14 ? trArr.slice(-14).reduce((a,b)=>a+b)/14    : null;
  const atrMean50= trArr.length >= 50 ? trArr.slice(-50).reduce((a,b)=>a+b)/50   : null;

  // EMA50 slope (dernier vs 10 bars avant)
  const ema50Prev = calcEMA(c.slice(0, c.length - 10).map((v): number|null => v), 50);
  const ema50Slope = (ema50 != null && ema50Prev != null && ema50Prev !== 0)
    ? ((ema50 - ema50Prev) / ema50Prev) * 100
    : 0;

  // Alignement EMA long terme — capte la tendance même quand la structure récente (20 bars) est mixte
  const ltBull = ema50 != null && ema200 != null && ema50 > ema200 * 1.02;
  const ltBear = ema50 != null && ema200 != null && ema50 < ema200 * 0.98;

  let type: "range" | "tendance" | "exces" | "chaos" = "range";
  let confidence = 50;
  let subtype: string | undefined;

  // ── CHAOS ─────────────────────────────────────────────────────
  const isHighVol = atr14 != null && atrMean50 != null && atr14 > 3 * atrMean50;
  const emaFlat   = Math.abs(ema50Slope) < 0.3;
  if (isHighVol && emaFlat) {
    type = "chaos";
    confidence = 70;
  }
  // ── EXCÈS ─────────────────────────────────────────────────────
  else if (
    adx != null && adx > 40 &&
    ema50 != null && ema200 != null && last != null &&
    ema50 > ema200 * 1.02 && last > ema50 &&
    (rsi == null || rsi > 65) &&
    (vol == null || vol.ratio > 1.3)
  ) {
    type = "exces";
    confidence = Math.min(60 + (adx > 50 ? 20 : adx > 45 ? 10 : 0), 90);
    subtype = (ema20 != null && ema50 != null && ema200 != null &&
               ema20 > ema50 * 1.02 && ema50 > ema200 * 1.02)
      ? "exces_final" : undefined;
  }
  // ── TENDANCE ─────────────────────────────────────────────────
  // Priorité EMA long terme : Death Cross (EMA50 < EMA200) force la direction baissière
  // indépendamment de la structure courte terme (pivots 20-40 barres).
  // Une structure HH/HL locale peut exister dans une tendance baissière de fond —
  // c'est un rebond, pas un retournement.
  else if (
    adx != null && adx > 25 &&
    Math.abs(ema50Slope) > 0.8 &&
    (struct.type === "bullish" || struct.type === "bearish" ||
     (ltBull && ema50Slope > 2.0) || (ltBear && ema50Slope < -2.0))
  ) {
    type = "tendance";
    // Si Death Cross actif (EMA50 < EMA200), la direction structurelle est baissière
    // même si les pivots courts termes sont haussiers (rebond dans baisse).
    const deathCrossActive = ema50 != null && ema200 != null && ema50 < ema200;
    const bullish = deathCrossActive ? false : struct.type === "bullish";
    if (div.type === (bullish ? "bearish" : "bullish")) {
      subtype = "divergence";
      confidence = 55;
    } else if (adx > 35) {
      subtype = "suivi";
      confidence = Math.min(70 + Math.round(adx - 35), 88);
    } else {
      subtype = "accumulation";
      confidence = 62;
    }
  }
  // ── ESSOUFFLEMENT — tendance directionnelle mais momentum déclinant ──
  // Priorité Death Cross : si EMA50 < EMA200, la structure haussière courte terme
  // est un rebond dans une baisse — on force la direction baissière.
  else if (
    (struct.type === "bullish" || struct.type === "bearish" || ltBull || ltBear) &&
    adx != null &&
    (adx >= 15 || (adx >= 10 && (struct.type === "bullish" || struct.type === "bearish"))) &&
    Math.abs(ema50Slope) >= 0.15
  ) {
    type = "tendance";
    subtype = "essoufflement";
    // Si Death Cross actif, forcer direction baissière indépendamment des pivots courts
    const deathCrossActive = ema50 != null && ema200 != null && ema50 < ema200;
    const effectiveStructType = deathCrossActive ? "bearish" : struct.type;
    const hasDivergence = div.type !== null &&
      div.type !== (effectiveStructType === "bullish" ? "bullish" : "bearish");
    confidence = hasDivergence ? 70 : adx >= 20 ? 62 : 52;
    // Propager la direction corrigée dans la structure pour l'affichage
    if (deathCrossActive && struct.type === "bullish") {
      struct.type = "bearish";
    }
  }
  // ── RANGE ─────────────────────────────────────────────────────
  else {
    type = "range";
    confidence = adx != null && adx < 15 ? 80 : 62;
    subtype = (struct.swings >= 3 && (struct.type === "mixed" || struct.type === "flat"))
      ? "3br" : "neuneu";
    if (subtype === "3br") confidence = Math.min(confidence + 10, 85);
  }

  return {
    type,
    subtype,
    maturity: type === "tendance"
      ? (calcTrendMaturity(closes, highs, lows) ?? undefined)
      : undefined,
    confidence: Math.round(Math.min(confidence, 95)),
    fundamentalConfirm: null,
    adx,
    structure: struct,
    divergence: div,
  };
}

// ── SCORE FINAL (technique + modificateurs fondamentaux) ───────
interface FinalScoreResult {
  score:     number;
  modifiers: string[];
  context:   MarketContext;
}

function computeFinalScore(
  metrics: ReturnType<typeof buildMetrics>,
  context: MarketContext,
  techSignals: TechSignal[] = [],
  closes: (number|null)[] = [],
  confluenceScore: number | null = null,
): FinalScoreResult {
  // ── Score de base selon le contexte ──────────────────────────
  let base: number;
  if (context.type === "chaos") {
    base = 1;
  } else if (context.type === "exces") {
    base = 4;                          // sera ajusté par les modificateurs
  } else if (context.type === "tendance") {
    if (context.subtype === "essoufflement") {
      // Tendance qui perd son souffle : mauvais point d'entrée dans la direction du trend
      // Haussier épuisé → éviter d'acheter ; baissier épuisé → prudence avant rebond
      base = context.structure.type === "bearish" ? 4.5 : 3.5;
    } else {
      const isBearDir = context.structure.type === "bearish";
      // Les scores de maturité dépendent de la direction :
      // Haussier actif → scores élevés (bonne opportunité d'entrée/suivi)
      // Baissier actif → scores bas (dangereux, ne pas acheter)
      switch (context.maturity) {
        case "jeune":            base = isBearDir ? 2.5 : 8; break;
        case "en_developpement": base = isBearDir ? 2.0 : 7; break;
        case "mature":           base = isBearDir ? 3.5 : 5; break;
        case "divergence":       base = 3;                    break;
        default:                 base = isBearDir ? 3.0 : 6;
      }
      if (context.subtype === "divergence") base = Math.min(base, 4);
    }
  } else {
    // range
    base = context.subtype === "3br" ? 6 : 5;
  }

  // ── Modificateurs fondamentaux ────────────────────────────────
  const modifiers: string[] = [];
  let mod = 0;

  if (metrics) {
    const { roe, fcf, debtEq, netMargin, pb, currentRatio } = metrics;

    if (context.type === "exces") {
      const hasFcf    = fcf != null && fcf > 0;
      const hasRoe    = roe != null && roe > 0.15;
      const hasMargin = netMargin != null && netMargin > 0;
      const isDeficit = netMargin != null && netMargin < 0;

      if (hasFcf && hasRoe && hasMargin) {
        mod += 1.0;
        modifiers.push("+1.0 Excès avec fondamentaux solides (FCF+, ROE>15%, marges positives)");
      } else if (hasFcf && hasMargin && !isDeficit) {
        mod -= 0.5;
        modifiers.push("-0.5 Excès avec FCF positif mais ROE insuffisant");
      } else if (hasFcf && isDeficit) {
        mod -= 1.0;
        modifiers.push("-1.0 Excès sans rentabilité nette — momentum spéculatif");
      } else if (!hasFcf && !isDeficit) {
        mod -= 1.5;
        modifiers.push("-1.5 Bulle comportementale — valorisation sans cash réel");
      } else {
        mod -= 2.0;
        modifiers.push("-2.0 Bulle spéculative — déficitaire sans Free Cash Flow");
      }
    }

    if (context.type === "tendance" && context.subtype !== "essoufflement") {
      const solidBalance = debtEq != null && debtEq < 0.8 && netMargin != null && netMargin > 0;
      if (solidBalance) {
        mod += 0.5;
        modifiers.push("+0.5 Bilan solide en tendance (faible dette, marges positives)");
      }
    }

    if (context.subtype === "essoufflement") {
      // En essoufflement haussier, les bons fondamentaux limitent la pénalité
      // mais ne suffisent pas à recommander l'entrée
      const strongFundamentals = roe != null && roe > 0.2 && fcf != null && fcf > 0 && netMargin != null && netMargin > 0.1;
      if (context.structure.type === "bullish") {
        if (strongFundamentals) {
          mod += 0.5;
          modifiers.push("+0.5 Fondamentaux solides — essoufflement moins risqué");
        } else {
          mod -= 0.5;
          modifiers.push("-0.5 Momentum déclinant sans soutien fondamental fort");
        }
      } else {
        // Baissier épuisé avec bons fondamentaux → signal de rebond potentiel
        if (strongFundamentals) {
          mod += 1.0;
          modifiers.push("+1.0 Épuisement baissier avec fondamentaux sains — rebond possible");
        }
      }
    }

    const isValue =
      pb != null && pb < 1.5 &&
      fcf != null && fcf > 0 &&
      currentRatio != null && currentRatio > 1.2 &&
      netMargin != null && netMargin > 0;
    if (isValue) {
      mod += 0.5;
      modifiers.push("+0.5 Value structurelle (PB<1.5, FCF+, liquidités saines)");
    }

    if (currentRatio != null && currentRatio < 0.8) {
      mod -= 1.0;
      modifiers.push("-1.0 Santé financière critique (current ratio<0.8)");
    }

    if (netMargin != null && netMargin < 0 && context.structure.type === "bearish") {
      mod -= 1.0;
      modifiers.push("-1.0 Entreprise déficitaire en tendance baissière");
    }

    // Confirmation/pénalité valorisation en contexte range et tendance
    if (context.type === "range" || context.type === "tendance") {
      const gVal = metrics.gValorisation;
      if (gVal != null) {
        if (gVal <= 2.0) {
          mod -= 1.5;
          modifiers.push("-1.5 Survalorisation importante (score val. ≤ 2/10)");
        } else if (gVal <= 3.5) {
          mod -= 1.0;
          modifiers.push("-1.0 Valorisation dégradée (score val. ≤ 3.5/10)");
        } else if (gVal >= 7.0) {
          mod += 0.5;
          modifiers.push("+0.5 Valorisation attractive (score val. ≥ 7/10)");
        }
      }
    }
  }

  // ── Modificateur oscillateurs techniques ─────────────────────
  // Les signaux neutres (RSI 40-60, EMA ambigus) sont exclus du calcul directionnel.
  // Seuls RSI, MACD, volume, structure portent une direction exploitable.
  if (techSignals.length > 0) {
    const bulls = techSignals.filter(s => s.strength === "bull").length;
    const bears = techSignals.filter(s => s.strength === "bear").length;
    const total = bulls + bears;
    if (total >= 3) {
      const bullRatio = bulls / total;
      const isBullCtx = context.structure.type === "bullish" || context.type === "exces";
      const isBearCtx = context.structure.type === "bearish";

      // Contradiction : oscillateurs s'opposent au contexte structurel → signal d'alerte
      if (isBullCtx && bullRatio <= 0.30) {
        mod -= 0.5;
        modifiers.push(`-0.5 Oscillateurs contredisent le contexte haussier (${bears}↓/${total})`);
      } else if (isBearCtx && bullRatio >= 0.70) {
        mod += 0.5;
        modifiers.push(`+0.5 Oscillateurs s'opposent à la tendance baissière — rebond possible (${bulls}↑/${total})`);
      }
      // Confirmation forte : oscillateurs alignés avec le contexte
      else if (isBullCtx && bullRatio >= 0.70) {
        mod += 0.3;
        modifiers.push(`+0.3 Oscillateurs confirment le contexte haussier (${bulls}↑/${total})`);
      } else if (isBearCtx && bullRatio <= 0.30) {
        mod -= 0.3;
        modifiers.push(`-0.3 Oscillateurs confirment la pression baissière (${bears}↓/${total})`);
      }
    }
  }

  // ── Modificateur régression linéaire ─────────────────────────
  const reg = calcRegressionDeviation(closes);
  if (reg != null && reg.r2 >= 0.4) {
    const d = reg.deviation;
    const scoreRegression: number =
      d > 50  ? 2 :
      d > 30  ? 3 :
      d > 10  ? 5 :
      d >= -10 ? 7 :
      d >= -20 ? 8 : 9;
    // Poids 0.175 : delta centré sur 7 (neutre), ramené à une contribution mod
    const regMod = parseFloat(((scoreRegression - 7) * 0.175).toFixed(2));
    if (regMod !== 0) {
      mod += regMod;
      const sign = regMod > 0 ? "+" : "";
      modifiers.push(`${sign}${regMod} Régression linéaire — prix ${d >= 0 ? "+" : ""}${d.toFixed(0)}% / tendance (R²=${reg.r2.toFixed(2)})`);
    }
  }

  // ── Modificateur confluence (0-4 conditions PRO Indicators) ──
  if (confluenceScore != null) {
    const conflMod =
      confluenceScore === 4 ?  0.5 :
      confluenceScore === 3 ?  0.25 :
      confluenceScore === 1 ? -0.25 :
      confluenceScore === 0 ? -0.5  : 0;
    if (conflMod !== 0) {
      mod += conflMod;
      const sign = conflMod > 0 ? "+" : "";
      modifiers.push(`${sign}${conflMod} Confluence — ${confluenceScore}/4 conditions remplies`);
    }
  }

  const score = parseFloat(Math.max(1, Math.min(10, base + mod)).toFixed(1));

  // ── Mise à jour fundamentalConfirm sur le contexte ───────────
  const updatedContext: MarketContext = {
    ...context,
    fundamentalConfirm:
      mod >= 0.5  ? "confirms" :
      mod <= -1.0 ? "warns"    :
                    "neutral",
  };

  return { score, modifiers, context: updatedContext };
}

function computeTechSignals(
  closes:  (number|null)[],
  volumes: (number|null)[],
  highs:   (number|null)[] = [],
  lows:    (number|null)[] = [],
  chartInterval: "1d" | "1wk" | "1mo" = "1d",
): { signals: TechSignal[]; sinewave: SinewaveResult | null } {
  const signals: TechSignal[] = [];
  const rsi   = calcRSI(closes);
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const macdRaw = calcMACD(closes);
  const macd = (macdRaw != null &&
    !isNaN(macdRaw.macd) &&
    !isNaN(macdRaw.signal) &&
    !isNaN(macdRaw.hist)) ? macdRaw : null;
  const vol    = calcVolumeAnomaly(volumes);
  const last   = closes.filter((v): v is number => v != null).slice(-1)[0];

  // RSI
  const rsiEdu = {
    concept: "Le RSI (Relative Strength Index) mesure la vitesse et l'intensité des mouvements de prix sur les 14 dernières séances. Il varie de 0 à 100.",
    howToRead: "En dessous de 30 : le titre a trop baissé trop vite — rebond probable (survente). Au-dessus de 70 : le titre a trop monté trop vite — correction probable (surachat). Entre 40 et 60 : situation normale.",
  };
  if (rsi != null) {
    if (rsi >= 75)
      signals.push({ emoji:"🔴", color:"#ef4444",
        plain:"Le titre est très suracheté — une correction est probable",
        label:`RSI ${rsi}`, detail:"Indicateur de momentum · Zone de surachat extrême (>75)", strength:"bear",
        edu: { ...rsiEdu, example:`Avec un RSI de ${rsi}, le titre a énormément monté en peu de temps. Les acheteurs s'essoufflent — statistiquement, une pause ou une baisse suit souvent.` } });
    else if (rsi >= 60)
      signals.push({ emoji:"🟡", color:"#f59e0b",
        plain:"Le titre commence à être suracheté — surveiller un retournement",
        label:`RSI ${rsi}`, detail:"Indicateur de momentum · Zone de surachat (60-75)", strength:"bear",
        edu: { ...rsiEdu, example:`Un RSI de ${rsi} indique une pression acheteuse forte mais pas encore excessive. Rester vigilant, le momentum peut s'inverser.` } });
    else if (rsi <= 25)
      signals.push({ emoji:"🟢", color:"#22c55e",
        plain:"Le titre est très survendu — un rebond est probable",
        label:`RSI ${rsi}`, detail:"Indicateur de momentum · Zone de survente extrême (<25)", strength:"bull",
        edu: { ...rsiEdu, example:`Un RSI de ${rsi} signifie que le titre a été martelé par les vendeurs. Le marché réagit souvent en excès — un rebond technique est fréquent depuis ces niveaux.` } });
    else if (rsi <= 40)
      signals.push({ emoji:"🟡", color:"#f59e0b",
        plain:"Le titre est légèrement survendu — possible point d'entrée",
        label:`RSI ${rsi}`, detail:"Indicateur de momentum · Zone de survente (25-40)", strength:"bull",
        edu: { ...rsiEdu, example:`RSI de ${rsi} : le titre a subi des ventes mais n'est pas encore en zone extrême. Surveiller une stabilisation avant d'entrer.` } });
    else
      signals.push({ emoji:"⚪", color:"#8b949e",
        plain:"Le titre n'est ni suracheté ni survendu — momentum neutre",
        label:`RSI ${rsi}`, detail:"Indicateur de momentum · Zone neutre (40-60)", strength:"neutral",
        edu: { ...rsiEdu, example:`RSI de ${rsi} : le titre évolue normalement, sans excès dans un sens ni dans l'autre. Pas de signal directionnel fort à ce stade.` } });
  }

  // EMA Golden/Death Cross
  const emaEduBase = {
    concept: "L'EMA (Exponential Moving Average) est la moyenne des prix sur une période, avec plus de poids sur les données récentes. L'EMA50 = moyenne des 50 derniers jours. L'EMA200 = moyenne des 200 derniers jours (≈ 1 an de bourse).",
    howToRead: "Quand l'EMA50 passe au-dessus de l'EMA200 → 'Golden Cross' : signal haussier fort. Quand l'EMA50 passe sous l'EMA200 → 'Death Cross' : signal baissier fort. Plus la valeur est élevée, plus le prix moyen récent est haut.",
  };
  if (ema50 != null && ema200 != null && last != null) {
    if (ema50 > ema200 && last > ema50)
      signals.push({ emoji:"🟢", color:"#22c55e",
        plain:"La tendance de fond est haussière et le prix suit — signal positif",
        label:"Golden Cross", detail:`EMA50 (${ema50}) > EMA200 (${ema200}) · Prix au-dessus des deux`,
        strength:"bull", edu: { ...emaEduBase,
          example:`L'EMA50 est à ${ema50} et l'EMA200 à ${ema200}. La moyenne courte est au-dessus de la longue, et le prix (${last}) dépasse les deux : les acheteurs dominent sur toutes les échelles de temps.` } });
    else if (ema50 < ema200 && last < ema50)
      signals.push({ emoji:"🔴", color:"#ef4444",
        plain:"La tendance de fond est clairement à la baisse",
        label:"Death Cross", detail:`EMA50 (${ema50}) < EMA200 (${ema200}) · Prix sous les deux`,
        strength:"bear", edu: { ...emaEduBase,
          example:`L'EMA50 (${ema50}) est passée sous l'EMA200 (${ema200}) — c'est le "Death Cross". Le prix (${last}) est en dessous des deux moyennes : la tendance baissière est confirmée à court et long terme.` } });
    else if (ema50 > ema200)
      signals.push({ emoji:"🟡", color:"#f59e0b",
        plain:"La tendance long terme est haussière mais le prix marque une pause",
        label:"Tendance haussière", detail:`EMA50 (${ema50}) > EMA200 (${ema200}) · Prix sous la EMA50`,
        strength:"neutral", edu: { ...emaEduBase,
          example:`L'EMA50 (${ema50}) reste au-dessus de l'EMA200 (${ema200}) — tendance de fond positive. Mais le prix (${last}) est retombé sous l'EMA50 : correction temporaire ou début de retournement à surveiller.` } });
    else
      signals.push({ emoji:"🟡", color:"#f59e0b",
        plain:"La tendance long terme est baissière mais le prix résiste pour l'instant",
        label:"Tendance baissière", detail:`EMA50 (${ema50}) < EMA200 (${ema200}) · Prix au-dessus de la EMA50`,
        strength:"neutral", edu: { ...emaEduBase,
          example:`L'EMA50 (${ema50}) est sous l'EMA200 (${ema200}) : tendance de fond baissière. Le prix (${last}) est remonté au-dessus de l'EMA50 — rebond temporaire possible, mais le contexte reste défavorable.` } });
  }

  // MACD
  const macdEduBase = {
    concept: "Le MACD (Moving Average Convergence Divergence) mesure la différence entre deux moyennes mobiles (12 et 26 jours) pour détecter les changements de momentum. Une 'ligne de signal' (moyenne 9j du MACD) permet d'identifier les croisements.",
    howToRead: "MACD au-dessus de la ligne de signal → momentum haussier. MACD en dessous → momentum baissier. Le moment où les deux lignes se croisent est le signal d'achat ou de vente. L'histogramme (barres) représente l'écart entre les deux lignes.",
  };
  if (macd != null) {
    if (macd.hist > 0 && macd.macd > 0)
      signals.push({ emoji:"🟢", color:"#22c55e",
        plain:"Le momentum est positif — les acheteurs ont la main",
        label:"MACD haussier", detail:`MACD ${macd.macd} au-dessus de sa ligne de signal (${macd.signal})`,
        strength:"bull", edu: { ...macdEduBase,
          example:`Le MACD est à ${macd.macd} et au-dessus de sa ligne de signal (${macd.signal}). Les deux valeurs sont positives : les acheteurs accélèrent. C'est un contexte favorable au maintien de positions.` } });
    else if (macd.hist < 0 && macd.macd < 0)
      signals.push({ emoji:"🔴", color:"#ef4444",
        plain:"Le momentum est négatif — les vendeurs dominent",
        label:"MACD baissier", detail:`MACD ${macd.macd} sous sa ligne de signal (${macd.signal})`,
        strength:"bear", edu: { ...macdEduBase,
          example:`MACD à ${macd.macd}, sous sa ligne de signal (${macd.signal}). Les deux valeurs sont négatives : les vendeurs accélèrent. Signal défavorable — éviter les achats impulsifs.` } });
    else if (macd.hist > 0)
      signals.push({ emoji:"🟡", color:"#f59e0b",
        plain:"Un retournement à la hausse vient de se dessiner — à confirmer",
        label:"MACD croisement haussier", detail:`Histogramme positif · MACD ${macd.macd} / Signal ${macd.signal}`,
        strength:"bull", edu: { ...macdEduBase,
          example:`Le MACD (${macd.macd}) vient de passer au-dessus de sa ligne de signal (${macd.signal}). Ce croisement est souvent le premier signe d'un retournement à la hausse — à confirmer avec d'autres indicateurs.` } });
    else
      signals.push({ emoji:"🟡", color:"#f59e0b",
        plain:"Le momentum commence à faiblir — possible retournement à la baisse",
        label:"MACD croisement baissier", detail:`Histogramme négatif · MACD ${macd.macd} / Signal ${macd.signal}`,
        strength:"bear", edu: { ...macdEduBase,
          example:`Le MACD (${macd.macd}) vient de passer sous sa ligne de signal (${macd.signal}). Premier signe d'affaiblissement du momentum — surveiller si la tendance se confirme dans les prochaines séances.` } });
  }

  // DIVERGENCE CACHÉE
  const hiddenDiv = calcHiddenDivergence(closes, macd);
  const hiddenDivEdu = {
    concept: "La divergence cachée se produit quand le momentum (MACD) et le prix évoluent en sens contraire lors d'une correction dans une tendance. Contrairement à la divergence classique, elle signale que la tendance de fond est mature et qu'un essoufflement est en cours.",
    howToRead: "Divergence cachée haussière : le prix fait un creux plus haut (correction saine) mais le MACD fait un creux plus bas (momentum s'affaiblit) — tendance haussière mature, attendre un meilleur point d'entrée. Divergence cachée baissière : l'inverse — tendance baissière mature, éviter les achats.",
  };
  if (hiddenDiv != null) {
    if (hiddenDiv.type === "bull")
      signals.push({ emoji:"🟡", color:"#f59e0b",
        plain: hiddenDiv.strength === "strong"
          ? "Divergence cachée haussière forte — tendance mature, momentum en perte de vitesse"
          : "Divergence cachée haussière — correction en cours dans une tendance haussière",
        label:`Div. cachée haussière (${hiddenDiv.strength === "strong" ? "forte" : "modérée"})`,
        detail:"Prix : creux croissants · MACD : creux décroissants · Signal de maturité de tendance",
        strength:"neutral",
        edu: { ...hiddenDivEdu,
          example:`Le prix fait des creux de plus en plus hauts (correction saine) mais le MACD montre des creux de plus en plus bas. La tendance haussière reste intacte mais le momentum s'essouffle — un meilleur point d'entrée pourrait se présenter après consolidation.` } });
    else
      signals.push({ emoji:"🟡", color:"#f97316",
        plain: hiddenDiv.strength === "strong"
          ? "Divergence cachée baissière forte — rebond sur tendance baissière mature"
          : "Divergence cachée baissière — rebond technique dans une tendance baissière",
        label:`Div. cachée baissière (${hiddenDiv.strength === "strong" ? "forte" : "modérée"})`,
        detail:"Prix : sommets décroissants · MACD : sommets croissants · Signal de rebond technique",
        strength:"bear",
        edu: { ...hiddenDivEdu,
          example:`Le prix fait des sommets de plus en plus bas (tendance baissière confirmée) mais le MACD monte — simple rebond technique. La pression vendeuse reste dominante, éviter les achats impulsifs sur ce rebond.` } });
  }

  // Volume
  const volEduBase = {
    concept: "Le volume représente le nombre de titres échangés sur une séance. Un pic de volume inhabituel indique souvent qu'un acteur important (fonds, institution) est en train d'acheter ou de vendre massivement.",
    howToRead: "Un volume 2x supérieur à la moyenne sur plusieurs jours est significatif. Combiné à une hausse de prix → signe d'accumulation (achat institutionnel). Combiné à une baisse → signe de distribution (vente massive).",
  };
  if (vol != null && vol.anomaly)
    signals.push({ emoji:"⚡", color:"#60a5fa",
      plain:`Les volumes ont été ${vol.ratio}x supérieurs à la normale récemment — activité inhabituelle`,
      label:`Volume ×${vol.ratio}`, detail:"Pic de volume sur les 5 dernières séances · Possible entrée ou sortie institutionnelle",
      strength:"neutral", edu: { ...volEduBase,
        example:`Les volumes récents sont ${vol.ratio}x supérieurs à la moyenne historique. Ce niveau d'activité inhabituel mérite attention — croiser avec l'évolution du prix pour déterminer si c'est un achat ou une vente de grande ampleur.` } });

  // ── Sinewave + Momentum ──────────────────────────────────────
  const swRaw = calcSinewave(closes);
  // Le dp retourné par calcSinewave est en unités du graphique (jours, semaines ou mois).
  // On le normalise en jours équivalents pour que le mapping optimalUT soit cohérent
  // quelle que soit la résolution du graphique analysé.
  const sw: SinewaveResult | null = (() => {
    if (swRaw == null) return null;
    if (chartInterval === "1d") return swRaw;
    const mult  = chartInterval === "1wk" ? 5 : 22;
    const dpDays = swRaw.dominantPeriod * mult;
    const optimalUT =
      dpDays <= 10  ? { label:"Journalier",               horizon:"Court terme · Swing 1-2 sem.",   note:`Cycle dominant ~${dpDays}j — le journalier est l'UT optimale pour piloter les entrées/sorties.` } :
      dpDays <= 22  ? { label:"Journalier / Hebdomadaire", horizon:"Swing 2-6 semaines",             note:`Cycle ~${dpDays}j — journalier pour l'entrée, hebdomadaire pour le contexte.` } :
      dpDays <= 40  ? { label:"Hebdomadaire",              horizon:"Position 1-3 mois",              note:`Cycle ~${dpDays}j — l'hebdomadaire filtre le bruit et aligne sur les mouvements de fond.` } :
                      { label:"Mensuel / Hebdomadaire",    horizon:"Long terme 3-12 mois",           note:`Cycle long ~${dpDays}j — les fondamentaux reprennent le dessus sur les signaux techniques.` };
    return { ...swRaw, optimalUT };
  })();
  const swEdu = {
    concept: "Le Sinewave d'Ehlers (Hilbert Transform) décompose le prix en composantes cycliques pour identifier la phase de marché et la durée du cycle dominant.",
    howToRead: "Quand la ligne Sine croise la LeadSine vers le bas → creux de cycle (signal haussier). Vers le haut → sommet de cycle (signal baissier). La période dominante indique la durée du cycle actuel en jours.",
  };
  const momEdu = {
    concept: "Le Momentum ROC-14 (Rate of Change) mesure la variation de prix sur 14 séances en %. Il capture la vitesse et la direction du mouvement récent.",
    howToRead: "Au-dessus de +5% : élan haussier. En dessous de -5% : élan baissier. Proche de 0 : marché sans direction. Un changement de signe peut précéder un retournement de prix.",
  };

  if (sw != null) {
    if (sw.cycleTurn === "trough") {
      signals.push({ emoji:"🔋", color:"#22c55e",
        plain:"Retournement de cycle haussier — fin probable de la phase baissière",
        label:`Sinewave — creux de cycle (~${sw.dominantPeriod}j)`,
        detail:`Sine ${sw.sine} croise LeadSine ${sw.leadSine} · Phase ${sw.phase.toFixed(0)}°`,
        strength:"bull", edu: { ...swEdu,
          example:`Le Sinewave vient de croiser la LeadSine dans la zone basse — signal de creux de cycle. Confirmé par le RSI ou le MACD, il indique souvent un point bas à exploiter.` } });
    } else if (sw.cycleTurn === "peak") {
      signals.push({ emoji:"🔻", color:"#ef4444",
        plain:"Retournement de cycle baissier — fin probable de la phase haussière",
        label:`Sinewave — sommet de cycle (~${sw.dominantPeriod}j)`,
        detail:`Sine ${sw.sine} croise LeadSine ${sw.leadSine} · Phase ${sw.phase.toFixed(0)}°`,
        strength:"bear", edu: { ...swEdu,
          example:`Croisement Sine/LeadSine en zone haute — sommet de cycle probable. Réduire les positions longues ou serrer les stops.` } });
    } else {
      const pos = sw.sine > 0.5 ? "phase haute" : sw.sine < -0.5 ? "phase basse" : sw.sine > 0 ? "montée" : "descente";
      signals.push({ emoji:"〰️", color:"#8b949e",
        plain:`Cycle ${sw.mode === "trending" ? "en tendance" : "oscillant"} — actuellement en ${pos}`,
        label:`Sinewave — période ~${sw.dominantPeriod}j`,
        detail:`Sine ${sw.sine} · LeadSine ${sw.leadSine} · Phase ${sw.phase.toFixed(0)}°`,
        strength:"neutral", edu: { ...swEdu,
          example:`Période dominante ~${sw.dominantPeriod}j. Sine à ${sw.sine} — pas de retournement imminent, le cycle poursuit sa course.` } });
    }

    if (sw.momentum14 > 5) {
      signals.push({ emoji:"⬆️", color:"#22c55e",
        plain:`Élan haussier solide — +${sw.momentum14.toFixed(1)}% sur 14 séances`,
        label:`Momentum ROC +${sw.momentum14.toFixed(1)}%`,
        detail:"Rate of Change 14 jours · Tendance court terme haussière",
        strength:"bull", edu: { ...momEdu,
          example:`+${sw.momentum14.toFixed(1)}% sur 14 séances — pression acheteuse soutenue. Signal positif pour les positions longues.` } });
    } else if (sw.momentum14 < -5) {
      signals.push({ emoji:"⬇️", color:"#ef4444",
        plain:`Élan baissier — ${sw.momentum14.toFixed(1)}% sur 14 séances`,
        label:`Momentum ROC ${sw.momentum14.toFixed(1)}%`,
        detail:"Rate of Change 14 jours · Tendance court terme baissière",
        strength:"bear", edu: { ...momEdu,
          example:`${sw.momentum14.toFixed(1)}% sur 14 séances — pression vendeuse persistante. Éviter les achats impulsifs tant que le momentum reste négatif.` } });
    } else {
      signals.push({ emoji:"↔️", color:"#8b949e",
        plain:`Momentum neutre — ${sw.momentum14 >= 0 ? "+" : ""}${sw.momentum14.toFixed(1)}% sur 14 séances`,
        label:`Momentum ROC ${sw.momentum14 >= 0 ? "+" : ""}${sw.momentum14.toFixed(1)}%`,
        detail:"Rate of Change 14 jours · Absence d'élan directionnel",
        strength:"neutral", edu: { ...momEdu,
          example:`ROC de ${sw.momentum14.toFixed(1)}% — le titre évolue sans élan marqué. Le momentum changera probablement avant que le prix ne montre une vraie direction.` } });
    }
  }

  // ── ADX ──────────────────────────────────────────────────────
  const adxEdu = {
    concept: "L'ADX (Average Directional Index) mesure la force d'une tendance, indépendamment de sa direction. Il va de 0 à 100.",
    howToRead: "Sous 20 : pas de tendance directionnelle — marché en range. Entre 25 et 40 : tendance modérée. Au-dessus de 40 : tendance forte ou excès de marché.",
  };
  if (highs.length > 0 && lows.length > 0) {
    const adxVal = calcADX(highs, lows, closes);
    if (adxVal != null) {
      if (adxVal >= 40) {
        signals.push({ emoji:"🟢", color:"#22c55e",
          plain:`Tendance très forte — ADX à ${adxVal.toFixed(0)}, marché fortement directionnel`,
          label:`ADX ${adxVal.toFixed(0)}`, detail:"Force de tendance · Zone forte (>40)",
          strength:"bull", edu: { ...adxEdu,
            example:`ADX de ${adxVal.toFixed(0)} : tendance très puissante. Dans ce contexte, les corrections sont souvent courtes. Mais un ADX > 50 peut aussi signaler un excès proche d'un retournement.` } });
      } else if (adxVal >= 25) {
        signals.push({ emoji:"📐", color:"#8b949e",
          plain:`Tendance modérée présente — ADX à ${adxVal.toFixed(0)}`,
          label:`ADX ${adxVal.toFixed(0)}`, detail:"Force de tendance · Zone modérée (25-40)",
          strength:"neutral", edu: { ...adxEdu,
            example:`ADX de ${adxVal.toFixed(0)} : il y a une direction, mais la tendance n'est pas encore dominante. Bon contexte pour les stratégies de suivi de tendance prudentes.` } });
      } else {
        signals.push({ emoji:"〰️", color:"#445",
          plain:`Pas de tendance directionnelle — ADX faible à ${adxVal.toFixed(0)}`,
          label:`ADX ${adxVal.toFixed(0)}`, detail:"Force de tendance · Zone de range (<25)",
          strength:"neutral", edu: { ...adxEdu,
            example:`ADX de ${adxVal.toFixed(0)} : le marché oscille sans direction claire. Les stratégies de range (acheter bas, vendre haut) sont plus adaptées que le suivi de tendance.` } });
      }
    }

    // ── Structure HH/HL ────────────────────────────────────────
    const struct = detectTrendStructure(highs, lows, closes);
    const structEdu = {
      concept: "En tendance haussière, le prix fait des Hauts de Plus en Plus Hauts (HH) et des Bas de Plus en Plus Hauts (HL). C'est la définition technique d'une tendance — utilisée depuis Dow Theory (1900).",
      howToRead: "HH+HL = tendance haussière structurelle confirmée. LL+LH = tendance baissière. Mixte = indécision, possible retournement ou range. Plat = absence de structure directionnelle.",
    };
    if (struct.type === "bullish") {
      signals.push({ emoji:"🏔️", color:"#22c55e",
        plain:"Structure haussière confirmée — le prix fait des hauts et bas croissants",
        label:`Structure HH+HL (${struct.swings} pivots)`, detail:"Analyse des pivots sur 20 barres · Tendance haussière structurelle",
        strength:"bull", edu: { ...structEdu,
          example:`${struct.swings} pivots analysés : HH+HL confirmés. La structure du prix valide une tendance haussière en cours. Les corrections restent des opportunités d'achat tant que la structure tient.` } });
    } else if (struct.type === "bearish") {
      signals.push({ emoji:"🏚️", color:"#ef4444",
        plain:"Structure baissière confirmée — le prix fait des hauts et bas décroissants",
        label:`Structure LL+LH (${struct.swings} pivots)`, detail:"Analyse des pivots sur 20 barres · Tendance baissière structurelle",
        strength:"bear", edu: { ...structEdu,
          example:`${struct.swings} pivots analysés : LL+LH confirmés. La structure du prix valide une tendance baissière. Chaque rebond est une opportunité de sortie, pas d'achat.` } });
    } else if (struct.type === "mixed") {
      signals.push({ emoji:"↕️", color:"#8b949e",
        plain:"Structure mixte — le marché hésite entre hausse et baisse",
        label:`Structure mixte (${struct.swings} pivots)`, detail:"Analyse des pivots sur 20 barres · Indécision directionnelle",
        strength:"neutral", edu: { ...structEdu,
          example:`${struct.swings} pivots sans direction claire. Le marché est en phase de transition — attendre la formation d'une structure claire avant de prendre position.` } });
    }

    // ── Divergence RSI ─────────────────────────────────────────
    const div = detectDivergence(closes);
    const divEdu = {
      concept: "Une divergence se produit quand le prix et le RSI divergent : le prix monte mais le RSI fait des sommets plus bas, ou le prix baisse mais le RSI fait des creux plus hauts. Signal avancé de retournement possible.",
      howToRead: "Divergence baissière (prix HH, RSI LH) : la tendance haussière s'essouffle — risque de retournement. Divergence haussière (prix LL, RSI HL) : la pression vendeuse s'épuise — rebond probable.",
    };
    if (div.type === "bearish") {
      signals.push({ emoji:"⚠️", color:"#ef4444",
        plain:`Divergence baissière ${div.strength === "strong" ? "forte" : "faible"} — le prix monte mais le RSI décroche`,
        label:`Divergence RSI baissière (${div.strength === "strong" ? "forte" : "faible"})`, detail:"Prix HH · RSI LH · Signal de maturité de tendance",
        strength:"bear", edu: { ...divEdu,
          example:`Le prix a fait de nouveaux sommets mais le RSI n'a pas suivi. Cette divergence ${div.strength === "strong" ? "forte" : "modérée"} est un signal classique d'épuisement haussier — réduire les positions longues.` } });
    } else if (div.type === "bullish") {
      signals.push({ emoji:"🌱", color:"#22c55e",
        plain:`Divergence haussière ${div.strength === "strong" ? "forte" : "faible"} — le prix baisse mais le RSI remonte`,
        label:`Divergence RSI haussière (${div.strength === "strong" ? "forte" : "faible"})`, detail:"Prix LL · RSI HL · Signal d'épuisement baissier",
        strength:"bull", edu: { ...divEdu,
          example:`Le prix a fait de nouveaux creux mais le RSI se redresse. Cette divergence ${div.strength === "strong" ? "forte" : "modérée"} indique que les vendeurs s'épuisent — signal précurseur d'un rebond.` } });
    }
  }

  // RÉGRESSION LINÉAIRE
  const reg = calcRegressionDeviation(closes);
  const regEduBase = {
    concept: "La régression linéaire trace la 'tendance de fond' des prix sur toute la période disponible. Elle permet de savoir si le prix actuel est cher ou bon marché par rapport à sa trajectoire historique normale.",
    howToRead: "Une déviation positive = le prix est au-dessus de sa tendance normale. Négative = en dessous. Le R² indique la fiabilité : proche de 1 = tendance claire, proche de 0 = trop de bruit pour conclure.",
  };
  if (reg != null && reg.r2 >= 0.4) {
    const d = reg.deviation;
    const r2str = reg.r2.toFixed(2);
    const periodStr = reg.periodYears > 1 ? `${reg.periodYears} ans` : `${Math.round(reg.periodYears * 12)} mois`;
    if (d > 50)
      signals.push({ emoji:"🔴", color:"#ef4444",
        plain:`Prix ${d.toFixed(0)}% au-dessus de sa tendance historique — excès marqué`,
        label:`Régression +${d.toFixed(0)}%`, detail:`R²=${r2str} · Tendance ${reg.slope} sur ${periodStr} · Prix théorique : ${fmt(reg.trendPrice)}`,
        strength:"bear", edu: { ...regEduBase,
          example:`Sur ${periodStr} de données, la tendance de fond indique un prix théorique de ${fmt(reg.trendPrice)}. Le prix actuel est ${d.toFixed(0)}% au-dessus — un écart de cette ampleur précède souvent un retour vers la moyenne.` } });
    else if (d > 30)
      signals.push({ emoji:"🔴", color:"#f97316",
        plain:`Prix ${d.toFixed(0)}% au-dessus de sa tendance — zone de surchauffe`,
        label:`Régression +${d.toFixed(0)}%`, detail:`R²=${r2str} · Tendance ${reg.slope} sur ${periodStr} · Prix théorique : ${fmt(reg.trendPrice)}`,
        strength:"bear", edu: { ...regEduBase,
          example:`Le prix actuel dépasse de ${d.toFixed(0)}% sa trajectoire historique (R²=${r2str}). Zone de surchauffe — pas forcément un signal de vente immédiat, mais la marge de sécurité est faible.` } });
    else if (d > 10)
      signals.push({ emoji:"🟡", color:"#f59e0b",
        plain:`Prix légèrement au-dessus de sa tendance (+${d.toFixed(0)}%) — surveiller`,
        label:`Régression +${d.toFixed(0)}%`, detail:`R²=${r2str} · Tendance ${reg.slope} sur ${periodStr} · Prix théorique : ${fmt(reg.trendPrice)}`,
        strength:"neutral", edu: { ...regEduBase,
          example:`Le prix est ${d.toFixed(0)}% au-dessus de sa tendance de fond (${periodStr}, R²=${r2str}). Légère surchauffe — tendance à surveiller mais pas encore alarmante.` } });
    else if (d >= -10)
      signals.push({ emoji:"⚪", color:"#8b949e",
        plain:`Prix aligné sur sa tendance historique (${d >= 0 ? "+" : ""}${d.toFixed(0)}%) — neutre`,
        label:`Régression ${d >= 0 ? "+" : ""}${d.toFixed(0)}%`, detail:`R²=${r2str} · Tendance ${reg.slope} sur ${periodStr} · Prix théorique : ${fmt(reg.trendPrice)}`,
        strength:"neutral", edu: { ...regEduBase,
          example:`Le prix actuel est proche de sa trajectoire historique normale (écart de ${d.toFixed(0)}% sur ${periodStr}, R²=${r2str}). Ni surévalué ni sous-évalué techniquement.` } });
    else if (d >= -20)
      signals.push({ emoji:"🟢", color:"#22c55e",
        plain:`Prix légèrement sous sa tendance (${d.toFixed(0)}%) — opportunité potentielle`,
        label:`Régression ${d.toFixed(0)}%`, detail:`R²=${r2str} · Tendance ${reg.slope} sur ${periodStr} · Prix théorique : ${fmt(reg.trendPrice)}`,
        strength:"bull", edu: { ...regEduBase,
          example:`Le prix est ${Math.abs(d).toFixed(0)}% sous sa tendance de fond (${periodStr}, R²=${r2str}). Zone historiquement favorable pour les acheteurs long terme.` } });
    else
      signals.push({ emoji:"🟢", color:"#22c55e",
        plain:`Prix ${Math.abs(d).toFixed(0)}% sous sa tendance historique — décote significative`,
        label:`Régression ${d.toFixed(0)}%`, detail:`R²=${r2str} · Tendance ${reg.slope} sur ${periodStr} · Prix théorique : ${fmt(reg.trendPrice)}`,
        strength:"bull", edu: { ...regEduBase,
          example:`Le prix est ${Math.abs(d).toFixed(0)}% sous sa trajectoire normale (${periodStr}, R²=${r2str}). Décote historique importante — signal d'accumulation si les fondamentaux restent solides.` } });
  } else if (reg != null && reg.r2 < 0.4) {
    signals.push({ emoji:"⚪", color:"#8b949e",
      plain:`Tendance historique peu fiable — trop de volatilité pour conclure`,
      label:`Régression R²=${reg.r2.toFixed(2)}`, detail:`R² insuffisant · Pas de signal directionnel fiable sur ${reg.periodYears > 1 ? reg.periodYears + " ans" : Math.round(reg.periodYears * 12) + " mois"}`,
      strength:"neutral", edu: { ...regEduBase,
        example:`Le R² est de ${reg.r2.toFixed(2)} — la trajectoire historique est trop irrégulière pour qu'une régression soit significative. Les prix évoluent sans tendance claire.` } });
  }

  return { signals, sinewave: sw };
}

// ── ENCART CONTEXTE SITUATIONNEL ─────────────────────────────
interface SitSignal {
  emoji: string;
  color: string;
  label: string;
  detail: string;
}

function computeSituationalContext(
  metrics: any,
  sw?: SinewaveResult | null,
  trendDev?: TrendDevResult | null,
): {
  profile: string;
  profileColor: string;
  profileEmoji: string;
  horizon: string;
  signals: SitSignal[];
} | null {
  if (!metrics) return null;
  const { pe, pb, roe, netMargin, change52w, shortRatio, debtEq, currentRatio,
          gValorisation, gSante, globalScore, fcf, mktCap, quoteType } = metrics;
  const signals: SitSignal[] = [];

  // ── Surévaluation extrême
  if (gValorisation != null && gValorisation <= 2.5) {
    signals.push({ emoji:"⚠️", color:"#ef4444", label:"Surévaluation extrême",
      detail:`PE ${pe?.toFixed(1) ?? "—"}, PB ${pb?.toFixed(1) ?? "—"} — le marché price la perfection. Toute déception peut entraîner une correction sévère.` });
  }

  // ── Marché en excès + momentum fort
  if (gValorisation != null && gValorisation <= 3 && change52w != null && change52w > 0.15) {
    signals.push({ emoji:"🫧", color:"#f97316", label:"Dynamique de bulle",
      detail:`+${(change52w*100).toFixed(0)}% sur 12 mois avec une valorisation déjà tendue. Point d'entrée défavorable.` });
  }

  // ── Décote profonde sur actifs
  if (pb != null && pb < 0.6) {
    if (netMargin != null && netMargin < 0) {
      signals.push({ emoji:"🔵", color:"#60a5fa", label:`Décote profonde (PB ${pb.toFixed(2)})`,
        detail:"L'entreprise se négocie sous sa valeur comptable malgré des pertes — potentiel value trap ou opportunité de restructuration." });
    } else {
      signals.push({ emoji:"🟢", color:"#22c55e", label:`Décote profonde (PB ${pb.toFixed(2)})`,
        detail:"Prix inférieur à la valeur des actifs nets — opportunité value classique si les fondamentaux se redressent." });
    }
  }

  // ── Restructuration détectée
  const isRestructuring =
    change52w != null && change52w < -0.40 &&
    pb != null && pb < 0.8 &&
    netMargin != null && netMargin < 0;

  if (isRestructuring) {
    signals.push({ emoji:"🔄", color:"#a78bfa", label:"Profil de restructuration",
      detail:`Chute de ${Math.abs((change52w!*100)).toFixed(0)}% avec décote sur actifs et pertes — le marché a pricé le pire. Surveiller les signaux de retournement opérationnel.` });
  }

  // ── Short squeeze potentiel
  if (shortRatio != null && shortRatio > 8 && change52w != null && change52w < -0.20) {
    signals.push({ emoji:"⚡", color:"#fbbf24", label:`Short ratio élevé (${shortRatio.toFixed(1)}j)`,
      detail:"Forte position vendeuse à découvert — en cas de bonne nouvelle, un short squeeze peut provoquer un rebond violent et rapide." });
  }

  // ── Santé financière critique
  if (currentRatio != null && currentRatio < 0.8) {
    signals.push({ emoji:"🚨", color:"#ef4444", label:"Risque de liquidité",
      detail:`Current ratio ${currentRatio.toFixed(2)} — l'entreprise pourrait avoir du mal à honorer ses obligations court terme. Surveiller la trésorerie.` });
  }

  // ── FCF positif sur action décotée = signal fort
  if (fcf != null && fcf > 0 && pb != null && pb < 1.5 && netMargin != null && netMargin > 0) {
    signals.push({ emoji:"💰", color:"#22c55e", label:"Free Cash Flow positif",
      detail:"Génère du cash malgré une valorisation basse — signe de solidité opérationnelle réelle." });
  }

  // ── Décorrélation prix/valeur ─────────────────────────────
  const isDecorrelation =
    change52w != null && change52w > 0.15 &&
    gValorisation != null && gValorisation <= 3.5 &&
    (
      (netMargin != null && netMargin < 0) ||
      (debtEq != null && debtEq > 2.0)
    ) &&
    (sw == null || sw.sine > 0.3 || sw.cycleTurn === "peak");

  if (isDecorrelation) {
    signals.push({
      emoji: "🔀", color: "#f97316",
      label: "Décorrélation prix/valeur",
      detail: `Le prix progresse (+${change52w != null ? (change52w*100).toFixed(0) : "—"}% sur 12 mois) mais les fondamentaux ne suivent pas${debtEq != null && debtEq > 2 ? ` (dette/equity ${debtEq.toFixed(1)}x)` : netMargin != null && netMargin < 0 ? " (entreprise déficitaire)" : ""}. Signal classique de fin de cycle ou de bulle spéculative.`,
    });
  }

  // ── Indice : P/E vs norme historique ─────────────────────────
  const qt = (quoteType || "").toUpperCase();
  if (qt === "INDEX" && pe != null) {
    if (pe > 25) {
      signals.push({ emoji:"🫧", color:"#ef4444",
        label:`Valorisation indice élevée — P/E ${pe.toFixed(0)}x`,
        detail:`La moyenne historique du S&P 500 est ~15-17x. À ${pe.toFixed(0)}x, le marché intègre une croissance parfaite des bénéfices — toute déception macro peut déclencher une correction sévère.` });
    } else if (pe > 20) {
      signals.push({ emoji:"⚠️", color:"#f59e0b",
        label:`P/E indice au-dessus de la moyenne — ${pe.toFixed(0)}x`,
        detail:`Au-dessus de 20x, la valorisation dépasse la moyenne historique (~15-17x). Pas encore en bulle, mais la marge de sécurité se réduit — surveiller les taux et les révisions de bénéfices.` });
    }
  }

  // ── Déviation à la tendance long terme ───────────────────────
  if (trendDev != null && trendDev.r2 >= 0.4) {
    const dev = trendDev.deviation;
    if (dev > 30) {
      signals.push({ emoji:"📈", color:"#ef4444",
        label:`Marché ${dev.toFixed(0)}% au-dessus de sa tendance`,
        detail:`Le prix actuel dépasse de ${dev.toFixed(0)}% la trajectoire historique long terme (R²=${trendDev.r2}). Ce niveau de déviation précède souvent un retour vers la moyenne — rapide ou progressif selon le contexte macro.` });
    } else if (dev > 15) {
      signals.push({ emoji:"📊", color:"#f59e0b",
        label:`Déviation tendance +${dev.toFixed(0)}%`,
        detail:`Prix ${dev.toFixed(0)}% au-dessus de la tendance de fond (R²=${trendDev.r2}) — marché extensible mais pas encore en bulle caractérisée. La vigilance s'impose.` });
    } else if (dev < -20) {
      signals.push({ emoji:"📉", color:"#22c55e",
        label:`Prix sous la tendance (${dev.toFixed(0)}%)`,
        detail:`Compression de ${Math.abs(dev).toFixed(0)}% sous la tendance historique (R²=${trendDev.r2}) — possible opportunité de retour à la moyenne si les fondamentaux sont sains.` });
    }
  }

  // ── Profil global
  let profile = "Profil standard", profileColor = "#8b949e", profileEmoji = "📊", horizon = "—";

  if (isRestructuring) {
    profile = "Restructuration spéculative"; profileColor = "#a78bfa"; profileEmoji = "🔄";
    horizon = "Horizon 2-3 ans minimum · Risque de perte totale";
  } else if (gValorisation != null && gValorisation <= 2.5 && change52w != null && change52w > 0.10) {
    profile = "Marché en excès"; profileColor = "#ef4444"; profileEmoji = "🫧";
    horizon = "Attendre un point d'entrée plus favorable";
  } else if (pb != null && pb < 0.8 && netMargin != null && netMargin > 0) {
    profile = "Value — décote sur actifs"; profileColor = "#22c55e"; profileEmoji = "💎";
    horizon = "Horizon 1-2 ans · Surveiller le retournement";
  } else if (globalScore != null && globalScore >= 6.5) {
    profile = "Fondamentaux solides"; profileColor = "#22c55e"; profileEmoji = "✅";
    horizon = "Long terme · Entrée progressive possible";
  } else if (gSante != null && gSante <= 2.5) {
    profile = "Fragilité financière"; profileColor = "#f97316"; profileEmoji = "⚠️";
    horizon = "Spéculatif · Taille de position réduite";
  }

  // ── Override pour les indices de marché ──────────────────────
  if (qt === "INDEX") {
    if (pe != null && pe > 25) {
      profile = "Marché en excès"; profileColor = "#ef4444"; profileEmoji = "🫧";
      horizon = "Vigilance — valorisation historiquement élevée";
    } else if (pe != null && pe > 20) {
      profile = "Valorisation tendue"; profileColor = "#f59e0b"; profileEmoji = "⚠️";
      horizon = "Surveiller les révisions de bénéfices et les taux";
    } else if (change52w != null && change52w > 0.20) {
      profile = "Marché haussier prolongé"; profileColor = "#f59e0b"; profileEmoji = "📈";
      horizon = "Surveiller les données macro et le P/E";
    } else {
      profile = "Indice de marché"; profileColor = "#fbbf24"; profileEmoji = "📊";
      horizon = "Analyse technique disponible";
    }
  }

  // ── Synthèse cycle × fondamentaux ────────────────────────────
  if (sw != null) {
    if (sw.optimalUT.label !== "—") {
      horizon = `${sw.optimalUT.label} · ${sw.optimalUT.horizon}`;
    }
    if (sw.cycleTurn === "trough" && globalScore != null && globalScore >= 5.5) {
      // Ne pas afficher "Timing favorable" si la tendance de fond est baissière
      // (Death Cross actif) — contradiction avec EntryRecommendationPanel
      const isBearishTrend = sw.sine > 0.2 && sw.momentum14 < -5;
      if (!isBearishTrend) {
        signals.push({ emoji:"🎯", color:"#22c55e",
          label:"Timing favorable — creux de cycle",
          detail:`Score fondamental ${globalScore.toFixed(1)}/10 + retournement de cycle haussier → configuration d'entrée potentiellement optimale.` });
      } else {
        signals.push({ emoji:"🔍", color:"#60a5fa",
          label:"Creux de cycle détecté — mais tendance baissière active",
          detail:`Score fondamental ${globalScore.toFixed(1)}/10. Creux cyclique présent mais la tendance de fond reste baissière — rebond tactique possible uniquement, pas une opportunité d'entrée longue.` });
      }
    } else if (sw.cycleTurn === "peak" && gValorisation != null && gValorisation <= 3.5) {
      signals.push({ emoji:"⏸️", color:"#f59e0b",
        label:"Timing défavorable — sommet de cycle",
        detail:`Valorisation tendue (score ${gValorisation.toFixed(1)}/5) + cycle en retournement baissier → attendre le prochain creux pour entrer en position.` });
    }
    if (sw.momentum14 < -10 && gSante != null && gSante >= 5) {
      signals.push({ emoji:"🔍", color:"#60a5fa",
        label:"Correction sur fondamentaux solides",
        detail:`Momentum de ${sw.momentum14.toFixed(1)}% malgré une santé financière saine — correction potentiellement temporaire à surveiller.` });
    }
    if (sw.mode === "trending" && sw.momentum14 > 8 && globalScore != null && globalScore >= 6) {
      signals.push({ emoji:"🚀", color:"#22c55e",
        label:"Tendance forte + fondamentaux",
        detail:`Titre en tendance avec un momentum de +${sw.momentum14.toFixed(1)}% et un score fondamental de ${globalScore.toFixed(1)}/10 — contexte porteur.` });
    }
  }

  if (signals.length === 0) return null;
  return { profile, profileColor, profileEmoji, horizon, signals };
}

// ── TOOLTIP PÉDAGOGIQUE ────────────────────────────────────────
const _eduSubscribers = new Set<(open: boolean) => void>();

interface TooltipContent {
  title?: string;
  sections: {
    label: string;
    text: string;
    variant?: "default" | "good" | "bad" | "highlight";
  }[];
}

function Tooltip({ content, id: _id }: { content: TooltipContent; id: string }) {
  const [visible, setVisible]   = useState(false);
  const [pos, setPos]           = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [width, setWidth]       = useState(320);
  const wrapperRef              = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sub = (open: boolean) => { if (!open) setVisible(false); };
    _eduSubscribers.add(sub);
    return () => { _eduSubscribers.delete(sub); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        _eduSubscribers.forEach(s => s(false));
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !visible;
    _eduSubscribers.forEach(s => s(false));
    if (next) {
      const BUBBLE_W = 320, MARGIN = 8;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) {
        const isMobile = window.innerWidth < 480;
        if (isMobile) {
          const BUBBLE_H_MOBILE = 380;
          const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
          const spaceAbove = rect.top - MARGIN;
          // Si pas assez de place en bas mais assez en haut → afficher au-dessus
          const top = spaceBelow < BUBBLE_H_MOBILE && spaceAbove > spaceBelow
            ? Math.max(MARGIN, rect.top - BUBBLE_H_MOBILE - MARGIN)
            : rect.bottom + MARGIN;
          setWidth(window.innerWidth - MARGIN * 2);
          setPos({ top, left: MARGIN });
        } else {
          // Hauteur dynamique : on laisse le navigateur calculer,
          // mais on estime une hauteur max pour le repositionnement
          const BUBBLE_H_ESTIMATE = 380;
          let left = rect.right + MARGIN;
          let top  = rect.top;
          // Débordement à droite → passer à gauche du bouton
          if (left + BUBBLE_W > window.innerWidth - MARGIN)
            left = rect.left - BUBBLE_W - MARGIN;
          // Débordement à gauche (si l'élément est tout à gauche)
          if (left < MARGIN) left = MARGIN;
          // Débordement en bas → remonter le tooltip
          if (top + BUBBLE_H_ESTIMATE > window.innerHeight - MARGIN)
            top = window.innerHeight - BUBBLE_H_ESTIMATE - MARGIN;
          // Débordement en haut → forcer à MARGIN
          if (top < MARGIN) top = MARGIN;
          setWidth(BUBBLE_W);
          setPos({ top, left });
        }
      }
      setVisible(true);
    }
  };

  const variantColor = (v?: string) =>
    v === "good"      ? THEME.scoreGreen  :
    v === "bad"       ? THEME.scoreRed    :
    v === "highlight" ? THEME.accent      :
                        THEME.textSecondary;

  return (
    <div ref={wrapperRef} style={{ position: "relative", display: "inline-flex", alignItems: "center", zIndex: visible ? 1000 : "auto" }}>
      <button
        onClick={handleOpen}
        style={{
          background:    visible ? THEME.borderMid : THEME.bgCard,
          border:        `1px solid ${THEME.borderMid}`,
          borderRadius:  "50%",
          width: 18, height: 18,
          cursor:        "pointer",
          fontSize:      10, fontWeight: 800,
          color:         THEME.textMuted,
          display:       "flex", alignItems: "center", justifyContent: "center",
          flexShrink:    0,
          position:      "relative",
          zIndex:        10,
          transition:    "all .15s",
          padding:       0,
        }}
        title="En savoir plus"
      >?</button>
      {visible && (
        <div style={{
          position:     "fixed",
          top:          pos.top,
          left:         pos.left,
          width,
          background:   THEME.bgPanel,
          border:       `1px solid ${THEME.borderMid}`,
          borderRadius: 10,
          padding:      "14px 16px",
          zIndex:       1000,
          boxShadow:    "0 8px 32px #000a",
          fontSize:     11,
          lineHeight:   1.7,
          color:        THEME.textSecondary,
        }}>
          {content.title && (
            <div style={{ color: THEME.accent, fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
              📚 {content.title}
            </div>
          )}
          {content.sections.map((sec, i) => (
            <div key={i} style={{
              marginBottom: i < content.sections.length - 1 ? 10 : 0,
              background:   sec.variant === "highlight" ? THEME.bgCard : "transparent",
              borderLeft:   sec.variant === "highlight" ? `3px solid ${THEME.accent}` : "none",
              padding:      sec.variant === "highlight" ? "8px 10px" : "0",
              borderRadius: sec.variant === "highlight" ? 6 : 0,
            }}>
              <div style={{ color: variantColor(sec.variant), fontWeight: 600, marginBottom: 3 }}>
                {sec.label}
              </div>
              <div style={{ color: sec.variant === "highlight" ? THEME.textSecondary : THEME.textSecondary }}>
                {sec.text}
              </div>
            </div>
          ))}
          <button
            onClick={e => { e.stopPropagation(); _eduSubscribers.forEach(s => s(false)); }}
            style={{ marginTop: 10, fontSize: 9, color: THEME.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >▲ fermer</button>
        </div>
      )}
    </div>
  );
}

function EduTooltip({ edu, id }: { edu: TechSignal["edu"]; id: string }) {
  const sections: TooltipContent["sections"] = [
    { label: "C'est quoi ?",       text: edu.concept,   variant: "default"   },
    { label: "Comment le lire ?",  text: edu.howToRead, variant: "default"   },
  ];
  if (edu.good) sections.push({ label: "✅ Bon signe",      text: edu.good, variant: "good" });
  if (edu.bad)  sections.push({ label: "⚠️ Mauvais signe", text: edu.bad,  variant: "bad"  });
  if (edu.example) sections.push({ label: "Dans ce cas précis", text: edu.example, variant: "highlight" });
  const content: TooltipContent = {
    title: "Comprendre cet indicateur",
    sections,
  };
  return <Tooltip content={content} id={id} />;
}


// ── COMPOSANT PANEL RÉUTILISABLE ──────────────────────────────
interface PanelProps {
  icon:         string;
  title:        string;
  badge?:       { label: string; color: string };
  badge2?:      { label: string; color: string };
  badge3?:      { label: string; color: string };
  rightLabel?:  string;
  rightValue?:  { label: string; value: string; color: string };
  confidence?:  number;
  borderColor?: string;
  bgColor?:     string;
  children:     React.ReactNode;
  defaultOpen?: boolean;
}

function Panel({ icon, title, badge, badge2, badge3, rightLabel, rightValue, confidence, borderColor, bgColor, children, defaultOpen = true }: PanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const border = borderColor ? `1px solid ${borderColor}55` : `1px solid ${THEME.borderPanel}`;
  const bg     = bgColor ?? THEME.bgPanel;
  return (
    <div style={{
      background:   bg,
      border,
      borderRadius: 12,
      padding:      "14px 18px",
      marginBottom: 10,
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          cursor:         "pointer",
          marginBottom:   open ? (confidence != null ? 0 : 12) : 0,
          flexWrap:       "wrap",
          gap:            8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{
            fontSize:      12,
            fontWeight:    800,
            color:         THEME.textPrimary,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}>
            {icon} {title}
          </span>
          {badge && (
            <span style={{
              fontSize:     11,
              fontWeight:   800,
              color:        badge.color,
              background:   badge.color + "22",
              borderRadius: 4,
              padding:      "2px 8px",
            }}>
              {badge.label}
            </span>
          )}
          {badge2 && (
            <span style={{
              fontSize:     11,
              fontWeight:   700,
              color:        badge2.color,
              background:   badge2.color + "22",
              borderRadius: 4,
              padding:      "2px 8px",
            }}>
              {badge2.label}
            </span>
          )}
          {badge3 && (
            <span style={{
              fontSize:     11,
              fontWeight:   700,
              color:        badge3.color,
              background:   badge3.color + "22",
              borderRadius: 4,
              padding:      "2px 8px",
            }}>
              {badge3.label}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          {rightValue && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: THEME.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>
                {rightValue.label}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: rightValue.color }}>
                {rightValue.value}
              </div>
            </div>
          )}
          {rightLabel && (
            <span style={{ fontSize: 10, color: THEME.textMuted }}>{rightLabel}</span>
          )}
          <span style={{ fontSize: 10, color: THEME.textMuted }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>
      {confidence != null && (
        <div style={{ height: 3, background: THEME.borderPanel, borderRadius: 2, margin: open ? "10px 0 12px" : "10px 0 0", overflow: "hidden" }}>
          <div style={{ width: `${confidence}%`, height: "100%", background: borderColor ?? THEME.accent, borderRadius: 2 }}/>
        </div>
      )}
      {open && children}
    </div>
  );
}

// ── COMPOSANT ENCART TECHNIQUE ────────────────────────────────
function TechnicalPanel({ precomputed, context }: { precomputed: { signals: TechSignal[]; sinewave: SinewaveResult | null }; context?: MarketContext | null }) {
  const { signals, sinewave } = precomputed;
  if (signals.length === 0) return null;

  const bulls  = signals.filter((s: TechSignal) => s.strength === "bull").length;
  const bears  = signals.filter((s: TechSignal) => s.strength === "bear").length;
  const total  = bulls + bears;

  // ── Phrase de synthèse ──────────────────────────────────────
  const hasDeathCross  = signals.some(s => s.label === "Death Cross");
  const hasGoldenCross = signals.some(s => s.label === "Golden Cross");
  const hasDivBull     = context?.divergence?.type === "bullish";
  const hasDivBear     = context?.divergence?.type === "bearish";
  const adxVal         = context?.adx ?? null;

  const synthPhrase = (() => {
    if (total === 0) return null;
    if (bears >= bulls * 2 && hasDeathCross)
      return "La majorité des oscillateurs est baissière et un Death Cross est actif — pression vendeuse structurelle.";
    if (bears >= bulls * 2 && hasDivBull)
      return "Les oscillateurs penchent baissier mais une divergence haussière RSI signale un possible essoufflement de la baisse.";
    if (bears > bulls)
      return adxVal != null && adxVal > 35
        ? "Prédominance baissière dans un contexte de tendance forte (ADX élevé) — confirme la pression vendeuse."
        : "Plus d'oscillateurs baissiers que haussiers — prudence à court terme.";
    if (bulls >= bears * 2 && hasGoldenCross)
      return "Majorité d'oscillateurs haussiers et Golden Cross actif — configuration technique favorable.";
    if (bulls >= bears * 2 && hasDivBear)
      return "Les oscillateurs sont majoritairement haussiers mais une divergence baissière RSI tempère l'optimisme.";
    if (bulls > bears)
      return adxVal != null && adxVal > 35
        ? "Prédominance haussière dans une tendance forte (ADX élevé) — momentum directionnel confirmé."
        : "Plus d'oscillateurs haussiers que baissiers — setup technique positif.";
    return "Signaux techniques mixtes — pas de biais directionnel clair à ce stade.";
  })();

  const bullSignals    = signals.filter(s => s.strength === "bull");
  const bearSignals    = signals.filter(s => s.strength === "bear");
  const neutralSignals = signals.filter(s => s.strength === "neutral");

  const SignalRow = ({ s, idx }: { s: TechSignal; idx: number }) => (
    <div style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 10px", background:THEME.bgCardAlt, borderRadius:6, borderLeft:`2px solid ${s.color}` }}>
      <span style={{ fontSize:12, flexShrink:0 }}>{s.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: s.color, lineHeight: 1.4 }}>
          {s.plain}
        </div>
        <div style={{ fontSize: 9, color: THEME.textSecondary,
                      fontFamily: "'IBM Plex Mono',monospace", marginTop: 3 }}>
          {s.label} · {s.detail}
        </div>
      </div>
      <EduTooltip edu={s.edu} id={`tech-${idx}`}/>
    </div>
  );

  return (
    <Panel
      icon="📊"
      title="Signaux oscillateurs"
      badge2={{ label: `${bulls} +`, color: THEME.scoreGreen }}
      badge3={{ label: `${bears} -`, color: THEME.scoreRed }}
      rightLabel={`/ ${total}`}
      defaultOpen={true}
    >
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>

        {/* ── Unité de temps optimale ── */}
        {sinewave && (
          <div style={{ background:THEME.bgCard, borderRadius:8, padding:"10px 14px", borderLeft:`3px solid ${THEME.accent}` }}>
            <div style={{ fontSize:9, color:THEME.accent, textTransform:"uppercase", letterSpacing:1.5, fontWeight:800, marginBottom:5 }}>
              🕐 Unité de temps optimale
            </div>
            <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"flex-start" }}>
              <div style={{ minWidth:130 }}>
                <div style={{ fontSize:12, fontWeight:800, color:THEME.textPrimary }}>{sinewave.optimalUT.label}</div>
                <div style={{ fontSize:10, color:THEME.textSecondary, marginTop:2 }}>{sinewave.optimalUT.horizon}</div>
              </div>
              <div style={{ flex:1, fontSize:10, color:THEME.textSecondary, lineHeight:1.6, borderLeft:`1px solid ${THEME.borderMid}`, paddingLeft:14 }}>
                {sinewave.optimalUT.note}
              </div>
            </div>
          </div>
        )}

        {/* ── Grille haussier / baissier ── */}
        {(bullSignals.length > 0 || bearSignals.length > 0) ? (
          <div style={{ display:"flex", flexDirection:"column", gap:12, overflow:"hidden" }}>
            {/* Colonne haussière */}
            <div style={{ width:"100%" }}>
              <div style={{ fontSize:10, color:THEME.scoreGreen, textTransform:"uppercase", letterSpacing:1.2, fontWeight:800, marginBottom:6 }}>
                ✅ Points positifs ({bullSignals.length})
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {bullSignals.length === 0
                  ? <div style={{ fontSize:10, color:THEME.textMuted, padding:"6px 0" }}>—</div>
                  : bullSignals.map((s, i) => <SignalRow key={i} s={s} idx={i} />)
                }
              </div>
            </div>
            {/* Colonne baissière */}
            <div style={{ width:"100%" }}>
              <div style={{ fontSize:10, color:THEME.scoreRed, textTransform:"uppercase", letterSpacing:1.2, fontWeight:800, marginBottom:6 }}>
                ⚠️ Points négatifs ({bearSignals.length})
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {bearSignals.length === 0
                  ? <div style={{ fontSize:10, color:THEME.textMuted, padding:"6px 0" }}>—</div>
                  : bearSignals.map((s, i) => <SignalRow key={i} s={s} idx={bullSignals.length + i} />)
                }
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize:12, color:THEME.textMuted, padding:"8px 0" }}>
            Aucun signal directionnel fort à ce stade.
          </div>
        )}

        {/* ── Contexte (signaux neutres) ── */}
        {neutralSignals.length > 0 && (
          <div style={{ borderTop:`1px solid ${THEME.borderSubtle}`, paddingTop:8 }}>
            <div style={{ fontSize:9, color:"#a78bfa", textTransform:"uppercase", letterSpacing:1.2, fontWeight:800, marginBottom:6 }}>
              Contexte ({neutralSignals.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, width: "100%" }}>
              {neutralSignals.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px",
                  background: THEME.bgCard,
                  borderRadius: 8,
                  borderLeft: "3px solid #a78bfa",
                  flex: "1 1 200px",
                  minWidth: 0,
                  boxSizing: "border-box",
                  overflow: "visible",
                }}>
                  <span style={{ fontSize: 12, flexShrink: 0 }}>{s.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: THEME.textPrimary,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis" }}>
                      {s.plain}
                    </div>
                    <div style={{ fontSize: 9, color: THEME.textMuted,
                                  fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}>
                      {s.label}
                    </div>
                  </div>
                  <EduTooltip edu={s.edu} id={`tech-ctx-${i}`}/>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Synthèse ── */}
        {synthPhrase && (
          <div style={{ padding:"10px 14px", background:THEME.bgCard, borderRadius:8, borderLeft:"3px solid #4a90d9" }}>
            <div style={{ fontSize:9, color:"#4a90d9", textTransform:"uppercase", letterSpacing:1.5, fontWeight:800, marginBottom:5 }}>
              Synthèse —{" "}
              <span style={{ color: THEME.scoreGreen, fontWeight: 800 }}>{bulls}+</span>
              <span style={{ color: THEME.textMuted }}> · </span>
              <span style={{ color: THEME.scoreRed, fontWeight: 800 }}>{bears}-</span>
              <span style={{ color: THEME.textMuted }}> / {total}</span>
            </div>
            <div style={{ fontSize:11, color:THEME.textSecondary, lineHeight:1.7 }}>{synthPhrase}</div>
          </div>
        )}

        <div style={{ fontSize:9, color:THEME.textMuted }}>
          RSI/MACD calculés sur les prix de clôture · Moyennes mobiles sur données journalières (ou hebdomadaires si insuffisant)
        </div>
      </div>
    </Panel>
  );
}

// ── COMPOSANT ENCART SITUATIONNEL ────────────────────────────
function SituationalPanel({ metrics, closes }: { metrics: any; closes?: (number|null)[] }) {
  const sw       = closes && closes.length > 0 ? calcSinewave(closes) : null;
  const trendDev = closes && closes.length > 0 ? calcTrendDeviation(closes) : null;
  const ctx = computeSituationalContext(metrics, sw, trendDev);
  if (!ctx) return null;

  const labels = ctx.signals.map(s => s.label);
  const hasSureval  = labels.some(l => l.includes("Surévaluation"));
  const hasBulle    = labels.some(l => l.includes("bulle") || l.includes("Bulle"));
  const hasDecote   = labels.some(l => l.includes("Décote"));
  const hasRestruct = labels.some(l => l.includes("restructuration") || l.includes("Restructuration"));
  const hasShort    = labels.some(l => l.includes("Short") || l.includes("short"));
  const hasLiquid   = labels.some(l => l.includes("Liquidité") || l.includes("liquidité"));
  const hasFCF      = labels.some(l => l.includes("Free Cash Flow") || l.includes("FCF"));
  const n = ctx.signals.length;

  const sitPhrase = (() => {
    if (n === 0) return null;
    if (hasSureval && hasBulle)
      return "Valorisation extrême associée à une dynamique de bulle — profil spéculatif à risque élevé.";
    if (hasDecote && hasFCF)
      return "Décote sur les actifs combinée à un Free Cash Flow positif — profil valeur avec protection relative.";
    if (hasRestruct && hasShort)
      return "Entreprise en restructuration avec un short ratio élevé — situation binaire à surveiller de près.";
    if (hasLiquid)
      return "Risque de liquidité identifié — capacité à honorer les engagements court terme à vérifier.";
    if (hasDecote)
      return "Décote sur les actifs détectée — potentiel de revalorisation si les fondamentaux opérationnels se confirment.";
    return `${n > 1 ? "signaux" : "signal"} situationnel${n > 1 ? "s" : ""} identifié${n > 1 ? "s" : ""} — consulter le détail ci-dessus.`;
  })();

  return (
    <Panel
      icon="⚡"
      title="Contexte d'investissement"
      badge={{ label: `${ctx.profileEmoji} ${ctx.profile}`, color: ctx.profileColor }}
      borderColor={ctx.profileColor}
      defaultOpen={true}
    >
      <div>
        <div style={{ fontSize:11, color:ctx.profileColor, fontWeight:600, marginBottom:10, padding:"6px 10px", background:ctx.profileColor+"11", borderRadius:6 }}>
          🕐 {ctx.horizon}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {ctx.signals.map((s, i) => (
            <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 10px", background:THEME.bgCard, borderRadius:8, borderLeft:`3px solid ${s.color}` }}>
              <span style={{ fontSize:13, flexShrink:0 }}>{s.emoji}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:s.color }}>{s.label}</div>
                <div style={{ fontSize:11, color:THEME.textSecondary, marginTop:2, lineHeight:1.5 }}>{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
        {sitPhrase && (
          <div style={{ marginTop:10, padding:"10px 14px", background:THEME.bgCard, borderRadius:8, borderLeft:`3px solid ${ctx.profileColor}` }}>
            <div style={{ fontSize:9, color:ctx.profileColor, textTransform:"uppercase", letterSpacing:1.5, fontWeight:800, marginBottom:5 }}>
              Synthèse — {n} {n > 1 ? "signaux" : "signal"}
            </div>
            <div style={{ fontSize:11, color:THEME.textSecondary, lineHeight:1.7 }}>{sitPhrase}</div>
          </div>
        )}
        <div style={{ fontSize:9, color:THEME.textMuted, marginTop:8 }}>
          ⚠️ Ces signaux sont informatifs et non contractuels. Tout investissement comporte un risque de perte en capital.
        </div>
      </div>
    </Panel>
  );
}

// ════════════════════════════════════════════════════════════════
// COUCHE 4 — UI (composants React)
// ════════════════════════════════════════════════════════════════
function TypeBadge({ type }: { type?: string }) {
  const b = getBadge(type);
  return (
    <span style={{
      background:b.bg, color:b.color, border:`1px solid ${b.color}66`,
      borderRadius:4, fontSize:10, fontWeight:800,
      padding:"2px 7px", letterSpacing:1.2, textTransform:"uppercase",
      verticalAlign:"middle", marginLeft:10,
    }}>{b.label}</span>
  );
}

// ── GRAPHIQUE INTERACTIF ─────────────────────────────────────────
interface ChartData {
  closes:     (number | null)[];
  timestamps: number[];
}

// ── GRAPHIQUE TECHNIQUE EN CHANDELIERS ──────────────────────────
type OverlayKey = "bb" | "ema20" | "ema50" | "ema200" | "target" | "regression";

const OVERLAYS_EDU: { key: string; label: string; color: string; edu: TechSignal["edu"] }[] = [
  { key: "bb", label: "BB — Bandes de Bollinger", color: "#f59e0b", edu: {
    concept: "Les Bandes de Bollinger (BB) sont trois lignes tracées autour du prix : une moyenne mobile centrale (20 périodes) et deux bandes à ±2 écarts-types. Elles mesurent la volatilité du marché.",
    howToRead: "Bandes resserrées = faible volatilité, mouvement fort imminent (squeeze). Bandes écartées = forte volatilité en cours. Le prix touche la bande supérieure = zone de surachat potentielle. Bande inférieure = zone de survente potentielle.",
    example: "Quand le prix sort franchement au-dessus de la bande supérieure avec du volume, c'est souvent le début d'un mouvement fort — pas forcément un signal de vente immédiat.",
  }},
  { key: "ema20", label: "EMA 20", color: "#22c55e", edu: {
    concept: "L'EMA 20 (Exponential Moving Average sur 20 périodes) est la moyenne des 20 derniers prix avec plus de poids sur les données récentes. Elle suit le prix de près.",
    howToRead: "Prix au-dessus de l'EMA 20 = momentum court terme haussier. Prix en dessous = momentum baissier court terme. L'EMA 20 sert souvent de support dynamique en tendance haussière.",
    example: "En tendance haussière, les corrections jusqu'à l'EMA 20 sont souvent des opportunités d'achat. Un cassage en clôture sous l'EMA 20 est le premier signal d'alerte.",
  }},
  { key: "ema50", label: "EMA 50", color: "#60a5fa", edu: {
    concept: "L'EMA 50 représente la tendance intermédiaire sur ~50 séances (~2,5 mois en journalier). C'est un filtre de tendance moyen terme très utilisé par les traders professionnels.",
    howToRead: "Prix au-dessus de l'EMA 50 = tendance moyen terme haussière. En dessous = baissière. L'EMA 50 agit comme support/résistance dynamique plus fiable que l'EMA 20 car elle filtre plus de bruit.",
    example: "Un rebond sur l'EMA 50 dans une tendance haussière (Golden Cross actif) est une configuration d'entrée classique avec un ratio risque/rendement favorable.",
  }},
  { key: "ema200", label: "EMA 200", color: "#a78bfa", edu: {
    concept: "L'EMA 200 représente la tendance de fond sur ~200 séances (~1 an en journalier). C'est l'indicateur de référence pour déterminer si un actif est en tendance haussière ou baissière structurelle.",
    howToRead: "Prix au-dessus de l'EMA 200 = tendance haussière long terme. En dessous = contexte baissier. Golden Cross (EMA 50 > EMA 200) = signal haussier majeur. Death Cross = signal baissier majeur.",
    example: "L'EMA 200 est utilisée par les fonds institutionnels pour filtrer les actifs. Un prix qui revient tester l'EMA 200 depuis le haut est souvent une opportunité d'entrée en tendance haussière.",
  }},
  { key: "regression", label: "Régression linéaire", color: "#fb923c", edu: {
    concept: "La droite de régression log-linéaire représente la trajectoire 'naturelle' du prix sur toute la période affichée. Elle lisse les cycles pour révéler la tendance de fond réelle.",
    howToRead: "Prix au-dessus de la ligne = actif cher par rapport à sa tendance historique. En dessous = actif décoté. Plus le prix s'éloigne de la ligne, plus un retour vers la moyenne est probable. Le R² indique la fiabilité (1 = parfait, 0 = bruit pur).",
    example: "Historiquement, les actifs reviennent vers leur droite de régression après des excès. Une déviation de +50% au-dessus précède souvent une correction, une déviation de -30% en dessous précède souvent un rebond.",
  }},
  { key: "target", label: "Target — Objectif de breakout", color: "#ef4444", edu: {
    concept: "L'objectif de breakout (Target) est une cible de prix calculée automatiquement quand le prix sort d'un range de consolidation. La cible = amplitude du range projetée depuis le point de cassure.",
    howToRead: "Ligne verte = objectif haussier. Ligne rouge = objectif baissier. La cible est valide environ 30 bougies après le breakout — passé ce délai, elle est invalidée.",
    example: "Si un actif consolide entre 100 et 120 (range de 20) puis casse au-dessus de 120, l'objectif de breakout est 140. Ce n'est pas garanti — c'est une cible indicative.",
  }},
  { key: "momentum", label: "Momentum ROC", color: "#60a5fa", edu: {
    concept: "Le Momentum ROC (Rate of Change) mesure la variation du prix sur les 14 dernières bougies en pourcentage. Il capture la vitesse et la direction du mouvement récent — plus simple et plus direct que le RSI.",
    howToRead: "Au-dessus de +5% : élan haussier — les acheteurs accélèrent. En dessous de -5% : élan baissier — les vendeurs dominent. Proche de 0 : marché sans direction. Un changement de signe (passage de positif à négatif ou inversement) peut précéder un retournement de prix.",
    example: "Si le ROC était à +12% il y a 3 bougies et est maintenant à +2%, la hausse ralentit fortement même si le prix monte encore — signal d'essoufflement à surveiller avant de prendre position.",
  }},
  { key: "sinewave", label: "Sinewave (Ehlers)", color: "#ef4444", edu: {
    concept: "Le Sinewave d'Ehlers utilise la transformée de Hilbert pour décomposer le prix en composantes cycliques. Il détecte la phase du marché (en cycle ou en tendance) et identifie les retournements cycliques avec plus de précision que les oscillateurs classiques.",
    howToRead: "Quand la ligne Sine (rouge) croise la LeadSine (rouge atténué) vers le haut depuis le bas = creux de cycle = signal haussier. Vers le bas depuis le haut = sommet de cycle = signal baissier. Quand les deux lignes évoluent en parallèle sans se croiser = marché en tendance directionnelle (pas en cycle).",
    example: "Un creux de cycle Sinewave qui coïncide avec un RSI sous 35 et une structure de prix haussière (HH+HL) est l'une des configurations d'entrée les plus solides — les trois indicateurs convergent vers le même signal.",
  }},
  { key: "leadsine", label: "LeadSine (Ehlers)", color: "#ef444488", edu: {
    concept: "La LeadSine est une version avancée de 45° de la Sinewave. Elle anticipe le retournement d'un quart de cycle avant qu'il ne se produise sur la Sinewave principale — d'où son nom 'Lead' (avance).",
    howToRead: "La LeadSine ne s'utilise pas seule — elle sert uniquement comme référence pour détecter le croisement avec la Sinewave. Croisement Sine au-dessus de LeadSine = début de phase haussière. Sine sous LeadSine = début de phase baissière.",
    example: "Quand on voit la Sinewave rouge passer au-dessus de la LeadSine dans la zone basse du sous-panel, c'est le signal de retournement cyclique haussier — c'est ce croisement précis qu'il faut surveiller.",
  }},
];

function CandleChart({
  chartData,
  currency,
  breakoutTarget,
  period,
  periods,
  displayLimit,
}: {
  chartData: {
    closes:     (number|null)[];
    opens:      (number|null)[];
    highs:      (number|null)[];
    lows:       (number|null)[];
    volumes:    (number|null)[];
    timestamps: number[];
  } | null;
  currency:      string;
  breakoutTarget?: { hasTarget: boolean; targetPrice: number | null; direction: "up" | "down" | null } | null;
  period?:       string;
  periods?:      { key: string; label: string }[];
  displayLimit?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayKey>>(
    new Set(["bb", "ema20", "ema50", "ema200", "target"] as OverlayKey[])
  );
  const [tooltip, setTooltip] = useState<{
    x: number; o: number; h: number; l: number; c: number; v: number; date: string;
  } | null>(null);

  const toggleOverlay = (key: OverlayKey) => {
    setActiveOverlays(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (!chartData) return (
    <div style={{ color: THEME.textMuted, fontSize: 12, padding: "30px 0", textAlign: "center" }}>
      Données OHLCV indisponibles
    </div>
  );

  const { closes, opens, highs, lows, volumes, timestamps } = chartData;

  // Bougies valides
  const candles: { o:number; h:number; l:number; c:number; v:number; ts:number; origIdx:number }[] = [];
  for (let i = 0; i < closes.length; i++) {
    const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
    if (o != null && h != null && l != null && c != null) {
      candles.push({ o, h, l, c, v: volumes[i] ?? 0, ts: timestamps[i] ?? 0, origIdx: i });
    }
  }
  if (candles.length < 10) return (
    <div style={{ color: THEME.textMuted, fontSize: 12, padding: "30px 0", textAlign: "center" }}>
      Données insuffisantes (minimum 10 bougies OHLC)
    </div>
  );

  const MAX_DISPLAY = displayLimit ?? 120;
  const display = candles.length > MAX_DISPLAY ? candles.slice(-MAX_DISPLAY) : candles;
  const N       = display.length;

  // Overlays calculés sur les bougies affichées uniquement → EMA démarre dès la 1ère bougie visible
  // Overlays calculés sur le dataset complet → EMA/BB convergés avant la première
  // bougie affichée, comme sur TradingView. L'accès se fait via d.origIdx.
  const bb      = calcBollingerBands(closes);
  const ema20S  = calcEMASeries(closes, 20);
  const ema50S  = calcEMASeries(closes, 50);
  const ema200S = calcEMASeries(closes, 200);
  // displayCloses utilisé uniquement pour la régression (fenêtre visible)
  const displayCloses = display.map(d => d.c as number | null);
  const reg = calcRegressionDeviation(displayCloses);
  const swData    = calcSinewave(closes);

  // Sinewave series pour le sous-panel
  const sineSeriesDisplay: (number|null)[] = new Array(N).fill(null);
  const leadSeriesDisplay: (number|null)[] = new Array(N).fill(null);
  const momSeriesDisplay:  (number|null)[] = new Array(N).fill(null);
  (() => {
    const c = closes.filter((v): v is number => v != null);
    if (c.length < 50) return;
    const last120 = display.map(d => d.c);
    // ROC-14 momentum sur les 120 dernières bougies
    for (let i = 14; i < last120.length; i++) {
      const roc = ((last120[i] - last120[i - 14]) / last120[i - 14]) * 100;
      momSeriesDisplay[i] = parseFloat(roc.toFixed(2));
    }
    // Sinewave sur toutes les closes valides, puis extraire les 120 dernières
    const N2 = c.length;
    const sp = new Array(N2).fill(0);
    for (let i = 3; i < N2; i++) sp[i] = (c[i] + 2*c[i-1] + 2*c[i-2] + c[i-3]) / 6;
    const Per = new Array(N2).fill(10), Smp = new Array(N2).fill(10);
    const Det = new Array(N2).fill(0), Q1 = new Array(N2).fill(0);
    const I1 = new Array(N2).fill(0), jI = new Array(N2).fill(0), jQ = new Array(N2).fill(0);
    const I2 = new Array(N2).fill(0), Q2 = new Array(N2).fill(0);
    const Re = new Array(N2).fill(0), Im = new Array(N2).fill(0);
    const Ph = new Array(N2).fill(0), Sn = new Array(N2).fill(0), LSn = new Array(N2).fill(0);
    for (let i = 10; i < N2; i++) {
      const a = 0.075 * Smp[i-1] + 0.54;
      Det[i] = (0.0962*sp[i]+0.5769*sp[i-2]-0.5769*sp[i-4]-0.0962*sp[i-6])*a;
      Q1[i]  = (0.0962*Det[i]+0.5769*Det[i-2]-0.5769*Det[i-4]-0.0962*Det[i-6])*a;
      I1[i]  = Det[i-3];
      jI[i]  = 0.33*I1[i]+0.67*I1[i-1];
      jQ[i]  = 0.33*Q1[i]+0.67*Q1[i-1];
      I2[i]  = 0.2*(I1[i]-jQ[i])+0.8*I2[i-1];
      Q2[i]  = 0.2*(Q1[i]+jI[i])+0.8*Q2[i-1];
      Re[i]  = 0.2*(I2[i]*I2[i-1]+Q2[i]*Q2[i-1])+0.8*Re[i-1];
      Im[i]  = 0.2*(I2[i]*Q2[i-1]-Q2[i]*I2[i-1])+0.8*Im[i-1];
      let p  = Per[i-1];
      if (Im[i]!==0&&Re[i]!==0){const ang=Math.atan(Im[i]/Re[i]);if(ang!==0)p=2*Math.PI/Math.abs(ang);}
      if(p>1.5*Per[i-1])p=1.5*Per[i-1];if(p<0.67*Per[i-1])p=0.67*Per[i-1];
      if(p<6)p=6;if(p>50)p=50;
      Per[i]=p; Smp[i]=0.33*p+0.67*Smp[i-1];
      Ph[i] = I1[i]!==0?(180/Math.PI)*Math.atan(Q1[i]/I1[i]):Ph[i-1];
      Sn[i] = Math.sin(Ph[i]*Math.PI/180);
      LSn[i]= Math.sin((Ph[i]+45)*Math.PI/180);
    }
    const validOrigIdxs   = candles.map(d => d.origIdx);
    const displayOrigIdxs = display.map(d => d.origIdx);
    displayOrigIdxs.forEach((origIdx, dispI) => {
      const posInValid = validOrigIdxs.indexOf(origIdx);
      if (posInValid >= 0 && posInValid < N2) {
        sineSeriesDisplay[dispI] = parseFloat(Sn[posInValid].toFixed(3));
        leadSeriesDisplay[dispI] = parseFloat(LSn[posInValid].toFixed(3));
      }
    });
  })();

  // ── DIMENSIONS ──
  const W = 800, HPRICE = 240, HOSC = 70, HVOL = 44;
  const PAD_L = 62, PAD_R = 14, PAD_T = 10, PAD_B = 20, SEP = 8;
  const chartW = W - PAD_L - PAD_R;

  // Échelle Y : highs/lows des bougies + extrêmes des overlays actifs dans la fenêtre
  const pricePts = display.flatMap(d => [d.h, d.l]).filter(v => v != null && isFinite(v));
  const overlayPts: number[] = [];
  if (activeOverlays.has("bb") && bb) {
    display.forEach(d => {
      const u = bb.upper[d.origIdx];
      const l = bb.lower[d.origIdx];
      if (u != null && isFinite(u)) overlayPts.push(u);
      if (l != null && isFinite(l)) overlayPts.push(l);
    });
  }
  if (activeOverlays.has("ema20")) {
    display.forEach(d => { const v = ema20S[d.origIdx]; if (v != null && isFinite(v)) overlayPts.push(v); });
  }
  if (activeOverlays.has("ema50")) {
    display.forEach(d => { const v = ema50S[d.origIdx]; if (v != null && isFinite(v)) overlayPts.push(v); });
  }
  if (activeOverlays.has("ema200")) {
    display.forEach(d => { const v = ema200S[d.origIdx]; if (v != null && isFinite(v)) overlayPts.push(v); });
  }
  const allPriceVals = [...pricePts, ...overlayPts];
  const yPriceMin = Math.min(...allPriceVals) * 0.9985;
  const yPriceMax = Math.max(...allPriceVals) * 1.0015;
  const yPriceRange = yPriceMax - yPriceMin || 1;

  const toX      = (i: number) => PAD_L + (i + 0.5) * (chartW / N);
  const toPriceY = (v: number) => PAD_T + HPRICE - ((v - yPriceMin) / yPriceRange) * HPRICE;

  // Y oscillateur
  const oscTop  = PAD_T + HPRICE + SEP + HVOL + SEP;
  const oscBot  = oscTop + HOSC;
  const toSineY  = (v: number) => oscTop + HOSC/2 - (v * HOSC/2);
  const toMomY   = (v: number) => {
    const clamped = Math.max(-30, Math.min(30, v));
    return oscTop + HOSC/2 - (clamped / 30) * (HOSC/2);
  };

  // Y volume
  const volTop  = PAD_T + HPRICE + SEP;
  const maxVol  = Math.max(...display.map(d => d.v), 1);
  const toVolY  = (v: number) => volTop + HVOL - (v / maxVol) * (HVOL - 2);

  // Candlestick width
  const cw = Math.max(2, Math.min(10, (chartW / N) * 0.72));

  // Ticks Y (5 niveaux prix)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = yPriceMin + (i / 4) * yPriceRange;
    return { val, y: toPriceY(val) };
  });

  // Ticks X (max 5)
  const xStep = Math.max(1, Math.floor(N / 5));
  const xTicks = display
    .filter((_, i) => i === 0 || i === N-1 || i % xStep === 0)
    .slice(0, 6)
    .map(d => {
      const date = new Date(d.ts * 1000);
      return { x: toX(display.indexOf(d)), label: date.toLocaleDateString("fr-FR", { month:"short", year:"2-digit" }) };
    });

  const fmtP = (n: number) => n >= 1000 ? n.toFixed(0) : n >= 10 ? n.toFixed(2) : n.toFixed(4);

  // Polyline builder
  const polyline = (vals: (number|null)[], toY: (v: number) => number) =>
    vals.map((v, i) => v != null ? `${toX(i)},${toY(v)}` : null)
        .filter(Boolean).join(" ");

  // Régression : droite de tendance
  // regY1 = point gauche (début de display), regY2 = point droit (trendPrice = fin)
  const regY1 = reg && reg.r2 >= 0.4
    ? toPriceY(display[0]?.c ?? reg.trendPrice)
    : null;
  const regY2 = reg && reg.r2 >= 0.4 ? toPriceY(reg.trendPrice) : null;

  // Breakout target
  const btY = breakoutTarget?.hasTarget && breakoutTarget.targetPrice != null
    ? toPriceY(breakoutTarget.targetPrice)
    : null;
  const btColor = breakoutTarget?.direction === "up" ? "#22c55e"
    : breakoutTarget?.direction === "down" ? "#ef4444"
    : THEME.textMuted;

  const totalH = oscBot + PAD_B;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const relX = svgX - PAD_L;
    if (relX < 0 || relX > chartW) { setTooltip(null); return; }
    const idx = Math.min(Math.max(Math.floor((relX / chartW) * N), 0), N-1);
    const d   = display[idx];
    const date = new Date(d.ts * 1000).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" });
    setTooltip({ x: toX(idx), o: d.o, h: d.h, l: d.l, c: d.c, v: d.v, date });
  };

  // ── OVERLAY DEFINITIONS (pills) ──
  const OVERLAYS: { key: OverlayKey; label: string; color: string; edu: TechSignal["edu"] }[] = [
    { key: "bb", label: "BB", color: "#f59e0b", edu: {
      concept: "Les Bandes de Bollinger (BB) sont trois lignes tracées autour du prix : une moyenne mobile centrale (20 périodes) et deux bandes à ±2 écarts-types. Elles mesurent la volatilité du marché.",
      howToRead: "Bandes resserrées = faible volatilité, mouvement fort imminent (squeeze). Bandes écartées = forte volatilité en cours. Le prix touche la bande supérieure = zone de surachat potentielle. Bande inférieure = zone de survente potentielle.",
      example: "Quand le prix sort franchement au-dessus de la bande supérieure avec du volume, c'est souvent le début d'un mouvement fort — pas forcément un signal de vente immédiat.",
    }},
    { key: "ema20", label: "EMA 20", color: "#22c55e", edu: {
      concept: "L'EMA 20 (Exponential Moving Average sur 20 périodes) est la moyenne des 20 derniers prix avec plus de poids sur les données récentes. Elle suit le prix de près.",
      howToRead: "Prix au-dessus de l'EMA 20 = momentum court terme haussier. Prix en dessous = momentum baissier court terme. L'EMA 20 sert souvent de support dynamique en tendance haussière.",
      example: "En tendance haussière, les corrections jusqu'à l'EMA 20 sont souvent des opportunités d'achat. Un cassage en clôture sous l'EMA 20 est le premier signal d'alerte.",
    }},
    { key: "ema50", label: "EMA 50", color: "#60a5fa", edu: {
      concept: "L'EMA 50 représente la tendance intermédiaire sur ~50 séances (~2,5 mois en journalier). C'est un filtre de tendance moyen terme très utilisé par les traders professionnels.",
      howToRead: "Prix au-dessus de l'EMA 50 = tendance moyen terme haussière. En dessous = baissière. L'EMA 50 agit comme support/résistance dynamique plus fiable que l'EMA 20 car elle filtre plus de bruit.",
      example: "Un rebond sur l'EMA 50 dans une tendance haussière (Golden Cross actif) est une configuration d'entrée classique avec un ratio risque/rendement favorable.",
    }},
    { key: "ema200", label: "EMA 200", color: "#a78bfa", edu: {
      concept: "L'EMA 200 représente la tendance de fond sur ~200 séances (~1 an en journalier). C'est l'indicateur de référence pour déterminer si un actif est en tendance haussière ou baissière structurelle.",
      howToRead: "Prix au-dessus de l'EMA 200 = tendance haussière long terme (contexte favorable aux achats). En dessous = contexte baissier. Golden Cross (EMA 50 > EMA 200) = signal haussier majeur. Death Cross = signal baissier majeur.",
      example: "L'EMA 200 est utilisée par les fonds institutionnels pour filtrer les actifs. Un prix qui revient tester l'EMA 200 depuis le haut est souvent une opportunité d'entrée en tendance haussière.",
    }},
    { key: "regression", label: "Régression", color: "#fb923c", edu: {
      concept: "La droite de régression log-linéaire représente la trajectoire 'naturelle' du prix sur toute la période affichée. Elle lisse les cycles pour révéler la tendance de fond réelle.",
      howToRead: "Prix au-dessus de la ligne = actif cher par rapport à sa tendance historique. En dessous = actif décoté. Plus le prix s'éloigne de la ligne, plus un retour vers la moyenne est probable (mean reversion). Le R² indique la fiabilité (1 = parfait, 0 = bruit pur).",
      example: "Historiquement, les actifs reviennent vers leur droite de régression après des excès. Une déviation de +50% au-dessus précède souvent une correction, une déviation de -30% en dessous précède souvent un rebond.",
    }},
    { key: "target", label: "Target", color: "#ef4444", edu: {
      concept: "L'objectif de breakout (Target) est une cible de prix calculée automatiquement quand le prix sort d'un range de consolidation. La cible = amplitude du range projetée depuis le point de cassure.",
      howToRead: "Ligne verte = objectif haussier (breakout vers le haut). Ligne rouge = objectif baissier (breakdown vers le bas). La cible est valide environ 30 bougies après le breakout — passé ce délai, elle est invalidée.",
      example: "Si un actif consolide entre 100 et 120 (range de 20) puis casse au-dessus de 120, l'objectif de breakout est 140 (+20 depuis le point de cassure). Ce n'est pas garanti — c'est une cible indicative.",
    }},
  ];

  return (
    <div>
      {/* Pills overlays */}
      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10, alignItems:"center" }}>
        {OVERLAYS.map(ov => {
          const active = activeOverlays.has(ov.key);
          return (
            <button
              key={ov.key}
              onClick={() => toggleOverlay(ov.key)}
              style={{
                padding:"3px 10px",
                borderRadius:20,
                border:`1px solid ${active ? ov.color : THEME.borderMid}`,
                background: active ? ov.color + "22" : "transparent",
                color: active ? ov.color : THEME.textMuted,
                fontSize:10, fontWeight:700, cursor:"pointer",
                transition:"all .15s",
              }}
            >
              {ov.label}
            </button>
          );
        })}
        <span style={{ fontSize:9, color:THEME.textMuted, marginLeft:"auto" }}>
          {display.length} bougies
          {period ? ` · ${period}` : ""}
          {" "}· {currency}
        </span>
      </div>

      {/* SVG principal */}
      <div style={{ position:"relative" }}>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${W} ${totalH}`}
          style={{ overflow:"visible", cursor:"crosshair", display:"block" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        >
          <defs>
            <clipPath id="price-area">
              <rect x={PAD_L} y={PAD_T - 4} width={W - PAD_L - PAD_R} height={HPRICE + 8}/>
            </clipPath>
            <clipPath id="osc-area">
              <rect x={PAD_L} y={oscTop} width={W - PAD_L - PAD_R} height={HOSC}/>
            </clipPath>
          </defs>
          {/* ── GRILLE PRIX ── */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PAD_L} y1={t.y} x2={W-PAD_R} y2={t.y}
                stroke={THEME.borderPanel} strokeWidth="1" strokeDasharray="3,4"/>
              <text x={PAD_L-5} y={t.y+4} textAnchor="end"
                fontSize="9" fill="#556" fontFamily="'IBM Plex Mono',monospace">
                {fmtP(t.val)}
              </text>
            </g>
          ))}

          {/* ── GRILLE X ── */}
          {xTicks.map((t, i) => (
            <text key={i} x={t.x} y={PAD_T + HPRICE + SEP + HVOL + 14}
              textAnchor="middle" fontSize="9" fill="#556">
              {t.label}
            </text>
          ))}

          {/* ── OVERLAY RÉGRESSION ── */}
          {activeOverlays.has("regression") && regY1 != null && regY2 != null && (
            <line
              x1={PAD_L} y1={regY1} x2={W-PAD_R} y2={regY2}
              stroke="#fb923c" strokeWidth="1.5" strokeOpacity="0.7" strokeDasharray="6,3"
              clipPath="url(#price-area)"
            />
          )}

          {/* ── OVERLAY BB ── */}
          {activeOverlays.has("bb") && bb && (() => {
            const upPts  = polyline(display.map(d => bb.upper[d.origIdx]),  toPriceY);
            const midPts = polyline(display.map(d => bb.middle[d.origIdx]), toPriceY);
            const lowPts = polyline(display.map(d => bb.lower[d.origIdx]),  toPriceY);
            return (
              <g clipPath="url(#price-area)">
                <polyline points={upPts}  fill="none" stroke="#f59e0b" strokeWidth="1" strokeOpacity="0.55" strokeDasharray="3,2"/>
                <polyline points={midPts} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeOpacity="0.85"/>
                <polyline points={lowPts} fill="none" stroke="#f59e0b" strokeWidth="1" strokeOpacity="0.55" strokeDasharray="3,2"/>
              </g>
            );
          })()}

          {/* ── OVERLAY EMA 20 ── */}
          {activeOverlays.has("ema20") && (() => {
            const pts = polyline(display.map(d => ema20S[d.origIdx]), toPriceY);
            return pts ? <polyline points={pts} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeOpacity="0.85" clipPath="url(#price-area)"/> : null;
          })()}

          {/* ── OVERLAY EMA 50 ── */}
          {activeOverlays.has("ema50") && (() => {
            const pts = polyline(display.map(d => ema50S[d.origIdx]), toPriceY);
            return pts ? <polyline points={pts} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeOpacity="0.8" strokeDasharray="5,2" clipPath="url(#price-area)"/> : null;
          })()}

          {/* ── OVERLAY EMA 200 ── */}
          {activeOverlays.has("ema200") && (() => {
            const pts = polyline(display.map(d => ema200S[d.origIdx]), toPriceY);
            return pts ? <polyline points={pts} fill="none" stroke="#a78bfa" strokeWidth="2" strokeOpacity="0.8" strokeDasharray="7,3" clipPath="url(#price-area)"/> : null;
          })()}

          {/* ── OVERLAY BREAKOUT TARGET ── */}
          {activeOverlays.has("target") && breakoutTarget?.hasTarget && btY != null
            && btY >= PAD_T && btY <= PAD_T + HPRICE && (
            <g clipPath="url(#price-area)">
              <line x1={PAD_L} y1={btY} x2={W-PAD_R} y2={btY}
                stroke={btColor} strokeWidth="1.5" strokeOpacity="0.9" strokeDasharray="8,4"/>
              <text x={W-PAD_R-4} y={btY-4} textAnchor="end"
                fontSize="9" fill={btColor} fontFamily="'IBM Plex Mono',monospace">
                cible {fmtP(breakoutTarget?.targetPrice ?? 0)}
              </text>
            </g>
          )}
          {activeOverlays.has("target") && (!breakoutTarget?.hasTarget) && (
            <text x={W - PAD_R - 4} y={PAD_T + HPRICE - 8} textAnchor="end"
              fontSize="8" fill={THEME.textMuted} fontStyle="italic">
              Aucun breakout détecté
            </text>
          )}

          {/* ── CHANDELIERS ── */}
          <g clipPath="url(#price-area)">
          {display.map((d, i) => {
            const up      = d.c >= d.o;
            const col     = up ? "#22c55e" : "#ef4444";
            const bodyTop = toPriceY(Math.max(d.o, d.c));
            const bodyBot = toPriceY(Math.min(d.o, d.c));
            const bodyH   = Math.max(1, bodyBot - bodyTop);
            const x       = toX(i);
            return (
              <g key={i}>
                <line x1={x} y1={toPriceY(d.h)} x2={x} y2={toPriceY(d.l)}
                  stroke={col} strokeWidth="1" strokeOpacity="0.75"/>
                <rect x={x-cw/2} y={bodyTop} width={cw} height={bodyH}
                  fill={col} fillOpacity={up ? 0.8 : 0.75}
                  stroke={col} strokeWidth="0.4"/>
              </g>
            );
          })}
          </g>

          {/* ── CURSEUR VERTICAL ── */}
          {tooltip && (
            <line x1={tooltip.x} y1={PAD_T} x2={tooltip.x} y2={oscBot}
              stroke="#ffffff18" strokeWidth="1" strokeDasharray="3,3"/>
          )}

          {/* ── SÉPARATEUR VOLUME ── */}
          <line x1={PAD_L} y1={volTop} x2={W-PAD_R} y2={volTop}
            stroke={THEME.borderSubtle} strokeWidth="0.5"/>

          {/* ── BARRES VOLUME ── */}
          {display.map((d, i) => {
            const up    = d.c >= d.o;
            const col   = up ? "#22c55e" : "#ef4444";
            const x     = toX(i);
            const barH  = (d.v / maxVol) * (HVOL - 4);
            return (
              <rect key={i}
                x={x-cw/2} y={volTop + HVOL - barH}
                width={cw} height={barH}
                fill={col} fillOpacity="0.3"
              />
            );
          })}

          {/* ── SÉPARATEUR OSCILLATEUR ── */}
          <line x1={PAD_L} y1={oscTop} x2={W-PAD_R} y2={oscTop}
            stroke={THEME.borderSubtle} strokeWidth="0.5"/>

          {/* ── OSC : LABELS ── */}
          <text x={PAD_L-5} y={oscTop + HOSC/2 + 4} textAnchor="end"
            fontSize="8" fill="#556">0</text>
          <text x={PAD_L-5} y={oscTop + 8} textAnchor="end"
            fontSize="8" fill="#60a5fa">+30</text>
          <text x={PAD_L-5} y={oscBot - 2} textAnchor="end"
            fontSize="8" fill="#ef4444">-30</text>

          {/* ── OSC : GRILLE 0 ── */}
          <line x1={PAD_L} y1={oscTop + HOSC/2} x2={W-PAD_R} y2={oscTop + HOSC/2}
            stroke={THEME.borderSubtle} strokeWidth="0.5"/>

          {/* ── OSC : ZONES SEUIL MOMENTUM (±5) ── */}
          {[5, -5].map((v, i) => (
            <line key={i}
              x1={PAD_L} y1={toMomY(v)} x2={W-PAD_R} y2={toMomY(v)}
              stroke="#60a5fa" strokeWidth="0.5" strokeOpacity="0.4" strokeDasharray="3,3"/>
          ))}

          {/* ── OSC : MOMENTUM ROC-14 (bleu) ── */}
          {(() => {
            const pts = polyline(momSeriesDisplay, toMomY);
            return pts ? (
              <polyline points={pts} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeOpacity="0.9" clipPath="url(#osc-area)"/>
            ) : null;
          })()}

          {/* ── OSC : SINEWAVE (rouge) ── */}
          {(() => {
            const sinePts = polyline(sineSeriesDisplay, toSineY);
            const leadPts = polyline(leadSeriesDisplay, toSineY);
            return (
              <>
                {sinePts && <polyline points={sinePts} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.85" clipPath="url(#osc-area)"/>}
                {leadPts && <polyline points={leadPts} fill="none" stroke="#ef444488" strokeWidth="1" strokeOpacity="0.7" strokeDasharray="4,2" clipPath="url(#osc-area)"/>}
              </>
            );
          })()}

          {/* ── OSC : LABELS LÉGENDE ── */}
          <circle cx={PAD_L+6} cy={oscBot+10} r="3" fill="#60a5fa"/>
          <text x={PAD_L+13}  y={oscBot+14} fontSize="9" fill="#60a5fa" fontWeight="700">Momentum ROC</text>
          <text x={PAD_L+105} y={oscBot+14} fontSize="9" fill="#ef4444" fontWeight="700">· Sinewave</text>
          <text x={PAD_L+171} y={oscBot+14} fontSize="9" fill="#ef4444" fontWeight="700" opacity="0.6">· LeadSine</text>

        </svg>

        {/* ── TOOLTIP ── */}
        {tooltip && (
          <div style={{
            position:"absolute",
            left:`${(tooltip.x / W) * 100}%`,
            top: 4,
            transform: tooltip.x / W > 0.68
              ? "translateX(-100%) translateX(-8px)"
              : "translateX(8px)",
            background: THEME.bgCard,
            border:`1px solid ${tooltip.c >= tooltip.o ? "#22c55e44" : "#ef444444"}`,
            borderRadius:7, padding:"7px 12px",
            pointerEvents:"none", whiteSpace:"nowrap", zIndex:10,
            fontSize:10, fontFamily:"'IBM Plex Mono',monospace",
          }}>
            <div style={{ fontSize:9, color:THEME.textMuted, marginBottom:5 }}>{tooltip.date}</div>
            <div style={{ display:"grid", gridTemplateColumns:"auto auto", gap:"2px 14px" }}>
              {[["O", tooltip.o, THEME.textSecondary],
                ["H", tooltip.h, "#22c55e"],
                ["L", tooltip.l, "#ef4444"],
                ["C", tooltip.c, tooltip.c >= tooltip.o ? "#22c55e" : "#ef4444"],
                ["V", tooltip.v, THEME.textMuted],
              ].map(([lbl, val, col]) => (
                <>
                  <span style={{ color: THEME.textMuted }}>{lbl as string}</span>
                  <span style={{ color: col as string, fontWeight: lbl === "C" ? 700 : 400 }}>
                    {lbl === "V" ? fmt(val as number, 0) : fmtP(val as number)}
                  </span>
                </>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PERFCHART — graphique de performance unifié (remplace InteractiveChart + CryptoChart) ──
function PerfChart({
  chartData,
  chartDataWeekly,
  currency,
  quoteType,
  onPeriodChange,
  period,
  loading,
  optimalUTKey,
  periods: periodsProp,
}: {
  chartData:        { closes:(number|null)[]; timestamps:number[] } | null;
  chartDataWeekly?: { closes:(number|null)[]; opens:(number|null)[]; highs:(number|null)[]; lows:(number|null)[]; volumes:(number|null)[]; timestamps:number[] } | null;
  currency:         string;
  quoteType?:       string;
  onPeriodChange:   (p: string) => void;
  period:           string;
  loading:          boolean;
  optimalUTKey?:    string;
  periods?:         { key: string; label: string }[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x:number; y:number; price:number; date:string } | null>(null);

  const PERIODS_DEFAULT = periodsProp ?? [
    { key:"3m",  label:"3 mois" }, { key:"1a",  label:"1 an" },
    { key:"2a",  label:"2 ans" },  { key:"3a",  label:"3 ans" },
    { key:"5a",  label:"5 ans" },  { key:"10a", label:"10 ans" },
  ];

  const useWeekly    = (period === "5a" || period === "max") && chartDataWeekly != null;
  const use3aMonthly = period === "3a" && chartDataWeekly != null;
  const sourceRaw    =
    use3aMonthly ? resampleToMonthly(chartDataWeekly!) :
    useWeekly    ? chartDataWeekly! :
                   chartData;

  const PERIOD_SECS: Record<string, number> = {
    "7j":7*86400,"1m":30*86400,"3m":90*86400,"6m":180*86400,
    "1a":365*86400,"2a":730*86400,"3a":1095*86400,"5a":1825*86400,"max":Infinity,
  };
  const periodSecs = PERIOD_SECS[period] ?? Infinity;
  const nowSec     = Math.floor(Date.now()/1000);
  const cutoffTs   = isFinite(periodSecs) ? nowSec - periodSecs : 0;

  const source     = sourceRaw ?? chartData;
  const closes     = source?.closes     ?? [];
  const timestamps = source?.timestamps ?? [];

  const points: { ts:number; price:number }[] = [];
  for (let i = 0; i < closes.length; i++) {
    const p  = closes[i];
    const ts = timestamps[i];
    if (p == null || isNaN(p) || ts == null) continue;
    if (cutoffTs > 0 && ts < cutoffTs) continue;
    points.push({ ts, price: p });
  }
  const displayPts = points.length >= 2 ? points : [];

  if (displayPts.length < 2) return (
    <div style={{ color:THEME.textMuted, fontSize:12, padding:"30px 0", textAlign:"center" }}>
      {loading ? "Chargement…" : "Données graphique indisponibles"}
    </div>
  );

  const base0   = displayPts[0].price || 1;
  const indexed = displayPts.map(p => (p.price / base0) * 100);
  const minI    = Math.min(...indexed), maxI = Math.max(...indexed);
  const yPad    = (maxI - minI) * 0.08;
  const yMin    = Math.max(0, minI - yPad), yMax = maxI + yPad;
  const yRange  = yMax - yMin || 1;

  const W = 800, H = 260, PAD_L = 52, PAD_R = 12, PAD_T = 12, PAD_B = 28;
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_T - PAD_B;

  const toX = (i:number) => PAD_L + (i / (displayPts.length-1)) * chartW;
  const toY = (v:number) => PAD_T + chartH - ((v-yMin)/yRange)*chartH;

  const up      = indexed[indexed.length-1] >= 100;
  const c       = up ? "#22c55e" : "#ef4444";
  const chgPct  = (indexed[indexed.length-1]-100).toFixed(1);
  const polyPts = indexed.map((v,i) => `${toX(i)},${toY(v)}`).join(" ");
  const areaBot = H - PAD_B;
  const areaPts = `${PAD_L},${areaBot} ${polyPts} ${toX(displayPts.length-1)},${areaBot}`;
  const baseLineY = toY(100);

  const amplitude = maxI - minI;
  const tickStep  = amplitude > 150 ? 50 : amplitude > 60 ? 25 : amplitude > 25 ? 10 : 5;
  const firstTick = Math.ceil(yMin / tickStep) * tickStep;
  const yTicks    = Array.from(
    { length: Math.floor((yMax - firstTick) / tickStep) + 1 },
    (_, i) => firstTick + i * tickStep
  ).filter(v => v >= yMin && v <= yMax).map(v => ({ val:v, y:toY(v) }));

  const xStep  = Math.max(1, Math.floor(displayPts.length / 5));
  const xTicks = displayPts
    .filter((_,i) => i===0 || i===displayPts.length-1 || i%xStep===0)
    .slice(0, 6)
    .map(p => {
      const i = displayPts.indexOf(p);
      const d = new Date(p.ts * 1000);
      const label = period === "3m"
        ? d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})
        : period === "1a"
        ? d.toLocaleDateString("fr-FR",{month:"short",year:"2-digit"})
        : d.toLocaleDateString("fr-FR",{month:"short",year:"numeric"});
      return { x:toX(i), label };
    });

  const fmtPrice = (n:number) =>
    n>=1000 ? n.toFixed(0) : n>=100 ? n.toFixed(1) : n>=1 ? n.toFixed(2) : n.toFixed(4);

  const handleMouseMove = (e:React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX-rect.left)/rect.width)*W;
    const relX = svgX - PAD_L;
    if (relX<0||relX>chartW){setTooltip(null);return;}
    const idx    = Math.min(Math.max(Math.round((relX/chartW)*(displayPts.length-1)),0),displayPts.length-1);
    const pt     = displayPts[idx];
    const idxVal = indexed[idx];
    const dateStr = new Date(pt.ts*1000).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
    setTooltip({x:toX(idx),y:toY(idxVal),price:pt.price,date:dateStr});
  };

  const periodLabel = PERIODS_DEFAULT.find(p=>p.key===period)?.label ?? period;

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:c,fontWeight:700}}>
          {up?"▲":"▼"} {Math.abs(parseFloat(chgPct))}% sur {periodLabel}
        </span>
        <span style={{fontSize:10,color:THEME.textSecondary}}>
          {fmtPrice(displayPts[0].price)} → {fmtPrice(displayPts[displayPts.length-1].price)} {currency}
        </span>
      </div>
      <div style={{position:"relative"}}>
        <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`}
          style={{overflow:"visible",cursor:"crosshair",display:"block"}}
          onMouseMove={handleMouseMove} onMouseLeave={()=>setTooltip(null)}>
          <defs>
            <linearGradient id="pfg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity="0.18"/>
              <stop offset="100%" stopColor={c} stopOpacity="0"/>
            </linearGradient>
          </defs>
          {yTicks.map((t,i)=>(
            <g key={i}>
              <line x1={PAD_L} y1={t.y} x2={W-PAD_R} y2={t.y}
                stroke={THEME.borderPanel} strokeWidth="1" strokeDasharray="3,4"/>
              <text x={PAD_L-6} y={t.y+4} textAnchor="end"
                fontSize="9" fill="#445" fontFamily="'IBM Plex Mono',monospace">
                {t.val>=1?Math.round(t.val):""}
              </text>
            </g>
          ))}
          {xTicks.map((t,i)=>(
            <text key={i} x={t.x} y={H-PAD_B+16} textAnchor="middle" fontSize="9" fill="#445">{t.label}</text>
          ))}
          <line x1={PAD_L} y1={baseLineY} x2={W-PAD_R} y2={baseLineY}
            stroke="#ffffff18" strokeWidth="1" strokeDasharray="4,3"/>
          <text x={PAD_L-6} y={baseLineY+4} textAnchor="end"
            fontSize="9" fill="#666" fontFamily="'IBM Plex Mono',monospace">100</text>
          <polygon points={areaPts} fill="url(#pfg)"/>
          <polyline points={polyPts} fill="none" stroke={c} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round"/>
          {tooltip&&<line x1={tooltip.x} y1={PAD_T} x2={tooltip.x} y2={H-PAD_B}
            stroke="#ffffff22" strokeWidth="1" strokeDasharray="3,3"/>}
          {tooltip&&<circle cx={tooltip.x} cy={tooltip.y} r="4"
            fill={c} stroke={THEME.bgPage} strokeWidth="2"/>}
        </svg>
        {tooltip&&(
          <div style={{
            position:"absolute",
            left:`${(tooltip.x/W)*100}%`,top:0,
            transform:tooltip.x/W>0.72?"translateX(-100%) translateX(-8px)":tooltip.x/W<0.15?"translateX(8px)":"translateX(-50%)",
            background:THEME.bgCard,border:`1px solid ${c}55`,borderRadius:7,
            padding:"6px 11px",pointerEvents:"none",maxWidth:"200px",whiteSpace:"nowrap",zIndex:10,
          }}>
            <div style={{fontSize:12,color:c,fontWeight:800,fontFamily:"'IBM Plex Mono',monospace"}}>
              {((tooltip.price/base0-1)*100)>=0?"+":""}{((tooltip.price/base0-1)*100).toFixed(2)}%
            </div>
            <div style={{fontSize:10,color:THEME.textSecondary,fontFamily:"'IBM Plex Mono',monospace",marginTop:1}}>
              {fmtPrice(tooltip.price)} {currency}
            </div>
            <div style={{fontSize:9,color:"#445",marginTop:2}}>{tooltip.date}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── COLLAPSIBLE EDU BLOCK — lexique permanent des overlays sous CandleChart ──
function CollapsibleEduBlock({
  overlays,
}: {
  overlays: { key: string; label: string; color: string; edu: TechSignal["edu"] }[];
}) {
  const [open, setOpen] = useState(false);
  if (overlays.length === 0) return null;
  return (
    <div style={{
      marginTop: 10,
      border: `1px solid ${THEME.borderMid}`,
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          background: THEME.bgCard,
          border: "none",
          cursor: "pointer",
          color: THEME.textSecondary,
          fontSize: 11,
          fontWeight: 700,
          textAlign: "left",
        }}
      >
        <span>📖 Lexique des indicateurs</span>
        <span style={{ fontSize: 10, color: THEME.textMuted }}>
          {open ? "▲ Fermer" : "▼ Afficher"}
        </span>
      </button>
      {open && (
        <div style={{
          padding: "14px 16px",
          background: THEME.bgPanel,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}>
          {overlays.map(ov => (
            <div key={ov.key}>
              <div style={{
                fontSize: 12,
                fontWeight: 800,
                color: ov.color,
                marginBottom: 8,
                paddingBottom: 4,
                borderBottom: `1px solid ${ov.color}33`,
              }}>
                {ov.label}
              </div>
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 11,
                lineHeight: 1.7,
                color: THEME.textSecondary,
              }}>
                <div>
                  <span style={{ color: THEME.textPrimary, fontWeight: 700 }}>C'est quoi ?{" "}</span>
                  {ov.edu.concept}
                </div>
                <div>
                  <span style={{ color: THEME.textPrimary, fontWeight: 700 }}>Comment le lire ?{" "}</span>
                  {ov.edu.howToRead}
                </div>
                <div style={{
                  background: THEME.bgCard,
                  borderLeft: `3px solid ${ov.color}`,
                  padding: "8px 10px",
                  borderRadius: 6,
                }}>
                  <span style={{ color: ov.color, fontWeight: 700 }}>Exemple concret :{" "}</span>
                  {ov.edu.example}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CHARTBLOCK — wrapper unifié toggle Performance / Technique ──
function ChartBlock({
  chartData,
  chartDataWeekly,
  candleLoading,
  candleDisplay,
  currency,
  quoteType,
  period,
  periods,
  onPeriodChange,
  loading,
  optimalUTKey,
  showEur,
  setShowEur,
  eurRate,
  priceValue,
}: {
  chartData:        { closes:(number|null)[]; opens:(number|null)[]; highs:(number|null)[]; lows:(number|null)[]; volumes:(number|null)[]; timestamps:number[] } | null;
  chartDataWeekly?: { closes:(number|null)[]; opens:(number|null)[]; highs:(number|null)[]; lows:(number|null)[]; volumes:(number|null)[]; timestamps:number[] } | null;
  candleData?:      { closes:(number|null)[]; opens:(number|null)[]; highs:(number|null)[]; lows:(number|null)[]; volumes:(number|null)[]; timestamps:number[] } | null;
  candleLoading?:   boolean;
  candleDisplay?:   number;
  currency:         string;
  quoteType?:       string;
  period:           string;
  periods?:         { key:string; label:string }[];
  onPeriodChange:   (p:string) => void;
  loading:          boolean;
  optimalUTKey?:    string;
  showEur?:         boolean;
  setShowEur?:      (v:boolean) => void;
  eurRate?:         number | null;
  priceValue?:      number | null;
}) {
  const [chartMode, setChartMode] = useState<"perf"|"tech">("perf");

  const candleSource = chartData;

  const breakoutForChart = (candleSource && candleSource.closes.length > 0 && candleSource.highs.length > 0)
    ? calcBreakoutTarget(candleSource.closes, candleSource.highs, candleSource.lows)
    : null;

  const hasCandleData = candleSource != null &&
    candleSource.opens.filter((v): v is number => v != null).length >= 10;

  // Limiter l'affichage à 120 bougies pour la cohérence avec CandleChart
  const perfDisplayData = chartData && chartData.closes.length > 120
    ? {
        closes:     chartData.closes.slice(-120),
        timestamps: chartData.timestamps.slice(-120),
        opens:      chartData.opens.slice(-120),
        highs:      chartData.highs.slice(-120),
        lows:       chartData.lows.slice(-120),
        volumes:    chartData.volumes.slice(-120),
      }
    : chartData;

  return (
    <div style={{background:THEME.bgPanel,border:`1px solid ${THEME.borderPanel}`,borderRadius:12,padding:"14px 18px",marginBottom:4}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:10,color:THEME.textMuted,textTransform:"uppercase",letterSpacing:1.2}}>
          {chartMode==="perf" ? "Performance historique" : "Analyse technique"}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {/* Bouton EUR — uniquement en mode Performance */}
          {chartMode==="perf" && eurRate!=null && eurRate!==1 && priceValue!=null && setShowEur && (
            <button onClick={()=>setShowEur(!showEur)} style={{
              background: showEur ? THEME.accent+"33" : THEME.scoreAmber+"22",
              border:`1px solid ${showEur ? THEME.accent : THEME.scoreAmber}`,
              borderRadius:8,padding:"5px 14px",fontSize:13,fontWeight:800,
              color: showEur ? THEME.accent : THEME.scoreAmber,
              cursor:"pointer",transition:"all .15s",fontFamily:"'IBM Plex Mono',monospace",
            }}>
              {showEur ? `↩ ${currency}` : `≈ ${(priceValue*eurRate).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})} EUR`}
            </button>
          )}
          {/* Boutons UT — visibles dans les deux modes */}
          {periods && periods.length > 0 && (
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              {periods.map(p => (
                <button key={p.key} onClick={()=>onPeriodChange(p.key)} style={{
                  background: period===p.key ? THEME.accent+"22" : "transparent",
                  border:`1px solid ${period===p.key ? THEME.accent : THEME.borderMid}`,
                  color: period===p.key ? THEME.accent : THEME.textMuted,
                  borderRadius:5,padding:"3px 8px",fontSize:9,fontWeight:700,cursor:"pointer",
                  transition:"all .15s",
                }}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {/* Toggle Performance / Technique */}
          <div style={{display:"flex",gap:4}}>
            {(["perf","tech"] as const).map(m => (
              <button key={m} onClick={()=>setChartMode(m)} style={{
                background: chartMode===m ? THEME.accent+"22" : "transparent",
                border:`1px solid ${chartMode===m ? THEME.accent : THEME.borderMid}`,
                color: chartMode===m ? THEME.accent : THEME.textMuted,
                borderRadius:6,padding:"4px 12px",fontSize:10,fontWeight:700,cursor:"pointer",
              }}>
                {m==="perf" ? "Performance" : "Technique"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {chartMode==="perf" ? (
        <PerfChart
          chartData={perfDisplayData}
          chartDataWeekly={chartDataWeekly}
          currency={currency}
          quoteType={quoteType}
          period={period}
          periods={periods}
          onPeriodChange={onPeriodChange}
          loading={loading}
          optimalUTKey={optimalUTKey}
        />
      ) : hasCandleData ? (
        <>
          <CandleChart
            chartData={candleSource}
            currency={currency}
            breakoutTarget={breakoutForChart}
            period={period}
            periods={periods}
            displayLimit={candleDisplay}
          />
          <CollapsibleEduBlock overlays={OVERLAYS_EDU} />
        </>
      ) : (
        <div style={{color:THEME.textMuted,fontSize:12,padding:"30px 0",textAlign:"center"}}>
          {(loading || candleLoading) ? "Chargement des données OHLCV…" : "Données OHLCV insuffisantes pour le graphique technique."}
        </div>
      )}
    </div>
  );
}

// InteractiveChart supprimé — remplacé par PerfChart + ChartBlock
function ScoreGauge({ score }: { score: number | null }) {
  if (score == null) return null;
  const cx = 91, cy = 80, r = 67;
  const toRad = (d: number) => d * Math.PI / 180;
  const px = (deg: number) => cx + r * Math.cos(toRad(180 - deg));
  const py = (deg: number) => cy + r * Math.sin(toRad(180 - deg));
  // strokeLinecap="butt" + 2° de gap entre segments → 3 tiers strictement égaux
  const arc = (a1: number, a2: number, color: string) => (
    <path
      d={`M${px(a1)},${py(a1)} A${r},${r} 0 0 0 ${px(a2)},${py(a2)}`}
      stroke={color} strokeWidth="14" fill="none" strokeLinecap="butt"
    />
  );
  const nd = (score / 10) * 180;
  const nx = cx + r * 0.72 * Math.cos(toRad(180 - nd));
  const ny = cy + r * 0.72 * Math.sin(toRad(180 - nd));
  return (
    <svg width="182" height="92" viewBox="0 0 182 92" style={{ overflow: "visible" }}>
      <g transform={`translate(0, ${cy * 2}) scale(1, -1)`}>
        <path d={`M${px(0)},${py(0)} A${r},${r} 0 0 0 ${px(180)},${py(180)}`}
          stroke={THEME.borderPanel} strokeWidth="14" fill="none" strokeLinecap="butt"/>
        {arc(  2,  58, THEME.scoreRed)}
        {arc( 62, 118, THEME.scoreAmber)}
        {arc(122, 178, THEME.scoreGreen)}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="3" strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r="5" fill="white"/>
      </g>
    </svg>
  );
}

// Mini jauge pour les groupes de score
function MiniGauge({ label, score, weight }: { label: string; score: number | null; weight: number }) {
  if (score == null) return null;
  const color = scoreColor(score);
  const pct = (score / 10) * 100;
  return (
    <div style={{ flex:1, minWidth: 80 }}>
      <div style={{ fontSize:9, color:"#445", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <div style={{ flex:1, height:4, background:THEME.borderPanel, borderRadius:2, overflow:"hidden" }}>
          <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:2, transition:"width .5s" }}/>
        </div>
        <span style={{ fontSize:10, fontWeight:700, color, minWidth:24 }}>{score}</span>
      </div>
      <div style={{ fontSize:8, color:"#556", marginTop:2 }}>poids {Math.round(weight*100)}%</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// COUCHE 4b — VUE ACTION / ETF
// ════════════════════════════════════════════════════════════════
// ── TEXTES CONTEXTUELS PAR PROFIL ────────────────────────────
const PROFILE_CONTEXT: Record<string, {
  badge: string;
  color: string;
  description: (m: any) => string;
  notes: Partial<Record<string, string>>;
}> = {
  mega_cap_quality: {
    badge: "Mega-cap de qualité",
    color: "#60a5fa",
    description: (m) => {
      const valTxt = m.gValorisation != null && m.gValorisation <= 3.5
        ? `Sa valorisation est actuellement tendue (score ${m.gValorisation}/10) — le marché paye une prime élevée qui laisse peu de marge de sécurité pour l'acheteur aujourd'hui.`
        : m.gValorisation != null && m.gValorisation <= 6
        ? `Sa valorisation est modérée — la prime de qualité est présente mais reste raisonnable.`
        : `Sa valorisation est attractive pour une entreprise de cette qualité.`;
      const roeTxt = m.roe != null && m.roe > 0.50
        ? `Son ROE exceptionnellement élevé (${(m.roe*100).toFixed(0)}%) est en partie mécanique : les rachats massifs d'actions réduisent les capitaux propres au dénominateur, ce qui gonfle le ratio sans refléter une rentabilité réelle supplémentaire.`
        : "";
      return `${m.name || "Cette entreprise"} génère des marges exceptionnelles et dispose d'un avantage concurrentiel structurel. ${roeTxt} ${valTxt} La gestion de sa trésorerie proche de 1 est un choix délibéré, non un signe de fragilité.`.replace(/\s+/g, " ").trim();
    },
    notes: {
      "Valorisation": "P/B élevé justifié par les rachats d'actions et la force de la marque.",
      "Santé Financière": "Trésorerie gérée délibérément proche de 1 — choix stratégique.",
      "Dividende": "Rendement faible = prix élevé. La croissance du dividende prime sur le rendement absolu.",
    },
  },
  dividend_compounder: {
    badge: "Aristocrate du dividende",
    color: "#22c55e",
    description: (m) => {
      const valTxt = m.gValorisation != null && m.gValorisation <= 3.5
        ? `Sa valorisation est actuellement tendue — la prime payée pour la régularité du dividende est élevée.`
        : `Sa valorisation reste raisonnable pour un profil de cette qualité.`;
      return `${m.name || "Cette entreprise"} privilégie la croissance régulière de son dividende plutôt qu'un rendement élevé immédiat. Un faible rendement traduit la confiance du marché dans sa pérennité — le prix a progressé avec les bénéfices. ${valTxt}`.replace(/\s+/g, " ").trim();
    },
    notes: {
      "Dividende": "Rendement modeste = signe de confiance du marché, pas de faiblesse.",
    },
  },
  growth_premium: {
    badge: "Croissance premium",
    color: "#a78bfa",
    description: (m) => {
      const valTxt = m.gValorisation != null && m.gValorisation <= 3.5
        ? `La valorisation est actuellement tendue (${m.gValorisation}/10) — la prime de croissance est élevée et suppose que les marges continuent de progresser sans déception.`
        : `La valorisation reste dans une zone acceptable pour ce niveau de croissance.`;
      return `${m.name || "Cette entreprise"} est valorisée sur ses perspectives de croissance future. Les ratios PE et PS élevés sont normaux pour une entreprise dont les marges progressent rapidement. ${valTxt}`.replace(/\s+/g, " ").trim();
    },
    notes: {
      "Valorisation": "Multiples élevés normaux pour une entreprise en forte croissance rentable.",
    },
  },
  capital_heavy: {
    badge: "Secteur capitalistique",
    color: "#f59e0b",
    description: (m) => {
      const sectorTxt = m.sector ? ` dans le secteur ${m.sector}` : "";
      const valTxt = m.gValorisation != null && m.gValorisation <= 3.5
        ? " Sa valorisation est actuellement tendue malgré ce contexte capitalistique."
        : m.gValorisation != null && m.gValorisation >= 7
        ? " Sa valorisation est attractive pour ce type de secteur."
        : "";
      return `${m.name || "Cette entreprise"}${sectorTxt} opère dans un secteur nécessitant de lourds investissements en infrastructure. Une dette structurellement élevée est normale — elle finance des actifs à longue durée de vie. La régularité des flux de trésorerie compte plus que le current ratio instantané.${valTxt}`.replace(/\s+/g, " ").trim();
    },
    notes: {
      "Santé Financière": "Dette élevée normale dans ce secteur — financement d'actifs long terme.",
    },
  },
  financial_sector: {
    badge: "Secteur financier",
    color: "#f97316",
    description: (m) => {
      const rentaTxt = m.gRentabilite != null && m.gRentabilite >= 7
        ? " La rentabilité est solide — ROE et marges confirment l'efficacité du modèle."
        : m.gRentabilite != null && m.gRentabilite <= 3.5
        ? " La rentabilité est sous pression — surveiller l'évolution des marges et du ROE."
        : " Le ROE et les marges sont les métriques clés à suivre.";
      return `${m.name || "Cette entreprise"} appartient au secteur financier. Dette/Equity et Current Ratio ne sont pas des indicateurs pertinents pour ce modèle économique — les banques et assureurs ont structurellement un levier très élevé par nature de leur activité.${rentaTxt}`.replace(/\s+/g, " ").trim();
    },
    notes: {
      "Santé Financière": "Ratios de dette non applicables au secteur financier.",
    },
  },
  standard: {
    badge: "Profil standard",
    color: "#94a3b8",
    description: (m) => {
      const sectorTxt = m.sector ? ` dans le secteur ${m.sector}` : "";
      const valTxt = m.gValorisation != null && m.gValorisation <= 3.5
        ? "La valorisation est actuellement tendue — le prix intègre déjà beaucoup d'optimisme."
        : m.gValorisation != null && m.gValorisation >= 7
        ? "La valorisation est attractive — le prix offre une marge de sécurité intéressante."
        : "La valorisation est dans une zone neutre.";
      const santeTxt = m.gSante != null && m.gSante <= 3
        ? " La santé financière mérite surveillance — endettement ou liquidités sous pression."
        : m.gSante != null && m.gSante >= 8
        ? " Le bilan est solide."
        : "";
      return `${m.name || "Cette entreprise"}${sectorTxt} est analysée avec les seuils standard. ${valTxt}${santeTxt} Comparez toujours avec les moyennes du secteur pour contextualiser les scores.`.replace(/\s+/g, " ").trim();
    },
    notes: {},
  },
};

// ── COMPOSANT FUNDAMENTALS PANEL ─────────────────────────────
function FundamentalsPanel({ metrics, scores, sections, currency }: {
  metrics:  any;
  scores:   Record<string, number | null>;
  sections: any[];
  currency: string;
}) {
  const [expertMode, setExpertMode] = useState(false);

  if (!metrics) return null;
  const { companyProfile = "standard", gValorisation, gRentabilite, gSante, gRisque } = metrics;
  const ctx = PROFILE_CONTEXT[companyProfile] ?? PROFILE_CONTEXT.standard;

  const GROUP_EDU: Record<string, TechSignal["edu"]> = {
    Valorisation: {
      concept: "Le score de Valorisation agrège P/E, P/B, P/S et EV/EBITDA. Il mesure si le prix payé aujourd'hui est raisonnable par rapport aux bénéfices, aux actifs et aux ventes de l'entreprise.",
      howToRead: "Un score élevé (vert) = l'action est bon marché par rapport à ses fondamentaux. Un score faible (rouge) = le marché paye une prime élevée — justifiée si la croissance suit, risquée sinon.",
      good: "7-10 : valorisation attractive ou raisonnable. Le prix offre une marge de sécurité.",
      bad: "1-3 : valorisation tendue. Toute déception sur les résultats peut entraîner une correction.",
      example: "",
    },
    Rentabilité: {
      concept: "Le score de Rentabilité agrège ROE, marge opérationnelle et marge nette. Il mesure l'efficacité avec laquelle l'entreprise transforme ses ventes et ses actifs en bénéfices réels.",
      howToRead: "Un score élevé indique une entreprise qui génère beaucoup de profit par rapport à ce qu'elle investit. C'est un signe d'avantage concurrentiel durable.",
      good: "7-10 : rentabilité solide. L'entreprise monétise bien son activité.",
      bad: "1-3 : marges faibles ou négatives — peu de coussin face aux imprévus.",
      example: "",
    },
    "Santé Financière": {
      concept: "Le score de Santé Financière agrège le ratio Dette/Equity et le Current Ratio. Il évalue si l'entreprise peut faire face à ses engagements financiers à court et long terme.",
      howToRead: "Un score élevé = bilan sain, peu de risque de faillite ou de dilution. Un score faible = endettement élevé ou liquidités insuffisantes — risque accru en cas de choc.",
      good: "7-10 : bilan solide, flexibilité financière. L'entreprise peut investir ou résister à une crise.",
      bad: "1-3 : endettement ou tensions de trésorerie — surveiller les échéances et le free cash flow.",
      example: "",
    },
    Risque: {
      concept: "Le score Risque / Dividende agrège le bêta (volatilité), la performance 52 semaines et le rendement du dividende. Il mesure l'exposition au risque de marché et la rémunération de l'actionnaire.",
      howToRead: "Un bêta élevé amplifie les gains ET les pertes. Un bon score combine un risque maîtrisé avec une rémunération correcte de l'actionnaire.",
      good: "7-10 : risque modéré et/ou dividende attractif. Profil défensif ou bien rémunéré.",
      bad: "1-3 : forte volatilité et/ou dividende absent ou insuffisant.",
      example: "",
    },
  };

  const groups = [
    { key: "Valorisation",    label: "Valorisation",  score: gValorisation, weight: "40%",
      note: ctx.notes["Valorisation"] ?? null,    edu: GROUP_EDU["Valorisation"] },
    { key: "Rentabilité",     label: "Rentabilité",   score: gRentabilite,  weight: "30%",
      note: ctx.notes["Rentabilité"] ?? null,     edu: GROUP_EDU["Rentabilité"] },
    { key: "Santé Financière",label: "Santé Fin.",    score: gSante,        weight: "20%",
      note: ctx.notes["Santé Financière"] ?? null, edu: GROUP_EDU["Santé Financière"] },
    { key: "Risque",          label: "Risque / Div.", score: gRisque,       weight: "10%",
      note: ctx.notes["Risque"] ?? ctx.notes["Dividende"] ?? null, edu: GROUP_EDU["Risque"] },
  ];

  return (
    <div style={{ marginTop: 10 }}>

      {/* Bloc profil */}
      <div style={{
        background: THEME.bgPanel,
        border: `1px solid ${ctx.color}33`,
        borderRadius: 12,
        padding: "16px 18px",
        marginBottom: 12,
      }}>
        {/* En-tête profil */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: THEME.textSecondary, textTransform: "uppercase", letterSpacing: 2 }}>
              🏢 Profil d'entreprise
            </span>
            <span style={{
              fontSize: 11, fontWeight: 800,
              color: ctx.color, background: ctx.color + "22",
              borderRadius: 4, padding: "2px 8px",
            }}>
              {ctx.badge}
            </span>
          </div>
        </div>

        {/* Texte contextuel */}
        <div style={{
          fontSize: 12, color: THEME.textSecondary, lineHeight: 1.7,
          marginBottom: 16, padding: "10px 12px",
          background: THEME.bgCard, borderRadius: 8,
          borderLeft: `3px solid ${ctx.color}`,
        }}>
          {ctx.description(metrics)}
        </div>

        {/* Barres de score par groupe */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {groups.map(g => {
            if (g.score == null) return null;
            const color = scoreColor(g.score);
            const pct   = (g.score / 10) * 100;
            return (
              <div key={g.key}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: THEME.textSecondary, minWidth: 90 }}>{g.label}</span>
                  <div style={{ flex: 1, height: 8, background: THEME.borderPanel, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      width: `${pct}%`, height: "100%",
                      background: color, borderRadius: 4,
                      transition: "width .5s ease",
                    }}/>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color, minWidth: 36, textAlign: "right",
                                  fontFamily: "'IBM Plex Mono',monospace" }}>
                    {g.score}/10
                  </span>
                  <span style={{ fontSize: 9, color: THEME.textMuted, minWidth: 28 }}>{g.weight}</span>
                  {g.edu && <EduTooltip edu={g.edu} id={`funda-group-${g.key}`}/>}
                </div>
                {g.note && (
                  <div style={{
                    fontSize: 10, color: THEME.textMuted, fontStyle: "italic",
                    paddingLeft: 100, lineHeight: 1.5, marginBottom: 2,
                  }}>
                    ℹ️ {g.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Toggle mode expert */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: expertMode ? 16 : 0 }}>
        <button
          onClick={() => setExpertMode(v => !v)}
          style={{
            background: expertMode ? THEME.borderMid : "transparent",
            border: `1px solid ${THEME.borderMid}`,
            borderRadius: 8, padding: "6px 18px",
            fontSize: 11, fontWeight: 700,
            color: THEME.textMuted, cursor: "pointer",
            transition: "all .15s",
          }}
        >
          {expertMode ? "▲ Masquer le détail" : "▼ Mode expert — afficher les métriques détaillées"}
        </button>
      </div>

      {/* Mode expert : tableau compact par groupe */}
      {expertMode && sections.map((sec: any) => (
        <div key={sec.label} style={{ marginTop: 16 }}>
          {/* Header groupe */}
          {(() => {
            const groupScore =
              sec.label === "Valorisation"     ? gValorisation :
              sec.label === "Rentabilité"      ? gRentabilite  :
              sec.label === "Santé Financière" ? gSante        :
              sec.label === "Risque"           ? gRisque       :
              null;
            const gColor = groupScore != null ? scoreColor(groupScore) : THEME.textMuted;
            return (
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 8,
                borderBottom: `2px solid ${gColor}33`,
                marginBottom: 6,
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 800,
                  color: THEME.textPrimary,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 15 }}>{sec.icon}</span>
                  <span style={{ textTransform: "uppercase", letterSpacing: 1.5 }}>
                    {sec.label}
                  </span>
                  {groupScore != null && (
                    <span style={{
                      fontSize: 14, fontWeight: 900,
                      color: gColor,
                      fontFamily: "'IBM Plex Mono',monospace",
                      background: gColor + "18",
                      borderRadius: 6, padding: "2px 10px",
                    }}>
                      {groupScore}/10
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: 9, color: THEME.textMuted,
                  fontStyle: "italic",
                }}>{sec.note}</span>
              </div>
            );
          })()}

          {/* Avertissement secteur financier */}
          {sec.label === "Santé Financière" && metrics.isFinancial && (
            <div style={{
              fontSize: 10, color: THEME.textSecondary,
              marginBottom: 6, padding: "5px 10px",
              background: THEME.bgCard, borderRadius: 6,
              borderLeft: `3px solid ${THEME.scoreAmber}`,
            }}>
              ⚠️ Secteur financier — Dette/Equity et Current Ratio exclus du scoring.
            </div>
          )}

          {/* Lignes métriques compactes */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {sec.cards.map((card: any, i: number) => {
              const s = card.s as number | null | undefined;
              const barColor = s == null ? THEME.borderMid
                : s >= 7 ? THEME.scoreGreen
                : s >= 4 ? THEME.scoreAmber
                : THEME.scoreRed;
              const barWidth = s != null ? `${(s / 10) * 100}%` : "0%";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center",
                  gap: 10, padding: "7px 10px",
                  background: i % 2 === 0 ? THEME.bgCard : THEME.bgCardAlt,
                  borderRadius: 6,
                  borderLeft: `3px solid ${s != null ? barColor : THEME.borderSubtle}`,
                }}>
                  {/* Barre score inline */}
                  <div style={{
                    width: 48, height: 4,
                    background: THEME.borderPanel,
                    borderRadius: 2, flexShrink: 0, overflow: "hidden",
                  }}>
                    <div style={{
                      width: barWidth, height: "100%",
                      background: barColor, borderRadius: 2,
                      transition: "width .4s ease",
                    }}/>
                  </div>

                  {/* Label */}
                  <span style={{
                    fontSize: 11, color: THEME.textSecondary,
                    flex: 1, minWidth: 0,
                  }}>
                    {card.label}
                  </span>

                  {/* Valeur */}
                  <span style={{
                    fontSize: 13, fontWeight: 800,
                    color: s != null ? barColor : THEME.textPrimary,
                    fontFamily: "'IBM Plex Mono',monospace",
                    minWidth: 72, textAlign: "right",
                    flexShrink: 0,
                  }}>
                    {card.value}
                  </span>

                  {/* Badge score */}
                  {s != null && (
                    <span style={{
                      fontSize: 10, fontWeight: 800,
                      color: barColor,
                      background: barColor + "22",
                      borderRadius: 4, padding: "2px 6px",
                      minWidth: 38, textAlign: "center",
                      flexShrink: 0,
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}>
                      {s}/10
                    </span>
                  )}

                  {/* Tooltip éducatif */}
                  {card.edu && (
                    <EduTooltip edu={card.edu} id={`expert-${sec.label}-${i}`}/>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// COUCHE 4c — PANNEAU CONTEXTE DE MARCHÉ
// ════════════════════════════════════════════════════════════════

const CONTEXT_COLORS: Record<string, { bg: string; border: string; badge: string; emoji: string }> = {
  range:    { bg: "#111d30", border: "#4a90d9",        badge: "#4a90d9",        emoji: "🔵" },
  tendance: { bg: "#0a2212", border: THEME.scoreGreen, badge: THEME.scoreGreen, emoji: "📈" },
  exces:    { bg: "#221500", border: THEME.scoreAmber, badge: THEME.scoreAmber, emoji: "🚀" },
  chaos:    { bg: "#1e0808", border: THEME.scoreRed,   badge: THEME.scoreRed,   emoji: "❌" },
};

const SUBTYPE_LABELS: Record<string, string> = {
  "3br":            "3ème Borne",
  "neuneu":         "Range à plat",
  "accumulation":   "Momentum Modéré",
  "breakout":       "Breakout",
  "suivi":          "Tendance Active",
  "pullback":       "Pullback",
  "divergence":     "Divergence",
  "exces_final":    "Excès Final",
  "bulle":          "Bulle Spéculative",
  "essoufflement":  "Essoufflement",
};

const MATURITY_LABELS: Record<string, { label: string; color: string }> = {
  "jeune":            { label: "Tendance Jeune",   color: "#22c55e" },
  "en_developpement": { label: "En Développement", color: "#4ade80" },
  "mature":           { label: "Tendance Mature",  color: "#f59e0b" },
  "divergence":       { label: "Divergence ⚠️",    color: "#ef4444" },
};

function MarketContextPanel({
  context, modifiers,
}: {
  context:   MarketContext;
  modifiers: string[];
}) {
  const isEssoufflement = context.subtype === "essoufflement";
  const isBearDir = context.structure.type === "bearish";

  const cc = isEssoufflement
    ? { bg: "#1a1000", border: "#d97706", badge: THEME.scoreAmber, emoji: "⚠️" }
    : context.type === "tendance" && isBearDir
    ? { bg: "#1e0808", border: THEME.scoreRed, badge: THEME.scoreRed, emoji: "📉" }
    : CONTEXT_COLORS[context.type] || CONTEXT_COLORS["range"];

  const typeLabel =
    isEssoufflement             ? (isBearDir ? "Tendance ↓" : "Tendance ↑") :
    context.type === "range"    ? "Range"            :
    context.type === "tendance" ? (isBearDir ? "Tendance ↓" : "Tendance ↑") :
    context.type === "exces"    ? "Excès"            : "Chaos";

  // Subtype label direction-aware
  // Note : "accumulation"/"distribution" (Wyckoff) sont des phases de marché, pas des synonymes de direction.
  // On utilise des termes neutres décrivant la force du momentum observé.
  const subtypeLabel = (() => {
    if (!context.subtype) return null;
    if (context.subtype === "accumulation") return isBearDir ? "Momentum Baissier" : "Momentum Haussier";
    if (context.subtype === "suivi")        return isBearDir ? "Tendance Active ↓" : "Tendance Active ↑";
    return SUBTYPE_LABELS[context.subtype] ?? null;
  })();

  // Maturity label direction-aware
  const maturityEntry = context.maturity ? (() => {
    if (isBearDir) {
      const labels: Record<string, string> = {
        "jeune":            "Baisse Récente",
        "en_developpement": "Baisse Active",
        "mature":           "Baisse Étendue",
        "divergence":       "Divergence ⚠️",
      };
      return { label: labels[context.maturity] ?? context.maturity, color: "#ef4444" };
    }
    return MATURITY_LABELS[context.maturity] ?? null;
  })() : null;

  const adxDesc =
    context.adx == null       ? null :
    context.adx < 20          ? "Pas de tendance directionnelle" :
    context.adx < 35          ? "Tendance modérée" :
    context.adx < 50          ? "Tendance forte" :
                                 "Tendance très forte";

  const structLabel =
    context.structure.type === "bullish" ? "📈 HH+HL — Haussière" :
    context.structure.type === "bearish" ? "📉 LL+LH — Baissière" :
    context.structure.type === "mixed"   ? "↔️ Structure mixte"   :
                                           "— Structure plate";

  const eduADX: TechSignal["edu"] = {
    concept: "L'ADX (Average Directional Index) mesure la force d'une tendance, pas sa direction. Il va de 0 à 100.",
    howToRead: "Sous 20 : pas de tendance (range). 20–35 : tendance modérée. 35–50 : tendance forte. Au-dessus de 50 : tendance très forte ou excès.",
    example: context.adx != null
      ? `ADX à ${context.adx.toFixed(1)} — ${context.adx < 20 ? "marché sans direction, range probable." : context.adx < 35 ? "tendance modérée, momentum en construction." : context.adx < 50 ? "tendance forte, structure directionnelle." : "tendance très forte, possible excès."}`
      : "ADX non calculable (données insuffisantes).",
  };

  const eduStructure: TechSignal["edu"] = {
    concept: "La structure HH/HL (Higher Highs / Higher Lows) ou LL/LH (Lower Lows / Lower Highs) est la définition technique d'une tendance. Chaque swing est comparé au précédent.",
    howToRead: "HH+HL = tendance haussière confirmée. LL+LH = tendance baissière. Mélange = range ou transition. Structure plate = absence de momentum directionnel.",
    example: `Structure actuelle : ${structLabel}. ${context.structure.swings} points de retournement détectés sur la fenêtre d'analyse.`,
  };

  const eduDivergence: TechSignal["edu"] = {
    concept: "Une divergence RSI/Prix se produit quand le prix et l'indicateur RSI ne sont pas d'accord. Le prix monte mais le RSI fait des sommets plus bas = momentum qui s'épuise.",
    howToRead: "Divergence baissière (prix HH, RSI LH) : la tendance haussière s'essouffle, retournement possible. Divergence haussière (prix LL, RSI HL) : la baisse perd de la force, rebond probable.",
    example: context.divergence.type
      ? `Divergence ${context.divergence.type === "bullish" ? "haussière" : "baissière"} détectée (intensité : ${context.divergence.strength === "strong" ? "forte" : "faible"}). Signal de ${context.divergence.type === "bullish" ? "retournement à la hausse" : "retournement à la baisse"} potentiel.`
      : "Aucune divergence RSI/Prix détectée sur la période analysée. Prix et momentum sont alignés.",
  };

  return (
    <Panel
      icon={cc.emoji}
      title="Contexte de Marché"
      badge={{ label: typeLabel, color: cc.badge }}
      badge2={subtypeLabel ? { label: subtypeLabel, color: cc.badge } : undefined}
      badge3={maturityEntry ? { label: maturityEntry.label, color: maturityEntry.color } : undefined}
      rightValue={{ label: "Confiance", value: `${context.confidence}%`, color: cc.badge }}
      confidence={context.confidence}
      borderColor={cc.border}
      bgColor={cc.bg}
      defaultOpen={true}
    >
      <>
          {/* Détails — ADX / Structure / Divergence avec tooltips */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {context.adx != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: THEME.bgCard, borderRadius: 8, fontSize: 11 }}>
                <span style={{ color: THEME.textSecondary, minWidth: 34 }}>ADX</span>
                <strong style={{ color: "#b0bec5", fontFamily: "'IBM Plex Mono',monospace" }}>{context.adx.toFixed(1)}</strong>
                <span style={{ color: THEME.textSecondary, flex: 1 }}>— {adxDesc}</span>
                <EduTooltip edu={eduADX} id="ctx-adx"/>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: THEME.bgCard, borderRadius: 8, fontSize: 11 }}>
              <span style={{ color: THEME.textSecondary, minWidth: 34 }}>Struct.</span>
              <strong style={{ color: "#b0bec5", flex: 1 }}>{structLabel}</strong>
              <EduTooltip edu={eduStructure} id="ctx-struct"/>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: THEME.bgCard, borderRadius: 8, fontSize: 11 }}>
              <span style={{ color: THEME.textSecondary, minWidth: 34 }}>Div.</span>
              <span style={{
                flex: 1,
                color: context.divergence.type === "bullish" ? THEME.scoreGreen
                      : context.divergence.type === "bearish" ? THEME.scoreRed
                      : THEME.textMuted,
              }}>
                {context.divergence.type
                  ? `⚡ Divergence RSI ${context.divergence.type === "bullish" ? "haussière" : "baissière"} (${context.divergence.strength === "strong" ? "forte" : "faible"})`
                  : "Aucune divergence détectée"}
              </span>
              <EduTooltip edu={eduDivergence} id="ctx-div"/>
            </div>
          </div>

          {/* Confirmation fondamentale */}
          {context.fundamentalConfirm && (
            <div style={{
              fontSize: 11, fontWeight: 700, marginBottom: 8,
              color: context.fundamentalConfirm === "confirms" ? THEME.scoreGreen : context.fundamentalConfirm === "warns" ? THEME.scoreRed : THEME.textSecondary,
            }}>
              {context.fundamentalConfirm === "confirms" ? "✅ Fondamentaux confirment le signal technique" :
               context.fundamentalConfirm === "warns"    ? "⚠️ Fondamentaux en contradiction avec le signal" :
                                                           "— Fondamentaux neutres"}
            </div>
          )}

          {/* Phrase explicative — contexte + principal modificateur */}
          {(() => {
            const positives = modifiers.filter(m => m.startsWith("+"));
            const negatives = modifiers.filter(m => m.startsWith("-"));
            const principal = negatives[0] ?? positives[0] ?? null;
            const ctxLabel =
              isEssoufflement             ? "Essoufflement de tendance"   :
              context.type === "range"    ? (context.subtype === "3br" ? "Range en 3ème Borne" : "Phase de Range") :
              context.type === "tendance" ? (isBearDir ? "Tendance Baissière" : "Tendance Haussière") :
              context.type === "exces"    ? "Excès de marché"             : "Contexte Chaotique";
            const modLabel = principal
              ? principal.startsWith("+")
                ? `Ajustement positif : ${principal.replace(/^\+[0-9.]+ /, "")}.`
                : `Ajustement négatif : ${principal.replace(/^-[0-9.]+ /, "")}.`
              : null;
            const phrase = modLabel
              ? `${ctxLabel} détecté. ${modLabel}`
              : `${ctxLabel} détecté. Aucun ajustement fondamental significatif.`;
            return (
              <div style={{ fontSize:11, color:THEME.textSecondary, lineHeight:1.7, marginTop:4, padding:"8px 12px", background:THEME.bgCard, borderRadius:8, borderLeft:`3px solid ${cc.border}55` }}>
                {phrase}
              </div>
            );
          })()}
      </>
    </Panel>
  );
}

function MacroContextPanel({ macro, zone }: { macro: MacroContext | null | undefined; zone?: MacroZone }) {
  if (!macro || macro.error) return null;

  const effectiveZone: MacroZone = zone ?? "us";

  const rateEduBase = {
    concept: "Le taux 10 ans représente le coût auquel les États empruntent sur 10 ans. C'est la référence mondiale du coût du capital — il influence directement les taux hypothécaires, les crédits entreprises et la valorisation de tous les actifs financiers.",
    howToRead: "Au-dessus de 4.5% : environnement restrictif, les obligations deviennent compétitives face aux actions. Entre 3% et 4.5% : zone neutre. En dessous de 3% : argent bon marché, favorable aux actifs risqués et aux valorisations élevées.",
  };
  const rateSignal = macro.rate10y == null ? null
    : macro.rate10y > 4.5
      ? { label: "Taux 10 ans US — Élevés", color: "#ef4444",
          detail: `Taux 10 ans à ${macro.rate10y}% — coût du capital élevé, pression sur les valorisations growth.`,
          edu: { ...rateEduBase, example: `À ${macro.rate10y}%, le coût du capital est élevé — les entreprises à forte dette ou sans bénéfices sont particulièrement pénalisées.` } }
    : macro.rate10y > 3.0
      ? { label: "Taux 10 ans US — Modérés", color: "#f59e0b",
          detail: `Taux 10 ans à ${macro.rate10y}% — environnement neutre pour les valorisations.`,
          edu: { ...rateEduBase, example: `À ${macro.rate10y}%, l'environnement est neutre — ni favorable ni défavorable aux valorisations actuelles.` } }
      : { label: "Taux 10 ans US — Bas", color: "#22c55e",
          detail: `Taux 10 ans à ${macro.rate10y}% — environnement favorable aux actifs risqués.`,
          edu: { ...rateEduBase, example: `À ${macro.rate10y}%, l'argent bon marché soutient les valorisations élevées et favorise la prise de risque.` } };

  const curveEduBase = {
    concept: "La courbe des taux représente la différence entre les taux longs (10 ans) et courts (3 mois). Normalement, emprunter longtemps coûte plus cher qu'emprunter court — la courbe est donc positive. Quand elle s'inverse, c'est un signal d'alarme.",
    howToRead: "Spread positif > 0.5% : économie saine, croissance attendue. Entre 0 et 0.5% : transition, incertitude. Négatif (courbe inversée) : signal historique de récession dans 12-18 mois — s'est produit avant chaque récession US depuis 1970.",
  };
  const curveSignal = effectiveZone === "us" && macro.spreadCurve != null
    ? macro.spreadCurve < 0
      ? { label: "Courbe des taux — Inversée ⚠️", color: "#ef4444",
          detail: `Spread 2/10 ans à ${macro.spreadCurve}% — signal historique de récession dans 12-18 mois.`,
          edu: { ...curveEduBase, example: `Spread négatif à ${macro.spreadCurve}% — courbe inversée. Signal historiquement fiable de récession à venir.` } }
    : macro.spreadCurve < 0.5
      ? { label: "Courbe des taux — Plate", color: "#f59e0b",
          detail: `Spread 2/10 ans à ${macro.spreadCurve}% — transition, incertitude sur la croissance.`,
          edu: { ...curveEduBase, example: `Spread à ${macro.spreadCurve}% — courbe plate, transition en cours.` } }
      : { label: "Courbe des taux — Normale", color: "#22c55e",
          detail: `Spread 2/10 ans à ${macro.spreadCurve}% — contexte macro sain.`,
          edu: { ...curveEduBase, example: `Spread à ${macro.spreadCurve}% — courbe normale, contexte macro sain.` } }
    : null;

  const vixEduBase = {
    concept: "Le VIX (indice de volatilité du CBOE) mesure la volatilité implicite attendue par le marché sur les 30 prochains jours, calculée à partir des options sur le S&P500. On l'appelle 'l'indice de la peur' — il monte quand les investisseurs sont inquiets et achètent des protections.",
    howToRead: "En dessous de 20 : marché calme, faible anxiété. Entre 20 et 30 : vigilance, volatilité au-dessus de la normale. Au-dessus de 30 : stress élevé, souvent associé à des crises ou corrections importantes. Record historique : 89.53 en mars 2020 (Covid).",
  };
  const vixSignal = macro.vix == null ? null
    : macro.vix > 30
      ? { label: "Peur élevée", color: "#ef4444",
          detail: `VIX à ${macro.vix} — marché en stress, volatilité forte. Opportunité ou piège selon le contexte.`,
          edu: { ...vixEduBase, example: `VIX à ${macro.vix} — stress élevé. Les options sont chères, le marché anticipe de fortes variations.` } }
    : macro.vix > 20
      ? { label: "Vigilance", color: "#f59e0b",
          detail: `VIX à ${macro.vix} — volatilité au-dessus de la normale, prudence sur les entrées.`,
          edu: { ...vixEduBase, example: `VIX à ${macro.vix} — volatilité au-dessus de la normale. Prudence sur le timing des entrées.` } }
      : { label: "Marché calme", color: "#22c55e",
          detail: `VIX à ${macro.vix} — faible volatilité implicite, marché sans stress apparent.`,
          edu: { ...vixEduBase, example: `VIX à ${macro.vix} — marché serein. Faible prime de risque implicite.` } };

  const cpiSignal = macro.cpi == null ? null
    : macro.cpi > 4
      ? { label: "Inflation élevée", color: "#ef4444",
          detail: `CPI à ${macro.cpi}% — inflation persistante, pression sur les marges et les taux réels.`,
          edu: undefined }
    : macro.cpi > 2.5
      ? { label: "Inflation modérée", color: "#f59e0b",
          detail: `CPI à ${macro.cpi}% — légèrement au-dessus de la cible Fed (2%). Surveillance maintenue.`,
          edu: undefined }
      : { label: "Inflation maîtrisée", color: "#22c55e",
          detail: `CPI à ${macro.cpi}% — proche de la cible Fed. Contexte favorable à la stabilité des taux.`,
          edu: undefined };

  const indexSignal = macro.indexRegional != null && macro.indexLabel != null ? (() => {
    const val = macro.indexRegional!;
    const lbl = macro.indexLabel!;
    const fmtVal = val.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
    let example: string;
    if (effectiveZone === "eur") {
      example = val > 5500
        ? `L'Euro Stoxx 50 à ${fmtVal} évolue près de ses hauts historiques récents — les valorisations européennes sont globalement tendues, ce qui peut limiter le potentiel de revalorisation même pour de bonnes entreprises.`
        : val > 4500
        ? `L'Euro Stoxx 50 à ${fmtVal} est en territoire intermédiaire — ni euphorie ni pessimisme, contexte neutre pour les actions européennes.`
        : `L'Euro Stoxx 50 à ${fmtVal} est en repli marqué — vent contraire pour les actions européennes, même les fondamentaux solides peuvent être ignorés temporairement par le marché.`;
    } else if (effectiveZone === "gbp") {
      example = val > 8000
        ? `Le FTSE 100 à ${fmtVal} est proche de ses sommets — marché britannique bien orienté, mais peu de marge pour les déceptions.`
        : val > 7000
        ? `Le FTSE 100 à ${fmtVal} en zone intermédiaire — contexte neutre pour les actions britanniques.`
        : `Le FTSE 100 à ${fmtVal} en repli — contexte défavorable pour les actions britanniques.`;
    } else if (effectiveZone === "jpy") {
      example = val > 35000
        ? `Le Nikkei 225 à ${fmtVal} évolue à des niveaux historiquement élevés — le marché japonais est bien orienté mais sensible aux fluctuations du yen.`
        : val > 28000
        ? `Le Nikkei 225 à ${fmtVal} en zone intermédiaire — contexte neutre pour les actions japonaises.`
        : `Le Nikkei 225 à ${fmtVal} en repli — vent contraire pour les actions japonaises.`;
    } else {
      example = `Le ${lbl} est à ${fmtVal}. Contexte régional à croiser avec les fondamentaux de l'entreprise.`;
    }
    return {
      label: `${lbl} : ${fmtVal}`, color: "#94a3b8", detail: null,
      edu: {
        concept: "L'indice régional représente la santé globale du marché actions dans la zone géographique de l'entreprise analysée. Il reflète le sentiment des investisseurs locaux et le contexte économique régional.",
        howToRead: "Un indice proche de ses plus hauts historiques indique un marché optimiste — les valorisations individuelles sont souvent tirées vers le haut. Un indice en repli crée un vent contraire même pour les bonnes entreprises.",
        example,
      },
    };
  })() : null;

  const signals = [rateSignal, curveSignal, vixSignal, cpiSignal, indexSignal].filter(Boolean);
  if (signals.length === 0) return null;

  const scoredSignals = [rateSignal, curveSignal, vixSignal, cpiSignal].filter(Boolean);
  const reds   = scoredSignals.filter(s => s!.color === "#ef4444").length;
  const ambers = scoredSignals.filter(s => s!.color === "#f59e0b").length;
  const panelColor = reds >= 2 ? "#ef4444" : ambers >= 2 ? "#f59e0b" : "#22c55e";

  return (
    <Panel
      icon="🌍"
      title="Contexte Macro"
      badge2={{ label: `Yahoo Finance · ${ZONE_TICKERS[effectiveZone]}`, color: THEME.textMuted }}
      borderColor={panelColor}
      defaultOpen={true}
    >
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {signals.map((s, i) => s && (
          <div key={i} style={{
            display:"flex", alignItems:"flex-start", gap:10,
            padding:"8px 10px", background:THEME.bgCard,
            borderRadius:8, borderLeft:`3px solid ${s.color}`,
          }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:700, color:s.color }}>
                {s.label}
              </div>
              {s.detail && (
                <div style={{ fontSize:11, color:THEME.textSecondary, marginTop:2, lineHeight:1.5 }}>
                  {s.detail}
                </div>
              )}
            </div>
            {s.edu && <EduTooltip edu={s.edu} id={`macro-${i}`}/>}
          </div>
        ))}
        <div style={{ fontSize:9, color:THEME.textMuted, marginTop:4 }}>
          Source : Yahoo Finance · Données journalières
        </div>
      </div>
    </Panel>
  );
}

// ════════════════════════════════════════════════════════════════
// COUCHE 4c — RECOMMANDATION D'ENTRÉE
// ════════════════════════════════════════════════════════════════

interface EntryRecommendation {
  type    : "wait" | "caution" | "favorable" | "none";
  icon    : string;
  title   : string;
  reasons : string[];
  triggers: string[];
}

function SentimentPanel({ metrics, macro }: { metrics: any; macro?: MacroContext | null }) {
  if (!metrics) return null;
  const qt = (metrics.quoteType || "").toUpperCase();
  if (qt !== "EQUITY") return null;

  const instResult  = scoreSentimentInstitutional(
    metrics.heldInsiders,
    metrics.heldInstitutions,
    metrics.shortPercentFloat,
    metrics.shortRatio,
    metrics.mktCap,
  );
  const pressResult = scoreSentimentPressure(
    metrics.change52w,
    metrics.shortPercentFloat,
    macro?.vix,
  );

  const hasData = instResult.signals.length > 0 || pressResult.signals.length > 0;
  if (!hasData) return null;

  const avgScore = parseFloat(((instResult.score + pressResult.score) / 2).toFixed(1));
  const panelColor =
    avgScore >= 7 ? THEME.scoreGreen :
    avgScore >= 4 ? THEME.scoreAmber :
    THEME.scoreRed;

  const eduInst = {
    concept: "Le score Smart Money reflète la confiance des investisseurs professionnels dans le titre : dirigeants (insiders), grands fonds (institutionnels) et vendeurs à découvert (shorts). Ces acteurs ont accès à une information et une analyse supérieures à celle du marché de détail.",
    howToRead: "Insiders > 10% : les dirigeants ont mis leur propre argent. Institutionnels > 70% : les grands fonds ont validé le dossier. Short float < 3% : les professionnels ne parient pas contre. Un score élevé = alignement des 'mains fortes'.",
    example: metrics.heldInsiders != null
      ? `Les insiders détiennent ${(metrics.heldInsiders*100).toFixed(1)}% du capital${metrics.heldInstitutions != null ? `, les institutionnels ${(metrics.heldInstitutions*100).toFixed(1)}%` : ""}. ${instResult.score >= 7 ? "Profil de confiance élevée des professionnels." : instResult.score >= 4 ? "Profil neutre — pas de signal fort dans un sens ni dans l'autre." : "Défiance notable des professionnels à surveiller."}`
      : "Données de détention non disponibles pour ce titre.",
  };

  const eduPress = {
    concept: "Le score de Pression de Marché mesure la dynamique court/moyen terme du titre : momentum 52 semaines, intensité des positions short, et contexte de volatilité global (VIX). Il reflète la pression acheteuse ou vendeuse actuelle.",
    howToRead: "Un titre en repli modéré (-10% à -30%) avec peu de shorts représente souvent un meilleur point d'entrée qu'un titre en forte hausse déjà pricé. Le VIX contextualise le risque global du marché.",
    example: metrics.change52w != null
      ? `Le titre a évolué de ${(metrics.change52w*100).toFixed(1)}% sur 12 mois${metrics.shortPercentFloat != null ? `, avec ${(metrics.shortPercentFloat*100).toFixed(1)}% du flottant vendu à découvert` : ""}. ${pressResult.score >= 7 ? "Pression favorable — bon rapport timing/risque." : pressResult.score >= 4 ? "Pression neutre." : "Pression défavorable — timing à risque."}`
      : "Données de momentum non disponibles.",
  };

  return (
    <Panel
      icon="🧠"
      title="Sentiment"
      badge={{ label: `Smart Money · ${avgScore}/10`, color: panelColor }}
      borderColor={panelColor}
      defaultOpen={true}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Deux jauges */}
        <div style={{
          display: "flex", flexDirection: "row",
          justifyContent: "space-evenly", alignItems: "center",
          flexWrap: "wrap", gap: 16,
        }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <ScoreGauge score={instResult.score}/>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, color: scoreColor(instResult.score), fontFamily: "'IBM Plex Mono',monospace" }}>
                {instResult.score}
              </span>
              <span style={{ fontSize: 13, color: THEME.textSecondary, fontFamily: "'IBM Plex Mono',monospace" }}>/10</span>
            </div>
            <div style={{ fontSize: 9, color: THEME.textMuted, textTransform: "uppercase", letterSpacing: 1.5, display: "flex", alignItems: "center", gap: 4 }}>
              Smart Money
              <EduTooltip edu={eduInst} id="sent-inst"/>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <ScoreGauge score={pressResult.score}/>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, color: scoreColor(pressResult.score), fontFamily: "'IBM Plex Mono',monospace" }}>
                {pressResult.score}
              </span>
              <span style={{ fontSize: 13, color: THEME.textSecondary, fontFamily: "'IBM Plex Mono',monospace" }}>/10</span>
            </div>
            <div style={{ fontSize: 9, color: THEME.textMuted, textTransform: "uppercase", letterSpacing: 1.5, display: "flex", alignItems: "center", gap: 4 }}>
              Pression Marché
              <EduTooltip edu={eduPress} id="sent-press"/>
            </div>
          </div>
        </div>

        {/* Signaux Smart Money */}
        {instResult.signals.length > 0 && (
          <div>
            <div style={{ fontSize: 9, color: THEME.textMuted, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 800, marginBottom: 6 }}>
              Détention & Positions
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {instResult.signals.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 10px", background: THEME.bgCard, borderRadius: 7, borderLeft: `3px solid ${s.color}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: THEME.textSecondary, marginTop: 2, lineHeight: 1.5 }}>{s.detail}</div>
                  </div>
                  <EduTooltip edu={s.edu} id={`sent-inst-${i}`}/>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signaux Pression Marché */}
        {pressResult.signals.length > 0 && (
          <div>
            <div style={{ fontSize: 9, color: THEME.textMuted, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 800, marginBottom: 6 }}>
              Dynamique de Marché
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {pressResult.signals.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 10px", background: THEME.bgCard, borderRadius: 7, borderLeft: `3px solid ${s.color}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: THEME.textSecondary, marginTop: 2, lineHeight: 1.5 }}>{s.detail}</div>
                  </div>
                  <EduTooltip edu={s.edu} id={`sent-press-${i}`}/>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontSize: 9, color: THEME.textMuted }}>
          Source : Yahoo Finance · Données de détention trimestrielles
        </div>
      </div>
    </Panel>
  );
}

// ── RECOMMANDATION D'ENTRÉE CRYPTO ────────────────────────────────────
function computeCryptoEntryRecommendation(
  context     : MarketContext,
  techSignals : TechSignal[],
  sinewave    : SinewaveResult | null,
  fearGreed   : { value: number; label: string } | null,
  funding     : { rate: number; markPrice: number } | null,
): EntryRecommendation {
  const NONE: EntryRecommendation = { type: "none", icon: "", title: "", reasons: [], triggers: [] };

  const hasSignalLabel = (lbl: string) => techSignals.some(s => s.label === lbl || s.label.startsWith(lbl));
  const hasDeathCross  = hasSignalLabel("Death Cross");
  const hasGoldenCross = hasSignalLabel("Golden Cross");
  const rsiSignal      = techSignals.find(s => s.label.startsWith("RSI"));
  const rsiValue       = rsiSignal ? parseFloat(rsiSignal.label.split(" ")[1]) : null;
  const momentum14     = sinewave?.momentum14 ?? 0;
  const fg             = fearGreed?.value ?? null;
  const fundingRate    = funding?.rate ?? null;

  // W1 — Chaos
  if (context.type === "chaos") return {
    type: "wait", icon: "⛔",
    title: "Attendre la stabilisation — volatilité extrême",
    reasons: ["Contexte chaotique — ATR 3× la normale, aucune direction claire", "Les cryptos en chaos peuvent perdre 30-50% rapidement"],
    triggers: ["ADX se stabilise sous 20", "Volatilité ATR revient à la normale", "Structure HH/HL commence à se former"],
  };

  // W2 — Death Cross + baissier + funding positif (longs piégés)
  if (hasDeathCross && context.structure.type === "bearish" && fundingRate != null && fundingRate > 0.0001) return {
    type: "wait", icon: "⛔",
    title: "Tendance baissière confirmée — longs encore dominants",
    reasons: [
      "Death Cross actif (EMA50 < EMA200) — tendance de fond baissière",
      "Structure LL+LH confirmée",
      `Funding rate positif (${(fundingRate * 100).toFixed(4)}%) — les longs n'ont pas encore capitulé`,
    ],
    triggers: ["Funding rate devient négatif (capitulation des longs)", "RSI descend sous 25", "Golden Cross + structure HH+HL"],
  };

  // W3 — Death Cross + baissier (sans données funding)
  if (hasDeathCross && context.structure.type === "bearish") return {
    type: "wait", icon: "⛔",
    title: "Attendre un retournement haussier confirmé",
    reasons: ["Death Cross actif — tendance baissière de fond", "Structure de prix LL+LH — chaque rebond est vendu"],
    triggers: ["Golden Cross (EMA50 repasse au-dessus EMA200)", "RSI < 25 + creux de cycle Sinewave", "Structure HH+HL sur 3 pivots confirmés"],
  };

  // W4 — RSI extrême + sommet de cycle ou funding élevé
  if (rsiValue != null && rsiValue > 78 && (sinewave?.cycleTurn === "peak" || (fundingRate != null && fundingRate > 0.0003))) return {
    type: "wait", icon: "⛔",
    title: "Zone de surachat extrême — attendre le prochain cycle",
    reasons: [
      `RSI à ${rsiValue} — surachat extrême en crypto`,
      sinewave?.cycleTurn === "peak" ? "Sommet de cycle Sinewave détecté" : `Funding rate élevé (${(fundingRate! * 100).toFixed(4)}%) — euphorie des longs`,
    ],
    triggers: ["RSI redescend sous 50", "Creux de cycle Sinewave", "Funding rate revient sous 0.01%"],
  };

  // W5 — Extreme Greed + Death Cross
  if (fg != null && fg > 85 && hasDeathCross) return {
    type: "wait", icon: "⛔",
    title: "Euphorie sur tendance baissière — risque élevé",
    reasons: [
      `Fear & Greed à ${fg}/100 — Extreme Greed`,
      "Death Cross actif — la structure de fond contredit le sentiment",
      "Configuration historiquement précurseur de corrections sévères",
    ],
    triggers: ["Fear & Greed redescend sous 60", "Golden Cross", "Structure haussière confirmée"],
  };

  // C1 — Death Cross seul
  if (hasDeathCross) return {
    type: "caution", icon: "⚠️",
    title: "Death Cross actif — prudence sur la tendance de fond",
    reasons: ["EMA50 sous EMA200 — momentum baissier moyen terme"],
    triggers: ["Golden Cross", "RSI < 30 + creux Sinewave pour entrée tactique uniquement"],
  };

  // C2 — Essoufflement haussier + RSI suracheté
  if (context.subtype === "essoufflement" && context.structure.type === "bullish" && rsiValue != null && rsiValue > 65) return {
    type: "caution", icon: "⚠️",
    title: "Tendance haussière qui s'essouffle — attendre le creux",
    reasons: [
      `RSI à ${rsiValue} — surachat sur tendance essoufflée`,
      "Momentum en déclin — les corrections crypto peuvent être -20 à -40%",
    ],
    triggers: ["RSI redescend sous 45", "Creux de cycle Sinewave", "MACD recroise à la hausse sa ligne de signal"],
  };

  // C3 — Extreme Greed
  if (fg != null && fg > 80) return {
    type: "caution", icon: "⚠️",
    title: "Euphorie de marché — position réduite recommandée",
    reasons: [
      `Fear & Greed à ${fg}/100 — Extreme Greed`,
      "Les entrées en Extreme Greed offrent historiquement de mauvais rendements ajustés au risque",
    ],
    triggers: ["Fear & Greed redescend sous 60", "Creux de cycle Sinewave + RSI < 50"],
  };

  // C4 — Structure baissière + survente (rebond tactique)
  if (context.structure.type === "bearish" && rsiValue != null && rsiValue < 30) return {
    type: "caution", icon: "⚠️",
    title: "Survente sur tendance baissière — rebond tactique possible",
    reasons: [
      `RSI à ${rsiValue} — survente extrême`,
      "Structure baissière de fond — tout rebond reste tactique et de courte durée",
    ],
    triggers: ["Stabilisation sur 2-3 chandelles + volume supérieur à la moyenne", "Creux de cycle Sinewave confirmé"],
  };

  // C5 — Extreme Fear
  if (fg != null && fg < 20) return {
    type: "caution", icon: "⚠️",
    title: "Peur extrême — opportunité tactique à confirmer",
    reasons: [
      `Fear & Greed à ${fg}/100 — Extreme Fear`,
      "Les marchés crypto en peur extrême précèdent souvent des rebonds significatifs",
    ],
    triggers: ["Creux de cycle Sinewave + RSI < 30", "Première chandelle haussière avec volume fort", "Structure HH+HL qui commence à se former"],
  };

  // C6 — Funding négatif persistant sur structure non baissière
  if (fundingRate != null && fundingRate < -0.0002 && context.structure.type !== "bearish") return {
    type: "caution", icon: "⚠️",
    title: "Shorts dominants — compression possible",
    reasons: [
      `Funding rate négatif (${(fundingRate * 100).toFixed(4)}%) — les shorts paient les longs`,
      "Configuration précurseur de short squeeze en crypto",
    ],
    triggers: ["Breakout au-dessus d'une résistance avec volume", "RSI dépasse 55 + momentum positif"],
  };

  // C7 — Range
  if (context.type === "range") return {
    type: "caution", icon: "⚠️",
    title: "Marché en range — entrée sur support ou attendre le breakout",
    reasons: ["Pas de tendance directionnelle (ADX bas)", "La crypto oscille entre support et résistance"],
    triggers: ["Breakout haussier avec volume 2× la moyenne", "ADX passe au-dessus de 25", "Golden Cross"],
  };

  // F1 — Configuration optimale
  if (context.type === "tendance" && context.structure.type === "bullish" && hasGoldenCross && !hasDeathCross && (rsiValue == null || rsiValue < 70)) {
    const reasons: string[] = ["Golden Cross actif — tendance haussière de fond confirmée"];
    if (sinewave?.cycleTurn === "trough") reasons.push("Creux de cycle Sinewave — timing optimal");
    if (momentum14 > 5) reasons.push(`Momentum positif +${momentum14.toFixed(1)}% sur 14 jours`);
    if (fg != null && fg > 50 && fg < 75) reasons.push(`Fear & Greed ${fg}/100 — sentiment haussier modéré`);
    if (fundingRate != null && fundingRate > 0 && fundingRate < 0.0002) reasons.push("Funding rate légèrement positif — longs dominants sans euphorie");
    return {
      type: "favorable", icon: "✅",
      title: "Configuration favorable — entrée progressive possible",
      reasons,
      triggers: ["Surveiller RSI > 75 pour commencer à alléger", "Fear & Greed > 80 : réduire la position", "Stop suggéré : sous le dernier plus bas de structure (HL)"],
    };
  }

  // F2 — Creux de cycle sur structure haussière
  if (sinewave?.cycleTurn === "trough" && context.structure.type === "bullish" && (rsiValue == null || rsiValue < 55)) return {
    type: "favorable", icon: "✅",
    title: "Creux de cycle en tendance haussière — fenêtre d'entrée",
    reasons: ["Sinewave signale un retournement cyclique haussier", "Structure de prix haussière (HH+HL) intacte"],
    triggers: ["Confirmer avec une chandelle haussière + volume", "Stop suggéré : sous le dernier HL", "RSI > 70 : commencer à alléger"],
  };

  // F3 — Survente extrême sur structure haussière
  if (rsiValue != null && rsiValue < 25 && context.structure.type === "bullish" && !hasDeathCross) return {
    type: "favorable", icon: "✅",
    title: "Survente extrême sur structure haussière — opportunité d'accumulation",
    reasons: [
      `RSI à ${rsiValue} — survente extrême en contexte haussier`,
      "Structure de fond haussière maintenue — la baisse semble exagérée",
    ],
    triggers: ["Confirmation sur 1-2 chandelles de rebond avec volume", "Ne pas renforcer si la structure HL est cassée"],
  };

  // F4 — Extreme Fear + Golden Cross
  if (fg != null && fg < 25 && hasGoldenCross) return {
    type: "favorable", icon: "✅",
    title: "Peur extrême sur tendance haussière — configuration rare",
    reasons: [
      `Fear & Greed à ${fg}/100 — Extreme Fear`,
      "Golden Cross actif — la tendance de fond reste haussière",
      "La divergence sentiment/tendance est historiquement favorable",
    ],
    triggers: ["Creux de cycle Sinewave confirmé", "Volume en augmentation sur chandelles haussières"],
  };

  return NONE;
}

function computeEntryRecommendation(
  metrics        : any,
  context        : MarketContext | null,
  techSignals    : TechSignal[],
  sinewave       : SinewaveResult | null,
  macro          : MacroContext | null | undefined,
  finalScore     : number | null,
  fundamentalScore: number | null,
): EntryRecommendation {
  const NONE: EntryRecommendation = { type: "none", icon: "", title: "", reasons: [], triggers: [] };
  if (!context) return NONE;

  // Helpers pour extraire signaux techniques
  const hasSignalLabel = (lbl: string) => techSignals.some(s => s.label === lbl || s.label.startsWith(lbl));
  const hasDeathCross  = hasSignalLabel("Death Cross");
  const hasGoldenCross = hasSignalLabel("Golden Cross");
  const rsiSignal      = techSignals.find(s => s.label.startsWith("RSI"));
  const rsiValue       = rsiSignal ? parseFloat(rsiSignal.label.split(" ")[1]) : null;
  const momentum14     = sinewave?.momentum14 ?? 0;

  // ── BLOQUANTES (wait) ──────────────────────────────────────────
  // W1 — Chaos
  if (context.type === "chaos") return {
    type: "wait", icon: "⛔",
    title: "Attendre la stabilisation du marché",
    reasons: ["Contexte chaotique — volatilité extrême sans direction claire"],
    triggers: ["ADX redescend sous 20 avec structure définie", "VIX redescend sous 25"],
  };

  // W2 — Death Cross + baissier
  if (hasDeathCross && context.structure.type === "bearish") return {
    type: "wait", icon: "⛔",
    title: "Attendre un signal de retournement haussier",
    reasons: ["Death Cross actif — EMA50 sous EMA200", "Structure baissière confirmée (LL+LH)"],
    triggers: [
      "Croisement Golden Cross (EMA50 repasse au-dessus de EMA200)",
      "RSI descend sous 30 (zone de survente extrême)",
      "Creux de cycle Sinewave détecté",
    ],
  };

  // W3 — Essoufflement baissier sans soutien fondamental
  if (context.subtype === "essoufflement" && context.structure.type === "bearish"
      && (fundamentalScore == null || fundamentalScore < 5)) return {
    type: "wait", icon: "⛔",
    title: "Attendre épuisement complet de la baisse",
    reasons: ["Tendance baissière qui s'essouffle mais fondamentaux insuffisants pour un rebond durable"],
    triggers: ["Creux de cycle Sinewave", "RSI < 30", "Score fondamental ≥ 5"],
  };

  // W4 — Macro très défavorable
  if (macro && !macro.error && macro.vix != null && macro.vix > 35
      && macro.spreadCurve != null && macro.spreadCurve < 0) return {
    type: "wait", icon: "⛔",
    title: "Attendre normalisation du contexte macro",
    reasons: ["VIX > 35 — stress de marché élevé", "Courbe des taux inversée — signal de récession"],
    triggers: ["VIX redescend sous 25", "Spread courbe redevient positif"],
  };

  // W5 — Valorisation extrême + momentum fort
  if (metrics?.gValorisation != null && metrics.gValorisation <= 2
      && context.structure.type === "bullish") return {
    type: "wait", icon: "⛔",
    title: "Attendre une correction de valorisation",
    reasons: [
      "Valorisation extrême (score ≤ 2/10) — le marché price la perfection",
      "Momentum haussier fort — point d'entrée défavorable",
    ],
    triggers: [
      "Correction de −20% ou plus depuis le sommet",
      "P/E revient sous 30",
      "RSI descend sous 40",
    ],
  };

  // W5b — Valorisation tendue + essoufflement
  if (context.subtype === "essoufflement"
      && metrics?.gValorisation != null && metrics.gValorisation <= 3.5
      && context.structure.type === "bullish") {
    const gVal = metrics.gValorisation as number;
    const reasons: string[] = [`Valorisation tendue (score ${gVal.toFixed(1)}/10) — prix déjà élevé`];
    if (rsiValue != null && rsiValue < 40)
      reasons.push(`RSI en zone de survente (${rsiValue}) — rebond technique possible mais entrée risquée`);
    if (sinewave?.cycleTurn === "trough")
      reasons.push("Creux de cycle détecté — signal positif mais valorisation limite l'upside");
    reasons.push("Momentum en déclin — tendance haussière qui s'essouffle");
    if (sinewave?.dominantPeriod != null && sinewave.dominantPeriod > 100)
      reasons.push(`Cycle dominant long (~${sinewave.dominantPeriod}j) — l'horizon de revalorisation est pluriannuel, pas un signal court terme`);
    const peTarget = metrics.pe != null ? Math.round(metrics.pe * 0.7) : 20;
    const triggers: string[] = [
      "Correction de −15% ou plus depuis le sommet récent",
      `P/E revient sous ${peTarget}`,
    ];
    if (rsiValue != null && rsiValue < 40)
      triggers.push("Confirmation du rebond avec volume supérieur à la moyenne");
    if (sinewave?.dominantPeriod != null && sinewave.dominantPeriod > 100)
      triggers.push("Entrée fractionnée progressive envisageable si horizon > 3 ans, indépendamment du timing court terme");
    return { type: "wait", icon: "⛔", title: "Attendre une correction de valorisation", reasons, triggers };
  }

  // ── PRUDENTES (caution) ────────────────────────────────────────
  // C1 — Qualité solide, timing défavorable
  if (fundamentalScore != null && fundamentalScore >= 6.5
      && finalScore != null && finalScore <= 4.5) {
    const reasons: string[] = [];
    if (hasDeathCross) reasons.push("Death Cross actif — tendance de fond baissière");
    else if (context.subtype === "essoufflement" && context.structure.type === "bullish")
      reasons.push("Tendance haussière qui s'essouffle — risque de pullback");
    else if (rsiValue != null && rsiValue > 65) reasons.push("RSI en zone de surachat — entrée prématurée");
    else if (momentum14 < -8) reasons.push("Momentum négatif à court terme");
    else reasons.push("Timing technique défavorable");
    const triggers: string[] = [];
    if (hasGoldenCross) triggers.push("Pullback vers l'EMA50");
    if (sinewave) triggers.push("Creux de cycle Sinewave");
    if (rsiValue != null && rsiValue > 65) triggers.push("RSI redescend sous 45");
    if (hasDeathCross) triggers.push("Golden Cross");
    return { type: "caution", icon: "⚠️", title: "Qualité solide — attendre un meilleur timing", reasons, triggers };
  }

  // C2 — Zone de survente sur bons fondamentaux
  if (fundamentalScore != null && fundamentalScore >= 5.5
      && rsiValue != null && rsiValue <= 35
      && context.structure.type !== "bearish") return {
    type: "caution", icon: "⚠️",
    title: "Zone de survente — opportunité tactique à confirmer",
    reasons: [
      "RSI en zone de survente sur fondamentaux sains",
      "Possible rebond technique — confirmer avec volume et structure",
    ],
    triggers: [
      "Stabilisation du prix sur 2-3 séances",
      "Volume supérieur à la moyenne sur une séance haussière",
      "Creux de cycle Sinewave confirmé",
    ],
  };

  // C3 — Essoufflement haussier avec bons fondamentaux
  if (context.subtype === "essoufflement" && context.structure.type === "bullish"
      && fundamentalScore != null && fundamentalScore >= 6) {
    const triggers = ["Creux de cycle Sinewave", "MACD recroise à la hausse sa ligne de signal"];
    const emaSignal = techSignals.find(s => s.label.includes("EMA") || s.label === "Golden Cross");
    if (emaSignal?.detail) {
      const m = emaSignal.detail.match(/EMA50[^0-9]*([0-9]+[.,]?[0-9]*)/);
      if (m) triggers.unshift(`Pullback vers l'EMA50 (${m[1]} ${metrics?.currency ?? ""})`);
      else triggers.unshift("Pullback vers l'EMA50");
    }
    return {
      type: "caution", icon: "⚠️",
      title: "Tendance haussière qui s'essouffle — entrée fractionnée possible",
      reasons: [
        "Momentum déclinant mais tendance de fond haussière intacte",
        "Fondamentaux solides — risque limité sur le long terme",
      ],
      triggers,
    };
  }

  // C4 — Range avec bons fondamentaux
  if (context.type === "range" && fundamentalScore != null && fundamentalScore >= 6.5) return {
    type: "caution", icon: "⚠️",
    title: "Marché en range — entrée sur support possible",
    reasons: ["Pas de tendance directionnelle", "Fondamentaux justifient une position à long terme"],
    triggers: [
      "Breakout au-dessus de la résistance avec volume",
      "ADX passe au-dessus de 25",
      "Golden Cross",
    ],
  };

  // ── FAVORABLES ─────────────────────────────────────────────────
  // F1 — Configuration optimale
  if (fundamentalScore != null && fundamentalScore >= 5.5
      && finalScore != null && finalScore >= 5.5
      && context.type === "tendance"
      && context.structure.type === "bullish" && !hasDeathCross) {
    const reasons: string[] = [];
    if (hasGoldenCross) reasons.push("Golden Cross actif — tendance haussière confirmée");
    if (sinewave?.cycleTurn === "trough") reasons.push("Creux de cycle détecté — timing optimal");
    if (momentum14 > 5) reasons.push(`Momentum positif +${momentum14.toFixed(1)}% sur 14 séances`);
    reasons.push(`Fondamentaux solides (${fundamentalScore}/10)`);
    return {
      type: "favorable", icon: "✅",
      title: "Configuration favorable — entrée progressive possible",
      reasons,
      triggers: ["Surveiller RSI > 70 (zone de surachat) pour alléger"],
    };
  }

  // F2 — Rebond sur fondamentaux + survente extrême
  if (fundamentalScore != null && fundamentalScore >= 6
      && rsiValue != null && rsiValue <= 30
      && context.structure.type !== "bearish") return {
    type: "favorable", icon: "✅",
    title: "Survente extrême sur fondamentaux solides — opportunité de rebond",
    reasons: [
      "RSI en zone de survente extrême (<30)",
      "Fondamentaux solides justifient un rebond vers la valeur intrinsèque",
    ],
    triggers: [
      "Confirmer avec une bougie de retournement haussière",
      "Volume supérieur à la normale sur la séance de rebond",
    ],
  };

  // F3 — Creux de cycle confirmé
  if (sinewave?.cycleTurn === "trough"
      && fundamentalScore != null && fundamentalScore >= 5.5
      && finalScore != null && finalScore >= 5) return {
    type: "favorable", icon: "✅",
    title: "Creux de cycle détecté — fenêtre d'entrée",
    reasons: [
      "Sinewave Ehlers signale un retournement cyclique haussier",
      "Score fondamental suffisant pour justifier une position",
    ],
    triggers: [
      "Surveiller confirmation RSI et volume dans les 3-5 séances",
      "Stop suggéré : sous le dernier plus bas",
    ],
  };
  // C5 — Macro modérément défavorable (après F1/F2/F3)
  if (macro && !macro.error && finalScore != null && finalScore >= 5
      && ((macro.vix != null && macro.vix > 25) || (macro.rate10y != null && macro.rate10y > 4.5))) {
    const reasons: string[] = [];
    if (macro.vix != null && macro.vix > 25) reasons.push(`VIX à ${macro.vix} — volatilité élevée`);
    if (macro.rate10y != null && macro.rate10y > 4.5) reasons.push(`Taux à ${macro.rate10y}% — pression sur les valorisations`);
    const triggers: string[] = [];
    if (macro.vix != null && macro.vix > 25) triggers.push("VIX redescend sous 20");
    if (macro.rate10y != null && macro.rate10y > 4.5) triggers.push("Taux 10 ans repassent sous 4%");
    return {
      type: "caution", icon: "⚠️",
      title: "Contexte macro à surveiller — position réduite recommandée",
      reasons, triggers,
    };
  }

  // ── FALLBACK — context null mais données fondamentales disponibles ──
  if (fundamentalScore != null && context === null) {
    if (fundamentalScore >= 6.5) return {
      type: "caution", icon: "⚠️",
      title: "Fondamentaux solides — données techniques insuffisantes",
      reasons: [
        `Score fondamental ${fundamentalScore}/10 — qualité intrinsèque solide`,
        "Données techniques insuffisantes pour évaluer le timing d'entrée",
      ],
      triggers: [
        "Analyser le graphique sur une plateforme technique dédiée (TradingView...)",
        "Surveiller RSI, structure de prix et volume avant d'entrer",
      ],
    };
    if (fundamentalScore >= 4 && finalScore != null && finalScore >= 5) return {
      type: "caution", icon: "⚠️",
      title: "Profil correct — contexte technique à confirmer",
      reasons: [
        `Score fondamental ${fundamentalScore}/10`,
        "Données techniques insuffisantes pour évaluer le timing",
      ],
      triggers: ["Surveiller RSI et structure de prix avant d'entrer"],
    };
  }

  return NONE;
}

const ENTRY_EDU: Record<string, TechSignal["edu"]> = {
  "Golden Cross": {
    concept: "Le Golden Cross se produit quand la moyenne mobile courte (EMA50) repasse au-dessus de la moyenne mobile longue (EMA200). C'est l'un des signaux haussiers les plus connus en analyse technique.",
    howToRead: "EMA50 > EMA200 = tendance haussière de fond confirmée. Le Golden Cross signale que le momentum court terme a repris le dessus sur le long terme. Plus fiable quand il s'accompagne d'un volume en hausse.",
    example: "Historiquement, les Golden Cross ont précédé des hausses importantes sur les grands actifs. Ce n'est pas infaillible — c'est un signal de confirmation, pas de prédiction.",
  },
  "Death Cross": {
    concept: "Le Death Cross se produit quand la moyenne mobile courte (EMA50) passe sous la moyenne mobile longue (EMA200). C'est le signal baissier symétrique du Golden Cross.",
    howToRead: "EMA50 < EMA200 = tendance baissière de fond active. Le marché a perdu son momentum haussier sur le moyen terme. Les rebonds dans ce contexte sont souvent temporaires.",
    example: "Les Death Cross précèdent souvent des phases baissières prolongées. Attendre le Golden Cross avant de reprendre une position longue est une règle de prudence classique.",
  },
  "Death Cross actif — EMA50 sous EMA200 — momentum baissier moyen terme": {
    concept: "Le Death Cross indique que la moyenne des 50 derniers jours est passée sous celle des 200 derniers jours — signal que la tendance baissière est installée sur le moyen terme.",
    howToRead: "Tant que l'EMA50 reste sous l'EMA200, la tendance de fond est baissière. Les rebonds peuvent être violents mais restent statistiquement vendeurs dans ce contexte.",
    example: "En pratique : éviter les achats impulsifs sur les rebonds tant que le Death Cross est actif. Attendre le Golden Cross pour confirmer un retournement durable.",
  },
  "EMA50 sous EMA200 — momentum baissier moyen terme": {
    concept: "Le Death Cross est actif : la moyenne mobile des 50 derniers jours est passée sous celle des 200 derniers jours. C'est le signal baissier structurel le plus connu en analyse technique.",
    howToRead: "Tant que l'EMA50 reste sous l'EMA200, la tendance de fond est baissière. Chaque rebond est une opportunité de sortie, pas d'achat.",
    example: "Ce signal précède souvent des baisses prolongées. La règle classique : ne pas acheter tant que le Death Cross est actif, attendre le Golden Cross.",
  },
  "Death Cross actif — EMA50 sous EMA200": {
    concept: "Le Death Cross indique que la tendance baissière est installée sur le moyen terme — l'EMA50 est passée sous l'EMA200.",
    howToRead: "Signal baissier structurel. Les corrections dans ce contexte sont souvent profondes. Attendre le Golden Cross pour envisager un retour en position longue.",
    example: "Sur les actions comme sur les cryptos, le Death Cross précède souvent des baisses prolongées. C'est un signal de prudence, pas de panique — mais une raison d'attendre.",
  },
  "Structure baissière confirmée (LL+LH)": {
    concept: "Une structure LL+LH (Lower Lows + Lower Highs) signifie que le prix fait des plus bas et des plus hauts de plus en plus bas — définition technique d'une tendance baissière.",
    howToRead: "Chaque rebond est vendu moins haut que le précédent, et chaque baisse enfonce un nouveau plancher. La structure ne se retourne qu'avec un premier HH (Higher High) confirmé.",
    example: "Tant que la structure LL+LH est intacte, les achats sont statistiquement perdants. Attendre la formation d'un premier HH+HL pour envisager un retournement.",
  },
  "Death Cross actif — tendance baissière de fond": {
    concept: "Le Death Cross confirme que la tendance baissière est installée sur le moyen terme — l'EMA50 est sous l'EMA200.",
    howToRead: "Contexte défavorable pour les positions longues. Les rebonds restent des opportunités de vente tant que le Golden Cross n'est pas formé.",
    example: "Règle de base : en Death Cross, réduire l'exposition aux actifs risqués et attendre une confirmation haussière avant de réinvestir.",
  },
  "Structure de prix LL+LH — chaque rebond est vendu": {
    concept: "La structure LL+LH (Lower Lows + Lower Highs) est la définition d'une tendance baissière — chaque sommet est plus bas que le précédent, chaque creux aussi.",
    howToRead: "Dans ce contexte, les rebonds sont des pièges haussiers — des opportunités pour les vendeurs, pas pour les acheteurs. Attendre un renversement de structure.",
    example: "Un renversement se confirme quand le prix fait un premier Higher High (HH) — sommet plus haut que le précédent. Avant ça, la tendance baissière est toujours en place.",
  },
  "Golden Cross (EMA50 repasse au-dessus EMA200)": {
    concept: "Le Golden Cross se produit quand l'EMA50 repasse au-dessus de l'EMA200 — signal que la tendance haussière reprend le dessus sur le moyen terme.",
    howToRead: "C'est le signal de retournement haussier le plus attendu après un Death Cross. Il confirme que le momentum court terme a repris le dessus sur le long terme.",
    example: "Un Golden Cross confirme que le momentum long terme est revenu. Ce n'est pas infaillible, mais c'est une condition nécessaire pour revenir en position longue.",
  },
  "RSI < 25 + creux de cycle Sinewave": {
    concept: "La combinaison RSI < 25 (survente extrême) et creux de cycle Sinewave (retournement cyclique) est l'une des configurations d'entrée les plus solides après une baisse.",
    howToRead: "RSI < 25 = les vendeurs sont épuisés. Creux Sinewave = le cycle baissier arrive à son terme. Les deux ensemble = probabilité élevée de rebond significatif.",
    example: "Cette configuration apparaît rarement — en général moins de 3-4 fois par an. Quand elle se présente avec un Golden Cross en formation, c'est une opportunité majeure.",
  },
  "Structure HH+HL sur 3 pivots confirmés": {
    concept: "Une structure HH+HL (Higher Highs + Higher Lows) sur 3 pivots minimum confirme qu'une tendance haussière est structurellement en place — pas juste un rebond.",
    howToRead: "3 pivots = 3 cycles de hausse-correction confirmés. La tendance est considérée comme fiable. C'est la condition minimale pour parler de tendance haussière structurelle.",
    example: "Après un Death Cross, attendre 3 pivots HH+HL confirmés avant de revenir en position longue réduit significativement le risque d'acheter un faux retournement.",
  },
  "Golden Cross actif — tendance haussière de fond confirmée": {
    concept: "Le Golden Cross confirme que la tendance haussière est installée sur le moyen terme — l'EMA50 est repassée au-dessus de l'EMA200.",
    howToRead: "Signal haussier structurel. Les corrections dans ce contexte sont généralement des opportunités d'achat tant que la structure HH+HL est maintenue.",
    example: "Combiner Golden Cross + RSI non suracheté + creux de cycle Sinewave = configuration d'entrée optimale selon l'analyse technique.",
  },
  "RSI < 30 + creux Sinewave pour entrée tactique uniquement": {
    concept: "Le RSI (Relative Strength Index) mesure la vitesse des mouvements de prix. Sous 30, le marché est en zone de survente — les vendeurs ont peut-être exagéré la baisse.",
    howToRead: "RSI < 30 = survente potentielle, rebond possible. Mais sur tendance baissière (Death Cross actif), ce rebond est tactique — il ne remet pas en cause la direction baissière de fond.",
    example: "En contexte de Death Cross, un RSI < 30 peut offrir un rebond technique de 10-20%. Ce n'est pas une raison d'entrer en position longue durable — seulement une opportunité court terme.",
  },
  "Creux de cycle Sinewave": {
    concept: "Le Sinewave d'Ehlers détecte les phases cycliques du marché. Un creux de cycle signale que la phase baissière du cycle arrive à son terme — retournement haussier probable à court terme.",
    howToRead: "La ligne Sine croise la LeadSine vers le bas = creux de cycle = signal haussier. Ce signal est plus fiable quand il coïncide avec un RSI bas et une structure de prix haussière.",
    example: "En tendance haussière, le creux de cycle Sinewave est le point d'entrée optimal — il correspond au pullback dans la tendance.",
  },
  "ADX passe au-dessus de 25": {
    concept: "L'ADX (Average Directional Index) mesure la force d'une tendance sans en indiquer la direction. Sous 25 = pas de tendance. Au-dessus de 25 = tendance directionnelle qui se met en place.",
    howToRead: "Un ADX qui passe de 20 à 25+ signale qu'un mouvement directionnel commence. C'est souvent le déclencheur d'un breakout de range vers une tendance.",
    example: "Sur un marché en range, attendre ADX > 25 avant d'entrer confirme que le breakout n'est pas un faux signal.",
  },
  "Funding rate devient négatif (capitulation des longs)": {
    concept: "Le funding rate est le coût périodique payé entre acheteurs et vendeurs de contrats perpétuels crypto. Négatif = les shorts (vendeurs) paient les longs (acheteurs) = les vendeurs dominent et sont prêts à payer pour maintenir leurs positions.",
    howToRead: "Un funding négatif persistant signale une capitulation des acheteurs — tout le monde est baissier. Historiquement, c'est souvent un signal contrarian : quand tout le monde est vendu, un rebond violent peut se produire (short squeeze).",
    example: "Les marchés crypto avec un funding très négatif ont historiquement précédé des rebonds techniques violents après capitulation.",
  },
  "RSI descend sous 25": {
    concept: "Le RSI sous 25 indique une survente extrême — le marché a baissé trop vite. Les vendeurs sont épuisés et un rebond technique est statistiquement probable.",
    howToRead: "Sur les grandes cryptos (BTC, ETH), un RSI < 25 sur le journalier est rare et précède souvent un rebond significatif, même en contexte baissier.",
    example: "Ce n'est pas un signal d'achat en tendance baissière — c'est un signal de prudence pour les vendeurs et une opportunité tactique court terme pour les acheteurs.",
  },
};

function EntryRecommendationPanel({ rec }: { rec: EntryRecommendation }) {
  if (rec.type === "none") return null;

  const palette = {
    wait     : { border: THEME.scoreRed,   bg: "#1e0808", color: THEME.scoreRed   },
    caution  : { border: THEME.scoreAmber, bg: "#1a1000", color: THEME.scoreAmber },
    favorable: { border: THEME.scoreGreen, bg: "#0a1e0f", color: THEME.scoreGreen },
    none     : { border: "#334",           bg: THEME.bgPanel, color: THEME.textMuted },
  }[rec.type];

  const badgeLabel = { wait: "Attendre", caution: "Prudence", favorable: "Favorable", none: "" }[rec.type];

  return (
    <Panel
      icon="🎯"
      title="Recommandation d'entrée"
      badge={{ label: badgeLabel, color: palette.color }}
      borderColor={palette.border}
      defaultOpen={true}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>{rec.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: palette.color }}>{rec.title}</span>
        </div>
        {rec.reasons.length > 0 && (
          <div style={{ background: THEME.bgCard, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280",
                          textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>
              Pourquoi
            </div>
            {rec.reasons.map((r, i) => (
              <div key={i} style={{ fontSize: 11, color: THEME.textSecondary, lineHeight: 1.6, display:"flex", alignItems:"flex-start", gap:6 }}>
                <span>•</span>
                <span>{r}</span>
                {ENTRY_EDU[r] && <EduTooltip edu={ENTRY_EDU[r]} id={`entry-reason-${i}`}/>}
              </div>
            ))}
          </div>
        )}
        {rec.triggers.length > 0 && (
          <div style={{ background: THEME.bgCard, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280",
                          textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>
              Surveiller
            </div>
            {rec.triggers.map((t, i) => (
              <div key={i} style={{ fontSize: 11, color: THEME.textSecondary, lineHeight: 1.6, display:"flex", alignItems:"flex-start", gap:6 }}>
                <span>👁</span>
                <span>{t}</span>
                {ENTRY_EDU[t] && <EduTooltip edu={ENTRY_EDU[t]} id={`entry-trigger-${i}`}/>}
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 9, color: THEME.textMuted, fontStyle: "italic" }}>
          Ces recommandations sont algorithmiques et ne constituent pas un conseil en investissement.
        </div>
      </div>
    </Panel>
  );
}


function StockView({ metrics, ticker, optimalUTKey, macro, zone, eurRate, activeTab = "resume" }: {
  metrics: any; ticker: string; optimalUTKey?: string; macro?: MacroContext | null; zone?: MacroZone; eurRate?: number | null;
  activeTab?: "resume"|"technique"|"fondamentaux"|"macro";
}) {
  if (!metrics) return null;
  const {
    name, sector, industry, currency, exchange, quoteType,
    price, change1d, change52w, scores = {},
    gValorisation, gRentabilite, gSante, gRisque,
  } = metrics;

  // État graphique interactif
  const [ut,           setUt]         = useState<"1D"|"1W"|"1M">("1D");
  const [chartData1D,  setChartData1D] = useState<{ closes:(number|null)[]; timestamps:number[]; opens:(number|null)[]; highs:(number|null)[]; lows:(number|null)[]; volumes:(number|null)[] } | null>(null);
  const [chartData1W,  setChartData1W] = useState<typeof chartData1D>(null);
  const [chartData1M,  setChartData1M] = useState<typeof chartData1D>(null);
  const chartData = ut === "1W" ? chartData1W : ut === "1M" ? chartData1M : chartData1D;
  const [chartLoading, setChartLoading] = useState(false);
  const [showEur,      setShowEur]      = useState(false);
  const [descFr, setDescFr] = useState<string>("");
  const [descOpen, setDescOpen] = useState(false);

  // Chargement parallèle des 3 UT au montage / changement de ticker
  useEffect(() => {
    setUt("1D");
    loadAllCharts();
  }, [ticker]);

  useEffect(() => {
    setDescFr("");
    setDescOpen(false);
    const raw = (metrics?.longBusinessSummary || "").trim();
    if (raw) {
      translateToFr(raw).then(setDescFr);
      return;
    }
    // Fallback : description générée localement selon le type
    const qt = (metrics?.quoteType || "").toUpperCase();
    const name = metrics?.name || "";
    const exchange = metrics?.exchange || "";
    const sector = metrics?.sector || "";
    const industry = metrics?.industry || "";
    const currency = metrics?.currency || "USD";
    const mktCap = metrics?.mktCap;
    const change52w = metrics?.change52w;
    const divYield = metrics?.divYield;

    let fallback = "";

    if (qt === "ETF" || qt === "MUTUALFUND") {
      const typeLabel = qt === "MUTUALFUND" ? "fonds commun de placement" : "fonds négocié en bourse (ETF)";
      fallback = `${name} est un ${typeLabel} coté sur ${exchange || "un marché réglementé"}, libellé en ${currency}.`;
      if (sector) fallback += ` Il est exposé au secteur ${sector}${industry ? ` — ${industry}` : ""}.`;
      if (mktCap) fallback += ` Capitalisation totale : ${mktCap >= 1e9 ? (mktCap/1e9).toFixed(1)+"B" : (mktCap/1e6).toFixed(0)+"M"} ${currency}.`;
      if (divYield && divYield > 0) fallback += ` Rendement de distribution : ${(divYield*100).toFixed(2)}%.`;
      if (change52w != null) fallback += ` Performance sur 12 mois : ${change52w >= 0 ? "+" : ""}${(change52w*100).toFixed(1)}%.`;
      fallback += " Les ETF permettent d'investir sur un panier diversifié de titres en une seule transaction, avec des frais généralement réduits.";
    } else if (qt === "INDEX") {
      fallback = `${name} est un indice boursier coté sur ${exchange || "un marché réglementé"}.`;
      if (sector) fallback += ` Secteur de référence : ${sector}.`;
      if (change52w != null) fallback += ` Performance sur 12 mois : ${change52w >= 0 ? "+" : ""}${(change52w*100).toFixed(1)}%.`;
      fallback += " Un indice boursier mesure la performance agrégée d'un panier de titres représentatifs d'un marché, d'un secteur ou d'une thématique. Il sert de baromètre de l'état d'un marché et de référence (benchmark) pour évaluer la performance des portefeuilles.";
    } else if (qt === "FUTURE") {
      fallback = `${name} est un contrat à terme (future) coté sur ${exchange || "un marché dérivé"}, libellé en ${currency}.`;
      fallback += " Les contrats à terme sont des instruments dérivés permettant d'acheter ou de vendre un actif sous-jacent à une date future et à un prix fixé aujourd'hui. Ils sont utilisés pour la couverture de risque (hedging) ou la spéculation sur les variations de prix.";
    } else if (qt === "CURRENCY") {
      fallback = `${name} représente le taux de change de la devise ${currency}.`;
      fallback += " Le marché des changes (Forex) est le plus grand marché financier mondial. Les taux de change reflètent la valeur relative de deux monnaies et sont influencés par les politiques monétaires des banques centrales, l'inflation, la croissance économique et les flux de capitaux internationaux.";
    } else if (qt === "BOND") {
      fallback = `${name} est une obligation ou un instrument de taux coté sur ${exchange || "un marché obligataire"}.`;
      fallback += " Les obligations sont des titres de dette émis par des États ou des entreprises. Le rendement d'une obligation évolue en sens inverse de son prix : quand les taux montent, le prix des obligations baisse. Elles sont utilisées pour diversifier un portefeuille et générer des revenus réguliers.";
    }

    if (fallback) setDescFr(fallback);
  }, [metrics]);

  const loadAllCharts = useCallback(async () => {
    setChartLoading(true);
    try {
      const fetchUT = async (utKey: "1D"|"1W"|"1M") => {
        const cfg = STOCK_UT_CONFIG[utKey];
        const url = `${PROXY}?ticker=${encodeURIComponent(ticker)}&type=chart&range=${cfg.range}&interval=${cfg.interval}`;
        const d   = await (await fetch(url)).json();
        const res = d?.chart?.result?.[0];
        if (!res) return null;
        const q = res.indicators?.quote?.[0] || {};
        return {
          closes:     res.indicators?.adjclose?.[0]?.adjclose || q.close || [],
          timestamps: res.timestamp || [],
          opens:      q.open   || [],
          highs:      q.high   || [],
          lows:       q.low    || [],
          volumes:    q.volume || [],
        };
      };
      const [d1D, d1W, d1M] = await Promise.all([
        fetchUT("1D"),
        fetchUT("1W"),
        fetchUT("1M"),
      ]);
      if (d1D) setChartData1D(d1D);
      if (d1W) setChartData1W(d1W);
      if (d1M) setChartData1M(d1M);
    } catch {}
    setChartLoading(false);
  }, [ticker]);

  const handleUTChange = (u: string) => {
    setUt(u as "1D"|"1W"|"1M");
  };

  const SECTIONS = [
    {
      icon: "💰", label: "Valorisation",
      note: "40% du score",
      cards: [
        { label: "P/E Ratio", value: fmt(metrics.pe), s: scores.pe,
          edu: {
            concept: "Le Price-to-Earnings compare le prix de l'action aux bénéfices générés par action sur un an. Si une action vaut 100 € et que l'entreprise gagne 5 € par action, son P/E est 20 : vous payez 20 fois les bénéfices annuels.",
            howToRead: "Un P/E bas peut indiquer une action bon marché — ou une entreprise en difficulté. Un P/E élevé reflète des attentes de forte croissance future. Comparez toujours le P/E à la moyenne historique du secteur : un P/E de 30 est normal pour une tech en croissance rapide, excessif pour une utility.",
            good: "Sous 15 : attractif pour une entreprise mature et stable. Sous 25 dans un secteur technologique en croissance : acceptable.",
            bad: "Au-dessus de 40 : le marché paye très cher la croissance future — toute déception peut entraîner une correction sévère. P/E négatif : l'entreprise est déficitaire.",
            example: "",
          }},
        { label: "P/B Ratio", value: fmt(metrics.pb), s: scores.pb,
          edu: {
            concept: "Le Price-to-Book compare le prix de marché à la valeur comptable nette de l'entreprise (actifs totaux moins dettes). Un PB de 1 signifie que vous achetez l'entreprise exactement à la valeur de ses actifs nets enregistrés au bilan.",
            howToRead: "Un PB inférieur à 1 peut signaler une décote sur les actifs (opportunité ou piège selon leur qualité). Un PB élevé est justifié pour des entreprises très rentables comme Apple ou LVMH, qui créent de la valeur avec peu d'actifs physiques — leur vraie richesse est dans les marques et brevets, hors bilan.",
            good: "Sous 1.5 : décote modérée potentiellement intéressante. PB élevé (3-8) acceptable si le ROE dépasse 20 % — l'entreprise justifie sa prime par une rentabilité structurelle.",
            bad: "PB supérieur à 8 avec un ROE faible : prime difficile à justifier. PB inférieur à 0.5 avec des pertes : risque de value trap — les actifs peuvent se déprécier encore.",
            example: "",
          }},
        { label: "P/S Ratio", value: fmt(metrics.ps), s: scores.ps,
          edu: {
            concept: "Le Price-to-Sales compare la valeur boursière au chiffre d'affaires total. Contrairement au P/E, il est utile même quand l'entreprise est déficitaire, car les ventes existent avant les bénéfices — indispensable pour évaluer les startups ou entreprises en forte croissance.",
            howToRead: "Un PS bas signifie qu'on paye peu pour chaque euro de ventes. Mais attention : des ventes ne sont pas des bénéfices. Un PS élevé n'est défendable que si les marges vont s'améliorer fortement dans le futur. Comparez avec des entreprises similaires en termes de stade de maturité.",
            good: "Sous 2 : valorisation raisonnable pour une entreprise rentable. Entre 2 et 5 : acceptable pour une société en forte croissance avec des marges en amélioration.",
            bad: "Au-dessus de 8 : pari très optimiste sur une amélioration future des marges. Au-dessus de 20 : réservé aux hypercroissances — risque important si la croissance ralentit même légèrement.",
            example: "",
          }},
        { label: "EV/EBITDA", value: fmt(metrics.evEbitda), s: scores.evEbitda,
          edu: {
            concept: "L'Enterprise Value / EBITDA compare la valeur totale de l'entreprise (capitalisation boursière + dettes nettes) à ses bénéfices avant intérêts, impôts et amortissements. C'est un outil de valorisation neutre vis-à-vis de la structure de financement.",
            howToRead: "Contrairement au P/E, l'EV/EBITDA n'est pas faussé par l'effet de levier financier ni par les politiques fiscales — il permet de comparer des entreprises avec des dettes très différentes. Plus le multiple est bas, moins on paye cher la génération de cash opérationnel.",
            good: "Sous 10 : valorisation raisonnable pour une entreprise mature. Sous 15 : acceptable pour un secteur en croissance. Secteurs défensifs (utilities, alim.) : viser sous 12.",
            bad: "Au-dessus de 25 : valorisation premium élevée — la croissance future est déjà intégrée dans le prix. Valeur négative : EBITDA négatif, le ratio ne s'applique pas.",
            example: "",
          }},
        { label: "PEG Ratio", value: fmt(metrics.peg), s: null,
          edu: {
            concept: "Le PEG (Price/Earnings to Growth) divise le P/E par le taux de croissance annuel attendu des bénéfices. Il corrige le biais du P/E en intégrant la dynamique de croissance : une entreprise chère sur le P/E peut être sous-valorisée si sa croissance est encore plus rapide.",
            howToRead: "Une entreprise avec un P/E de 30 mais une croissance bénéficiaire de 30 % a un PEG de 1 — équilibrée. Une entreprise avec un P/E de 15 mais seulement 5 % de croissance a un PEG de 3 — chère pour sa croissance. Le PEG dépend de la fiabilité des prévisions de croissance.",
            good: "Sous 1 : action potentiellement sous-valorisée par rapport à sa croissance attendue. Entre 1 et 1.5 : valorisation équilibrée, raisonnable pour entrer.",
            bad: "Au-dessus de 2 : on paye cher pour la croissance anticipée. Si les prévisions de croissance ne se réalisent pas, la correction peut être importante.",
            example: "",
          }},
        { label: "Market Cap", value: `${currency} ${fmt(metrics.mktCap)}`, s: null,
          edu: {
            concept: "La capitalisation boursière = prix de l'action × nombre total d'actions en circulation. Elle représente la valeur que le marché attribue aujourd'hui à l'ensemble de l'entreprise. Ce n'est pas le chiffre d'affaires ni les actifs — c'est le prix que vous paieriez pour acheter 100 % de l'entreprise en bourse.",
            howToRead: "Large cap (> 10 Md€) : entreprises stables, bien couvertes par les analystes, moins volatiles. Mid cap (2-10 Md€) : potentiel de croissance supérieur, risque modéré. Small cap (< 2 Md€) : opportunités de croissance importantes mais volatilité élevée et liquidité parfois limitée.",
            good: "Large cap avec fondamentaux solides : pilier de portefeuille, résilience en période de crise. Small cap sous-valorisée avec croissance : potentiel de multiplication.",
            bad: "Micro cap (< 300 M€) : risque de manipulation de cours, spreads larges à l'achat/vente, couverture analytique quasi nulle. Méfiance accrue.",
            example: "",
          }},
      ],
    },
    {
      icon: "📈", label: "Rentabilité",
      note: "30% du score",
      cards: [
        { label: "ROE", value: pct(metrics.roe), s: scores.roe,
          edu: {
            concept: "Le Return on Equity mesure combien l'entreprise génère de bénéfice net pour chaque euro de capitaux propres investis par les actionnaires. Un ROE de 20 % signifie : 20 € de bénéfice net pour 100 € de fonds propres au bilan.",
            howToRead: "Un ROE élevé et stable indique une entreprise efficace qui crée réellement de la valeur. Attention cependant : un ROE supérieur à 50 % peut être artificiel si l'entreprise a massivement racheté ses propres actions, réduisant mécaniquement les capitaux propres au dénominateur. Vérifiez la dette associée.",
            good: "Entre 15 % et 30 % sur plusieurs années consécutives : signe de qualité réelle et d'avantage concurrentiel durable. ROE stable > 20 % depuis 5 ans : entreprise de qualité 'Buffett-style'.",
            bad: "Sous 8 % : rentabilité insuffisante pour les actionnaires. Négatif : l'entreprise détruit de la valeur. ROE > 50 % : vérifier l'endettement et les rachats d'actions avant de conclure à l'excellence.",
            example: "",
          }},
        { label: "ROA", value: pct(metrics.roa), s: null,
          edu: {
            concept: "Le Return on Assets mesure combien l'entreprise génère de bénéfice net pour chaque euro d'actifs qu'elle possède (usines, stocks, brevets, trésorerie...). Moins sensible aux rachats d'actions que le ROE, il reflète mieux l'efficacité opérationnelle réelle.",
            howToRead: "Le ROA est calculé sur l'ensemble des actifs (pas seulement les fonds propres), ce qui le rend plus stable et moins manipulable. Un ROA de 10 % signifie 10 € de profit pour 100 € d'actifs totaux. Comparez toujours dans le même secteur : les banques ont structurellement un ROA faible (1-2 %) à cause de leur bilan très chargé.",
            good: "Au-dessus de 10 % : très efficace, rare et précieux. Au-dessus de 5 % : correct pour un secteur industriel, manufacturier ou bancaire.",
            bad: "Sous 2 % : les actifs sont mal utilisés ou trop lourds par rapport aux profits. Négatif : l'entreprise détruit de la valeur sur l'ensemble de son parc d'actifs.",
            example: "",
          }},
        { label: "Marge Brute", value: pct(metrics.grossMargin), s: null,
          edu: {
            concept: "La marge brute = (Chiffre d'affaires − Coût des marchandises vendues) / CA. Elle mesure la part des ventes conservée avant tous les frais généraux, marketing et R&D. C'est le premier indicateur du pouvoir de tarification et de la compétitivité du modèle économique.",
            howToRead: "Une marge brute élevée (> 50 %) indique un fort pricing power : l'entreprise peut augmenter ses prix sans perdre ses clients. Elle finance la R&D, le marketing et les bénéfices. Les logiciels, le luxe et la pharma affichent souvent > 70 %. La grande distribution peut être à 25 % et être très rentable si les volumes sont massifs.",
            good: "Au-dessus de 40 % : modèle compétitif et scalable. Au-dessus de 60 % : pouvoir de marché structurel fort — difficile à répliquer par des concurrents.",
            bad: "Sous 20 % : peu de marge pour absorber les chocs de coûts. Dans ces secteurs, surveiller la marge nette de près — la moindre hausse de matières premières peut effacer les bénéfices.",
            example: "",
          }},
        { label: "Marge Opé.", value: pct(metrics.opMargin), s: scores.opMargin,
          edu: {
            concept: "La marge opérationnelle = Résultat d'exploitation / Chiffre d'affaires. Elle mesure la rentabilité après tous les coûts d'exploitation (production, R&D, marketing, frais généraux), mais avant les intérêts sur la dette et les impôts. C'est un bon reflet de l'efficacité de gestion.",
            howToRead: "Une marge opérationnelle en hausse sur plusieurs années est un signal fort : l'équipe de direction contrôle bien ses coûts et améliore l'efficacité. À comparer systématiquement avec les concurrents du même secteur. Une marge opérationnelle bien supérieure au secteur = avantage concurrentiel réel.",
            good: "Au-dessus de 15 % : bonne efficacité opérationnelle pour la plupart des secteurs. Au-dessus de 25 % : entreprise très bien gérée avec un pricing power fort.",
            bad: "Sous 5 % : coussin très mince face aux imprévus (hausse de coûts, concurrence). Négative : l'entreprise perd de l'argent sur ses opérations courantes — situation urgente à surveiller.",
            example: "",
          }},
        { label: "Marge Nette", value: pct(metrics.netMargin), s: scores.netMargin,
          edu: {
            concept: "La marge nette = Bénéfice net / Chiffre d'affaires. C'est ce qui reste réellement pour les actionnaires après tout : coûts d'exploitation, intérêts sur la dette, impôts. C'est la mesure de rentabilité finale — le vrai 'bottom line'.",
            howToRead: "Si la marge brute est haute mais la marge nette faible, les frais généraux, la dette ou les impôts consomment trop. Une marge nette élevée et stable sur plusieurs années est un signe de qualité rare. Microsoft et Apple dépassent les 25 %. Comparez avec la tendance historique de l'entreprise.",
            good: "Au-dessus de 10 % : très rentable, l'entreprise monétise efficacement ses activités. Au-dessus de 20 % : profil 'cash machine' — génère massivement du profit par rapport à ses ventes.",
            bad: "Négative : l'entreprise perd de l'argent in fine. Sous 3 % : très exposée à tout choc de coûts ou de demande — très peu de marge de sécurité.",
            example: "",
          }},
      ],
    },
    {
      icon: "🏦", label: "Santé Financière",
      note: "20% du score",
      cards: [
        { label: "Dette/Equity", value: fmt(metrics.debtEq), s: scores.debtEq,
          edu: {
            concept: "Le ratio Dette/Equity compare les dettes financières totales aux capitaux propres. Un D/E de 0.5 signifie que l'entreprise a 50 € de dettes pour 100 € de fonds propres. Il mesure le niveau de levier financier et le risque associé.",
            howToRead: "L'endettement amplifie les gains en bonne période (effet de levier), mais peut être fatal en période de crise ou de hausse des taux. Certains secteurs sont structurellement plus endettés (immobilier, utilities, télécoms) — comparez toujours dans le même secteur. Ce qui compte autant que le niveau : la capacité de remboursement (flux de trésorerie / charges d'intérêts).",
            good: "Sous 0.5 : bilan très sain, peu de risque financier, grande flexibilité stratégique. Entre 0.5 et 1.0 : levier modéré, gérable dans la plupart des environnements de taux.",
            bad: "Au-dessus de 2 : endettement élevé — surveiller les flux de trésorerie et la couverture des intérêts. Au-dessus de 3 hors secteurs spécialisés : risque sérieux en cas de remontée des taux ou de retournement conjoncturel.",
            example: "",
          }},
        { label: "Current Ratio", value: fmt(metrics.currentRatio), s: scores.currentRatio,
          edu: {
            concept: "Le current ratio = Actifs courants / Passifs courants. Il mesure si l'entreprise peut honorer ses dettes à court terme (moins d'un an) avec ses actifs liquides disponibles : trésorerie, créances clients à encaisser, stocks à vendre.",
            howToRead: "Un current ratio supérieur à 1 signifie que l'entreprise a plus d'actifs liquides que de dettes court terme — elle peut faire face à ses obligations immédiates. Un ratio inférieur à 1 n'est pas toujours catastrophique si l'entreprise génère des flux de trésorerie très réguliers (grande distribution, par exemple), mais c'est un signal d'alerte à vérifier.",
            good: "Entre 1.5 et 3 : confort de liquidité solide, bonne capacité à absorber les imprévus. Au-dessus de 1 : situation a priori saine.",
            bad: "Sous 1 : les dettes court terme dépassent les actifs liquides — risque de tension trésorerie. Sous 0.7 : alerte rouge — l'entreprise pourrait avoir des difficultés à honorer ses prochaines échéances.",
            example: "",
          }},
        { label: "Free Cash Flow", value: `${currency} ${fmt(metrics.fcf)}`, s: null,
          edu: {
            concept: "Le Free Cash Flow (flux de trésorerie libre) = Cash généré par l'activité opérationnelle − Investissements en capital (capex : usines, équipements, machines...). C'est l'argent réellement disponible pour rembourser des dettes, payer des dividendes, racheter des actions ou financer des acquisitions.",
            howToRead: "Le FCF est souvent plus fiable que le bénéfice comptable, qui peut être influencé par des choix comptables. Une entreprise peut afficher des bénéfices mais avoir un FCF négatif (problème réel de trésorerie). Warren Buffett considère le FCF comme la mesure de valeur la plus fondamentale d'une entreprise.",
            good: "Positif et croissant sur plusieurs années : qualité rare et très recherchée. FCF yield supérieur à 5 % (FCF / capitalisation boursière) : entreprise potentiellement sous-valorisée.",
            bad: "Négatif : l'entreprise consomme plus de cash qu'elle n'en génère — elle dépend de financements externes (dettes, émissions d'actions). Acceptable en phase d'investissement intense, problématique si persistant sans amélioration visible.",
            example: "",
          }},
        { label: "Actions en circ.", value: fmt(metrics.sharesOut, 0), s: null,
          edu: {
            concept: "Le nombre d'actions en circulation représente toutes les actions de l'entreprise détenues par les investisseurs (flottant + actions des dirigeants + institutionnels). La capitalisation boursière = prix × ce nombre.",
            howToRead: "Surveiller l'évolution dans le temps : une augmentation du nombre d'actions (dilution) réduit la part de chaque actionnaire dans les bénéfices et la valeur. À l'inverse, des rachats d'actions (buybacks) réduisent ce nombre et augmentent mécaniquement le bénéfice par action — souvent un signal positif.",
            good: "Nombre stable ou en baisse sur 5 ans : l'entreprise protège ses actionnaires de la dilution. Rachats réguliers + croissance des bénéfices = double effet positif sur le BPA.",
            bad: "Forte augmentation du nombre d'actions : dilution des actionnaires existants. Souvent signe que l'entreprise a besoin de lever des fonds pour survivre — à analyser avec le FCF.",
            example: "",
          }},
      ],
    },
    {
      icon: "💵", label: "Dividende",
      note: "informatif",
      cards: [
        { label: "Rendement Div.", value: pct(metrics.divYield), s: scores.divYield,
          edu: {
            concept: "Le rendement du dividende = Dividende annuel par action / Prix de l'action. Il représente le revenu passif annuel généré pour chaque euro investi — comparable à un loyer pour un investissement immobilier. Un rendement de 4 % sur 10 000 € investis génère 400 € par an.",
            howToRead: "Un rendement élevé n'est pas toujours bon signe : il peut refléter une chute du cours (action en difficulté, marché qui anticipe une coupe de dividende). Vérifiez toujours la soutenabilité : payout ratio inférieur à 70-75 % et FCF couvrant le dividende. Les 'aristocrates du dividende' (>25 ans de hausse consécutive) sont les références.",
            good: "Entre 2 % et 4 % : attractif et généralement soutenable pour une entreprise saine. Historique de croissance du dividende sur 10+ ans : signe de qualité et d'engagement envers les actionnaires.",
            bad: "Au-dessus de 8 % : souvent insoutenable — le marché anticipe probablement une coupe prochaine. Payout ratio supérieur à 90 % : le dividende sera fragilisé par tout choc sur les bénéfices.",
            example: "",
          }},
        { label: "Payout Ratio", value: pct(metrics.payoutRatio), s: null,
          edu: {
            concept: "Le payout ratio = Dividendes versés / Bénéfice net. Il mesure la part des bénéfices redistribuée aux actionnaires sous forme de dividendes. Le reste est réinvesti dans l'entreprise pour la croissance, le désendettement ou les acquisitions.",
            howToRead: "Un payout faible (< 40 %) laisse beaucoup de marge pour la croissance future et la résilience. Un payout élevé (> 80 %) signifie que l'entreprise reverse presque tout — peu de coussin si les bénéfices reculent. Le payout idéal dépend du stade : une entreprise mature peut distribuer plus, une entreprise en croissance doit réinvestir.",
            good: "Entre 30 % et 60 % : équilibre sain entre rémunération des actionnaires et réinvestissement pour la croissance. Payout stable ou en légère hausse = gestion prudente.",
            bad: "Au-dessus de 90 % : le dividende est à risque au moindre recul des bénéfices. Supérieur à 100 % : dividende financé par la dette ou la trésorerie — non soutenable à long terme.",
            example: "",
          }},
      ],
    },
    {
      icon: "⚡", label: "Risque",
      note: "10% du score",
      cards: [
        { label: "Bêta", value: fmt(metrics.beta), s: scores.beta,
          edu: {
            concept: "Le bêta mesure la sensibilité d'une action aux mouvements du marché de référence (S&P 500 ou indice local = bêta 1). Un bêta de 1.5 signifie que si le marché monte de 10 %, l'action monte en moyenne de 15 % — et perd 15 % si le marché recule de 10 %.",
            howToRead: "Bêta > 1 : action plus volatile que le marché — amplification des gains ET des pertes. Bêta < 1 : action défensive, moins sensible aux retournements (utilities, pharma, alimentaire). Bêta négatif : l'action évolue en sens inverse du marché — très rare (or, certaines valeurs refuge). Le bêta mesure la volatilité passée, pas le risque fondamental.",
            good: "Entre 0.5 et 1 : profil défensif, idéal en période d'incertitude ou pour équilibrer un portefeuille volatile. Bêta faible couplé à un dividende stable = valeur refuge classique.",
            bad: "Au-dessus de 2 : très spéculatif — en marché baissier, les pertes peuvent être sévères et rapides. Bêta élevé combiné à une valorisation tendue : risque maximal, position réduite recommandée.",
            example: "",
          }},
        { label: "Short Ratio (days to cover)", value: fmt(metrics.shortRatio), s: null,
          edu: {
            concept: "Le short ratio (ou Days to Cover) = nombre de jours nécessaires pour que tous les vendeurs à découvert rachètent leurs positions, basé sur le volume quotidien moyen. Les vendeurs à découvert parient professionnellement sur la baisse du titre — ce sont souvent des hedge funds ou institutionnels bien informés.",
            howToRead: "Un short ratio élevé signifie que beaucoup d'investisseurs professionnels parient contre l'action. Mais c'est une arme à double tranchant : si une bonne nouvelle arrive (résultats meilleurs que prévu, acquisition...), ces vendeurs sont forcés de racheter en urgence, ce qui peut déclencher un 'short squeeze' — une hausse violente et explosive du cours.",
            good: "Sous 3 jours : niveau normal, peu de pression baissière structurelle. Faible short ratio sur une action décotée = le marché ne la déteste pas, signal potentiellement positif.",
            bad: "Au-dessus de 10 jours : forte conviction des professionnels baissiers. À surveiller de très près : soit ils ont raison sur un problème fondamental, soit un squeeze violent est possible si le sentiment tourne.",
            example: "",
          }},
        { label: "Short % Float", value: metrics.shortPercentFloat != null ? (metrics.shortPercentFloat * 100).toFixed(2) + "%" : "—",
          s: metrics.shortPercentFloat != null
            ? metrics.shortPercentFloat < 0.03 ? 8
            : metrics.shortPercentFloat < 0.08 ? 5
            : metrics.shortPercentFloat < 0.15 ? 3 : 1
            : null,
          edu: {
            concept: "Le Short % Float mesure la part du flottant (actions disponibles à la vente) vendue à découvert. Un niveau élevé indique que des investisseurs professionnels parient sur la baisse du titre.",
            howToRead: "Sous 3% : très peu de pression short. Entre 3% et 8% : pression modérée. Entre 8% et 15% : pression élevée — conviction baissière des professionnels. Au-dessus de 15% : signal extrême, potentiel short squeeze si bonne nouvelle.",
            good: "Sous 3% : les professionnels ne parient pas contre ce titre — signal de confiance.",
            bad: "Au-dessus de 10% : forte conviction baissière institutionnelle. Vérifier si les fondamentaux justifient cette méfiance.",
            example: metrics.shortPercentFloat != null
              ? `${(metrics.shortPercentFloat * 100).toFixed(2)}% du flottant est vendu à découvert. ${metrics.shortPercentFloat < 0.03 ? "Niveau très faible — signal positif." : metrics.shortPercentFloat < 0.08 ? "Niveau modéré à surveiller." : "Niveau élevé — conviction baissière notable."}`
              : "Données non disponibles.",
          }},
        { label: "Flottant", value: fmt(metrics.floatShares, 0), s: null,
          edu: {
            concept: "Le flottant représente le nombre d'actions réellement disponibles à l'achat sur le marché — hors actions détenues par les insiders, institutionnels bloqués ou auto-détention. C'est la liquidité structurelle du titre.",
            howToRead: "Un flottant faible (<10% des actions totales) rend le titre plus volatil — une petite quantité d'acheteurs peut faire bouger le prix significativement. Un flottant large assure une liquidité stable.",
            good: "Flottant large : liquidité élevée, spreads serrés, moins de manipulation possible.",
            bad: "Flottant très faible : volatilité amplifiée, risque de manipulation, spreads larges à l'achat/vente.",
            example: metrics.floatShares != null
              ? `${fmt(metrics.floatShares, 0)} actions disponibles sur le marché.`
              : "Données non disponibles.",
          }},
        { label: "Perf. 52 sem.", value: metrics.change52w != null ? (metrics.change52w * 100).toFixed(1) + "%" : "—",
          s: scores.perf52w,
          edu: {
            concept: "La performance sur les 52 dernières semaines mesure la variation du cours entre aujourd'hui et il y a exactement un an. C'est un indicateur de momentum à moyen terme qui révèle si le marché a récompensé ou sanctionné l'entreprise sur la période récente.",
            howToRead: "Une performance forte (+30 % sur 12 mois) indique une tendance haussière — mais signifie aussi que la valorisation a probablement progressé. Une performance négative peut créer une opportunité d'entrée si les fondamentaux restent solides (le marché a peut-être surréagi). Comparez toujours avec l'indice de référence du secteur.",
            good: "+10 % à +30 % en phase avec un marché haussier : momentum sain sans surchauffe. Surperformance du secteur + fondamentaux solides = force relative positive.",
            bad: "Baisse supérieure à −30 % sans amélioration visible des fondamentaux : tendance baissière possiblement structurelle. Hausse supérieure à +80 % : valorisation déjà élevée, la marge de sécurité pour entrer s'est réduite.",
            example: "",
          }},
      ],
    },
  ];

  // ── Calcul technique, contexte et score ─────────────────────
  const closes  = chartData?.closes  ?? [];
  const highs   = chartData?.highs   ?? [];
  const lows    = chartData?.lows    ?? [];
  const volumes = chartData?.volumes ?? [];

  const marketCtx = (closes.length > 20 && highs.length > 20 && lows.length > 20)
    ? classifyMarketContext(closes, highs, lows, volumes)
    : null;

  // ── Signaux techniques : calcul unique, partagé par score + badge + TechnicalPanel ──
  // L'intervalle du graphique est déduit de l'UT sélectionnée (nécessaire pour normaliser dp sinewave)
  const chartInterval: "1d" | "1wk" | "1mo" =
    ut === "1M" ? "1mo" :
    ut === "1W" ? "1wk" : "1d";
  const techComputed = closes.length > 0
    ? computeTechSignals(closes, volumes, highs, lows, chartInterval)
    : { signals: [], sinewave: null };

  const confluenceResult = (closes.length > 0 && highs.length > 0 && lows.length > 0)
    ? calcConfluenceScore(closes, highs, lows, volumes)
    : null;
  const finalScoreResult = marketCtx
    ? computeFinalScore(metrics, marketCtx, techComputed.signals, closes, confluenceResult?.score ?? null)
    : null;
  const finalScore = finalScoreResult?.score ?? null;
  const v = getVerdict(finalScore);

  // Badge synthétique : ne compte que les signaux directionnels (exclut neutral)
  const techSummary = (() => {
    const { signals } = techComputed;
    const bulls = signals.filter((s: TechSignal) => s.strength === "bull").length;
    const bears = signals.filter((s: TechSignal) => s.strength === "bear").length;
    const total = bulls + bears;
    if (total === 0) return null;
    const label = bears > bulls + 1 ? "Baissière" : bulls > bears + 1 ? "Haussière" : "Mitigée";
    const color = bears > bulls + 1 ? "#ef4444" : bulls > bears + 1 ? "#22c55e" : "#f59e0b";
    return { label, color, bulls, bears, total };
  })();

  return (
    <div style={{ animation:"fadeIn .4s ease" }}>

      {/* ── HEADER ACTIF — toujours visible ── */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, color:THEME.textMuted,
          textTransform:"uppercase", letterSpacing:1.5, marginBottom:4 }}>
          {[exchange, sector, industry].filter(Boolean).join(" · ")}
        </div>
        <div style={{ fontSize:22, fontWeight:800, color:THEME.textPrimary,
          marginBottom:8, lineHeight:1.3 }}>
          {name}<TypeBadge type={quoteType}/>
        </div>
        <div style={{ display:"flex", alignItems:"baseline",
          gap:12, flexWrap:"wrap" }}>
          <span style={{ fontSize:34, fontWeight:900, color:THEME.accent,
            fontFamily:"'IBM Plex Mono',monospace" }}>
            {showEur && eurRate != null && eurRate !== 1 && metrics.price != null
              ? `${(metrics.price * eurRate).toLocaleString("fr-FR",
                  {minimumFractionDigits:2, maximumFractionDigits:2})} EUR`
              : `${currency} ${fmt(price)}`}
          </span>
          {change1d != null && (
            <span style={{ fontSize:15, fontWeight:700,
              color: change1d >= 0 ? THEME.scoreGreen : THEME.scoreRed }}>
              {change1d >= 0 ? "▲" : "▼"} {Math.abs(change1d*100).toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════
          ONGLET RÉSUMÉ
      ══════════════════════════════════════ */}
      {activeTab === "resume" && (
        <div style={{ display:"flex", gap:24, alignItems:"flex-start", flexWrap:"wrap" }}>

          {/* Colonne gauche — graphique */}
          <div style={{ flex:"1 1 55%", minWidth:320 }}>
            <ChartBlock
              chartData={chartData}
              currency={currency}
              quoteType={quoteType}
              period={ut}
              periods={STOCK_UT_PERIODS}
              onPeriodChange={handleUTChange}
              loading={chartLoading}
              optimalUTKey={optimalUTKey}
              showEur={showEur}
              setShowEur={setShowEur}
              eurRate={eurRate}
              priceValue={metrics?.price ?? null}
            />
          </div>

          {/* Colonne droite — scores + verdict + recommandation */}
          <div style={{ flex:"1 1 35%", minWidth:280,
            display:"flex", flexDirection:"column", gap:12,
            position:"sticky", top:"72px" }}>

            {/* Carte verdict */}
            {v ? (
              <div style={{
                background: v.color + "0f",
                border: `1px solid ${v.color}33`,
                borderRadius:14, padding:"18px 20px",
              }}>
                {/* Jauges */}
                <div style={{ display:"flex", justifyContent:"space-evenly",
                  marginBottom:14, gap:12,
                  flexWrap:"nowrap",
                  overflowX:"auto" }}>
                  {metrics?.globalScore != null && (
                    <div style={{ display:"flex", flexDirection:"column",
                      alignItems:"center", gap:4,
                      minWidth:120, maxWidth:160, flex:"1 1 120px" }}>
                      <ScoreGauge score={metrics.globalScore}/>
                      <div style={{ display:"flex", alignItems:"baseline", gap:3 }}>
                        <span style={{ fontSize:36, fontWeight:900,
                          color:scoreColor(metrics.globalScore),
                          fontFamily:"'IBM Plex Mono',monospace" }}>
                          {metrics.globalScore}
                        </span>
                        <span style={{ fontSize:12, color:THEME.textSecondary,
                          fontFamily:"'IBM Plex Mono',monospace" }}>/10</span>
                      </div>
                      <div style={{ fontSize:9, color:THEME.textMuted,
                        textTransform:"uppercase", letterSpacing:1.5 }}>
                        Fondamentaux
                      </div>
                    </div>
                  )}
                  {finalScore != null && (
                    <div style={{ display:"flex", flexDirection:"column",
                      alignItems:"center", gap:4,
                      minWidth:120, maxWidth:160, flex:"1 1 120px" }}>
                      <ScoreGauge score={finalScore}/>
                      <div style={{ display:"flex", alignItems:"baseline", gap:3 }}>
                        <span style={{ fontSize:36, fontWeight:900,
                          color:scoreColor(finalScore),
                          fontFamily:"'IBM Plex Mono',monospace" }}>
                          {finalScore}
                        </span>
                        <span style={{ fontSize:12, color:THEME.textSecondary,
                          fontFamily:"'IBM Plex Mono',monospace" }}>/10</span>
                      </div>
                      <div style={{ fontSize:9, color:THEME.textMuted,
                        textTransform:"uppercase", letterSpacing:1.5 }}>
                        Timing Entrée
                      </div>
                    </div>
                  )}
                </div>
                {/* Verdict */}
                <div style={{ fontSize:18, fontWeight:900,
                  color:v.color, marginBottom:4 }}>
                  {v.emoji} {v.label}
                </div>
                <div style={{ fontSize:11, color:THEME.textSecondary,
                  lineHeight:1.4, marginBottom:12 }}>
                  {v.desc}
                </div>
                {/* Mini-jauges */}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <MiniGauge label="Valorisation" score={gValorisation} weight={0.40}/>
                  <MiniGauge label="Rentabilité"  score={gRentabilite}  weight={0.30}/>
                  <MiniGauge label="Santé"        score={gSante}        weight={0.20}/>
                  <MiniGauge label="Risque"       score={gRisque}       weight={0.10}/>
                </div>
              </div>
            ) : (
              <div style={{
                background:THEME.bgHeader, border:`1px solid ${THEME.borderMid}`,
                borderRadius:14, padding:"18px 20px",
              }}>
                <div style={{ fontSize:18, fontWeight:900,
                  color:THEME.textSecondary, marginBottom:6 }}>
                  {["INDEX","FUTURE","BOND","MUTUALFUND"].indexOf((quoteType||"").toUpperCase()) !== -1
                    ? "Analyse technique uniquement"
                    : "Données insuffisantes"}
                </div>
                <div style={{ fontSize:11, color:THEME.textMuted, lineHeight:1.6 }}>
                  {quoteType === "INDEX"      ? "Les ratios PE / PB / ROE ne s'appliquent pas aux indices de marché." :
                   quoteType === "FUTURE"     ? "Les contrats à terme n'ont pas de fondamentaux d'entreprise." :
                   quoteType === "BOND"       ? "Les obligations se lisent par le taux et la maturité, pas par le PE." :
                   quoteType === "MUTUALFUND" ? "Les fonds n'ont pas de bilan d'entreprise à analyser." :
                   "Données fondamentales insuffisantes pour calculer un score fiable."}
                </div>
              </div>
            )}

            {/* Recommandation d'entrée */}
            {(() => {
              const entryRec = computeEntryRecommendation(
                metrics,
                finalScoreResult?.context ?? null,
                techComputed.signals,
                techComputed.sinewave,
                macro,
                finalScore,
                metrics?.globalScore ?? null,
              );
              return <EntryRecommendationPanel rec={entryRec}/>;
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          ONGLET TECHNIQUE
      ══════════════════════════════════════ */}
      {activeTab === "technique" && (
        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
          {marketCtx && finalScoreResult && (
            <MarketContextPanel
              context={finalScoreResult.context}
              modifiers={finalScoreResult.modifiers}
            />
          )}
          <TechnicalPanel
            precomputed={techComputed}
            context={finalScoreResult?.context ?? null}
          />
          <ProjectionPanel
            closes={chartData?.closes ?? []}
            highs={chartData?.highs ?? []}
            lows={chartData?.lows ?? []}
            volumes={chartData?.volumes ?? []}
            currency={metrics?.currency ?? "USD"}
            chartInterval={chartInterval}
            period={ut}
            marketContext={finalScoreResult?.context ?? null}
          />
        </div>
      )}

      {/* ══════════════════════════════════════
          ONGLET FONDAMENTAUX
      ══════════════════════════════════════ */}
      {activeTab === "fondamentaux" && (
        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
          {descFr && (
            <div style={{
              background:THEME.bgPanel,
              border:`1px solid ${THEME.borderPanel}`,
              borderRadius:12, padding:"14px 18px", marginBottom:14,
            }}>
              <div onClick={() => setDescOpen(o => !o)} style={{
                display:"flex", alignItems:"center",
                justifyContent:"space-between",
                cursor:"pointer", marginBottom: descOpen ? 10 : 0,
              }}>
                <span style={{ fontSize:12, fontWeight:800,
                  color:THEME.textSecondary,
                  textTransform:"uppercase", letterSpacing:2 }}>
                  📖 À propos
                </span>
                <span style={{ fontSize:10, color:THEME.textMuted }}>
                  {descOpen ? "▲" : "▼"}
                </span>
              </div>
              {descOpen ? (
                <div style={{ fontSize:12, color:THEME.textSecondary,
                  lineHeight:1.8,
                  borderLeft:`3px solid ${THEME.accent}`, paddingLeft:12 }}>
                  {descFr}
                  <div onClick={() => setDescOpen(false)}
                    style={{ marginTop:8, fontSize:10,
                      color:THEME.textMuted, cursor:"pointer" }}>
                    ▲ Réduire
                  </div>
                </div>
              ) : (
                <div onClick={() => setDescOpen(true)}
                  style={{ fontSize:12, color:THEME.textSecondary,
                    lineHeight:1.7, cursor:"pointer",
                    borderLeft:`3px solid ${THEME.accent}`, paddingLeft:12 }}>
                  {descFr.slice(0,320)}
                  {descFr.length > 320 && (
                    <span style={{ color:THEME.accent, fontWeight:700 }}>
                      {" "}… Lire la suite
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {["INDEX","FUTURE","BOND","ETF","MUTUALFUND","CURRENCY"]
            .indexOf((quoteType||"").toUpperCase()) === -1 && (
            <FundamentalsPanel
              metrics={metrics}
              scores={scores}
              sections={SECTIONS}
              currency={currency}
            />
          )}
          <SentimentPanel metrics={metrics} macro={macro}/>
          <SituationalPanel metrics={metrics}
            closes={chartData?.closes ?? []}/>
        </div>
      )}

      {/* ══════════════════════════════════════
          ONGLET MACRO & NEWS
      ══════════════════════════════════════ */}
      {activeTab === "macro" && (
        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
          <MacroContextPanel macro={macro} zone={zone}/>
          <NewsPanel ticker={ticker} quoteType={metrics?.quoteType}
            shortName={metrics?.shortName ?? metrics?.longName}/>
        </div>
      )}

      <div style={{ fontSize:10, color:THEME.textMuted,
        textAlign:"right", marginTop:16 }}>
        Source : Yahoo Finance via proxy · Données indicatives
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// COUCHE 4d — VUE CRYPTO
// ════════════════════════════════════════════════════════════════

// Mini-jauge demi-cercle pour Fear & Greed (0-100)
function FearGreedGauge({ value }: { value: number }) {
  const pct    = Math.max(0, Math.min(100, value)) / 100;
  const angle  = pct * Math.PI; // 0 → PI (demi-cercle gauche→droite)
  const cx = 60, cy = 60, r = 48;
  const startX = cx - r, startY = cy;
  const endX   = cx + Math.cos(Math.PI - angle) * r;
  const endY   = cy - Math.sin(angle) * r;
  const large  = angle > Math.PI / 2 ? 1 : 0;
  const color  = value < 30 ? THEME.scoreRed : value < 50 ? "#f97316" : value < 70 ? THEME.scoreAmber : THEME.scoreGreen;
  return (
    <svg width={120} height={68} viewBox="0 0 120 68">
      {/* piste grise */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#1e2a3a" strokeWidth={10} strokeLinecap="round"/>
      {/* arc coloré */}
      {value > 0 && (
        <path d={`M ${startX} ${startY} A ${r} ${r} 0 ${large} 1 ${endX} ${endY}`}
          fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"/>
      )}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={22} fontWeight={900}
        fill={color} fontFamily="'IBM Plex Mono',monospace">{value}</text>
    </svg>
  );
}

// ── INTERFACE NEWS ────────────────────────────────────────────
interface NewsItem {
  title:     string;
  source:    string;
  date:      string;
  url:       string;
  timestamp: number;
}

async function fetchNewsForTicker(ticker: string, quoteType?: string, companyShortName?: string): Promise<NewsItem[]> {
  const qt = (quoteType ?? "").toUpperCase();

  // ── Sources spécialisées par type ──────────────────────────
  if (qt === "CRYPTOCURRENCY") {
    try {
      const symbol = ticker.replace("-USD", "").replace("-USDT", "").toLowerCase();
      const url = `${PROXY}/?type=cryptonews&coin=${encodeURIComponent(symbol)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("cryptonews failed");
      const data = await res.json();
      const articles: NewsItem[] = (data.articles ?? []).map((a: any) => {
        const ts = a.pubDate ? Math.floor(new Date(a.pubDate).getTime() / 1000) : 0;
        const now = Math.floor(Date.now() / 1000);
        const diff = now - ts;
        const dateLabel =
          diff < 3600   ? `Il y a ${Math.floor(diff / 60)} min` :
          diff < 86400  ? `Il y a ${Math.floor(diff / 3600)}h`  :
          diff < 604800 ? `Il y a ${Math.floor(diff / 86400)}j` :
          new Date(ts * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
        return {
          title:     a.title ?? "",
          source:    "Cointelegraph",
          date:      dateLabel,
          url:       a.link ?? "#",
          timestamp: ts,
        };
      }).filter((n: NewsItem) => n.title && n.url !== "#");
      if (articles.length > 0) return articles;
    } catch { /* fallback Yahoo ci-dessous */ }
  }

  if (qt === "CURRENCY" || qt === "INDEX" || qt === "FUTURE") {
    try {
      const queryMap: Record<string, string> = {
        "EURUSD=X": "EUR USD forex", "GBPUSD=X": "GBP USD forex",
        "USDJPY=X": "USD JPY forex", "USDCHF=X": "USD CHF forex",
        "^FCHI": "CAC 40 bourse", "^STOXX50E": "Euro Stoxx 50",
        "^GDAXI": "DAX bourse", "^FTSE": "FTSE 100",
        "^N225": "Nikkei 225", "^GSPC": "S&P 500",
        "^DJI": "Dow Jones", "^IXIC": "Nasdaq",
        "^VIX": "VIX volatilité marchés",
      };
      const q = queryMap[ticker.toUpperCase()] ?? `${ticker} finance`;
      const url = `${PROXY}/?type=genericnews&q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("genericnews failed");
      const data = await res.json();
      const articles: NewsItem[] = (data.articles ?? []).map((a: any) => {
        const ts = a.pubDate ? Math.floor(new Date(a.pubDate).getTime() / 1000) : 0;
        const now = Math.floor(Date.now() / 1000);
        const diff = now - ts;
        const dateLabel =
          diff < 3600   ? `Il y a ${Math.floor(diff / 60)} min` :
          diff < 86400  ? `Il y a ${Math.floor(diff / 3600)}h`  :
          diff < 604800 ? `Il y a ${Math.floor(diff / 86400)}j` :
          new Date(ts * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
        return {
          title:     a.title ?? "",
          source:    a.description ?? "Google News",
          date:      dateLabel,
          url:       a.link ?? "#",
          timestamp: ts,
        };
      }).filter((n: NewsItem) => n.title && n.url !== "#");
      if (articles.length > 0) return articles;
    } catch { /* fallback Yahoo ci-dessous */ }
  }

  try {
    const rawName = companyShortName ?? ticker;
    const shortQuery = rawName.split(" ").slice(0, 3).join(" ");
    // Détecter la langue selon le suffixe du ticker
    const isJapanese = ticker.endsWith(".T");
    const isUS = !ticker.includes(".") || ticker.endsWith("=X");
    const lang = isJapanese ? "ja&gl=JP&ceid=JP:ja" : isUS ? "en&gl=US&ceid=US:en" : "fr&gl=FR&ceid=FR:fr";
    const suffix = isJapanese ? "株価" : isUS ? "stock news" : "action bourse";
    const q = `${shortQuery} ${suffix}`;
    const url = `${PROXY}/?type=genericnews&q=${encodeURIComponent(q)}&lang=${lang}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("genericnews failed");
    const data = await res.json();
    const articles: NewsItem[] = (data.articles ?? []).map((a: any) => {
      const ts = a.pubDate ? Math.floor(new Date(a.pubDate).getTime() / 1000) : 0;
      const now = Math.floor(Date.now() / 1000);
      const diff = now - ts;
      const dateLabel =
        diff < 3600   ? `Il y a ${Math.floor(diff / 60)} min` :
        diff < 86400  ? `Il y a ${Math.floor(diff / 3600)}h`  :
        diff < 604800 ? `Il y a ${Math.floor(diff / 86400)}j` :
        new Date(ts * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      return {
        title:     a.title ?? "",
        source:    a.description ?? "Google News",
        date:      dateLabel,
        url:       a.link ?? "#",
        timestamp: ts,
      };
    }).filter((n: NewsItem) => n.title && n.url !== "#");
    return articles;
  } catch { return []; }
}

// ── COMPOSANT NEWS PANEL ──────────────────────────────────────
// ── COMPOSANT PROJECTION & CONFLUENCE ────────────────────────
function ProjectionPanel({ closes, highs, lows, volumes, currency, chartInterval = "1d", period = "1a", marketContext }: {
  closes:         (number|null)[];
  highs:          (number|null)[];
  lows:           (number|null)[];
  volumes:        (number|null)[];
  currency:       string;
  chartInterval?: "1d" | "1wk" | "1mo";
  period?:        string;
  marketContext?: MarketContext | null;
}) {
  const c = closes.filter((v): v is number => v != null);
  if (c.length < 50) return null;

  const CANDLE_TO_DAYS: Record<string, number> = { "1d": 1, "1wk": 7, "1mo": 30 };
  const daysPerCandle = CANDLE_TO_DAYS[chartInterval] ?? 1;

  function bougiesLabel(n: number): string {
    const days        = Math.round(n * daysPerCandle);
    const marginDays  = Math.round(days * 0.30);
    const target      = new Date(Date.now() + days * 86400 * 1000);
    const dateStr     = target.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    const marginStr =
      marginDays < 14 ? `±${marginDays} jour${marginDays > 1 ? "s" : ""}` :
      marginDays < 60 ? `±${Math.round(marginDays / 7)} semaine${Math.round(marginDays / 7) > 1 ? "s" : ""}` :
                        `±${parseFloat((marginDays / 30).toFixed(1))} mois`;

    const durationStr =
      days <= 14 ? `~${days} jour${days > 1 ? "s" : ""}` :
      days <= 90 ? `~${Math.round(days / 7)} semaine${Math.round(days / 7) > 1 ? "s" : ""}` :
                   `~${parseFloat((days / 30).toFixed(1))} mois`;

    return `~${n} bougie${n > 1 ? "s" : ""} soit ${durationStr} — autour du ${dateStr}, marge d'erreur ${marginStr}`;
  }

  const resolvedContext: MarketContext = marketContext
    ?? classifyMarketContext(closes, highs, lows, volumes);

  const isBear = resolvedContext.structure.type === "bearish";
  const phaseMap: Record<string, { phase: MarketPhase; label: string; color: string; emoji: string }> = {
    "tendance_haussiere": { phase: "tendance_haussiere", label: "Tendance Haussière", color: "#22c55e", emoji: "📈" },
    "tendance_baissiere": { phase: "tendance_baissiere", label: "Tendance Baissière", color: "#ef4444", emoji: "📉" },
    "exces":              { phase: "exces",              label: "Excès",              color: "#f59e0b", emoji: "🚀" },
    "chaos":              { phase: "chaos",              label: "Chaos",              color: "#ef4444", emoji: "❌" },
    "range":              { phase: "range",              label: "Range",              color: "#4a90d9", emoji: "🔵" },
    "accumulation":       { phase: "accumulation",       label: "Accumulation",       color: "#60a5fa", emoji: "🔵" },
  };
  const key = resolvedContext.type === "tendance"
    ? (isBear ? "tendance_baissiere" : "tendance_haussiere")
    : resolvedContext.type;
  const mapped = phaseMap[key] ?? phaseMap["range"];
  const phase: MarketPhaseResult = {
    ...mapped,
    confidence: resolvedContext.confidence,
    description:
      resolvedContext.type === "chaos"
        ? "Volatilité extrême sans direction claire — aucune structure exploitable."
        : resolvedContext.type === "exces"
        ? `Excès de marché détecté — ADX ${resolvedContext.adx?.toFixed(0) ?? "—"}.`
        : resolvedContext.type === "tendance"
        ? `${isBear ? "Tendance baissière" : "Tendance haussière"} — ${resolvedContext.subtype ?? ""}, ADX ${resolvedContext.adx?.toFixed(0) ?? "—"}.`
        : `Marché sans direction claire (ADX ${resolvedContext.adx?.toFixed(0) ?? "—"}) — phase de consolidation ou range.`,
  };
  const squeeze    = calcSqueeze(closes);
  const breakout   = calcBreakoutTarget(closes, highs, lows);
  const confluence = calcConfluenceScore(closes, highs, lows, volumes);
  const cycle      = calcCyclePhase(closes);

  const panelColor =
    confluence.score >= 3 ? "#22c55e" :
    confluence.score >= 2 ? "#f59e0b" :
    "#ef4444";

  return (
    <Panel
      icon="🔭"
      title="Projection & Confluence"
      badge={{ label: confluence.label, color: panelColor }}
      borderColor={panelColor}
      defaultOpen={true}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

        {/* ── Encadré "Ce que ça signifie pour toi" ── */}
        {(() => {
          const ph  = phase.phase;
          const cs  = confluence.score;
          const cyc = cycle?.phase ?? null;

          let emoji = "📊", color: string = THEME.textSecondary, bg: string = THEME.bgCard;
          let border: string = THEME.borderMid, title = "", body = "";

          if (ph === "chaos") {
            emoji = "⛔"; color = "#ef4444"; bg = "#1e0808"; border = "#ef4444";
            title = "Contexte chaotique — ne pas agir";
            body  = "Le marché évolue sans direction stable avec une volatilité extrême. C'est le pire moment pour entrer en position : les règles habituelles ne s'appliquent plus. Attendre que la situation se stabilise avant toute décision.";
          } else if (ph === "tendance_baissiere") {
            // Cas spécial : essoufflement baissier avec confluence élevée → message nuancé
            if (phase.label?.includes("Essoufflement") || phase.description?.includes("essouffle")) {
              if (cs >= 3) {
                emoji = "⚠️"; color = "#f59e0b"; bg = "#1a1000"; border = "#f59e0b";
                title = "Tendance baissière qui s'essouffle — surveiller un retournement";
                body  = `La baisse perd de la force (${cs}/4 conditions alignées), mais la structure baissière reste active. Ce n'est pas encore le moment d'acheter — attendre un signal de retournement confirmé : Golden Cross ou premier Higher High. Un positionnement très partiel est envisageable uniquement si la structure HL se forme.`;
              } else {
                emoji = "⏸️"; color = "#f97316"; bg = "#1e0a00"; border = "#f97316";
                title = "Essoufflement baissier — attendre confirmation";
                body  = "La tendance baissière perd de la vitesse mais les conditions d'un retournement ne sont pas encore réunies. Rester en dehors du marché et attendre des signaux plus clairs avant d'agir.";
              }
            } else {
              emoji = "📉"; color = "#ef4444"; bg = "#1e0808"; border = "#ef4444";
              title = "Tendance baissière confirmée — éviter les achats";
              body  = "Le marché évolue structurellement à la baisse : les prix font des sommets et des creux de plus en plus bas. Acheter dans ce contexte revient à nager à contre-courant. Attendre un signal de retournement clair (Golden Cross + structure haussière) avant d'envisager une position.";
            }
          } else if (ph === "exces") {
            emoji = "🚀"; color = "#f59e0b"; bg = "#1a1000"; border = "#f59e0b";
            title = "Marché en excès — prudence extrême";
            body  = "Le marché monte très fort et les indicateurs signalent un excès de momentum. Entrer maintenant expose à un risque de correction brutale. Si vous êtes déjà en position, protéger les gains avec un stop serré plutôt que d'en rajouter.";
          } else if (ph === "tendance_haussiere" || ph === "accumulation") {
            if (cs >= 3 && (cyc === "trough" || cyc === "rising")) {
              emoji = "✅"; color = "#22c55e"; bg = "#0a1e0f"; border = "#22c55e";
              title = "Configuration favorable — bonne fenêtre d'entrée";
              body  = "La tendance de fond est haussière, plusieurs conditions techniques sont alignées et le cycle est en phase favorable. C'est le type de configuration qui offre le meilleur rapport risque/rendement. Ne pas investir tout d'un coup — fragmenter en 2 ou 3 tranches espacées.";
            } else if (cs >= 2 && cyc !== "peak") {
              emoji = "⚠️"; color = "#f59e0b"; bg = "#1a1000"; border = "#f59e0b";
              title = "Tendance haussière mais conditions partielles";
              body  = `La tendance de fond est positive mais seulement ${cs}/4 conditions sont réunies. Le contexte est correct sans être optimal. Une entrée fractionnée est envisageable avec un stop bien placé — attendre idéalement un creux cyclique pour améliorer le point d'entrée.`;
            } else if (cyc === "peak" || cyc === "falling") {
              emoji = "⏸️"; color = "#f59e0b"; bg = "#1a1000"; border = "#f59e0b";
              title = "Tendance haussière — cycle en phase haute";
              body  = "La tendance de fond est positive, mais le cycle est actuellement dans sa phase haute ou en retournement. C'est souvent le mauvais moment pour entrer : attendre que le cycle repasse en phase basse (creux) pour bénéficier d'un meilleur prix dans la tendance.";
            } else {
              emoji = "🔵"; color = "#60a5fa"; bg = "#111d30"; border = "#60a5fa";
              title = "Phase d'accumulation — surveiller le breakout";
              body  = "Le marché montre des signes d'accumulation : structure haussière naissante avec momentum encore faible. Pas encore le moment d'entrer en force — surveiller un breakout confirmé (prix au-dessus d'une résistance + volume en hausse) avant d'agir.";
            }
          } else {
            if (cs >= 3 && (cyc === "trough" || cyc === "rising")) {
              emoji = "⚠️"; color = "#f59e0b"; bg = "#1a1000"; border = "#f59e0b";
              title = "Range avec signal de creux — opportunité limitée";
              body  = `Le marché est sans direction claire, mais ${cs}/4 conditions sont alignées et le cycle est en phase basse. Une entrée tactique sur support est envisageable avec taille réduite et stop strict. Le potentiel reste limité tant que le range n'est pas cassé.`;
            } else {
              emoji = "⏳"; color = THEME.textSecondary; bg = THEME.bgCard; border = THEME.borderMid;
              title = "Marché en range — patience recommandée";
              body  = "Le marché oscille sans tendance claire. C'est la phase la plus difficile pour investir. La meilleure approche : attendre soit un breakout haussier confirmé, soit un signal de creux cyclique pour une entrée sur support.";
            }
          }

          if (!title) return null;

          return (
            <div style={{
              padding: "14px 16px",
              background: bg,
              borderRadius: 10,
              border: `1px solid ${border}55`,
              borderLeft: `4px solid ${border}`,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 800, color: border,
                textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8,
              }}>
                {emoji} Ce que ça signifie pour toi
              </div>
              <div style={{
                fontSize: 13, fontWeight: 700, color, marginBottom: 8, lineHeight: 1.4,
              }}>
                {title}
              </div>
              <div style={{ fontSize: 12, color: THEME.textSecondary, lineHeight: 1.8 }}>
                {body}
              </div>
              {squeeze?.isSqueeze && (
                <div style={{
                  marginTop: 10, padding: "8px 12px",
                  background: "#1a1000", borderRadius: 8,
                  borderLeft: "3px solid #f59e0b",
                  fontSize: 11, color: "#f59e0b", lineHeight: 1.6,
                }}>
                  ⚡ <strong>Compression de volatilité active</strong> — un mouvement fort est imminent dans un sens ou dans l'autre. Ne pas supposer la direction.
                </div>
              )}
              {breakout.hasTarget && (
                <div style={{
                  marginTop: 10, padding: "8px 12px",
                  background: breakout.direction === "up" ? "#0a1e0f" : "#1e0808",
                  borderRadius: 8,
                  borderLeft: `3px solid ${breakout.direction === "up" ? "#22c55e" : "#ef4444"}`,
                  fontSize: 11,
                  color: breakout.direction === "up" ? "#22c55e" : "#ef4444",
                  lineHeight: 1.6,
                }}>
                  {breakout.direction === "up" ? "📈" : "📉"}{" "}
                  <strong>Objectif de breakout actif</strong> — cible indicative à{" "}
                  {breakout.targetPct != null && breakout.targetPct > 0 ? "+" : ""}
                  {breakout.targetPct?.toFixed(1)}% ({currency} {breakout.targetPrice?.toFixed(2)}).
                  Valide encore ~{breakout.validBars} bougies.
                </div>
              )}
            </div>
          );
        })()}

        {/* Phase de marché */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 12px", background: THEME.bgCard,
          borderRadius: 8, borderLeft: `3px solid ${phase.color}`,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{phase.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: phase.color, marginBottom: 3 }}>
              Phase de marché estimée : {phase.label}
            </div>
            <div style={{ fontSize: 11, color: THEME.textSecondary, lineHeight: 1.5 }}>
              {phase.description}
            </div>
            <div style={{ fontSize: 9, color: THEME.textMuted, marginTop: 3 }}>
              Confiance : {phase.confidence}%
            </div>
          </div>
        </div>

        {/* Score de confluence */}
        <div style={{
          padding: "10px 12px", background: THEME.bgCard,
          borderRadius: 8, borderLeft: `3px solid ${panelColor}`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: panelColor,
            textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
            Confluence — {confluence.score}/4 conditions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {confluence.details.map((d, i) => (
              <div key={i} style={{ fontSize: 11, color: THEME.textSecondary, lineHeight: 1.5 }}>
                {d}
              </div>
            ))}
          </div>
        </div>

        {/* Objectif de breakout */}
        {breakout.hasTarget && (
          <div style={{
            padding: "10px 12px", background: THEME.bgCard,
            borderRadius: 8,
            borderLeft: `3px solid ${breakout.direction === "up" ? "#22c55e" : "#ef4444"}`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 800,
              color: breakout.direction === "up" ? "#22c55e" : "#ef4444",
              textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
              {breakout.direction === "up" ? "📈" : "📉"} Objectif potentiel indicatif
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: THEME.textPrimary,
              fontFamily: "'IBM Plex Mono',monospace", marginBottom: 4 }}>
              {breakout.targetPct != null && breakout.targetPct > 0 ? "+" : ""}
              {breakout.targetPct?.toFixed(1)}% · {currency} {breakout.targetPrice?.toFixed(2)}
            </div>
            <div style={{ fontSize: 10, color: THEME.textMuted }}>
              {bougiesLabel(breakout.validBars)} · {breakout.barsElapsed} bougies écoulées depuis le breakout
            </div>
            <div style={{ fontSize: 9, color: THEME.textMuted, marginTop: 4, fontStyle: "italic" }}>
              ⚠️ Objectif indicatif uniquement — une target est invalidée après 30 bougies.
            </div>
          </div>
        )}

        {/* Squeeze */}
        {squeeze?.isSqueeze && (
          <div style={{
            padding: "10px 12px", background: THEME.bgCard,
            borderRadius: 8, borderLeft: "3px solid #f59e0b",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#f59e0b",
              textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
              ⚡ Compression de volatilité détectée
            </div>
            <div style={{ fontSize: 11, color: THEME.textSecondary, lineHeight: 1.5 }}>
              {squeeze.description}
            </div>
            <div style={{ fontSize: 9, color: THEME.textMuted, marginTop: 3 }}>
              Intensité : {squeeze.intensity === "high" ? "extrême" : squeeze.intensity === "medium" ? "forte" : "modérée"} · ATR ratio : {squeeze.atrRatio}
            </div>
          </div>
        )}


        {/* Phase cyclique */}
        {cycle != null && (
          <div style={{
            padding: "10px 12px", background: THEME.bgCard,
            borderRadius: 8, borderLeft: "3px solid #a78bfa",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#a78bfa",
              textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
              〰️ Phase cyclique estimée
            </div>
            <div style={{ fontSize: 11, color: THEME.textSecondary, lineHeight: 1.5 }}>
              {cycle.description}
            </div>
            <div style={{ fontSize: 11, color: "#a78bfa", marginTop: 4, fontWeight: 600 }}>
              {bougiesLabel(cycle.bougiesEstimated)}
            </div>
            <div style={{ fontSize: 9, color: THEME.textMuted, marginTop: 3, fontStyle: "italic" }}>
              Approximation via RSI — marge d'erreur ±30%. Ne pas utiliser seul comme signal d'entrée.
            </div>
          </div>
        )}

        <div style={{ fontSize: 9, color: THEME.textMuted, fontStyle: "italic" }}>
          Ces projections sont algorithmiques et indicatives. Elles ne constituent pas un conseil en investissement.
        </div>

      </div>
    </Panel>
  );
}

function NewsPanel({ ticker, quoteType, shortName }: { ticker: string; quoteType?: string; shortName?: string }) {
  const [news, setNews]     = useState<NewsItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const qt = (quoteType || "").toUpperCase();

  useEffect(() => {
    if (!ticker) return;
    fetchNewsForTicker(ticker, quoteType, shortName).then(items => {
      setNews(items);
      setLoaded(true);
    });
  }, [ticker, shortName]);

  if (loaded && news.length === 0) return null;
  if (!loaded) return null;

  const sourceLabel = quoteType === "CRYPTOCURRENCY" ? "Cointelegraph"
    : "Google News";

  return (
    <Panel
      icon="📰"
      title="Actualités"
      badge2={{ label: `${sourceLabel} · ${news.length} article${news.length > 1 ? "s" : ""}`, color: THEME.textMuted }}
      borderColor={THEME.borderPanel}
      defaultOpen={false}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {news.map((n, i) => (
          <a
            key={i}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "flex-start",
              gap: 10, padding: "10px 12px",
              background: THEME.bgCard,
              borderRadius: 8,
              borderLeft: `3px solid ${THEME.borderMid}`,
              textDecoration: "none",
              transition: "border-color .15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderLeftColor = THEME.accent)}
            onMouseLeave={e => (e.currentTarget.style.borderLeftColor = THEME.borderMid)}
          >
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 700,
                color: THEME.textPrimary, lineHeight: 1.5, marginBottom: 4,
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>
                {n.title}
              </div>
              <div style={{ fontSize: 10, color: THEME.textMuted }}>
                <span style={{ color: THEME.textSecondary, fontWeight: 600 }}>{n.source}</span>
                {" · "}
                <span>{n.date}</span>
              </div>
            </div>
            <span style={{ fontSize: 10, color: THEME.textMuted, flexShrink: 0, marginTop: 2 }}>↗</span>
          </a>
        ))}
        <div style={{ fontSize: 9, color: THEME.textMuted, marginTop: 4 }}>
          Source : {sourceLabel} · Actualités en temps réel
        </div>
      </div>
    </Panel>
  );
}

async function translateToFr(text: string): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=${encodeURIComponent(text.slice(0, 1500))}`;
    const r = await fetch(url);
    const d = await r.json();
    return d[0].map((item: any) => item[0]).join("") || text;
  } catch { return text; }
}

function resampleToMonthly(weekly: {
  closes: (number|null)[]; opens: (number|null)[]; highs: (number|null)[];
  lows: (number|null)[]; volumes: (number|null)[]; timestamps: number[];
}): typeof weekly {
  if (!weekly || weekly.timestamps.length === 0) return weekly;
  const months: Record<string, { o: number; h: number; l: number; c: number; v: number; ts: number }> = {};
  for (let i = 0; i < weekly.timestamps.length; i++) {
    const ts  = weekly.timestamps[i];
    const d   = new Date(ts * 1000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cl  = weekly.closes[i];
    const op  = weekly.opens[i];
    const hi  = weekly.highs[i];
    const lo  = weekly.lows[i];
    const vo  = weekly.volumes[i];
    if (cl == null) continue;
    if (!months[key]) {
      months[key] = { o: op ?? cl, h: hi ?? cl, l: lo ?? cl, c: cl, v: vo ?? 0, ts };
    } else {
      if (hi != null && hi > months[key].h) months[key].h = hi;
      if (lo != null && lo < months[key].l) months[key].l = lo;
      months[key].c = cl;
      months[key].v += vo ?? 0;
    }
  }
  const keys = Object.keys(months).sort();
  return {
    timestamps: keys.map(k => months[k].ts),
    opens:      keys.map(k => months[k].o),
    highs:      keys.map(k => months[k].h),
    lows:       keys.map(k => months[k].l),
    closes:     keys.map(k => months[k].c),
    volumes:    keys.map(k => months[k].v),
  };
}

// ── SYNTHÈSE SENTIMENT CRYPTO (lecture croisée) ───────────────
interface CryptoSentimentSynthesis {
  emoji:   string;
  color:   string;
  bg:      string;
  border:  string;
  title:   string;
  body:    string;
  badge:   string;
}

function computeCryptoSentimentSynthesis(
  fearGreed:    { value: number; label: string } | null,
  longShort:    { ratio: number; longPct: number; shortPct: number } | null,
  funding:      { rate: number; markPrice: number } | null,
  openInterest: number | null,
): CryptoSentimentSynthesis | null {
  const fg  = fearGreed?.value   ?? null;
  const ls  = longShort?.ratio   ?? null;
  const fr  = funding?.rate      ?? null;
  const lp  = longShort?.longPct ?? null;

  // Données insuffisantes
  if (fg == null && ls == null && fr == null) return null;

  // ── MATRICE DE LECTURE CROISÉE ────────────────────────────
  // Priorité 1 : Peur extrême + longs piégés + funding négatif → capitulation
  if (fg != null && fg <= 15 && ls != null && ls > 1.8 && fr != null && fr < -0.0001) {
    return {
      emoji: "💥", color: "#ef4444", bg: "#1e0808", border: "#ef4444",
      badge: "Risque de cascade",
      title: "Peur extrême + longs piégés + shorts dominants",
      body: `Fear & Greed à ${fg}/100, ${lp?.toFixed(1) ?? "—"}% de longs, funding négatif (${fr != null ? (fr*100).toFixed(4)+"%" : "—"}) — configuration classique de cascade baissière avant capitulation. Les longs n'ont pas encore liquidé, ce qui amplifie le risque de chute brutale.`,
    };
  }

  // Priorité 2 : Peur extrême + shorts dominants + funding négatif → rebond violent possible
  if (fg != null && fg <= 15 && ls != null && ls < 0.7 && fr != null && fr < -0.0002) {
    return {
      emoji: "🌀", color: "#22c55e", bg: "#0a1e0f", border: "#22c55e",
      badge: "Short squeeze potentiel",
      title: "Peur extrême + shorts écrasants + funding très négatif",
      body: `Fear & Greed à ${fg}/100, ${longShort?.shortPct?.toFixed(1) ?? "—"}% de shorts, funding à ${fr != null ? (fr*100).toFixed(4)+"%" : "—"} — capitulation des acheteurs proche de son terme. Quand tout le monde est vendu et que le funding est très négatif, le prochain catalyseur haussier peut déclencher un short squeeze violent.`,
    };
  }

  // Priorité 3 : Euphorie + longs dominants + funding positif → retournement imminent
  if (fg != null && fg >= 80 && ls != null && ls > 2.0 && fr != null && fr > 0.0003) {
    return {
      emoji: "⚠️", color: "#ef4444", bg: "#1e0808", border: "#ef4444",
      badge: "Euphorie dangereuse",
      title: "Extreme Greed + longs en surchauffe + funding élevé",
      body: `Fear & Greed à ${fg}/100, ${lp?.toFixed(1) ?? "—"}% de longs, funding à ${fr != null ? "+"+( fr*100).toFixed(4)+"%" : "—"} — euphorie généralisée. Les longs paient cher pour maintenir leurs positions. Historiquement, cette configuration précède des corrections de 15 à 40% en quelques semaines.`,
    };
  }

  // Priorité 4 : Greed élevé + longs dominants mais funding modéré → prudence
  if (fg != null && fg >= 70 && ls != null && ls > 1.6) {
    return {
      emoji: "🔶", color: "#f59e0b", bg: "#1a1000", border: "#f59e0b",
      badge: "Optimisme excessif",
      title: "Greed élevé + dominance haussière",
      body: `Fear & Greed à ${fg}/100 avec ${lp?.toFixed(1) ?? "—"}% de longs — le marché est optimiste mais pas encore en euphorie complète. ${fr != null ? `Funding à ${(fr*100).toFixed(4)}% — ` : ""}Les entrées à ce niveau offrent un rapport risque/rendement dégradé. Attendre un repli vers des niveaux plus neutres (F&G 40-60).`,
    };
  }

  // Priorité 5 : Fear modéré + shorts dominants + funding négatif → opportunité en construction
  if (fg != null && fg <= 30 && ls != null && ls < 0.85 && fr != null && fr < 0) {
    return {
      emoji: "🔍", color: "#60a5fa", bg: "#111d30", border: "#60a5fa",
      badge: "Zone d'accumulation",
      title: "Peur modérée + shorts dominants + funding négatif",
      body: `Fear & Greed à ${fg}/100, ${longShort?.shortPct?.toFixed(1) ?? "—"}% de shorts, funding négatif (${(fr*100).toFixed(4)}%) — les acheteurs sont pessimistes et les vendeurs à découvert abondants. Cette configuration précède souvent une phase d'accumulation avant rebond. Confirmer avec un signal technique (creux de cycle ou RSI < 35).`,
    };
  }

  // Priorité 6 : Neutralité — signaux contradictoires ou peu lisibles
  if (fg != null && fg >= 40 && fg <= 60 && ls != null && ls >= 0.9 && ls <= 1.3) {
    return {
      emoji: "⚖️", color: "#94a3b8", bg: THEME.bgCard, border: THEME.borderMid,
      badge: "Sentiment neutre",
      title: "Marché en équilibre — pas de signal dominant",
      body: `Fear & Greed à ${fg}/100, ratio Long/Short à ${ls?.toFixed(2) ?? "—"}${fr != null ? `, funding à ${(fr*100).toFixed(4)}%` : ""} — le sentiment est équilibré. Aucun excès détecté dans un sens ou dans l'autre. Le prochain mouvement directionnel sera probablement déclenché par un catalyseur externe (macro, réglementation, liquidation de grande taille).`,
    };
  }

  // Fallback : au moins Fear & Greed disponible
  if (fg != null) {
    const fgColor = fg <= 25 ? "#ef4444" : fg <= 45 ? "#f97316" : fg <= 55 ? "#94a3b8" : fg <= 75 ? "#f59e0b" : "#22c55e";
    const fgDesc  = fg <= 25 ? "Peur extrême" : fg <= 45 ? "Peur" : fg <= 55 ? "Neutre" : fg <= 75 ? "Greed" : "Extreme Greed";
    return {
      emoji: fg <= 45 ? "😨" : fg <= 55 ? "😐" : "😄",
      color: fgColor, bg: THEME.bgCard, border: fgColor,
      badge: fgDesc,
      title: `Fear & Greed à ${fg}/100 — ${fgDesc}`,
      body: `${ls != null ? `Ratio Long/Short : ${ls.toFixed(2)} (${lp?.toFixed(1) ?? "—"}% longs). ` : ""}${fr != null ? `Funding : ${fr > 0 ? "+" : ""}${(fr*100).toFixed(4)}%. ` : ""}${fg <= 25 ? "Le marché est dans un état de peur prononcée — surveiller un signal technique de retournement pour envisager une entrée." : fg >= 75 ? "L'optimisme est élevé — la marge de sécurité pour entrer est réduite." : "Sentiment intermédiaire — croiser avec l'analyse technique."}`,
    };
  }

  return null;
}

function CryptoView({ data, activeTab = "resume" }: { data: any; activeTab?: "resume"|"technique"|"marche"|"macro" }) {
  const md     = data.market_data || {};
  const price    = md.current_price?.usd as number | undefined;
  const priceEur = md.current_price?.eur as number | undefined;
  const chg24h = md.price_change_percentage_24h as number | undefined;
  const chg7d  = md.price_change_percentage_7d  as number | undefined;
  const chg30d = md.price_change_percentage_30d  as number | undefined;
  const chg1y  = md.price_change_percentage_1y   as number | undefined;
  const mktCap = md.market_cap?.usd     as number | undefined;
  const vol24h = md.total_volume?.usd   as number | undefined;
  const supply = md.circulating_supply  as number | undefined;
  const maxSup = md.max_supply          as number | undefined;
  const ath    = md.ath?.usd            as number | undefined;
  const athPct = md.ath_change_percentage?.usd as number | undefined;
  const atlUsd = md.atl?.usd            as number | undefined;
  const high24 = md.high_24h?.usd       as number | undefined;
  const low24  = md.low_24h?.usd        as number | undefined;
  const rank   = data.market_cap_rank   as number | undefined;
  const up24   = (chg24h ?? 0) >= 0;

  // Votes communauté (top-level dans data, pas dans market_data)
  const sentUp   = data.sentiment_votes_up_percentage   as number | undefined;
  const sentDown = data.sentiment_votes_down_percentage as number | undefined;

  // Métriques dérivées
  const volMktRatio = (vol24h != null && mktCap != null && mktCap > 0) ? vol24h / mktCap : undefined;

  // Position dans le range historique (ATL → ATH)
  let rangePos: number | null = null;
  if (price != null && ath != null && atlUsd != null && ath > atlUsd)
    rangePos = ((price - atlUsd) / (ath - atlUsd)) * 100;

  // Position dans le range 24h
  let range24Pos: number | null = null;
  if (price != null && high24 != null && low24 != null && high24 > low24)
    range24Pos = ((price - low24) / (high24 - low24)) * 100;

  const sym   = (data.symbol || "").toLowerCase();
  const isEth = sym === "eth" || sym === "steth";
  const cgId  = data.id || "";

  // ── Chart state ──────────────────────────────────────────────
  const genesisYear = data.genesis_date ? new Date(data.genesis_date).getFullYear() : null;
  const age = genesisYear ? new Date().getFullYear() - genesisYear : 0;

  const UT_CONFIG: Record<string, { interval: string; limit: number; label: string; perfLabel: string }> = {
    "1H": { interval: "1h", limit: 370, label: "1H", perfLabel: "~5 jours"  },
    "4H": { interval: "4h", limit: 370, label: "4H", perfLabel: "~20 jours" },
    "1D": { interval: "1d", limit: 370, label: "1D", perfLabel: "~6 mois"   },
    "1W": { interval: "1w", limit: 370, label: "1W", perfLabel: "~2.5 ans"  },
    "1M": { interval: "1M", limit: 370, label: "1M", perfLabel: "~10 ans"   },
  };
  const UT_DISPLAY = 120;
  const UT_PERIODS = Object.entries(UT_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

  const [ut,           setUt]           = useState("1D");
  type ChartSeries = { closes: (number|null)[]; opens: (number|null)[]; highs: (number|null)[]; lows: (number|null)[]; volumes: (number|null)[]; timestamps: number[] } | null;
  const [allChartData,       setAllChartData]       = useState<ChartSeries>(null);
  const [allChartDataWeekly, setAllChartDataWeekly] = useState<ChartSeries>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [candleData,   setCandleData]   = useState<ChartSeries | undefined>(undefined);
  const [candleLoading, setCandleLoading] = useState(false);
  const [optimalUTKey, setOptimalUTKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    setChartLoading(true);
    setCandleData(undefined);
    const timer = setTimeout(async () => {
      const sym = (data.symbol || "").toUpperCase();
      const [daily, weekly, candle1D] = await Promise.all([
        binanceOHLCV(sym, "1d", 1000),
        binanceOHLCV(sym, "1w", 1000),
        binanceOHLCV(sym, "1d", UT_CONFIG["1D"].limit),
      ]);
      const fallback = (!daily && !weekly) ? await cgOHLCV(data.id) : null;
      setAllChartData(daily || fallback);
      setAllChartDataWeekly(weekly || null);
      setChartLoading(false);
      setCandleData(candle1D ?? fallback ?? null);
    }, 500);
    return () => clearTimeout(timer);
  }, [data.id]); // eslint-disable-line

  useEffect(() => {
    if (!allChartData?.closes) return;
    const sw = calcSinewave(allChartData.closes);
    if (sw) {
      const dp = sw.dominantPeriod;
      setOptimalUTKey(dp <= 10 ? "1H" : "1D");
    }
  }, [allChartData]);

  const loadCandleData = useCallback(async (u: string) => {
    const cfg = UT_CONFIG[u];
    if (!cfg) return;
    setCandleLoading(true);
    const sym = (data.symbol || "").toUpperCase();
    const raw = await binanceOHLCV(sym, cfg.interval, cfg.limit);
    setCandleData(raw ?? null);
    setCandleLoading(false);
  }, [data.symbol]); // eslint-disable-line

  const handleUTChange = (u: string) => { setUt(u); loadCandleData(u); };

  // ── Description traduite ─────────────────────────────────────
  const [descFr, setDescFr] = useState<string>("");

  useEffect(() => {
    const en = (data.description?.en || "").replace(/<[^>]+>/g, "").trim();
    if (!en) return;
    if (data.description?.fr?.trim()) {
      setDescFr(data.description.fr.replace(/<[^>]+>/g, "").trim());
      return;
    }
    translateToFr(en).then(setDescFr);
  }, [data.id]);

  // ── États enrichissement async ────────────────────────────────
  const [fearGreed,     setFearGreed]     = useState<{ value: number; label: string } | null>(null);
  const [staking,       setStaking]       = useState<{ apr: number; queue: number | null } | null>(null);
  const [tvl,           setTvl]           = useState<number | null>(null);
  const [funding,       setFunding]       = useState<{ rate: number; markPrice: number } | null>(null);
  const [openInterest,  setOpenInterest]  = useState<number | null>(null);
  const [longShort,     setLongShort]     = useState<{ ratio: number; longPct: number; shortPct: number } | null>(null);
  const [cgGlobal,      setCgGlobal]      = useState<{ btc: number; eth: number; totalMktCap: number; active_cryptocurrencies: number } | null>(null);
  const [showEur,       setShowEur]       = useState(false);
  const totalCoins  = cgGlobal?.active_cryptocurrencies ?? 15000;
  const topPct      = rank != null ? (rank / totalCoins) * 100 : undefined;
  const btcDomRatio = (mktCap != null && cgGlobal != null && cgGlobal.totalMktCap > 0)
    ? mktCap / cgGlobal.totalMktCap
    : undefined;

  useEffect(() => {
    const jobs: Promise<void>[] = [];

    jobs.push(
      fetch(`${PROXY}?type=feargreed`)
        .then(r => r.json())
        .then(j => {
          const d = j?.data?.[0];
          if (d) setFearGreed({ value: parseInt(d.value, 10), label: d.value_classification });
        })
        .catch(() => {})
    );

    if (isEth) {
      jobs.push(
        fetch(`${PROXY}?type=beaconchain`)
          .then(r => r.json())
          .then(j => {
            const apr   = j?.apr?.data?.apr as number | undefined;
            const queue = j?.queue?.data?.beaconcount as number | undefined;
            if (apr != null) setStaking({ apr, queue: queue ?? null });
          })
          .catch(() => {})
      );
    }

    if (cgId) {
      jobs.push(
        fetch(`${PROXY}?type=defillama&slug=${encodeURIComponent(cgId)}`)
          .then(r => r.json())
          .then(j => {
            const arr = j?.tvl;
            if (Array.isArray(arr) && arr.length > 0) {
              const last = arr[arr.length - 1]?.totalLiquidityUSD;
              if (last != null) setTvl(last);
            }
          })
          .catch(() => {})
      );
    }

    jobs.push(
      Promise.all([
        fetch(`${PROXY}?type=coinglass&symbol=${encodeURIComponent(sym.toUpperCase())}`).then(r => r.json()).catch(() => null),
        fetch(`${PROXY}?type=openinterest&symbol=${encodeURIComponent(sym.toUpperCase())}`).then(r => r.json()).catch(() => null),
        fetch(`${PROXY}?type=longshort&symbol=${encodeURIComponent(sym.toUpperCase())}`).then(r => r.json()).catch(() => null),
      ]).then(([fundingData, oiData, lsData]) => {
        const lsEntry = Array.isArray(lsData) ? lsData[0] : null;
        if (lsEntry?.longShortRatio != null) {
          setLongShort({
            ratio:    parseFloat(lsEntry.longShortRatio),
            longPct:  parseFloat(lsEntry.longAccount)  * 100,
            shortPct: parseFloat(lsEntry.shortAccount) * 100,
          });
        }
        const entry = fundingData?.fundingRate?.[0];
        if (entry) {
          const rate      = parseFloat(entry.fundingRate);
          const markPrice = parseFloat(entry.markPrice);
          if (!isNaN(rate)) setFunding({ rate, markPrice });
        }
        const oiUnits   = parseFloat(oiData?.openInterest || "0");
        const markPrice = parseFloat(fundingData?.fundingRate?.[0]?.markPrice || "0");
        const oiUsd     = markPrice > 0 && oiUnits > 0 ? oiUnits * markPrice : null;
        setOpenInterest(oiUsd);
      }).catch(() => {})
    );

    jobs.push(
      fetch(`${PROXY}?type=cglobal`)
        .then(r => r.json())
        .then(j => {
          const d = j?.data;
          if (d) setCgGlobal({
            btc:                     d.market_cap_percentage?.btc  ?? 0,
            eth:                     d.market_cap_percentage?.eth  ?? 0,
            totalMktCap:             d.total_market_cap?.usd       ?? 0,
            active_cryptocurrencies: d.active_cryptocurrencies     ?? 15000,
          });
        })
        .catch(() => {})
    );

    Promise.allSettled(jobs);
  }, [cgId, isEth, sym]);

  const fmtTvl = (v: number) =>
    v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${fmt(v)}`;

  const pctColor = (v: number | undefined) =>
    v == null ? THEME.textMuted : v >= 0 ? THEME.scoreGreen : THEME.scoreRed;
  const pctLabel = (v: number | undefined) =>
    v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  return (
    <div style={{ animation:"fadeIn .4s ease" }}>

      {/* ── HEADER — toujours visible ── */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:16, marginBottom:16, flexWrap:"wrap" }}>
        {data.image?.small && <img src={data.image.small} alt="" style={{ width:52, height:52, borderRadius:"50%", marginTop:4 }}/>}
        <div style={{ flex:1 }}>
          <div style={{ fontSize:22, fontWeight:800, color:THEME.textPrimary, marginBottom:6 }}>
            {data.name}<TypeBadge type="CRYPTOCURRENCY"/>
            <span style={{ color:"#445", fontSize:13, fontWeight:400, marginLeft:8 }}>{data.symbol?.toUpperCase()}</span>
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:14, flexWrap:"wrap" }}>
            <span style={{ fontSize:34, fontWeight:900, color:THEME.accent, fontFamily:"'IBM Plex Mono',monospace" }}>
              {showEur && priceEur != null ? `${fmt(priceEur)} €` : `$${fmt(price)}`}
            </span>
            {priceEur != null && (
              <button
                onClick={() => setShowEur(v => !v)}
                style={{
                  fontSize:10, padding:"3px 9px", borderRadius:6,
                  border:`1px solid ${showEur ? THEME.accent : THEME.scoreAmber}`,
                  background: showEur ? THEME.accent : THEME.scoreAmber + "22",
                  color: showEur ? THEME.bgPage : THEME.scoreAmber,
                  cursor:"pointer", fontFamily:"'IBM Plex Mono',monospace",
                  fontWeight:700, alignSelf:"center",
                }}
              >{showEur ? "↩ USD" : "≈ EUR"}</button>
            )}
            <span style={{ fontSize:14, fontWeight:700, color: up24 ? THEME.scoreGreen : THEME.scoreRed }}>
              {up24 ? "▲" : "▼"} {Math.abs(chg24h ?? 0).toFixed(2)}% 24h
            </span>
            {chg7d  != null && <span style={{ fontSize:12, color:pctColor(chg7d)  }}>{chg7d  >= 0 ? "▲" : "▼"} {Math.abs(chg7d ).toFixed(2)}% 7j</span>}
            {chg30d != null && <span style={{ fontSize:12, color:pctColor(chg30d) }}>{chg30d >= 0 ? "▲" : "▼"} {Math.abs(chg30d).toFixed(2)}% 30j</span>}
            {chg1y  != null && <span style={{ fontSize:12, color:pctColor(chg1y)  }}>{chg1y  >= 0 ? "▲" : "▼"} {Math.abs(chg1y ).toFixed(2)}% 1an</span>}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          ONGLET RÉSUMÉ
      ══════════════════════════════════════ */}
      {activeTab === "resume" && (
        <div style={{ display:"flex", gap:24, alignItems:"flex-start", flexWrap:"wrap" }}>

          {/* Colonne gauche — graphique */}
          <div style={{ flex:"1 1 55%", minWidth:320 }}>
            <ChartBlock
              chartData={allChartData}
              chartDataWeekly={allChartDataWeekly}
              candleData={candleData}
              candleLoading={candleLoading}
              candleDisplay={candleData !== undefined ? UT_DISPLAY : undefined}
              currency="USD"
              quoteType="CRYPTOCURRENCY"
              period={ut}
              periods={UT_PERIODS}
              onPeriodChange={handleUTChange}
              loading={chartLoading}
              optimalUTKey={optimalUTKey}
            />
          </div>

          {/* Colonne droite — verdict + recommandation */}
          <div style={{ flex:"1 1 35%", minWidth:280,
            display:"flex", flexDirection:"column", gap:12,
            position:"sticky", top:"72px" }}>
            {allChartData && allChartData.closes.filter((v: number|null) => v != null).length > 20 && (() => {
              const cryptoInterval: "1d"|"1wk"|"1mo" =
                ut === "1W" ? "1wk" : ut === "1M" ? "1mo" : "1d";
              const rawData = candleData ?? allChartData;
              const last = rawData.closes.length;
              const start = Math.max(0, last - UT_DISPLAY);
              const cryptoData = {
                closes:     rawData.closes.slice(start),
                opens:      rawData.opens.slice(start),
                highs:      rawData.highs.slice(start),
                lows:       rawData.lows.slice(start),
                volumes:    rawData.volumes.slice(start),
                timestamps: rawData.timestamps.slice(start),
              };
              const upperCtx = cryptoInterval === "1d" && allChartDataWeekly
                ? classifyMarketContext(allChartDataWeekly.closes, allChartDataWeekly.highs, allChartDataWeekly.lows, allChartDataWeekly.volumes)
                : null;
              const _marketCtx    = classifyMarketContext(cryptoData.closes, cryptoData.highs, cryptoData.lows, cryptoData.volumes);
              const _techComputed = computeTechSignals(cryptoData.closes, cryptoData.volumes, cryptoData.highs, cryptoData.lows, cryptoInterval);
              const upperBearish  = upperCtx != null &&
                (upperCtx.structure.type === "bearish" || upperCtx.type === "chaos" ||
                 (upperCtx.subtype === "essoufflement" && upperCtx.structure.type === "bullish"));
              const _confluenceResult = calcConfluenceScore(cryptoData.closes, cryptoData.highs, cryptoData.lows, cryptoData.volumes);
              const _finalScoreRaw = computeFinalScore(null, _marketCtx, _techComputed.signals, cryptoData.closes, _confluenceResult?.score ?? null);
              const score = upperBearish && _finalScoreRaw.score > 5
                ? parseFloat(Math.max(1, _finalScoreRaw.score - 1.5).toFixed(1))
                : _finalScoreRaw.score;
              const v = getVerdict(score);
              const cryptoEntryRec = computeCryptoEntryRecommendation(
                upperBearish ? { ..._marketCtx, fundamentalConfirm: "warns" } : _marketCtx,
                _techComputed.signals,
                _techComputed.sinewave,
                fearGreed,
                funding,
              );
              if (!v) return null;
              return (
                <>
                  <div style={{
                    background: v.color+"0f",
                    border:`1px solid ${v.color}33`,
                    borderRadius:14, padding:"18px 20px",
                  }}>
                    <div style={{ display:"flex", justifyContent:"center",
                      marginBottom:14 }}>
                      <div style={{ display:"flex", flexDirection:"column",
                        alignItems:"center", gap:4 }}>
                        <ScoreGauge score={score}/>
                        <div style={{ display:"flex", alignItems:"baseline", gap:3 }}>
                          <span style={{ fontSize:36, fontWeight:900,
                            color:scoreColor(score),
                            fontFamily:"'IBM Plex Mono',monospace" }}>
                            {score}
                          </span>
                          <span style={{ fontSize:12, color:THEME.textSecondary,
                            fontFamily:"'IBM Plex Mono',monospace" }}>/10</span>
                        </div>
                        <div style={{ fontSize:9, color:THEME.textMuted,
                          textTransform:"uppercase", letterSpacing:1.5 }}>
                          Timing Technique
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize:18, fontWeight:900,
                      color:v.color, marginBottom:4 }}>
                      {v.emoji} {v.label}
                    </div>
                    <div style={{ fontSize:11, color:THEME.textSecondary, lineHeight:1.4 }}>
                      {v.desc}
                    </div>
                    {upperBearish && (
                      <div style={{ marginTop:10, padding:"8px 12px",
                        background:"#1e0808",
                        border:`1px solid ${THEME.scoreRed}44`,
                        borderRadius:8, fontSize:10, color:THEME.scoreRed }}>
                        ⚠️ Contexte hebdomadaire défavorable — score pénalisé.
                      </div>
                    )}
                  </div>
                  <EntryRecommendationPanel rec={cryptoEntryRec}/>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          ONGLET TECHNIQUE
      ══════════════════════════════════════ */}
      {activeTab === "technique" && (() => {
        if (!allChartData || allChartData.closes.filter((v: number|null) => v != null).length <= 20)
          return null;
        const cryptoInterval: "1d"|"1wk"|"1mo" =
          ut === "1W" ? "1wk" : ut === "1M" ? "1mo" : "1d";
        const rawData = candleData ?? allChartData;
        const last = rawData.closes.length;
        const start = Math.max(0, last - UT_DISPLAY);
        const cryptoData = {
          closes:     rawData.closes.slice(start),
          opens:      rawData.opens.slice(start),
          highs:      rawData.highs.slice(start),
          lows:       rawData.lows.slice(start),
          volumes:    rawData.volumes.slice(start),
          timestamps: rawData.timestamps.slice(start),
        };
        const upperCtx = cryptoInterval === "1d" && allChartDataWeekly
          ? classifyMarketContext(allChartDataWeekly.closes, allChartDataWeekly.highs, allChartDataWeekly.lows, allChartDataWeekly.volumes)
          : null;
        const marketCtx    = classifyMarketContext(cryptoData.closes, cryptoData.highs, cryptoData.lows, cryptoData.volumes);
        const techComputed = computeTechSignals(cryptoData.closes, cryptoData.volumes, cryptoData.highs, cryptoData.lows, cryptoInterval);
        const upperBearish = upperCtx != null &&
          (upperCtx.structure.type === "bearish" || upperCtx.type === "chaos" ||
           (upperCtx.subtype === "essoufflement" && upperCtx.structure.type === "bullish"));
        const confluenceResult = calcConfluenceScore(cryptoData.closes, cryptoData.highs, cryptoData.lows, cryptoData.volumes);
        const finalScoreResult = computeFinalScore(null, marketCtx, techComputed.signals, cryptoData.closes, confluenceResult?.score ?? null);
        const adjustedScore = upperBearish && finalScoreResult.score > 5
          ? parseFloat(Math.max(1, finalScoreResult.score - 1.5).toFixed(1))
          : finalScoreResult.score;
        const adjustedResult = { ...finalScoreResult, score: adjustedScore };
        return (
          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
            {upperBearish && (
              <div style={{ padding:"8px 14px", marginBottom:10,
                background:"#1e0808", border:`1px solid ${THEME.scoreRed}44`,
                borderRadius:10, fontSize:11, color:THEME.scoreRed,
                display:"flex", alignItems:"center", gap:8 }}>
                ⚠️ <strong>Contexte hebdomadaire défavorable (UT+1)</strong> —
                tendance supérieure baissière. Score pénalisé de −1.5 points.
              </div>
            )}
            <MarketContextPanel context={adjustedResult.context} modifiers={adjustedResult.modifiers}/>
            <TechnicalPanel precomputed={techComputed} context={adjustedResult.context}/>
            {!chartLoading && allChartData.closes.filter((v: number|null) => v != null).length >= 50 && (() => {
              const rawDataProj = candleData ?? allChartData;
              const lastP = rawDataProj.closes.length;
              const startP = Math.max(0, lastP - UT_DISPLAY);
              const slicedProj = lastP >= 20 ? {
                closes:  rawDataProj.closes.slice(startP),
                highs:   rawDataProj.highs.slice(startP),
                lows:    rawDataProj.lows.slice(startP),
                volumes: rawDataProj.volumes.slice(startP),
              } : rawDataProj;
              const marketCtxProj = classifyMarketContext(slicedProj.closes, slicedProj.highs, slicedProj.lows, slicedProj.volumes);
              return (
                <ProjectionPanel
                  closes={slicedProj.closes}
                  highs={slicedProj.highs}
                  lows={slicedProj.lows}
                  volumes={slicedProj.volumes}
                  currency="USD"
                  chartInterval={cryptoInterval}
                  period={ut}
                  marketContext={marketCtxProj}
                />
              );
            })()}
          </div>
        );
      })()}

      {/* ══════════════════════════════════════
          ONGLET MARCHÉ
      ══════════════════════════════════════ */}
      {activeTab === "marche" && (
        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>

          {/* Description */}
          {descFr && (
            <div style={{ background:THEME.bgPanel, border:`1px solid ${THEME.borderPanel}`,
              borderRadius:12, padding:"14px 18px", marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:800, color:THEME.textSecondary,
                textTransform:"uppercase", letterSpacing:2, marginBottom:8 }}>
                📖 À propos
              </div>
              <div style={{ fontSize:12, color:THEME.textSecondary, lineHeight:1.8,
                borderLeft:`3px solid ${THEME.accent}`, paddingLeft:12 }}>
                {descFr.slice(0,600)}{descFr.length > 600 ? "…" : ""}
              </div>
            </div>
          )}

          {/* Grille métriques */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10, marginBottom:14 }}>
            {rank != null && (
              <div style={{ background:THEME.bgCardAlt, border:`1px solid ${THEME.borderMid}`, borderRadius:10, padding:"11px 14px" }}>
                <div style={{ fontSize:10, color:THEME.textMuted, marginBottom:3 }}>Rang CoinGecko</div>
                <div style={{ fontSize:14, fontWeight:700, color:THEME.accent, fontFamily:"'IBM Plex Mono',monospace" }}>#{rank}</div>
                {topPct != null && <div style={{ fontSize:9, color:THEME.textMuted, marginTop:2 }}>Top {topPct.toFixed(1)}%</div>}
              </div>
            )}
            <div style={{ background:THEME.bgCardAlt, border:`1px solid ${THEME.borderMid}`, borderRadius:10, padding:"11px 14px" }}>
              <div style={{ fontSize:10, color:THEME.textMuted, marginBottom:3 }}>Market Cap</div>
              <div style={{ fontSize:14, fontWeight:700, color:THEME.textPrimary, fontFamily:"'IBM Plex Mono',monospace" }}>${fmt(mktCap)}</div>
              {btcDomRatio != null && <div style={{ fontSize:9, color:THEME.textMuted, marginTop:2 }}>{(btcDomRatio * 100).toFixed(3)}% du marché crypto total</div>}
            </div>
            <div style={{ background:THEME.bgCardAlt, border:`1px solid ${THEME.borderMid}`, borderRadius:10, padding:"11px 14px" }}>
              <div style={{ fontSize:10, color:THEME.textMuted, marginBottom:3 }}>Volume 24h</div>
              <div style={{ fontSize:14, fontWeight:700, color:THEME.textPrimary, fontFamily:"'IBM Plex Mono',monospace" }}>${fmt(vol24h)}</div>
              {volMktRatio != null && (
                <div style={{ fontSize:9, color: volMktRatio > 0.05 ? THEME.scoreGreen : THEME.scoreAmber, marginTop:2 }}>
                  {(volMktRatio * 100).toFixed(1)}% de la capitalisation · {volMktRatio > 0.05 ? "Liquidité forte" : "Liquidité modérée"}
                </div>
              )}
            </div>
            <div style={{ background:THEME.bgCardAlt, border:`1px solid ${THEME.borderMid}`, borderRadius:10, padding:"11px 14px" }}>
              <div style={{ fontSize:10, color:THEME.textMuted, marginBottom:3 }}>Offre circulante</div>
              <div style={{ fontSize:14, fontWeight:700, color:THEME.textPrimary, fontFamily:"'IBM Plex Mono',monospace" }}>{fmt(supply, 0)}</div>
              {maxSup != null && supply != null && (
                <div style={{ fontSize:9, color:THEME.textMuted, marginTop:2 }}>{((supply / maxSup) * 100).toFixed(1)}% émis</div>
              )}
            </div>
            <div style={{ background:THEME.bgCardAlt, border:`1px solid ${THEME.borderMid}`, borderRadius:10, padding:"11px 14px" }}>
              <div style={{ fontSize:10, color:THEME.textMuted, marginBottom:3 }}>Offre max</div>
              <div style={{ fontSize:14, fontWeight:700, color:THEME.textPrimary, fontFamily:"'IBM Plex Mono',monospace" }}>{maxSup ? fmt(maxSup, 0) : "∞"}</div>
            </div>
            <div style={{ background:THEME.bgCardAlt, border:`1px solid ${THEME.borderMid}`, borderRadius:10, padding:"11px 14px" }}>
              <div style={{ fontSize:10, color:THEME.textMuted, marginBottom:3 }}>ATH</div>
              <div style={{ fontSize:14, fontWeight:700, color:THEME.textPrimary, fontFamily:"'IBM Plex Mono',monospace" }}>{ath ? "$" + fmt(ath) : "—"}</div>
            </div>
            {athPct != null && (
              <div style={{ background:THEME.bgCardAlt, border:`1px solid ${THEME.borderMid}`, borderRadius:10, padding:"11px 14px" }}>
                <div style={{ fontSize:10, color:THEME.textMuted, marginBottom:3 }}>Depuis ATH</div>
                <div style={{ fontSize:14, fontWeight:700, fontFamily:"'IBM Plex Mono',monospace",
                  color: athPct > -5 ? THEME.scoreRed : athPct > -20 ? THEME.scoreAmber : THEME.scoreGreen
                }}>{athPct.toFixed(1)}%</div>
                <div style={{ fontSize:9, color:THEME.textMuted, marginTop:2 }}>
                  {athPct > -5 ? "Proche ATH — attention" : athPct > -20 ? "Repli modéré" : "Décote significative"}
                </div>
              </div>
            )}
            {chg1y != null && (
              <div style={{ background:THEME.bgCardAlt, border:`1px solid ${THEME.borderMid}`, borderRadius:10, padding:"11px 14px" }}>
                <div style={{ fontSize:10, color:THEME.textMuted, marginBottom:3 }}>Perf 1 an</div>
                <div style={{ fontSize:14, fontWeight:700, color:pctColor(chg1y), fontFamily:"'IBM Plex Mono',monospace" }}>{pctLabel(chg1y)}</div>
              </div>
            )}
          </div>

          {/* Bandeau dominance marché global */}
          {cgGlobal != null && cgGlobal.totalMktCap > 0 && (
            <div style={{ marginBottom:14, padding:"8px 14px", background:THEME.bgCardAlt, border:`1px solid ${THEME.borderMid}`, borderRadius:10, display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", fontSize:10, color:THEME.textMuted }}>
              <span style={{ fontWeight:700, color:THEME.textSecondary }}>Marché global ·</span>
              <span>BTC <span style={{ color:THEME.scoreAmber, fontWeight:700 }}>{cgGlobal.btc.toFixed(1)}%</span></span>
              <span>·</span>
              <span>ETH <span style={{ color:THEME.textSecondary, fontWeight:700 }}>{cgGlobal.eth.toFixed(1)}%</span></span>
              <span>·</span>
              <span>Alts <span style={{ color:THEME.textSecondary, fontWeight:700 }}>{(100 - cgGlobal.btc - cgGlobal.eth).toFixed(1)}%</span></span>
              <span>·</span>
              <span>Cap totale <span style={{ color:THEME.textSecondary, fontWeight:700 }}>{fmtTvl(cgGlobal.totalMktCap)}</span></span>
            </div>
          )}

          {/* Position dans le marché */}
          {topPct != null && (
            <div style={{ marginBottom:14, background:THEME.bgCardAlt, border:`1px solid ${THEME.borderMid}`, borderRadius:10, padding:"12px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, flexWrap:"wrap", gap:6 }}>
                <div style={{ fontSize:10, color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1.5 }}>Position dans le marché</div>
                <div style={{ fontSize:10, color:THEME.textSecondary }}>
                  {rank != null && `Rang #${rank} · `}Top {topPct.toFixed(1)}% parmi ~{(cgGlobal?.active_cryptocurrencies ?? 15000).toLocaleString("fr-FR")} cryptos
                  {btcDomRatio != null && ` · ${(btcDomRatio * 100).toFixed(3)}% de la capitalisation totale`}
                </div>
              </div>
              <div style={{ height:6, borderRadius:3, background:"#1e2a3a", overflow:"hidden" }}>
                <div style={{
                  height:"100%", borderRadius:3,
                  width:`${Math.min(100, 101 - topPct)}%`,
                  background: topPct < 0.1 ? THEME.scoreGreen : topPct < 1 ? THEME.scoreAmber : THEME.scoreRed,
                  transition:"width .4s ease",
                }}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:8, color:THEME.textMuted }}>
                <span>Top 1 (Bitcoin)</span><span>Top 100</span><span>Top 1 000</span><span>Top {(cgGlobal?.active_cryptocurrencies ?? 15000).toLocaleString("fr-FR")}</span>
              </div>
            </div>
          )}

          {/* Votes communauté */}
          {sentUp != null && sentDown != null && (
            <div style={{ marginBottom:14, background:THEME.bgCardAlt, border:`1px solid ${THEME.borderMid}`, borderRadius:10, padding:"12px 16px" }}>
              <div style={{ fontSize:10, color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1.5, marginBottom:8 }}>Sentiment communauté (votes CoinGecko)</div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:11, color:THEME.scoreGreen, fontWeight:700 }}>👍 {sentUp.toFixed(1)}%</span>
                <div style={{ flex:1, height:8, borderRadius:4, background:THEME.scoreRed, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${sentUp}%`, background:THEME.scoreGreen, borderRadius:4, transition:"width .4s ease" }}/>
                </div>
                <span style={{ fontSize:11, color:THEME.scoreRed, fontWeight:700 }}>👎 {sentDown.toFixed(1)}%</span>
              </div>
            </div>
          )}

          {/* Analyse technique rapide */}
          {(rangePos != null || range24Pos != null) && (
            <Panel icon="📐" title="Analyse technique rapide" borderColor={THEME.borderPanel} defaultOpen={true}>
              <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                {rangePos != null && ath != null && atlUsd != null && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:10, flexWrap:"wrap", gap:4 }}>
                      <span style={{ color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1 }}>Position dans le range historique (ATL → ATH)</span>
                      <span style={{ fontWeight:700, color: rangePos < 20 ? THEME.scoreGreen : rangePos > 80 ? THEME.scoreRed : THEME.scoreAmber }}>
                        {rangePos < 20 ? "Proche des plus bas" : rangePos > 80 ? "Proche des plus hauts" : "Milieu de range"} · {rangePos.toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ height:8, borderRadius:4, background:"#1e2a3a", overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:4, transition:"width .4s ease", width:`${rangePos}%`,
                        background: rangePos < 20 ? THEME.scoreGreen : rangePos > 80 ? THEME.scoreRed : THEME.scoreAmber }}/>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:9, color:THEME.textMuted }}>
                      <span>ATL ${fmt(atlUsd)}</span><span>ATH ${fmt(ath)}</span>
                    </div>
                  </div>
                )}
                {range24Pos != null && high24 != null && low24 != null && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:10, flexWrap:"wrap", gap:4 }}>
                      <span style={{ color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1 }}>Position dans le range 24h</span>
                      <span style={{ fontWeight:700, color:THEME.textSecondary }}>{range24Pos.toFixed(0)}% du range</span>
                    </div>
                    <div style={{ height:8, borderRadius:4, background:"#1e2a3a", overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:4, width:`${range24Pos}%`, background:THEME.accent, transition:"width .4s ease" }}/>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:9, color:THEME.textMuted }}>
                      <span>Bas 24h ${fmt(low24)}</span><span>Haut 24h ${fmt(high24)}</span>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* Sentiment Fear & Greed + Funding + Long/Short + OI */}
          {(fearGreed != null || funding != null) && (
            <Panel icon="🌡️" title="Sentiment de marché" borderColor={THEME.borderPanel} defaultOpen={true}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:24, alignItems:"flex-start" }}>
                {(() => {
                  const synth = computeCryptoSentimentSynthesis(fearGreed, longShort, funding, openInterest);
                  if (!synth) return null;
                  return (
                    <div style={{ width:"100%", padding:"14px 16px", background:synth.bg,
                      borderRadius:10, border:`1px solid ${synth.border}55`,
                      borderLeft:`4px solid ${synth.border}`, marginBottom:4 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                        <span style={{ fontSize:18 }}>{synth.emoji}</span>
                        <div>
                          <span style={{ fontSize:10, fontWeight:800, color:synth.color,
                            background:synth.color+"22", borderRadius:4, padding:"2px 8px",
                            textTransform:"uppercase", letterSpacing:1.2, marginRight:8 }}>{synth.badge}</span>
                        </div>
                        <div style={{ fontSize:9, color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1.5, marginLeft:"auto" }}>
                          Lecture croisée
                        </div>
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:synth.color, lineHeight:1.4, marginBottom:8 }}>
                        {synth.title}
                      </div>
                      <div style={{ fontSize:12, color:THEME.textSecondary, lineHeight:1.8 }}>
                        {synth.body}
                      </div>
                    </div>
                  );
                })()}
                {fearGreed != null && (
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:130 }}>
                    <FearGreedGauge value={fearGreed.value}/>
                    <div style={{ fontSize:12, fontWeight:700, color:
                      fearGreed.value < 30 ? THEME.scoreRed : fearGreed.value < 50 ? "#f97316" :
                      fearGreed.value < 70 ? THEME.scoreAmber : THEME.scoreGreen
                    }}>{fearGreed.label}</div>
                    <div style={{ fontSize:9, color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1.5 }}>Fear & Greed Index</div>
                    <div style={{ fontSize:9, color:THEME.textMuted, maxWidth:160, textAlign:"center", lineHeight:1.5, marginTop:4 }}>
                      Mesure l'émotion dominante du marché crypto. Extrême Fear = opportunité potentielle. Extrême Greed = prudence.
                    </div>
                  </div>
                )}
                {funding != null && (
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ fontSize:9, color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1.5, marginBottom:10 }}>Funding Rate (perpétuels)</div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:28, fontWeight:900, fontFamily:"'IBM Plex Mono',monospace",
                        color: funding.rate > 0 ? THEME.scoreGreen : funding.rate < 0 ? THEME.scoreRed : THEME.textSecondary }}>
                        {funding.rate > 0 ? "+" : ""}{(funding.rate * 100).toFixed(4)}%
                      </span>
                      <span style={{ fontSize:10, color:THEME.textMuted }}>/ 8h</span>
                    </div>
                    <div style={{ fontSize:10, color:THEME.textSecondary, marginBottom:8 }}>
                      ≈ <span style={{ fontWeight:700, color: funding.rate > 0 ? THEME.scoreGreen : THEME.scoreRed }}>
                        {funding.rate > 0 ? "+" : ""}{(funding.rate * 3 * 365 * 100).toFixed(1)}% /an
                      </span> annualisé
                    </div>
                    <div style={{ fontSize:10, fontWeight:600, marginBottom:8,
                      color: funding.rate > 0 ? THEME.scoreGreen : funding.rate < 0 ? THEME.scoreRed : THEME.textSecondary }}>
                      {funding.rate > 0.0002  ? "Marché très optimiste — longs dominants"  :
                       funding.rate > 0       ? "Légère dominance haussière"                :
                       funding.rate < -0.0002 ? "Marché très pessimiste — shorts dominants" :
                                                "Légère dominance baissière"}
                    </div>
                    <div style={{ fontSize:9, color:THEME.textMuted, lineHeight:1.6 }}>
                      Le funding rate est le coût payé entre acheteurs et vendeurs de contrats perpétuels.
                      Positif = les longs paient les shorts (marché optimiste).
                      Négatif = les shorts paient les longs (marché pessimiste).
                    </div>
                    {funding.markPrice > 0 && (
                      <div style={{ marginTop:8, fontSize:10, color:THEME.textMuted }}>
                        Mark price : <span style={{ color:THEME.textSecondary, fontFamily:"'IBM Plex Mono',monospace" }}>${fmt(funding.markPrice)}</span>
                      </div>
                    )}
                  </div>
                )}
                {longShort != null && (
                  <div style={{ width:"100%", paddingTop:12, borderTop:`1px solid ${THEME.borderPanel}` }}>
                    <div style={{ fontSize:9, color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>Ratio Long/Short (comptes Binance Futures)</div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:28, fontWeight:900, fontFamily:"'IBM Plex Mono',monospace",
                        color: longShort.ratio > 1.5 ? THEME.scoreRed : longShort.ratio < 0.7 ? THEME.scoreGreen : THEME.scoreAmber }}>
                        {longShort.ratio.toFixed(2)}
                      </span>
                      <span style={{ fontSize:11, color:THEME.textMuted }}>longs / shorts</span>
                    </div>
                    <div style={{ height:8, borderRadius:4, background:"#1e2a3a", overflow:"hidden", marginBottom:6 }}>
                      <div style={{ height:"100%", borderRadius:4, width:`${longShort.longPct}%`,
                        background:`linear-gradient(90deg, ${THEME.scoreGreen}, ${THEME.scoreRed})`,
                        transition:"width .4s ease" }}/>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, fontWeight:700, marginBottom:6 }}>
                      <span style={{ color:THEME.scoreGreen }}>Longs {longShort.longPct.toFixed(1)}%</span>
                      <span style={{ color:THEME.scoreRed }}>Shorts {longShort.shortPct.toFixed(1)}%</span>
                    </div>
                    <div style={{ fontSize:10, fontWeight:600, color:
                      longShort.ratio > 2    ? THEME.scoreRed   :
                      longShort.ratio > 1.5  ? "#f97316"        :
                      longShort.ratio < 0.67 ? THEME.scoreGreen :
                      longShort.ratio < 0.8  ? "#4ade80"        :
                      THEME.scoreAmber }}>
                      {longShort.ratio > 2    ? "Euphorie haussière — majorité écrasante de longs, risque de liquidation" :
                       longShort.ratio > 1.5  ? "Dominance haussière — les longs sont majoritaires"                       :
                       longShort.ratio < 0.67 ? "Dominance baissière — les shorts dominent, short squeeze possible"       :
                       longShort.ratio < 0.8  ? "Légère dominance baissière"                                              :
                       "Ratio équilibré — pas de signal dominant"}
                    </div>
                    <div style={{ fontSize:9, color:THEME.textMuted, marginTop:6, lineHeight:1.6 }}>
                      Mesure la proportion de comptes en position longue vs courte sur les contrats perpétuels Binance.
                      Un ratio très élevé (longs {">"} shorts) peut précéder une liquidation en cascade si le prix baisse.
                    </div>
                  </div>
                )}
                {openInterest != null && (
                  <div style={{ width:"100%", paddingTop:12, borderTop:`1px solid ${THEME.borderPanel}` }}>
                    <div style={{ fontSize:9, color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>Open Interest (Binance Futures)</div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:22, fontWeight:900, fontFamily:"'IBM Plex Mono',monospace", color:THEME.textPrimary }}>
                        {fmtTvl(openInterest)}
                      </span>
                    </div>
                    <div style={{ fontSize:9, color:THEME.textMuted, lineHeight:1.6 }}>
                      L'Open Interest représente la valeur totale des contrats à terme ouverts sur le marché.
                      Une hausse = nouveaux capitaux qui entrent. Une baisse = positions qui se ferment.
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* Staking ETH */}
          {isEth && staking != null && (
            <Panel icon="🔒" title="Staking Ethereum" borderColor={THEME.scoreGreen} defaultOpen={true}
              badge={{ label:`APR ${staking.apr.toFixed(2)}%`, color:THEME.scoreGreen }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:20 }}>
                <div>
                  <div style={{ fontSize:9, color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>APR stETH (Lido)</div>
                  <div style={{ fontSize:32, fontWeight:900, color:THEME.scoreGreen, fontFamily:"'IBM Plex Mono',monospace" }}>
                    {staking.apr.toFixed(2)}%
                  </div>
                  <div style={{ fontSize:10, color:THEME.textMuted, marginTop:4 }}>Taux de rendement annuel en temps réel</div>
                </div>
                <div style={{ flex:1, minWidth:180 }}>
                  <div style={{ fontSize:9, color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>File d'attente validateurs</div>
                  <div style={{ fontSize:20, fontWeight:700, color:THEME.textPrimary, fontFamily:"'IBM Plex Mono',monospace" }}>
                    {staking.queue != null ? staking.queue.toLocaleString() : "Aucune congestion"}
                  </div>
                  <div style={{ fontSize:10, color:THEME.textMuted, marginTop:4 }}>
                    {staking.queue != null && staking.queue > 0
                      ? `${staking.queue.toLocaleString()} validateurs en attente d'activation`
                      : "Pas de congestion — activation immédiate"}
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* TVL DeFi */}
          {tvl != null && (
            <Panel icon="🏦" title="DeFi — Total Value Locked" borderColor={THEME.scoreAmber} defaultOpen={true}
              badge={{ label:fmtTvl(tvl), color:THEME.scoreAmber }}>
              <div>
                <div style={{ fontSize:9, color:THEME.textMuted, textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>TVL actuel (DefiLlama)</div>
                <div style={{ fontSize:32, fontWeight:900, color:THEME.scoreAmber, fontFamily:"'IBM Plex Mono',monospace" }}>{fmtTvl(tvl)}</div>
                <div style={{ fontSize:10, color:THEME.textMuted, marginTop:6, lineHeight:1.6 }}>
                  Total Value Locked = valeur totale des actifs déposés dans le protocole.
                  Un TVL élevé reflète la confiance des utilisateurs et la profondeur de liquidité.
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════
          ONGLET NEWS
      ══════════════════════════════════════ */}
      {activeTab === "macro" && (
        <NewsPanel ticker={data.id ?? ""} quoteType="CRYPTOCURRENCY"/>
      )}

    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// COUCHE 4e — APPLICATION PRINCIPALE
// ════════════════════════════════════════════════════════════════
type ResultType =
  | { type: "stock";  metrics: any; chartData: any; ticker: string; optimalUTKey?: string; macro?: MacroContext | null; zone?: MacroZone; eurRate?: number | null }
  | { type: "crypto"; data: any }
  | { type: "forex";  currency: string; rate: number; allRates: Record<string, number>; ticker?: string };

function LogPanel({ log }: { log: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom:14 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background:"transparent",
          border:`1px solid ${THEME.borderSubtle}`,
          borderRadius:6, padding:"4px 12px",
          fontSize:10, color:THEME.textMuted,
          cursor:"pointer", display:"flex",
          alignItems:"center", gap:6,
        }}
      >
        <span style={{ fontSize:8 }}>{open ? "▲" : "▼"}</span>
        Journal ({log.length} étapes)
      </button>
      {open && (
        <div style={{ marginTop:6, background:THEME.bgHeader,
          border:`1px solid ${THEME.borderSubtle}`,
          borderRadius:8, padding:"8px 14px" }}>
          {log.map((l,i) => (
            <div key={i} style={{ fontSize:11, color:THEME.textSecondary,
              fontFamily:"'IBM Plex Mono',monospace" }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [query,   setQuery]   = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<ResultType | null>(null);
  const [log,     setLog]     = useState<string[]>([]);
  const [error,   setError]   = useState("");
  const [mode,            setMode]            = useState<SearchMode>("all");
  const [suggestions,     setSuggestions]     = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState<"resume"|"technique"|"fondamentaux"|"marche"|"macro">("resume");
  useEffect(() => { setActiveTab("resume"); }, [result]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef   = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => setLog(l => [...l, msg]);

  const doAnalyze = useCallback(async (forceTicker?: string, forceType?: string) => {
    const raw = (forceTicker || query).trim();
    if (!raw) return;
    const upper = raw.toUpperCase();
    const lower = raw.toLowerCase();
    setLoading(true); setResult(null); setLog([]); setError("");
    addLog(`🔍 Analyse : ${raw}`);

    const assetType = detectAssetType(raw, mode);
    const isForexPattern = assetType === "forex";

    const KNOWN_CRYPTO_SYMBOLS_LOCAL = new Set([
      "BTC","ETH","SOL","BNB","XRP","ADA","DOGE","AVAX","DOT","MATIC",
      "LINK","UNI","ATOM","LTC","BCH","XLM","ALGO","VET","ICP","FIL",
      "HBAR","ETC","MANA","SAND","AXS","THETA","XTZ","EOS","AAVE","MKR",
      "COMP","SNX","CRV","YFI","SUSHI","1INCH","GRT","ENJ","CHZ","BAT",
      "ZEC","DASH","XMR","NEO","WAVES","QTUM","ONT","ZIL","ICX","IOTA",
      "OP","ARB","APT","SUI","SEI","TIA","INJ","PYTH","JUP","WIF",
    ]);

    const looksLikeCrypto =
      assetType === "crypto" ||
      KNOWN_CRYPTO_SYMBOLS_LOCAL.has(upper) ||
      (/^[A-Z0-9]{2,10}-USD$/i.test(raw) && !isForexPattern);

    if (looksLikeCrypto || forceType?.toUpperCase() === "CRYPTOCURRENCY") {
      addLog(`⚡ Crypto détectée — recherche CoinGecko directe...`);
      const cgQuery = raw.replace(/-USD$|-EUR$|-USDT$|-BTC$|-GBP$/i, "").toLowerCase();
      const cgId = await cgSearch(cgQuery);
      if (cgId) {
        await new Promise(r => setTimeout(r, 300));
        const d = await cgCoin(cgId);
        if (d?.market_data?.current_price?.usd) {
          addLog(`✅ CoinGecko : ${cgId}`);
          setResult({ type: "crypto", data: d });
          setLoading(false); return;
        }
      }
      addLog(`⚠️ CoinGecko : introuvable pour "${cgQuery}" — fallback Yahoo Finance`);
    }

    if (isForexPattern) {
      addLog("💱 Pattern Forex → ECB...");
      const rates = await ecbRates();
      const cur = upper.replace(/EUR|=X|\//g,"").slice(-3) || upper.slice(0,3);
      const rate = rates[cur];
      if (rate) {
        addLog(`✅ EUR/${cur} = ${rate}`);
        const forexTicker = `EUR${cur}=X`;
        setResult({ type:"forex", currency:cur, rate, allRates:rates, ticker: forexTicker });
        setLoading(false); return;
      }
      addLog(`  → ${cur} absent ECB, on continue`);
    }

    const skipCG = mode !== "all" && mode !== "crypto";
    addLog(`⚡ Recherche ${skipCG ? "Yahoo Finance" : "parallèle Yahoo Finance + CoinGecko"}...`);
    const zone = detectZone(upper);
    const [yfDataDaily, yfDataWeekly, cgId, macro] = await Promise.all([
      yfChart(upper, addLog, "2a"),
      yfChart(upper, addLog, "5a"),
      skipCG ? Promise.resolve(null) : cgSearch(lower),
      fetchMacroContext(zone),
    ]);

    const ecbRatesData = await ecbRates();
    const currency = yfDataDaily?.meta?.currency || "USD";
    const eurRate = (() => {
      if (currency === "EUR") return 1;
      if (currency === "USD") return ecbRatesData["USD"] ? 1 / ecbRatesData["USD"] : null;
      return ecbRatesData[currency] ? 1 / ecbRatesData[currency] : null;
    })();

    // ── UT OPTIMALE MULTI-TIMEFRAME ───────────────────────────
    // 1. Cycle Sinewave daily → UT candidate
    // 2. Contexte daily vs weekly → correction si contradiction
    let optimalUTKey = "5a";
    const dailyC = (yfDataDaily?.closes ?? []) as (number|null)[];
    const weeklyC = (yfDataWeekly?.closes ?? []) as (number|null)[];

    // Étape 1 : cycle dominant sur daily
    let cycleBasedUT = "5a";
    let dominantPeriod = 30;
    if (dailyC.filter((v: number|null): v is number => v != null).length >= 50) {
      const swUT = calcSinewave(dailyC);
      dominantPeriod = swUT?.dominantPeriod ?? 30;
      if (dominantPeriod <= 10)      cycleBasedUT = "2a";
      else if (dominantPeriod <= 50) cycleBasedUT = "5a";
      else                           cycleBasedUT = "10a";
    }

    // Étape 2 : contexte daily et weekly pour vérification cohérence
    const ctxDaily = dailyC.filter((v: number|null): v is number => v != null).length >= 20
      ? classifyMarketContext(
          yfDataDaily?.closes ?? [],
          yfDataDaily?.highs  ?? [],
          yfDataDaily?.lows   ?? [],
          yfDataDaily?.volumes ?? [],
        )
      : null;

    const ctxWeekly = weeklyC.filter((v: number|null): v is number => v != null).length >= 20
      ? classifyMarketContext(
          yfDataWeekly?.closes  ?? [],
          yfDataWeekly?.highs   ?? [],
          yfDataWeekly?.lows    ?? [],
          yfDataWeekly?.volumes ?? [],
        )
      : null;

    // Étape 3 : règle de sélection multi-TF
    if (ctxDaily == null) {
      // Données insuffisantes
      optimalUTKey = cycleBasedUT;
      addLog(`  📊 Cycle ~${dominantPeriod}j → UT: ${cycleBasedUT} (données daily insuffisantes)`);
    } else if (ctxDaily.type === "chaos") {
      // Chaos daily → forcer weekly
      optimalUTKey = "5a";
      addLog(`  📊 Chaos daily → UT forcée : Hebdomadaire (5 ans)`);
    } else if (ctxWeekly == null) {
      // Pas de données weekly → garder cycle daily
      optimalUTKey = cycleBasedUT;
      addLog(`  📊 Cycle ~${dominantPeriod}j → UT: ${cycleBasedUT} (weekly indisponible)`);
    } else {
      // Les deux TF disponibles → vérifier cohérence directionnelle
      const dailyBear  = ctxDaily.structure.type  === "bearish";
      const dailyBull  = ctxDaily.structure.type  === "bullish";
      const weeklyBear = ctxWeekly.structure.type === "bearish";
      const weeklyBull = ctxWeekly.structure.type === "bullish";

      const contradiction = (dailyBear && weeklyBull) || (dailyBull && weeklyBear);

      if (!contradiction) {
        // Alignés → cycle daily fait foi
        optimalUTKey = cycleBasedUT;
        addLog(`  📊 Cycle ~${dominantPeriod}j, TF alignés → UT: ${cycleBasedUT}`);
      } else if (dailyBear && weeklyBull) {
        // Daily baissier, weekly haussier → TF supérieur (long terme) dominant
        optimalUTKey = "5a";
        addLog(`  📊 Contradiction TF : daily ↓ / weekly ↑ → UT Hebdomadaire (contexte long terme haussier)`);
      } else {
        // Daily haussier, weekly baissier → prudence, rester sur daily
        optimalUTKey = cycleBasedUT === "2a" ? "2a" : "5a";
        addLog(`  📊 Contradiction TF : daily ↑ / weekly ↓ → UT Daily (prudence)`);
      }
    }

    let yfDataMonthly: any = null;
    if (optimalUTKey === "10a") yfDataMonthly = await yfChart(upper, addLog, "10a");

    const yfData =
      optimalUTKey === "10a" ? (yfDataMonthly || yfDataWeekly || yfDataDaily) :
      optimalUTKey === "5a"  ? (yfDataWeekly  || yfDataDaily) :
                               (yfDataDaily   || yfDataWeekly);

    const yfQuoteType = (yfData?.meta?.instrumentType || yfData?.meta?.quoteType || "").toUpperCase();

    if (cgId) {
      const d = await cgCoin(cgId);
      if (d?.market_data?.current_price?.usd) {
        // Liste des ETF crypto connus susceptibles de créer une collision de symbole
        const KNOWN_CRYPTO_ETF_TICKERS = new Set(["GBTC","ETHE","BITB","FBTC","ARKB","HODL","BTCO","IBIT","EZBC","BTCW"]);
        const isCryptoETF = yfQuoteType === "ETF" && (
          KNOWN_CRYPTO_ETF_TICKERS.has(upper) ||
          upper === "BTC" || upper === "ETH" || upper === "SOL"
          || (d.symbol?.toUpperCase() === upper && (d.market_cap_rank ?? 9999) <= 500)
        );
        if (!yfData?.meta?.regularMarketPrice || isCryptoETF) {
          addLog(`✅ CoinGecko : ${cgId}`);
          setResult({ type:"crypto", data:d });
          setLoading(false); return;
        }
      }
    }

    if (yfData?.meta?.regularMarketPrice) {
      addLog(`✅ Yahoo Finance : ${yfData.meta.quoteType || "EQUITY"}`);
      const yf = await yfFundamentals(upper, addLog);
      const metrics = buildMetrics(yf, yfData.meta);
      setResult({ type:"stock", metrics, ticker: upper, optimalUTKey, macro, zone, eurRate, chartData: {
        closes:     yfData.closes,
        timestamps: yfData.timestamps,
        opens:      yfData.opens     ?? [],
        highs:      yfData.highs     ?? [],
        lows:       yfData.lows      ?? [],
        volumes:    yfData.volumes   ?? [],
      } });
      setLoading(false); return;
    }

    addLog("❌ Introuvable sur toutes les sources");
    setError(`"${raw}" introuvable. Vérifiez le ticker (ex: AAPL, MC.PA, BTC, USD)`);
    setLoading(false);
  }, [query, mode]);

  // ── Suggestions ──────────────────────────────────────────────
  const fetchSuggestions = async (q: string, m: SearchMode) => {
    const q_upper = q.trim().toUpperCase();
    const CURRENCY_CODES = new Set([
      "USD","EUR","GBP","JPY","CHF","CAD","AUD","NZD","SEK","NOK",
      "DKK","PLN","HUF","CZK","TRY","ZAR","SGD","HKD","MXN","BRL",
      "CNY","INR","KRW","THB","IDR","MYR","PHP","AED","SAR","ILS"
    ]);
    if (CURRENCY_CODES.has(q_upper)) {
      setSuggestions([{
        symbol: q_upper,
        name: `${q_upper} — Taux de change (ECB)`,
        type: "CURRENCY",
        exchange: "ECB",
      }]);
      setShowSuggestions(true);
      return;
    }
    const suggestAssetType = detectAssetType(q, m);
    const isForexPattern =
      suggestAssetType === "forex" ||
      q_upper.includes("=") ||
      /^[A-Z]{3}[\/][A-Z]{3}$/.test(q_upper) ||
      CURRENCY_CODES.has(q_upper) ||
      (m === "forex");
    if (isForexPattern) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (q.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const all: SearchSuggestion[] = [];
    if (m === "crypto") {
      all.push(...await cgSearchSuggest(q));
    } else if (m === "all") {
      const [yf, cg] = await Promise.all([yfSearch(q), cgSearchSuggest(q)]);
      all.push(...yf, ...cg);
    } else {
      all.push(...await yfSearch(q));
    }
    const modeTypes = SEARCH_MODES.find(sm => sm.key === m)?.yfTypes ?? [];
    const filtered  = m === "all" ? all : all.filter(r =>
      !modeTypes.length || modeTypes.indexOf((r.type || "").toUpperCase()) !== -1
    );
    // Exclure les ETF crypto connus quand le mode n'est pas ETF/all-ETF
    const CRYPTO_ETF_SYMBOLS = new Set(["GBTC","ETHE","BITB","FBTC","ARKB","HODL","BTCO","IBIT","EZBC","BTCW"]);
    const withoutCryptoETF = (m === "etf" || m === "all")
      ? filtered
      : filtered.filter(r => !CRYPTO_ETF_SYMBOLS.has(r.symbol.toUpperCase()) || r.exchange === "CoinGecko");
    const seen   = new Set<string>();
    const unique = withoutCryptoETF.filter(r => { if (seen.has(r.symbol)) return false; seen.add(r.symbol); return true; });
    const sorted = unique.sort((a, b) => {
      const aSym = a.symbol.toUpperCase();
      const bSym = b.symbol.toUpperCase();

      // 1. Correspondance exacte Yahoo avant correspondance exacte CoinGecko
      const aExactYF = aSym === q_upper && a.exchange !== "CoinGecko" ? 0 : 1;
      const bExactYF = bSym === q_upper && b.exchange !== "CoinGecko" ? 0 : 1;
      if (aExactYF !== bExactYF) return aExactYF - bExactYF;

      // 2. Correspondance exacte (toutes sources)
      const aExact = aSym === q_upper ? 0 : 1;
      const bExact = bSym === q_upper ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;

      // 3. Symbole commence par la saisie
      const aStarts = aSym.startsWith(q_upper) ? 0 : 1;
      const bStarts = bSym.startsWith(q_upper) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;

      // 4. Yahoo Finance avant CoinGecko (résultats par nom plus fiables)
      const aYF = a.exchange !== "CoinGecko" ? 0 : 1;
      const bYF = b.exchange !== "CoinGecko" ? 0 : 1;
      if (aYF !== bYF) return aYF - bYF;

      // 5. Symbole le plus court en premier
      return aSym.length - bSym.length;
    });
    setSuggestions(sorted.slice(0, 10));
    setShowSuggestions(sorted.length > 0);
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val, mode), 300);
  };

  const handleModeChange = (m: SearchMode) => {
    setMode(m);
    setSuggestions([]);
    setShowSuggestions(false);
    if (query.trim().length >= 1) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(query, m), 150);
    }
  };

  const selectSuggestion = (s: SearchSuggestion) => {
    setQuery(s.symbol);
    setShowSuggestions(false);
    setSuggestions([]);
    doAnalyze(s.symbol, s.type);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const ForexView = ({ currency, rate, allRates, ticker: forexTicker, activeTab = "resume" }: { currency: string; rate: number; allRates: Record<string, number>; ticker?: string; activeTab?: "resume"|"technique"|"marche"|"macro" }) => {
    const yfTicker = forexTicker ?? `EUR${currency}=X`;
    const defaultPeriod = "1a";
    const [period,       setPeriod]    = useState(defaultPeriod);
    const [chartData,    setChartData] = useState<{ closes:(number|null)[]; timestamps:number[]; opens:(number|null)[]; highs:(number|null)[]; lows:(number|null)[]; volumes:(number|null)[] } | null>(null);
    const [chartLoading, setChartLoading] = useState(false);

    useEffect(() => {
      setChartData(null);
      setChartLoading(true);
      const { range, interval } = CHART_RANGES[defaultPeriod] || CHART_RANGES["1a"];
      const url = `${PROXY}?ticker=${encodeURIComponent(yfTicker)}&type=chart&range=${range}&interval=${interval}`;
      fetch(url).then(r => r.json()).then(d => {
        const res = d?.chart?.result?.[0];
        if (res) {
          const q = res.indicators?.quote?.[0] || {};
          setChartData({
            closes:     res.indicators?.adjclose?.[0]?.adjclose || q.close || [],
            timestamps: res.timestamp || [],
            opens:      q.open   || [],
            highs:      q.high   || [],
            lows:       q.low    || [],
            volumes:    q.volume || [],
          });
        }
      }).catch(() => {}).finally(() => setChartLoading(false));
    }, [yfTicker]);

    const loadChart = async (p: string) => {
      setChartLoading(true);
      try {
        const { range, interval } = CHART_RANGES[p] || CHART_RANGES["1a"];
        const url = `${PROXY}?ticker=${encodeURIComponent(yfTicker)}&type=chart&range=${range}&interval=${interval}`;
        const d   = await (await fetch(url)).json();
        const res = d?.chart?.result?.[0];
        if (res) {
          const q = res.indicators?.quote?.[0] || {};
          setChartData({
            closes:     res.indicators?.adjclose?.[0]?.adjclose || q.close || [],
            timestamps: res.timestamp || [],
            opens:      q.open   || [],
            highs:      q.high   || [],
            lows:       q.low    || [],
            volumes:    q.volume || [],
          });
        }
      } catch {}
      setChartLoading(false);
    };

    const closes  = chartData?.closes  ?? [];
    const highs   = chartData?.highs   ?? [];
    const lows    = chartData?.lows    ?? [];
    const volumes = chartData?.volumes ?? [];
    const chartInterval: "1d" | "1wk" | "1mo" =
      period === "10a" ? "1mo" : period === "3a" || period === "5a" ? "1wk" : "1d";

    const marketCtx = (closes.length > 20 && highs.length > 20 && lows.length > 20)
      ? classifyMarketContext(closes, highs, lows, volumes)
      : null;
    const techComputed = closes.length > 0
      ? computeTechSignals(closes, volumes, highs, lows, chartInterval)
      : { signals: [], sinewave: null };
    const confluenceResult = (closes.length > 0 && highs.length > 0 && lows.length > 0)
      ? calcConfluenceScore(closes, highs, lows, volumes)
      : null;
    const finalScoreResult = marketCtx
      ? computeFinalScore(null, marketCtx, techComputed.signals, closes, confluenceResult?.score ?? null)
      : null;
    const finalScore = finalScoreResult?.score ?? null;
    const v = getVerdict(finalScore);

    const entryRec = (finalScoreResult && techComputed)
      ? computeEntryRecommendation(
          null,
          finalScoreResult.context,
          techComputed.signals,
          techComputed.sinewave,
          null,
          finalScore,
          null,
        )
      : { type: "none" as const, icon: "", title: "", reasons: [], triggers: [] };

    return (
      <>
      <div style={{ animation:"fadeIn .4s ease" }}>

        {/* ── HEADER — toujours visible ── */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, color:"#445", textTransform:"uppercase", letterSpacing:1.5, marginBottom:4 }}>
            Banque Centrale Européenne · Officiel
          </div>
          <div style={{ fontSize:22, fontWeight:800, color:THEME.textPrimary, marginBottom:8 }}>
            EUR / {currency}<TypeBadge type="CURRENCY"/>
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:12, flexWrap:"wrap" }}>
            <span style={{ fontSize:38, fontWeight:900, color:THEME.accent, fontFamily:"'IBM Plex Mono',monospace" }}>
              {parseFloat(String(rate)).toFixed(4)}
            </span>
            <span style={{ fontSize:13, color:"#556" }}>1 EUR = {rate} {currency}</span>
          </div>
        </div>

        {/* ══════════════════════════════════════
            ONGLET RÉSUMÉ
        ══════════════════════════════════════ */}
        {activeTab === "resume" && (
          <div style={{ display:"flex", gap:24, alignItems:"flex-start", flexWrap:"wrap" }}>

            {/* Colonne gauche — graphique */}
            <div style={{ flex:"1 1 55%", minWidth:320 }}>
              <ChartBlock
                chartData={chartData}
                currency={currency}
                quoteType="CURRENCY"
                period={period}
                periods={Object.entries(CHART_RANGES).map(([k,v])=>({key:k,label:v.label}))}
                onPeriodChange={p => { setPeriod(p); loadChart(p); }}
                loading={chartLoading}
              />
            </div>

            {/* Colonne droite — verdict + recommandation */}
            <div style={{ flex:"1 1 35%", minWidth:280,
              display:"flex", flexDirection:"column", gap:12,
              position:"sticky", top:"72px" }}>
              {v && finalScore != null && (
                <div style={{ background:v.color+"0f",
                  border:`1px solid ${v.color}33`,
                  borderRadius:14, padding:"18px 20px" }}>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:14 }}>
                    <div style={{ display:"flex", flexDirection:"column",
                      alignItems:"center", gap:4 }}>
                      <ScoreGauge score={finalScore}/>
                      <div style={{ display:"flex", alignItems:"baseline", gap:3 }}>
                        <span style={{ fontSize:36, fontWeight:900,
                          color:scoreColor(finalScore),
                          fontFamily:"'IBM Plex Mono',monospace" }}>
                          {finalScore}
                        </span>
                        <span style={{ fontSize:12, color:THEME.textSecondary,
                          fontFamily:"'IBM Plex Mono',monospace" }}>/10</span>
                      </div>
                      <div style={{ fontSize:9, color:THEME.textMuted,
                        textTransform:"uppercase", letterSpacing:1.5 }}>
                        Timing Technique
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize:18, fontWeight:900,
                    color:v.color, marginBottom:4 }}>
                    {v.emoji} {v.label}
                  </div>
                  <div style={{ fontSize:11, color:THEME.textSecondary, lineHeight:1.4 }}>
                    {v.desc}
                  </div>
                </div>
              )}
              <EntryRecommendationPanel rec={entryRec}/>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            ONGLET TECHNIQUE
        ══════════════════════════════════════ */}
        {activeTab === "technique" && (
          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
            {marketCtx && finalScoreResult && (
              <MarketContextPanel
                context={finalScoreResult.context}
                modifiers={finalScoreResult.modifiers}
              />
            )}
            <TechnicalPanel
              precomputed={techComputed}
              context={finalScoreResult?.context ?? null}
            />
            {closes.length >= 50 && (
              <ProjectionPanel
                closes={closes}
                highs={highs}
                lows={lows}
                volumes={volumes}
                currency={currency}
                chartInterval={chartInterval}
                period={period}
                marketContext={finalScoreResult?.context ?? null}
              />
            )}
          </div>
        )}

        {/* ══════════════════════════════════════
            ONGLET MARCHÉ — Taux ECB
        ══════════════════════════════════════ */}
        {activeTab === "marche" && (
          <div>
            <div style={{ fontSize:10, color:THEME.textMuted,
              textTransform:"uppercase", letterSpacing:1.5, marginBottom:8 }}>
              Taux de change ECB · Toutes devises
            </div>
            <div style={{ display:"grid",
              gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:7 }}>
              {Object.entries(allRates).sort().map(([cur, r]) => (
                <div key={cur} style={{
                  background:THEME.bgCardAlt,
                  border:`1px solid ${cur === currency ? THEME.accent : THEME.borderMid}`,
                  borderRadius:8, padding:"8px 12px",
                }}>
                  <div style={{ fontSize:9, color:"#445" }}>EUR / {cur}</div>
                  <div style={{ fontSize:13, fontWeight:700,
                    fontFamily:"'IBM Plex Mono',monospace" }}>
                    {parseFloat(String(r)).toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:8, fontSize:10, color:"#333", textAlign:"right" }}>
              Source : Banque Centrale Européenne · Temps réel
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            ONGLET NEWS
        ══════════════════════════════════════ */}
        {activeTab === "macro" && (
          <NewsPanel ticker={yfTicker} quoteType="CURRENCY"/>
        )}

      </div>
      </>
    );
  };

  return (
    <div style={{ minHeight:"100vh", background:THEME.bgPage, fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif", color:THEME.textPrimary, overflowX:"hidden", maxWidth:"100vw" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=IBM+Plex+Sans:wght@400;600;700;800&display=swap');
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#2a3548;border-radius:3px}
        input,button{font-family:inherit}
        .app-inner { width:100%; max-width:100%; padding:0; }
        @media (max-width:600px) { .score-gauge-wrap { width:100%; display:flex; justify-content:center; } }
        .dashboard-layout {
          display: flex;
          min-height: calc(100vh - 56px);
          margin-top: 56px;
        }
        .nav-left {
          width: 200px;
          min-width: 200px;
          background: #090f1a;
          border-right: 1px solid #1e2a3a;
          position: fixed;
          top: 56px;
          left: 0;
          height: calc(100vh - 56px);
          display: flex;
          flex-direction: column;
          z-index: 40;
          overflow-y: auto;
        }
        .content-area {
          margin-left: 200px;
          flex: 1;
          padding: 24px 32px;
          max-width: calc(100% - 200px);
          overflow-x: hidden;
        }
        @media (max-width: 768px) {
          .nav-left { display: none; }
          .content-area { margin-left: 0; max-width: 100%; padding: 16px; }
        }
      `}</style>

      {/* HEADER — fixe, hauteur 56px */}
      <div style={{
        borderBottom:`1px solid ${THEME.borderSubtle}`,
        background:THEME.bgHeader,
        padding:"0 24px",
        height:"56px",
        display:"flex",
        alignItems:"center",
        justifyContent:"space-between",
        position:"fixed",
        top:0, left:0, right:0,
        zIndex:50,
      }}>
        {/* Logo */}
        <div style={{ fontSize:16, fontWeight:800, color:THEME.textPrimary, flexShrink:0 }}>
          Screener
        </div>

        {/* Recherche centrale */}
        <div ref={searchRef} style={{ flex:1, maxWidth:560, margin:"0 32px", position:"relative" }}>
          <input
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter")  { setShowSuggestions(false); doAnalyze(); }
              if (e.key === "Escape")   setShowSuggestions(false);
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Rechercher un actif… AAPL, BTC, EUR/USD"
            style={{
              width:"100%",
              background:THEME.bgPanel,
              border:`1px solid ${THEME.borderMid}`,
              borderRadius:8,
              color:THEME.textPrimary,
              padding:"9px 16px",
              fontSize:13,
              fontWeight:600,
              outline:"none",
            }}
          />
          {/* Dropdown suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div style={{
              position:"absolute", top:"calc(100% + 6px)", left:0, right:0,
              background:THEME.bgPanel, border:`1px solid ${THEME.borderMid}`,
              borderRadius:10, overflow:"hidden",
              zIndex:100, boxShadow:"0 8px 32px #000d",
            }}>
              {suggestions.map((s, i) => {
                const b = getBadge(s.type);
                return (
                  <div
                    key={i}
                    onMouseDown={() => selectSuggestion(s)}
                    style={{
                      display:"flex", alignItems:"center", gap:10,
                      padding:"9px 16px", cursor:"pointer",
                      borderBottom: i < suggestions.length - 1
                        ? `1px solid ${THEME.borderSubtle}` : "none",
                      background:"transparent", transition:"background .1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = THEME.borderSubtle)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontWeight:800,
                      color:THEME.textPrimary, fontSize:13, minWidth:70, flexShrink:0 }}>
                      {s.symbol}
                    </span>
                    <span style={{ flex:1, fontSize:12, color:THEME.textSecondary,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {s.name}
                    </span>
                    <span style={{ fontSize:9, fontWeight:800, color:b.color,
                      background:b.bg, borderRadius:4, padding:"2px 6px",
                      letterSpacing:1, textTransform:"uppercase", flexShrink:0 }}>
                      {b.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bouton analyser */}
        <button onClick={() => { setShowSuggestions(false); doAnalyze(); }}
          disabled={loading}
          style={{
            background: loading ? THEME.borderSubtle : THEME.accent,
            color: loading ? "#445" : "#000",
            border:"none", borderRadius:8, padding:"9px 20px",
            fontSize:13, fontWeight:800,
            cursor: loading ? "not-allowed" : "pointer",
            flexShrink:0,
          }}>
          {loading ? "…" : "Analyser →"}
        </button>
      </div>

      {/* LAYOUT DASHBOARD */}
      <div className="dashboard-layout">

        {/* COLONNE NAV GAUCHE */}
        <nav className="nav-left">

          {/* Actif analysé */}
          {result && (
            <div style={{ padding:"16px 16px 12px", borderBottom:`1px solid ${THEME.borderSubtle}` }}>
              <div style={{ fontSize:9, color:THEME.textMuted, textTransform:"uppercase",
                letterSpacing:1.5, marginBottom:4 }}>
                Actif analysé
              </div>
              <div style={{ fontSize:13, fontWeight:800, color:THEME.textPrimary,
                lineHeight:1.3, marginBottom:4 }}>
                {result.type === "stock"  && (result.metrics?.name || result.ticker)}
                {result.type === "crypto" && result.data?.name}
                {result.type === "forex"  && `EUR / ${result.currency}`}
              </div>
              <TypeBadge type={
                result.type === "stock"  ? result.metrics?.quoteType :
                result.type === "crypto" ? "CRYPTOCURRENCY" : "CURRENCY"
              }/>
            </div>
          )}

          {/* Items navigation */}
          <div style={{ padding:"8px 0", flex:1 }}>
            {(result?.type === "stock" ? [
              { icon:"📊", label:"Résumé",        tab:"resume"        as const },
              { icon:"📈", label:"Technique",     tab:"technique"     as const },
              { icon:"🏢", label:"Fondamentaux",  tab:"fondamentaux"  as const },
              { icon:"🌍", label:"Macro & News",  tab:"macro"         as const },
            ] : result?.type === "crypto" ? [
              { icon:"📊", label:"Résumé",        tab:"resume"        as const },
              { icon:"📈", label:"Technique",     tab:"technique"     as const },
              { icon:"🪙", label:"Marché",        tab:"marche"        as const },
              { icon:"📰", label:"News",          tab:"macro"         as const },
            ] : [
              { icon:"📊", label:"Résumé",        tab:"resume"        as const },
              { icon:"📈", label:"Technique",     tab:"technique"     as const },
              { icon:"💱", label:"Marché",        tab:"marche"        as const },
              { icon:"📰", label:"News",          tab:"macro"         as const },
            ]).map(item => {
              const isActive = activeTab === item.tab;
              return (
                <div
                  key={item.tab}
                  onClick={() => result && setActiveTab(item.tab)}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    padding:"11px 16px",
                    color: isActive ? THEME.accent : THEME.textMuted,
                    fontSize:13, fontWeight: isActive ? 700 : 600,
                    cursor: result ? "pointer" : "default",
                    opacity: result ? 1 : 0.4,
                    background: isActive ? THEME.accent + "15" : "transparent",
                    borderLeft: isActive
                      ? `3px solid ${THEME.accent}`
                      : "3px solid transparent",
                    transition:"all .15s",
                  }}
                >
                  <span style={{ fontSize:15 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>

          {/* Jeu — futur */}
          <div style={{ padding:"12px 16px", borderTop:`1px solid ${THEME.borderSubtle}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8,
              color:THEME.textMuted, fontSize:12, opacity:0.5 }}>
              <span>🎮</span>
              <span>Jeu</span>
              <span style={{ fontSize:9, background:THEME.borderMid,
                color:THEME.textMuted, borderRadius:4, padding:"1px 6px",
                marginLeft:"auto" }}>Bientôt</span>
            </div>
          </div>
        </nav>

        {/* ZONE CONTENU */}
        <main className="content-area">

          {/* Journal */}
          {log.length > 0 && <LogPanel log={log}/>}

          {/* Erreur */}
          {error && (
            <div style={{ marginBottom:14 }}>
              <div style={{ background:"#1e0a0a", border:"1px solid #5a1a1a",
                borderRadius:8, padding:"12px 16px",
                color:THEME.scoreRed, fontSize:13 }}>
                ⚠️ {error}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ display:"flex", justifyContent:"center", padding:60 }}>
              <div style={{ width:34, height:34,
                border:`3px solid ${THEME.borderSubtle}`,
                borderTopColor:THEME.accent,
                borderRadius:"50%",
                animation:"spin 1s linear infinite" }}/>
            </div>
          )}

          {/* Écran d'accueil — aucun résultat */}
          {!result && !loading && (
            <div style={{ display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center",
              minHeight:"60vh", gap:16, textAlign:"center" }}>
              <div style={{ fontSize:48 }}>📊</div>
              <div style={{ fontSize:20, fontWeight:800, color:THEME.textPrimary }}>
                Recherchez un actif pour commencer
              </div>
              <div style={{ fontSize:13, color:THEME.textMuted, maxWidth:400 }}>
                Actions · ETF · Indices · Crypto · Forex
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap",
                justifyContent:"center", marginTop:8 }}>
                {["AAPL","BTC","EUR/USD","^GSPC","MC.PA"].map(t => (
                  <button key={t} onMouseDown={() => {
                    setQuery(t); doAnalyze(t);
                  }} style={{
                    background:THEME.bgPanel,
                    border:`1px solid ${THEME.borderMid}`,
                    borderRadius:6, padding:"6px 14px",
                    fontSize:12, fontWeight:700,
                    color:THEME.textSecondary, cursor:"pointer",
                  }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Résultats */}
          {result && !loading && (
            <div>
              {result.type === "stock"  && <StockView metrics={result.metrics} ticker={result.ticker ?? ""} optimalUTKey={result.optimalUTKey} macro={result.macro} zone={result.zone} eurRate={result.eurRate} activeTab={activeTab as "resume"|"technique"|"fondamentaux"|"macro"}/>}
              {result.type === "crypto" && <CryptoView data={result.data} activeTab={activeTab as "resume"|"technique"|"marche"|"macro"}/>}
              {result.type === "forex"  && <ForexView {...result} activeTab={activeTab as "resume"|"technique"|"marche"|"macro"}/>}
            </div>
          )}

          {/* Disclaimer */}
          <div style={{ borderTop:`1px solid ${THEME.borderSubtle}`, marginTop:40, paddingTop:20 }}>
            <div style={{
              background:THEME.bgPanel, border:`1px solid ${THEME.borderPanel}`,
              borderRadius:10, padding:"16px 20px", display:"flex", gap:14, alignItems:"flex-start",
            }}>
              <span style={{ fontSize:18, flexShrink:0 }}>⚖️</span>
              <div>
                <div style={{ fontSize:11, fontWeight:800, color:THEME.textSecondary,
                  textTransform:"uppercase", letterSpacing:1.2, marginBottom:6 }}>
                  Avertissement — Pas de conseil en investissement
                </div>
                <div style={{ fontSize:11, color:THEME.textSecondary, lineHeight:1.8 }}>
                  Les informations, analyses et signaux présentés sur ce screener sont fournis à titre{" "}
                  <strong style={{ color:THEME.textPrimary }}>purement informatif et éducatif</strong>.
                  Ils ne constituent en aucun cas un conseil en investissement, une recommandation d'achat ou de vente, ni une incitation à investir.
                  Tout investissement comporte un{" "}
                  <strong style={{ color:THEME.textPrimary }}>risque de perte partielle ou totale du capital</strong>.
                  Les performances passées ne préjugent pas des performances futures.
                  L'auteur de cet outil{" "}
                  <strong style={{ color:THEME.textPrimary }}>décline toute responsabilité</strong>{" "}
                  quant aux décisions prises sur la base de ces données et aux pertes éventuelles qui pourraient en résulter.
                  Consultez un conseiller financier agréé avant toute décision d'investissement.
                </div>
              </div>
            </div>
          </div>

        </main>
      </div>

    </div>
  );
}