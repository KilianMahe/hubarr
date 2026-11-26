// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  hasAccess,
  parsePermissionKey,
  permissionKey,
  userCreateRequestSchema,
  userUpdateRequestSchema,
  type AccessSubject,
} from '../src';

const user = (permissions: AccessSubject['permissions']): AccessSubject => ({
  role: 'user',
  permissions,
});

describe('clés de droit', () => {
  it('par instance pour Radarr/Sonarr, par service sinon', () => {
    expect(permissionKey('radarr', '4k')).toBe('radarr:4k');
    expect(permissionKey('prowlarr', 'ignored')).toBe('prowlarr');
    expect(parsePermissionKey('sonarr:series')).toEqual({ service: 'sonarr', slug: 'series' });
    expect(parsePermissionKey('tmdb')).toEqual({ service: 'tmdb', slug: null });
  });

  it('refuse les clés incomplètes ou inconnues', () => {
    for (const key of ['radarr', 'radarr:', 'tmdb:x', 'nope', 'radarr:a:b', ''])
      expect(parsePermissionKey(key)).toBeNull();
  });
});

describe('hasAccess', () => {
  it('admin : tous les droits ; sans compte : aucun', () => {
    expect(hasAccess({ role: 'admin', permissions: {} }, 'seerr', null, 'write')).toBe(true);
    expect(hasAccess(null, 'seerr', null, 'read')).toBe(false);
  });

  it('l’écriture inclut la lecture, pas l’inverse', () => {
    const subject = user({ seerr: 'write', tmdb: 'read' });
    expect(hasAccess(subject, 'seerr', null, 'read')).toBe(true);
    expect(hasAccess(subject, 'tmdb', null, 'read')).toBe(true);
    expect(hasAccess(subject, 'tmdb', null, 'write')).toBe(false);
    expect(hasAccess(subject, 'bazarr', null, 'read')).toBe(false);
  });

  it('Radarr/Sonarr : par instance ; sans slug, sur au moins une', () => {
    const subject = user({ 'radarr:films': 'read', 'radarr:4k': 'write' });
    expect(hasAccess(subject, 'radarr', 'films', 'write')).toBe(false);
    expect(hasAccess(subject, 'radarr', '4k', 'write')).toBe(true);
    expect(hasAccess(subject, 'radarr', 'autre', 'read')).toBe(false);
    expect(hasAccess(subject, 'radarr', null, 'write')).toBe(true);
    expect(hasAccess(subject, 'sonarr', null, 'read')).toBe(false);
  });
});

describe('contrats d’administration', () => {
  it('création : e-mail normalisé, rôle et droits par défaut, mot de passe de 8 caractères', () => {
    expect(
      userCreateRequestSchema.parse({ email: ' Bob@Example.COM ', password: 'password' }),
    ).toEqual({
      email: 'bob@example.com',
      displayName: '',
      password: 'password',
      role: 'user',
      permissions: {},
    });
    const short = userCreateRequestSchema.safeParse({ email: 'a@b.co', password: 'short' });
    expect(short.success).toBe(false);
    expect(short.error?.issues[0]?.message).toBe('users.error.password_too_short');
  });

  it('modification : tout est facultatif ; niveau inconnu refusé', () => {
    expect(userUpdateRequestSchema.parse({})).toEqual({});
    expect(userUpdateRequestSchema.safeParse({ permissions: { tmdb: 'admin' } }).success).toBe(
      false,
    );
  });
});
