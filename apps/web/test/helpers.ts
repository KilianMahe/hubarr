// SPDX-License-Identifier: AGPL-3.0-or-later
// Montage de la SPA complète pour les tests : Pinia, routeur en mémoire, i18n,
// Vuetify et TanStack Query, avec un `fetch` simulé route par route.

import {
  defaultDisplayValues,
  resolveTheme,
  type AuthUser,
  type BootstrapResponse,
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
  return { wrapper, router, session: useSessionStore(pinia), vuetify };
}

/** Laisse passer les promesses et les imports dynamiques des vues (transformés à la volée). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
