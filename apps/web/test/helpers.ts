// SPDX-License-Identifier: AGPL-3.0-or-later
// Montage de la SPA complète pour les tests : Pinia, routeur en mémoire, i18n,
// Vuetify et TanStack Query, avec un `fetch` simulé route par route.

import {
  DASHBOARD_SECTIONS,
  SERVICE_IDS,
  DEFAULT_USER_PREFERENCES,
  defaultDisplayValues,
  resolveTheme,
  type AuthUser,
  type BootstrapResponse,
  type FlatServiceState,
  type SettingsResponse,
} from '@hubarr/shared';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import App from '../src/app/App.vue';
import { i18n } from '../src/app/plugins/i18n';
import { createHubarrVuetify } from '../src/app/plugins/vuetify';
import { createHubarrRouter, routes } from '../src/app/router';
import type { RouteRecordRaw } from 'vue-router';
import { useSessionStore } from '../src/app/stores/session';

export const ADMIN: AuthUser = {
  id: 1,
  email: 'admin@example.com',
  role: 'admin',
  displayName: 'Admin',
  avatarUrl: null,
  permissions: {},
};

export function bootstrapOf(overrides: Partial<BootstrapResponse> = {}): BootstrapResponse {
  return {
    setupRequired: false,
    user: null,
    csrfToken: 'csrf-1',
    locale: 'en',
    version: '1.2.3',
    theme: resolveTheme(undefined, undefined),
    services: { states: {}, instances: { radarr: [], sonarr: [] }, sidebar: {} },
    preferences: defaultDisplayValues(),
    userPreferences: { ...DEFAULT_USER_PREFERENCES },
    ...overrides,
  };
}

export interface FakeCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export type FakeHandler = (call: FakeCall) => {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};

/** Remplace `fetch` : `routes['POST /api/auth/login']` répond à cet appel. */
export function fakeFetch(routes: Record<string, FakeHandler>) {
  const calls: FakeCall[] = [];
  const spy = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : init.body;
    const call = { method, url, headers, body };
    calls.push(call);
    const handler = routes[`${method} ${url.split('?')[0] ?? url}`];
    if (!handler) {
      return Promise.resolve(new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404 }));
    }
    const result = handler(call);
    const status = result.status ?? 200;
    return Promise.resolve(
      new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
        status,
        headers: { 'content-type': 'application/json', ...result.headers },
      }),
    );
  });
  vi.stubGlobal('fetch', spy);
  return { calls, spy };
}

/** Charge d'avance les vues importées à la demande : la navigation ne dépend plus du temps de transformation. */
async function preloadViews(records: RouteRecordRaw[]): Promise<void> {
  await Promise.all(
    records.map(async (record) => {
      if (typeof record.component === 'function')
        await (record.component as () => Promise<unknown>)();
      await preloadViews(record.children ?? []);
    }),
  );
}

export async function mountApp(path: string, bootstrap: BootstrapResponse | null = bootstrapOf()) {
  await preloadViews(routes);
  const pinia = createPinia();
  useSessionStore(pinia).hydrate(bootstrap);
  const router = createHubarrRouter(pinia, createMemoryHistory());
  const vuetify = createHubarrVuetify(resolveTheme(undefined, undefined));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [pinia, i18n, vuetify.plugin, router, [VueQueryPlugin, { queryClient }]] },
  });
  await flushPromises();
  return { wrapper, router, session: useSessionStore(pinia), vuetify, queryClient };
}

/** Laisse passer les promesses et les imports dynamiques des vues (transformés à la volée). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Largeur de la fenêtre : Vuetify 4 interroge `matchMedia`, évalué par happy-dom sur son viewport. */
export function setViewportWidth(width: number): void {
  const happy = (window as unknown as { happyDOM: { setViewport(size: object): void } }).happyDOM;
  happy.setViewport({ width, height: 900 });
}

const EMPTY_SERVICE: FlatServiceState = {
  saved: false,
  configured: false,
  enabled: true,
  url: '',
  user: '',
  hasApiKey: false,
  hasPassword: false,
};

/** Réponse de `GET /api/admin/settings` : aucun service configuré. */
export function settingsOf(overrides: Partial<SettingsResponse> = {}): SettingsResponse {
  return {
    services: Object.fromEntries(
      SERVICE_IDS.filter((id) => id !== 'radarr' && id !== 'sonarr').map((id) => [
        id,
        EMPTY_SERVICE,
      ]),
    ) as SettingsResponse['services'],
    instances: { radarr: [], sonarr: [] },
    sidebar: Object.fromEntries([...SERVICE_IDS, 'calendar'].map((id) => [id, true])),
    display: { ...defaultDisplayValues(), display_timezone: '' },
    systemTimezone: 'Europe/Paris',
    timezones: ['Europe/Paris', 'UTC'],
    dashboard: DASHBOARD_SECTIONS.map((key) => ({ key, visible: true })),
    theme: resolveTheme(undefined, undefined),
    backup: { exportable: 0, skipped: 0 },
    about: {
      version: '1.2.3',
      nodeVersion: 'v24',
      databasePath: '/data/hubarr.db',
      databaseSize: 0,
      avatarsDir: '/data/avatars',
      userCount: 1,
      serverTime: '2026-11-18T12:00:00.000Z',
      timezone: 'UTC',
    },
    ...overrides,
  };
}
