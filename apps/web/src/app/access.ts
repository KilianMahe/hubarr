// SPDX-License-Identifier: AGPL-3.0-or-later
// Droits du compte sur un service, pour l'affichage : une action d'écriture
// est masquée quand le compte n'a que la lecture. Le serveur reste l'autorité
// (`plugins/access.ts`) ; un admin a tous les droits.

import type { ServiceId } from '@hubarr/shared';
import {
  computed,
  ref,
  toValue,
  watchEffect,
  type ComputedRef,
  type Directive,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import { useSessionStore } from './stores/session';

export interface ServiceAccess {
  canRead: ComputedRef<boolean>;
  canWrite: ComputedRef<boolean>;
}

/** Droits sur le service (et l'instance Radarr/Sonarr désignée par `slug`). */
export function useServiceAccess(
  service: MaybeRefOrGetter<ServiceId | null>,
  slug?: MaybeRefOrGetter<string | null | undefined>,
): ServiceAccess {
  const session = useSessionStore();
  const can = (level: 'read' | 'write') => {
    const id = toValue(service);
    return id !== null && session.can(id, toValue(slug) ?? null, level);
  };
  return {
    canRead: computed(() => can('read')),
    canWrite: computed(() => can('write')),
  };
}

/**
 * Page courante en lecture seule pour le compte (service de la route lisible
 * mais pas modifiable). Tenu par le shell (`AppShell.vue`).
 */
export const pageReadOnly = ref(false);

interface WriteState {
  allowed: Ref<boolean | undefined>;
  stop: () => void;
}
const states = new WeakMap<HTMLElement, WriteState>();

/**
 * `v-write` : masque une action d'écriture (bouton, menu, bloc d'actions).
 * Sans valeur, quand la page est en lecture seule ; avec une valeur
 * (`v-write="canWrite"`), quand ce droit manque : action d'un autre service
 * que celui de la page, ou composant hors page de service. À importer dans le
 * composant (`import { vWrite } from '…/app/access'`).
 */
export const vWrite: Directive<HTMLElement, boolean | undefined> = {
  mounted(el, binding) {
    const allowed = ref(binding.value);
    const stop = watchEffect(() => {
      const hidden = allowed.value === undefined ? pageReadOnly.value : !allowed.value;
      el.style.display = hidden ? 'none' : '';
    });
    states.set(el, { allowed, stop });
  },
  updated(el, binding) {
    const state = states.get(el);
    if (state) state.allowed.value = binding.value;
  },
  unmounted(el) {
    states.get(el)?.stop();
    states.delete(el);
  },
};
