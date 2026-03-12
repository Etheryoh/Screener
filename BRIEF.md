# BRIEF — Refonte Stock Screener (src/App.tsx)
> À lire en entier avant toute modification. Ce fichier est la source de vérité.

---

## 1. CONTEXTE DU PROJET

**Projet** : Stock Screener — outil d'analyse financière pédagogique  
**Stack** : React + TypeScript, déployé sur Vercel  
**Repo** : github.com/Etheryoh/Screener  
**Proxy données** : `https://screener.etheryoh.workers.dev` (Yahoo Finance)  
**Langue UI** : Français  
**Principe pédagogique** : double niveau de lecture — langage courant + termes techniques, tooltips `?` éducatifs sur chaque signal  

---

## 2. CHANGEMENT DE PHILOSOPHIE (PRIORITÉ ABSOLUE)

### Avant (à remplacer)
L'analyse fondamentale était centrale. Le score global était un score fondamental pondéré (PE, ROE, dette...). La technique était un complément affiché en bas.

### Après (nouvelle logique)
**La technique est le cœur. Les fondamentaux confirment ou invalident.**

Ordre de lecture :
1. **Quel est le contexte de marché ?** → classificateur technique (Range / Tendance / Excès / Chaos)
2. **Quelle est la maturité / le signal ?** → patterns et momentum
3. **Les fondamentaux confirment-ils ?** → bonus/malus sur le verdict final

Le score global devient un **score technique** avec modificateurs fondamentaux, pas l'inverse.

---

## 3. MÉTHODE DE RÉFÉRENCE — Pro-Indicators (Guide de Stratégie)

### 3.1 Les 4 contextes de marché

Chaque titre analysé doit être classifié dans l'un de ces 4 contextes :

#### 🔵 RANGE
- **Difficulté** : Débutant
- **Ratio R/R** : 1:1 à 1:2
- **Caractéristiques** : Rejet des contextes, pas de range UT+1 (mais OK si range UT+2)
- **Sous-types** :
  - `3ème Borne (3BR)` : range précédé d'une tendance → pattern principale
  - `Range Neuneu` : pas d'historique ou range mature (4+ bornes) → placer fibos sur toute la hauteur du range
- **Pattern 3BR** : contexte renversé + triangle de confirmation + pas de débordement du sommet (sinon = 3BR squeezée)
  - Variante `3BR Neutre` : moins risquée, à privilégier par défaut
  - Variante `3BR Tendancielle` : zone spéculative légèrement différente
  - Variante `3BR Squeezée` : le marché ignore la zone de 3BR et la traverse → signe de tendance sur UT supérieure, noter la zone, ne pas trader
  - Variante `3BR en Retard` : à vérifier en premier, détectable seulement après coup
- **Zone spéculative 3BR** :
  1. Prix proche du contexte
  2. Prix dans la zone Fibo 14–23%
  3. Break sinewave optionnel
  4. Signal momentum optionnel
- **Gestion du risque 3BR** :
  - SL : au-dessus du plus haut du range, au moins égal à la moitié du canal de tendance
  - Risque max : **2%**
  - Validation : retour au contexte opposé ou entrée dans la dumb-zone → déplacer SL au sommet récent
  - Objectif : viser le bas de la dumb zone (TP partiel), jamais au-delà de la zone Fibo opposée

- **Range Neuneu** sous-types :
  - `Borne Neuneu` : jouer les rebonds sur les bornes du range avec fibos
  - `Repli Neuneu` : repli sur les fibos internes du range

#### 📈 TENDANCE
- **Difficulté** : Intermédiaire
- **Ratio R/R** : 1:2 à 1:5
- **Prérequis** : précédé d'un range mature, pas de tendance UT+1
- **En tendance** : activer le Trend Sinewave
- **Maturité définie par 3 critères** :
  1. **Le prix** : comportement des canaux tendance et contexte
  2. **La moyenne** : position par rapport au contexte
  3. **Les cycles** : changement de rythme
