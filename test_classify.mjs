/**
 * Script de test — classification de marché sans UI
 * Fetch les données Yahoo via le proxy CF et applique la logique de classifyMarketContext
 */

const PROXY = "https://screener.etheryoh.workers.dev";

async function fetchChart(ticker, range = "5y", interval = "1wk") {
  const url = `${PROXY}?ticker=${encodeURIComponent(ticker)}&type=chart&range=${range}&interval=${interval}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${ticker}`);
  const d = await r.json();
  const res = d?.chart?.result?.[0];
  if (!res) throw new Error(`No result for ${ticker}`);
  const q = res.indicators?.quote?.[0] ?? {};
  return {
    closes:  q.close  ?? [],
    highs:   q.high   ?? [],
    lows:    q.low    ?? [],
    volumes: q.volume ?? [],
    timestamps: res.timestamp ?? [],
  };
}

async function fetchFundamentals(ticker) {
  const url = `${PROXY}?ticker=${encodeURIComponent(ticker)}&type=fundamentals`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = await r.json();
  const res = d?.quoteSummary?.result?.[0];
  if (!res) return null;
  const ks  = res.defaultKeyStatistics ?? {};
  const fin = res.financialData ?? {};
  const sum = res.summaryDetail ?? {};
  return {
    pe:          sum.trailingPE?.raw ?? null,
    pb:          ks.priceToBook?.raw ?? null,
    roe:         fin.returnOnEquity?.raw ?? null,
    netMargin:   fin.profitMargins?.raw ?? null,
    debtEq:      fin.debtToEquity?.raw != null ? fin.debtToEquity.raw / 100 : null,
    currentRatio: fin.currentRatio?.raw ?? null,
  };
}

// ── Fonctions de calcul (copiées de App.tsx) ───────────────────

function calcEMA(closes, period) {
  const c = closes.filter(v => v != null);
  if (c.length < period) return null;
  const k = 2 / (period + 1);
  let ema = c.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < c.length; i++) ema = c[i] * k + ema * (1 - k);
  return ema;
}

function calcADX(highs, lows, closes, period = 14) {
  const H = highs.filter(v => v != null);
  const L = lows.filter(v => v != null);
  const C = closes.filter(v => v != null);
  const N = Math.min(H.length, L.length, C.length);
  if (N < period * 2 + 1) return null;
  const dmPlus = [], dmMinus = [], tr = [];
  for (let i = 1; i < N; i++) {
    const upMove = H[i] - H[i-1], downMove = L[i-1] - L[i];
    dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[i-1]), Math.abs(L[i] - C[i-1])));
  }
  const smooth = (arr, p) => {
    let s = arr.slice(0, p).reduce((a, b) => a + b, 0);
    const out = [s];
    for (let i = p; i < arr.length; i++) { s = s - s / p + arr[i]; out.push(s); }
    return out;
  };
  const sTR = smooth(tr, period), sDMP = smooth(dmPlus, period), sDMM = smooth(dmMinus, period);
  const dx = sTR.map((t, i) => {
    if (t === 0) return 0;
    return Math.abs((sDMP[i] / t) - (sDMM[i] / t)) / ((sDMP[i] / t) + (sDMM[i] / t)) * 100;
  });
  if (dx.length < period) return null;
  return dx.slice(-period).reduce((a, b) => a + b) / period;
}

function detectTrendStructure(highs, lows, lookback = 20) {
  const H = highs.filter(v => v != null).slice(-lookback);
  const L = lows.filter(v => v != null).slice(-lookback);
  const N = Math.min(H.length, L.length);
  if (N < 4) return { type: "flat", swings: 0 };
  const swingHighs = [], swingLows = [];
  for (let i = 1; i < N - 1; i++) {
    if (H[i] > H[i-1] && H[i] > H[i+1]) swingHighs.push(H[i]);
    if (L[i] < L[i-1] && L[i] < L[i+1]) swingLows.push(L[i]);
  }
  const swings = swingHighs.length + swingLows.length;
  if (swings < 2) return { type: "flat", swings };
  let hh = 0, hl = 0, ll = 0, lh = 0;
  for (let i = 1; i < swingHighs.length; i++) { if (swingHighs[i] > swingHighs[i-1]) hh++; else lh++; }
  for (let i = 1; i < swingLows.length;  i++) { if (swingLows[i]  > swingLows[i-1])  hl++; else ll++; }
  const bullScore = hh + hl, bearScore = ll + lh;
  const type = bullScore > bearScore + 1 ? "bullish" :
               bearScore > bullScore + 1 ? "bearish" :
               bullScore + bearScore > 0 ? "mixed" : "flat";
  return { type, swings };
}

