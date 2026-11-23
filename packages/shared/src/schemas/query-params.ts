// SPDX-License-Identifier: AGPL-3.0-or-later
// Lecture tolérante d'une chaîne de requête (Fastify, `URLSearchParams`,
// vue-router), commune aux critères des bibliothèques de films et de séries :
// une valeur inconnue retombe sur le défaut au lieu d'être refusée, comme les
// `fromRequest` de l'original.

/** Valeur brute d'une chaîne de requête. */
export type RawQueryValue = unknown;

/** Première valeur texte (`?a=1&a=2` → `1`). */
export function firstQueryValue(value: RawQueryValue): string | undefined {
  const scalar = Array.isArray(value) ? (value as unknown[])[0] : value;
  if (typeof scalar === 'string') return scalar;
  if (typeof scalar === 'number' || typeof scalar === 'boolean') return String(scalar);
  return undefined;
}

export function oneOf<T extends string>(
  values: readonly T[],
  value: string | undefined,
): T | undefined {
  return values.find((candidate) => candidate === value);
}

/** Entier comme `(int)` de PHP : préfixe numérique, sinon 0. */
export function phpInt(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Booléen comme `getBoolean()` de Symfony. */
export function symfonyBoolean(value: string | undefined): boolean {
  return ['1', 'true', 'on', 'yes'].includes((value ?? '').trim().toLowerCase());
}