- **Les 6 phases séquentielles de la Tendance Primaire** :
  1. `Accumulation` : range mature sur UT contexte, retracement 38–50% (max 61%), prix > contexte acheteur, signal momentum
  2. `Breakout` : débordement du contexte, cassure de cycle Trend Sinewave, cassure de l'accumulation, momentum > 80, break sinewave recommandé
  3. `Suivi de Tendance` : repli à la moyenne (si pas de 3BR visible) ou cassure de 3BR (si 3BR présente), pas plus de 2 suivis dans une tendance
  4. `Pullback` : clôtures sous 50% canal de contexte, range mature UT tendance, retracement 23–38% (max 50), signal de tendance momentum
  5. `Divergence` : débordement du contexte, prix proche du canal de tendance, 2 suivis de tendance visibles, Trend Sinewave > 80, break sinewave recommandé, signal momentum recommandé
  6. `Excès Final` : prix > canal de contexte, prix > canal UT+1, prix > sommet précédent, momentum > 80, boîtes contexte résistant disjointes
- **Gestion Suivi de Tendance** :
  - Conditions pour activer : breakout validé et confirmé, moyenne haussière, éviter si alerte volatilité récente, éviter si squeeze sur les prix, pas plus de 2 suivis dans une tendance
  - Si pas de 3BR visible → trade le repli à la moyenne
  - Si 3BR présente → attendre la cassure de 3BR
  - Si 3BR squeezée → appliquer repli sur 3BR squeezée
- **Gestion Accumulation** :
  - SL : stop de la taille du canal de tendance, au moins sous le contexte
  - Risque max : 2%
  - Validation : retour au canal de tendance opposé → déplacer SL sous le creux précédent
  - Confirmation : atteint le canal de contexte opposé ou nouveau plus haut → déplacer SL à breakeven
- **Gestion Breakout** :
  - SL : sous le creux précédent ou sous l'accumulation
  - Validation : report du range d'accumulation → NE PAS déplacer le SL
  - Confirmation : report du range de contexte → SL à breakeven uniquement si on veut réduire le risque
- **Gestion Pullback** :
  - SL : stop de la taille du canal de tendance, au moins sous le contexte
  - Validation : retour au canal de tendance opposé → déplacer SL sous le creux précédent
  - Confirmation : atteint canal contexte opposé ou nouveau plus haut → SL à breakeven, préparer TP excès final
  - Objectif : éviter le biais "laisser filer au cas où" — les tendances ne sont pas éternelles
- **Actions selon expérience (fin de tendance / divergence)** :
  - Intermédiaire : récupérer tous les profits, repasser en mode range
  - Expérimenté : récupérer profits suivi de tendance + vendre la divergence (position vendeuse au niveau 3BR du pullback)
  - Hardcore : récupérer profits + vendre la divergence + vérifier tendance multi-TF, tenter reverse si pas de MTF

#### 🚀 EXCÈS
- **Difficulté** : Expert
- **Ratio R/R** : 1:10 à 1:20
- **Caractéristiques** : fondamental haussier, contextes disjoints, cycles inexistants, momentum < 0 acheté
- **Distinction Excès vs Bulle** :
  - Excès = fondamental qui supporte la hausse (réduction supply, anticipations), structure qui peut valider une tendance multi-timeframe → tradable
  - Bulle = aucune justification fondamentale, pas de structure multi-timeframe → très difficile à trader, attention psycho
- **Zone spéculative Excès** (après 2 patterns de suivi UT-2) :
  1. Après 2 patterns de suivi UT-2
  2. Débordement du contexte
  3. Au-dessus du canal de tendance
  4. Break sinewave (target)
  5. Creux descendant sur momentum
  6. Signal momentum optionnel
- **Gestion risque Excès** :
  - SL : sous le niveau Fibonacci suivant, au moins sous le contexte UT supérieure
  - Risque max : 2%
  - Validation : rejoindre le contexte opposé ou casser la 3BR du range mature → déplacer SL sous le plus bas récent
  - Confirmation : prix quitte la zone de range et atteint le contexte UT supérieure → SL à breakeven
  - Objectif : conserver jusqu'à niveau d'objectif ou apparition pattern d'exit. Pattern max 2 fois. Ne pas laisser traîner les profits après le 2ème suivi.
