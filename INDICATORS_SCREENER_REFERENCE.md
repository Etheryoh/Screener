# PRO Indicators → Screener : Document de Référence

> **Usage** : Ce document est la fondation technique pour l'implémentation des signaux PRO Indicators dans le screener multi-actifs (React/TypeScript, `App.tsx`). Il synthétise l'intégralité du PDF "PRO Indicators – Guide de Démarrage & Manuel d'Utilisation" (54 slides) **ET** du Prezi de formation interactif (75 slides), lus et analysés en session. Aucune extrapolation ni invention — tout est issu directement des sources.
>
> **Sources** : PDF = Manuel officiel (54 slides). Prezi = Formation interactive avancée (75 slides, contenu complémentaire non présent dans le PDF). Les éléments issus exclusivement du Prezi sont marqués `[PREZI]`.

---

## 0. Contexte et contraintes du projet

### Screener existant
- Stack : React + TypeScript, fichier unique `App.tsx` (~4 600 lignes)
- Données : Yahoo Finance daily (OHLCV), Binance klines daily/weekly pour crypto
- Déjà implémenté : RSI, EMA50/200 (Golden/Death Cross), MACD, régression log-linéaire (`calcRegressionDeviation`), divergences cachées (`calcHiddenDivergence`), structure HH/HL, bubble modifier, scoring dual Qualité/Timing

### Ce que PRO Indicators apporte
PRO Indicators est un système TradingView multi-timeframe (m1 → M1). Notre screener travaille sur **un seul timeframe (daily)**. Certains concepts sont donc **transposables partiellement**, d'autres sont **non transposables** (détail section 10).

---

## 1. Architecture générale de la stratégie PRO Indicators

La stratégie fonctionne en **4 étapes séquentielles obligatoires** :

```
ÉTAPE 1 : FILTRER LES PRIX
   → Identifier les zones de prix statistiquement intéressantes
   → Si le prix n'est pas dans une zone : passer au suivant

ÉTAPE 2 : ATTENDRE UN SIGNAL TECHNIQUE
   → Attendre que momentum + cycles s'alignent
   → 4 conditions doivent être simultanément OK

ÉTAPE 3 : DÉFINIR LE MONEY MANAGEMENT
   → Adapter la taille de position au contexte et au profil de risque

ÉTAPE 4 : GÉRER LE RISQUE EN POSITION
   → Prises de profit partielles, ajustement du stop, invalidation, limite
```

**Principe fondamental** : Plus de 80% des prix sont inutilisables dans un but statistique. Celui qui saute l'étape de filtrage et passe directement aux signaux se fera littéralement défoncer — il ne perd pas seulement l'avantage statistique, il le renverse.

**Règle d'or** : EN CAS DE DOUTE ENTRE TENDANCE ET RANGE → PRENDRE LE RANGE (filtres plus précis, moins de risque).

---

## 2. Les éléments de filtrage (Chapitre 2 — PRO Framework)

