// SPDX-License-Identifier: AGPL-3.0-or-later
// Alertes de santé fermées (P5d.5, V30) : chaque alerte se
// ferme d'une croix et reste masquée sur cet appareil tant que son texte ne
// change pas. Une clé `localStorage` par portée (service et instance) garde
// les textes fermés ; ceux qui ne sont plus signalés sont oubliés, pour qu'une
// alerte qui revient plus tard réapparaisse.

import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { browserStorage } from './view-mode';

const PREFIX = 'hubarr.dismissed-alerts.';

function read(key: string, store: Storage | null): string[] {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, values: string[], store: Storage | null): void {
  try {
    if (values.length === 0) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(values));
  } catch {
    // Stockage refusé : la fermeture vaut pour la session.
  }
}

/**
 * Alertes visibles d'une portée (`radarr.films`…) : `texts` donne le texte
 * affiché de chaque alerte, `dismiss` en ferme une.
 */
export function useDismissedAlerts(
  scope: MaybeRefOrGetter<string>,
  texts: MaybeRefOrGetter<string[] | undefined>,
  store: Storage | null = browserStorage(),
) {
  const key = computed(() => PREFIX + toValue(scope));
  const dismissed = ref<string[]>(read(key.value, store));
  watch(key, (value) => {
    dismissed.value = read(value, store);
  });
  // Oubli des alertes fermées qui ne sont plus signalées (liste chargée seulement).
  watch(
    () => toValue(texts),
    (current) => {
      if (current === undefined) return;
      const kept = dismissed.value.filter((text) => current.includes(text));
      if (kept.length !== dismissed.value.length) {
        dismissed.value = kept;
        write(key.value, kept, store);
      }
    },
    { immediate: true },
  );
  return {
    isVisible: (text: string) => !dismissed.value.includes(text),
    dismiss(text: string): void {
      if (dismissed.value.includes(text)) return;
      dismissed.value = [...dismissed.value, text];
      write(key.value, dismissed.value, store);
    },
  };
}
