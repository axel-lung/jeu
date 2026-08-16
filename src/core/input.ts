/**
 * Entrées souris/clavier.
 *
 * Les évènements sont mis en file et consommés une fois par frame par le jeu
 * (`prendreClics`, `prendreTouches`), ce qui évite d'éparpiller des callbacks
 * qui muteraient l'état du jeu au milieu d'une mise à jour.
 */

export interface Clic {
  x: number;
  y: number;
  bouton: number; // 0 = gauche, 2 = droit
}

export class Input {
  souris = { x: 0, y: 0, surCanvas: false };
  touches = new Set<string>();

  private clics: Clic[] = [];
  private touchesPressees: string[] = [];
  private glisse = false;
  private aGlisse = false;
  /** Vrai si l'appui gauche courant a débuté sur le canvas et non sur un bouton du HUD. */
  private appuiSurCanvas = false;
  private dernier = { x: 0, y: 0 };

  /** Cumul du déplacement de la souris pendant un glisser-caméra, en pixels écran. */
  panEnAttente = { x: 0, y: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onMolette: (sx: number, sy: number, delta: number) => void,
  ) {
    canvas.addEventListener('mousemove', this.surMouvement);
    canvas.addEventListener('mousedown', this.surAppui);
    window.addEventListener('mouseup', this.surRelache);
    canvas.addEventListener('mouseleave', () => (this.souris.surCanvas = false));
    canvas.addEventListener('mouseenter', () => (this.souris.surCanvas = true));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', this.surMolette, { passive: false });
    window.addEventListener('keydown', this.surTouche);
    window.addEventListener('keyup', (e) => this.touches.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.touches.clear());
  }

  private position(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private surMouvement = (e: MouseEvent): void => {
    const p = this.position(e);
    this.souris.x = p.x;
    this.souris.y = p.y;
    this.souris.surCanvas = true;
    if (this.glisse) {
      const dx = p.x - this.dernier.x;
      const dy = p.y - this.dernier.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.aGlisse = true;
      this.panEnAttente.x += dx;
      this.panEnAttente.y += dy;
    }
    this.dernier = p;
  };

  private surAppui = (e: MouseEvent): void => {
    const p = this.position(e);
    this.dernier = p;
    // Bouton droit ou molette : glisser-caméra. Bouton gauche : action de jeu.
    if (e.button === 0) {
      this.appuiSurCanvas = true;
    } else if (e.button === 1 || e.button === 2) {
      this.glisse = true;
      this.aGlisse = false;
    }
  };

  private surRelache = (e: MouseEvent): void => {
    if (e.button === 0) {
      // Ce handler est sur window : sans ce garde, relâcher un bouton du HUD
      // enverrait aussi un clic de jeu sur la tuile située dessous.
      const valide = this.appuiSurCanvas;
      this.appuiSurCanvas = false;
      if (!valide) return;
      const p = this.position(e);
      if (p.x >= 0 && p.y >= 0 && p.x <= this.canvas.clientWidth && p.y <= this.canvas.clientHeight) {
        this.clics.push({ x: p.x, y: p.y, bouton: 0 });
      }
    } else if (e.button === 1 || e.button === 2) {
      // Un clic droit sans déplacement vaut « annuler », un glisser vaut déplacement caméra.
      if (this.glisse && !this.aGlisse) {
        const p = this.position(e);
        this.clics.push({ x: p.x, y: p.y, bouton: 2 });
      }
      this.glisse = false;
      this.aGlisse = false;
    }
  };

  private surMolette = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.position(e);
    this.onMolette(p.x, p.y, e.deltaY);
  };

  private surTouche = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    // Espace : évite de re-déclencher le bouton focalisé. Tab : évite de sortir du canvas.
    if (k === ' ' || k === 'tab') e.preventDefault();
    if (!this.touches.has(k)) this.touchesPressees.push(k);
    this.touches.add(k);
  };

  prendreClics(): Clic[] {
    const c = this.clics;
    this.clics = [];
    return c;
  }

  prendreTouches(): string[] {
    const t = this.touchesPressees;
    this.touchesPressees = [];
    return t;
  }

  prendrePan(): { x: number; y: number } {
    const p = { ...this.panEnAttente };
    this.panEnAttente.x = 0;
    this.panEnAttente.y = 0;
    return p;
  }

  estEnfoncee(...keys: string[]): boolean {
    return keys.some((k) => this.touches.has(k));
  }
}