- **Take Profit Excès** : prendre 100% sur le suivi, 50% sur le reste
- **Psychologie Excès** : sentiment de marché à son paroxysme → ne pas se laisser influencer, pas de trade en reverse, juste un TP

#### ❌ CHAOS
- **Caractéristiques** : contextes irréguliers, moyenne plate, momentum bruyant
- **Action** : **PARTEZ** — ne pas trader, chercher un autre actif

### 3.2 Structures Alternatives

Causées par un déséquilibre dans le supply :
- **Vague 1 Étendue (V1E)** : supply très faible → rebond violent en "V Bottom", départ prématuré sans accumulation. Difficile à anticiper, on la constate en cours de route. Pattern : reverse V Bottom → 1er pullback + excès final classique → 2ème pullback en overlap → 2ème excès final
- **Vague 5 Étendue (V5E)** : supply important → structure en V5 étendue. 2 breakouts ratés, puis excès final en "V Top". Sortie en paliers recommandée.

### 3.3 Niveaux Fibonacci utilisés
- **Zone d'achat principale** : 14,6% – 23,6% (dumb zone / zone de suivi de tendance)
- **Zone de pullback** : 23% – 38%
- **Zone d'accumulation** : 38% – 50% (max 61%)
- **Retracement profond** : ≥ 61% Fibo
- **Retracement extrême** : ≥ 76% Fibo
- **Objectif TP** : jamais au-delà de la zone Fibo opposée

### 3.4 Règle universelle de gestion du risque
- **Risque max par trade : 2%**
- Séquence systématique : Entry → Validation (SL déplacé) → Confirmation (SL à breakeven) → Objectif
- Ne jamais déplacer le SL en sens défavorable
- Ne jamais remonter le SL trop vite en tendance

---

## 4. TRADUCTION EN SIGNAUX CALCULABLES (OHLCV Yahoo Finance)

Les indicateurs Pro-Indicators (Trend Sinewave, boîtes contexte, 3BR) ne sont pas directement calculables depuis Yahoo Finance. Voici les **proxies** à implémenter :

### 4.1 Classificateur de contexte (NOUVEAU — prioritaire)

```typescript
interface MarketContext {
  type: "range" | "tendance" | "exces" | "chaos";
  subtype?: string;           // "3br" | "neuneu" | "accumulation" | "breakout" | "suivi" | "pullback" | "divergence" | "exces_final" | "bulle"
  maturity?: "jeune" | "en_developpement" | "mature" | "divergence";
  confidence: number;         // 0-100
  fundamentalConfirm: "confirms" | "neutral" | "warns" | null;
}
```

**Algorithme de classification** (à calculer sur les closes/volumes/OHLCV disponibles) :

```
1. Calculer ADX(14) proxy via true range et directional movement
2. Calculer ATR(14) normalisé
3. Calculer pente EMA50 et EMA200
4. Calculer RSI(14) et MACD
5. Calculer volatilité des ranges (high-low sur N périodes)

CHAOS si :
  - ATR > 3x sa moyenne sur 50 périodes (volatilité anormale)
  - RSI oscille entre 30 et 70 sans tendance claire
  - EMA50 pente ≈ 0 ET plages de prix très larges et irrégulières

RANGE si :
  - ADX proxy < 20 (pas de tendance directionnelle)
  - Prix oscille entre deux niveaux détectables (bornes)
  - EMA50 plate (pente < seuil)
  - Pas de HH/HL ou LL/LH structurés récents

TENDANCE si :
  - ADX proxy > 25
  - EMA50 directionnelle (pente significative)
  - Structure de HH+HL (haussière) ou LL+LH (baissière) sur les 20 dernières barres
  - Prix au-dessus EMA50 (haussière) ou en dessous (baissière)

EXCÈS si :
  - ADX proxy > 40 (tendance très forte)
  - Prix > EMA50 > EMA200 avec écarts croissants
  - RSI > 70 ou < 30 en tendance
  - Volume anormalement élevé (ratio > 1.5x moyenne)
  - Contextes (boîtes EMA) disjoints proxy : EMA20 >> EMA50 >> EMA200
```

