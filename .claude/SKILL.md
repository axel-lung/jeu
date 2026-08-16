### **Concept général**

- **Genre** : Hybride tower defense (BTD6) + RTS gestion (AoE), en **2.5D isométrique** (sprites 2D avec profondeur, ombres dynamiques, animations cartoon).
- **Thème** : Nations du monde. **Tours** = animaux nationaux adultes (ex. : Coq France, Aigle USA). **Ouvriers** = bébés animaux (ex. : Poussins, Aiglons) avec buffs farming par pays. **Héros** = créatures mythologiques déplaçables (ex. : Griffon, Qilin). **Ennemis** = créatures chibi mignonnes mais vicieuses (ex. : Goblinets, Bunny Demons).
- **Map** : Divisée en deux zones :
    - **Défense** : Chemin fixe pour ennemis, grille pour tours fixes, héros mobiles.
    - **Farm** : Zone sécurisée (pour l’instant, raids ennemis possibles Âge 3+), avec spots ressources et bâtiments.
- **Objectif** : Survivre 50 vagues d’ennemis (boss à 10/20/30/50) en gérant économie (ressources : nourriture, bois, or, pierre) et défense (âmes pour upgrades). Option : capturer point ennemi (AoE twist).
- **Visuel** : Cartoon kawaii (gros yeux, couleurs vives, explosions confettis). Ennemis pop en étoiles noires, bébés bouncy, tours/héros épiques.

---

### **Zone Défense**

- **Structure** : Chemin sinueux (ex. : routes pavées/jungle selon thème pays) que les ennemis doivent emprunter (entrée → sortie). Sortie atteinte = perte vies (ex. : -1 vie/goblinet, -10/boss). Grille isométrique autour pour poser **tours animales fixes**.
- **Tours animales** : Animaux nationaux, rôles variés (anti-masse, anti-air, tank, etc.). Coût initial : ressources farm (ex. : 100 or + 50 bois). Upgrades via **âmes** (monnaie in-game, drop ennemis). Exemples (12 pays) :
    - **France : Coq Gaulois** (pics rapides anti-masse, upgrades : AoE, stun feu d’artifice).
    - **USA : Aigle Chauve** (anti-air piqué, upgrades : éclairs anti-lead).
    - **Chine : Panda Géant** (tank roulant, upgrades : bambou empoisonné).
    - **Australie : Kangourou** (sauts anti-rapide, upgrades : coup de poing AoE).
    - **UK : Lion** (rugissement stun, upgrades : buff global).
    - **Inde : Tigre** (furtif, upgrades : poison).
    - **Japon : Grue** (précision anti-air, upgrades : vent repoussoir).
    - **Égypte : Faucon** (dive rapide, upgrades : détection camo).
    - **Afrique du Sud : Springbok** (dash anti-rapide, upgrades : cornes perçantes).
    - **Brésil : Jaguar** (poison stealth, upgrades : morsure critique).
    - **Russie : Ours** (melee tank, upgrades : griffes anti-siège).
    - **Canada : Castor** (barrage ralentisseur, upgrades : inondation AoE).
- **Héros mythologiques** : Déplaçables librement (clic-droit, comme héros BTD6). Coût : âmes + ressources (ex. : Griffon = 50 âmes + 100 or). Pouvoirs spéciaux (cooldown 30s). Exemples :
    - **France : Griffon** (volant, stun AoE).
    - **Chine : Qilin** (tank, heal bébés).
    - **USA : Thunderbird** (éclairs anti-air).
    - **Japon : Kitsune** (furtif, détecte camo).
    - Max 2-3 héros/partie, boost tours proches (+10% vitesse).
- **Âmes** : Dropées par ennemis tués (ex. : Goblinet = 1 âme, Boss = 50). Utilisées pour :
    - Upgrades tours (ex. : Coq lvl2 = 30 âmes, +AoE).
    - Pouvoirs temporaires (ex. : Lion rugissement = 15 âmes, stun 3s).
    - Déblocage héros (ex. : Griffon = 50 âmes).
- **2.5D** : Chemin avec reliefs (ombres), tours pop (ex. : Panda roule, Kangourou saute). Animations flashy (explosions confettis, héros épiques).

---

### **Zone Farm**

- **Structure** : Zone sécurisée (village cozy 2.5D, ex. : champs lumineux, mines scintillantes). Spots ressources (farms, arbres, mines, carrières). **Bébés animaux** placés pour récolter (1/spot, comme villageois AoE). Brouillard de guerre optionnel pour exploration.
- **Ressources** : 4 types (nourriture, bois, or, pierre). Spots limités (ex. : 5 farms, 3 mines, 2 carrières/map).
- **Bébés animaux** : Ouvriers par pays, buffs farming. Coût : 50 nourriture (10s création). Limite : 20 bébés/map. Récolte : 1 ressource/s (base) + buff. Exemples :
    - **France : Poussins** (+25% nourriture, farms blé).
    - **Canada : Castorons** (+30% bois, arbres).
    - **USA : Aiglons** (+15% or, mines).
    - **Australie : Joeys** (+20% pierre, carrières).
    - **UK : Lionceaux** (+20% bois).
    - **Chine : Bébés Pandas** (+30% nourriture, bambou).
    - **Inde : Tigreaux** (+25% nourriture, riz).
    - **Japon : Oisillons Grue** (+15% bois, sakura).
    - **Égypte : Fauconneaux** (+20% or, Nil).
    - **Afrique du Sud : Faons Springbok** (+25% nourriture, savane).
    - **Brésil : Jaguarons** (+20% bois, Amazonie).
    - **Russie : Oursons** (+15% pierre, taïga).
