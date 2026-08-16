/**
 * Sprites de la zone farm : spots de ressources, bébés animaux, bâtiments.
 * Mêmes conventions que `sprites.ts` — (x, y) est le point d'appui au sol.
 */

import type { TypeBatiment, TypeBebe } from '../game/farm';
import type { TypeRessource } from '../game/resources';
import { ellipse, ombre, yeux } from './sprites';

/* ------------------------------------------------------------------ */
/*  Spots de ressources                                                */
/* ------------------------------------------------------------------ */

export function dessinerSpot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ressource: TypeRessource,
  seed: number,
  t: number,
): void {
  switch (ressource) {
    case 'nourriture':
      champDeBle(ctx, x, y, seed, t);
      break;
    case 'bois':
      bosquet(ctx, x, y, seed, t);
      break;
    case 'or':
      filonDor(ctx, x, y, seed, t);
      break;
    case 'pierre':
      carriere(ctx, x, y, seed);
      break;
  }
}

/** Champ de blé : rangées d'épis dorés qui ondulent. */
function champDeBle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: number,
  t: number,
): void {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      // Disposition en losange pour épouser la tuile isométrique.
      const u = (c - 1.5) * 7;
      const v = (r - 1.5) * 7;
      const ex = x + u - v;
      const ey = y + (u + v) * 0.5;
      const vent = Math.sin(t * 2 + (r + c) * 0.7 + seed * 6) * 1.8;

      ctx.strokeStyle = '#b9932f';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + vent, ey - 9);
      ctx.stroke();
      ellipse(ctx, ex + vent, ey - 11, 1.8, 3, '#f2c94c');
    }
  }
}

/** Bosquet : trois arbres serrés. */
function bosquet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: number,
  t: number,
): void {
  const pos = [
    { dx: -8, dy: 3, s: 0.85 },
    { dx: 7, dy: 5, s: 0.75 },
    { dx: 0, dy: -3, s: 1 },
  ];
  for (const p of pos) {
    const souffle = Math.sin(t * 1.4 + seed * 8 + p.dx) * 0.06;
    ombre(ctx, x + p.dx, y + p.dy, 8 * p.s, 0.2);
    ctx.save();
    ctx.translate(x + p.dx, y + p.dy);
    ctx.rotate(souffle);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-2 * p.s, -13 * p.s, 4 * p.s, 13 * p.s);
    ellipse(ctx, 0, -20 * p.s, 10 * p.s, 9 * p.s, '#3f9a52', '#2c6d3a');
    ellipse(ctx, -4 * p.s, -25 * p.s, 6 * p.s, 5.5 * p.s, '#4fb063');
    ctx.restore();
  }
}

/** Filon d'or : rocher sombre veiné de pépites qui scintillent. */
function filonDor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: number,
  t: number,
): void {
  ombre(ctx, x, y, 13, 0.24);
  ellipse(ctx, x, y - 8, 14, 11, '#6a6f80', '#484d5c');
  ellipse(ctx, x - 5, y - 13, 7, 5.5, '#848b9e');
  for (let i = 0; i < 5; i++) {
    const a = seed * 12 + i * 1.9;
    const px = x + Math.cos(a) * 8;
    const py = y - 8 + Math.sin(a) * 5;
    const brille = 0.6 + 0.4 * Math.sin(t * 3 + i * 1.7);
    ctx.save();
    ctx.globalAlpha = brille;
    ellipse(ctx, px, py, 2.6, 2.2, '#ffd166');
    ctx.restore();
  }
}

