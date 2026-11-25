// SPDX-License-Identifier: AGPL-3.0-or-later
// Shell, routeur et écrans hors session (P0.12) : gardes, assistant, connexion,
// déconnexion, accent par service.
import { SERVICE_ACCENTS, SOURCE_CODE_URL, type ProfileResponse } from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteLocationNormalized } from 'vue-router';
import { VSelect } from 'vuetify/components';
import { ApiError } from '../src/app/api/client';
import { handleSessionError } from '../src/app/api/errors';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import { resolveNavigation } from '../src/app/router/guards';
import { useNotifyStore } from '../src/app/stores/notify';
import { loginErrorKey } from '../src/features/auth/login-error';
import { avatarProblem, membershipOf } from '../src/features/profile/membership';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle } from './helpers';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});

beforeEach(async () => {
  await setLocale('en');
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
});

function to(meta: RouteLocationNormalized['meta'], setup = false): RouteLocationNormalized {
  return {
    meta,
    matched: [{ meta: setup ? { setup: true } : {} }],
  } as unknown as RouteLocationNormalized;
}

describe('resolveNavigation', () => {
  const anon = { setupRequired: false, authenticated: false, isAdmin: false };
  const admin = { setupRequired: false, authenticated: true, isAdmin: true };
  const user = { setupRequired: false, authenticated: true, isAdmin: false };

  it('n’ouvre que l’assistant tant que l’installation est à faire', () => {
    const pending = { ...anon, setupRequired: true };
    expect(resolveNavigation(to({}), pending)).toEqual({ name: 'setup-welcome' });
    expect(resolveNavigation(to({ public: true, guestOnly: true }), pending)).toEqual({
      name: 'setup-welcome',
    });
    expect(resolveNavigation(to({}, true), pending)).toBe(true);
  });

  it('ferme l’assistant une fois l’installation faite', () => {
    expect(resolveNavigation(to({}, true), anon)).toEqual({ name: 'login' });
    expect(resolveNavigation(to({}, true), admin)).toEqual({ name: 'home' });
  });

  it('réserve la connexion aux visiteurs et le reste aux comptes', () => {
    expect(resolveNavigation(to({ guestOnly: true, public: true }), admin)).toEqual({
      name: 'home',
    });
    expect(resolveNavigation(to({ guestOnly: true, public: true }), anon)).toBe(true);
    expect(resolveNavigation(to({}), anon)).toEqual({ name: 'login' });
    expect(resolveNavigation(to({}), user)).toBe(true);
  });

  it('réserve les écrans d’administration au rôle admin', () => {
    expect(resolveNavigation(to({ requiresAdmin: true }), user)).toEqual({ name: 'home' });
    expect(resolveNavigation(to({ requiresAdmin: true }), admin)).toBe(true);
  });
});

