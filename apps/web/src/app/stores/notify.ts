// SPDX-License-Identifier: AGPL-3.0-or-later
// Notifications : chaque message est consigné dans l'historique du centre de
// notifications (`NotificationCenter`, cloche de la barre du haut) et, sauf
// événement de fond (`toast: false`), affiché aussi en toast bref par
// `AppSnackbar`. Les messages sont des clés i18n, jamais du texte en dur.
// L'historique vit dans le navigateur (`localStorage`, par utilisateur, les
// 50 derniers), synchronisé entre onglets par l'événement `storage`.

import type { MessageValues } from '@hubarr/shared';
import { defineStore } from 'pinia';
import { useSessionStore } from './session';
import { computed, ref, watch } from 'vue';

export type NotifyKind = 'success' | 'error' | 'info';

export interface Notification {
  id: number;
  key: string;
  values?: MessageValues;
  kind: NotifyKind;
}

/** Entrée de l'historique du centre de notifications. */
export interface NotificationEntry {
  id: string;
  key: string;
  values?: MessageValues;
  kind: NotifyKind;
  /** Horodatage (ms). */
  at: number;
  read: boolean;
}

export interface NotifyOptions {
  /** `false` : centre seulement, sans toast (événements de fond). */
  toast?: boolean;
  /** `false` : toast seulement, hors historique (retours sans intérêt durable). */
  history?: boolean;
}

export const HISTORY_LIMIT = 50;
export const historyStorageKey = (userId: number) => `hubarr.notifications.${userId}`;

const KINDS = new Set<string>(['success', 'error', 'info']);

function isEntry(value: unknown): value is NotificationEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.key === 'string' &&
    typeof entry.kind === 'string' &&
    KINDS.has(entry.kind) &&
    typeof entry.at === 'number' &&
    typeof entry.read === 'boolean'
  );
}

/** Historique stocké, filtré des entrées invalides (stockage altéré ou ancien format). */
export function readHistory(raw: string | null): NotificationEntry[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export const useNotifyStore = defineStore('notify', () => {
  const queue = ref<Notification[]>([]);
  const history = ref<NotificationEntry[]>([]);
  let next = 1;

  const session = useSessionStore();
  const storageKey = computed(() => (session.user ? historyStorageKey(session.user.id) : null));

  function load(): void {
    history.value = storageKey.value ? readHistory(localStorage.getItem(storageKey.value)) : [];
  }
  function save(): void {
    if (storageKey.value) localStorage.setItem(storageKey.value, JSON.stringify(history.value));
  }
  // Changement d'utilisateur (connexion, déconnexion) : son propre historique.
  watch(storageKey, load, { immediate: true });
  // Autre onglet : même historique.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== null && event.key === storageKey.value) load();
    });
  }

  function push(kind: NotifyKind, key: string, values?: MessageValues, options?: NotifyOptions) {
    const extra = values ? { values } : {};
    if (options?.history !== false && storageKey.value) {
      const entry: NotificationEntry = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        key,
        kind,
        at: Date.now(),
        read: false,
        ...extra,
      };
      history.value = [entry, ...history.value].slice(0, HISTORY_LIMIT);
      save();
    }
    if (options?.toast === false) return;
    // Toasts désactivés (`display_toasts = 0`) : seules les erreurs restent affichées.
    if (kind !== 'error' && session.preferences.display_toasts === '0') return;
    queue.value.push({ id: next++, key, kind, ...extra });
  }

  function updateHistory(entries: NotificationEntry[]): void {
    history.value = entries;
    save();
  }

  return {
    queue,
    history,
    unread: computed(() => history.value.filter((entry) => !entry.read).length),
    success: (key: string, values?: MessageValues, options?: NotifyOptions) => {
      push('success', key, values, options);
    },
    error: (key: string, values?: MessageValues, options?: NotifyOptions) => {
      push('error', key, values, options);
    },
    info: (key: string, values?: MessageValues, options?: NotifyOptions) => {
      push('info', key, values, options);
    },
    dismiss(id: number): void {
      queue.value = queue.value.filter((item) => item.id !== id);
    },
    markAllRead(): void {
      if (history.value.some((entry) => !entry.read))
        updateHistory(history.value.map((entry) => ({ ...entry, read: true })));
    },
    remove(id: string): void {
      updateHistory(history.value.filter((entry) => entry.id !== id));
    },
    clear(): void {
      updateHistory([]);
    },
  };
});
