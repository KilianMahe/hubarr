// SPDX-License-Identifier: AGPL-3.0-or-later
// Messages éphémères (snackbars) : une file, affichée par `AppSnackbar`. Les
// messages sont des clés i18n, jamais du texte en dur.

import type { MessageValues } from '@hubarr/shared';
import { defineStore } from 'pinia';
import { useSessionStore } from './session';
import { ref } from 'vue';

export type NotifyKind = 'success' | 'error' | 'info';

export interface Notification {
  id: number;
  key: string;
  values?: MessageValues;
  kind: NotifyKind;
}

export const useNotifyStore = defineStore('notify', () => {
  const queue = ref<Notification[]>([]);
  let next = 1;

  const session = useSessionStore();

  function push(kind: NotifyKind, key: string, values?: MessageValues): void {
    // Toasts désactivés (`display_toasts = 0`) : seules les erreurs restent affichées.
    if (kind !== 'error' && session.preferences.display_toasts === '0') return;
    queue.value.push({ id: next++, key, kind, ...(values ? { values } : {}) });
  }

  return {
    queue,
    success: (key: string, values?: MessageValues) => {
      push('success', key, values);
    },
    error: (key: string, values?: MessageValues) => {
      push('error', key, values);
    },
    info: (key: string, values?: MessageValues) => {
      push('info', key, values);
    },
    dismiss(id: number): void {
      queue.value = queue.value.filter((item) => item.id !== id);
    },
  };
});
