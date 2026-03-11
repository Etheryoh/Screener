// ════════════════════════════════════════════════════════════════
// BLOC 1 — IMPORTS & CONSTANTES
// ════════════════════════════════════════════════════════════════
import { useState, useCallback, useRef, useEffect } from "react";

const EXCHANGE_CURRENCY: Record<string, string> = {
  ".PA":"EUR",".DE":"EUR",".AS":"EUR",".MI":"EUR",".MC":"EUR",
  ".BR":"EUR",".LS":"EUR",".L":"GBP",".IL":"GBX",".T":"JPY",
  ".HK":"HKD",".AX":"AUD",".TO":"CAD",".SW":"CHF",".ST":"SEK",
  ".CO":"DKK",".OL":"NOK",".HE":"EUR",".WA":"PLN",".IS":"TRY",
};
function inferCurrency(ticker: string): string {
  for (const [sfx, cur] of Object.entries(EXCHANGE_CURRENCY))
    if (ticker.toUpperCase().endsWith(sfx)) return cur;
  return "USD";
}

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  EQUITY:         { label:"Action", color:"#60a5fa", bg:"#1e3a5f" },
  ETF:            { label:"ETF",    color:"#a78bfa", bg:"#2d1b69" },
  MUTUALFUND:     { label:"Fonds",  color:"#22d3ee", bg:"#0c3d4a" },
  INDEX:          { label:"Indice", color:"#fbbf24", bg:"#3d2a00" },
  CRYPTOCURRENCY: { label:"Crypto", color:"#f0a500", bg:"#3d2800" },
  CURRENCY:       { label:"Forex",  color:"#34d399", bg:"#0a2e1a" },
};
const getBadge = (t?: string) =>
  TYPE_BADGE[t?.toUpperCase() ?? ""] || { label: t || "—", color: "#8b949e", bg: "#1a2235" };

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
  if (s >= 7) return "#22c55e";
  if (s >= 4) return "#f59e0b";
  return "#ef4444";
}
function scoreEmoji(s: number | null): string {
  if (s == null) return "·";
  if (s >= 7) return "🟢";
  if (s >= 4) return "🟡";
  return "🔴";
}
function getVerdict(g: number | null) {
  if (g == null) return null;
  if (g >= 7.5) return { label:"Opportunité", color:"#22c55e", emoji:"🚀",  desc:"Fondamentaux solides — potentiel fort." };
  if (g >= 5.5) return { label:"Neutre",       color:"#f59e0b", emoji:"⚖️", desc:"Profil équilibré — surveiller avant d'investir." };
  if (g >= 3.5) return { label:"Prudence",     color:"#f97316", emoji:"⚠️", desc:"Signaux mitigés — risques à ne pas négliger." };
  return         { label:"Risque élevé", color:"#ef4444", emoji:"🔴", desc:"Fondamentaux dégradés — investissement spéculatif." };
}

// ════════════════════════════════════════════════════════════════
// BLOC 3 — COUCHE RÉSEAU
// ════════════════════════════════════════════════════════════════
const PROXY   = "https://screener.etheryoh.workers.dev";
const CG_BASE = "https://api.coingecko.com/api/v3";
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
  "3a":  { range: "3y",   interval: "1wk", label: "3 ans"  },
  "5a":  { range: "5y",   interval: "1wk", label: "5 ans"  },
};

// ── MODES DE RECHERCHE ────────────────────────────────────────
type SearchMode = "all" | "equity" | "etf" | "futures" | "forex" | "crypto" | "index" | "bond";

const SEARCH_MODES: { key: SearchMode; label: string; yfTypes?: string[]; color: string }[] = [
  { key: "all",     label: "Tout",             color: "#8b949e" },
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

async function cgSearch(q: string): Promise<string | null> {
  try {
    const d = await getJson(`${CG_BASE}/search?query=${encodeURIComponent(q)}`);
    const coin = d?.coins?.[0];
    if (!coin) return null;
    const match =
      coin.symbol.toLowerCase() === q.toLowerCase() ||
      coin.id.toLowerCase()     === q.toLowerCase() ||
      coin.name.toLowerCase().startsWith(q.toLowerCase());
    return match ? coin.id : null;
  } catch { return null; }
}

async function cgCoin(id: string): Promise<any> {
  try {
    return await getJson(
      `${CG_BASE}/coins/${id}?localization=false&tickers=false&community_data=false`
    );
  } catch { return null; }
}

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
    const d = await getJson(`${CG_BASE}/search?query=${encodeURIComponent(q)}`);
    return (d?.coins ?? []).slice(0, 5).map((c: any) => ({
      symbol:   c.symbol.toUpperCase(),
      name:     c.name,
      type:     "CRYPTOCURRENCY",
      exchange: "CoinGecko",
    }));
  } catch { return []; }
}

