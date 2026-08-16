/**
 * Sprites dessinés à la main en Canvas 2D — aucun asset externe.
 *
 * Convention commune à toutes les fonctions :
 *   (x, y) est le point d'appui au sol, dans l'espace monde. Le corps se dessine
 *   donc vers les y négatifs. `s` est un facteur d'échelle, `t` l'horloge de
 *   l'entité (pour désynchroniser les animations).
 */

import type { TypeDecor } from '../game/map';

/** Ombre portée au sol : c'est elle qui « pose » le sprite sur la tuile en 2.5D. */
export function ombre(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  alpha = 0.28,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  couleur: string,
  contour?: string,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = couleur;
  ctx.fill();
  if (contour) {
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = contour;
    ctx.stroke();
  }
}

/** Les gros yeux brillants qui font tout le style kawaii. */
export function yeux(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ecart: number,
  r: number,
  opts: { mechant?: boolean; lueur?: string } = {},
): void {
  for (const cote of [-1, 1]) {
    const ex = cx + cote * ecart;
    ellipse(ctx, ex, cy, r, r * 1.12, opts.lueur ?? '#14121c');
    // Reflets
    ellipse(ctx, ex - r * 0.3, cy - r * 0.38, r * 0.32, r * 0.34, '#ffffff');
    ellipse(ctx, ex + r * 0.34, cy + r * 0.3, r * 0.16, r * 0.17, 'rgba(255,255,255,0.75)');
    if (opts.mechant) {
      // Sourcil incliné : mignon mais vicieux
      ctx.strokeStyle = '#3a2233';
      ctx.lineWidth = r * 0.42;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - cote * r * 0.9, cy - r * 1.5);
      ctx.lineTo(ex + cote * r * 0.7, cy - r * 0.95);
      ctx.stroke();
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Tours                                                              */
/* ------------------------------------------------------------------ */

/** Coq Gaulois — France. Bleu-blanc-rouge, crête dressée, pose fière. */
export function dessinerCoq(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
  niveau: number,
  versGauche: boolean,
  recul: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(versGauche ? -s : s, s);

  const bob = Math.sin(t * 2.6) * 1.2;
  const pique = recul * 5; // le corps plonge en avant au moment du coup de bec

  // Pattes
  ctx.strokeStyle = '#e8912f';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  for (const dx of [-4, 4]) {
    ctx.beginPath();
    ctx.moveTo(dx, -6);
    ctx.lineTo(dx, -1);
    ctx.moveTo(dx - 3, -1);
    ctx.lineTo(dx + 3, -1);
    ctx.stroke();
  }

  // Queue en panache bleu
  ctx.save();
  ctx.translate(-9, -18 + bob);
  for (let i = 0; i < 3; i++) {
    ctx.rotate(-0.22);
    ellipse(ctx, -5 - i * 1.5, -3 - i * 3, 8 - i, 3.2, i % 2 ? '#2f5bd0' : '#4f7dff', '#1f3a8a');
  }
  ctx.restore();

  // Corps
  ellipse(ctx, 0, -16 + bob, 11, 12.5, '#f7f8ff', '#c8cde6');
  // Aile rouge
  ellipse(ctx, 3, -16 + bob, 6, 7.5, '#e4453f', '#a72a26');

  // Tête
  const hx = 5 + pique;
  const hy = -33 + bob + pique * 0.4;
  ellipse(ctx, hx, hy, 8, 8, '#f7f8ff', '#c8cde6');

  // Crête
  ctx.fillStyle = '#e4453f';
  ctx.beginPath();
  ctx.moveTo(hx - 5, hy - 6);
  for (let i = 0; i < 3; i++) {
    ctx.lineTo(hx - 4 + i * 4, hy - 13 - (i === 1 ? 3 : 0));
    ctx.lineTo(hx - 1 + i * 4, hy - 6);
  }
  ctx.closePath();
  ctx.fill();

  // Barbillon + bec
  ellipse(ctx, hx + 4, hy + 6, 2.4, 3.4, '#e4453f');
  ctx.fillStyle = '#ffc44d';
  ctx.beginPath();
  ctx.moveTo(hx + 6, hy + 1);
  ctx.lineTo(hx + 15, hy + 3);
  ctx.lineTo(hx + 6, hy + 5.5);
  ctx.closePath();
  ctx.fill();

  yeux(ctx, hx + 2, hy - 1, 3.6, 2.6);

  // Marques de niveau : écharpe, anneau doré, puis étincelles
  if (niveau >= 2) {
    ctx.fillStyle = '#2f5bd0';
    ctx.fillRect(hx - 7, hy + 7, 13, 3);
  }
  if (niveau >= 3) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, -16 + bob, 12.5, 14, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (niveau >= 4) {
    for (let i = 0; i < 3; i++) {
      const a = t * 2.4 + (i * Math.PI * 2) / 3;
      etoile(ctx, Math.cos(a) * 15, -22 + Math.sin(a) * 9, 2.6, '#ffd166');
    }
  }
  ctx.restore();
}

/** Aigle Chauve — USA. Tête blanche, bec crochu jaune, ailes déployées. */
export function dessinerAigle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
  niveau: number,
  versGauche: boolean,
  recul: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(versGauche ? -s : s, s);

  const bob = Math.sin(t * 1.8) * 1.6;
  const ouverture = 1 + recul * 0.5;

  // Perchoir
  ellipse(ctx, 0, -3, 12, 5, '#6b7b95');
  ellipse(ctx, 0, -5, 10, 4, '#8b9bb5');

  // Ailes (elles s'ouvrent quand l'aigle tire)
  for (const cote of [-1, 1]) {
    ctx.save();
    ctx.translate(cote * 7, -20 + bob);
    ctx.rotate(cote * -0.35 * ouverture);
    ellipse(ctx, cote * 6, 0, 11 * ouverture, 5.5, '#6b4a2f', '#402c1b');
    ctx.restore();
  }

  // Corps
  ellipse(ctx, 0, -19 + bob, 10, 12, '#7c5636', '#4a3320');
  // Plastron
  ellipse(ctx, 0, -14 + bob, 5.5, 6, '#8f6741');

  // Tête blanche
  const hx = 3 + recul * 3;
  const hy = -34 + bob;
  ellipse(ctx, hx, hy, 8, 7.6, '#f4f6fb', '#c8cde6');

  // Bec crochu
  ctx.fillStyle = '#ffc02e';
  ctx.beginPath();
  ctx.moveTo(hx + 5, hy - 1);
  ctx.lineTo(hx + 15, hy + 2);
  ctx.quadraticCurveTo(hx + 12, hy + 7, hx + 5, hy + 4);
  ctx.closePath();
  ctx.fill();

  yeux(ctx, hx + 1, hy - 2, 3.4, 2.4, { mechant: true });

  if (niveau >= 2) {
    ellipse(ctx, 0, -12 + bob, 4, 4, '#c0392b'); // médaille
  }
  if (niveau >= 3) {
    ctx.fillStyle = '#3b5bbf';
    ctx.fillRect(-8, -10 + bob, 16, 3);
    ctx.fillStyle = '#e8e8f5';
    ctx.fillRect(-8, -7 + bob, 16, 2);
  }
  if (niveau >= 4) {
    // Arcs électriques autour du rapace
    ctx.strokeStyle = 'rgba(140, 220, 255, 0.9)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 13, -20 + Math.sin(a) * 8);
      ctx.lineTo(Math.cos(a + 0.6) * 17, -24 + Math.sin(a + 0.6) * 10);
      ctx.lineTo(Math.cos(a + 1.2) * 13, -18 + Math.sin(a + 1.2) * 8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Ennemis                                                            */
/* ------------------------------------------------------------------ */

/** Goblinet Pilleur — chibi vert, sac de butin plus gros que lui, yeux larmoyants. */
export function dessinerGoblinet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  const bob = Math.sin(t * 8) * 1.4;

  // Sac de butin dans le dos
  ellipse(ctx, -8, -13 + bob, 6.5, 7.5, '#a9743f', '#6d4726');
  ctx.strokeStyle = '#6d4726';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-10, -19 + bob);
  ctx.lineTo(-6, -19 + bob);
  ctx.stroke();

  // Jambes
  ctx.strokeStyle = '#4f9a45';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  for (const dx of [-3.5, 3.5]) {
    ctx.beginPath();
    ctx.moveTo(dx, -5);
    ctx.lineTo(dx + Math.sin(t * 8 + dx) * 1.5, -0.5);
    ctx.stroke();
  }

  // Corps
  ellipse(ctx, 0, -11 + bob, 7.5, 7, '#7bd66b', '#3f8b3a');
  // Tête
  const hy = -20 + bob;
  ellipse(ctx, 0, hy, 8.5, 8, '#8fe07d', '#3f8b3a');

  // Oreilles pointues
  ctx.fillStyle = '#8fe07d';
  for (const cote of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cote * 7, hy - 2);
    ctx.lineTo(cote * 14, hy - 7);
    ctx.lineTo(cote * 7, hy + 3);
    ctx.closePath();
    ctx.fill();
  }

  yeux(ctx, 0, hy - 1, 3.6, 3);
  // Larme au coin de l'œil : mignon jusqu'au moment où il pille
  ellipse(ctx, 4.6, hy + 3, 1.1, 1.6, '#8fd9ff');

  // Petite bouche
  ctx.strokeStyle = '#2f6b2c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, hy + 4, 2.2, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.restore();
}

/** Bunny Demon — lapin rose à cornes, sprinte en laissant une traînée. */
export function dessinerBunny(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  const bob = Math.sin(t * 10) * 1;

  // Queue pompon
  ellipse(ctx, -7, -10 + bob, 3.4, 3.4, '#fff0f6');

  // Pattes
  ctx.strokeStyle = '#f6c6da';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (const dx of [-3, 3]) {
    ctx.beginPath();
    ctx.moveTo(dx, -5);
    ctx.lineTo(dx, -0.5);
    ctx.stroke();
  }

  // Corps
  ellipse(ctx, 0, -11 + bob, 7, 7.5, '#ffe3ee', '#e39ab9');
  // Tête
  const hy = -20 + bob;
  ellipse(ctx, 0, hy, 7.6, 7, '#fff2f7', '#e39ab9');

  // Longues oreilles
  for (const cote of [-1, 1]) {
    ctx.save();
    ctx.translate(cote * 3, hy - 5);
    ctx.rotate(cote * (0.2 + Math.sin(t * 6) * 0.08));
    ellipse(ctx, 0, -8, 2.8, 9, '#fff2f7', '#e39ab9');
    ellipse(ctx, 0, -8, 1.4, 6.5, '#ff9dc0');
    ctx.restore();
  }

  // Cornes de démon
  ctx.fillStyle = '#c0334f';
  for (const cote of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cote * 5, hy - 5);
    ctx.quadraticCurveTo(cote * 9, hy - 11, cote * 5.5, hy - 12);
    ctx.quadraticCurveTo(cote * 6, hy - 8, cote * 3.5, hy - 5);
    ctx.closePath();
    ctx.fill();
  }

  yeux(ctx, 0, hy, 3.2, 2.6, { mechant: true, lueur: '#8b1030' });

  // Croc
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(1, hy + 4);
  ctx.lineTo(3, hy + 4);
  ctx.lineTo(2, hy + 7);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** Chibi Bat — chauve-souris violette aux ailes en cœur. */
export function dessinerBat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  const flap = Math.sin(t * 12);

  // Ailes
  for (const cote of [-1, 1]) {
    ctx.save();
    ctx.translate(cote * 6, -12);
    ctx.rotate(cote * flap * 0.45);
    ctx.fillStyle = '#8a5cd6';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(cote * 10, -8, cote * 17, -2);
    ctx.quadraticCurveTo(cote * 12, 1, cote * 14, 6);
    ctx.quadraticCurveTo(cote * 8, 3, 0, 5);
    ctx.closePath();
    ctx.fill();
    // Pointe en cœur
    ellipse(ctx, cote * 16, -2.5, 2.4, 2.2, '#ff8ab8');
    ctx.restore();
  }

  // Corps
  ellipse(ctx, 0, -12, 6.5, 7, '#b18cff', '#6b45b0');
  // Tête
  const hy = -19;
  ellipse(ctx, 0, hy, 7, 6.4, '#c5a4ff', '#6b45b0');

  // Oreilles
  ctx.fillStyle = '#c5a4ff';
  for (const cote of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cote * 3, hy - 5);
    ctx.lineTo(cote * 6, hy - 12);
    ctx.lineTo(cote * 7, hy - 3);
    ctx.closePath();
    ctx.fill();
  }

  yeux(ctx, 0, hy - 1, 3, 2.5, { mechant: true });

  // Crocs
  ctx.fillStyle = '#fff';
  for (const dx of [-1.8, 1.8]) {
    ctx.beginPath();
    ctx.moveTo(dx - 1, hy + 3.5);
    ctx.lineTo(dx + 1, hy + 3.5);
    ctx.lineTo(dx, hy + 6.5);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/** Chibi Titan — le mini-boss : massif, masqué, entouré d'un bouclier. */
export function dessinerTitan(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  const bob = Math.sin(t * 3.5) * 2;

  // Bouclier translucide
  ctx.save();
  ctx.globalAlpha = 0.22 + Math.sin(t * 4) * 0.06;
  ellipse(ctx, 0, -26 + bob, 30, 32, '#ff9d7a');
  ctx.restore();

  // Jambes trapues
  ctx.fillStyle = '#8c2f28';
  ctx.fillRect(-13, -14, 9, 14);
  ctx.fillRect(4, -14, 9, 14);

  // Corps
  ellipse(ctx, 0, -26 + bob, 20, 19, '#c0392b', '#7a1f18');
  // Ceinture
  ctx.fillStyle = '#3b1a16';
  ctx.fillRect(-20, -18 + bob, 40, 5);

  // Épaulières à pointes
  for (const cote of [-1, 1]) {
    ellipse(ctx, cote * 19, -36 + bob, 8, 7, '#8c2f28', '#571310');
    ctx.fillStyle = '#f5d78a';
    ctx.beginPath();
    ctx.moveTo(cote * 14, -41 + bob);
    ctx.lineTo(cote * 22, -50 + bob);
    ctx.lineTo(cote * 24, -38 + bob);
    ctx.closePath();
    ctx.fill();
  }

  // Tête masquée
  const hy = -50 + bob;
  ellipse(ctx, 0, hy, 15, 14, '#d95448', '#7a1f18');
  ctx.fillStyle = '#2a1414';
  ctx.beginPath();
  ctx.ellipse(0, hy, 13, 8, 0, Math.PI, 0);
  ctx.fill();

  // Yeux luisants
  ctx.save();
  ctx.shadowColor = '#ffcf5a';
  ctx.shadowBlur = 10;
  ellipse(ctx, -5, hy - 2, 3.2, 2.4, '#ffd25a');
  ellipse(ctx, 5, hy - 2, 3.2, 2.4, '#ffd25a');
  ctx.restore();

  // Cornes
  ctx.fillStyle = '#f5d78a';
  for (const cote of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cote * 9, hy - 10);
    ctx.quadraticCurveTo(cote * 20, hy - 22, cote * 11, hy - 24);
    ctx.quadraticCurveTo(cote * 13, hy - 16, cote * 6, hy - 10);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Décor et particules                                                */
/* ------------------------------------------------------------------ */

export function dessinerDecor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: TypeDecor,
  seed: number,
  t: number,
): void {
  const v = 0.8 + seed * 0.45;
  const souffle = Math.sin(t * 1.3 + seed * 8) * 0.05;

  switch (type) {
    case 'arbre': {
      ombre(ctx, x, y, 11 * v, 0.22);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(souffle * 0.3);
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(-2.5 * v, -16 * v, 5 * v, 16 * v);
      ellipse(ctx, 0, -24 * v, 12 * v, 11 * v, '#3f9a52', '#2c6d3a');
      ellipse(ctx, -5 * v, -30 * v, 8 * v, 7.5 * v, '#4fb063');
      ellipse(ctx, 5 * v, -28 * v, 7 * v, 6.5 * v, '#57bd6c');
      ctx.restore();
      break;
    }
    case 'buisson': {
      ombre(ctx, x, y, 9 * v, 0.2);
      ellipse(ctx, x, y - 6 * v, 9 * v, 7 * v, '#48a55c', '#2c6d3a');
      ellipse(ctx, x - 4 * v, y - 9 * v, 5.5 * v, 5 * v, '#57bd6c');
      break;
    }
    case 'rocher': {
      ombre(ctx, x, y, 9 * v, 0.22);
      ellipse(ctx, x, y - 5 * v, 9 * v, 7 * v, '#8b93a6', '#5d6577');
      ellipse(ctx, x - 3 * v, y - 8 * v, 4 * v, 3.2 * v, '#a8b0c2');
      break;
    }
    case 'fleurs': {
      for (let i = 0; i < 3; i++) {
        const a = seed * 10 + i * 2.1;
        const fx = x + Math.cos(a) * 9;
        const fy = y + Math.sin(a) * 4;
        ctx.strokeStyle = '#4f9a45';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + souffle * 6, fy - 6);
        ctx.stroke();
        ellipse(ctx, fx + souffle * 6, fy - 7, 2.2, 2.2, i % 2 ? '#ffd166' : '#ff8ab8');
      }
      break;
    }
  }
}

/** Étoile à 5 branches, utilisée pour les particules de « pop » et les décorations. */
export function etoile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  couleur: string,
  rot = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = couleur;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
