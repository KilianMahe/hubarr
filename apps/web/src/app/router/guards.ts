// SPDX-License-Identifier: AGPL-3.0-or-later
// Gardes de navigation, équivalents client de `SetupRedirectSubscriber`, de
// l'`access_control` d'origine et de `ServiceRouteGuardSubscriber` (le serveur
// reste l'autorité : chaque appel d'API est contrôlé) :
// 1. installation à faire → l'assistant, et lui seul ;
// 2. installation faite → l'assistant renvoie vers l'accueil (ou la connexion) ;
// 3. connexion réservée aux visiteurs ; après connexion, toujours l'accueil
//    (`always_use_default_target_path`) ;
// 4. le reste exige une session, et `requiresAdmin` le rôle admin ;
// 5. pages d'un service : désactivé → accueil (message) ; instance inconnue →
//    page introuvable ; instance désactivée → accueil (message) ; non configuré
//    → services des paramètres (admin) ou accueil (message) ; injoignable et
//    hors index → index du service, qui affiche la bannière.

import type {
  BootstrapServices,
  MessageValues,
  ServiceId,
  ServicesHealthResponse,
} from '@hubarr/shared';
import { isServiceId } from '@hubarr/shared';
import type { Pinia } from 'pinia';
import type { RouteLocationNormalized, RouteLocationRaw, Router } from 'vue-router';
import { installLastVisited, readLastRoute, resolveHome } from '../home';
import { isConfigured, serviceIndexLocation, serviceLabel } from '../services';
import { useNotifyStore } from '../stores/notify';
import { useSessionStore } from '../stores/session';

export interface GuardOptions {
  /** Dernier état de santé connu (cache de TanStack Query), sans requête. */
  health?: () => ServicesHealthResponse | undefined;
}

export interface NavigationSession {
  setupRequired: boolean;
  authenticated: boolean;
  isAdmin: boolean;
}

export function resolveNavigation(
  to: RouteLocationNormalized,
  session: NavigationSession,
): true | RouteLocationRaw {
  const isSetup = to.matched.some((record) => record.meta.setup === true);
  if (session.setupRequired) return isSetup ? true : { name: 'setup-welcome' };
  if (isSetup) return { name: session.authenticated ? 'home' : 'login' };
  if (to.meta.guestOnly === true) return session.authenticated ? { name: 'home' } : true;
  if (to.meta.public === true) return true;
  if (!session.authenticated) return { name: 'login' };
  if (to.name === 'configure-services') {
    return session.isAdmin ? { name: 'settings', hash: '#section-services' } : { name: 'home' };
  }
  if (to.meta.requiresAdmin === true && !session.isAdmin) return { name: 'home' };
  return true;
}

/** Ce que les gardes de service lisent d'une route (normalisée ou résolue). */
export type RouteLike = Pick<RouteLocationNormalized, 'meta' | 'params' | 'path'>;

/** Service désigné par une route (méta `service`, ou paramètre `serviceParam`). */
export function serviceOfRoute(to: RouteLike): ServiceId | null {
  if (to.meta.service !== undefined) return to.meta.service;
  if (to.meta.serviceParam !== undefined) {
    const value = to.params[to.meta.serviceParam];
    return isServiceId(value) ? value : null;
  }
  return null;
}

export interface ServiceAccessDecision {
  to: RouteLocationRaw;
  flash?: { key: string; values: MessageValues };
}

export function resolveServiceAccess(
  to: RouteLike,
  session: { isAdmin: boolean; services: BootstrapServices },
  health?: ServicesHealthResponse,
): true | ServiceAccessDecision {
  const { services } = session;
  const required = to.meta.requiresAnyService;
  if (required !== undefined && !required.some((id) => isConfigured(services, id))) {
    return notConfigured(session.isAdmin, required.map(serviceLabel).join(' / '));
  }
  const service = serviceOfRoute(to);
  if (service === null) return true;
  const label = serviceLabel(service);

  if (services.states[service]?.disabled === true) {
    return {
      to: { name: 'home' },
      flash: {
        key: 'error.service_not_configured.service_disabled_flash',
        values: { service: label },
      },
    };
  }

  const slug = typeof to.params.slug === 'string' ? to.params.slug : undefined;
  if ((service === 'radarr' || service === 'sonarr') && slug !== undefined) {
    const instance = services.instances[service].find((row) => row.slug === slug);
    if (instance === undefined) {
      return { to: { name: 'not-found', params: { pathMatch: to.path.slice(1).split('/') } } };
    }
    if (!instance.enabled) {
      return {
        to: { name: 'home' },
        flash: {
          key: 'error.service_not_configured.service_disabled_flash',
          values: { service: instance.name },
        },
      };
    }
  }

  if (!isConfigured(services, service)) return notConfigured(session.isAdmin, label);

  if (to.meta.serviceIndex !== true && health !== undefined && isDown(health, service, slug)) {
    const index = serviceIndexLocation(services, service, slug);
    if (index !== null) return { to: index };
  }
  return true;
}

function notConfigured(isAdmin: boolean, label: string): ServiceAccessDecision {
  return {
    to: isAdmin ? { name: 'settings', hash: '#section-services' } : { name: 'home' },
    flash: {
      key: 'error.service_not_configured.service_unavailable_flash',
      values: { service: label },
    },
  };
}

function isDown(
  health: ServicesHealthResponse,
  service: ServiceId,
  slug: string | undefined,
): boolean {
  if ((service === 'radarr' || service === 'sonarr') && slug !== undefined) {
    return health.instances[service].find((row) => row.slug === slug)?.state === false;
  }
  return health.services[service] === false;
}

export function installGuards(router: Router, pinia: Pinia, options: GuardOptions = {}): void {
  router.beforeEach((to) => {
    const session = useSessionStore(pinia);
    const base = resolveNavigation(to, session);
    if (base !== true) return base;
    // Accueil : page choisie, sinon premier service configuré, sinon bienvenue.
    if (to.name === 'home') {
      const target = resolveHome(
        session.preferences.display_home_page,
        session.services,
        readLastRoute(),
        (name) => router.hasRoute(name),
      );
      if (target !== null) return target;
    }
    const decision = resolveServiceAccess(to, session, options.health?.());
    if (decision === true) return true;
    if (decision.flash) useNotifyStore(pinia).info(decision.flash.key, decision.flash.values);
    return decision.to;
  });
  installLastVisited(router);
}