**Maturité de tendance** (proxy Trend Sinewave) :
```
JEUNE     : ADX < 30, première cassure de EMA50, RSI entre 50-65
EN_DEVEL  : ADX 30-40, 2ème impulsion, RSI 60-75
MATURE    : ADX > 40, RSI > 70, prix très au-dessus EMA200, MACD divergence possible
DIVERGENCE: RSI fait un creux plus haut alors que prix fait creux plus bas (ou inverse)
            → signal de fin de tendance imminente
```

### 4.2 Signaux techniques à enrichir

Remplacer l'actuel `TechnicalPanel` par un panneau structuré en deux parties :

**Partie A — Contexte (nouveau, affiché en premier)**
- Badge contexte coloré (Range / Tendance / Excès / Chaos)
- Sous-type si identifiable
- Maturité si en tendance
- Confirmation fondamentale

**Partie B — Signaux détaillés (actuel, enrichi)**
- RSI avec zones et interprétation (déjà présent, garder)
- EMA 50/200 (déjà présent, garder)
- MACD (déjà présent, garder)
- Volume anomalie (déjà présent, garder)
- **NOUVEAU** : ADX proxy (force de la tendance)
- **NOUVEAU** : Structure HH/HL (détection automatique)
- **NOUVEAU** : Divergence RSI/Prix (signe de maturité/retournement)

### 4.3 Fonctions à implémenter

```typescript
// ADX proxy (simplifié — True Range uniquement, pas DI+ DI-)
function calcADX(highs: number[], lows: number[], closes: number[], period = 14): number | null

// Détection structure HH/HL ou LL/LH
function detectTrendStructure(highs: number[], lows: number[], lookback = 20): 
  { type: "bullish" | "bearish" | "mixed" | "flat"; swings: number }

// Divergence RSI/Prix
function detectDivergence(closes: number[], period = 14, lookback = 30): 
  { type: "bullish" | "bearish" | null; strength: "weak" | "strong" }

// Classificateur principal
function classifyMarketContext(
  closes: number[], highs: number[], lows: number[], volumes: number[]
): MarketContext

// Maturité de tendance (proxy Trend Sinewave)
function calcTrendMaturity(
  closes: number[], highs: number[], lows: number[]
): "jeune" | "en_developpement" | "mature" | "divergence" | null
```

---

## 5. NOUVEAU SCORE GLOBAL

### Ancienne logique (à supprimer)
Score pondéré fondamental : Valorisation 40% + Rentabilité 30% + Santé 20% + Risque 10%

### Nouvelle logique

```
Score technique (base 0-10) :
  - Contexte favorable (Tendance jeune ou Range 3BR) : 7-9
  - Contexte neutre (Range Neuneu, Tendance mature) : 4-6
  - Contexte défavorable (Excès sans fondamental, Tendance divergence) : 2-4
  - Chaos : 1 (ne pas analyser)

Modificateurs fondamentaux (+/- sur le score technique) :
  + Excès avec fondamental haussier (ROE > 15%, FCF positif) : +1.0
  + Tendance avec bilan solide (dette faible, marges positives) : +0.5
  + Value décotée (PB < 1, bénéficiaire) : +0.5
  - Excès sans fondamental identifiable : -1.5 → label "Bulle spéculative"
  - Santé financière critique (current ratio < 0.8) : -1.0
  - Entreprise déficitaire en tendance baissière : -1.0

Score final = clamp(score_technique + modificateurs, 1, 10)
```

