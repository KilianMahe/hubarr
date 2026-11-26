// SPDX-License-Identifier: AGPL-3.0-or-later
// Gestion des utilisateurs : section des paramètres (liste, création avec
// droits, suppression) ; côté utilisateur, pages d'un service ouvertes par ses
// droits, pastille « Lecture seule » et message d'un refus (403).

import type { ManagedUser, ServiceInstance, SettingsResponse } from '@hubarr/shared';
import { mount } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue';
import { pageReadOnly, vWrite } from '../src/app/access';
import { ApiError } from '../src/app/api/client';
import { apiErrorText } from '../src/app/api/error-text';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import {
  ADMIN,
  bootstrapOf,
  fakeFetch,
  mountApp,
  setViewportWidth,
  settingsOf,
  settle,
} from './helpers';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});
const $ = (selector: string) => document.querySelector<HTMLElement>(selector);

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('élément absent');
  return value;
}

function type(value: string, input: HTMLInputElement): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

const RADARR: ServiceInstance = {
  id: 1,
  type: 'radarr',
  slug: 'films',
  name: 'Films',
  url: 'http://radarr:7878',
  hasApiKey: true,
  enabled: true,
  isDefault: true,
  position: 0,
  defaultQualityProfileId: null,
};

function settings(): SettingsResponse {
  const base = settingsOf();
  return {
    ...base,
    services: {
      ...base.services,
      prowlarr: { ...base.services.prowlarr, saved: true, configured: true },
    },
    instances: { radarr: [RADARR], sonarr: [] },
  };
}

