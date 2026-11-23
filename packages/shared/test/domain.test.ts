// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { MEDIA_TYPES, USER_ROLES } from '../src';

describe('constantes du domaine', () => {
  it('expose les rôles et types de média', () => {
    expect(USER_ROLES).toEqual(['admin', 'user']);
    expect(MEDIA_TYPES).toEqual(['movie', 'tv']);
  });
});
