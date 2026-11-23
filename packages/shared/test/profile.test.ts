// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, profileUpdateRequestSchema } from '../src';

function messages(input: unknown): string[] {
  const result = profileUpdateRequestSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message).sort();
}

describe('contrats du profil', () => {
  it('reprend les limites d’avatar de l’original', () => {
    expect(AVATAR_MAX_BYTES).toBe(2_000_000);
    expect(AVATAR_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  });

  it('accepte un nom seul, sans changement de mot de passe', () => {
    expect(profileUpdateRequestSchema.parse({ displayName: '  Joshua  ' })).toEqual({
      displayName: 'Joshua',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    expect(profileUpdateRequestSchema.parse({})).toMatchObject({ displayName: '' });
  });

  it('exige le mot de passe actuel dès qu’un champ de mot de passe est rempli', () => {
    expect(messages({ newPassword: 'new-password', confirmPassword: 'new-password' })).toEqual([
      'flash.password.current_wrong',
    ]);
  });

  it('signale ensemble longueur et confirmation', () => {
    expect(
      messages({ currentPassword: 'x', newPassword: 'short', confirmPassword: 'other' }),
    ).toEqual(['flash.password.mismatch', 'flash.password.too_short']);
  });

  it('refuse un nom de plus de 100 caractères', () => {
    expect(profileUpdateRequestSchema.safeParse({ displayName: 'a'.repeat(101) }).success).toBe(
      false,
    );
  });
});