- **Bâtiments ressources** : Construits près spots, boostent farming.
    - **Moulin/Ferme** : 100 bois, +2 spots farms, +10% nourriture.
    - **Camp Bûches** : 75 bois, +2 spots arbres, drop-off auto.
    - **Camp Mines** : 100 pierre, +2 spots or/pierre.
    - **Entrepôt** : 50 chaque ressource, stock infini, +5% prod globale.
- **Bâtiments animaux** : Par pays, débloquent upgrades tours (research 30-60s) + bébés. Ex. :
    - **Nid Coq (France)** : 200 nourriture + 100 bois. Research : “Pics Infernaux” (Coq lvl4, +50% dmg volants, activable défense 200 âmes). +5 Poussins.
    - **Tanière Lion (UK)** : 150 bois + 100 or. Research : “Rugissement Global” (stun map, 150 âmes). +5 Lionceaux.
    - **Perchoir Aigle (USA)** : 150 or + 50 pierre. Research : “Éclairs Anti-Lead” (150 âmes). +5 Aiglons.
- **2.5D** : Village lumineux, bébés bouncy (ex. : Poussins picorent, Joeys sautillent). Bâtiments avec drapeaux pays, animations cozy (fumée cheminée, scintillement mines).

---

### **Ennemis mignons mais méchants**

- **Comportement** : Suivent chemin zone défense, pillent ressources si passent sortie (ex. : -10 nourriture/goblinet). Types : masse, rapides, volants, tanks, stealth, élites, boss. Évolutifs (fortifié, camo, lead, regrow). Thèmes régionaux (ex. : “Horde Gauloise”).
- **Liste (7 types)** :
    1. **Goblinets Pilleurs** (masse, Europe) : Chibi, sacs géants, yeux larmoyants. Pillage : -10 nourriture. RBE : 1-5. Contre : Coq, Panda.
    2. **Bunny Demons** (rapides, Asie) : Lapins cornes, sprint. Pillage : -5 bois. RBE : 2-10 (camo). Contre : Kangourou, Tigre.
    3. **Chibi Bats** (volants, Amériques) : Chauves-souris cœur, bombes confettis (-10% vitesse tours). RBE : 3-15 (lead). Contre : Aigle, Faucon.
    4. **Slime Puddles** (tanks, Afrique) : Slimes rebondissants, régénèrent 5% HP/s, -5% HP tour/s. RBE : 10-50. Contre : Lion, Ours.
    5. **Ghosties Ninjas** (stealth, Moyen-Orient) : Fantômes chibi, invisibles, -10 or. RBE : 5-20 (camo). Contre : Tigre, Sphinx.
    6. **Pixie Raiders** (élite, Océanie) : Fées lances, invoquent 2 goblinets, régénèrent 10% HP/s. RBE : 8-30 (regrow). Contre : Jaguar, Grue.
    7. **Mini-Boss : Chibi Titans** (varie) : Géants (ex. : Jaguar Warrior Aztèque), bouclier 50% HP, spawn 3 goblinets. RBE : 100-500 (lead). Contre : Qilin, Griffon.
- **2.5D** : Gros yeux, bounces, explosions étoiles noires. Ex. : Bunny Demons sautent avec traînée floue, Titans font trembler sol.

---

### **Gameplay Loop**

1. **Début (Âge Pierre)** : Place tours basiques (ex. : Coq = 100 or) zone défense. Tue ennemis → âmes (ex. : 1/goblinet) pour upgrades rapides (ex. : +10% dmg = 5 âmes). Ressources limitées (or start).
2. **Mid-game (Âge Bronze)** : Zone farm active. Construis moulins/camps (ex. : Moulin = 100 bois), élève bébés (50 nourriture, ex. : Poussins +25% nourriture). Débloque héros (ex. : Griffon = 50 âmes + 100 or). Vagues + dures (volants, stealth).
3. **Late-game (Âge Fer/Empire)** : Construis bâtiments animaux (ex. : Nid Coq = 200 nourriture + 100 bois) → research upgrades (ex. : Pics Infernaux, activable défense 200 âmes). Déploie 2-3 héros, gère boss (ex. : Titan = 500 RBE).
4. **Victoire** : Survis 50 vagues ou capture point ennemi (AoE-style). Ennemis pillent si passent (ex. : -10 nourriture/goblinet).
5. **2.5D** : Défense = chaos (confettis, héros flashy). Farm = cozy (bébés picorent, drapeaux pays). UI : ressources + âmes en haut, menu tours/héros clic-droit.

---

### **Balancing clés**

- **Ressources** : Nourriture = bébés/tours HP, Bois = bâtiments/tours rayon, Or = héros/dégâts, Pierre = upgrades armure. Start : 200 or, 100 nourriture.
- **Âmes** : 1-50 par ennemi, cumul rapide early (ex. : 100 âmes vague 10). Late-game : coûteux (ex. : upgrade lvl4 = 200 âmes).
- **Vagues** : 50/map, boss 10/20/30/50. Early : masse (goblinets), Mid : mixtes (bats, slimes), Late : boss + élites.
- **Synergie** : Bâtiments animaux boostent âmes (+10% drop). Héros boostent tours pays (+10% vitesse).