### Verdicts mis à jour
```
≥ 7.5 : "Opportunité Technique" 🚀 — signal fort, fondamentaux confirment
5.5-7.5 : "Signal Intéressant" ⚖️ — surveiller, contexte en construction
3.5-5.5 : "Prudence" ⚠️ — signaux mitigés ou contexte défavorable
< 3.5 : "Risque Élevé" 🔴 — chaos ou excès non fondamental (bulle)
```

---

## 6. STRUCTURE UI CIBLE

### Ordre d'affichage dans StockView

```
1. HEADER (nom, prix, variation) — inchangé

2. CONTEXTE DE MARCHÉ [NOUVEAU — prioritaire]
   ┌─────────────────────────────────────────┐
   │ 🔵 RANGE  •  3ème Borne  •  Jeune      │
   │ ████████░░  Confiance 75%              │
   │ ✅ Fondamentaux confirment             │
   │ [▼ Voir l'analyse détaillée]           │
   └─────────────────────────────────────────┘

3. GRAPHIQUE INTERACTIF — inchangé

4. ANALYSE TECHNIQUE DÉTAILLÉE [enrichie]
   - RSI, EMA, MACD, Volume (existants)
   - ADX, Structure HH/HL, Divergence (nouveaux)

5. CONTEXTE D'INVESTISSEMENT [enrichi]
   - Profil situationnel (existant)
   - Maintenant enrichi avec le contexte technique

6. FONDAMENTAUX [déplacés en bas]
   - Sections Valorisation, Rentabilité, Santé, Dividende, Risque
   - Score fondamental affiché séparément du score technique
   - Rôle : confirmer ou infirmer, pas décider

7. DISCLAIMER — inchangé
```

### Panneau Contexte de Marché (nouveau composant)

```tsx
// Couleurs par contexte
const CONTEXT_COLORS = {
  range:    { bg: "#1a2a4a", border: "#4a90d9", badge: "#4a90d9", emoji: "🔵" },
  tendance: { bg: "#0a2e1a", border: "#22c55e", badge: "#22c55e", emoji: "📈" },
  exces:    { bg: "#2d1b00", border: "#f59e0b", badge: "#f59e0b", emoji: "🚀" },
  chaos:    { bg: "#2a0a0a", border: "#ef4444", badge: "#ef4444", emoji: "❌" },
}

// Labels sous-types
const SUBTYPE_LABELS = {
  "3br":         "3ème Borne",
  "neuneu":      "Range Neuneu",
  "accumulation":"Accumulation",
  "breakout":    "Breakout",
  "suivi":       "Suivi de Tendance",
  "pullback":    "Pullback",
  "divergence":  "Divergence",
  "exces_final": "Excès Final",
  "bulle":       "⚠️ Bulle Spéculative",
}

// Labels maturité
const MATURITY_LABELS = {
  "jeune":          { label: "Tendance Jeune",   color: "#22c55e" },
  "en_developpement":{ label: "En Développement", color: "#4ade80" },
  "mature":         { label: "Tendance Mature",   color: "#f59e0b" },
  "divergence":     { label: "Divergence ⚠️",    color: "#ef4444" },
}
```

### Tooltips éducatifs à créer pour les nouveaux concepts

Chaque nouveau signal doit avoir un tooltip `?` avec la structure :
- **C'est quoi ?** — définition simple
- **Comment le lire ?** — règles d'interprétation
- **Dans ce cas précis** — valeurs actuelles contextualisées

Exemples à écrire :

**ADX** :
- Concept : "L'ADX mesure la force d'une tendance, pas sa direction. Il va de 0 à 100."
- HowToRead : "Sous 20 : pas de tendance (range). Entre 25-40 : tendance modérée. Au-dessus de 40 : tendance forte ou excès."
- Example : dynamique selon valeur calculée

**Structure HH/HL** :
- Concept : "En tendance haussière, le prix fait des Hauts de Plus en Plus Hauts (HH) et des Bas de Plus en Plus Hauts (HL). C'est la définition technique d'une tendance."
- HowToRead : "HH+HL = tendance haussière confirmée. LL+LH = tendance baissière. Mélange = range ou transition."

