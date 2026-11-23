// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `HealthServiceTest::testIsConfigured*`, `HealthServiceBazarrTest`,
// `AdminSettingsControllerTest` (secrets préservés), `AdminSettingsRemoveServiceTest`
// et `AdminSettingsSaveKeepsServicesEnabledTest`, au niveau du stockage.

import { SERVICE_SETTINGS, SERVICE_IDS } from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../../../src/db/client';
import { createInstance, setInstanceEnabled } from '../../../src/modules/instances/instances';
import {
  applyServicePatch,
  isServiceConfigured,
  isServiceDisabled,
  readServiceConfig,
} from '../../../src/modules/services/config';
import { createTestDatabase } from '../../helpers';

let database: AppDatabase;
beforeEach(async () => {
  database = await createTestDatabase();
});
afterEach(() => {
  database.close();
});

describe('services configurés', () => {
  it('rien d’enregistré : aucun service configuré', () => {
    for (const id of SERVICE_IDS) expect(isServiceConfigured(database.db, id)).toBe(false);
  });

  it('champs requis par service', () => {
    const db = database.db;
    applyServicePatch(db, 'prowlarr', { url: 'http://p' });
    expect(isServiceConfigured(db, 'prowlarr')).toBe(false);
    applyServicePatch(db, 'prowlarr', { apiKey: 'k' });
    expect(isServiceConfigured(db, 'prowlarr')).toBe(true);

    applyServicePatch(db, 'tmdb', { apiKey: 'k' });
    expect(isServiceConfigured(db, 'tmdb')).toBe(true);

    // qBittorrent, Deluge, Transmission, NZBGet : URL seule (proxy qui authentifie).
    for (const id of ['qbittorrent', 'deluge', 'transmission', 'nzbget', 'gluetun'] as const) {
      applyServicePatch(db, id, { url: 'http://x' });
      expect(isServiceConfigured(db, id)).toBe(true);
    }
    // Bazarr, Emby, SABnzbd, Tautulli, Tracearr : URL et clé.
    for (const id of ['bazarr', 'emby', 'sabnzbd', 'tautulli', 'tracearr'] as const) {
      applyServicePatch(db, id, { url: 'http://x' });
      expect(isServiceConfigured(db, id)).toBe(false);
      applyServicePatch(db, id, { apiKey: 'k' });
      expect(isServiceConfigured(db, id)).toBe(true);
    }
  });

  it('un service désactivé n’est plus configuré ; ses valeurs restent', () => {
    const db = database.db;
    applyServicePatch(db, 'seerr', { url: 'http://s', apiKey: 'k' });
    applyServicePatch(db, 'seerr', { enabled: false });
    expect(isServiceConfigured(db, 'seerr')).toBe(false);
    expect(isServiceDisabled(db, 'seerr')).toBe(true);
    expect(readServiceConfig(db, 'seerr')).toMatchObject({ url: 'http://s', apiKey: 'k' });
    applyServicePatch(db, 'seerr', { enabled: true });
    expect(isServiceConfigured(db, 'seerr')).toBe(true);
  });

  it('Radarr/Sonarr : au moins une instance active', async () => {
    const db = database.db;
    const row = await createInstance(db, 'radarr', {
      name: 'Radarr',
      url: 'http://r',
      apiKey: 'k',
    });
    expect(isServiceConfigured(db, 'radarr')).toBe(true);
    setInstanceEnabled(db, row, false);
    expect(isServiceConfigured(db, 'radarr')).toBe(false);
    expect(isServiceConfigured(db, 'sonarr')).toBe(false);
  });

  it('chaque service testable a ses champs déclarés (AdminSettingsTestFieldsTest)', () => {
    for (const spec of Object.values(SERVICE_SETTINGS)) {
      expect(spec.fields.length).toBeGreaterThan(0);
      for (const key of spec.required)
        expect(spec.fields.some((field) => field.key === key)).toBe(true);
    }
  });
});

describe('applyServicePatch', () => {
  it('un secret vide ne l’efface pas ; un champ texte vide l’efface', () => {
    const db = database.db;
    applyServicePatch(db, 'qbittorrent', { url: 'http://q', user: 'admin', password: 'secret' });
    applyServicePatch(db, 'qbittorrent', { url: 'http://q2', password: '' });
    expect(readServiceConfig(db, 'qbittorrent')).toMatchObject({
      url: 'http://q2',
      user: 'admin',
      password: 'secret',
    });
    applyServicePatch(db, 'qbittorrent', { user: '' });
    expect(readServiceConfig(db, 'qbittorrent').user).toBe('');
  });

  it('« Effacer » vide les identifiants effaçables seulement', () => {
    const db = database.db;
    applyServicePatch(db, 'transmission', { url: 'http://t', user: 'u', password: 'p' });
    applyServicePatch(db, 'transmission', { clear: ['user', 'password'] });
    expect(readServiceConfig(db, 'transmission')).toMatchObject({
      url: 'http://t',
      user: '',
      password: '',
    });
  });

  it('« Retirer » efface ce service seulement, secrets compris', () => {
    const db = database.db;
    applyServicePatch(db, 'prowlarr', { url: 'http://p', apiKey: 'k' });
    applyServicePatch(db, 'tautulli', { url: 'http://t', apiKey: 'k2' });
    applyServicePatch(db, 'prowlarr', { remove: true });
    expect(readServiceConfig(db, 'prowlarr')).toEqual({
      url: '',
      apiKey: '',
      user: '',
      password: '',
      enabled: true,
    });
    expect(readServiceConfig(db, 'tautulli')).toMatchObject({ url: 'http://t', apiKey: 'k2' });
  });

  it('ignore les champs que le service n’a pas, et l’interrupteur de Gluetun', () => {
    const db = database.db;
    applyServicePatch(db, 'tmdb', { url: 'http://nope', apiKey: 'k' });
    expect(readServiceConfig(db, 'tmdb').url).toBe('');
    applyServicePatch(db, 'gluetun', { url: 'http://g', enabled: false });
    expect(readServiceConfig(db, 'gluetun').enabled).toBe(true);
  });

  it('sans modification, rien n’est écrit', () => {
    expect(applyServicePatch(database.db, 'prowlarr', {})).toBe(false);
    expect(applyServicePatch(database.db, 'prowlarr', { apiKey: '' })).toBe(false);
  });
});
