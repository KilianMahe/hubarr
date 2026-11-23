// SPDX-License-Identifier: AGPL-3.0-or-later
// Fenêtres globales ouvertes depuis n'importe quel écran (P4) : aperçu rapide
// d'un titre (`QuickLookSheet`, `window.prismarrQl` d'origine) et ajout rapide
// à Radarr/Sonarr (`QuickAddDialog`, `[data-quick-add]` d'origine). Montées
// une fois dans le shell ; l'état est partagé.

import type { DashboardRef, ResolvedMedia, TmdbMediaType } from '@hubarr/shared';
import { reactive } from 'vue';

export type QuickAddInput =
  { tmdb: { type: TmdbMediaType; id: number } } | { media: ResolvedMedia };

export const overlays = reactive({
  quickLook: null as DashboardRef | null,
  quickAdd: null as QuickAddInput | null,
});

export function openQuickLook(target: DashboardRef): void {
  overlays.quickLook = target;
}

export function closeQuickLook(): void {
  overlays.quickLook = null;
}

export function openQuickAdd(input: QuickAddInput): void {
  overlays.quickLook = null;
  overlays.quickAdd = input;
}

export function closeQuickAdd(): void {
  overlays.quickAdd = null;
}
