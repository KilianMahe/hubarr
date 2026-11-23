// SPDX-License-Identifier: AGPL-3.0-or-later
// Mode d'affichage mémorisé par appareil (P5c.2, V15) : une clé
// `localStorage` par vue, relue à chaque montage ; valeur inconnue ou stockage
// indisponible (navigation privée) → mode par défaut de la vue.

import { ref, watch, type Ref } from 'vue';

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

/** Mode d'affichage d'une vue, enregistré à chaque changement. */
export function useViewMode<T extends string>(
  key: string,
  choices: readonly T[],
  fallback: T,
  store: Storage | null = browserStorage(),
): Ref<T> {
  const mode = ref(readStoredChoice(key, choices, fallback, store)) as Ref<T>;
  watch(mode, (value) => {
    storeChoice(key, value, store);
  });
  return mode;
}
