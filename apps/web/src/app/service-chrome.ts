// SPDX-License-Identifier: AGPL-3.0-or-later
// Habillage mobile des vues de service (P5b.4) : les vues
// y inscrivent, tant qu'elles sont montées, ce que le shell affiche à leur
// place :
// - `fab` : bouton d'action central de la barre basse (ou bouton flottant), qui
//   remplace le FAB déclaré par la route (`meta.fab`) ; avec `actions`, il
//   devient un speed-dial (fiches film et série) ;
// - `search` : recherche locale dans la barre du haut « pilule » ;
// - `selection` : sélection multiple en cours (la barre du haut devient la
//   barre contextuelle de la sélection, la barre basse s'efface).
// La dernière inscription l'emporte ; elle s'efface au démontage.

import { onUnmounted, reactive, watchEffect } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';
import { pageReadOnly } from './access';

export interface FabAction {
  icon: string;
  label: string;
  onClick: () => void;
  testId?: string;
  color?: string;
}

export interface FabSpec {
  icon: string;
  label: string;
  /** Action directe ; ignorée quand `actions` est fourni (speed-dial). */
  onClick?: () => void;
  actions?: FabAction[];
  testId?: string;
}

export interface TopBarSearch {
  value: string;
  placeholder: string;
  onInput: (value: string) => void;
}

export interface SelectionState {
  count: number;
  clear: () => void;
  selectAll?: () => void;
  selectAllLabel?: string;
}

interface Slot<T> {
  owner: number;
  value: T | null;
}

interface ChromeState {
  fab: Slot<FabSpec>;
  search: Slot<TopBarSearch>;
  selection: Slot<SelectionState>;
}

export const chrome: ChromeState = reactive<ChromeState>({
  fab: { owner: 0, value: null },
  search: { owner: 0, value: null },
  selection: { owner: 0, value: null },
});

type SlotName = keyof typeof chrome;
let nextOwner = 1;

/**
 * Inscrit une valeur dans un emplacement de l'habillage tant que le composant
 * appelant est monté. `source` peut renvoyer `null` (rien à afficher pour
 * l'instant, sans céder la place à une inscription plus ancienne).
 */
function useChromeSlot<K extends SlotName>(
  name: K,
  source: () => (typeof chrome)[K]['value'],
): void {
  const owner = nextOwner++;
  const slot = chrome[name] as Slot<unknown>;
  slot.owner = owner;
  const stop = watchEffect(() => {
    const value = source();
    if (slot.owner !== owner) return;
    slot.value = value;
  });
  onUnmounted(() => {
    stop();
    if (slot.owner !== owner) return;
    slot.owner = 0;
    slot.value = null;
  });
}

export const useServiceFab = (source: () => FabSpec | null) => {
  useChromeSlot('fab', source);
};
export const useTopBarSearch = (source: () => TopBarSearch | null) => {
  useChromeSlot('search', source);
};
export const useSelectionChrome = (source: () => SelectionState | null) => {
  useChromeSlot('selection', source);
};

/** Paramètre de requête qui transmet l'action du FAB à la page d'index du service. */
export const FAB_QUERY = 'action';

/**
 * Action principale d'une page d'index déclenchée par le FAB depuis une autre
 * page du service : la route y mène avec `?action=<nom>` ; la page exécute
 * l'action dès son installation (ou à l'arrivée du paramètre) et le retire.
 */
export function useFabQueryAction(action: string, handler: () => void): void {
  const route = useRoute();
  const router = useRouter();
  function consume(): void {
    if (route.query[FAB_QUERY] !== action) return;
    const query: LocationQuery = Object.fromEntries(
      Object.entries(route.query).filter(([key]) => key !== FAB_QUERY),
    );
    void router.replace({ query });
    // Action d'écriture (ajout) : ignorée sur une page en lecture seule.
    if (!pageReadOnly.value) handler();
  }
  // Exécuté dès l'installation, puis à chaque arrivée du paramètre.
  const stop = watchEffect(consume);
  onUnmounted(stop);
}
