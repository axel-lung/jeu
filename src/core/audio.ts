/**
 * Le son du jeu, entièrement synthétisé.
 *
 * Aucun fichier audio n'est livré : chaque effet est fabriqué à la volée en Web
 * Audio, comme les sprites sont dessinés en Canvas et les icônes générées par
 * `scripts/generer-icones.mjs`. Trois conséquences pratiques :
 *
 *   - rien à télécharger, donc le jeu reste instantané et jouable hors ligne ;
 *   - rien à créditer ni à racheter le jour d'une sortie commerciale ;
 *   - un effet se règle en changeant deux nombres, pas en rouvrant un éditeur.
 *
 * Tout est « au mieux » : un navigateur qui refuse l'audio (contexte suspendu,
 * API absente, onglet muet) ne doit jamais casser la partie. Chaque appel est
 * donc protégé et son échec ignoré.
 */

/** Les effets ponctuels que le jeu sait déclencher. */
export type Effet =
  | 'tir-coq'
  | 'tir-aigle'
  | 'impact'
  | 'mort'
  | 'mort-boss'
  | 'pose'
  | 'eclosion'
  | 'ameliorer'
  | 'vendre'
  | 'refus'
  | 'fuite'
  | 'vague'
  | 'boss'
  | 'victoire'
  | 'defaite'
  | 'clic';

/** L'ambiance de fond suit ce que le joueur est en train de faire. */
export type Ambiance = 'menu' | 'ferme' | 'defense' | 'assaut' | null;

/**
 * Intervalle minimal entre deux exemplaires d'un même effet, en secondes.
 * Dix tours qui tirent ensemble ne doivent pas donner dix impacts superposés :
 * au-delà, c'est du bruit blanc et ça sature.
 */
const REPOS: Partial<Record<Effet, number>> = {
  'tir-coq': 0.06,
  'tir-aigle': 0.08,
  impact: 0.05,
  mort: 0.04,
  eclosion: 0.15,
  // Le joueur qui insiste sur une tour trop chère ne doit pas déclencher un buzz
  // par tap : un rappel toutes les quelques dixièmes suffit à faire comprendre.
  refus: 0.35,
};

/** Plafond de voix simultanées : au-delà, les nouveaux sons sont abandonnés. */
const VOIX_MAX = 24;

/** Gammes utilisées par l'ambiance, en demi-tons depuis la fondamentale. */
const PENTA_MAJEURE = [0, 2, 4, 7, 9, 12, 14, 16];
const PENTA_MINEURE = [0, 3, 5, 7, 10, 12, 15, 17];

/** Fréquence d'un demi-ton au-dessus du la 220 Hz. */
function note(demiTons: number, base = 220): number {
  return base * Math.pow(2, demiTons / 12);
}

class Audio {
  private ctx: AudioContext | null = null;
  private busEffets: GainNode | null = null;
  private busMusique: GainNode | null = null;
  /** Bruit blanc d'une seconde, réutilisé par tous les effets percussifs. */
  private bruitBlanc: AudioBuffer | null = null;

  private voix = 0;
  private readonly dernier = new Map<Effet, number>();

  private ambianceCourante: Ambiance = null;
  private minuterie: number | null = null;
  /** Instant (horloge audio) jusqu'auquel l'ambiance est déjà écrite. */
  private ecritJusqua = 0;
  private mesure = 0;

  /** Réglages du joueur, restitués par la sauvegarde au démarrage. */
  effetsActifs = true;
  musiqueActive = true;

  /**
   * Crée le contexte audio. À appeler depuis un geste du joueur : tous les
   * navigateurs refusent de démarrer le son autrement.
   */
  demarrer(): void {
    try {
      if (!this.ctx) this.construire();
      // Un contexte créé hors geste naît suspendu : le geste le réveille.
      void this.ctx?.resume().catch(() => {});
    } catch {
      // Pas d'audio sur cette plateforme : le jeu continue en silence.
    }
  }

  private construire(): void {
    const Constructeur = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructeur) return;
    const ctx = new Constructeur();

    // Un compresseur en sortie : dix tours qui tirent ensemble saturent sinon.
    const compresseur = ctx.createDynamicsCompressor();
    compresseur.threshold.value = -18;
    compresseur.ratio.value = 6;
    compresseur.attack.value = 0.003;
    compresseur.release.value = 0.2;

