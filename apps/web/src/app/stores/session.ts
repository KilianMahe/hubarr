// SPDX-License-Identifier: AGPL-3.0-or-later
// Session côté client : état initial du serveur (`GET /api/bootstrap`),
// utilisateur connecté, connexion, déconnexion et fin de l'assistant. Le jeton
// CSRF est tenu par le client API (`api.setCsrfToken`).

import {
  DEFAULT_USER_PREFERENCES,
  bootstrapResponseSchema,
  hasAccess,
  defaultDisplayValues,
  loginResponseSchema,
  type AccessLevel,
  type AuthUser,
  type BootstrapResponse,
  type BootstrapServices,
  type DisplayValues,
  type LoginRequest,
  type ServiceId,
  type SetupAdminResponse,
  type UserPreferences,
} from '@hubarr/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/client';

export const useSessionStore = defineStore('session', () => {
  const user = ref<AuthUser | null>(null);
  const setupRequired = ref(false);
  const version = ref('');
  /** Faux si `GET /api/bootstrap` n'a pas répondu : le serveur est injoignable. */
  const serverReachable = ref(true);
  /** Services configurés, instances et visibilité dans le menu (tiroir, gardes). */
  const services = ref<BootstrapServices>(emptyServices());
  /** Préférences d'affichage (formats, densité, page d'accueil, toasts…). */
  const preferences = ref<DisplayValues>(
    defaultDisplayValues(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );

  /** Préférences du compte connecté (modes et filtre d'ouverture des pages). */
  const userPreferences = ref<UserPreferences>({ ...DEFAULT_USER_PREFERENCES });

  const authenticated = computed(() => user.value !== null);
  const isAdmin = computed(() => user.value?.role === 'admin');

  /**
   * Droit du compte sur un service (instance Radarr/Sonarr ; sans slug : au
   * moins une). Le serveur reste l'autorité : ceci ne sert qu'à l'affichage.
   * Exposé en valeur calculée et non en action : un appel (dans un rendu) ne
   * passe pas par le suivi des actions de Pinia.
   */
  const can = computed(
    () =>
      (service: ServiceId, slug: string | null | undefined, level: AccessLevel): boolean =>
        hasAccess(user.value, service, slug ?? null, level),
  );

  function hydrate(bootstrap: BootstrapResponse | null): void {
    serverReachable.value = bootstrap !== null;
    if (bootstrap === null) return;
    user.value = bootstrap.user;
    setupRequired.value = bootstrap.setupRequired;
    version.value = bootstrap.version;
    services.value = bootstrap.services;
    preferences.value = bootstrap.preferences;
    userPreferences.value = bootstrap.userPreferences;
    api.setCsrfToken(bootstrap.csrfToken);
  }

  function setPreferences(next: DisplayValues): void {
    preferences.value = next;
  }

  function setUserPreferences(next: UserPreferences): void {
    userPreferences.value = next;
  }

  function setServices(next: BootstrapServices): void {
    services.value = next;
  }

  /**
   * Relit l'état des services et le compte (après la connexion : le bootstrap
   * initial était anonyme ; après un refus : les droits ont pu changer).
   */
  async function refreshServices(): Promise<void> {
    try {
      const bootstrap = await api.get('/api/bootstrap', bootstrapResponseSchema);
      // Version d'abord : le cache persistant démarre au changement d'utilisateur.
      if (bootstrap.version !== '') version.value = bootstrap.version;
      if (bootstrap.user !== null) user.value = bootstrap.user;
      services.value = bootstrap.services;
      preferences.value = bootstrap.preferences;
      userPreferences.value = bootstrap.userPreferences;
    } catch {
      // Le shell reste utilisable ; les gardes se fient à l'état connu.
    }
  }

  async function login(request: LoginRequest): Promise<void> {
    const response = await api.post('/api/auth/login', request, loginResponseSchema);
    // La session est régénérée : l'ancien jeton est refusé.
    api.setCsrfToken(response.csrfToken);
    // Bootstrap relu avant de poser l'utilisateur : version et préférences
    // de l'installation ne sont renvoyées qu'à une session connectée.
    await refreshServices();
    user.value = response.user;
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout');
    } finally {
      user.value = null;
      services.value = emptyServices();
      userPreferences.value = { ...DEFAULT_USER_PREFERENCES };
      // Nouveau jeton pour la session anonyme (connexion suivante).
      await api.refreshCsrfToken().catch(() => undefined);
    }
  }

  /** Admin créé par l'assistant : connecté dans une session neuve. */
  function completeSetup(response: SetupAdminResponse): void {
    api.setCsrfToken(response.csrfToken);
    user.value = response.user;
    setupRequired.value = false;
    void refreshServices();
  }

  function setUser(next: AuthUser): void {
    user.value = next;
  }

  /** Session expirée ou fermée ailleurs (401). */
  function expire(): void {
    user.value = null;
  }

  /** Installation à refaire (409 `SETUP_REQUIRED`, base remise à zéro). */
  function requireSetup(): void {
    setupRequired.value = true;
    user.value = null;
  }

  return {
    user,
    setupRequired,
    version,
    serverReachable,
    services,
    preferences,
    userPreferences,
    authenticated,
    isAdmin,
    can,
    hydrate,
    login,
    logout,
    completeSetup,
    setUser,
    setServices,
    setPreferences,
    setUserPreferences,
    refreshServices,
    expire,
    requireSetup,
  };
});

function emptyServices(): BootstrapServices {
  return { states: {}, instances: { radarr: [], sonarr: [] }, sidebar: {} };
}
