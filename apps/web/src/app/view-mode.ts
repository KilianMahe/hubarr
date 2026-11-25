// SPDX-License-Identifier: AGPL-3.0-or-later
// Choix mémorisé par appareil (vue du calendrier) : une clé `localStorage`
// par vue, relue à chaque montage ; valeur inconnue ou stockage indisponible
// (navigation privée) → valeur par défaut. Les bibliothèques et les torrents
// s'ouvrent, eux, sur les préférences du compte.

/** `localStorage`, ou `null` s'il est inaccessible. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredChoice<T extends string>(
  key: string,
  choices: readonly T[],
  fallback: T,
  store: Storage | null = browserStorage(),
): T {
  try {
    const stored = store?.getItem(key);
    return choices.find((choice) => choice === stored) ?? fallback;
  } catch {
    return fallback;
  }
}

export function storeChoice(key: string, value: string, store: Storage | null = browserStorage()) {
  try {
    store?.setItem(key, value);
  } catch {
    // Stockage plein ou refusé : le choix vaut pour la session.
  }
}