// ════════════════════════════════════════════════════════════════
// BLOC 4 — MOTEUR D'ANALYSE (scoring pondéré)
// ════════════════════════════════════════════════════════════════
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
  const shortRatio  = ks.shortRatio?.raw as number | undefined;
  const beta        = sd.beta?.raw as number | undefined;
  const mktCap      = (pr.marketCap?.raw ?? sd.marketCap?.raw ?? meta?.marketCap) as number | undefined;
  const price       = (pr.regularMarketPrice?.raw ?? meta?.regularMarketPrice) as number | undefined;
  const change1d    = (pr.regularMarketChangePercent?.raw ?? meta?.regularMarketChangePercent) as number | undefined;
  // Yahoo Finance retourne parfois 52WeekChange en % (ex: 21.1) au lieu de décimal (0.211)
  // Si |valeur| > 15, c'est forcément un pourcentage → on normalise
  let change52w = (sd["52WeekChange"]?.raw ?? ks["52WeekChange"]?.raw) as number | undefined;
  if (change52w != null && Math.abs(change52w) > 15) change52w = change52w / 100;
  const name        = (pr.longName || pr.shortName || meta?.longName || meta?.shortName || "") as string;
  const sector      = (yf?.assetProfile?.sector   || "") as string;
  const industry    = (yf?.assetProfile?.industry || "") as string;
  const currency    = (pr.currency || meta?.currency || "USD") as string;
  const exchange    = (pr.exchangeName || meta?.exchangeName || "") as string;
  const quoteType   = (pr.quoteType || meta?.instrumentType || "EQUITY") as string;

  // ── SCORES INDIVIDUELS ────────────────────────────────────────

  // VALORISATION (40% du score global)
  const scorePE = pe != null ? scoreVal(pe, 15, 25, 40, true) : null;

  // P/B lié au ROE : si ROE > 20%, un P/B élevé est justifié
  let scorePB: number | null = null;
  if (pb != null) {
    if (roe != null && roe > 0.20) {
      // ROE fort → seuils P/B relevés (1→3→10 au lieu de 1→3→6)
      scorePB = scoreVal(pb, 3, 6, 10, true);
    } else if (roe != null && roe < 0) {
      // ROE négatif → P/B bas peut signifier détresse, pas opportunité
      scorePB = Math.min(scoreVal(pb, 1, 3, 6, true), 4);
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
  const scoreOpMargin   = opMargin   != null ? scoreVal(opMargin,   0.05, 0.12, 0.20, false) : null;

  // SANTÉ FINANCIÈRE (20% du score global)
  const scoreDebtEq      = debtEq      != null ? scoreVal(debtEq,      0.3, 0.8, 1.5, true)  : null;
  const scoreCurrentRatio= currentRatio!= null ? scoreVal(currentRatio, 1,   1.5, 2.5, false) : null;

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
  const scoreDivYield = divYield != null ? scoreVal(divYield, 0.01, 0.03, 0.06, false) : null;

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
    globalScore = Math.min(globalScore, 4.5); // extrême (NVDA/TSLA) : spéculatif
  } else if (globalScore != null && gValorisation != null && gValorisation <= 3.0) {
    globalScore = Math.min(globalScore, 5.0); // tendu (AAPL/MSFT) : marge nulle
  }
  // Règle 2 : santé financière critique → plafond 4.5
  // Liquidités insuffisantes = risque de faillite ou dilution en cas de choc.
  if (globalScore != null && gSante != null && gSante <= 2.5) {
    globalScore = Math.min(globalScore, 4.5);
  }
  // Règle 3 : combo valorisation tendue + santé faible → plafond 4.0
  if (globalScore != null && gValorisation != null && gSante != null
      && gValorisation <= 3.5 && gSante <= 3.0) {
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
  const noFundaTypes = ["INDEX", "FUTURE", "BOND", "MUTUALFUND"];
  if (noFundaTypes.indexOf((quoteType || "").toUpperCase()) !== -1) globalScore = null;

  const scores: Record<string, number | null> = {
    pe: scorePE, pb: scorePB, ps: scorePS, evEbitda: scoreEvEbitda,
    roe: scoreROE, netMargin: scoreNetMargin, opMargin: scoreOpMargin,
    debtEq: scoreDebtEq, currentRatio: scoreCurrentRatio,
    beta: scoreBeta, perf52w: scorePerf52w, divYield: scoreDivYield,
  };

  return {
    name, sector, industry, currency, exchange, quoteType,
    mktCap, price, change1d, change52w,
    pe, pb, ps, peg, evEbitda,
    roe, roa, grossMargin, opMargin, netMargin,
    divYield, payoutRatio, debtEq, currentRatio, fcf,
    sharesOut, shortRatio, beta,
    scores, globalScore,
    gValorisation, gRentabilite, gSante, gRisque,
  };
}

// ════════════════════════════════════════════════════════════════
// BLOC 4b — CALCULS TECHNIQUES
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

// ── ENCART SIGNAUX TECHNIQUES ─────────────────────────────────
interface TechSignal {
  emoji: string;
  color: string;
  plain: string;    // phrase en langage courant
  label: string;    // terme technique
  detail: string;   // valeurs chiffrées
  edu: {
    concept: string;    // définition simple du concept
    howToRead: string;  // comment interpréter les valeurs
    example: string;    // ce que ça signifie ici concrètement
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

function computeTechSignals(
  closes: (number|null)[],
  volumes: (number|null)[],
): { signals: TechSignal[]; sinewave: SinewaveResult | null } {
  const signals: TechSignal[] = [];
  const rsi   = calcRSI(closes);
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const macd   = calcMACD(closes);
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
  const sw = calcSinewave(closes);
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

  // ── Déviation à la tendance log-linéaire ─────────────────────
  const trendDev = calcTrendDeviation(closes);
  const trendEdu = {
    concept: "La régression log-linéaire trace une droite de tendance sur toute la période analysée. Elle modélise la croissance naturelle du prix en supposant une progression exponentielle dans le temps.",
    howToRead: "Un écart positif élevé signifie que le prix est bien au-dessus de sa tendance historique — signe de surchauffe ou de bulle. Un écart négatif indique que le prix est sous sa tendance — possible opportunité si les fondamentaux le soutiennent.",
  };
  if (trendDev != null && trendDev.r2 >= 0.4) {
    const dev = trendDev.deviation;
    if (dev > 30) {
      signals.push({ emoji:"📈", color:"#ef4444",
        plain:`Prix ${dev.toFixed(0)}% au-dessus de sa tendance historique — zone de surchauffe`,
        label:`Déviation tendance +${dev.toFixed(0)}%`,
        detail:`Régression log-linéaire · Tendance à ${trendDev.trendPrice} · R²=${trendDev.r2}`,
        strength:"bear", edu: { ...trendEdu,
          example:`Le prix est ${dev.toFixed(0)}% au-dessus de sa trajectoire historique. Ce niveau de déviation est souvent suivi d'un retour vers la moyenne, rapide ou progressif.` } });
    } else if (dev > 15) {
      signals.push({ emoji:"📊", color:"#f59e0b",
        plain:`Prix ${dev.toFixed(0)}% au-dessus de sa tendance — vigilance`,
        label:`Déviation tendance +${dev.toFixed(0)}%`,
        detail:`Régression log-linéaire · Tendance à ${trendDev.trendPrice} · R²=${trendDev.r2}`,
        strength:"neutral", edu: { ...trendEdu,
          example:`${dev.toFixed(0)}% au-dessus de la tendance — pas encore critique mais extensible. Un retour vers la moyenne est toujours possible.` } });
    } else if (dev < -20) {
      signals.push({ emoji:"📉", color:"#22c55e",
        plain:`Prix ${Math.abs(dev).toFixed(0)}% sous sa tendance — possible opportunité`,
        label:`Déviation tendance ${dev.toFixed(0)}%`,
        detail:`Régression log-linéaire · Tendance à ${trendDev.trendPrice} · R²=${trendDev.r2}`,
        strength:"bull", edu: { ...trendEdu,
          example:`Le prix est ${Math.abs(dev).toFixed(0)}% sous sa tendance de long terme. Si les fondamentaux le soutiennent, c'est souvent le signe d'une opportunité de retour à la moyenne.` } });
    }
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
      signals.push({ emoji:"🎯", color:"#22c55e",
        label:"Timing favorable — creux de cycle",
        detail:`Score fondamental ${globalScore.toFixed(1)}/10 + retournement de cycle haussier → configuration d'entrée potentiellement optimale.` });
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
function EduTooltip({ edu }: { edu: TechSignal["edu"] }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position:"relative", display:"inline-flex", alignItems:"center" }}>
      <button
        onClick={e => { e.stopPropagation(); setVisible(v => !v); }}
        style={{
          background: visible ? "#2a3548" : "#1a2235",
          border: "1px solid #2a3548",
          borderRadius: "50%",
          width: 18, height: 18,
          cursor: "pointer",
          fontSize: 10, fontWeight: 800,
          color: "#8b949e",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          transition: "all .15s",
          padding: 0,
        }}
        title="Comprendre cet indicateur"
      >?</button>
      {visible && (
        <div style={{
          position: "absolute",
          top: 24, right: 0,
          background: "#0d1420",
          border: "1px solid #2a3548",
          borderRadius: 10,
          padding: "14px 16px",
          width: 300,
          zIndex: 100,
          boxShadow: "0 8px 32px #000a",
          fontSize: 11,
          lineHeight: 1.7,
          color: "#8b949e",
        }}>
          <div style={{ color:"#f0a500", fontWeight:700, fontSize:12, marginBottom:8 }}>📚 Comprendre cet indicateur</div>
          <div style={{ marginBottom:10 }}>
            <div style={{ color:"#b0bec5", fontWeight:600, marginBottom:3 }}>C'est quoi ?</div>
            {edu.concept}
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={{ color:"#b0bec5", fontWeight:600, marginBottom:3 }}>Comment le lire ?</div>
            {edu.howToRead}
          </div>
          <div style={{ background:"#111825", borderRadius:6, padding:"8px 10px", borderLeft:"3px solid #f0a500" }}>
            <div style={{ color:"#f0a500", fontWeight:600, marginBottom:3 }}>Dans ce cas précis</div>
            {edu.example}
          </div>
          <button
            onClick={e => { e.stopPropagation(); setVisible(false); }}
            style={{ marginTop:10, fontSize:9, color:"#445", background:"none", border:"none", cursor:"pointer", padding:0 }}
          >▲ fermer</button>
        </div>
      )}
    </div>
  );
}

// ── COMPOSANT ENCART TECHNIQUE ────────────────────────────────
function TechnicalPanel({ closes, volumes }: { closes:(number|null)[]; volumes:(number|null)[] }) {
  const [open, setOpen] = useState(true);
  const { signals, sinewave } = computeTechSignals(closes, volumes);
  if (signals.length === 0) return null;

  const bulls  = signals.filter((s: TechSignal) => s.strength === "bull").length;
  const bears  = signals.filter((s: TechSignal) => s.strength === "bear").length;
  const consensus = bulls > bears ? { label:"Haussier", color:"#22c55e" }
    : bears > bulls ? { label:"Baissier", color:"#ef4444" }
    : { label:"Neutre", color:"#8b949e" };

  return (
    <div style={{ background:"#0d1420", border:"1px solid #1e2a3a", borderRadius:12, padding:"14px 18px", marginBottom:10 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", marginBottom: open ? 12 : 0 }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:10, fontWeight:800, color:"#445", textTransform:"uppercase", letterSpacing:2 }}>
            📊 Analyse technique
          </span>
          <span style={{ fontSize:10, fontWeight:800, color:consensus.color, background:consensus.color+"22", borderRadius:4, padding:"2px 8px" }}>
            {consensus.label}
          </span>
        </div>
        <span style={{ fontSize:10, color:"#334" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {sinewave && (
            <div style={{ background:"#111825", borderRadius:8, padding:"10px 14px", borderLeft:"3px solid #f0a500", marginBottom:2 }}>
              <div style={{ fontSize:9, color:"#f0a500", textTransform:"uppercase", letterSpacing:1.5, fontWeight:800, marginBottom:5 }}>
                🕐 Unité de temps optimale
              </div>
              <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"flex-start" }}>
                <div style={{ minWidth:130 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:"#e6edf3" }}>{sinewave.optimalUT.label}</div>
                  <div style={{ fontSize:10, color:"#8b949e", marginTop:2 }}>{sinewave.optimalUT.horizon}</div>
                </div>
                <div style={{ flex:1, fontSize:10, color:"#556", lineHeight:1.6, borderLeft:"1px solid #2a3548", paddingLeft:14 }}>
                  {sinewave.optimalUT.note}
                </div>
              </div>
            </div>
          )}
          {signals.map((s, i) => (
            <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", background:"#111825", borderRadius:8, borderLeft:`3px solid ${s.color}` }}>
              <span style={{ fontSize:13, flexShrink:0, marginTop:1 }}>{s.emoji}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#e6edf3", lineHeight:1.4 }}>{s.plain}</div>
                <div style={{ fontSize:10, color:s.color, fontFamily:"'IBM Plex Mono',monospace", marginTop:4, opacity:0.85 }}>
                  {s.label} · {s.detail}
                </div>
              </div>
              <EduTooltip edu={s.edu}/>
            </div>
          ))}
          <div style={{ fontSize:9, color:"#334", marginTop:6 }}>
            RSI/MACD calculés sur les prix de clôture · Moyennes mobiles sur données journalières (ou hebdomadaires si insuffisant)
          </div>
        </div>
      )}
    </div>
  );
}

// ── COMPOSANT ENCART SITUATIONNEL ────────────────────────────
function SituationalPanel({ metrics, closes }: { metrics: any; closes?: (number|null)[] }) {
  const [open, setOpen] = useState(true);
  const sw       = closes && closes.length > 0 ? calcSinewave(closes) : null;
  const trendDev = closes && closes.length > 0 ? calcTrendDeviation(closes) : null;
  const ctx = computeSituationalContext(metrics, sw, trendDev);
  if (!ctx) return null;

  return (
    <div style={{ background:"#0d1420", border:`1px solid ${ctx.profileColor}33`, borderRadius:12, padding:"14px 18px", marginBottom:10 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", marginBottom: open ? 12 : 0 }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:10, fontWeight:800, color:"#445", textTransform:"uppercase", letterSpacing:2 }}>
            ⚡ Contexte d'investissement
          </span>
          <span style={{ fontSize:11, fontWeight:800, color:ctx.profileColor, background:ctx.profileColor+"22", borderRadius:4, padding:"2px 8px" }}>
            {ctx.profileEmoji} {ctx.profile}
          </span>
        </div>
        <span style={{ fontSize:10, color:"#334" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div>
          <div style={{ fontSize:11, color:ctx.profileColor, fontWeight:600, marginBottom:10, padding:"6px 10px", background:ctx.profileColor+"11", borderRadius:6 }}>
            🕐 {ctx.horizon}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {ctx.signals.map((s, i) => (
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 10px", background:"#111825", borderRadius:8, borderLeft:`3px solid ${s.color}` }}>
                <span style={{ fontSize:13, flexShrink:0 }}>{s.emoji}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:s.color }}>{s.label}</div>
                  <div style={{ fontSize:11, color:"#8b949e", marginTop:2, lineHeight:1.5 }}>{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:9, color:"#334", marginTop:8 }}>
            ⚠️ Ces signaux sont informatifs et non contractuels. Tout investissement comporte un risque de perte en capital.
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// BLOC 5 — COMPOSANTS UI
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

function InteractiveChart({
  chartData,
  currency,
  quoteType,
  onPeriodChange,
  period,
  loading,
}: {
  chartData:      ChartData | null;
  currency:       string;
  quoteType?:     string;
  onPeriodChange: (p: string) => void;
  period:         string;
  loading:        boolean;
}) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; price: number; date: string } | null>(null);

  const PERIODS = quoteType === "CRYPTOCURRENCY"
    ? [{ key:"3m", label:"3 mois" }, { key:"1a", label:"1 an" }]
    : [{ key:"3m", label:"3 mois" }, { key:"1a", label:"1 an" }, { key:"3a", label:"3 ans" }, { key:"5a", label:"5 ans" }];

  const closes     = chartData?.closes     ?? [];
  const timestamps = chartData?.timestamps ?? [];

  // Paires (timestamp, prix) filtrées
  // Fallback : si timestamps absent (proxy ne les transmet pas), on les génère
  const now = Math.floor(Date.now() / 1000);
  const PERIOD_SECS: Record<string, number> = {
    "3m": 90*86400, "1a": 365*86400, "3a": 3*365*86400, "5a": 5*365*86400
  };
  const periodSecs = PERIOD_SECS[period] ?? 365*86400;
  const hasTimestamps = timestamps.length > 0;

  const points: { ts: number; price: number }[] = [];
  for (let i = 0; i < closes.length; i++) {
    const p = closes[i];
    if (p == null || isNaN(p)) continue;
    const ts = hasTimestamps && timestamps[i] != null
      ? timestamps[i]
      : Math.floor((now - periodSecs) + (i / Math.max(closes.length - 1, 1)) * periodSecs);
    points.push({ ts, price: p });
  }

  // Filtrage côté client selon la période demandée
  // (le Worker peut retourner plus de données que nécessaire)
  const PERIOD_DAYS: Record<string, number> = {
    "3m": 92, "1a": 366, "3a": 3*366, "5a": 5*366
  };
  const cutoffDays = PERIOD_DAYS[period] ?? 366;
  const cutoffTs   = Math.floor(Date.now() / 1000) - cutoffDays * 86400;
  const filtered   = points.filter(p => p.ts >= cutoffTs);
  const displayPts = filtered.length >= 2 ? filtered : points;

  if (displayPts.length < 2) return (
    <div style={{ color:"#334", fontSize:12, padding:"30px 0", textAlign:"center" }}>
      {loading ? "Chargement…" : "Données graphique indisponibles"}
    </div>
  );

  // ── BASE 100 (style TradingView) ────────────────────────────────
  // Chaque point est exprimé relativement au premier : base100[i] = prix[i] / prix[0] * 100
  const base0 = displayPts[0].price;
  const indexed = displayPts.map(p => (p.price / base0) * 100);

  const minI = Math.min(...indexed);
  const maxI = Math.max(...indexed);
  const yPad  = (maxI - minI) * 0.08; // 8% de marge haut et bas
  const yMin  = Math.max(0, minI - yPad);
  const yMax  = maxI + yPad;
  const yRange = yMax - yMin || 1;

  const W = 800, H = 260, PAD_L = 52, PAD_R = 12, PAD_T = 12, PAD_B = 28;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const toX = (i: number) => PAD_L + (i / (displayPts.length - 1)) * chartW;
  const toY = (val: number) => PAD_T + chartH - ((val - yMin) / yRange) * chartH;

  const polyPts = indexed.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const areaBot = H - PAD_B;
  const areaPts = `${PAD_L},${areaBot} ${polyPts} ${toX(displayPts.length-1)},${areaBot}`;

  const up = indexed[indexed.length-1] >= 100;
  const c  = up ? "#22c55e" : "#ef4444";
  const chgPct = (indexed[indexed.length-1] - 100).toFixed(1);

  // Ligne de base 100 (prix de départ = référence)
  const baseLineY = toY(100);

  // Axe Y : repères ronds dans le range visible
  const amplitude = maxI - minI;
  const tickStep  = amplitude > 150 ? 50 : amplitude > 60 ? 25 : amplitude > 25 ? 10 : 5;
  const firstTick = Math.ceil(yMin / tickStep) * tickStep;
  const yTicks = Array.from(
    { length: Math.floor((yMax - firstTick) / tickStep) + 1 },
    (_, i) => firstTick + i * tickStep
  )
  .filter(v => v >= yMin && v <= yMax)
  .map(v => ({ val: v, y: toY(v) }));

  // Axe X : repères temporels (max 5)
  const xStep = Math.max(1, Math.floor(displayPts.length / 5));
  const xTicks = displayPts
    .filter((_, i) => i === 0 || i === displayPts.length - 1 || i % xStep === 0)
    .slice(0, 6)
    .map((p, _, arr) => {
      const i = displayPts.indexOf(p);
      const d = new Date(p.ts * 1000);
      const label = period === "3m"
        ? d.toLocaleDateString("fr-FR", { day:"numeric", month:"short" })
        : period === "1a"
        ? d.toLocaleDateString("fr-FR", { month:"short", year:"2-digit" })
        : d.toLocaleDateString("fr-FR", { month:"short", year:"numeric" });
      return { x: toX(i), label };
    });

  // Formatage prix
  const fmtPrice = (n: number) => {
    if (n >= 1000) return n.toFixed(0);
    if (n >= 100)  return n.toFixed(1);
    if (n >= 1)    return n.toFixed(2);
    return n.toFixed(4);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const relX = svgX - PAD_L;
    if (relX < 0 || relX > chartW) { setTooltip(null); return; }
    const idx    = Math.min(Math.max(Math.round((relX / chartW) * (displayPts.length - 1)), 0), displayPts.length - 1);
    const pt     = displayPts[idx];
    const idxVal = indexed[idx]; // valeur base 100 — utilisée pour le point SVG
    const d      = new Date(pt.ts * 1000);
    const dateStr = d.toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" });
    setTooltip({ x: toX(idx), y: toY(idxVal), price: pt.price, date: dateStr });
  };

  return (
    <div>
      {/* Barre titre + boutons période */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:11, color:c, fontWeight:700 }}>
            {up ? "▲" : "▼"} {Math.abs(parseFloat(chgPct))}% sur {CHART_RANGES[period]?.label ?? period}
          </span>
          <span style={{ fontSize:10, color:"#334" }}>
            {fmtPrice(displayPts[0].price)} → {fmtPrice(displayPts[displayPts.length-1].price)} {currency}

          </span>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => onPeriodChange(p.key)}
              disabled={loading}
              style={{
                background: period === p.key ? c + "22" : "transparent",
                border: `1px solid ${period === p.key ? c : "#2a3548"}`,
                color:  period === p.key ? c : "#556",
                borderRadius: 5, padding: "3px 9px",
                fontSize: 10, fontWeight: 700, cursor: "pointer",
                transition: "all .15s",
              }}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {/* SVG graphique */}
      <div style={{ position:"relative" }}>
        <svg
          ref={svgRef}
          width="100%" viewBox={`0 0 ${W} ${H}`}
          style={{ overflow:"visible", cursor:"crosshair", display:"block" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        >
          <defs>
            <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={c} stopOpacity="0.18"/>
              <stop offset="100%" stopColor={c} stopOpacity="0"/>
            </linearGradient>
          </defs>

          {/* Grille horizontale */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PAD_L} y1={t.y} x2={W - PAD_R} y2={t.y}
                stroke="#1e2a3a" strokeWidth="1" strokeDasharray="3,4"/>
              <text x={PAD_L - 6} y={t.y + 4} textAnchor="end"
                fontSize="9" fill="#445" fontFamily="'IBM Plex Mono',monospace">
                {t.val >= 1 ? Math.round(t.val) : ""}
              </text>
            </g>
          ))}

          {/* Axe X labels */}
          {xTicks.map((t, i) => (
            <text key={i} x={t.x} y={H - PAD_B + 16} textAnchor="middle"
              fontSize="9" fill="#445">
              {t.label}
            </text>
          ))}

          {/* Ligne de base 100 — prix de départ */}
          <line
            x1={PAD_L} y1={baseLineY} x2={W - PAD_R} y2={baseLineY}
            stroke="#ffffff18" strokeWidth="1" strokeDasharray="4,3"
          />
          <text x={PAD_L - 6} y={baseLineY + 4} textAnchor="end"
            fontSize="9" fill="#666" fontFamily="'IBM Plex Mono',monospace">
            100
          </text>

          {/* Aire */}
          <polygon points={areaPts} fill="url(#cg)"/>

          {/* Courbe */}
          <polyline points={polyPts} fill="none" stroke={c}
            strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>

          {/* Ligne verticale tooltip */}
          {tooltip && (
            <line x1={tooltip.x} y1={PAD_T} x2={tooltip.x} y2={H - PAD_B}
              stroke="#ffffff22" strokeWidth="1" strokeDasharray="3,3"/>
          )}

          {/* Point tooltip */}
          {tooltip && (
            <circle cx={tooltip.x} cy={tooltip.y} r="4"
              fill={c} stroke="#080d14" strokeWidth="2"/>
          )}
        </svg>

        {/* Tooltip bulle */}
        {tooltip && (
          <div style={{
            position: "absolute",
            left: `${(tooltip.x / W) * 100}%`,
            top: 0,
            // Si on est dans le tiers droit → ancrer à droite du curseur, sinon centré
            transform: tooltip.x / W > 0.72
              ? "translateX(-100%) translateX(-8px)"
              : tooltip.x / W < 0.15
              ? "translateX(8px)"
              : "translateX(-50%)",
            background: "#111825",
            border: `1px solid ${c}55`,
            borderRadius: 7,
            padding: "6px 11px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 10,
          }}>
            {/* Performance relative depuis le début de la période */}
            <div style={{ fontSize:12, color:c, fontWeight:800, fontFamily:"'IBM Plex Mono',monospace" }}>
              {((tooltip.price / base0 - 1) * 100) >= 0 ? "+" : ""}
              {((tooltip.price / base0 - 1) * 100).toFixed(2)}%
            </div>
            {/* Prix réel — comme TradingView */}
            <div style={{ fontSize:10, color:"#8b949e", fontFamily:"'IBM Plex Mono',monospace", marginTop:1 }}>
              {fmtPrice(tooltip.price)} {currency}
            </div>
            <div style={{ fontSize:9, color:"#445", marginTop:2 }}>{tooltip.date}</div>
          </div>
        )}
      </div>
    </div>
  );
}

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
          stroke="#1e2a3a" strokeWidth="14" fill="none" strokeLinecap="butt"/>
        {arc(  2,  58, "#ef4444")}
        {arc( 62, 118, "#f59e0b")}
        {arc(122, 178, "#22c55e")}
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
        <div style={{ flex:1, height:4, background:"#1e2a3a", borderRadius:2, overflow:"hidden" }}>
          <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:2, transition:"width .5s" }}/>
        </div>
        <span style={{ fontSize:10, fontWeight:700, color, minWidth:24 }}>{score}</span>
      </div>
      <div style={{ fontSize:8, color:"#334", marginTop:2 }}>poids {Math.round(weight*100)}%</div>
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
  s?: number | null;
  edu?: {
    concept: string;
    howToRead: string;
    good: string;
    bad: string;
  };
}

