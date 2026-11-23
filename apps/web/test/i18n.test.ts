// SPDX-License-Identifier: AGPL-3.0-or-later
// Branchement de vue-i18n sur le format ICU et résolution de la langue (P0.9).
import { defaultDisplayValues, resolveTheme, type BootstrapResponse } from '@hubarr/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBootstrap, resolveLocale } from '../src/app/boot';
import { i18n, localeFromQuery, setLocale } from '../src/app/plugins/i18n';

const { t } = i18n.global;

const bootstrap: BootstrapResponse = {
  setupRequired: false,
  user: null,
  csrfToken: 'token',
  locale: 'fr',
  version: '0.0.0',
  theme: resolveTheme('nord', undefined),
  services: { states: {}, instances: { radarr: [], sonarr: [] }, sidebar: {} },
  preferences: defaultDisplayValues(),
};

afterEach(async () => {
  await setLocale('en');
});

describe('vue-i18n + ICU', () => {
  it('rend les pluriels ICU des catalogues dans chaque langue', async () => {
    await setLocale('fr');
    expect(t('profile.stats.watchlist_label', { count: 0 })).toBe('Aucun film/série dans ma liste');
    expect(t('profile.stats.watchlist_label', { count: 1 })).toBe('1 film/série dans ma liste');
    expect(t('profile.stats.watchlist_label', { count: 2 })).toBe('2 films/séries dans ma liste');

    await setLocale('en');
    expect(t('common.action.save')).toBe('Save');
    expect(t('common.status.yes')).toBe('Yes');
  });

  it('suit la langue active et met à jour `<html lang>`', async () => {
    await setLocale('fr');
    expect(i18n.global.locale.value).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(t('common.action.save')).toBe('Enregistrer');
  });

  it('renvoie la clé d’un message inconnu', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it('rend un message sans sa valeur tel quel plutôt que de planter', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(t('profile.stats.watchlist_label')).toContain('{count, plural');
  });
});

describe('résolution de la langue', () => {
  it('`?_locale` prime sur le serveur ; une valeur inconnue est ignorée', () => {
    expect(localeFromQuery('?_locale=fr')).toBe('fr');
    expect(localeFromQuery('?_locale=de')).toBeNull();
    expect(localeFromQuery('')).toBeNull();
    expect(resolveLocale('?_locale=en', bootstrap)).toBe('en');
    expect(resolveLocale('?_locale=zz', bootstrap)).toBe('fr');
    expect(resolveLocale('', null)).toBe('en');
  });

  it('lit l’état initial et tolère un serveur absent ou une réponse invalide', async () => {
    const ok = vi.fn<typeof fetch>().mockResolvedValue(Response.json(bootstrap));
    expect(await fetchBootstrap(ok)).toEqual(bootstrap);
    expect(ok).toHaveBeenCalledWith(
      '/api/bootstrap',
      expect.objectContaining({ credentials: 'same-origin' }),
    );

    const invalid = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ locale: 'de' }));
    expect(await fetchBootstrap(invalid)).toBeNull();
    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network'));
    expect(await fetchBootstrap(down)).toBeNull();
    const error = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    expect(await fetchBootstrap(error)).toBeNull();
  });
});
