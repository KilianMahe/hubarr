// SPDX-License-Identifier: AGPL-3.0-or-later
// Onglet « Serveur » d'un service (P5b.4, D131, D138) : pages d'administration
// et de système, et commandes du service, en liste d'actions groupée.

import type { RouteLocationRaw } from 'vue-router';

export interface ServerItem {
  /** Identifiant stable (clé de liste, `data-test="server-item-<id>"`). */
  id: string;
  icon: string;
  label: string;
  /** Page à ouvrir. */
  to?: RouteLocationRaw;
  /** Commande à lancer (indicateur de chargement tant qu'elle n'a pas répondu). */
  run?: () => Promise<void>;
  /** Message de confirmation avant `run`. */
  confirm?: string;
}

export interface ServerGroup {
  /** Intitulé du groupe ; `null` : sans intitulé. */
  title: string | null;
  items: ServerItem[];
}
