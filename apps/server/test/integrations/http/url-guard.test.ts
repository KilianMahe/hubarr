// SPDX-License-Identifier: AGPL-3.0-or-later
// Port des tests `urlBlockedReason` de `HealthServiceTest`.

import { describe, expect, it } from 'vitest';
import type { LookupAddress } from 'node:dns';
import {
  BLOCKED_LOOKUP_CODE,
  createGuardedLookup,
  urlBlockedReason,
  type RawLookup,
} from '../../../src/integrations/http/url-guard';

const noDns = () => Promise.resolve<string[]>([]);

describe('urlBlockedReason', () => {
  it.each([
    'file:///etc/passwd',
    'gopher://localhost:6379/_FLUSHALL',
    'dict://localhost:11211/stats',
    'ftp://example.com/',
    'data:text/html,<script>alert(1)</script>',
    'localhost:8080/api',
  ])('refuse le schéma de %s', async (url) => {
    expect(await urlBlockedReason(url, noDns)).toBe('scheme');
  });

  it('URL mal formée (port hors limites)', async () => {
    expect(await urlBlockedReason('http://192.168.1.50:89000/', noDns)).toBe('malformed');
    expect(await urlBlockedReason('http://host:99999', noDns)).toBe('malformed');
  });

  it('refuse le lien local IPv4 et ses contournements', async () => {
    expect(await urlBlockedReason('http://169.254.169.254/latest/meta-data/', noDns)).toBe(
      'link-local',
    );
    expect(await urlBlockedReason('http://169.254.0.1/', noDns)).toBe('link-local');
    expect(await urlBlockedReason('http://[::ffff:169.254.169.254]/latest/meta-data/', noDns)).toBe(
      'link-local',
    );
    expect(await urlBlockedReason('http://169.254.169.254./', noDns)).toBe('link-local');
    expect(await urlBlockedReason('http://[fe80::1]/', noDns)).toBe('link-local');
  });

  it('refuse un nom qui se résout en lien local', async () => {
    expect(
      await urlBlockedReason('http://metadata.internal/', () =>
        Promise.resolve(['169.254.169.254']),
      ),
    ).toBe('link-local');
  });

  it('autorise le loopback IPv6, le RFC 1918 et le HTTPS public', async () => {
    expect(await urlBlockedReason('http://[::1]:8080/', noDns)).toBeNull();
    expect(
      await urlBlockedReason('http://192.168.1.50:7878/api/v3/system/status', noDns),
    ).toBeNull();
    expect(await urlBlockedReason('http://10.0.0.10:8989/', noDns)).toBeNull();
    expect(await urlBlockedReason('http://172.16.5.5:9696/', noDns)).toBeNull();
    expect(
      await urlBlockedReason('https://api.themoviedb.org/3/configuration', () =>
        Promise.resolve(['1.2.3.4']),
      ),
    ).toBeNull();
  });
});

describe('createGuardedLookup', () => {
  const resolving =
    (...addresses: LookupAddress[]): RawLookup =>
    (_host, _options, callback) => {
      callback(null, addresses);
    };
  const run = (raw: RawLookup, all: boolean) =>
    new Promise<{ error: NodeJS.ErrnoException | null; address: unknown; family?: number }>(
      (resolve) => {
        createGuardedLookup(raw)('svc.lan', { all }, (error, address, family) => {
          resolve({ error, address, ...(family === undefined ? {} : { family }) });
        });
      },
    );

  it('laisse passer une adresse privée, sous les deux formes de réponse', async () => {
    const raw = resolving({ address: '192.168.1.10', family: 4 });
    expect(await run(raw, false)).toEqual({ error: null, address: '192.168.1.10', family: 4 });
    expect(await run(raw, true)).toEqual({
      error: null,
      address: [{ address: '192.168.1.10', family: 4 }],
    });
  });

  it('refuse un nom dont une des adresses est de lien local (rebinding, métadonnées cloud)', async () => {
    for (const all of [false, true]) {
      const result = await run(
        resolving({ address: '10.0.0.2', family: 4 }, { address: '169.254.169.254', family: 4 }),
        all,
      );
      expect(result.error?.code).toBe(BLOCKED_LOOKUP_CODE);
    }
    const mapped = await run(resolving({ address: '::ffff:169.254.169.254', family: 6 }), false);
    expect(mapped.error?.code).toBe(BLOCKED_LOOKUP_CODE);
  });

  it('transmet l’échec de résolution', async () => {
    const failing: RawLookup = (_host, _options, callback) => {
      const error: NodeJS.ErrnoException = new Error('nope');
      error.code = 'ENOTFOUND';
      callback(error, []);
    };
    expect((await run(failing, false)).error?.code).toBe('ENOTFOUND');
    expect((await run(resolving(), false)).error?.code).toBe('ENOTFOUND');
  });
});