function classify(closes, highs, lows) {
  const adx = calcADX(highs, lows, closes);
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const struct = detectTrendStructure(highs, lows);
  const c = closes.filter(v => v != null);
  const ema50Prev = calcEMA(c.slice(0, c.length - 10), 50);
  const ema50Slope = (ema50 != null && ema50Prev != null && ema50Prev !== 0)
    ? ((ema50 - ema50Prev) / ema50Prev) * 100 : 0;
  const ltBull = ema50 != null && ema200 != null && ema50 > ema200 * 1.02;
  const ltBear = ema50 != null && ema200 != null && ema50 < ema200 * 0.98;
  const last = c.length > 0 ? c[c.length - 1] : null;
  const rsi = (() => {
    const s = c.slice(-15);
    if (s.length < 2) return null;
    let g = 0, l = 0;
    for (let i = 1; i < s.length; i++) { const d = s[i] - s[i-1]; if (d > 0) g += d; else l -= d; }
    const rs = l === 0 ? 100 : g / l;
    return 100 - 100 / (1 + rs);
  })();

  let type = "range", subtype, confidence = 50;

  // CHAOS
  const hArr = highs.filter(v => v != null);
  const lArr  = lows.filter(v => v != null);
  const cArr  = c;
  const trArr = [];
  for (let i = 1; i < Math.min(hArr.length, lArr.length, cArr.length); i++) {
    trArr.push(Math.max(hArr[i]-lArr[i], Math.abs(hArr[i]-cArr[i-1]), Math.abs(lArr[i]-cArr[i-1])));
  }
  const atr14    = trArr.length >= 14 ? trArr.slice(-14).reduce((a,b)=>a+b)/14 : null;
  const atrMean50= trArr.length >= 50 ? trArr.slice(-50).reduce((a,b)=>a+b)/50 : null;
  const isHighVol = atr14 != null && atrMean50 != null && atr14 > 3 * atrMean50;
  const emaFlat   = Math.abs(ema50Slope) < 0.3;

  if (isHighVol && emaFlat) {
    type = "chaos"; confidence = 70;
  } else if (
    adx != null && adx > 40 &&
    ema50 != null && ema200 != null && last != null &&
    ema50 > ema200 * 1.02 && last > ema50 &&
    (rsi == null || rsi > 65)
  ) {
    type = "exces"; confidence = 75;
    subtype = (ema50 != null && ema200 != null && ema50 > ema200 * 1.02) ? "exces_final" : undefined;
  } else if (
    adx != null && adx > 25 &&
    Math.abs(ema50Slope) > 0.8 &&
    (struct.type === "bullish" || struct.type === "bearish" ||
     (ltBull && ema50Slope > 2.0) || (ltBear && ema50Slope < -2.0))
  ) {
    type = "tendance";
    subtype = adx > 35 ? "suivi" : "accumulation";
    confidence = adx > 35 ? Math.min(70 + Math.round(adx - 35), 88) : 62;
  } else if (
    (struct.type === "bullish" || struct.type === "bearish" || ltBull || ltBear) &&
    adx != null &&
    (adx >= 15 || (adx >= 10 && (struct.type === "bullish" || struct.type === "bearish"))) &&
    Math.abs(ema50Slope) >= 0.15
  ) {
    type = "tendance"; subtype = "essoufflement";
    confidence = adx >= 20 ? 62 : 52;
  } else {
    type = "range"; confidence = adx != null && adx < 15 ? 80 : 62;
    subtype = (struct.swings >= 3 && (struct.type === "mixed" || struct.type === "flat")) ? "3br" : "neuneu";
  }

  return {
    type, subtype, confidence,
    adx: adx?.toFixed(1),
    ema50Slope: ema50Slope.toFixed(2),
    struct: struct.type,
    ltBull, ltBear,
    rsi: rsi?.toFixed(1),
    ema50: ema50?.toFixed(2),
    ema200: ema200?.toFixed(2),
    last: last?.toFixed(2),
  };
}

// ── Test principal ────────────────────────────────────────────

const TICKERS = [
  { sym: "AAPL",   label: "Apple — tech US mature, ATH" },
  { sym: "NVDA",   label: "Nvidia — bull run IA" },
  { sym: "BNP.PA", label: "BNP Paribas — bancaire FR" },
  { sym: "TTE.PA", label: "TotalEnergies — énergie FR" },
  { sym: "ASML",   label: "ASML — semi EU, correction" },
  { sym: "MC.PA",  label: "LVMH — luxe, consolidation" },
  { sym: "MSFT",   label: "Microsoft — tech stable" },
  { sym: "SAN.PA", label: "Sanofi — pharma défensif" },
];

const SEP = "─".repeat(70);

for (const { sym, label } of TICKERS) {
  try {
    const { closes, highs, lows } = await fetchChart(sym);
    const fund = await fetchFundamentals(sym);
    const ctx = classify(closes, highs, lows);

    console.log(`\n${SEP}`);
    console.log(`📊 ${sym.padEnd(8)} ${label}`);
    console.log(`   Contexte : ${ctx.type.toUpperCase()}${ctx.subtype ? ` (${ctx.subtype})` : ""} — confiance ${ctx.confidence}%`);
    console.log(`   ADX=${ctx.adx}  EMA50slope=${ctx.ema50Slope}%  struct=${ctx.struct}  ltBull=${ctx.ltBull}  ltBear=${ctx.ltBear}`);
    console.log(`   EMA50=${ctx.ema50}  EMA200=${ctx.ema200}  Last=${ctx.last}  RSI≈${ctx.rsi}`);
    if (fund) {
      console.log(`   PE=${fund.pe?.toFixed(1) ?? "—"}  PB=${fund.pb?.toFixed(1) ?? "—"}  ROE=${fund.roe != null ? (fund.roe*100).toFixed(1)+"%" : "—"}  NetMargin=${fund.netMargin != null ? (fund.netMargin*100).toFixed(1)+"%" : "—"}  D/E=${fund.debtEq?.toFixed(2) ?? "—"}`);
    }
  } catch (e) {
    console.log(`\n⚠️  ${sym}: ERREUR — ${e.message}`);
  }
}

console.log(`\n${SEP}`);
