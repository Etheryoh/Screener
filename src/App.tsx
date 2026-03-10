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
  const change52w   = (sd["52WeekChange"]?.raw ?? ks["52WeekChange"]?.raw) as number | undefined;
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

function computeTechSignals(
  closes: (number|null)[],
  volumes: (number|null)[],
): TechSignal[] {
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

  return signals;
}

// ── ENCART CONTEXTE SITUATIONNEL ─────────────────────────────
interface SitSignal {
  emoji: string;
  color: string;
  label: string;
  detail: string;
}

function computeSituationalContext(metrics: any): {
  profile: string;
  profileColor: string;
  profileEmoji: string;
  horizon: string;
  signals: SitSignal[];
} | null {
  if (!metrics) return null;
  const { pe, pb, roe, netMargin, change52w, shortRatio, debtEq, currentRatio,
          gValorisation, gSante, globalScore, fcf, mktCap } = metrics;
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
  const signals = computeTechSignals(closes, volumes);
  if (signals.length === 0) return null;

  const bulls  = signals.filter(s => s.strength === "bull").length;
  const bears  = signals.filter(s => s.strength === "bear").length;
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
function SituationalPanel({ metrics }: { metrics: any }) {
  const [open, setOpen] = useState(true);
  const ctx = computeSituationalContext(metrics);
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
  // cy=62 : centre du demi-cercle. Texte à cy+16=78 et cy+28=90 → height=96 suffit
  const cx = 70, cy = 62, r = 52;
  const toRad = (d: number) => d * Math.PI / 180;
  const px = (deg: number) => cx + r * Math.cos(toRad(180 - deg));
  const py = (deg: number) => cy + r * Math.sin(toRad(180 - deg));
  const arc = (a1: number, a2: number, color: string) => (
    <path
      d={`M${px(a1)},${py(a1)} A${r},${r} 0 0 0 ${px(a2)},${py(a2)}`}
      stroke={color} strokeWidth="12" fill="none" strokeLinecap="round"
    />
  );
  const nd = (score / 10) * 180;
  const nx = cx + r * 0.72 * Math.cos(toRad(180 - nd));
  const ny = cy + r * 0.72 * Math.sin(toRad(180 - nd));
  return (
    <svg width="140" height="96" viewBox="0 0 140 96" style={{ overflow: "visible" }}>
      <g transform={`translate(0, ${cy * 2}) scale(1, -1)`}>
        {arc(  0,  60, "#ef4444")}
        {arc( 60, 120, "#f59e0b")}
        {arc(120, 180, "#22c55e")}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r="4" fill="white"/>
      </g>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="15" fontWeight="900" fill="white">{score}</text>
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize="9" fill="#666">/10</text>
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
  explain?: string;
  good?: string;
  bad?: string;
}

// ════════════════════════════════════════════════════════════════
// BLOC 6 — VUE ACTION / ETF
// ════════════════════════════════════════════════════════════════
function MetricCard({ label, value, s, explain, good, bad }: MetricProps) {
  const [open, setOpen] = useState(false);
  const hasDetail = explain || good || bad;
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
      onClick={() => hasDetail && setOpen(o => !o)}
      style={{
        background: bg, border: `1px solid ${border}`,
        borderRadius: 10, padding: "12px 14px",
        cursor: hasDetail ? "pointer" : "default",
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
      {hasDetail && (
        <div style={{ fontSize: 9, color: "#445", marginTop: 4 }}>
          {open ? "▲ réduire" : "▼ détail"}
        </div>
      )}
      {open && (
        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: `1px solid ${border}`,
          fontSize: 11, color: "#8b949e", lineHeight: 1.7,
        }}>
          {explain && <p style={{ margin: "0 0 4px" }}>{explain}</p>}
          {good && <p style={{ margin: "0 0 2px", color: "#22c55e" }}>✅ {good}</p>}
          {bad  && <p style={{ margin: 0, color: "#ef4444" }}>⚠️ {bad}</p>}
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
    price, change1d, scores = {}, globalScore,
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
        { label: "P/E Ratio",    value: fmt(metrics.pe),       s: scores.pe,
          explain: "Prix payé pour 1€ de bénéfice. Plus c'est bas, moins l'action est chère.",
          good: "Sous 15 : attractif", bad: "Au-dessus de 40 : très cher" },
        { label: "P/B Ratio",    value: fmt(metrics.pb),       s: scores.pb,
          explain: "Prix vs valeur comptable. Seuils ajustés si ROE > 20% (P/B élevé peut être justifié).",
          good: "Sous 3 : zone saine", bad: "Au-dessus de 10 avec ROE faible : danger" },
        { label: "P/S Ratio",    value: fmt(metrics.ps),       s: scores.ps,
          explain: "Prix vs chiffre d'affaires. Utile quand les bénéfices sont nuls.",
          good: "Sous 2 : bon rapport", bad: "Au-dessus de 8 : valorisation tendue" },
        { label: "EV/EBITDA",    value: fmt(metrics.evEbitda), s: scores.evEbitda,
          explain: "Valeur entreprise / bénéfices opérationnels. Neutre sur la structure de capital.",
          good: "Sous 10 : pas cher", bad: "Au-dessus de 25 : très premium" },
        { label: "PEG Ratio",    value: fmt(metrics.peg),      s: null,
          explain: "P/E divisé par la croissance attendue. Sous 1 = sous-évalué vs croissance.",
          good: "Sous 1 : opportunité", bad: "Au-dessus de 2 : cher pour sa croissance" },
        { label: "Market Cap",   value: `${currency} ${fmt(metrics.mktCap)}`, s: null,
          explain: "Valeur totale en bourse = prix × nombre d'actions." },
      ],
    },
    {
      icon: "📈", label: "Rentabilité",
      note: "30% du score",
      cards: [
        { label: "ROE",          value: pct(metrics.roe),         s: scores.roe,
          explain: "Retour sur capitaux propres. Plafonné à 7/10 si > 50% (peut être artificiel via rachats d'actions).",
          good: "Entre 15% et 50% : excellent", bad: "Négatif : perd de l'argent" },
        { label: "ROA",          value: pct(metrics.roa),         s: null,
          explain: "Retour sur actifs totaux. Moins sensible aux buybacks que le ROE.",
          good: "Au-dessus de 5% : efficace", bad: "Sous 1% : actifs mal utilisés" },
        { label: "Marge Brute",  value: pct(metrics.grossMargin), s: null,
          explain: "% du CA conservé après coûts de production.",
          good: "Au-dessus de 40% : sain", bad: "Sous 20% : coûts élevés" },
        { label: "Marge Opé.",   value: pct(metrics.opMargin),    s: scores.opMargin,
          explain: "Rentabilité avant impôts et intérêts.",
          good: "Au-dessus de 12%", bad: "Sous 5% : fragile" },
        { label: "Marge Nette",  value: pct(metrics.netMargin),   s: scores.netMargin,
          explain: "Ce qui reste pour les actionnaires après tout.",
          good: "Au-dessus de 10%", bad: "Négative : perd de l'argent" },
      ],
    },
    {
      icon: "🏦", label: "Santé Financière",
      note: "20% du score",
      cards: [
        { label: "Dette/Equity",     value: fmt(metrics.debtEq),      s: scores.debtEq,
          explain: "Niveau d'endettement vs capitaux propres.",
          good: "Sous 0.5 : peu endetté", bad: "Au-dessus de 1.5 : risque financier" },
        { label: "Current Ratio",    value: fmt(metrics.currentRatio), s: scores.currentRatio,
          explain: "Capacité à rembourser les dettes court terme.",
          good: "Au-dessus de 1.5 : confortable", bad: "Sous 1 : alerte liquidité" },
        { label: "Free Cash Flow",   value: `${currency} ${fmt(metrics.fcf)}`, s: null,
          explain: "Cash généré après investissements.",
          good: "Positif : génère du cash", bad: "Négatif : consomme du cash" },
        { label: "Actions en circ.", value: fmt(metrics.sharesOut, 0), s: null,
          explain: "Nombre total d'actions. Surveiller la dilution." },
      ],
    },
    {
      icon: "💵", label: "Dividende",
      note: "informatif",
      cards: [
        { label: "Rendement Div.", value: pct(metrics.divYield),    s: scores.divYield,
          explain: "Dividende annuel / prix.",
          good: "Entre 2% et 5% : attractif et durable", bad: "Au-dessus de 8% : souvent insoutenable" },
        { label: "Payout Ratio",   value: pct(metrics.payoutRatio), s: null,
          explain: "% des bénéfices distribués en dividendes.",
          good: "Entre 30% et 60% : équilibré", bad: "Au-dessus de 90% : peu de marge" },
      ],
    },
    {
      icon: "⚡", label: "Risque & Momentum",
      note: "10% du score",
      cards: [
        { label: "Bêta (1y)",     value: fmt(metrics.beta),      s: scores.beta,
          explain: "Volatilité vs le marché. 1 = suit le marché.",
          good: "Entre 0.7 et 1.3 : risque modéré", bad: "Au-dessus de 2 : très spéculatif" },
        { label: "Short Ratio",   value: fmt(metrics.shortRatio), s: null,
          explain: "Jours pour couvrir les positions baissières.",
          good: "Sous 3 jours : normal", bad: "Au-dessus de 10 : forte défiance" },
        { label: "Perf. 52 sem.", value: metrics.change52w != null ? (metrics.change52w * 100).toFixed(1) + "%" : "—",
          s: scores.perf52w,
          explain: "Performance sur les 12 derniers mois." },
      ],
    },
  ];

  return (
    <div style={{ animation: "fadeIn .4s ease" }}>
      {/* HEADER */}
      <div style={{ display: "flex", gap: 20, marginBottom: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, color: "#445", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
            {[exchange, sector, industry].filter(Boolean).join(" · ")}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#e6edf3", marginBottom: 8, lineHeight: 1.3 }}>
            {name}<TypeBadge type={quoteType}/>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
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

        {/* VERDICT + JAUGE */}
        {v && (
          <div style={{
            background: v.color + "12", border: `1px solid ${v.color}44`,
            borderRadius: 14, padding: "14px 22px", textAlign: "center", minWidth: 200,
          }}>
            <ScoreGauge score={globalScore}/>
            <div style={{ fontSize: 18, fontWeight: 900, color: v.color, marginTop: 4 }}>{v.emoji} {v.label}</div>
            <div style={{ fontSize: 11, color: "#8b949e", marginTop: 5, lineHeight: 1.5, marginBottom: 12 }}>{v.desc}</div>
            {/* Mini jauges par groupe */}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center" }}>
              <MiniGauge label="Valorisation" score={gValorisation} weight={0.40}/>
              <MiniGauge label="Rentabilité"  score={gRentabilite}  weight={0.30}/>
              <MiniGauge label="Santé"        score={gSante}        weight={0.20}/>
              <MiniGauge label="Risque"       score={gRisque}       weight={0.10}/>
            </div>
          </div>
        )}
      </div>

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
        <SituationalPanel metrics={metrics}/>
      </div>

      {/* SECTIONS */}
      {SECTIONS.map(sec => (
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

    addLog("⚡ Recherche parallèle Yahoo Finance + CoinGecko...");
    const [yfData, cgId] = await Promise.all([
      yfChart(upper, addLog),
      cgSearch(lower),
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
  }, [query]);

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
          <div style={{ maxWidth:760, display:"flex", gap:10 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key==="Enter" && doAnalyze()}
              placeholder="Ticker : AAPL · MC.PA · BTC · bitcoin · USD · EUR/GBP..."
              style={{
                flex:1, background:"#0d1420", border:"1px solid #2a3548",
                borderRadius:10, color:"#e6edf3", padding:"14px 18px",
                fontSize:15, fontWeight:600, outline:"none",
              }}
            />
            <button onClick={() => doAnalyze()} disabled={loading} style={{
              background: loading ? "#141e2e" : "#f0a500",
              color: loading ? "#445" : "#000",
              border:"none", borderRadius:10, padding:"14px 26px",
              fontSize:14, fontWeight:800,
              cursor: loading ? "not-allowed" : "pointer",
              whiteSpace:"nowrap",
            }}>
              {loading ? "…" : "Analyser →"}
            </button>
          </div>
          <div style={{ marginTop:8, fontSize:11, color:"#445" }}>
            💡 Actions : <span style={{ color:"#8b949e" }}>AAPL · MC.PA · AIR.PA · SAP.DE · 7203.T</span>
            {" "}· Crypto : <span style={{ color:"#8b949e" }}>BTC · ethereum · SOL</span>
            {" "}· Forex : <span style={{ color:"#8b949e" }}>USD · EUR/GBP</span>
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