// ════════════════════════════════════════════════════════════════
// BLOC 6 — VUE ACTION / ETF
// ════════════════════════════════════════════════════════════════
function MetricCard({ label, value, s, edu }: MetricProps) {
  const [open, setOpen] = useState(false);
  const bg = s == null ? "#111825"
    : s >= 7 ? "#0a2e1a"
    : s >= 4 ? "#2a1f00"
    : "#2a0a0a";
  const border = s == null ? "#1e2a3a"
    : s >= 7 ? "#22c55e44"
    : s >= 4 ? "#f59e0b44"
    : "#ef444444";
  return (
    <div
      onClick={() => edu && setOpen(o => !o)}
      style={{
        background: bg, border: `1px solid ${border}`,
        borderRadius: 10, padding: "12px 14px",
        cursor: edu ? "pointer" : "default",
        transition: "all .15s",
      }}
    >
      <div style={{ fontSize: 10, color: "#556", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{
          fontSize: 18, fontWeight: 800,
          color: s == null ? "#8b949e" : scoreColor(s),
          fontFamily: "'IBM Plex Mono',monospace",
        }}>
          {value}
        </span>
        {s != null && (
          <span style={{
            fontSize: 11, fontWeight: 800,
            color: scoreColor(s), background: scoreColor(s) + "22",
            borderRadius: 4, padding: "2px 7px",
          }}>
            {scoreEmoji(s)} {s}/10
          </span>
        )}
      </div>
      {edu && (
        <div style={{ fontSize: 9, color: "#445", marginTop: 4 }}>
          {open ? "▲ réduire" : "▼ comprendre"}
        </div>
      )}
      {open && edu && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${border}` }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: "#f0a500", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>C'est quoi ?</div>
            <div style={{ fontSize: 11, color: "#8b949e", lineHeight: 1.7 }}>{edu.concept}</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: "#f0a500", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Comment le lire ?</div>
            <div style={{ fontSize: 11, color: "#8b949e", lineHeight: 1.7 }}>{edu.howToRead}</div>
          </div>
          <div style={{ background: "#22c55e0d", borderLeft: "3px solid #22c55e55", padding: "7px 10px", borderRadius: 4, marginBottom: 6, fontSize: 11, color: "#22c55e", lineHeight: 1.6 }}>
            ✅ {edu.good}
          </div>
          <div style={{ background: "#ef44440d", borderLeft: "3px solid #ef444455", padding: "7px 10px", borderRadius: 4, fontSize: 11, color: "#ef4444", lineHeight: 1.6 }}>
            ⚠️ {edu.bad}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, color: "#445",
      textTransform: "uppercase", letterSpacing: 2,
      margin: "20px 0 10px", display: "flex", alignItems: "center", gap: 6,
    }}>
      <span>{icon}</span> {label}
    </div>
  );
}

function StockView({ metrics, chartData: initialChartData, ticker }: {
  metrics: any; chartData: any; ticker: string;
}) {
  if (!metrics) return null;
  const {
    name, sector, industry, currency, exchange, quoteType,
    price, change1d, change52w, scores = {}, globalScore,
    gValorisation, gRentabilite, gSante, gRisque,
  } = metrics;
  const v = getVerdict(globalScore);

  // État graphique interactif
  const defaultPeriod = "1a";
  const [period,       setPeriod]    = useState(defaultPeriod);
  const [chartData,    setChartData] = useState<{ closes:(number|null)[]; timestamps:number[]; opens:(number|null)[]; highs:(number|null)[]; lows:(number|null)[]; volumes:(number|null)[] } | null>(
    initialChartData
  );
  const [chartLoading, setChartLoading] = useState(false);

  // Sync chartData quand initialChartData change (nouvelle recherche)
  useEffect(() => {
    setChartData(initialChartData);
    setPeriod(defaultPeriod);
  }, [initialChartData]);

  const loadChart = useCallback(async (p: string) => {
    setChartLoading(true);
    try {
      const { range, interval } = CHART_RANGES[p] || CHART_RANGES["1a"];
      const url = `${PROXY}?ticker=${encodeURIComponent(ticker)}&type=chart&range=${range}&interval=${interval}`;
      const d   = await (await fetch(url)).json();
      const res = d?.chart?.result?.[0];
      if (res) {
        const q          = res.indicators?.quote?.[0] || {};
        const closes     = res.indicators?.adjclose?.[0]?.adjclose || q.close || [];
        const timestamps = res.timestamp || [];
        setChartData({
          closes, timestamps,
          opens:   q.open   || [],
          highs:   q.high   || [],
          lows:    q.low    || [],
          volumes: q.volume || [],
        });
      }
    } catch {}
    setChartLoading(false);
  }, [ticker]);

  const handlePeriodChange = (p: string) => {
    setPeriod(p);
    loadChart(p);
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
          }},
        { label: "P/B Ratio", value: fmt(metrics.pb), s: scores.pb,
          edu: {
            concept: "Le Price-to-Book compare le prix de marché à la valeur comptable nette de l'entreprise (actifs totaux moins dettes). Un PB de 1 signifie que vous achetez l'entreprise exactement à la valeur de ses actifs nets enregistrés au bilan.",
            howToRead: "Un PB inférieur à 1 peut signaler une décote sur les actifs (opportunité ou piège selon leur qualité). Un PB élevé est justifié pour des entreprises très rentables comme Apple ou LVMH, qui créent de la valeur avec peu d'actifs physiques — leur vraie richesse est dans les marques et brevets, hors bilan.",
            good: "Sous 1.5 : décote modérée potentiellement intéressante. PB élevé (3-8) acceptable si le ROE dépasse 20 % — l'entreprise justifie sa prime par une rentabilité structurelle.",
            bad: "PB supérieur à 8 avec un ROE faible : prime difficile à justifier. PB inférieur à 0.5 avec des pertes : risque de value trap — les actifs peuvent se déprécier encore.",
          }},
        { label: "P/S Ratio", value: fmt(metrics.ps), s: scores.ps,
          edu: {
            concept: "Le Price-to-Sales compare la valeur boursière au chiffre d'affaires total. Contrairement au P/E, il est utile même quand l'entreprise est déficitaire, car les ventes existent avant les bénéfices — indispensable pour évaluer les startups ou entreprises en forte croissance.",
            howToRead: "Un PS bas signifie qu'on paye peu pour chaque euro de ventes. Mais attention : des ventes ne sont pas des bénéfices. Un PS élevé n'est défendable que si les marges vont s'améliorer fortement dans le futur. Comparez avec des entreprises similaires en termes de stade de maturité.",
            good: "Sous 2 : valorisation raisonnable pour une entreprise rentable. Entre 2 et 5 : acceptable pour une société en forte croissance avec des marges en amélioration.",
            bad: "Au-dessus de 8 : pari très optimiste sur une amélioration future des marges. Au-dessus de 20 : réservé aux hypercroissances — risque important si la croissance ralentit même légèrement.",
          }},
        { label: "EV/EBITDA", value: fmt(metrics.evEbitda), s: scores.evEbitda,
          edu: {
            concept: "L'Enterprise Value / EBITDA compare la valeur totale de l'entreprise (capitalisation boursière + dettes nettes) à ses bénéfices avant intérêts, impôts et amortissements. C'est un outil de valorisation neutre vis-à-vis de la structure de financement.",
            howToRead: "Contrairement au P/E, l'EV/EBITDA n'est pas faussé par l'effet de levier financier ni par les politiques fiscales — il permet de comparer des entreprises avec des dettes très différentes. Plus le multiple est bas, moins on paye cher la génération de cash opérationnel.",
            good: "Sous 10 : valorisation raisonnable pour une entreprise mature. Sous 15 : acceptable pour un secteur en croissance. Secteurs défensifs (utilities, alim.) : viser sous 12.",
            bad: "Au-dessus de 25 : valorisation premium élevée — la croissance future est déjà intégrée dans le prix. Valeur négative : EBITDA négatif, le ratio ne s'applique pas.",
          }},
        { label: "PEG Ratio", value: fmt(metrics.peg), s: null,
          edu: {
            concept: "Le PEG (Price/Earnings to Growth) divise le P/E par le taux de croissance annuel attendu des bénéfices. Il corrige le biais du P/E en intégrant la dynamique de croissance : une entreprise chère sur le P/E peut être sous-valorisée si sa croissance est encore plus rapide.",
            howToRead: "Une entreprise avec un P/E de 30 mais une croissance bénéficiaire de 30 % a un PEG de 1 — équilibrée. Une entreprise avec un P/E de 15 mais seulement 5 % de croissance a un PEG de 3 — chère pour sa croissance. Le PEG dépend de la fiabilité des prévisions de croissance.",
            good: "Sous 1 : action potentiellement sous-valorisée par rapport à sa croissance attendue. Entre 1 et 1.5 : valorisation équilibrée, raisonnable pour entrer.",
            bad: "Au-dessus de 2 : on paye cher pour la croissance anticipée. Si les prévisions de croissance ne se réalisent pas, la correction peut être importante.",
          }},
        { label: "Market Cap", value: `${currency} ${fmt(metrics.mktCap)}`, s: null,
          edu: {
            concept: "La capitalisation boursière = prix de l'action × nombre total d'actions en circulation. Elle représente la valeur que le marché attribue aujourd'hui à l'ensemble de l'entreprise. Ce n'est pas le chiffre d'affaires ni les actifs — c'est le prix que vous paieriez pour acheter 100 % de l'entreprise en bourse.",
            howToRead: "Large cap (> 10 Md€) : entreprises stables, bien couvertes par les analystes, moins volatiles. Mid cap (2-10 Md€) : potentiel de croissance supérieur, risque modéré. Small cap (< 2 Md€) : opportunités de croissance importantes mais volatilité élevée et liquidité parfois limitée.",
            good: "Large cap avec fondamentaux solides : pilier de portefeuille, résilience en période de crise. Small cap sous-valorisée avec croissance : potentiel de multiplication.",
            bad: "Micro cap (< 300 M€) : risque de manipulation de cours, spreads larges à l'achat/vente, couverture analytique quasi nulle. Méfiance accrue.",
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
          }},
        { label: "ROA", value: pct(metrics.roa), s: null,
          edu: {
            concept: "Le Return on Assets mesure combien l'entreprise génère de bénéfice net pour chaque euro d'actifs qu'elle possède (usines, stocks, brevets, trésorerie...). Moins sensible aux rachats d'actions que le ROE, il reflète mieux l'efficacité opérationnelle réelle.",
            howToRead: "Le ROA est calculé sur l'ensemble des actifs (pas seulement les fonds propres), ce qui le rend plus stable et moins manipulable. Un ROA de 10 % signifie 10 € de profit pour 100 € d'actifs totaux. Comparez toujours dans le même secteur : les banques ont structurellement un ROA faible (1-2 %) à cause de leur bilan très chargé.",
            good: "Au-dessus de 10 % : très efficace, rare et précieux. Au-dessus de 5 % : correct pour un secteur industriel, manufacturier ou bancaire.",
            bad: "Sous 2 % : les actifs sont mal utilisés ou trop lourds par rapport aux profits. Négatif : l'entreprise détruit de la valeur sur l'ensemble de son parc d'actifs.",
          }},
        { label: "Marge Brute", value: pct(metrics.grossMargin), s: null,
          edu: {
            concept: "La marge brute = (Chiffre d'affaires − Coût des marchandises vendues) / CA. Elle mesure la part des ventes conservée avant tous les frais généraux, marketing et R&D. C'est le premier indicateur du pouvoir de tarification et de la compétitivité du modèle économique.",
            howToRead: "Une marge brute élevée (> 50 %) indique un fort pricing power : l'entreprise peut augmenter ses prix sans perdre ses clients. Elle finance la R&D, le marketing et les bénéfices. Les logiciels, le luxe et la pharma affichent souvent > 70 %. La grande distribution peut être à 25 % et être très rentable si les volumes sont massifs.",
            good: "Au-dessus de 40 % : modèle compétitif et scalable. Au-dessus de 60 % : pouvoir de marché structurel fort — difficile à répliquer par des concurrents.",
            bad: "Sous 20 % : peu de marge pour absorber les chocs de coûts. Dans ces secteurs, surveiller la marge nette de près — la moindre hausse de matières premières peut effacer les bénéfices.",
          }},
        { label: "Marge Opé.", value: pct(metrics.opMargin), s: scores.opMargin,
          edu: {
            concept: "La marge opérationnelle = Résultat d'exploitation / Chiffre d'affaires. Elle mesure la rentabilité après tous les coûts d'exploitation (production, R&D, marketing, frais généraux), mais avant les intérêts sur la dette et les impôts. C'est un bon reflet de l'efficacité de gestion.",
            howToRead: "Une marge opérationnelle en hausse sur plusieurs années est un signal fort : l'équipe de direction contrôle bien ses coûts et améliore l'efficacité. À comparer systématiquement avec les concurrents du même secteur. Une marge opérationnelle bien supérieure au secteur = avantage concurrentiel réel.",
            good: "Au-dessus de 15 % : bonne efficacité opérationnelle pour la plupart des secteurs. Au-dessus de 25 % : entreprise très bien gérée avec un pricing power fort.",
            bad: "Sous 5 % : coussin très mince face aux imprévus (hausse de coûts, concurrence). Négative : l'entreprise perd de l'argent sur ses opérations courantes — situation urgente à surveiller.",
          }},
        { label: "Marge Nette", value: pct(metrics.netMargin), s: scores.netMargin,
          edu: {
            concept: "La marge nette = Bénéfice net / Chiffre d'affaires. C'est ce qui reste réellement pour les actionnaires après tout : coûts d'exploitation, intérêts sur la dette, impôts. C'est la mesure de rentabilité finale — le vrai 'bottom line'.",
            howToRead: "Si la marge brute est haute mais la marge nette faible, les frais généraux, la dette ou les impôts consomment trop. Une marge nette élevée et stable sur plusieurs années est un signe de qualité rare. Microsoft et Apple dépassent les 25 %. Comparez avec la tendance historique de l'entreprise.",
            good: "Au-dessus de 10 % : très rentable, l'entreprise monétise efficacement ses activités. Au-dessus de 20 % : profil 'cash machine' — génère massivement du profit par rapport à ses ventes.",
            bad: "Négative : l'entreprise perd de l'argent in fine. Sous 3 % : très exposée à tout choc de coûts ou de demande — très peu de marge de sécurité.",
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
          }},
        { label: "Current Ratio", value: fmt(metrics.currentRatio), s: scores.currentRatio,
          edu: {
            concept: "Le current ratio = Actifs courants / Passifs courants. Il mesure si l'entreprise peut honorer ses dettes à court terme (moins d'un an) avec ses actifs liquides disponibles : trésorerie, créances clients à encaisser, stocks à vendre.",
            howToRead: "Un current ratio supérieur à 1 signifie que l'entreprise a plus d'actifs liquides que de dettes court terme — elle peut faire face à ses obligations immédiates. Un ratio inférieur à 1 n'est pas toujours catastrophique si l'entreprise génère des flux de trésorerie très réguliers (grande distribution, par exemple), mais c'est un signal d'alerte à vérifier.",
            good: "Entre 1.5 et 3 : confort de liquidité solide, bonne capacité à absorber les imprévus. Au-dessus de 1 : situation a priori saine.",
            bad: "Sous 1 : les dettes court terme dépassent les actifs liquides — risque de tension trésorerie. Sous 0.7 : alerte rouge — l'entreprise pourrait avoir des difficultés à honorer ses prochaines échéances.",
          }},
        { label: "Free Cash Flow", value: `${currency} ${fmt(metrics.fcf)}`, s: null,
          edu: {
            concept: "Le Free Cash Flow (flux de trésorerie libre) = Cash généré par l'activité opérationnelle − Investissements en capital (capex : usines, équipements, machines...). C'est l'argent réellement disponible pour rembourser des dettes, payer des dividendes, racheter des actions ou financer des acquisitions.",
            howToRead: "Le FCF est souvent plus fiable que le bénéfice comptable, qui peut être influencé par des choix comptables. Une entreprise peut afficher des bénéfices mais avoir un FCF négatif (problème réel de trésorerie). Warren Buffett considère le FCF comme la mesure de valeur la plus fondamentale d'une entreprise.",
            good: "Positif et croissant sur plusieurs années : qualité rare et très recherchée. FCF yield supérieur à 5 % (FCF / capitalisation boursière) : entreprise potentiellement sous-valorisée.",
            bad: "Négatif : l'entreprise consomme plus de cash qu'elle n'en génère — elle dépend de financements externes (dettes, émissions d'actions). Acceptable en phase d'investissement intense, problématique si persistant sans amélioration visible.",
          }},
        { label: "Actions en circ.", value: fmt(metrics.sharesOut, 0), s: null,
          edu: {
            concept: "Le nombre d'actions en circulation représente toutes les actions de l'entreprise détenues par les investisseurs (flottant + actions des dirigeants + institutionnels). La capitalisation boursière = prix × ce nombre.",
            howToRead: "Surveiller l'évolution dans le temps : une augmentation du nombre d'actions (dilution) réduit la part de chaque actionnaire dans les bénéfices et la valeur. À l'inverse, des rachats d'actions (buybacks) réduisent ce nombre et augmentent mécaniquement le bénéfice par action — souvent un signal positif.",
            good: "Nombre stable ou en baisse sur 5 ans : l'entreprise protège ses actionnaires de la dilution. Rachats réguliers + croissance des bénéfices = double effet positif sur le BPA.",
            bad: "Forte augmentation du nombre d'actions : dilution des actionnaires existants. Souvent signe que l'entreprise a besoin de lever des fonds pour survivre — à analyser avec le FCF.",
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
          }},
        { label: "Payout Ratio", value: pct(metrics.payoutRatio), s: null,
          edu: {
            concept: "Le payout ratio = Dividendes versés / Bénéfice net. Il mesure la part des bénéfices redistribuée aux actionnaires sous forme de dividendes. Le reste est réinvesti dans l'entreprise pour la croissance, le désendettement ou les acquisitions.",
            howToRead: "Un payout faible (< 40 %) laisse beaucoup de marge pour la croissance future et la résilience. Un payout élevé (> 80 %) signifie que l'entreprise reverse presque tout — peu de coussin si les bénéfices reculent. Le payout idéal dépend du stade : une entreprise mature peut distribuer plus, une entreprise en croissance doit réinvestir.",
            good: "Entre 30 % et 60 % : équilibre sain entre rémunération des actionnaires et réinvestissement pour la croissance. Payout stable ou en légère hausse = gestion prudente.",
            bad: "Au-dessus de 90 % : le dividende est à risque au moindre recul des bénéfices. Supérieur à 100 % : dividende financé par la dette ou la trésorerie — non soutenable à long terme.",
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
          }},
        { label: "Short Ratio", value: fmt(metrics.shortRatio), s: null,
          edu: {
            concept: "Le short ratio (ou Days to Cover) = nombre de jours nécessaires pour que tous les vendeurs à découvert rachètent leurs positions, basé sur le volume quotidien moyen. Les vendeurs à découvert parient professionnellement sur la baisse du titre — ce sont souvent des hedge funds ou institutionnels bien informés.",
            howToRead: "Un short ratio élevé signifie que beaucoup d'investisseurs professionnels parient contre l'action. Mais c'est une arme à double tranchant : si une bonne nouvelle arrive (résultats meilleurs que prévu, acquisition...), ces vendeurs sont forcés de racheter en urgence, ce qui peut déclencher un 'short squeeze' — une hausse violente et explosive du cours.",
            good: "Sous 3 jours : niveau normal, peu de pression baissière structurelle. Faible short ratio sur une action décotée = le marché ne la déteste pas, signal potentiellement positif.",
            bad: "Au-dessus de 10 jours : forte conviction des professionnels baissiers. À surveiller de très près : soit ils ont raison sur un problème fondamental, soit un squeeze violent est possible si le sentiment tourne.",
          }},
        { label: "Perf. 52 sem.", value: metrics.change52w != null ? (metrics.change52w * 100).toFixed(1) + "%" : "—",
          s: scores.perf52w,
          edu: {
            concept: "La performance sur les 52 dernières semaines mesure la variation du cours entre aujourd'hui et il y a exactement un an. C'est un indicateur de momentum à moyen terme qui révèle si le marché a récompensé ou sanctionné l'entreprise sur la période récente.",
            howToRead: "Une performance forte (+30 % sur 12 mois) indique une tendance haussière — mais signifie aussi que la valorisation a probablement progressé. Une performance négative peut créer une opportunité d'entrée si les fondamentaux restent solides (le marché a peut-être surréagi). Comparez toujours avec l'indice de référence du secteur.",
            good: "+10 % à +30 % en phase avec un marché haussier : momentum sain sans surchauffe. Surperformance du secteur + fondamentaux solides = force relative positive.",
            bad: "Baisse supérieure à −30 % sans amélioration visible des fondamentaux : tendance baissière possiblement structurelle. Hausse supérieure à +80 % : valorisation déjà élevée, la marge de sécurité pour entrer s'est réduite.",
          }},
      ],
    },
  ];

  // Synthèse technique pour l'encart résumé
  const techSummary = (() => {
    if (!chartData || chartData.closes.length === 0) return null;
    const { signals } = computeTechSignals(chartData.closes, chartData.volumes);
    const bulls = signals.filter((s: TechSignal) => s.strength === "bull").length;
    const bears = signals.filter((s: TechSignal) => s.strength === "bear").length;
    if (bears > bulls + 1) return { label: "Baissière", color: "#ef4444" };
    if (bulls > bears + 1) return { label: "Haussière", color: "#22c55e" };
    return { label: "Neutre / Mitigée", color: "#f59e0b" };
  })();

  return (
    <div style={{ animation: "fadeIn .4s ease" }}>
      {/* HEADER */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#445", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
          {[exchange, sector, industry].filter(Boolean).join(" · ")}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#e6edf3", marginBottom: 8, lineHeight: 1.3 }}>
          {name}<TypeBadge type={quoteType}/>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={{ fontSize: 34, fontWeight: 900, color: "#f0a500", fontFamily: "'IBM Plex Mono',monospace" }}>
            {currency} {fmt(price)}
          </span>
          {change1d != null && (
            <span style={{ fontSize: 15, fontWeight: 700, color: change1d >= 0 ? "#22c55e" : "#ef4444" }}>
              {change1d >= 0 ? "▲" : "▼"} {Math.abs(change1d * 100).toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* CARTE VERDICT — pleine largeur, jauge intégrée à droite */}
      {v ? (
        <div style={{
          background: v.color + "0f", border: `1px solid ${v.color}33`,
          borderRadius: 14, padding: "18px 22px", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 24,
        }}>
          {/* Contenu principal */}
          <div style={{ flex: 1 }}>
            {/* Score + verdict */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{
                  fontSize: 56, fontWeight: 900, lineHeight: 1,
                  color: scoreColor(globalScore!),
                  fontFamily: "'IBM Plex Mono',monospace",
                }}>{globalScore}</span>
                <span style={{ fontSize: 18, color: "#556", fontFamily: "'IBM Plex Mono',monospace" }}>/10</span>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: v.color }}>{v.emoji} {v.label}</div>
                <div style={{ fontSize: 11, color: "#8b949e", lineHeight: 1.4, marginTop: 2 }}>{v.desc}</div>
              </div>
            </div>
            {/* Mini-jauges */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <MiniGauge label="Valorisation" score={gValorisation} weight={0.40}/>
              <MiniGauge label="Rentabilité"  score={gRentabilite}  weight={0.30}/>
              <MiniGauge label="Santé"        score={gSante}        weight={0.20}/>
              <MiniGauge label="Risque"       score={gRisque}       weight={0.10}/>
            </div>
            {/* Synthèse technique */}
            {techSummary && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "5px 10px", borderRadius: 6,
                background: techSummary.color + "15",
                borderLeft: `3px solid ${techSummary.color}`,
              }}>
                <span style={{ fontSize: 9, color: "#445", textTransform: "uppercase", letterSpacing: 1 }}>Technique</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: techSummary.color }}>{techSummary.label}</span>
              </div>
            )}
          </div>
          {/* Jauge à droite */}
          <div style={{ flexShrink: 0 }}>
            <ScoreGauge score={globalScore}/>
          </div>
        </div>
      ) : (
        <div style={{
          background: "#090f1a", border: "1px solid #2a3548",
          borderRadius: 14, padding: "18px 22px", marginBottom: 14,
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#556", marginBottom: 6 }}>
            {["INDEX","FUTURE","BOND","MUTUALFUND"].indexOf((quoteType||"").toUpperCase()) !== -1
              ? "Analyse technique uniquement"
              : "Données insuffisantes"}
          </div>
          <div style={{ fontSize: 11, color: "#445", lineHeight: 1.6, marginBottom: 10 }}>
            {quoteType === "INDEX"      ? "Les ratios PE / PB / ROE ne s'appliquent pas aux indices de marché." :
             quoteType === "FUTURE"     ? "Les contrats à terme n'ont pas de fondamentaux d'entreprise." :
             quoteType === "BOND"       ? "Les obligations se lisent par le taux et la maturité, pas par le PE." :
             quoteType === "MUTUALFUND" ? "Les fonds n'ont pas de bilan d'entreprise à analyser." :
             "Données fondamentales insuffisantes pour calculer un score fiable."}
          </div>
          {change52w != null && (
            <div style={{ background: "#111825", borderRadius: 8, padding: "8px 12px", marginBottom: 10, display: "inline-block" }}>
              <div style={{ fontSize: 9, color: "#445", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>
                Perf. 52 semaines
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: change52w >= 0 ? "#22c55e" : "#ef4444", fontFamily: "'IBM Plex Mono',monospace" }}>
                {change52w >= 0 ? "+" : ""}{(change52w * 100).toFixed(1)}%
              </div>
            </div>
          )}
          {techSummary && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "5px 10px", borderRadius: 6, marginLeft: change52w != null ? 12 : 0,
              background: techSummary.color + "15",
              borderLeft: `3px solid ${techSummary.color}`,
            }}>
              <span style={{ fontSize: 9, color: "#445", textTransform: "uppercase", letterSpacing: 1 }}>Technique</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: techSummary.color }}>{techSummary.label}</span>
            </div>
          )}
        </div>
      )}

      {/* GRAPHIQUE INTERACTIF */}
      <div style={{ background: "#0d1420", border: "1px solid #1e2a3a", borderRadius: 12, padding: "14px 18px", marginBottom: 4 }}>
        <div style={{ fontSize: 10, color: "#445", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>
          Performance historique
        </div>
        <InteractiveChart
          chartData={chartData}
          currency={currency}
          quoteType={quoteType}
          period={period}
          onPeriodChange={handlePeriodChange}
          loading={chartLoading}
        />
      </div>

      {/* ENCARTS ANALYSE */}
      <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:0 }}>
        <TechnicalPanel
          closes={chartData?.closes ?? []}
          volumes={chartData?.volumes ?? []}
        />
        <SituationalPanel metrics={metrics} closes={chartData?.closes ?? []}/>
      </div>

      {/* SECTIONS — masquées pour les types sans fondamentaux d'entreprise */}
      {["INDEX","FUTURE","BOND"].indexOf((quoteType||"").toUpperCase()) === -1 && SECTIONS.map(sec => (
        <div key={sec.label}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", margin:"20px 0 10px" }}>
            <SectionTitle icon={sec.icon} label={sec.label}/>
            <span style={{ fontSize:9, color:"#334", fontStyle:"italic" }}>{sec.note}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 10 }}>
            {sec.cards.map((c, i) => <MetricCard key={i} {...c}/>)}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 10, color: "#333", textAlign: "right", marginTop: 16 }}>
        Source : Yahoo Finance via proxy · Données indicatives, non contractuelles
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// BLOC 7 — VUE CRYPTO
// ════════════════════════════════════════════════════════════════
function CryptoView({ data }: { data: any }) {
  const md     = data.market_data || {};
  const price  = md.current_price?.usd;
  const chg24h = md.price_change_percentage_24h;
  const chg7d  = md.price_change_percentage_7d;
  const mktCap = md.market_cap?.usd;
  const vol24h = md.total_volume?.usd;
  const supply = md.circulating_supply;
  const maxSup = md.max_supply;
  const ath    = md.ath?.usd;
  const athPct = md.ath_change_percentage?.usd;
  const up24   = chg24h >= 0;

  return (
    <div style={{ animation:"fadeIn .4s ease" }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:16, marginBottom:20, flexWrap:"wrap" }}>
        {data.image?.small && <img src={data.image.small} alt="" style={{ width:52, height:52, borderRadius:"50%", marginTop:4 }}/>}
        <div style={{ flex:1 }}>
          <div style={{ fontSize:22, fontWeight:800, color:"#e6edf3", marginBottom:6 }}>
            {data.name}<TypeBadge type="CRYPTOCURRENCY"/>
            <span style={{ color:"#445", fontSize:13, fontWeight:400, marginLeft:8 }}>{data.symbol?.toUpperCase()}</span>
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:14, flexWrap:"wrap" }}>
            <span style={{ fontSize:34, fontWeight:900, color:"#f0a500", fontFamily:"'IBM Plex Mono',monospace" }}>
              ${fmt(price)}
            </span>
            <span style={{ fontSize:14, fontWeight:700, color: up24?"#22c55e":"#ef4444" }}>
              {up24?"▲":"▼"} {Math.abs(chg24h||0).toFixed(2)}% 24h
            </span>
            {chg7d != null && (
              <span style={{ fontSize:12, color: chg7d>=0?"#22c55e":"#ef4444" }}>
                {chg7d>=0?"▲":"▼"} {Math.abs(chg7d).toFixed(2)}% 7j
              </span>
            )}
          </div>
        </div>
        <div style={{ background:"#151f30", border:"1px solid #2a3548", borderRadius:12, padding:"12px 20px", textAlign:"center" }}>
          <div style={{ fontSize:10, color:"#445", marginBottom:3 }}>Rang CoinGecko</div>
          <div style={{ fontSize:24, fontWeight:800, color:"#f0a500" }}>#{data.market_cap_rank}</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10, marginBottom:18 }}>
        {[
          ["Market Cap",       "$"+fmt(mktCap)],
          ["Volume 24h",       "$"+fmt(vol24h)],
          ["Offre circulante", fmt(supply,0)],
          ["Offre max",        maxSup ? fmt(maxSup,0) : "∞"],
          ["ATH",              ath ? "$"+fmt(ath) : "—"],
          ["Depuis ATH",       athPct != null ? athPct.toFixed(1)+"%" : "—"],
        ].map(([k,v]) => (
          <div key={k} style={{ background:"#151f30", border:"1px solid #2a3548", borderRadius:10, padding:"11px 14px" }}>
            <div style={{ fontSize:10, color:"#445", marginBottom:3 }}>{k}</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#e6edf3", fontFamily:"'IBM Plex Mono',monospace" }}>{v}</div>
          </div>
        ))}
      </div>
      {data.description?.en && (
        <div style={{ background:"#151f30", border:"1px solid #2a3548", borderRadius:10, padding:16, fontSize:12, color:"#8b949e", lineHeight:1.8 }}>
          <div style={{ color:"#f0a500", fontWeight:700, marginBottom:8 }}>📖 À propos</div>
          {data.description.en.replace(/<[^>]+>/g,"").slice(0,600)}…
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// BLOC 8 — APPLICATION PRINCIPALE
// ════════════════════════════════════════════════════════════════
type ResultType =
  | { type: "stock";  metrics: any; chartData: any; ticker: string }
  | { type: "crypto"; data: any }
  | { type: "forex";  currency: string; rate: number; allRates: Record<string, number> };

export default function App() {
  const [query,   setQuery]   = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<ResultType | null>(null);
  const [log,     setLog]     = useState<string[]>([]);
  const [error,   setError]   = useState("");
  const [mode,            setMode]            = useState<SearchMode>("all");
  const [suggestions,     setSuggestions]     = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef   = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => setLog(l => [...l, msg]);

  const doAnalyze = useCallback(async (forceTicker?: string) => {
    const raw = (forceTicker || query).trim();
    if (!raw) return;
    const upper = raw.toUpperCase();
    const lower = raw.toLowerCase();
    setLoading(true); setResult(null); setLog([]); setError("");
    addLog(`🔍 Analyse : ${raw}`);

    const isForexPattern =
      /^[A-Z]{3}$/.test(upper) ||
      /^[A-Z]{3}[/][A-Z]{3}$/.test(upper) ||
      /^[A-Z]{6}$/.test(upper) ||
      upper.endsWith("=X");

    if (isForexPattern) {
      addLog("💱 Pattern Forex → ECB...");
      const rates = await ecbRates();
      const cur = upper.replace(/EUR|=X|\//g,"").slice(-3) || upper.slice(0,3);
      const rate = rates[cur];
      if (rate) {
        addLog(`✅ EUR/${cur} = ${rate}`);
        setResult({ type:"forex", currency:cur, rate, allRates:rates });
        setLoading(false); return;
      }
      addLog(`  → ${cur} absent ECB, on continue`);
    }

    const skipCG = mode !== "all" && mode !== "crypto";
    addLog(`⚡ Recherche ${skipCG ? "Yahoo Finance" : "parallèle Yahoo Finance + CoinGecko"}...`);
    const [yfData, cgId] = await Promise.all([
      yfChart(upper, addLog),
      skipCG ? Promise.resolve(null) : cgSearch(lower),
    ]);

    if (cgId) {
      const d = await cgCoin(cgId);
      if (d?.market_data?.current_price?.usd) {
        const yfType = yfData?.meta?.instrumentType || yfData?.meta?.quoteType || "";
        const isCryptoETF = yfType === "ETF" && (
          upper === "BTC" || upper === "ETH" || upper === "SOL"
          || d.symbol?.toUpperCase() === upper
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
      setResult({ type:"stock", metrics, ticker: upper, chartData: {
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
    const seen   = new Set<string>();
    const unique = filtered.filter(r => { if (seen.has(r.symbol)) return false; seen.add(r.symbol); return true; });
    setSuggestions(unique.slice(0, 10));
    setShowSuggestions(unique.length > 0);
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
    doAnalyze(s.symbol);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const ForexView = ({ currency, rate, allRates }: { currency: string; rate: number; allRates: Record<string, number> }) => (
    <div style={{ animation:"fadeIn .4s ease" }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, color:"#445", textTransform:"uppercase", letterSpacing:1.5, marginBottom:4 }}>
          Banque Centrale Européenne · Officiel
        </div>
        <div style={{ fontSize:22, fontWeight:800, color:"#e6edf3", marginBottom:8 }}>
          EUR / {currency}<TypeBadge type="CURRENCY"/>
        </div>
        <span style={{ fontSize:38, fontWeight:900, color:"#f0a500", fontFamily:"'IBM Plex Mono',monospace" }}>
          {parseFloat(String(rate)).toFixed(4)}
        </span>
        <span style={{ fontSize:13, color:"#556", marginLeft:8 }}>1 EUR = {rate} {currency}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:7 }}>
        {Object.entries(allRates).sort().map(([cur, r]) => (
          <div key={cur} style={{
            background:"#151f30",
            border:`1px solid ${cur === currency ? "#f0a500" : "#2a3548"}`,
            borderRadius:8, padding:"8px 12px"
          }}>
            <div style={{ fontSize:9, color:"#445" }}>EUR / {cur}</div>
            <div style={{ fontSize:13, fontWeight:700, fontFamily:"'IBM Plex Mono',monospace" }}>
              {parseFloat(String(r)).toFixed(4)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:10, fontSize:10, color:"#333", textAlign:"right" }}>
        Source : Banque Centrale Européenne · Temps réel
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#080d14", fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif", color:"#e6edf3" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=IBM+Plex+Sans:wght@400;600;700;800&display=swap');
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#2a3548;border-radius:3px}
        input,button{font-family:inherit}
        .app-inner { width:100%; max-width:1200px; margin:0 auto; padding:0 clamp(16px, 4vw, 40px); }
      `}</style>

      {/* HEADER */}
      <div style={{ borderBottom:"1px solid #141e2e", background:"#090f1a", padding:"10px 0" }}>
        <div className="app-inner">
          <div style={{ fontSize:9, color:"#445", letterSpacing:2.5, textTransform:"uppercase", marginBottom:2 }}>
            Multi-sources · Gratuit · Mondial
          </div>
          <div style={{ fontSize:19, fontWeight:800, color:"#e6edf3" }}>
            Stock Screener <span style={{ color:"#2a3548" }}>—</span>{" "}
            <span style={{ color:"#f0a500" }}>Méthodologie d'Investissement</span>
          </div>
          <div style={{ display:"flex", gap:14, marginTop:4 }}>
            {[["Yahoo Finance","#22c55e"],["CoinGecko","#f59e0b"],["ECB","#60a5fa"]].map(([l,c]) => (
              <span key={l} style={{ fontSize:9, color:"#556" }}>
                <span style={{ color:c }}>●</span> {l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* BARRE DE RECHERCHE */}
      <div style={{ paddingTop:24, paddingBottom:0 }}>
        <div className="app-inner">

          {/* Filtres par mode */}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
            {SEARCH_MODES.map(m => {
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => handleModeChange(m.key)}
                  style={{
                    background:  active ? m.color + "22" : "transparent",
                    border:     `1px solid ${active ? m.color : "#2a3548"}`,
                    color:       active ? m.color : "#556",
                    borderRadius: 6, padding: "5px 13px",
                    fontSize: 11, fontWeight: active ? 800 : 600,
                    cursor: "pointer", transition: "all .15s",
                    letterSpacing: 0.2,
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Champ + suggestions */}
          <div style={{ maxWidth:760, display:"flex", gap:10, alignItems:"flex-start" }}>
            <div ref={searchRef} style={{ flex:1, position:"relative" }}>
              <input
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter")  { setShowSuggestions(false); doAnalyze(); }
                  if (e.key === "Escape")   setShowSuggestions(false);
                }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder={
                  mode === "equity"  ? "Ticker action : AAPL · MC.PA · AIR.PA · SAP.DE..." :
                  mode === "etf"     ? "Ticker ETF / Fonds : SPY · IWDA.AS · CW8.PA..." :
                  mode === "futures" ? "Contrat à terme : ES=F · NQ=F · CL=F · GC=F..." :
                  mode === "forex"   ? "Paire Forex : USD · EUR/GBP · JPY · CHF..." :
                  mode === "crypto"  ? "Crypto : BTC · ethereum · SOL · MATIC..." :
                  mode === "index"   ? "Indice : ^GSPC · ^FCHI · ^GDAXI · ^N225..." :
                  mode === "bond"    ? "Obligation : ^TNX · ^IRX · TLT..." :
                  "Ticker : AAPL · MC.PA · BTC · bitcoin · USD · EUR/GBP..."
                }
                style={{
                  width:"100%", background:"#0d1420", border:"1px solid #2a3548",
                  borderRadius:10, color:"#e6edf3", padding:"14px 18px",
                  fontSize:15, fontWeight:600, outline:"none",
                }}
              />

              {/* Dropdown suggestions */}
              {showSuggestions && suggestions.length > 0 && (
                <div style={{
                  position:"absolute", top:"calc(100% + 6px)", left:0, right:0,
                  background:"#0d1420", border:"1px solid #2a3548",
                  borderRadius:10, overflow:"hidden",
                  zIndex:50, boxShadow:"0 8px 32px #000d",
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
                          borderBottom: i < suggestions.length - 1 ? "1px solid #141e2e" : "none",
                          background:"transparent", transition:"background .1s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#141e2e")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontWeight:800, color:"#e6edf3", fontSize:13, minWidth:70, flexShrink:0 }}>
                          {s.symbol}
                        </span>
                        <span style={{ flex:1, fontSize:12, color:"#8b949e", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {s.name}
                        </span>
                        <span style={{ fontSize:9, fontWeight:800, color:b.color, background:b.bg, borderRadius:4, padding:"2px 6px", letterSpacing:1, textTransform:"uppercase", flexShrink:0 }}>
                          {b.label}
                        </span>
                        {s.exchange && (
                          <span style={{ fontSize:9, color:"#445", flexShrink:0 }}>{s.exchange}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button onClick={() => { setShowSuggestions(false); doAnalyze(); }} disabled={loading} style={{
              background: loading ? "#141e2e" : "#f0a500",
              color: loading ? "#445" : "#000",
              border:"none", borderRadius:10, padding:"14px 26px",
              fontSize:14, fontWeight:800,
              cursor: loading ? "not-allowed" : "pointer",
              whiteSpace:"nowrap", flexShrink:0,
            }}>
              {loading ? "…" : "Analyser →"}
            </button>
          </div>

        </div>
      </div>

      {/* JOURNAL */}
      {log.length > 0 && (
        <div style={{ marginTop:14 }}>
          <div className="app-inner">
            <div style={{ background:"#090f1a", border:"1px solid #141e2e", borderRadius:8, padding:"8px 14px" }}>
              <div style={{ fontSize:9, color:"#445", textTransform:"uppercase", letterSpacing:1.5, marginBottom:5 }}>Journal</div>
              {log.map((l,i) => (
                <div key={i} style={{ fontSize:11, color:"#556", fontFamily:"'IBM Plex Mono',monospace" }}>{l}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ERREUR */}
      {error && (
        <div style={{ marginTop:14 }}>
          <div className="app-inner">
            <div style={{ background:"#1e0a0a", border:"1px solid #5a1a1a", borderRadius:8, padding:"12px 16px", color:"#ef4444", fontSize:13 }}>
              ⚠️ {error}
            </div>
          </div>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div style={{ display:"flex", justifyContent:"center", padding:60 }}>
          <div style={{ width:34, height:34, border:"3px solid #141e2e", borderTopColor:"#f0a500", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
        </div>
      )}

      {/* RÉSULTATS */}
      {result && !loading && (
        <div style={{ paddingTop:22, paddingBottom:40 }}>
          <div className="app-inner">
            {result.type === "stock"  && <StockView metrics={result.metrics} chartData={result.chartData} ticker={result.ticker ?? ""}/>}
            {result.type === "crypto" && <CryptoView data={result.data}/>}
            {result.type === "forex"  && <ForexView {...result}/>}
          </div>
        </div>
      )}

      {/* DISCLAIMER LÉGAL */}
      <div style={{ borderTop:"1px solid #141e2e", background:"#090f1a", marginTop:"auto", padding:"20px 0" }}>
        <div className="app-inner">
          <div style={{
            background:"#0d1420", border:"1px solid #1e2a3a", borderRadius:10,
            padding:"16px 20px", display:"flex", gap:14, alignItems:"flex-start",
          }}>
            <span style={{ fontSize:18, flexShrink:0 }}>⚖️</span>
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:"#8b949e", textTransform:"uppercase", letterSpacing:1.2, marginBottom:6 }}>
                Avertissement — Pas de conseil en investissement
              </div>
              <div style={{ fontSize:11, color:"#556", lineHeight:1.8 }}>
                Les informations, analyses et signaux présentés sur ce screener sont fournis à titre <strong style={{ color:"#8b949e" }}>purement informatif et éducatif</strong>.
                Ils ne constituent en aucun cas un conseil en investissement, une recommandation d'achat ou de vente, ni une incitation à investir.
                Tout investissement comporte un <strong style={{ color:"#8b949e" }}>risque de perte partielle ou totale du capital</strong>.
                Les performances passées ne préjugent pas des performances futures.
                L'auteur de cet outil <strong style={{ color:"#8b949e" }}>décline toute responsabilité</strong> quant aux décisions prises sur la base de ces données
                et aux pertes éventuelles qui pourraient en résulter.
                Consultez un conseiller financier agréé avant toute décision d'investissement.
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
