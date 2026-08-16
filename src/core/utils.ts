/** Petites fonctions utilitaires partagées par tout le jeu. */

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Rapproche `a` de `b` d'une fraction dépendant du temps (amortissement stable par dt). */
export function damp(a: number, b: number, vitesse: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-vitesse * dt));
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 * Même graine = même map, ce qui garde le décor stable entre deux parties.
 */
export function makeRng(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nombre compact pour l'UI : 1234 → « 1,2k ». */
export function fmt(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return String(Math.floor(n));
}

/** Rectangle arrondi (utilisé pour les barres de vie et les libellés flottants). */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
