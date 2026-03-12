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

Chaque titre analysé doit être classifié dans l'un de ces 4 contextes. Ordre de difficulté affiché dans les slides : Range (débutants) → Tendance (intermédiaire) → Excès (expert) → Chaos (hors-jeu).

#### 🔵 RANGE
- **Difficulté** : Débutant
- **Ratio R/R** : 1:1 à 1:2
- **Conditions de validation du timeframe** :
  - Rejet des contextes
  - Pas de range UT+1 (**mais OK si range UT+2**)
- **Question clé** : Le range est-il précédé d'une tendance ?
  - **OUI** → structure `3ème Borne (3BR)`
  - **NON** (pas d'historique, ou range mature 4+ bornes) → structure `Range Neuneu`

---

##### 3.1.1 Structure 3ème Borne (3BR)

**Conditions d'activation de la 3BR** (4 critères obligatoires) :
1. Précédé au sein d'une tendance
2. Contexte renversé
3. Triangle de confirmation
4. Pas de débordement du sommet (sinon = 3BR Squeezée)

**Règles de validation supplémentaires** (slides 3) :
- Pas de SQUEEZE sur le prix
- Pas de SQUEEZE sur le prix UT+1
- Si le range produit un SQUEEZE (tcard de résistance grise) → range considéré **mature**, arrêter de trader sur cette UT
- Si le range se forme juste après un SQUEEZE sur l'UT supérieure → éviter de trader cette 3BR
- Si la machine **retourne de la 3BR** (double top/bottom) → éviter également

**Schéma visuel de déclenchement — 3 étapes séquentielles** :
```
Étape 1 : Le prix fait un creux et tient plusieurs clôtures LARGEMENT SOUS
          la zone d'achat Fibo (14,6%–23,6%). Le creux rebondit fortement
          puis fait un nouveau plus haut.

Étape 2 : Le prix rebondit et ATTEINT LA DUMB ZONE (14,6%–23,6%), y tient
          plusieurs clôtures SANS SORTIR DU HAUT de la zone.

Étape 3 : Le prix REBAISSE et revient chercher la zone d'achat Fibonacci.
          → C'est ici qu'on applique les règles de déclenchement.
```

**Règles de déclenchement** (zone spéculative 3BR standard) :
1. Prix proche du contexte
2. Prix dans la zone Fibo **14–23%** (dumb zone)
3. Break sinewave optionnel
4. Signal momentum optionnel

**À défaut, privilégier la 3BR NEUTRE** — moins risquée que la variante tendancielle.

---

##### Variante 3BR NEUTRE
Zone spéculative — entrée sur retracement profond :
1. Clôture au dessus du contexte
2. **Retracement >= 76% Fibo** ← *[ajout visuel slides]*
3. Triangle de confirmation
4. Signal momentum (tous types)
5. Break sinewave optionnel

**Gestion du risque 3BR Neutre** :
- **SL** : taille du canal de tendance à partir de la clôture précédente la plus haute
- **Risque max** : 2%
- **Validation** : rejoindre le canal de tendance opposé → déplacer SL OU TP partiel (if PDF)
- **Confirmation** : le prix clôture sous les 50% de contexte → déplacer SL à breakeven + TP partiel
- **Objectif** : récupérer les profits dès que le prix atteint le contexte opposé ou retrace plus de 76% de la distance totale du range. Ce trade ne rapporte jamais beaucoup mais aide à structurer la psycho dans les ranges.

---

##### Variante 3BR TENDANCIELLE
Zone spéculative — entrée tendancielle :
1. La 3BR a clôturé sous le contexte
2. Retournement dans le contexte
3. **Retracement >= 61% Fibo** ← *[ajout visuel slides]*
4. Triangle de confirmation
5. Signal de tendance momentum
6. Break sinewave optionnel

**Gestion du risque 3BR Tendancielle** :
- **SL** : taille du canal de tendance à partir de la clôture précédente la plus haute
- **Risque max** : 2%
- **Validation** : rejoindre le canal de tendance opposé OU clôture au dessus de 50% contexte → déplacer SL OU TP partiel
- **Confirmation** : le prix atteint le contexte opposé ou déborde le point bas précédent (3ème borne) → déplacer SL à breakeven + TP partiel
- **Objectif** : récupérer les profits dès que le prix se trouve sous le point bas précédent, sous les contextes acheteurs, et que le momentum donne un signal dans le triangle de confirmation. Utiliser un stop suiveur possible à partir du débordement du point bas précédent.

---

##### Variante 3BR SQUEEZÉE
Se produit quand le marché **ignore totalement** la zone de 3BR et la traverse comme si de rien n'était. Courant dans les contextes de tendance excessive ou multi-timeframe.

**Zone spéculative (pour les experts maîtrisant le contexte)** :
1. Débordement du contexte UT+1
2. Débordement du sommet précédent
3. Boîtes contexte résistant **disjointes**
4. Momentum > 80
5. Target de break sinewave optionnel

**Psychologie** :
- La plupart du temps, aucun signal ne se produira dans la zone → ne pas paniquer, **noter la zone** en tant que "3BR Squeezée"
- Si un signal s'est produit dans la zone → invalidation par SL (perte sèche max 2%). C'est le signe d'une tendance UT+2. Prendre du recul et noter la zone squeezée.
- Si maîtrisé (niveau expert) → signe qu'il faut aller UT+2
- **⚠ N'OUBLIEZ PAS DE NOTER LA ZONE !**

---

##### Variante 3BR EN RETARD
Détectable seulement après coup, à vérifier en premier. Utiliser des alertes.

**Schéma A/B/C** :
```
A : Le prix CASSE LE SUPPORT du canal de tendance et revient chercher
    le contexte acheteur, MAIS ce dernier ne se retourne pas.

B : Le prix REBONDIT SANS FAIRE DE NOUVEAU PLUS HAUT et retrace au moins
    jusqu'au canal de tendance RÉSISTANT.

C : Puis le prix REBAISSE À NOUVEAU, casse le point bas précédent (3BR)
    et doit également RENVERSER LE CONTEXTE.
    → Replacer la 3BR à cet endroit (commande "JE REPLACE MA 3BR").
```

**Cause** : L'indicateur Pro-Indicators a des fonctions de sécurité pour empêcher le retournement des contextes lors de tendances très fortes (protège 9 fois sur 10, mais induit parfois en erreur). Note : cette 3BR en retard à la baisse, dans une forte tendance haussière, n'aurait probablement pas été profitable.

---

##### Structure RANGE NEUNEU

Stratégie à privilégier quand :
- **Manque d'historique** (impossible de savoir si le prix va sortir de la structure)
- **Range mature** (4 bornes et plus) → seule structure applicable
- **Forex à partir de l'UT Hebdo** sur paires majeures (application par défaut)
- Certaines commodités

Attention à l'incertitude : placer les fibos sur toute la hauteur du range.

**Sous-types RANGE NEUNEU** :

**`Borne Neuneu`** — jouer les rebonds sur les bornes :

Zone spéculative :
1. Le prix est **au delà des contextes**
2. Le prix est **au delà du Fibo 76%**
3. Break sinewave optionnel
4. Signal momentum optionnel

Gestion du risque :
- **SL** : au dessus du plus haut du range ET au moins égal à la moitié de la taille du canal de tendance / Risque max 2%
- **Validation** : retour au canal de tendance opposé (parfois la confirmation arrive avant) → déplacer SL au sommet récent
- **Confirmation** : le prix revient dans le milieu du range (50% contexte, 50% Fibo ou moyenne) → TP 50%, NE PAS déplacer le SL
- **Objectif** : sortir ABSOLUMENT tous les profits restants dès que le prix atteint le contexte opposé ou la zone Fibo 76% opposée.

**`Repli Neuneu`** — repli sur les fibos internes du range

Règles de déclenchement (mêmes principes que la 3BR standard) :
1. Prix proche du contexte
2. Prix dans la zone Fibo **14–23%**
3. Break sinewave optionnel
4. Signal momentum optionnel

Gestion du risque :
- **SL** : au dessus du plus haut du range ET au moins égal à la moitié de la taille du canal de tendance / Risque max 2%
- **Validation** : retour au contexte opposé ou entrée dans la dumb-zone → déplacer SL au sommet récent
- **Objectif** : viser le bas de la dumb zone pour un TP partiel. **Jamais** au delà de la zone Fibo opposée.

---

#### 📈 TENDANCE
- **Difficulté** : Intermédiaire
- **Ratio R/R** : 1:2 à 1:5
- **Prérequis** : précédé d'un range mature, **pas de tendance UT+1**
- **En tendance** : activer le Trend Sinewave
- **Si la réponse au prérequis est NON** → vous avez à faire à un **FLUX** (pas de structure primaire, juste des impulsions). Dans ce cas : naviguer différemment, être plus attentif, ou **CHANGER DE TIMEFRAME**. ← *[notion absente du BRIEF initial]*

**Maturité définie par 3 critères** (attention aux dissonances entre ces 3 critères) :
1. **Le prix** : comportement des canaux tendance et contexte
2. **La moyenne** : position par rapport au contexte
3. **Les cycles** : changement de rythme → connaître ses faiblesses

**Les 6 phases séquentielles de la Tendance Primaire** :

##### Phase 1 — Accumulation
Zone spéculative :
1. Range mature sur l'UT contexte
2. **Range mature du canal de tendance** ← *[précision visuelle]*
3. Retracement entre 38–50% (max 61)
4. Prix > au contexte acheteur
5. Signal de tendance momentum

Gestion du risque :
- **SL** : sous le creux précédent ET au moins égal à la taille du canal de tendance / Risque max 2%
- **Validation** : débordement du contexte + cassure de cycle (breakout) → déplacer SL sous le range d'accumulation → déplacer SL à breakeven uniquement si on trade le breakout en plus
- **Objectif** : ne pas remonter le SL trop vite. L'accumulation peut échouer si la tendance primaire n'est pas mature (divergence ou excès final). Son taux de réussite diminue à mesure que la tendance avance. ← *[note de probabilité ajoutée]*

##### Phase 2 — Breakout
Zone spéculative :
1. Débordement du contexte
2. Cassure de cycle Trend Sinewave
3. Cassure de l'accumulation (si présente)
4. **Momentum > 60** ← *[correction : les slides disent > 60, pas > 80]*
5. Break sinewave recommandé

Gestion du risque :
- **SL** : sous le creux précédent ou sous l'accumulation s'il y en a une / Risque max 2%
- **Validation** : report du range d'accumulation (si présent) → **NE SURTOUT PAS DÉPLACER LE STOPLOSS !!!**
- **Confirmation** : report du range de contexte → déplacer SL à breakeven **uniquement si on veut réduire le risque** (sinon attendre le premier suivi de tendance)
- **Objectif** : la seule règle est de ne jamais dépasser 2% de risque. Vouloir ramener le risque à 0 trop vite n'est pas une bonne solution.

##### Phase 3 — Suivi de Tendance
Conditions pour activer :
1. Breakout validé et confirmé
2. Moyenne haussière
3. Éviter si alerte de volatilité récente
4. Éviter si squeeze sur les prix
5. **Pas plus de 2 suivis dans une tendance**

Décision d'entrée :
1. **Tant que pas de 3BR visible** → trade le repli à la **MOYENNE**
2. **Si 3BR présente alors plus de moyenne** → attendre la **CASSURE DE 3BR**
3. **Si 3BR squeezée** → appliquer le **REPLI SUR 3BR SQUEEZÉE**

##### Phase 4 — Pullback
Zone spéculative :
1. Clôtures sous 50% canal de contexte
2. Range mature UT tendance
3. Retracement proche de 23–38% (50 max)
4. Signal de tendance momentum
5. **Fin de cycle sur Trend Sinewave** ← *[condition ajoutée]*

Gestion du risque :
- **SL** : taille du canal de tendance ET au moins sous le contexte / Risque max 2%
- **Validation** : retour au canal de tendance opposé → déplacer SL sous le creux précédent
- **Confirmation** : atteint canal contexte opposé ou nouveau plus haut → SL à breakeven + se préparer pour le TP excès final
- **Objectif** : éviter le biais "laisser filer au cas où". Positionner des ordres limites ou alertes en vue de l'excès final.

##### Phase 5 — Divergence
Zone spéculative :
1. Débordement du contexte
2. Prix proche du canal de tendance
3. **2 suivis de tendance visibles**
4. Trend Sinewave > 80
5. Break sinewave recommandé
6. Signal momentum recommandé

**Cause** : la divergence est un état de maturité intermédiaire de la tendance, marquant la fin du suivi de tendance. Elle se produit généralement après le second suivi.

**Actions selon expérience** :
- **Intermédiaire** : récupérer les profits des trades en suivi de tendance, essayer de laisser ouverts les trades breakout/accu (ou TP 50%)
- **Expérimenté** : récupérer profits suivi uniquement + prendre une position vendeuse au niveau de la **3BR du pullback**
- **Hardcore** : récupérer profits + vendre la divergence (contre-tendance) + 3BR du pullback

##### Phase 6 — Excès Final
Zone spéculative :
1. Prix > canal de contexte
2. Prix > canal de contexte UT+1
3. Prix > sommet précédent
4. Signal momentum (tous types)
5. **Fin de cycle Trend Sinewave** ← *[condition ajoutée]*
6. Break sinewave recommandé

**Actions selon expérience** :
- **Intermédiaire** : récupérer TOUS les profits en cours sur la tendance et repasser en mode range. Rappel : moins de 5% des marchés traitent sur des excès en fin de tendance. On les ratera parfois mais on profitera parfaitement des 95% restants.
- **Expérimenté** : récupérer également les profits, mais s'assurer de l'existence éventuelle de tendances multi-timeframe imbriquées (3 TF consécutifs) — dans ce cas appliquer ce modèle de gestion pour maximiser les rendements.
- **Hardcore** : récupérer les profits, vérifier la tendance multi-TF. Si rien → tenter un trade en reverse vers la 3BR. Ne jamais trader contre-tendance dans les tendances MTF ou les marchés peu liquides (fort risque d'excès).

---

#### 🚀 EXCÈS
- **Difficulté** : Expert
- **Ratio R/R** : 1:10 à 1:20
- **Caractéristiques** :
  1. Contextes **disjoints** (plusieurs boîtes de suite en support et en résistance, la structure continue d'accélérer)
  2. Cycles inexistants
  3. Momentum < 0 acheté

**Distinction Excès vs Bulle** :

| | **Excès** | **Bulle** |
|---|---|---|
| Fondamental | Haussier (supply réduit, anticipations) | Inexistant |
| V5 étendue | Non | Non |
| Multi-timeframe | Possible | Non |
| Tradable | Oui (avec méthode) | Très difficile |

> "Il est très difficile de faire la différence entre un excès et une bulle."

L'excès peut être le signe d'une **tendance multi-timeframe**. La bulle ne valide pas de structure multi-timeframe et sa fin sera imprévisible.

**Pour un excès** :
- Chercher une **source rationnelle fondamentale** (réduction de supply, effet d'annonce, anticipations). Si la réalisation n'est pas à la hauteur des attentes, la correction sera violente.
- S'assurer qu'on n'a pas à faire à une tendance multi-timeframe, ni une structure de vague 5 étendue (pas d'overlap).

**Zone spéculative Excès — suivi sur UT-2** *(slide 29)* :
1. Suivi effectué sur **UT-2**
2. Prix sous le contexte vendeur UT-0
3. Proche Fibo **14,6% ou 33,6%** ← *[niveaux précis ajoutés]*
4. Range mature ou repli moyenne
5. Signal momentum optionnel

Gestion du risque :
- **SL** : sous le niveau Fibonacci suivant, au moins sous le contexte UT supérieure / Risque max 2%
- **Validation** : rejoindre le contexte opposé ou casser la 3BR du range mature → déplacer SL sous le plus bas récent
- **Confirmation** : le prix quitte la zone de range et atteint le contexte UT supérieure → déplacer SL à breakeven
- **Objectif** : conserver jusqu'à un niveau d'objectif ou apparition du pattern d'exit. La pattern ne doit être utilisée que **deux fois maximum**. Ne pas laisser traîner les profits longtemps après le 2ème suivi.

**Zone spéculative Excès — excès final** *(slide 30)* :
1. Après **2 patterns de suivi UT-3** ← *[précision : UT-3, pas UT-2]*
2. Débordement du contexte
3. Au-dessus du canal de tendance
4. Break sinewave (target)
5. **Creux descendant sur momentum** ← *[condition visuelle ajoutée]*
6. Signal momentum optionnel

**Take Profit Excès** :
- TP **100%** sur le suivi de tendance
- TP **50%** sur le reste (breakout, accu, etc. — on pourra racheter ensuite)

**Psychologie Excès** :
- Sentiment de marché à son paroxysme → ne pas se laisser influencer
- Pas de trade en reverse (gestion du risque différente)
- Juste un TP
- Ne pas chercher à sortir tout en haut
- Attendre que le marché retourne à la moyenne avant de reprendre les achats

**Actions possibles Excès selon expérience** :
- **Trend Follow** : récupérer tous les profits en cours sur la tendance
- **Exit** : récupérer les profits + vérifier l'existence de tendances multi-timeframe
- **Reverse** (niveau Hardcore) : vérifier la tendance multi-TF. Si rien → tenter reverse pour venir chercher le repli vers la 3BR. Ne jamais counter-trend dans tendances MTF ou marchés peu liquides.

---

#### 💹 BULLE SPÉCULATIVE (niveau Hardcore)
Caractéristiques :
1. Fondamental inexistant
2. Pas de V5 étendue
3. Pas de multi-timeframe

"La bulle se caractérise par l'absence totale de justification fondamentale. Le marché ne cherche plus à valoriser. La structure s'enferre dans des raisonnements de court terme. Chaque repli est acheté et les ranges sont de plus en plus rapides alors que les volumes deviennent de plus en plus faibles."

**Trois stratégies possibles** ← *[absent du BRIEF initial]* :
- **Suivi de Bulle** : following the price momentum
- **Reverse Crash** : vendre la bulle au moment de l'effondrement
- **Dead Cat Bounce** : trader le rebond technique après le crash initial

Attention à la psycho — les biais sont encore plus prononcés que dans un excès.

---

#### ❌ CHAOS
- **Caractéristiques** :
  1. Contextes irréguliers
  2. Moyenne plate
  3. Momentum bruyant
- **Action** : **→ PARTEZ** — "Le marché chaotique peut avoir de nombreuses causes et en réalité chercher à lui donner le moindre sens est une pure perte de temps et d'énergie. Il existe une infinité de marchés disponibles pour trader, pourquoi vouloir s'attacher à un en particulier ?"

---

### 3.2 Structures Alternatives

Causées par un déséquilibre dans le supply (quantité d'actifs en circulation). Dans le cas où le supply est très faible, la moindre demande causera un rebond excessif du prix. On parle alors de "vague 1 étendue". Ces structures induisent des biais psychologiques encore plus prononcés que la version primaire.

> **⚠ Des anomalies dans la structure primaire doivent vous alerter.**

#### Vague 1 Étendue (V1E)
Supply extrêmement rare / quasi inexistant → départ prématuré de la tendance sans accumulation.

**Contexte & Psychologie** :
- Le prix rebondit très violemment en formant généralement un **"V Bottom"**
- Difficile à anticiper : on la constate en cours de route
- La psychologie des investisseurs est très altérée : le mouvement initial crée de la frustration + prise de risque accentuée. Même quand la structure ralentit, les traders deviennent de plus en plus agressifs.
- **Raisonnement inverse requis** : accepter d'avoir raté le gros, se contenter des miettes.

**Schéma en 3 étapes** ← *[absent du BRIEF initial]* :
```
1. REVERSE EN "V BOTTOM" : la moyenne repasse sous le contexte, le prix
   revient au sommet précédent (peut même le dépasser parfois)

2. UN PREMIER PULLBACK classique intervient, suivi par une structure
   d'EXCÈS FINAL classique

3. ARRIVE UN SECOND PULLBACK qui se positionne EN OVERLAP et produit
   un second et DERNIER EXCÈS FINAL
```

#### Vague 5 Étendue (V5E)
Supply important → structure similaire à une accumulation mais le facteur déterminant est le rejet de **deux breakouts** successifs.

**Contexte & Psychologie** :
- Le marché rejette deux breakouts → peut faire douter de l'existence de la tendance
- La tendance ne naît que dans la phase finale, le plus souvent en **"V Top"**
- N'ayant pas d'excès final sur le sommet → récupérer les profits sur des niveaux réalistes
- Sortie **en paliers** avec plusieurs ordres limites recommandée

**Schéma en 3 étapes** ← *[absent du BRIEF initial]* :
```
1. Le marché réalise un PREMIER BREAKOUT, mais celui-ci échoue vers
   la confirmation et se replie jusqu'au NIVEAU DE BREAK

2. Le prix tente un SECOND BREAKOUT qui échouera également, allant
   au delà du REPORT DE RANGE (confirmation)

3. Le prix réalise un SECOND PULLBACK et vient chercher la zone de prix
   traitée au SOMMET DU 1ER BREAK
```

---

### 3.3 Niveaux Fibonacci utilisés par pattern

| Pattern | Zone d'entrée | Notes |
|---|---|---|
| 3BR standard (Repli Neuneu) | **14,6% – 23,6%** | Dumb zone |
| 3BR Neutre | **>= 76%** | Retracement profond |
| 3BR Tendancielle | **>= 61%** | Retracement intermédiaire |
| Borne Neuneu | **> 76%** | Au delà des contextes |
| Accumulation | **38% – 50%** (max 61%) | |
| Pullback | **23% – 38%** (max 50%) | |
| Excès (suivi UT-2) | **14,6% ou 33,6%** | Deux niveaux précis |

**Objectif TP** : jamais au-delà de la zone Fibo opposée (sauf excès).

---

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