/** Carrière : blocs de pierre taillés et empilés. */
function carriere(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
  ombre(ctx, x, y, 14, 0.24);
  const blocs = [
    { dx: -7, dy: -4, w: 13, h: 8 },
    { dx: 6, dy: -3, w: 11, h: 7 },
    { dx: -2, dy: -11, w: 12, h: 8 },
  ];
  for (const [i, b] of blocs.entries()) {
    const teinte = 62 + ((seed * 100 + i * 13) % 18);
    ctx.fillStyle = `hsl(220, 10%, ${teinte}%)`;
    ctx.fillRect(x + b.dx - b.w / 2, y + b.dy - b.h, b.w, b.h);
    ctx.fillStyle = `hsl(220, 10%, ${teinte + 12}%)`;
    ctx.fillRect(x + b.dx - b.w / 2, y + b.dy - b.h, b.w, 2.5);
  }
}

/* ------------------------------------------------------------------ */
/*  Bébés animaux                                                      */
/* ------------------------------------------------------------------ */

/** Œuf en cours d'éclosion : il tremble de plus en plus et se fissure à la fin. */
export function dessinerOeuf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progression: number,
  t: number,
): void {
  const agitation = 0.5 + progression * 2.5;
  const tremble = Math.sin(t * 14) * agitation;

  ombre(ctx, x, y, 7, 0.25);
  ctx.save();
  ctx.translate(x, y - 9);
  ctx.rotate((tremble * Math.PI) / 180);
  ellipse(ctx, 0, 0, 7, 9, '#fdf6e3', '#d8cbb0');
  // Mouchetures
  ellipse(ctx, -2.5, -2, 1.6, 1.3, '#dcc9a2');
  ellipse(ctx, 2.4, 2.4, 1.3, 1.1, '#dcc9a2');

  // La fissure n'apparaît que dans le dernier tiers.
  if (progression > 0.66) {
    ctx.strokeStyle = '#8a7a5c';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-6, -1);
    ctx.lineTo(-2, 1.5);
    ctx.lineTo(1, -1.5);
    ctx.lineTo(4, 1);
    ctx.lineTo(6.5, -1);
    ctx.stroke();
  }
  ctx.restore();
}

export function dessinerBebe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: TypeBebe,
  t: number,
): void {
  ombre(ctx, x, y, 7, 0.24);
  if (type === 'poussin') poussin(ctx, x, y, t);
  else aiglon(ctx, x, y, t);
}

/** Poussin — France. Boule jaune qui picore en rythme. */
function poussin(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  // Cycle de picorage : penché en avant une partie du temps.
  const cycle = (t * 1.2) % 1;
  const picore = cycle < 0.3 ? Math.sin((cycle / 0.3) * Math.PI) : 0;
  const bob = Math.sin(t * 4) * 1;

  ctx.save();
  ctx.translate(x, y);

  // Pattes
  ctx.strokeStyle = '#e8912f';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (const dx of [-2.5, 2.5]) {
    ctx.beginPath();
    ctx.moveTo(dx, -4);
    ctx.lineTo(dx, -0.5);
    ctx.stroke();
  }

  ctx.rotate(picore * 0.45);

  // Corps rond
  ellipse(ctx, 0, -9 + bob, 7.5, 7, '#ffd94d', '#e0a91f');
  // Aile
  ellipse(ctx, 3, -9 + bob, 3.4, 4.2, '#ffe680');
  // Tête
  const hy = -17 + bob;
  ellipse(ctx, 0, hy, 6, 5.6, '#ffe066', '#e0a91f');
  // Petite houppe
  ctx.strokeStyle = '#e0a91f';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, hy - 5);
  ctx.quadraticCurveTo(2, hy - 9, -1, hy - 9.5);
  ctx.stroke();

  // Bec
  ctx.fillStyle = '#ff9f2e';
  ctx.beginPath();
  ctx.moveTo(4, hy);
  ctx.lineTo(10, hy + 1.5);
  ctx.lineTo(4, hy + 3);
  ctx.closePath();
  ctx.fill();

  yeux(ctx, 1, hy - 1, 2.6, 1.9);
  ctx.restore();
}