    const maitre = ctx.createGain();
    maitre.gain.value = 0.9;
    const busEffets = ctx.createGain();
    busEffets.gain.value = 0.85;
    const busMusique = ctx.createGain();
    busMusique.gain.value = 0.5;

    busEffets.connect(maitre);
    busMusique.connect(maitre);
    maitre.connect(compresseur);
    compresseur.connect(ctx.destination);

    // Le bruit blanc sert de transitoire à tous les effets percussifs.
    const bruit = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const donnees = bruit.getChannelData(0);
    for (let i = 0; i < donnees.length; i++) donnees[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.busEffets = busEffets;
    this.busMusique = busMusique;
    this.bruitBlanc = bruit;

    // Onglet en arrière-plan : on suspend, sinon l'ambiance vide la batterie.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.ctx?.suspend().catch(() => {});
      else if (this.ambianceCourante || this.effetsActifs) void this.ctx?.resume().catch(() => {});
    });
  }

  /** Coupe ou rétablit les bruitages. */
  basculerEffets(actif: boolean): void {
    this.effetsActifs = actif;
    if (this.busEffets && this.ctx) {
      this.busEffets.gain.setTargetAtTime(actif ? 0.85 : 0, this.ctx.currentTime, 0.02);
    }
  }

  /** Coupe ou rétablit l'ambiance musicale. */
  basculerMusique(active: boolean): void {
    this.musiqueActive = active;
    if (this.busMusique && this.ctx) {
      this.busMusique.gain.setTargetAtTime(active ? 0.5 : 0, this.ctx.currentTime, 0.05);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Briques de synthèse                                              */
  /* ---------------------------------------------------------------- */

  /** Une note enveloppée. `depart` et `arrivee` permettent un glissando. */
  private ton(
    debut: number,
    duree: number,
    depart: number,
    arrivee: number,
    forme: OscillatorType,
    volume: number,
    bus: GainNode,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = forme;
    osc.frequency.setValueAtTime(depart, debut);
    if (arrivee !== depart) osc.frequency.exponentialRampToValueAtTime(arrivee, debut + duree);

    // Attaque très courte plutôt qu'instantanée : sans elle, chaque note claque.
    gain.gain.setValueAtTime(0.0001, debut);
    gain.gain.exponentialRampToValueAtTime(volume, debut + Math.min(0.012, duree * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);

    osc.connect(gain);
    gain.connect(bus);
    osc.start(debut);
    osc.stop(debut + duree + 0.02);
    this.compter(osc);
  }

  /** Une bouffée de bruit filtrée : le « souffle » des impacts et des explosions. */
  private souffle(
    debut: number,
    duree: number,
    coupure: number,
    volume: number,
    bus: GainNode,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.bruitBlanc) return;
    const source = ctx.createBufferSource();
    source.buffer = this.bruitBlanc;
    source.loop = true;

    const filtre = ctx.createBiquadFilter();
    filtre.type = 'lowpass';
    filtre.frequency.setValueAtTime(coupure, debut);
    filtre.frequency.exponentialRampToValueAtTime(Math.max(120, coupure * 0.25), debut + duree);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, debut);
    gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);

    source.connect(filtre);
    filtre.connect(gain);
    gain.connect(bus);
    source.start(debut);
    source.stop(debut + duree + 0.02);
    this.compter(source);
  }

  /** Tient le compte des voix vivantes, pour ne pas en empiler des centaines. */
  private compter(source: AudioScheduledSourceNode): void {
    this.voix++;
    source.onended = () => {
      this.voix--;
      source.disconnect();
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Effets                                                           */
  /* ---------------------------------------------------------------- */

  jouer(effet: Effet): void {
    const ctx = this.ctx;
    const bus = this.busEffets;
    if (!ctx || !bus || !this.effetsActifs || ctx.state !== 'running') return;
    if (this.voix > VOIX_MAX) return;

    const maintenant = ctx.currentTime;
    const repos = REPOS[effet];
    if (repos !== undefined) {
      const precedent = this.dernier.get(effet) ?? -Infinity;
      if (maintenant - precedent < repos) return;
      this.dernier.set(effet, maintenant);
    }

    const t = maintenant + 0.001;

    switch (effet) {
      // Le coq pique : sec, clair, très court.
      case 'tir-coq':
        this.ton(t, 0.09, note(19), note(12), 'triangle', 0.16, bus);
        this.souffle(t, 0.05, 3200, 0.05, bus);
        break;

      // L'aigle fond : plus haut, avec une descente rapide.
      case 'tir-aigle':
        this.ton(t, 0.13, note(28), note(16), 'sawtooth', 0.1, bus);
        this.souffle(t, 0.06, 5000, 0.04, bus);
        break;

      case 'impact':
        this.souffle(t, 0.05, 1800, 0.07, bus);
        break;

      // Mort d'un ennemi : un « pop » descendant, jamais agressif.
      case 'mort':
        this.ton(t, 0.16, note(14), note(2), 'square', 0.09, bus);
        this.souffle(t, 0.1, 1400, 0.06, bus);
        break;

      case 'mort-boss':
        this.ton(t, 0.7, note(7), note(-17), 'sawtooth', 0.16, bus);
        this.ton(t + 0.02, 0.9, note(-12), note(-24), 'sine', 0.22, bus);
        this.souffle(t, 0.55, 2200, 0.2, bus);
        break;

      // Pose d'une tour : deux notes qui montent, la confirmation du geste.
      case 'pose':
        this.ton(t, 0.09, note(7), note(7), 'triangle', 0.13, bus);
        this.ton(t + 0.07, 0.13, note(14), note(14), 'triangle', 0.13, bus);
        this.souffle(t, 0.09, 900, 0.09, bus);
        break;

      // Éclosion d'un bébé : un pépiement, ascendant et court.
      case 'eclosion':
        this.ton(t, 0.07, note(24), note(31), 'triangle', 0.11, bus);
        this.ton(t + 0.08, 0.09, note(28), note(36), 'triangle', 0.09, bus);
        break;

      // Amélioration : l'arpège de récompense.
      case 'ameliorer':
        this.ton(t, 0.1, note(12), note(12), 'triangle', 0.12, bus);
        this.ton(t + 0.08, 0.1, note(16), note(16), 'triangle', 0.12, bus);
        this.ton(t + 0.16, 0.24, note(19), note(19), 'triangle', 0.14, bus);
        this.ton(t + 0.16, 0.24, note(24), note(24), 'sine', 0.1, bus);
        break;

      // Revente : le même arpège à l'envers, en plus terne.
      case 'vendre':
        this.ton(t, 0.09, note(16), note(16), 'sine', 0.11, bus);
        this.ton(t + 0.07, 0.16, note(9), note(9), 'sine', 0.11, bus);
        break;

      // Achat impossible : un buzz bas, sans agressivité.
      case 'refus':
        this.ton(t, 0.14, note(-5), note(-9), 'square', 0.07, bus);
        break;

      // Vie perdue : le seul son vraiment inquiétant du jeu.
      case 'fuite':
        this.ton(t, 0.32, note(-3), note(-15), 'sawtooth', 0.14, bus);
        this.souffle(t, 0.25, 700, 0.1, bus);
        break;

      // Départ de vague : deux notes tenues, comme un cor.
      case 'vague':
        this.ton(t, 0.3, note(0), note(0), 'sawtooth', 0.09, bus);
        this.ton(t + 0.001, 0.3, note(7), note(7), 'sawtooth', 0.07, bus);
        this.ton(t + 0.26, 0.42, note(12), note(12), 'sawtooth', 0.1, bus);
        break;

      // Boss : le même appel, une octave plus bas et en mineur.
      case 'boss':
        this.ton(t, 0.5, note(-12), note(-12), 'sawtooth', 0.13, bus);
        this.ton(t + 0.001, 0.5, note(-9), note(-9), 'sawtooth', 0.09, bus);
        this.ton(t + 0.45, 0.9, note(-5), note(-5), 'sawtooth', 0.13, bus);
        this.souffle(t, 0.9, 500, 0.09, bus);
        break;

      case 'victoire':
        for (const [i, d] of [0, 4, 7, 12, 16].entries()) {
          this.ton(t + i * 0.11, 0.5, note(d), note(d), 'triangle', 0.12, bus);
        }
        break;

      case 'defaite':
        for (const [i, d] of [7, 3, 0, -5].entries()) {
          this.ton(t + i * 0.17, 0.6, note(d), note(d), 'sawtooth', 0.1, bus);
        }
        break;

      case 'clic':
        this.ton(t, 0.035, note(21), note(21), 'triangle', 0.055, bus);
        break;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Ambiance                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Change le fond sonore. L'ambiance est écrite à l'avance par petits blocs :
   * une minuterie ne suffit pas à caler des notes, seul l'horloge audio est
   * assez régulière pour ça.
   */
  ambiance(scene: Ambiance): void {
    if (scene === this.ambianceCourante) return;
    this.ambianceCourante = scene;
    // Le bloc déjà écrit finit de jouer, le suivant repart sur la nouvelle scène.
    this.ecritJusqua = Math.max(this.ecritJusqua, this.ctx?.currentTime ?? 0);

    if (!scene) {
      if (this.minuterie !== null) {
        clearInterval(this.minuterie);
        this.minuterie = null;
      }
      return;
    }
    if (this.minuterie === null) {
      this.minuterie = setInterval(() => this.ecrireAmbiance(), 250) as unknown as number;
    }
  }

  private ecrireAmbiance(): void {
    const ctx = this.ctx;
    const bus = this.busMusique;
    const scene = this.ambianceCourante;
    if (!ctx || !bus || !scene || !this.musiqueActive || ctx.state !== 'running') return;

    const maintenant = ctx.currentTime;
    if (this.ecritJusqua < maintenant) this.ecritJusqua = maintenant + 0.05;
    // On garde une seconde d'avance : de quoi absorber un ralentissement de frame.
    if (this.ecritJusqua > maintenant + 1) return;

    // L'assaut presse le pas ; la ferme et le menu respirent.
    const assaut = scene === 'assaut';
    const duree = assaut ? 3.4 : 4.8;
    const gamme = assaut ? PENTA_MINEURE : PENTA_MAJEURE;
    const base = assaut ? 196 : 220;

    // Une couleur d'accord par mesure, en boucle de quatre.
    const accords = assaut
      ? [
          [0, 3, 7],
          [-2, 3, 5],
          [-4, 0, 3],
          [-5, -1, 2],
        ]
      : [
          [0, 4, 7],
          [-3, 0, 4],
          [-5, -1, 2],
          [-7, -3, 0],
        ];
    const accord = accords[this.mesure % accords.length];
    const debut = this.ecritJusqua;

    // Nappe : trois voix légèrement désaccordées, filtrées bas, très douces.
    for (const demi of accord) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filtre = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.value = note(demi - 12, base) * (1 + (Math.random() - 0.5) * 0.006);
      filtre.type = 'lowpass';
      filtre.frequency.value = assaut ? 620 : 480;
      filtre.Q.value = 0.7;

      gain.gain.setValueAtTime(0.0001, debut);
      gain.gain.exponentialRampToValueAtTime(0.05, debut + duree * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);

      osc.connect(filtre);
      filtre.connect(gain);
      gain.connect(bus);
      osc.start(debut);
      osc.stop(debut + duree + 0.05);
      this.compter(osc);
    }

    // Quelques notes pincées par-dessus, jamais sur tous les temps : c'est ce
    // qui empêche la boucle de s'entendre comme une boucle.
    const temps = assaut ? 8 : 6;
    for (let i = 0; i < temps; i++) {
      if (Math.random() > (assaut ? 0.45 : 0.3)) continue;
      const quand = debut + (i * duree) / temps;
      const demi = gamme[Math.floor(Math.random() * gamme.length)];
      this.ton(quand, 0.5, note(demi, base), note(demi, base), 'triangle', 0.045, bus);
    }

    // Une pulsation grave sur le premier temps, seulement pendant l'assaut.
    if (assaut) {
      this.ton(debut, 0.28, note(-24, base), note(-31, base), 'sine', 0.16, bus);
      this.ton(debut + duree / 2, 0.22, note(-24, base), note(-31, base), 'sine', 0.1, bus);
    }

    this.ecritJusqua = debut + duree;
    this.mesure++;
  }
}

/** Instance unique : il n'y a qu'une sortie audio. */
export const audio = new Audio();
