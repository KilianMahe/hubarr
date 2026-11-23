// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { LOGIN_THROTTLE, PASSWORD_MIN_LENGTH, apiErrorSchema, loginRequestSchema } from '../src';

describe('contrats d’authentification', () => {
  it('reprend les seuils de l’original', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(LOGIN_THROTTLE.maxAttempts).toBe(5);
    expect(LOGIN_THROTTLE.windowMs).toBe(15 * 60 * 1000);
  });

  it('valide une demande de connexion et applique les valeurs par défaut', () => {
    expect(loginRequestSchema.parse({ email: ' a@b.c ', password: 'x' })).toEqual({
      email: 'a@b.c',
      password: 'x',
      remember: false,
    });
    expect(loginRequestSchema.safeParse({ email: '', password: 'x' }).success).toBe(false);
  });

  it('refuse un code d’erreur inconnu', () => {
    expect(apiErrorSchema.safeParse({ code: 'CSRF' }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ code: 'NOPE' }).success).toBe(false);
  });
});