/** Aiglon — USA. Duvet ébouriffé et air déjà sérieux. */
function aiglon(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const bob = Math.sin(t * 3) * 1.2;

  ctx.save();
  ctx.translate(x, y);

  ctx.strokeStyle = '#d8a13a';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  for (const dx of [-2.5, 2.5]) {
    ctx.beginPath();
    ctx.moveTo(dx, -4);
    ctx.lineTo(dx, -0.5);
    ctx.stroke();
  }

  // Corps
  ellipse(ctx, 0, -9 + bob, 7, 7, '#8f7256', '#5d4630');
  ellipse(ctx, 2.5, -9 + bob, 3.2, 4, '#a68a6a');

  // Tête duveteuse
  const hy = -17 + bob;
  ellipse(ctx, 0, hy, 6, 5.6, '#e9e4dc', '#b9b2a6');
  // Duvet en pointes
  ctx.strokeStyle = '#e9e4dc';
  ctx.lineWidth = 1.6;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 2, hy - 4);
    ctx.lineTo(i * 2.6, hy - 8 - Math.abs(i));
    ctx.stroke();
  }

  // Bec crochu
  ctx.fillStyle = '#ffc02e';
  ctx.beginPath();
  ctx.moveTo(4, hy - 0.5);
  ctx.lineTo(10, hy + 1);
  ctx.quadraticCurveTo(8, hy + 4, 4, hy + 2.5);
  ctx.closePath();
  ctx.fill();

  yeux(ctx, 0.5, hy - 1, 2.6, 1.9, { mechant: true });
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Bâtiments                                                          */
/* ------------------------------------------------------------------ */

export function dessinerBatiment(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: TypeBatiment,
  t: number,
): void {
  ombre(ctx, x, y, 16, 0.28);
  switch (type) {
    case 'moulin':
      moulin(ctx, x, y, t);
      break;
    case 'campBuches':
      campBuches(ctx, x, y);
      break;
    case 'campMine':
      campMine(ctx, x, y);
      break;
    case 'entrepot':
      entrepot(ctx, x, y, t);
      break;
  }
}

/** Moulin à vent, avec des ailes qui tournent vraiment. */
function moulin(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  // Tour tronconique
  ctx.fillStyle = '#e6dcc6';
  ctx.beginPath();
  ctx.moveTo(x - 11, y);
  ctx.lineTo(x - 8, y - 30);
  ctx.lineTo(x + 8, y - 30);
  ctx.lineTo(x + 11, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.moveTo(x + 3, y);
  ctx.lineTo(x + 5, y - 30);
  ctx.lineTo(x + 8, y - 30);
  ctx.lineTo(x + 11, y);
  ctx.closePath();
  ctx.fill();

  // Toit
  ctx.fillStyle = '#b8503f';
  ctx.beginPath();
  ctx.moveTo(x - 11, y - 29);
  ctx.lineTo(x, y - 42);
  ctx.lineTo(x + 11, y - 29);
  ctx.closePath();
  ctx.fill();

  // Porte
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(x - 3.5, y - 10, 7, 10);

  // Ailes
  ctx.save();
  ctx.translate(x, y - 32);
  ctx.rotate(t * 0.9);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#f4efe0';
    ctx.fillRect(1.5, -2, 17, 4.5);
    ctx.strokeStyle = '#8a7a5c';
    ctx.lineWidth = 1;
    ctx.strokeRect(1.5, -2, 17, 4.5);
  }
  ctx.restore();
  ellipse(ctx, x, y - 32, 2.6, 2.6, '#7a5230');
}

