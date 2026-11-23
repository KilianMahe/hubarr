// SPDX-License-Identifier: AGPL-3.0-or-later
// Distance affichée du geste « tirer pour rafraîchir » : amortie (moitié du
// déplacement), plafonnée, nulle vers le haut.

export const PULL_THRESHOLD = 64;
const PULL_MAX = 96;

export function pullDistance(deltaY: number): number {
  if (deltaY <= 0) return 0;
  return Math.min(PULL_MAX, Math.round(deltaY / 2));
}
