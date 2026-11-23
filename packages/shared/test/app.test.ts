// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { APP_NAME, SOURCE_CODE_URL, UPSTREAM_PROJECT_URL } from '../src/index';

describe('constantes de l’application', () => {
  it('expose le nom Hubarr', () => {
    expect(APP_NAME).toBe('Hubarr');
  });

  it('expose des URL https pour le code source et le projet d’origine', () => {
    expect(new URL(SOURCE_CODE_URL).protocol).toBe('https:');
    expect(new URL(UPSTREAM_PROJECT_URL).protocol).toBe('https:');
  });
});
