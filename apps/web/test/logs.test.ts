// SPDX-License-Identifier: AGPL-3.0-or-later
// Section « Journaux » des paramètres (admins) : liste, détail d'une entrée,
// copie, recherche, téléchargement filtré, pagination ; ancienne adresse
// redirigée, plus de lien dans le tiroir.

import type { LogEntry, LogsResponse } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import { levelColor, logsExportHref, logsSearchParams } from '../src/features/logs/logs-api';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settingsOf, settle } from './helpers';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 1,
    time: '2026-11-23T12:00:00.000Z',
    level: 'warn',
    msg: 'radarr/radarr-1: GET /api/v3/movie → HTTP 500 (Database locked)',
    service: 'radarr',
    context: { instance: 'radarr-1', status: 500, durationMs: 42, circuit: 'closed' },
    ...overrides,
  };
}

function page(entries: LogEntry[], overrides: Partial<LogsResponse> = {}): LogsResponse {
  return {
    entries,
    total: entries.length,
    nextBefore: null,
    capacity: 1000,
    level: 'warn',
    services: ['radarr'],
    ...overrides,
  };
}

beforeAll(async () => {
  await setLocale('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function open(handler: Parameters<typeof fakeFetch>[0][string]) {
  const fake = fakeFetch({
    'GET /api/admin/settings': () => ({ body: settingsOf() }),
    'GET /api/admin/logs': handler,
  });
  const mounted = await mountApp('/admin/settings#section-logs', bootstrapOf({ user: ADMIN }));
  await settle();
  return { ...mounted, fake };
}

describe('journaux : outils', () => {
  it('paramètres de requête sans valeur vide ; lien de téléchargement relatif', () => {
    expect(logsSearchParams({})).toBe('');
    expect(logsSearchParams({ level: 'warn', service: '', q: '  boom ' }, { before: '5' })).toBe(
      '?level=warn&q=boom&before=5',
    );
    expect(logsExportHref({ service: 'radarr' })).toBe('api/admin/logs/export?service=radarr');
    expect(levelColor('error')).toBe('error');
    expect(levelColor('warn')).toBe('warning');
    expect(levelColor('debug')).toBe('grey');
  });
});

describe('journaux : section des paramètres', () => {
  it('l’ancienne adresse mène à la section ; plus de lien dans le tiroir', async () => {
    fakeFetch({
      'GET /api/admin/settings': () => ({ body: settingsOf() }),
      'GET /api/admin/logs': () => ({ body: page([entry()]) }),
    });
    const { router, wrapper } = await mountApp('/admin/logs', bootstrapOf({ user: ADMIN }));
    await settle();
    expect(router.currentRoute.value.name).toBe('settings');
    expect(router.currentRoute.value.hash).toBe('#section-logs');
    expect(wrapper.find('[data-section="logs"]').exists()).toBe(true);
    expect(wrapper.get('[data-test="drawer-footer"]').text()).not.toContain(t('admin.nav.logs'));
  });

  it('liste les entrées avec niveau, service et sous-titre', async () => {
    const { wrapper } = await open(() => ({
      body: page([entry({ id: 2, level: 'error', msg: 'erreur interne', service: null }), entry()]),
    }));
    const list = wrapper.get('[data-test="logs-list"]');
    expect(list.text()).toContain('erreur interne');
    expect(list.text()).toContain('GET /api/v3/movie → HTTP 500');
    expect(list.text()).toContain('Radarr');
    expect(list.text()).toContain(t('admin.logs.level.error'));
    expect(wrapper.text()).toContain(
      t('admin.logs.subtitle', { count: 2, capacity: 1000, level: t('admin.logs.level.warn') }),
    );
    expect(wrapper.get('[data-test="logs-download"]').attributes('href')).toBe(
      'api/admin/logs/export',
    );
  });

  it('ouvre le détail d’une entrée et copie son JSON', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { wrapper } = await open(() => ({ body: page([entry()]) }));
    await wrapper.get('[data-test="log-1"]').trigger('click');
    await settle();
    const detail = document.body.querySelector('[data-test="log-detail"]');
    expect(detail?.textContent).toContain('Database locked');
    expect(document.body.querySelector('[data-test="log-detail-context"]')?.textContent).toContain(
      '"durationMs": 42',
    );
    document.body.querySelector<HTMLElement>('[data-test="log-copy"]')?.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"msg": "radarr/radarr-1'));
  });

  it('la recherche relit la liste filtrée et met à jour le téléchargement', async () => {
    const { wrapper, fake } = await open((call) => ({
      body: call.url.includes('q=refused') ? page([]) : page([entry()]),
    }));
    const input = wrapper.get('[data-test="logs-search"] input').element as HTMLInputElement;
    input.value = 'refused';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
    expect(fake.calls.some((call) => call.url === '/api/admin/logs?q=refused')).toBe(true);
    expect(wrapper.get('[data-test="logs-download"]').attributes('href')).toBe(
      'api/admin/logs/export?q=refused',
    );
    expect(wrapper.text()).toContain(t('admin.logs.empty.filtered'));
  });

  it('« Voir plus » charge la page suivante par curseur', async () => {
    const { wrapper, fake } = await open((call) =>
      call.url.includes('before=5')
        ? { body: page([entry({ id: 4, msg: 'plus ancienne' })]) }
        : { body: page([entry({ id: 6 }), entry({ id: 5 })], { total: 3, nextBefore: 5 }) },
    );
    await wrapper.get('[data-test="logs-more"]').trigger('click');
    await settle();
    expect(fake.calls.some((call) => call.url === '/api/admin/logs?before=5')).toBe(true);
    expect(wrapper.get('[data-test="logs-list"]').text()).toContain('plus ancienne');
    expect(wrapper.find('[data-test="logs-more"]').exists()).toBe(false);
  });

  it('tampon vide : état vide explicatif', async () => {
    const { wrapper } = await open(() => ({ body: page([], { services: [] }) }));
    expect(wrapper.get('[data-test="logs-empty"]').text()).toContain(t('admin.logs.empty.text'));
  });
});
