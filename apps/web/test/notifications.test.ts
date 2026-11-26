// SPDX-License-Identifier: AGPL-3.0-or-later
// Centre de notifications : historique du store (persistance par utilisateur,
// toasts optionnels, limite), temps relatif, et cloche de la barre du haut.

import { defaultDisplayValues } from '@hubarr/shared';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { relativeTime } from '../src/app/format';
import { i18n } from '../src/app/plugins/i18n';
import {
  HISTORY_LIMIT,
  historyStorageKey,
  readHistory,
  useNotifyStore,
} from '../src/app/stores/notify';
import { useSessionStore } from '../src/app/stores/session';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle } from './helpers';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('store des notifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useSessionStore().hydrate(bootstrapOf({ user: ADMIN }));
  });

  it('consigne chaque message dans l’historique, le plus récent en tête, et le persiste', () => {
    const notify = useNotifyStore();
    notify.success('admin.flash.saved');
    notify.error('error.generic.message');
    expect(notify.history.map((entry) => entry.key)).toEqual([
      'error.generic.message',
      'admin.flash.saved',
    ]);
    expect(notify.unread).toBe(2);
    expect(notify.queue).toHaveLength(2);
    expect(readHistory(localStorage.getItem(historyStorageKey(ADMIN.id)))).toHaveLength(2);
  });

  it('événement de fond : centre seulement ; retour éphémère : toast seulement', () => {
    const notify = useNotifyStore();
    notify.success('downloads.toast.completed', { name: 'a', size: '1 Go' }, { toast: false });
    notify.success('common.labels.copied', undefined, { history: false });
    expect(notify.history.map((entry) => entry.key)).toEqual(['downloads.toast.completed']);
    expect(notify.history[0]?.values).toEqual({ name: 'a', size: '1 Go' });
    expect(notify.queue.map((item) => item.key)).toEqual(['common.labels.copied']);
  });

  it('toasts désactivés : l’historique garde tout', () => {
    useSessionStore().setPreferences({ ...defaultDisplayValues(), display_toasts: '0' });
    const notify = useNotifyStore();
    notify.success('admin.flash.saved');
    expect(notify.queue).toHaveLength(0);
    expect(notify.history).toHaveLength(1);
  });

  it('limite, lecture, suppression et effacement', () => {
    const notify = useNotifyStore();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) notify.info('admin.flash.saved');
    expect(notify.history).toHaveLength(HISTORY_LIMIT);
    notify.markAllRead();
    expect(notify.unread).toBe(0);
    const first = notify.history[0];
    if (!first) throw new Error('historique vide');
    notify.remove(first.id);
    expect(notify.history).toHaveLength(HISTORY_LIMIT - 1);
    notify.clear();
    expect(notify.history).toEqual([]);
    expect(readHistory(localStorage.getItem(historyStorageKey(ADMIN.id)))).toEqual([]);
  });

  it('historique propre à chaque utilisateur, relu au rechargement', () => {
    useNotifyStore().success('admin.flash.saved');
    setActivePinia(createPinia());
    useSessionStore().hydrate(bootstrapOf({ user: { ...ADMIN, id: 2 } }));
    expect(useNotifyStore().history).toEqual([]);
    setActivePinia(createPinia());
    useSessionStore().hydrate(bootstrapOf({ user: ADMIN }));
    expect(useNotifyStore().history).toHaveLength(1);
  });

  it('ignore un stockage altéré', () => {
    expect(readHistory('pas du json')).toEqual([]);
    expect(readHistory('{"a":1}')).toEqual([]);
    expect(readHistory('[{"id":"x","key":"k","kind":"autre","at":1,"read":false}]')).toEqual([]);
  });
});

describe('temps relatif', () => {
  const now = Date.UTC(2026, 10, 25, 12);
  it('maintenant, minutes, heures, jours, semaines', () => {
    expect(relativeTime(now - 10_000, now, 'en')).toBe('now');
    expect(relativeTime(now - 5 * 60_000, now, 'en')).toBe('5 minutes ago');
    expect(relativeTime(now - 3 * 3_600_000, now, 'en')).toBe('3 hours ago');
    expect(relativeTime(now - 24 * 3_600_000, now, 'en')).toBe('yesterday');
    expect(relativeTime(now - 15 * 86_400_000, now, 'en')).toBe('2 weeks ago');
    expect(relativeTime(now - 5 * 60_000, now, 'fr')).toBe('il y a 5 minutes');
  });
});

describe('centre de notifications (barre du haut)', () => {
  it('badge des non lues, liste, puis tout passe à « lu » à la fermeture', async () => {
    fakeFetch({});
    const { wrapper } = await mountApp('/profil', bootstrapOf({ user: ADMIN }));
    await settle();
    const notify = useNotifyStore();
    notify.success('admin.flash.saved');
    notify.error('downloads.toast.errored', { name: 'Film.mkv' }, { toast: false });
    await settle();
    expect(wrapper.get('[data-test="notification-badge"]').text()).toContain('2');

    await wrapper.get('[data-test="notification-center"]').trigger('click');
    await settle();
    const items = document.body.querySelectorAll('[data-notification]');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain(t('downloads.toast.errored', { name: 'Film.mkv' }));
    expect(items[0]?.hasAttribute('data-unread')).toBe(true);

    await wrapper.get('[data-test="notification-center"]').trigger('click');
    await settle();
    expect(notify.unread).toBe(0);
  });

  it('état vide et effacement', async () => {
    fakeFetch({});
    const { wrapper } = await mountApp('/profil', bootstrapOf({ user: ADMIN }));
    await settle();
    useNotifyStore().info('admin.flash.saved');
    await wrapper.get('[data-test="notification-center"]').trigger('click');
    await settle();
    document.body.querySelector<HTMLElement>('[data-test="notification-clear"]')?.click();
    await settle();
    expect(document.body.querySelector('[data-test="notification-empty"]')?.textContent).toContain(
      t('topbar.notifications.empty'),
    );
  });
});
