// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { InvalidEnvError, loadEnv } from '../../src/config/env';

describe('loadEnv', () => {
  it('applique les valeurs par défaut', () => {
    expect(loadEnv({})).toEqual({
      HUBARR_HOST: '0.0.0.0',
      HUBARR_PORT: 7070,
      HUBARR_DATA_DIR: '/data',
      HUBARR_LOG_LEVEL: 'warn',
      HUBARR_VERSION: '0.0.0-dev',
      HUBARR_TRUST_PROXY: 'loopback,linklocal,uniquelocal',
      HUBARR_BASE_PATH: '',
      HUBARR_FRAME_ANCESTORS: '',
    });
  });

  it('normalise HUBARR_BASE_PATH', () => {
    expect(loadEnv({ HUBARR_BASE_PATH: 'hubarr/' }).HUBARR_BASE_PATH).toBe('/hubarr');
  });

  it.each([
    ['true', true],
    ['false', false],
    ['10.0.0.0/8, 127.0.0.1', '10.0.0.0/8, 127.0.0.1'],
  ])('interprète HUBARR_TRUST_PROXY=%s', (value, expected) => {
    expect(loadEnv({ HUBARR_TRUST_PROXY: value }).HUBARR_TRUST_PROXY).toEqual(expected);
  });

  it('convertit le port et traite une variable vide comme absente', () => {
    const env = loadEnv({ HUBARR_PORT: '8080', HUBARR_LOG_LEVEL: '' });
    expect(env.HUBARR_PORT).toBe(8080);
    expect(env.HUBARR_LOG_LEVEL).toBe('warn');
  });

  it.each([
    ['HUBARR_PORT', 'abc'],
    ['HUBARR_PORT', '70000'],
    ['HUBARR_LOG_LEVEL', 'verbose'],
    ['HUBARR_BASE_PATH', '/a b'],
  ])('refuse %s=%s avec un message qui nomme la variable', (name, value) => {
    expect(() => loadEnv({ [name]: value })).toThrow(InvalidEnvError);
    expect(() => loadEnv({ [name]: value })).toThrow(name);
  });
});
