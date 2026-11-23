// SPDX-License-Identifier: AGPL-3.0-or-later
// Navigation du shell. Le tiroir regroupe les services par famille (PLAN §4.1,
// maquettes P0.11) ; les entrées de service, avec leur pastille de santé,
// arrivent avec la configuration des services et leur santé (P1.2, P1.4).

import { SOURCE_CODE_URL } from '@hubarr/shared';
import { mdiBookOpenVariant, mdiCog, mdiSourceBranch, mdiViewDashboard } from '@mdi/js';
import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router';

export interface NavItem {
  labelKey: string;
  icon: string;
  to?: RouteLocationRaw;
  /** Lien hors de la SPA (documentation, code source). */
  href?: string;
  requiresAdmin?: boolean;
}

export interface NavSection {
  /** Clé i18n de l'intitulé ; `null` : section sans titre. */
  titleKey: string | null;
  items: NavItem[];
}

/** Onglet de la barre basse d'un service (déclaré par la route, `meta.bottomNav`). */
export interface BottomNavItem {
  labelKey: string;
  icon: string;
  /** Page de l'onglet, désignée par le nom de sa route (paramètres de la route courante). */
  to: { name: string };
  badge?: string | number;
  /** Onglet actif sur d'autres pages que la sienne (fiche → bibliothèque, administration → Serveur). */
  matches?: (route: RouteLocationNormalizedLoaded) => boolean;
}

/** Onglet actif : sa page, ou une page qu'il revendique (`matches`). */
export function bottomNavActive(
  item: BottomNavItem,
  route: RouteLocationNormalizedLoaded,
): boolean {
  return route.name === item.to.name || item.matches?.(route) === true;
}

/**
 * Action principale d'un service portée par le FAB (P5b.4, D131) : depuis
 * n'importe quelle page du service, le FAB mène à la page d'index `index`
 * avec `?action=<action>`, que la page exécute (`useFabQueryAction`).
 */
export interface RouteFab {
  icon: string;
  labelKey: string;
  action: string;
  index: string;
  testId: string;
}

/** Page d'une instance Radarr ou Sonarr (onglets `ArrNav`), désignée par le nom de sa route. */
export interface ArrPage {
  name: string;
  labelKey: string;
  icon: string;
}

// « Accueil » retiré du tiroir (P5b.1 E7, doublon du tableau de bord) : la page
// d'accueil choisie reste servie par `/` et par le logo.
export const DRAWER_SECTIONS: NavSection[] = [
  {
    titleKey: 'sidebar.section.overview',
    items: [
      { labelKey: 'sidebar.nav.dashboard', icon: mdiViewDashboard, to: { name: 'dashboard' } },
    ],
  },
];

/** Documentation embarquée : anglais à la racine, français sous `fr/` (relatif à `<base>`). */
export const DOCS_HREF = 'docs/';

/** Adresse de la documentation dans la langue de l'interface. */
export function docsHref(locale: string): string {
  return locale.startsWith('fr') ? `${DOCS_HREF}fr/` : DOCS_HREF;
}

export const DRAWER_FOOTER: NavItem[] = [
  {
    labelKey: 'sidebar.footer.settings',
    icon: mdiCog,
    to: { name: 'settings' },
    requiresAdmin: true,
  },
  { labelKey: 'footer.help', icon: mdiBookOpenVariant, href: DOCS_HREF },
  // Lien « Code source » toujours visible (AGPL-3.0, CLAUDE.md).
  { labelKey: 'footer.source_code', icon: mdiSourceBranch, href: SOURCE_CODE_URL },
];
