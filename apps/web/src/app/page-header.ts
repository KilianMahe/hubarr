// SPDX-License-Identifier: AGPL-3.0-or-later
// En-tête de la page affichée (P5b.3, écart E5 « un seul titre par écran ») :
// un `ServiceHeader` monté s'y inscrit. Sur mobile, la barre du haut affiche
// alors son titre et son sous-titre et l'en-tête de la page ne garde que ses
// actions ; sur grand écran, la barre du haut n'affiche plus de titre.

import { onUnmounted, reactive, watchEffect } from 'vue';

interface PageHeaderState {
  /** Jeton de l'en-tête inscrit (le dernier monté l'emporte), 0 : aucun. */
  owner: number;
  title: string;
  subtitle: string | null;
}

export const pageHeader = reactive<PageHeaderState>({ owner: 0, title: '', subtitle: null });
let nextOwner = 1;

/** Inscrit l'en-tête de la page tant que le composant appelant est monté. */
export function usePageHeader(source: () => { title: string; subtitle: string | null }): void {
  const owner = nextOwner++;
  pageHeader.owner = owner;
  watchEffect(() => {
    const { title, subtitle } = source();
    if (pageHeader.owner !== owner) return;
    pageHeader.title = title;
    pageHeader.subtitle = subtitle;
  });
  onUnmounted(() => {
    if (pageHeader.owner !== owner) return;
    pageHeader.owner = 0;
    pageHeader.title = '';
    pageHeader.subtitle = null;
  });
}
