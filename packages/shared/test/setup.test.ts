// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  appHealthResponseSchema,
  isLocale,
  setupAdminRequestSchema,
  setupLocaleRequestSchema,
} from '../src';

const valid = {
  email: ' joshua@example.com ',
  displayName: ' Joshua ',
  password: 'secret-enough',
  passwordConfirm: 'secret-enough',
};

function messages(input: unknown): string[] {
  const result = setupAdminRequestSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message).sort();
}

describe('contrats de l’assistant', () => {
  it('reprend les langues de l’original', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'fr']);
    expect(DEFAULT_LOCALE).toBe('en');
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('zz')).toBe(false);
    expect(setupLocaleRequestSchema.safeParse({ locale: 'de' }).success).toBe(false);
  });

  it('accepte un compte valide et nettoie les champs', () => {
    expect(setupAdminRequestSchema.parse(valid)).toMatchObject({
      email: 'joshua@example.com',
      displayName: 'Joshua',
    });
  });

  it('signale toutes les erreurs ensemble, avec les clés de l’original', () => {
    expect(
      messages({ email: 'not-an-email', password: 'short', passwordConfirm: 'different' }),
    ).toEqual([
      'setup.error.email_invalid',
      'setup.error.password_mismatch',
      'setup.error.password_too_short',
    ]);
    expect(messages({ ...valid, passwordConfirm: 'other-secret' })).toEqual([
      'setup.error.password_mismatch',
    ]);
    expect(messages({ ...valid, email: '' })).toEqual(['setup.error.email_invalid']);
  });

  it('décrit la santé de l’application', () => {
    const timestamp = new Date().toISOString();
    expect(appHealthResponseSchema.parse({ status: 'ok', db: 'ok', timestamp })).toBeTruthy();
    expect(
      appHealthResponseSchema.safeParse({ status: 'ok', db: 'unreachable', timestamp }).success,
    ).toBe(false);
  });
});