describe('assistant d’installation', () => {
  it('redirige toute page vers l’accueil de l’assistant', async () => {
    fakeFetch({ 'GET /api/setup': () => ({ body: { next: 'welcome' } }) });
    const { router, wrapper } = await mountApp('/profil', bootstrapOf({ setupRequired: true }));
    await settle();
    expect(router.currentRoute.value.name).toBe('setup-welcome');
    expect(wrapper.text()).toContain(t('setup.step.welcome.title'));
    expect(wrapper.find('[data-test="theme-toggle"]').exists()).toBe(true);
  });

  it('ferme une installation à moitié faite et renvoie vers la connexion', async () => {
    fakeFetch({ 'GET /api/setup': () => ({ body: { next: 'home' } }) });
    const { router, session } = await mountApp(
      '/setup/welcome',
      bootstrapOf({ setupRequired: true }),
    );
    await settle();
    expect(session.setupRequired).toBe(false);
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('affiche toutes les erreurs de validation ensemble', async () => {
    fakeFetch({
      'GET /api/setup': () => ({ body: { next: 'welcome' } }),
      'POST /api/setup/admin': () => ({
        status: 400,
        body: {
          code: 'VALIDATION',
          details: [
            { path: ['email'], message: 'setup.error.email_invalid' },
            { path: ['passwordConfirm'], message: 'setup.error.password_mismatch' },
          ],
        },
      }),
    });
    const { wrapper } = await mountApp('/setup/admin', bootstrapOf({ setupRequired: true }));
    await settle();
    await wrapper.get('form').trigger('submit');
    await settle();
    const errors = wrapper.get('[data-test="setup-errors"]').text();
    expect(errors).toContain(t('setup.error.email_invalid'));
    expect(errors).toContain(t('setup.error.password_mismatch'));
  });

  it('crée l’admin, le connecte et ouvre les services avec le message de bienvenue', async () => {
    const { calls } = fakeFetch({
      'GET /api/setup': () => ({ body: { next: 'welcome' } }),
      'POST /api/setup/admin': () => ({
        body: { user: ADMIN, csrfToken: 'csrf-2', next: 'services' },
      }),
    });
    const { wrapper, router, session } = await mountApp(
      '/setup/admin',
      bootstrapOf({ setupRequired: true }),
    );
    await settle();
    await wrapper.get('[data-test="setup-email"] input').setValue('admin@example.com');
    await wrapper.get('[data-test="setup-password"] input').setValue('password-1');
    await wrapper.get('[data-test="setup-password-confirm"] input').setValue('password-1');
    await wrapper.get('form').trigger('submit');
    await settle();
    expect(calls.find((c) => c.url === '/api/setup/admin')?.body).toEqual({
      email: 'admin@example.com',
      password: 'password-1',
      passwordConfirm: 'password-1',
    });
    expect(session.user).toEqual(ADMIN);
    expect(session.setupRequired).toBe(false);
    expect(router.currentRoute.value.name).toBe('settings');
    expect(router.currentRoute.value.hash).toBe('#section-services');
    expect(useNotifyStore().queue.at(-1)?.key).toBe('setup.flash.connect_services');
  });

  it('change la langue de l’assistant en session', async () => {
    const { calls } = fakeFetch({
      'GET /api/setup': () => ({ body: { next: 'welcome' } }),
      'POST /api/setup/locale': () => ({ status: 204 }),
    });
    const { wrapper } = await mountApp('/setup/welcome', bootstrapOf({ setupRequired: true }));
    await settle();
    const select = wrapper.findComponent(VSelect);
    select.vm.$emit('update:modelValue', 'fr');
    await settle();
    expect(calls.find((c) => c.url === '/api/setup/locale')?.body).toEqual({ locale: 'fr' });
    // Catalogue FR chargé à la demande : plus lent sous la charge de `make check`.
    await vi.waitFor(() => {
      expect(i18n.global.locale.value).toBe('fr');
    });
    expect(document.documentElement.lang).toBe('fr');
  });
});

describe('connexion', () => {
  it('envoie un visiteur vers la connexion, avec la bascule de thème', async () => {
    fakeFetch({});
    const { router, wrapper } = await mountApp('/');
    await settle();
    expect(router.currentRoute.value.name).toBe('login');
    expect(wrapper.text()).toContain(t('login.forgot_hint'));
    expect(wrapper.find('[data-test="theme-toggle"]').exists()).toBe(true);
  });

  it('connecte, remplace le jeton CSRF et ouvre l’accueil', async () => {
    const { calls } = fakeFetch({
      'POST /api/auth/login': () => ({ body: { user: ADMIN, csrfToken: 'csrf-2' } }),
      'POST /api/auth/logout': () => ({ status: 204 }),
      'GET /api/auth/csrf': () => ({ body: { token: 'csrf-3' } }),
    });
    const { wrapper, router } = await mountApp('/login');
    await wrapper.get('[data-test="login-email"] input').setValue('admin@example.com');
    await wrapper.get('[data-test="login-password"] input').setValue('password-1');
    await wrapper.get('form').trigger('submit');
    await settle();
    const login = calls.find((c) => c.url === '/api/auth/login');
    expect(login?.headers['x-csrf-token']).toBe('csrf-1');
    expect(login?.body).toEqual({
      email: 'admin@example.com',
      password: 'password-1',
      remember: true,
    });
    expect(router.currentRoute.value.name).toBe('dashboard');
    expect(wrapper.find('[data-test="dashboard-view"]').exists()).toBe(true);

    // Compte dans le menu latéral seulement (P5d.4, V34).
    expect(wrapper.find('[data-test="user-menu"]').exists()).toBe(false);
    document.querySelector<HTMLElement>('[data-test="drawer-logout"]')?.click();
    await settle();
    const logout = calls.find((c) => c.url === '/api/auth/logout');
    expect(logout?.headers['x-csrf-token']).toBe('csrf-2');
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('traduit les échecs : identifiants, trop de tentatives, autre', async () => {
    fakeFetch({
      'POST /api/auth/login': () => ({ status: 401, body: { code: 'INVALID_CREDENTIALS' } }),
    });
    const { wrapper } = await mountApp('/login');
    await wrapper.get('[data-test="login-email"] input').setValue('a@example.com');
    await wrapper.get('[data-test="login-password"] input').setValue('nope');
    await wrapper.get('form').trigger('submit');
    await settle();
    expect(wrapper.get('[data-test="login-error"]').text()).toBe(t('login.error.invalid'));

    expect(loginErrorKey(new ApiError(429, 'LOGIN_THROTTLED'))).toBe('login.error.throttled');
    expect(loginErrorKey(new ApiError(0, 'NETWORK'))).toBe('login.error.generic');
  });

  it('signale un serveur injoignable dès l’écran de connexion', async () => {
    fakeFetch({});
    const { wrapper } = await mountApp('/login', null);
    expect(wrapper.get('[data-test="login-error"]').text()).toBe(t('error.503.message'));
  });
});

describe('shell connecté', () => {
  it('affiche le tiroir, le lien vers le code source et la version', async () => {
    fakeFetch({});
    const { wrapper } = await mountApp('/', bootstrapOf({ user: ADMIN }));
    await settle();
    const drawer = wrapper.get('[data-test="nav-drawer"]').text();
    expect(drawer).toContain(t('footer.source_code'));
    expect(drawer).toContain(t('footer.version', { version: '1.2.3' }));
    expect(drawer).toContain(t('sidebar.footer.settings'));
  });

  it('pied du tiroir : liste verticale Paramètres, Aide, Code source', async () => {
    fakeFetch({});
    const { wrapper } = await mountApp('/', bootstrapOf({ user: ADMIN }));
    await settle();
    const footer = wrapper.get('[data-test="drawer-footer"]');
    const items = footer.findAll('.v-list-item');
    expect(items.map((item) => item.text())).toEqual([
      t('sidebar.footer.settings'),
      t('footer.help'),
      t('footer.source_code'),
    ]);
    expect(items[2]?.attributes('href')).toBe(SOURCE_CODE_URL);
    expect(items[2]?.attributes('target')).toBe('_blank');
  });

  it('cache les paramètres à un utilisateur non admin', async () => {
    fakeFetch({});
    const user = { ...ADMIN, role: 'user' as const };
    const { router, wrapper } = await mountApp('/admin/settings', bootstrapOf({ user }));
    await settle();
    expect(router.currentRoute.value.name).toBe('dashboard');
    expect(wrapper.get('[data-test="nav-drawer"]').text()).not.toContain(
      t('sidebar.footer.settings'),
    );
  });

  it('affiche la page introuvable dans le shell', async () => {
    fakeFetch({});
    const { wrapper } = await mountApp('/nulle/part', bootstrapOf({ user: ADMIN }));
    await settle();
    expect(wrapper.text()).toContain(t('error.404.title'));
  });

  it('renvoie vers la connexion quand la session expire, vers l’assistant si la base est neuve', async () => {
    fakeFetch({});
    const { router, session } = await mountApp('/profil', bootstrapOf({ user: ADMIN }));
    // On attend la navigation lancée par `handleSessionError` elle-même plutôt
    // qu'un délai : sous la charge de `make check` (tests serveur en parallèle),
    // `settle()` puis `vi.waitFor` (5 s) ne suffisaient pas toujours.
    const replace = vi.spyOn(router, 'replace');
    const lastNavigation = async () => {
      await (replace.mock.results.at(-1)?.value as Promise<unknown> | undefined);
      return router.currentRoute.value.name;
    };
    expect(handleSessionError(new ApiError(401, 'UNAUTHENTICATED'), router)).toBe(true);
    expect(await lastNavigation()).toBe('login');
    expect(session.user).toBeNull();
    expect(handleSessionError(new ApiError(409, 'SETUP_REQUIRED'), router)).toBe(true);
    expect(await lastNavigation()).toBe('setup-welcome');
    expect(handleSessionError(new ApiError(400, 'VALIDATION'), router)).toBe(false);
  });
});

describe('profil', () => {
  const profile: ProfileResponse = {
    user: ADMIN,
    displayNameRaw: 'Admin',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
    watchlist: { count: 0, recent: [] },
  };

  it('enregistre le nom et le mot de passe en un envoi, et vide les mots de passe', async () => {
    const { calls } = fakeFetch({
      'GET /api/profil': () => ({ body: profile }),
      'POST /api/profil': () => ({
        body: { ...profile, displayNameRaw: 'Neo', user: { ...ADMIN, displayName: 'Neo' } },
      }),
    });
    const { wrapper, session } = await mountApp('/profil', bootstrapOf({ user: ADMIN }));
    await settle();
    await wrapper.get('[data-test="profile-display-name"] input').setValue('Neo');
    await wrapper.get('[data-test="profile-current-password"] input').setValue('old-password');
    await wrapper.get('[data-test="profile-new-password"] input').setValue('new-password');
    await wrapper.get('[data-test="profile-confirm-password"] input').setValue('new-password');
    await wrapper.get('form').trigger('submit');
    await settle();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      displayName: 'Neo',
      currentPassword: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'new-password',
    });
    expect(session.user?.displayName).toBe('Neo');
    expect(
      (wrapper.get('[data-test="profile-current-password"] input').element as HTMLInputElement)
        .value,
    ).toBe('');
  });

  it('affiche l’erreur du mot de passe actuel', async () => {
    fakeFetch({
      'GET /api/profil': () => ({ body: profile }),
      'POST /api/profil': () => ({
        status: 400,
        body: {
          code: 'VALIDATION',
          details: [{ path: 'currentPassword', message: 'flash.password.current_wrong' }],
        },
      }),
    });
    const { wrapper } = await mountApp('/profil', bootstrapOf({ user: ADMIN }));
    await settle();
    await wrapper.get('form').trigger('submit');
    await settle();
    expect(wrapper.get('[data-test="profile-errors"]').text()).toContain(
      t('flash.password.current_wrong'),
    );
  });

  it('préférences d’affichage : lignes des services configurés, enregistrées pour le compte', async () => {
    const saved = {
      moviesView: 'table',
      seriesView: 'auto',
      torrentsView: 'compact',
      torrentsFilter: 'downloading',
    };
    const { calls } = fakeFetch({
      'GET /api/profil': () => ({ body: profile }),
      'POST /api/profil/preferences': () => ({ body: saved }),
    });
    const services = {
      states: {
        radarr: { configured: true, disabled: false },
        qbittorrent: { configured: true, disabled: false },
      },
      instances: { radarr: [], sonarr: [] },
      sidebar: {},
    };
    const { wrapper, session } = await mountApp('/profil', bootstrapOf({ user: ADMIN, services }));
    await settle();
    const card = wrapper.get('[data-test="profile-preferences"]');
    expect(card.find('[data-test="pref-movies-view"]').exists()).toBe(true);
    expect(card.find('[data-test="pref-series-view"]').exists()).toBe(false);
    const select = (label: string) =>
      wrapper.findAllComponents(VSelect).find((component) => component.props('label') === t(label));
    select('profile.preferences.movies_view')?.vm.$emit('update:modelValue', 'table');
    select('profile.preferences.torrents_view')?.vm.$emit('update:modelValue', 'compact');
    select('profile.preferences.torrents_filter')?.vm.$emit('update:modelValue', 'downloading');
    await settle();
    await card.get('form').trigger('submit');
    await settle();
    expect(calls.find((c) => c.url === '/api/profil/preferences')?.body).toEqual(saved);
    expect(session.userPreferences).toEqual(saved);
  });

  it('calcule l’ancienneté et contrôle l’avatar avant l’envoi', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    expect(membershipOf('2026-11-18T08:00:00Z', now)).toEqual({
      key: 'profile.stats.today',
      count: 0,
    });
    expect(membershipOf('2026-11-08T12:00:00Z', now)).toEqual({
      key: 'profile.stats.days_short',
      count: 10,
    });
    expect(membershipOf('2026-07-01T12:00:00Z', now)).toEqual({
      key: 'profile.stats.months_short',
      count: 5,
    });
    expect(membershipOf('2024-11-01T12:00:00Z', now)).toEqual({
      key: 'profile.stats.years_short',
      count: 2,
    });
    const types = ['image/png'];
    expect(avatarProblem({ size: 10, type: 'image/png' }, 100, types)).toBeNull();
    expect(avatarProblem({ size: 200, type: 'image/png' }, 100, types)).toBe(
      'flash.profile.avatar_too_big',
    );
    expect(avatarProblem({ size: 10, type: 'image/bmp' }, 100, types)).toBe(
      'flash.profile.avatar_invalid_mime',
    );
  });
});

describe('accent par service', () => {
  it('teinte le thème à la couleur du service, et revient à l’accent du thème', async () => {
    fakeFetch({});
    const { vuetify } = await mountApp('/', bootstrapOf({ user: ADMIN }));
    vuetify.theme.setService('radarr');
    expect(vuetify.theme.service.value).toBe('radarr');
    const css = () => [...document.querySelectorAll('style')].map((s) => s.textContent).join('');
    await settle();
    expect(css()).toMatch(/--v-theme-service:\s*251,\s*191,\s*36/);
    vuetify.theme.setService(null);
    await settle();
    expect(css()).not.toMatch(/--v-theme-service:\s*251,\s*191,\s*36/);
    expect(vuetify.theme.service.value).toBeNull();
    expect(SERVICE_ACCENTS.radarr.dark).toBe('#fbbf24');
  });
});
