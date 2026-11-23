// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `ServiceInstanceProviderTest` et de `ServiceInstance::slugify`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../../../src/db/client';
import {
  InstanceError,
  apiKeyOf,
  createInstance,
  defaultQualityProfileIdOf,
  deleteInstance,
  findInstanceById,
  getDefaultInstance,
  getInstanceBySlug,
  hasAnyEnabledInstance,
  listEnabledInstances,
  listInstances,
  setDefaultInstance,
  setInstanceEnabled,
  slugify,
  updateInstance,
} from '../../../src/modules/instances/instances';
import { createTestDatabase } from '../../helpers';

let database: AppDatabase;
const noDns = () => Promise.resolve<string[]>([]);

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('valeur absente');
  return value;
}
const opts = { resolve: noDns };

beforeEach(async () => {
  database = await createTestDatabase();
});
afterEach(() => {
  database.close();
});

const add = (name: string, extra: Partial<Parameters<typeof createInstance>[2]> = {}) =>
  createInstance(database.db, 'radarr', { name, url: 'http://r', apiKey: 'k', ...extra }, opts);

async function rejection(promise: Promise<unknown>): Promise<InstanceError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof InstanceError) return error;
    throw error;
  }
  throw new Error('aucune erreur');
}

describe('slugify', () => {
  it('translittère, met en minuscules et remplace le reste par des tirets', () => {
    expect(slugify('Radarr 4K')).toBe('radarr-4k');
    expect(slugify('  Séries Ùltra HD!! ')).toBe('series-ultra-hd');
    expect(slugify('***')).toBe('instance');
  });
});

describe('instance par défaut', () => {
  it('aucune instance → null', () => {
    expect(getDefaultInstance(database.db, 'radarr')).toBeNull();
  });

  it('la première créée est par défaut, la seconde non', async () => {
    const first = await add('Radarr');
    const second = await add('Radarr 4K');
    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);
    expect(second.position).toBe(1);
    expect(getDefaultInstance(database.db, 'radarr')?.id).toBe(first.id);
  });

  it('ignore une instance par défaut désactivée, null si toutes le sont', async () => {
    const first = await add('A');
    const second = await add('B');
    setInstanceEnabled(database.db, first, false);
    expect(getDefaultInstance(database.db, 'radarr')?.id).toBe(second.id);
    expect(listEnabledInstances(database.db, 'radarr')).toHaveLength(1);
    setInstanceEnabled(database.db, second, false);
    expect(getDefaultInstance(database.db, 'radarr')).toBeNull();
    expect(hasAnyEnabledInstance(database.db, 'radarr')).toBe(false);
  });

  it('setDefault retire le drapeau des autres ; sans effet si déjà par défaut', async () => {
    const first = await add('A');
    const second = await add('B');
    setDefaultInstance(database.db, second);
    expect(findInstanceById(database.db, first.id)?.isDefault).toBe(false);
    expect(findInstanceById(database.db, second.id)?.isDefault).toBe(true);
    setDefaultInstance(database.db, must(findInstanceById(database.db, second.id)));
    expect(listInstances(database.db, 'radarr').filter((row) => row.isDefault)).toHaveLength(1);
  });

  it('supprimer l’instance par défaut promeut la suivante, pas les autres suppressions', async () => {
    const first = await add('A');
    const second = await add('B');
    const third = await add('C');
    deleteInstance(database.db, third);
    expect(findInstanceById(database.db, first.id)?.isDefault).toBe(true);
    deleteInstance(database.db, first);
    expect(findInstanceById(database.db, second.id)?.isDefault).toBe(true);
  });
});

describe('création', () => {
  it('refuse un nom ou une URL vides, une URL bloquée', async () => {
    expect((await rejection(add(' '))).reason).toBe('name_required');
    expect((await rejection(add('A', { url: ' ' }))).reason).toBe('url_required');
    for (const url of ['file:///etc/passwd', 'gopher://x', 'http://169.254.169.254/']) {
      const error = await rejection(add('A', { url }));
      expect(error.reason).toBe('url_blocked');
      expect(error.field).toBe('url');
    }
  });

  it('slug tiré du nom, dédoublonné par -2', async () => {
    await add('Radarr 4K');
    const second = await add('Autre', { slug: 'radarr-4k' });
    expect(second.slug).toBe('radarr-4k-2');
    expect(getInstanceBySlug(database.db, 'radarr', 'radarr-4k-2')?.id).toBe(second.id);
    expect(getInstanceBySlug(database.db, 'radarr', 'nope')).toBeNull();
  });

  it('conserve le profil de qualité par défaut', async () => {
    const row = await createInstance(
      database.db,
      'sonarr',
      { name: 'S', url: 'http://s', defaultQualityProfileId: 4 },
      opts,
    );
    expect(defaultQualityProfileIdOf(row)).toBe(4);
    expect(apiKeyOf(row)).toBeNull();
  });
});

describe('modification', () => {
  it('clé vide : inchangée ; clé saisie : remplacée', async () => {
    const row = await add('A');
    const updated = await updateInstance(
      database.db,
      row,
      { name: 'A2', url: 'http://r2', apiKey: '' },
      opts,
    );
    expect(apiKeyOf(updated)).toBe('k');
    expect(updated).toMatchObject({ name: 'A2', url: 'http://r2' });
    expect(
      apiKeyOf(
        await updateInstance(
          database.db,
          updated,
          { name: 'A2', url: 'http://r2', apiKey: 'n' },
          opts,
        ),
      ),
    ).toBe('n');
  });

  it('profil de qualité : absent inchangé, null effacé, nombre enregistré', async () => {
    let row = await add('A');
    row = await updateInstance(
      database.db,
      row,
      { name: 'A', url: 'http://r', defaultQualityProfileId: 7 },
      opts,
    );
    expect(defaultQualityProfileIdOf(row)).toBe(7);
    row = await updateInstance(database.db, row, { name: 'A', url: 'http://r' }, opts);
    expect(defaultQualityProfileIdOf(row)).toBe(7);
    row = await updateInstance(
      database.db,
      row,
      { name: 'A', url: 'http://r', defaultQualityProfileId: null },
      opts,
    );
    expect(defaultQualityProfileIdOf(row)).toBeNull();
  });

  it('refuse un slug pris par une autre instance, accepte le sien', async () => {
    await add('Radarr 4K');
    const row = await add('Radarr HD');
    const error = await rejection(
      updateInstance(database.db, row, { name: 'x', url: 'http://r', slug: 'Radarr 4K' }, opts),
    );
    expect(error.reason).toBe('slug_taken');
    const renamed = await updateInstance(
      database.db,
      row,
      { name: 'x', url: 'http://r', slug: 'HD Bis' },
      opts,
    );
    expect(renamed.slug).toBe('hd-bis');
  });
});