function managed(overrides: Partial<ManagedUser> = {}): ManagedUser {
  return {
    id: 2,
    email: 'bob@example.com',
    displayName: 'Bob',
    role: 'user',
    avatarUrl: null,
    permissions: { 'radarr:films': 'write', prowlarr: 'read' },
    createdAt: '2026-11-20T10:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

beforeAll(async () => {
  await setLocale('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  setViewportWidth(1280);
});

async function openSection(extra: Parameters<typeof fakeFetch>[0] = {}) {
  const fake = fakeFetch({
    'GET /api/admin/settings': () => ({ body: settings() }),
    'GET /api/admin/users': () => ({
      body: { users: [managed({ ...ADMIN, permissions: {} }), managed()] },
    }),
    ...extra,
  });
  const mounted = await mountApp('/admin/settings#section-users', bootstrapOf({ user: ADMIN }));
  await settle();
  return { ...mounted, fake };
}

describe('section Utilisateurs', () => {
  it('liste les comptes : rôle, résumé des droits, pas de suppression de son propre compte', async () => {
    await openSection();
    expect(must($('[data-test="user-row-1"]')).textContent).toContain(t('users.summary.all'));
    expect(must($('[data-test="user-row-1"]')).textContent).toContain(t('users.you'));
    expect(must($('[data-test="user-row-2"]')).textContent).toContain(
      t('users.summary.counts', { write: 1, read: 1 }),
    );
    expect($('[data-test="user-delete-1"]')).toBeNull();
    expect($('[data-test="user-delete-2"]')).not.toBeNull();
  });

  it('création : e-mail, mot de passe et droits par instance et par service', async () => {
    const { fake } = await openSection({
      'POST /api/admin/users/create': () => ({ body: managed({ id: 3 }) }),
    });
    must($('[data-test="user-add"]')).click();
    await settle();
    type('carol@example.com', must($('[data-test="user-email"] input')) as HTMLInputElement);
    type('temporaire-1', must($('[data-test="user-password"] input')) as HTMLInputElement);
    // Une ligne par instance Radarr et par service configuré.
    expect($('[data-test="permission-radarr:films"]')).not.toBeNull();
    expect($('[data-test="permission-prowlarr"]')).not.toBeNull();
    expect($('[data-test="permission-tmdb"]')).toBeNull();
    must($('[data-test="permission-radarr:films-write"]')).click();
    must($('[data-test="permission-prowlarr-read"]')).click();
    await settle();
    must($('[data-test="user-submit"]')).click();
    await settle();
    expect(fake.calls.find((call) => call.url === '/api/admin/users/create')?.body).toEqual({
      email: 'carol@example.com',
      displayName: '',
      password: 'temporaire-1',
      role: 'user',
      permissions: { 'radarr:films': 'write', prowlarr: 'read' },
    });
  });

  it('« Tout : Aucun » retire tous les droits ; un admin n’envoie aucun droit', async () => {
    const { fake } = await openSection({
      'POST /api/admin/users/2/save': () => ({ body: managed() }),
    });
    must($('[data-test="user-edit-2"]')).click();
    await settle();
    must($('[data-test="user-permissions-all-none"]')).click();
    await settle();
    must($('[data-test="user-submit"]')).click();
    await settle();
    expect(fake.calls.find((call) => call.url === '/api/admin/users/2/save')?.body).toMatchObject({
      role: 'user',
      permissions: {},
    });
  });

  it('erreur de validation affichée dans le dialogue', async () => {
    await openSection({
      'POST /api/admin/users/create': () => ({
        status: 409,
        body: {
          code: 'EMAIL_TAKEN',
          details: [{ path: 'email', message: 'users.error.email_taken' }],
        },
      }),
    });
    must($('[data-test="user-add"]')).click();
    await settle();
    must($('[data-test="user-submit"]')).click();
    await settle();
    expect(must($('[data-test="user-error"]')).textContent).toContain(t('users.error.email_taken'));
  });

  it('suppression après confirmation', async () => {
    const { fake } = await openSection({
      'POST /api/admin/users/2/delete': () => ({ body: { ok: true } }),
    });
    must($('[data-test="user-delete-2"]')).click();
    await settle();
    const confirm = [...document.querySelectorAll<HTMLElement>('.v-overlay--active .v-btn')].find(
      (button) => button.textContent.trim() === t('common.action.delete'),
    );
    must(confirm).click();
    await settle();
    expect(fake.calls.some((call) => call.url === '/api/admin/users/2/delete')).toBe(true);
  });
});

describe('compte non admin', () => {
  const user = (permissions: Record<string, 'read' | 'write'>) =>
    bootstrapOf({
      user: { ...ADMIN, id: 2, role: 'user', permissions },
      services: {
        states: { radarr: { configured: true, disabled: false } },
        instances: {
          radarr: [{ slug: 'films', name: 'Films', enabled: true, isDefault: true }],
          sonarr: [],
        },
        sidebar: {},
      },
    });

  it('page d’un service lisible ouverte ; paramètres de Hubarr refusés', async () => {
    fakeFetch({});
    const { router } = await mountApp('/medias/films/films', user({ 'radarr:films': 'read' }));
    await settle();
    expect(router.currentRoute.value.name).toBe('radarr');
    await router.push('/admin/settings');
    await settle();
    expect(router.currentRoute.value.name).not.toBe('settings');
  });

  it('lecture seule : pastille dans la barre, pas de menu « Plus » ; écriture : pas de pastille', async () => {
    fakeFetch({});
    await mountApp('/medias/films/films', user({ 'radarr:films': 'read' }));
    await settle();
    expect(must($('[data-test="read-only-chip"]')).textContent).toContain(
      t('users.read_only.label'),
    );
    // Menu « Plus » (administration de l'instance) : admins seulement.
    expect($('[data-test="arr-admin-menu"]')).toBeNull();
    document.body.innerHTML = '';
    await mountApp('/medias/films/films', user({ 'radarr:films': 'write' }));
    await settle();
    expect($('[data-test="read-only-chip"]')).toBeNull();
  });

  it('mobile, lecture seule : pas de bouton d’ajout flottant', async () => {
    setViewportWidth(390);
    fakeFetch({});
    await mountApp('/medias/films/films', user({ 'radarr:films': 'read' }));
    await settle();
    expect($('[data-test="movies-add"]')).toBeNull();
    document.body.innerHTML = '';
    await mountApp('/medias/films/films', user({ 'radarr:films': 'write' }));
    await settle();
    expect($('[data-test="movies-add"]')).not.toBeNull();
  });

  it('refus du serveur (403) : message dédié', () => {
    const error = new ApiError(403, 'FORBIDDEN');
    expect(apiErrorText(error, t, 'error.generic.message')).toBe(t('users.error.forbidden'));
  });
});

describe('directive v-write', () => {
  it('sans valeur : suit la page ; avec une valeur : suit ce droit', async () => {
    const allowed = ref(true);
    const wrapper = mount(
      defineComponent(
        () => () =>
          h('div', [
            withDirectives(h('button', { id: 'page' }), [[vWrite]]),
            withDirectives(h('button', { id: 'right' }), [[vWrite, allowed.value]]),
          ]),
      ),
    );
    const display = (id: string) => wrapper.get(`#${id}`).element.getAttribute('style') ?? '';
    expect(display('page')).not.toContain('none');
    pageReadOnly.value = true;
    await nextTick();
    expect(display('page')).toContain('none');
    // Droit explicite (autre service) : indépendant de la page.
    expect(display('right')).not.toContain('none');
    allowed.value = false;
    await nextTick();
    expect(display('right')).toContain('none');
    pageReadOnly.value = false;
    wrapper.unmount();
  });
});