/** Camp de bûches : tas de rondins et cabane basse. */
function campBuches(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // Cabane
  ctx.fillStyle = '#9a6b40';
  ctx.fillRect(x - 14, y - 18, 17, 18);
  ctx.fillStyle = '#7a5230';
  ctx.beginPath();
  ctx.moveTo(x - 16, y - 17);
  ctx.lineTo(x - 5.5, y - 26);
  ctx.lineTo(x + 5, y - 17);
  ctx.closePath();
  ctx.fill();

  // Tas de rondins
  const rondins = [
    { dx: 8, dy: -4 },
    { dx: 14, dy: -4 },
    { dx: 11, dy: -9 },
  ];
  for (const r of rondins) {
    ellipse(ctx, x + r.dx, y + r.dy, 4, 3.6, '#c08d55', '#7a5230');
    ellipse(ctx, x + r.dx, y + r.dy, 1.8, 1.6, '#e0b585');
  }

  // Hache plantée
  ctx.strokeStyle = '#6b4a2f';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 2);
  ctx.lineTo(x + 5, y - 13);
  ctx.stroke();
  ctx.fillStyle = '#b9c0cc';
  ctx.beginPath();
  ctx.moveTo(x + 4, y - 13);
  ctx.lineTo(x + 10, y - 15);
  ctx.lineTo(x + 6, y - 9);
  ctx.closePath();
  ctx.fill();
}

/** Camp de mine : entrée boisée creusée dans un tertre, plus un wagonnet. */
function campMine(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // Tertre
  ellipse(ctx, x - 2, y - 8, 17, 13, '#7d8496', '#565c6b');
  // Entrée
  ctx.fillStyle = '#241f2c';
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 1);
  ctx.lineTo(x - 9, y - 11);
  ctx.quadraticCurveTo(x - 2, y - 18, x + 5, y - 11);
  ctx.lineTo(x + 5, y - 1);
  ctx.closePath();
  ctx.fill();
  // Étais
  ctx.fillStyle = '#8a6236';
  ctx.fillRect(x - 11, y - 13, 3, 13);
  ctx.fillRect(x + 4, y - 13, 3, 13);
  ctx.fillRect(x - 12, y - 15, 20, 3);

  // Wagonnet
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(x + 9, y - 8, 11, 7);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(x + 11, y - 10, 7, 3);
  ctx.fillStyle = '#3a3f4b';
  ctx.beginPath();
  ctx.arc(x + 12, y - 0.5, 2, 0, Math.PI * 2);
  ctx.arc(x + 17.5, y - 0.5, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Entrepôt : grange rouge à toit clair, cheminée qui fume. */
function entrepot(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.fillStyle = '#b8503f';
  ctx.fillRect(x - 16, y - 20, 32, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(x + 6, y - 20, 10, 20);

  // Toit
  ctx.fillStyle = '#e6dcc6';
  ctx.beginPath();
  ctx.moveTo(x - 19, y - 19);
  ctx.lineTo(x, y - 32);
  ctx.lineTo(x + 19, y - 19);
  ctx.closePath();
  ctx.fill();

  // Grande porte
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(x - 7, y - 13, 14, 13);
  ctx.strokeStyle = '#e6dcc6';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 13);
  ctx.lineTo(x + 7, y);
  ctx.moveTo(x + 7, y - 13);
  ctx.lineTo(x - 7, y);
  ctx.stroke();

  // Fumée
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.5 + i * 0.33) % 1;
    ctx.save();
    ctx.globalAlpha = (1 - p) * 0.4;
    ellipse(ctx, x + 11 + p * 5, y - 34 - p * 16, 3 + p * 4, 2.5 + p * 3.5, '#dfe6f2');
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */

/**
 * Clôture qui sépare la zone défense de la zone farm.
 * Elle suit l'axe gy, dont la direction en espace monde est (-1, +0.5).
 */
export function dessinerBarriere(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const bout = (k: number) => ({ x: x - k, y: y + k * 0.5 });
  const a = bout(-16);
  const b = bout(16);

  ctx.strokeStyle = '#8a6236';
  ctx.lineCap = 'round';

  // Lisses horizontales
  ctx.lineWidth = 2;
  for (const h of [-7, -14]) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + h);
    ctx.lineTo(b.x, b.y + h);
    ctx.stroke();
  }

  // Poteaux
  ctx.lineWidth = 2.8;
  for (const k of [-16, 0, 16]) {
    const p = bout(k);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - 18);
    ctx.stroke();
  }
}