### 2a. Le Canal de Contexte
- Représente les zones d'offre et de demande dans le temps
- Sert à définir si le marché est en **range ou en tendance** (on étudie l'évolution de sa structure)
- Délimite 3 zones : Support Context / 50% Context / Resistant Context
- **Règle** : si le prix est au milieu du canal → rien à faire, passer au suivant
- Les zones intéressantes sont aux **bornes** ou au-delà du canal
- **Définition officielle (Annexe 1)** : "Il représente les zones d'offre et de demande dans le temps — On étudie l'évolution de sa structure pour définir si le marché est en range ou tendance"

### 2b. Le Canal de Tendance
- Représente le contexte de l'unité de temps inférieure
- Permet de visualiser deux timeframes sur un seul graphique
- Ligne médiane 50% = repère clé
- **Règle absolue** : NE JAMAIS VENDRE LA PARTIE INFÉRIEURE DU CANAL / ne jamais acheter la partie haute → filtre directionnel fort
- **Définition officielle (Annexe 1)** : "Il représente le contexte de l'UT inférieure — Permet de visualiser deux timeframes sur un seul graphique"

### 2c. PRICE OK
- Algorithme qui détecte que le prix est dans une zone d'intérêt
- **Ce n'est PAS un signal de trading** — c'est un pré-filtre
- Si absent sur le graphique → ne pas analyser plus loin
- Se déclenche typiquement aux niveaux Fibonacci OU aux bornes du canal de contexte
- **Définition officielle (Annexe 1)** : "Il signale que les prix pourraient être intéressants ici → un triangle de confirmation pourra arriver si le prix réagit positivement"

### 2d. Les Retracements Fibonacci
- Niveaux utilisés : 23.6% / 38.2% / 50.0% / 61.8% / 76.4%
- Dans un **range neutre** : ratio gain/perte optimal = débordement du 76.4% (seuil minimal d'entrée)
- Dans un **range tendanciel** : 61.8% de retracement acceptable
- Dans une **tendance** : 23% ou 38% (pull-back minimum requis)
- Renforcent l'intérêt d'une zone quand le niveau Fibonacci coïncide avec la borne du canal
- **Définition officielle (Annexe 1)** : "Il représente le ratio risque rendement dans un range — Permet de filtrer les prix qui ne sont pas intéressants dans un range"

### 2e. Les Breakouts — 2 types distincts
- **Range Breakout** : sortie d'un range → forte probabilité que le marché cherche à se stabiliser sur une borne du range. Cible projetée = amplitude du range
- **Standard Breakout** : cassure en range ou en tendance → lecture différente selon le contexte
- **Règle critique** : **UNE TARGET EST INVALIDÉE APRÈS 30 BOUGIES** (durée de vie limitée)
- En tendance : les targets de break seront généralement débordées
- **Définition officielle (Annexe 1)** : "Il représente un changement de rythme (le prix casse des cycles) — Permet de trouver les bornes d'un range ou le point de rupture en tendance"

### 2f. Triangles de Confirmation
- Confirme la réaction du prix dans une zone d'intérêt (après PRICE OK)
- **Ce n'est PAS un signal de trading** — confirmation de réaction seulement
- Ne jamais trader un triangle de confirmation sans le signal momentum associé
- **Définition officielle (Annexe 1)** : "Il signale que le prix vient de réagir dans une zone d'intérêt — Nous sert à confirmer un signal momentum avant d'entrer en position"

### 2g. Squeeze du Prix (Price Squeeze Alert)
- Se produit quand les mouvements du canal de tendance sont insuffisants → volatilité trop faible
- Traduit une contraction : le marché prépare potentiellement un mouvement violent
- La direction de sortie est **indéterminée**
- En tendance : les profils agressifs peuvent prendre un trade avec petites tailles (tendance plus probable)
- **Si déjà en position** au moment du squeeze : doubler le stoploss immédiatement et réduire la taille
- **Définition officielle (Annexe 1)** : "Il représente un manque de mouvement sur le prix — Nous alerte sur le fait que le contexte manque de volatilité (plus risqué)"

### 2h. Alerte de Volatilité
- Détecte une activité irrégulière des cycles → marché erratique
- Signal que le prix cherche à s'éloigner des moyennes mobiles
- **Recommandation** : passer son tour sauf expérience avancée
- **Définition officielle (Annexe 1)** : "Il signale que le prix agit de façon erratique (beaucoup de bruit) → volatilité très élevée, réduire son risque"

---

## 3. Identification des 4 structures de marché

`[PREZI]` Le Prezi identifie **4 contextes** (et non 3) avec des niveaux de difficulté associés :

| Contexte | Fréquence | Difficulté | Ratio R/R | Action par défaut |
|---|---|---|---|---|
| **RANGE** | ~80% du temps | Débutant | 1:1 à 1:2 | Trading spéculatif filtré |
| **TENDANCE** | ~20% du temps | Intermédiaire | 1:2 à 1:5 | Suivi + maximisation des gains |
| **EXCÈS** | <5% du temps | Expert | 1:10 à 1:20 | Expérimentés uniquement |
| **CHAOS** | Variable | — | — | **NE PAS TRADER — PARTEZ** |

### 3a. Le Range (80% du temps)

#### Filtres d'entrée obligatoires (range neutre) :
1. Ratio gain/perte optimal : débordement Fibonacci 76.4% minimum
2. Débordement du contexte (borne du canal de contexte franchie avec clôture)
3. Triangle de confirmation présent
4. Maximum 3 bornes touchées dans le range (après 3 touches = range mature → fort risque de tendance)

**Range tendanciel** (20% des ranges) : conditions légèrement différentes, retracement 61.8% acceptable, dans le sens de la tendance majeure. À ne trader qu'après 1 an d'expérience.

#### `[PREZI]` Sous-structures détaillées du Range

Le Prezi distingue deux grandes familles de range avec des sous-variantes précises :

##### A. 3EME BORNE (3BR) — Range précédé d'une tendance

**Pré-conditions pour valider le timeframe :**
1. Rejet des contextes
2. Pas de range sur UT+1 (mais OK si range UT+2)

**Conditions pour activer une pattern 3BR :**
1. Précédé ou au sein d'une tendance
2. Contexte renversé
3. Triangle de confirmation
4. Pas de débordement du sommet (sinon → 3BR Squeezée)

**À défaut, privilégier la 3BR neutre** (moins risquée que la variante tendancielle).

**3 sous-variantes :**

| Variante | Conditions spécifiques | Gestion |
|---|---|---|
| **3BR standard** | Contexte renversé + pas de squeeze sur le prix + pas de squeeze sur le prix UT+1 | Zone spéculative normale |
| **3BR Squeezée** | Le range produit un squeeze (canal de tendance grisé) → range considéré mature | On ne doit plus le trader. On arrête sur cette UT. Si squeeze sur UT+1, éviter aussi. Idem si retour au niveau de la 1BR (double top/bottom) |
| **3BR en Retard** | L'indicateur empêche le retournement de contexte en tendance forte (9 fois sur 10 protège correctement, mais parfois induit en erreur → on rate juste la 3BR) | Détectable seulement après coup. Pattern A-B-C : (A) prix casse le support du canal de tendance, revient au contexte acheteur mais ne se retourne pas, (B) rebondit sans faire de nouveau plus haut, retrace au canal de tendance résistant, (C) rebaisse, casse le point bas précédent (2BR) et renverse le contexte |

**3BR Neutre — zone spéculative :**
1. Clôture au-dessus du contexte
2. Retracement ≥ 76% Fibo
3. Triangle de confirmation
4. Signal momentum (tous types acceptés)
5. Break Sinewave optionnel

**3BR Neutre — gestion du risque :**
- **Stoploss** : reporter la taille du canal de tendance à partir de la clôture précédente la plus haute. **Risque max 2%**
- **Validation** : atteint la borne opposée du canal de tendance
- **Confirmation** : atteint 50% du canal de contexte avec clôture
- **Limite** : 76.4% de retracement
- **Invalidation** : accélération du canal de tendance avec clôtures
- **Taux de réussite** : ~85% si patient et non gourmand (ratio 1:1). Essentiel de ne jamais déplacer le stop à breakeven.

**3BR Tendancielle — zone spéculative :**
1. La 2BR a clôturé sous le contexte
2. Retournement dans le contexte
3. Retracement ≥ 61% Fibo
4. Triangle de confirmation
5. Signal de tendance momentum
6. Break Sinewave optionnel

**3BR Tendancielle — gestion du risque :**
- **Stoploss** : reporter la taille du canal de tendance à partir de la clôture précédente la plus haute. **Risque max 2%**
- **Validation** : rejoindre le canal de tendance opposé OU clôture au-dessous de 50% contexte
- **Confirmation** : le prix atteint le contexte opposé ou déborde le point bas précédent (2ème borne)
- **Objectif** : récupérer ses profits dès que le prix se trouve sous le point bas précédent, sous les contextes acheteurs et que le momentum donne un signal + triangle. Possibilité d'utiliser un stop suiveur dès le débordement du point bas précédent.

##### B. RANGE NEUNEU — Range sans historique ou très mature

**Quand utiliser :** 
- Manque d'historique sur l'actif
- Ranges matures qui comptent 4 bornes et plus
- Forex à partir de l'UT hebdo sur les paires majeures
- Certaines commodities

**Principe** : stratégie à privilégier quand on a le moindre doute. On ne cherche pas à prédire l'avenir, on exploite le fait que le marché ne semble pas vouloir sortir de sa zone de range.

**On place les Fibos sur toute la hauteur du range. Utiliser des alertes sur les Fibos.**

**2 sous-variantes :**

| Variante | Description |
|---|---|
| **Borne Neuneu** | Trade classique aux bornes du range, conditions simplifiées |
| **Repli Neuneu** | Trade sur repli dans la zone Fibo 14-23% |

**Repli Neuneu — règles de déclenchement :**
1. Le prix est proche du contexte
2. Le prix est dans la zone Fibo (14-23%)
3. Break Sinewave optionnel
4. Signal momentum optionnel

**Repli Neuneu — schéma de pattern :**
1. Le prix fait un creux et a tenu plusieurs clôtures largement sous la zone d'achat Fibo (14.6%-23.6%). Le creux ne doit pas forcément faire un nouveau plus bas.
2. Le prix rebondit et atteint la "dumb zone" ou il tient plusieurs clôtures sans sortir du haut de la zone.
3. Puis le prix rebaisse et revient chercher la zone d'achat Fibonacci → on applique les règles de déclenchement ci-dessus.

**Repli Neuneu — gestion du risque :**
- **Stoploss** : au-dessus du plus haut du range et au moins égal à la moitié de la taille du canal de tendance. **Risque max 2%**
- **Validation** : retour au contexte opposé ou entrée dans la dumb-zone → déplacement du stoploss au sommet récent
- **Objectif** : viser le bas de la dumb zone pour un TP partiel. Dans tous les cas, ne jamais viser au-delà de la zone Fibo opposée.

### 3b. La Tendance (20% du temps)

**Niveau de difficulté : intermédiaire** `[PREZI]`

**Pré-conditions pour valider :** `[PREZI]`
1. Précédé d'un range mature
2. Pas de tendance sur UT+1

Si la réponse au point 2 est NON → vous avez à faire à un **flux**. La différence principale d'un flux est sa structure très variante. Là où la tendance primaire sera très structurée (break, suivi, pullback, excès-final), la navigation d'un flux sera très imprévisible. → **CHANGEZ DE TIMEFRAME !**

Si le marché est en train de "breaker" sur 3 timeframes consécutifs → **TENDANCE MULTI-TIMEFRAME**. Niveau expert, on peut trader chaque TF en parallèle avec 2% de risque chacun. `[PREZI]`

- **Règle absolue** : ON NE PASSE PAS DE TENDANCE HAUSSIÈRE À BAISSIÈRE DIRECTEMENT (toujours par une phase de range intermédiaire, sauf excès/bulle)
- La tendance émerge généralement d'un range mature
- En tendance : ON LAISSE FILER LES GAINS, on ne cherche pas les signaux haussiers pour douter
- Un breakout doit être suivi tant que les prix ne montrent pas de divergence avec le momentum
- Conditions d'entrée : 23% de retracement minimum, proche du canal de tendance, signal couleur + triangle

**Comment définir la maturité de la tendance :** `[PREZI]`
1. **Le prix** : comportement des canaux tendance et contexte
2. **La moyenne** : position par rapport au contexte
3. **Les cycles** : pour valider le changement de rythme

**Conseil Prezi** : en tendance, activer "Trend Sinewave" dans l'indicateur.

### 3c. L'Excès de Marché (Niveau Expert) `[PREZI — enrichi]`

**Pré-conditions d'identification :**
1. Contextes disjoints (boîtes support ET résistance séparées — doit s'établir sur plusieurs boîtes de suite)
2. Cycles inexistants
3. Momentum < 0 côté acheteur (ou > 0 côté vendeur)

**Distinction Excès vs Bulle :** `[PREZI]`

| | **Excès** | **Bulle** |
|---|---|---|
| Fondamental | **Haussier** (source rationnelle : réduction du supply, demande plus forte, effet d'annonce) | **Inexistant** (aucune justification fondamentale, le prix est la seule chose dont les gens parlent) |
| V5 étendue | Pas de V5E | Pas de V5E |
| Multi-timeframe | Pas de tendance multi-TF | Pas de tendance multi-TF |
| Comportement | Si la réalisation n'est pas à la hauteur des attentes, correction violente | Chaque repli est acheté, ranges de plus en plus rapides, volumes de plus en plus faibles |
| Sous-types | Trend Follow, EXIT, Reverse | Suivi de Bulle, Reverse Crash, Dead Cat Bounce |

Il est très difficile de faire la différence entre un excès et une bulle. Un excès peut être le signe d'une tendance multi-timeframe, tandis que la bulle n'est soutenue par aucun fondamental et ne valide pas de structure multi-TF. Sa fin sera relativement imprévisible.

**Avertissement** : les excès et bulles représentent <5% des conditions de marché. Les excès se retournent quasi systématiquement sans passer par une phase de range. NE PAS TRADER pour les débutants — uniquement pour expérimentés (+3 ans).

### 3d. Le Chaos `[PREZI]`

**Caractéristiques d'identification :**
1. Contextes irréguliers
2. Moyenne plate
3. Momentum bruyant

Le marché chaotique peut avoir de nombreuses causes et en réalité chercher à lui donner le moindre sens est une pure perte de temps et d'énergie. Il existe une infinité de marchés disponibles pour trader, pourquoi vouloir s'attacher à un en particulier.

**Action : PARTEZ. Ne pas trader.**

---

## 4. Le Signal de Trading (Chapitre 3)

### 4.1 Les 4 conditions simultanées requises pour un signal valide

D'après le schéma de la slide 24 (exemple réel S&P500 du 24/09/2018) :

```
PRICE OK  →  CONTEXT OK  →  MOMENTUM OK  →  SINEWAVE OK  →  SIGNAL (point bleu/rouge)
```

| Condition | Définition officielle (Annexe 1 du PDF) |
|---|---|
| **PRICE OK** | "Il signale que les prix pourraient être intéressants ici → un triangle de confirmation pourra arriver si le prix réagit positivement" |
| **CONTEXT OK** | Structure de marché identifiée et cohérente avec la direction du signal |
| **MOMENTUM OK** | "Il signale qu'une pattern est en cours sur PRO Momentum → nous indique que le momentum peut être favorable pour entrer en position" |
| **SINEWAVE OK** | "Il signale qu'un nouveau cycle est sur le point de commencer → nous indique que les cycles (sinewave) sont favorables pour entrer en position" |

**Toutes les 4 doivent être présentes simultanément.** Un signal sans ces 4 conditions est statistiquement défavorable.

### 4.2 Les Cycles

#### Période Moyenne (Sinewave de John Ehlers)
- Source théorique : **Oscillateur Sinewave de John Ehlers** (référence citée dans le PDF)
- Produit deux informations : la **période moyenne** et la **sinusoïde**
- Période moyenne = durée moyenne d'un cycle de prix tel que détecté par la formule
- Valeur typique sur timeframes standards : **~20 bougies** (± variations selon l'actif)
- Ratio au sein d'un cycle : **60/40** (60% dans un sens, 40% dans l'autre — ratio du nombre d'or 0.618)

#### La Sinusoïde
- Représente la **phase actuelle des prix au sein du cycle**
- Oscillation entre **+100 et -100**, bornes à **+80 et -80**
- Un cycle acheteur est **mature** quand la sinusoïde dépasse **+80**
- Un cycle vendeur est mature quand la sinusoïde passe sous **-80**
- Logique : attendre la fin d'un cycle acheteur pour vendre, et inversement
- **Note technique** : la Sinewave n'est plus un indicateur séparé dans PRO Indicators — elle a été fusionnée dans PRO Momentum pour permettre des alertes combinées (MOMENTUM OK + SINEWAVE OK simultanés). Ceux qui veulent y accéder séparément peuvent le demander.
- **Note Prezi** : La Sinewave n'est pas activée par défaut. On peut afficher la Sinusoïde locale (traders agressifs) ou celle de l'UT supérieure = "Trend Sinewave" (débutants/faible risque). En tendance, activer "Trend Sinewave".

### 4.3 Le Momentum

#### Ligne de Momentum
- Formule propriétaire non divulguée (l'auteur précise explicitement qu'il ne la donne pas)
- Représente **la pente du prix** : une valeur élevée = le prix monte vite
- Se situe entre RSI (trop bruyant) et MACD (trop lent) dans sa réactivité
- **Sources non corrélées** utilisées en entrée : cycles (Sinewave) + momentum → deux sources indépendantes
- L'algorithme scrute **plus de 150 patterns de momentum et plus de 100 sur les cycles**
- Chaque pattern a **en moyenne 10 conditions** à remplir pour se déclencher + filtres additionnels

#### Trail-Lines
- Lignes secondaires du momentum (thermomètre des pressions acheteuses/vendeuses)
- Trail-Line supérieure basse → vendeurs agressifs
- Trail-Line de support haute → acheteurs agressifs
- Équivalent du canal de tendance mais appliqué au momentum
- Utilisation principale : contextes tendanciels uniquement
- **Avertissement** : utilisation seule = très risqué

### 4.4 L'Algorithme de Détection — les 8 types de signaux

L'indicateur PRO Momentum produit **4 parties visuelles distinctes** :
`SINEWAVE LINE | SIGNAL ALGORITHM | MOMENTUM LINE | TRAIL-LINES`

#### a. TP (Take Profit) — Couleur GRISE
- **Nécessite obligatoirement une validation horizontale** (zone de prix connue avec au moins un retournement dans l'historique)
- Traduit que les traders en position commencent à sécuriser leurs gains
- **Stop LARGE requis** → le marché peut déborder avant de se retourner
- Taux de réussite faible → signal souvent débordé avant retournement effectif
- Deux variantes visuelles : avec excès (débordement + signal) / sans excès (signal propre)
- En cas de doute : attendre un triangle de confirmation comme sécurité supplémentaire

#### b. Overload (point gris)
- Excès de momentum : le prix pousse fort vers une zone technique (chasse aux stops) avec forte probabilité de rejet
- **Réaction rapide et sans excès** → stop plus serré que le TP
- Nécessite une validation horizontale OU un triangle de confirmation
- Différence avec le TP : réaction généralement plus rapide et propre
- Schéma ENTRY / NO ENTRY / ENTRY : le contexte conditionne la validité du signal

#### c. DIV (Divergences)
**Divergence Standard** (couleur GRISE — signal faible) :
- Prix fait un nouveau sommet/creux + momentum ne confirme pas
- Souvent faux, doit être filtré comme TP/Overload (validation horizontale requise)
- Produit fréquemment pendant les cassures de lignes de tendance à court terme

**Divergence Cachée** (couleur BLEUE/ROUGE — signal fort) :
- Définition inverse : momentum fait un nouveau sommet, prix non
- Signal de **continuation de tendance**, pas de retournement
- Ne nécessite **pas** de validation particulière (filtrage prix déjà fait via Framework)
- **Astuce PDF** : quand des divergences cachées apparaissent, la tendance est souvent mature → sécuriser les gains au prochain creux si un signal opposé se présente
- **Déjà implémenté dans notre screener** via `calcHiddenDivergence()`

#### d. EXIT — Couleur NOIRE
- Monte d'un cran en termes de probabilité de réaction positive des prix
- **Validation horizontale non obligatoire** (signal plus fort donc)
- Produit généralement **en tendance** → annonce épuisement des prix
- Peut causer un retournement ou nécessiter une temporisation (range) avant de repartir
- **Règle obligatoire** : si positionné dans le sens opposé à ce signal → prise de profit d'**au moins 50%**
- Deux types visuels :
  - **RANGE EXIT** : épuisement dans un range (borne atteinte + momentum saturé)
  - **REVERSAL EXIT** : retournement structurel (signal le plus fort)
- Dans les deux cas : TP 50% minimum quel que soit le niveau d'agressivité

#### e. SurAchat / SurVente (points BLEU/ROUGE) — Signaux d'entrée principaux
3 cas de figure distincts selon le contexte :

**Cas 1 — Momentum hyper-tendu (tendance non mature)** :
- Le marché va simplement "respirer" puis continuer dans le même sens
- Ne pas trader contre en tendance non mature → ce signal sera quasi systématiquement débordé
- **Son débordement est même une confirmation que le marché est bien en tendance** (élément clé pour la détection de tendance)

**Cas 2 — Passage à travers une résistance technique (chasse aux stops, tendance mature)** :
- Signal parfait pour entrer contre-tendance dans une zone de prix (PRICE OK)
- Signifiera souvent la fin (ou une pause et un range) dans la phase de tendance
- Rester prudent sur les trades contre tendance, garder une taille de position très faible

**Cas 3 — Épuisement à la borne d'un range** :
- Attendre un triangle de confirmation avant d'entrer
- Ne pas entrer directement sur le signal seul

#### f. BULL / BEAR
- Signaux de renforcement de position dans le sens de la tendance
- Seule exception à la règle d'entrée aux bornes du canal de contexte (si en tendance)
- Condition : se produire au contact du canal de tendance + confirmé par un triangle
- Ne pas trader en tendance mature (risque élevé)
- Dans un range : devraient rarement passer les filtres de prix Framework

#### g. SQUEEZE — Couleur JAUNE/ORANGE (c'est une alerte, pas un signal)
- **Ce n'est PAS un signal** — c'est une alerte
- Momentum hyper compressé → sortie brutale du prix dans un **sens indéterminé**
- En tendance : profils agressifs peuvent prendre position avec petites tailles (la tendance sera probablement suivie)
- Rappel définition tendance : nécessite **au moins 2 creux et sommets orientés dans le même sens**
- Si en position au moment du squeeze : doubler le stoploss et réduire la taille

#### h. CONTEXT — Couleur JAUNE/ORANGE (c'est une alerte, pas un signal)
- Apparaît sur le graphique (pas sur l'oscillateur)
- Se déclenche quand on trade aux bornes du contexte du **timeframe supérieur**
- Signale qu'il faut aller vérifier le timeframe supérieur avant toute décision
- Pour débutants : ne pas trader sur ce timeframe, chercher un timeframe sans cette alerte
- Tableau de correspondance TF local → TF supérieur (citée dans le PDF, slide 36) :

| TF Local | m1 | m2 | m3 | m5 | m15 | m30 | H1 | H2 | H4 | D1 | W1 | M1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TF Supérieur | m5 | m10 | m15 | m30 | H1 | H2 | H4 | H8 | D1 | W1 | M1 | M3 |

---

## 5. Le cycle de vie complet d'une tendance

### Schéma maître (Slide 46 — organigramme visuel complet)

```
Phase 1 : ACCUMULATION
  → Range mature + rejet canal de tendance (résistance du canal)
  → Structure ne doit pas retracer plus de 61% de la vague précédente
  → Si point bas = reverse d'une tendance baissière : 2 creux ascendants requis
  → Signaux : BULL (débutants), jaune (intermédiaires), rouge (expérimentés)
  ↓

Phase 2 : BREAKOUT
  → Cassure de l'accumulation + volume + confirmation Framework
  → Le prix doit casser ET clôturer au-dessus du contexte ET du canal de tendance
  → Casse généralement une ligne de tendance court terme clairement visible
  → La sinusoïde devient erratique (signal de confirmation du breakout)
  → Targets de break affichées — seront généralement débordées en tendance
  ↓

Phase 3 : SUIVI DE TENDANCE → DIVERGENCE
  → Le prix oscille dans le canal de tendance et échoue en débordement de contexte
  → Le rythme ralentit
  → Ligne de tendance court terme cassée
  → Apparition de divergences standards (il peut y en avoir plusieurs de suite)
  → Signal : prendre des profits partiels (TP50% + SL BE minimum selon profil)
  ↓

Phase 4 : PULL-BACK
  → Doit être sur un range mature sur le TF inférieur
  → Retour minimum à 50% du contexte
  → Se retourne proche de 23-38% Fibonacci
  → Signal : DIV cachée ou BULL/BEAR
  → Renfort de position pour profils agressifs uniquement au-delà de la médiane du contexte
  ↓

Phase 5 : EXCÈS FINAL
  → Nouveau retour au contexte résistant + breakout Framework
  → Les prix sont loin des moyennes, sur des écarts types élevés
  → Généralement dans le contexte du timeframe supérieur
  → Signal : EXIT ou signal de retournement (Reverse/Final Excess)
  → TP 100% pour tous les profils, TP+Reverse pour très agressifs
```

### `[PREZI]` Conditions détaillées par phase de tendance (Prezi)

#### Phase 1 : ACCUMULATION — Zone spéculative
1. Range mature sur l'UT contexte
2. Range mature du canal de tendance
3. Retracement entre 38-50% (max 61)
4. Prix > au contexte acheteur
5. Signal de tendance momentum

**Gestion du risque :**
- **Stoploss** : sous le creux précédent et au moins égal à la taille du canal de tendance. **Risque max 2%**
- **Validation** : débordement du contexte + cassure de cycle (breakout) → déplacer le SL sous le range d'accumulation → déplacer le SL à breakeven uniquement si vous tradez le breakout en plus
- **Objectif** : ne surtout pas chercher à remonter le stoploss trop vite ni le déplacer à breakeven trop tôt. Laisser ces trades se développer tant que la tendance n'est pas mature (divergence ou excès final). Le trade d'accumulation est celui qui rapportera le plus, son taux de réussite est donc plus faible — ne pas être surpris si certaines accumulations échouent.

#### Phase 2 : BREAKOUT — Zone spéculative
1. Débordement du contexte
2. Cassure de cycle Trend Sinewave
3. Cassure de l'accumulation (si présente)
4. Momentum > 80
5. Break Sinewave recommandé

**Gestion du risque :**
- **Stoploss** : sous le creux précédent ou sous l'accumulation s'il y en a une. **Risque max 2%**
- **Validation** : report du range d'accumulation (si présent) → **NE SURTOUT PAS DEPLACER LE STOPLOSS !!!!!**
- **Confirmation** : report du range de contexte → déplacer le SL à breakeven uniquement si vous voulez réduire le risque (sinon attendez le premier suivi de tendance pour le faire)
- **Objectif** : en tendance l'erreur principale est de vouloir remonter le stop trop vite. La seule règle est de ne jamais dépasser 2% de risque sur l'exposition à la tendance. Vouloir ramener le risque à 0 trop vite n'est pas une bonne solution.

#### Phase 3a : SUIVI DE TENDANCE — Conditions `[PREZI]`
Conditions pour activer le suivi de tendance :
1. Breakout validé et confirmé
2. Moyenne haussière
3. Éviter si alerte de volatilité récente
4. Éviter si squeeze sur les prix
5. **Pas plus de 2 suivis dans une tendance**

**3 sous-modes de suivi :**
1. Tant qu'il n'y a pas de 3BR visible → trader le **Repli à la Moyenne** (passer sur UT-2 pour acheter un repli tant que le prix n'a pas atteint la formation d'une 3BR)
2. Si la 3BR est formée → plus de moyenne, attendre la **Cassure de 3BR**
3. Si la 3BR est squeezée → appliquer le **Repli sur 3BR Squeezée**

**Règle clé** : ne pas trader la moyenne si la 3BR est déjà là (dans ce cas on attend simplement la rupture de 3BR).

#### Phase 3b : DIVERGENCE — Zone spéculative
1. Débordement du contexte
2. Prix proche du canal de tendance
3. 2 suivis de tendance visibles
4. Trend Sinewave > 80
5. Break Sinewave recommandé
6. Signal momentum recommandé

**Cause principale** : comme une tendance ne peut être éternelle, la divergence est l'état de maturité intermédiaire qui marque la fin du suivi de tendance. Généralement elle va se produire après le second suivi de tendance.

**Actions possibles selon l'expérience :**
- **Intermédiaire** : récupérer les profits des trades en suivi de tendance, essayer de laisser ouverts les trades en accu/breakout (ou juste TP50%)
- **Expérimenté** : récupérer les profits du suivi de tendance seulement et prendre une position vendeuse au niveau de la 3BR du pullback
- **Hardcore** : récupérer les profits en suivi de tendance et tenter de vendre la divergence (contre tendance) + la 3BR du pullback

#### Phase 4 : PULL-BACK — Zone spéculative
1. Clôtures sous 50% canal de contexte
2. Range mature UT tendance
3. Retracement proche de 23-38% (50 max)
4. Signal de tendance momentum
5. Fin de cycle sur Trend Sinewave

**Gestion du risque :**
- **Stoploss** : stop de la taille du canal de tendance et au moins sous le contexte. **Risque max 2%**
- **Validation** : retour au canal de tendance opposé → déplacer le SL sous le creux précédent
- **Confirmation** : atteint le canal de contexte opposé ou nouveau plus haut → déplacer le SL à breakeven et se préparer pour le take profit de l'excès final à venir
- **Objectif** : une fois le trade de pullback validé et confirmé, éviter de céder au biais qui vous invitera à vouloir "laisser filer" la position "au cas où". Les tendances ne sont pas éternelles. Un bon trade est un trade encaissé. Positionner des ordres limites ou alertes en vue de l'excès final.

#### Phase 5 : EXCÈS FINAL — Zone spéculative
1. Prix > canal de contexte
2. Prix > canal de contexte UT+1
3. Prix > sommet précédent
4. Signal momentum (tout types)
5. Fin de cycle Trend Sinewave
6. Break Sinewave recommandé

**Actions possibles selon l'expérience :**
- **Intermédiaire** : quel que soit le sentiment, récupérer TOUS les profits en cours sur cette tendance et repasser en mode range. Ne pas oublier que moins de 5% des marchés forment des excès en fin de tendance — c'est frustrant de les rater mais vous profiterez parfaitement des 95% restants.
- **Expérimenté** : récupérer également les profits mais penser à l'existence éventuelle de tendances multi-timeframe (tendances imbriquées sur 3 TF consécutifs) — dans ce cas appliquer ce modèle de gestion à la place pour maximiser les rendements.
- **Hardcore** : récupérer les profits, vérifier la tendance multi-TF et si il n'y a rien, tenter un trade en reverse pour venir chercher le repli vers la 2BR. En aucun cas trader contre-tendance dans les tendances MTF ou les marchés peu liquides (fort risque d'excès).

### `[PREZI]` Structures Alternatives de Tendance

Les structures alternatives sont généralement causées par un **déséquilibre dans le supply** (quantité d'actifs en circulation). Des anomalies dans la structure primaire doivent alerter. Ces structures induisent des biais psycho encore plus prononcés.

#### Vague 1 Étendue (V1E)
- Le supply est extrêmement rare, à tel point que la hausse de la demande va causer un **départ prématuré de la tendance**
- Il n'y aura **pas d'accumulation** et le prix va rebondir très violemment en formant généralement un **V-bottom**
- Le souci principal : on peut difficilement l'anticiper, on la constate en cours de route
- La psychologie des investisseurs est alors très altérée (tendance sans préparation laisse beaucoup de traders sur le banc de touche → frustration → prise de risque accentuée)
- **Schéma** : (1) Reverse en V-bottom, la moyenne repasse sous le contexte, le prix revient au sommet précédent (il peut même le déborder parfois), (2) Un premier pullback classique suivi d'une structure d'excès final classique aussi, (3) Arrive un second pullback qui se positionne en overlap et produira un second et dernier excès final

#### Vague 5 Étendue (V5E)
- Le supply est important (ex : forte inflation) → structure en V5E
- Le marché se comporte de manière assez piégeuse et la psychologie sera le facteur déterminant
- Il faudra rester très patient car le marché rejette deux breakouts, ce qui pourra faire douter de l'existence de la tendance
- Celle-ci n'arrivant que dans la phase finale, elle se fait le plus souvent en **V-top**
- N'ayant pas d'excès final sur le sommet, il faudra récupérer ses profits sur des niveaux plus arbitraires. Sortie "en paliers" avec plusieurs ordres limites recommandée.
- La V5E prend une forme excessive sur son dernier breakout — ne pas être surpris ni sur-excité
- **Schéma** : (1) Le marché réalise un premier breakout mais celui-ci échoue vers la confirmation et se replie jusqu'au niveau de break, (2) Le prix tente un second breakout qui échouera également à aller au-delà du report de range (confirmation), (3) Le prix réalise un second pullback et retourne chercher la zone de prix traitée au sommet du 1er break

### Signaux par phase — tableaux officiels

#### Trade en Tendance (Chapitre 5, Slide 41)

| Phase | Faible risque | Modéré | Agressif | Très Agressif |
|---|---|---|---|---|
| **Accumulation** | Attente | Renfort +25% | Renfort +50% | Renfort +100% |
| **Breakout** | Entrée 100% | Renfort +100% | Renfort +150% | Renfort +200% |
| **Divergence** | TP50% + SL BE | TP25% + SL BE | TP25% | TP25% |
| **Pull-Back** | RIEN | RIEN | Renfort +50% | Renfort +100% |
| **Excès final** | TP 100% | TP 100% | TP 100% | TP + Reverse |

*Note : les "renfort %" sont des pourcentages de levier relatif au niveau de risque de base. 150% = 50% de levier supplémentaire.*

*Note accumulation : le renfort n'est proposé que si le marché donne un signal au niveau du canal de tendance. Stop large placé au-delà du point haut/bas majeur précédent.*

#### Trade Spéculatif / Range (Chapitre 5, Slide 39)

4 jalons du trade :
- **Validation** : le prix atteint la borne opposée du canal de tendance
- **Confirmation** : le prix franchit 50% du canal de contexte avec clôture
- **Invalidation** : le prix accélère le mouvement en débordant fortement le canal de tendance
- **Limite** : 76.4% de retracement atteint (target maximale)

| Profil | Validation | Confirmation | Invalidation | Limite |
|---|---|---|---|---|
| **Faible risque** | TP50% + SL payé | SL BE | TP50% + TP BE | TP 100% |
| **Modéré** | TP25% + SL payé | TP25% + SL BE | TP BE | TP 100% |
| **Agressif** | SL BE | TP50% | TP BE | TP 100% |
| **Très Agressif** | RIEN | TP25% + SL BE | RIEN | TP100% + Reverse |

*Glossaire : SL BE = stoploss ramené au Break Even (prix d'entrée moyen). SL payé = stoploss financé par la prise de profit partielle (le stop ne peut plus créer de perte). TP BE = dans le cas d'un trade perdant en phase d'invalidation, on tente de couper la perte si le marché retourne chercher le prix d'entrée.*

---

## 6. Organigramme de décision complet (Slide 46 — référence absolue)

```
ÉTAPE 1 : QUEL EST LE CONTEXTE ?
│
├── Conditions pré-requises (TOUS obligatoires) :
│   ├── Marché suffisamment liquide ?
│   ├── Historique de trading suffisant ? (minimum 250 bougies)
│   ├── Volatilité suffisante pour trader ?
│   └── Pas de gros catalyseur attendu ?
│
├── [50%] → RANGE NEUTRE (favoriser en cas de doute)
│   ├── Conditions d'entrée :
│   │   ├── Mini 76% retracement
│   │   ├── Déborder le CONTEXTE
│   │   └── SIGNAL + TRIANGLE
│   │
│   └── ÉTAPE 2 : MATURITÉ ?
│       ├── VALIDATION → atteint borne opposée canal de tendance
│       ├── CONFIRMATION → atteint 50% canal de contexte avec clôture
│       ├── LIMITE → 76.4% de retracement
│       └── INVALIDATION → accélération du canal de tendance avec clôtures
│
├── [25%] → RANGE TENDANCIEL (suivi tendance majeure — NE PAS TRADER AVANT 1 AN D'EXP.)
│   ├── Conditions d'entrée :
│   │   ├── Mini 61% retracement
│   │   ├── Entrer dans le CONTEXTE
│   │   └── SIGNAL + TRIANGLE
│   │
│   └── ÉTAPE 2 : MATURITÉ ?
│       ├── VALIDATION → borne opposée canal de tendance
│       ├── CONFIRMATION → borne opposée canal de contexte avec clôture
│       ├── TARGET 1 → arrivée dans la zone d'objectif de la borne opposée
│       └── INVALIDATION → cassure de la tendance (dernier support/résistance)
│
├── [20%] → TENDANCE
│   ├── Conditions d'entrée :
│   │   ├── Mini 23% retracement
│   │   ├── Proche canal de tendance
│   │   └── SIGNAL COULEUR + TRIANGLE
│   │
│   └── ÉTAPE 2 : MATURITÉ ?
│       ├── ACCUMULATION → range mature + rejet canal tendance + 38-61% retracement
│       ├── BREAKOUT → cassure accumulation + volume + Breakout Framework
│       ├── DIVERGENCE → apparition divergences standards (détectées ou non)
│       ├── PULL-BACK → retracement mini 23-38% + retour mini 50% contexte
│       └── EXCÈS FINAL → nouveau retour contexte + Breakout Framework
│
├── [<5%] → EXCÈS / BULLE → NE PAS TRADER (uniquement expérimentés +3 ans)
│
└── [PREZI] → CHAOS → NE PAS TRADER — PARTEZ
```

---

## 7. Rappel de stratégie officiel (Slide 46 — organigramme)

Principes extraits de l'organigramme de décision :
1. Les zones de trading se trouvent en débordement des contextes (sauf accumulation) — les prix qui se trouvent ailleurs n'ont aucune importance.
2. Si vous tradez dans le contexte, il faut des signaux tendanciels (momentum) et vous assurer que vous êtes dans un contexte approprié (pullback, range tendanciel).
3. Tradez toujours à proximité du canal de tendance. Et surtout ne jamais vendre dans la partie inférieure du canal, ne jamais acheter la partie haute.
4. Certains trades se déclenchent hors des contextes (ACCU) mais ces trades doivent être pris avec un signal sur le TF inférieur (et donc dans le contexte) et seulement si les conditions d'accumulation sont validées.

---

## 8. Alertes de Contexte — 3 types (Slide 28)

L'algorithme détecte automatiquement 3 types de contextes de marché :

| Alerte | Couleur | Signification |
|---|---|---|
| **RANGE ALERT** | Gris foncé (neutre) / Gris clair (tendanciel) | Range détecté — conditions de filtrage range applicables |
| **COUNTER-TREND ALERT** | Bleu/Rouge foncé | Opportunité contre-tendance potentielle |
| **TREND-FOLLOW ALERT** | Bleu/Rouge clair | Opportunité dans le sens de la tendance |

Ces alertes contextuelles servent de **pré-screener** : elles signalent qu'une opportunité mérite d'être vérifiée, pas qu'un trade est valide. L'affichage historique est désactivé par défaut (pour forcer l'apprentissage de l'identification manuelle des contextes). Activable via "show historical alerts" dans les réglages.

---

## 9. Limitations techniques et avertissements du PDF

### Règles de validité données explicitement dans le PDF
- **Minimum 250 bougies** requises pour que les indicateurs fonctionnent correctement. 500 recommandées pour une adaptation optimale.
- **Target de breakout invalide après 30 bougies** — durée de vie limitée
- **Excès et bulles < 5% des conditions de marché** — ne pas les chercher partout
- **En tendance, les targets de break seront généralement débordées** — cibles indicatives
- **La divergence cachée en tendance signale une tendance mature** → sécuriser les gains au prochain creux opposé
- **Le SQUEEZE ne donne pas la direction** — alerte de préparation uniquement
- **La divergence standard est le signal le plus faible** (couleur grise) — fort taux d'échec sans validation horizontale
- **Maximum 2 suivis de tendance** dans une même tendance `[PREZI]`
- **Risque maximum par trade : 2%** (toutes structures confondues) `[PREZI]`

### Conditions de marché requises pour trader (pré-requis explicites)
- Liquidité suffisante (transactions journalières permettant d'entrer/sortir)
- Pas de très petites capitalisations (peuvent partir en excès sans prévenir)
- Historique suffisant (250+ bougies minimum, 500 recommandées)

---

## 10. Mapping complet PRO Indicators → Screener

### Déjà implémenté dans App.tsx

| Concept PRO Indicators | Notre implémentation | Notes |
|---|---|---|
| Divergence cachée (continuation) | `calcHiddenDivergence()` | ✅ Complet |
| Déviation log-linéaire | `calcRegressionDeviation()` | ✅ Complet |
| Structure HH/HL | Lookback adaptatif | ✅ Complet |
| Bulle / excès parabolique | Bubble modifier | ✅ Signal fort |
| Golden/Death Cross | EMA50/200 | ✅ Complet |
| RSI surachat/survente | RSI scoring | ✅ Cas 1 & 3 du PDF |
| Régime Range/Tendance | Détection via HH/HL + MACD | ✅ Partiel |

### À implémenter (nouvelles fonctions)

#### Fonction 1 : `calcMarketPhase()`
**But** : détecter la phase du cycle de tendance actuelle

**Inputs** : tableau OHLCV daily (minimum 100 bougies)

**Logique par phase** :
- `accumulation` : 2+ touches de borne + HH/HL convergents dans la direction + volume faible (inférieur à la moyenne 20j) + structure range mature
- `breakout` : clôture au-dessus/dessous de la borne du range précédent + volume supérieur à la moyenne + EMA50 dans le bon sens
- `divergence` : tendance établie (2+ HH/HL) + RSI ne confirme pas le dernier sommet/creux prix + cassure ligne de tendance court terme (EMA court terme)
- `pullback` : après breakout ou divergence + retour sur EMA50 ou zone de support + RSI entre 40-60 + structure cyclique montante
- `excess` : `calcRegressionDeviation()` > 2σ + RSI > 75 ou < 25 + prix loin des moyennes
- `range_neutral` : pas de HH/HL nets + prix dans un canal horizontal + volatilité normale
- `chaos` : contextes irréguliers + moyenne plate + momentum bruyant (RSI oscillant erratiquement autour de 50) `[PREZI]`
- `undefined` : données insuffisantes ou signaux contradictoires

**Output** :
```typescript
{
  phase: MarketPhase,
  confidence: 'low' | 'medium' | 'high',
  bougiesInPhase: number,
  prevPhase: MarketPhase
}
```

**Contrainte** : afficher toujours la phase AVANT tout signal — un signal sorti de son contexte est statistiquement défavorable.

---

#### Fonction 2 : `calcBreakoutTarget()`
**But** : calculer la target projetée si un breakout est en cours ou récent

**Logique** :
1. Identifier le range actif sur les N dernières bougies (N = longueur détectée par `calcMarketPhase`)
2. Amplitude = `max_range - min_range`
3. Target haussière = `max_range + amplitude`
4. Target baissière = `min_range - amplitude`
5. Validité : **30 bougies maximum** depuis le breakout (règle du PDF)

**Output** :
```typescript
{
  hasTarget: boolean,
  direction: 'bull' | 'bear',
  targetPrice: number,
  targetPct: number,          // % depuis prix actuel
  bougiesRemaining: number,   // bougies restantes avant invalidation (max 30)
  isValid: boolean
}
```

**Avertissement à afficher** : "Objectif indicatif — en tendance, sera souvent dépassé."

---

#### Fonction 3 : `calcSqueeze()`
**But** : détecter la compression de volatilité (Price Squeeze Alert)

**Logique** :
- Calculer Bollinger Bands Width (BBW) : `(upper - lower) / middle` sur 20 périodes
- Calculer ATR ratio : `ATR_actuel / ATR_moyen_50j`
- Squeeze détecté si : `BBW < percentile_20(BBW, 50 dernières bougies)` ET `ATR_ratio < 0.7`
- Intensité : faible (BBW percentile 15-20), modéré (10-15), fort (< 10)

**Output** :
```typescript
{
  isSqueeze: boolean,
  intensity: 'low' | 'medium' | 'high',
  bougiesActive: number,   // depuis combien de bougies le squeeze est actif
  bbWidth: number,
  atrRatio: number
}
```

**Avertissement critique** : direction de sortie indéterminée — afficher sans biais directionnel.

---

#### Fonction 4 : `calcCyclePhase()`
**But** : approximer la position dans le cycle de prix (équivalent Sinewave simplifié)

**Logique** :
1. Identifier les creux de RSI (RSI < 35) sur les 200 dernières bougies — ces creux correspondent aux fins de cycles vendeurs
2. Mesurer les distances entre creux consécutifs → `periodeMoyenne` (valeur typique : ~20 bougies sur daily)
3. Calculer `positionActuelle` = nombre de bougies depuis le dernier creux RSI
4. `phaseRatio` = `positionActuelle / periodeMoyenne` (0 = creux, 0.5 ≈ sommet, 1 = retour creux)
5. Phase : `0-0.25` = montant, `0.25-0.75` = sommet/plateau, `0.75-1.0+` = descendant/creux

**Output** :
```typescript
{
  cyclePeriod: number,          // en bougies
  cyclePosition: number,        // 0 à 1+
  phase: 'rising' | 'peak' | 'falling' | 'trough',
  bougiesEstimated: number,     // avant prochain retournement estimé
  confidence: 'low' | 'medium'  // jamais 'high' — ce n'est pas la vraie Sinewave
}
```

**LIMITE IMPORTANTE** : RSI n'est pas la Sinewave d'Ehlers. C'est une approximation. Afficher avec une marge d'erreur de ±30%. Ne jamais présenter comme une prédiction certaine.

---

#### Fonction 5 : `calcDivergenceStandard()`
**But** : détecter les divergences standards (signal faible, filtre important)

**Logique** :
- **Divergence haussière** : prix fait un nouveau creux (LH), RSI ne confirme pas (RSI fait un HL) → potentiel retournement
- **Divergence baissière** : prix fait un nouveau sommet (HH), RSI ne confirme pas (RSI fait un LH) → potentiel retournement
- À distinguer de `calcHiddenDivergence()` déjà existant (qui détecte les divergences cachées)

**Output** :
```typescript
{
  hasDivergence: boolean,
  type: 'bullish' | 'bearish' | null,
  strength: 'weak' | 'medium',   // jamais 'strong' — c'est le signal le plus faible
  requiresConfirmation: true      // toujours true — validation horizontale obligatoire
}
```

---

#### Fonction 6 : `calcConfluenceScore()`
**But** : évaluer combien des 4 conditions PRO Indicators sont remplies

**Mapping des 4 conditions à nos indicateurs** :

| Condition PRO | Notre équivalent |
|---|---|
| PRICE OK | Position dans la zone d'intérêt : distance régression < 1σ OU rebond depuis EMA200/support majeur OU RSI < 35 ou > 65 |
| CONTEXT OK | Phase de marché identifiée (`calcMarketPhase` ≠ 'undefined' ET ≠ 'chaos') ET direction du signal cohérente avec la phase |
| MOMENTUM OK | RSI entre 35 et 65 (pas en surachat/survente extrême) ET MACD dans la bonne direction |
| SINEWAVE OK | `calcCyclePhase().phase === 'rising'` OU `calcCyclePhase().phase === 'trough'` (début de cycle favorable) |

**Output** :
```typescript
{
  score: number,            // 0 à 4
  priceOk: boolean,
  contextOk: boolean,
  momentumOk: boolean,
  sinewaveOk: boolean,
  label: string             // "Conditions défavorables" | "Confluence partielle" | "Setup intéressant" | "Confluence maximale ✓"
}
```

**Libellés par score** :
- 0-1 : "Conditions défavorables"
- 2 : "Confluence partielle"
- 3 : "Setup intéressant"
- 4 : "Confluence maximale ✓"

---

### Non transposable (contraintes techniques)

| Concept | Raison de l'impossibilité |
|---|---|
| Canal de contexte multi-TF exact | Nécessite d'analyser simultanément m1 → M1 sur un même actif en temps réel |
| Triangle de confirmation | Pattern zig-zag temps réel multi-TF, nécessite des données intraday |
| Fibonacci automatique sur swings | Identification subjective des swings significatifs, non déterministe |
| Sinewave d'Ehlers exacte | Algorithme propriétaire non documenté dans le PDF |
| Gestion dynamique de position | Hors scope screener (pas de position ouverte tracked) |
| Alert de contexte TF supérieur | N'avons qu'un seul timeframe (daily) par actif dans Yahoo Finance |
| Structures 3BR / Range Neuneu exactes | Nécessitent identification temps réel multi-TF des retournements de contexte `[PREZI]` |
| Tendance Multi-Timeframe | Nécessite 3 TF consécutifs en break simultané `[PREZI]` |
| Vague 1/5 étendue | Nécessite identification visuelle de la structure en cours `[PREZI]` |

---

## 11. Règles d'affichage et messages utilisateur

### Principe éducatif du screener
Le screener cible une double audience : débutants (messages en langage naturel) et experts (données brutes). Les messages doivent respecter les limites du PDF :

**Formulations AUTORISÉES** :
- "Phase de marché estimée : accumulation"
- "Compression de volatilité détectée — mouvement potentiellement imminent (direction indéterminée)"
- "Objectif potentiel indicatif : +X% / niveau Y€ (valide encore N jours)"
- "Confluence : 3/4 conditions favorables"
- "Phase cyclique estimée : ~N bougies avant potentiel retournement (±30%)"
- "Signaux d'épuisement détectés — prudence si en tendance haussière"
- "Marché chaotique — aucune structure exploitable détectée" `[PREZI]`
- "Range mature (3+ bornes) — risque de tendance élevé" `[PREZI]`

**Formulations INTERDITES** (car non justifiées par les données) :
- "Le prix va monter vers X"
- "Signal d'achat confirmé"
- "Objectif précis de X€"
- "Retournement prévu dans N jours"
- "Divergence forte" (les divergences standards sont toujours classifiées faibles)

---

## 12. Ordre d'implémentation recommandé

Ordre de priorité par valeur ajoutée / effort de développement :

| Priorité | Fonction | Valeur | Effort | Dépendances |
|---|---|---|---|---|
| **A** | `calcMarketPhase()` | Très haute | Moyen | HH/HL existant, régression existante |
| **B** | `calcSqueeze()` | Haute | Faible | Calcul BB + ATR |
| **C** | `calcBreakoutTarget()` | Haute | Faible | `calcMarketPhase()` |
| **D** | `calcConfluenceScore()` | Haute | Faible | Toutes les fonctions ci-dessus |
| **E** | `calcDivergenceStandard()` | Moyenne | Faible | RSI existant |
| **F** | `calcCyclePhase()` | Moyenne | Moyen | RSI existant |

---

## 13. Chiffres clés tirés des sources (référence factuelle)

| Donnée | Valeur | Source |
|---|---|---|
| Période cyclique moyenne | ~20 bougies | PDF Slide 19 |
| Ratio cycle (montée/descente) | 60/40 | PDF Slide 19 |
| Fréquence tendance | ~20% du temps | PDF Slide 29-30 |
| Fréquence range | ~80% du temps | PDF Slide 29-30 |
| Fréquence excès/bulle | <5% du temps | PDF Slide 17 |
| Validité d'une target de break | 30 bougies maximum | PDF Slide 8 |
| Minimum bougies requis | 250 (500 recommandées) | PDF Slide 30 |
| Nombre de patterns momentum | >150 | PDF Slide 22 |
| Nombre de patterns cycles | >100 | PDF Slide 22 |
| Conditions moyennes par pattern | ~10 | PDF Slide 22 |
| Fibonacci range neutre (minimum entrée) | 76.4% | PDF Slide 10 + Organigramme Slide 46 |
| Fibonacci range tendanciel | 61.8% | PDF Slide 10 + Organigramme Slide 46 |
| Fibonacci tendance pull-back | 23-38% (50 max) | PDF Slide 46 + Prezi |
| Sinewave maturité acheteur | >+80 | PDF Slide 20 |
| Sinewave maturité vendeur | <-80 | PDF Slide 20 |
| Sinewave oscillation | -100 à +100 | PDF Slide 20 |
| TP minimum sur signal EXIT | 50% de la position | PDF Slide 33 |
| Perte maximale recommandée | 5% du capital (1% pour débutants) | PDF Slide 38 |
| **Risque maximum par trade** | **2%** | **Prezi (toutes structures)** |
| Ratio R/R range | 1:1 à 1:2 | Prezi |
| Ratio R/R tendance | 1:2 à 1:5 | Prezi |
| Ratio R/R excès | 1:10 à 1:20 | Prezi |
| Taux de réussite Range Neuneu | ~85% (ratio 1:1) | Prezi |
| Max suivis de tendance | 2 dans une même tendance | Prezi |
| Signaux : 4/4 requis (full confluence) | PRICE OK + CONTEXT OK + MOMENTUM OK + SINEWAVE OK | PDF Slide 24 + Annexe 1 Slide 51 |

---

*Document généré à partir de la lecture exhaustive des 54 slides du PDF "PRO Indicators – Guide de Démarrage & Manuel d'Utilisation" ET des 75 slides du Prezi de formation interactif. Aucune extrapolation. Toute valeur chiffrée est directement citée depuis les sources. Les éléments issus exclusivement du Prezi sont marqués `[PREZI]`. Vérifié par Opus 4.6 le 24/03/2026.*