**Divergence RSI** :
- Concept : "Une divergence se produit quand le prix et le RSI ne sont pas d'accord. Le prix monte mais le RSI fait des sommets plus bas = signal de retournement probable."
- HowToRead : "Divergence baissière (prix HH, RSI LH) : tendance s'essouffle. Divergence haussière (prix LL, RSI HL) : baisse perd de la force."

---

## 7. RÈGLES DE DÉVELOPPEMENT

### Ce qu'il faut garder intact
- Toutes les fonctions réseau (yfChart, yfFundamentals, cgSearch, etc.)
- Le composant InteractiveChart (graphique base 100)
- Les fonctions RSI, EMA, MACD, VolumeAnomaly existantes
- L'interface TechSignal avec le champ `edu`
- Le composant EduTooltip
- Le panneau SituationalPanel (à enrichir, pas remplacer)
- Le disclaimer légal footer
- Le layout responsive avec `.app-inner` et `clamp()`

### Ce qu'il faut modifier
- `buildMetrics()` : garder tous les calculs, mais **ne plus en faire le score principal**
- `StockView` : réorganiser l'ordre d'affichage (technique d'abord)
- Score global : basculer sur la nouvelle logique technique + modificateurs fondamentaux
- Verdicts : mettre à jour labels et descriptions

### Ce qu'il faut ajouter
- `calcADX()` — nouveau
- `detectTrendStructure()` — nouveau
- `detectDivergence()` — nouveau
- `classifyMarketContext()` — nouveau, utilise closes + highs + lows + volumes
- `calcTrendMaturity()` — nouveau
- `MarketContextPanel` — nouveau composant, affiché EN PREMIER dans StockView
- Champs `highs`, `lows` dans le chartData (déjà récupérés, à utiliser)

### TypeScript : règles strictes
- Toute nouvelle interface doit avoir **tous ses champs déclarés**
- Pas de `any` sur les nouvelles interfaces
- Les champs optionnels doivent être explicitement marqués `?`
- Tester le build Vercel : `npm run build` doit passer sans erreur

---

## 8. DONNÉES DISPONIBLES DEPUIS LE PROXY

Le proxy retourne déjà `opens`, `highs`, `lows`, `closes`, `volumes`, `timestamps`.

Dans `StockView`, le `chartData` contient :
```typescript
{
  closes:     (number | null)[];
  timestamps: number[];
  opens:      (number | null)[];
  highs:      (number | null)[];   // ← DISPONIBLES, pas encore utilisés
  lows:       (number | null)[];   // ← DISPONIBLES, pas encore utilisés
  volumes:    (number | null)[];
}
```

**Les fonctions ADX, structure HH/HL et divergence doivent utiliser `highs` et `lows`.**

---

## 9. ORDRE D'IMPLÉMENTATION RECOMMANDÉ

1. **Ajouter les 4 fonctions de calcul** : `calcADX`, `detectTrendStructure`, `detectDivergence`, `classifyMarketContext`, `calcTrendMaturity`
2. **Créer le composant `MarketContextPanel`** avec les styles et tooltips
3. **Modifier `StockView`** pour afficher `MarketContextPanel` en premier
4. **Modifier la logique de score global** dans `buildMetrics` ou créer `computeFinalScore(metrics, context)`
5. **Enrichir `computeTechSignals`** avec ADX, structure, divergence
6. **Tester le build** : `npm run build`
7. **Déployer** : `git push` → Vercel CI

---

## 10. TESTS À EFFECTUER APRÈS IMPLÉMENTATION

- AAPL → doit classifier en Tendance ou Excès (marché haussier fort)
- MC.PA → doit classifier en Tendance ou Range selon la période
- BTC → doit classifier en Excès ou Range (volatilité élevée)
- Un titre en baisse forte (ex: un penny stock) → doit classifier en Chaos ou Tendance baissière
- Vérifier que le build TypeScript passe sans erreur
- Vérifier que les tooltips `?` s'affichent correctement sur tous les nouveaux signaux
