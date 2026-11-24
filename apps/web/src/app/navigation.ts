// SPDX-License-Identifier: AGPL-3.0-or-later
// Navigation du shell. Le tiroir regroupe les services par famille (PLAN §4.1,
// maquettes P0.11) ; les entrées de service, avec leur pastille de santé,
// arrivent avec la configuration des services et leur santé (P1.2, P1.4).

import { SOURCE_CODE_URL, type BootstrapServices } from '@hubarr/shared';
import { msCode, msHomeFill, msMenuBook, msSettingsFill } from '../components/symbols';
import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router';
import { HOME_ROUTES } from './home-tabs';

export interface NavItem {
  labelKey: string;
  icon: string;
  to?: RouteLocationRaw;
  /** Lien hors de la SPA (documentation, code source). */
  href?: string;
  requiresAdmin?: boolean;
  /** Entrée active sur ces routes aussi (groupe « Accueil »), au lieu de sa seule page. */
  activeRoutes?: ReadonlySet<string>;
}

export interface NavSection {
  /** Clé i18n de l'intitulé ; `null` : section sans titre. */
  titleKey: string | null;
  items: NavItem[];
}

/** Contexte d'affichage d'un onglet (services configurés, rôle). */
export interface BottomNavContext {
  services: BootstrapServices;
  isAdmin: boolean;
}

/** Onglet de la barre basse d'un service (déclaré par la route, `meta.bottomNav`). */
export interface BottomNavItem {
  labelKey: string;
  icon: string;
  /**
   * Page de l'onglet, désignée par le nom de sa route (paramètres de la route
   * courante) et, au besoin, par son fragment (sections des paramètres).
   */
  to: { name: string; hash?: string };
  /** Remplace l'entrée de l'historique au lieu d'en ajouter une (sections d'une même page). */
  replace?: boolean;
  badge?: string | number;
  /** `data-test` de l'onglet ; par défaut `bottom-nav-<labelKey>`. */
  testId?: string;
  /** Onglet actif sur d'autres pages que la sienne (fiche → bibliothèque, administration → Serveur). */
  matches?: (route: RouteLocationNormalizedLoaded) => boolean;
  /**
   * Pages ouvertes par l'onglet dans un menu, au lieu d'une navigation directe
   * (groupes des paramètres d'un service) ; l'onglet est actif sur chacune.
   */
  menu?: BottomNavMenuItem[];
  /** Onglet affiché seulement si sa page est utilisable (groupe « Accueil »). */
  visible?: (context: BottomNavContext) => boolean;
}

/** Entrée du menu d'un onglet de la barre basse. */
export interface BottomNavMenuItem {
  /** Nom de la route (`data-test="admin-link-<id>"`). */
  id: string;
  labelKey: string;
  icon: string;
  to: RouteLocationRaw;
}

/** Onglet actif : sa page, une page de son menu, ou une page qu'il revendique (`matches`). */
export function bottomNavActive(
  item: BottomNavItem,
  route: RouteLocationNormalizedLoaded,
): boolean {
  const own =
    route.name === item.to.name && (item.to.hash === undefined || route.hash === item.to.hash);
  return (
    own ||
    item.menu?.some((entry) => entry.id === route.name) === true ||
    item.matches?.(route) === true
  );
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

// « Accueil » (lot 11) : une entrée pour le groupe Tableau de bord, Découverte
// et Calendrier, reliés par des onglets ; elle ouvre le tableau de bord et reste
// active sur les trois. La page d'accueil choisie reste servie par `/` et par
// le logo.
export const DRAWER_SECTIONS: NavSection[] = [
  {
    titleKey: null,
    items: [
      {
        labelKey: 'sidebar.nav.home',
        icon: msHomeFill,
        to: { name: 'dashboard' },
        activeRoutes: HOME_ROUTES,
      },
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
    icon: msSettingsFill,
    to: { name: 'settings' },
    requiresAdmin: true,
  },
  { labelKey: 'footer.help', icon: msMenuBook, href: DOCS_HREF },
  // Lien « Code source » toujours visible (AGPL-3.0, CLAUDE.md).
  { labelKey: 'footer.source_code', icon: msCode, href: SOURCE_CODE_URL },
];
