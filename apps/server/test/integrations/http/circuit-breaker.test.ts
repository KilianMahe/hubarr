// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `ServiceHealthCacheTest`.

import { describe, expect, it } from 'vitest';
import { ServiceHealthCache } from '../../../src/integrations/http/circuit-breaker';
import { createClock } from '../../helpers';

describe('ServiceHealthCache', () => {
  it('rien de marqué : aucun service injoignable', () => {
    const cache = new ServiceHealthCache();
    expect(cache.isDown('radarr')).toBe(false);
    expect(cache.isDown('sonarr')).toBe(false);
  });

  it('markDown puis clear', () => {
    const cache = new ServiceHealthCache();
    cache.markDown('radarr');
    expect(cache.isDown('radarr')).toBe(true);
    cache.clear('radarr');
    expect(cache.isDown('radarr')).toBe(false);
  });

  it('services indépendants', () => {
    const cache = new ServiceHealthCache();
    cache.markDown('radarr');
    expect(cache.isDown('sonarr')).toBe(false);
    expect(cache.isDown('seerr')).toBe(false);
    cache.clear('radarr');
    cache.markDown('sonarr');
    expect(cache.isDown('radarr')).toBe(false);
    expect(cache.isDown('sonarr')).toBe(true);
  });

  it('TTL de 10 s', () => {
    expect(ServiceHealthCache.TTL_DOWN_MS).toBe(10_000);
    const clock = createClock();
    const cache = new ServiceHealthCache({ now: clock.now });
    cache.markDown('radarr');
    clock.advance(9_999);
    expect(cache.isDown('radarr')).toBe(true);
    clock.advance(1);
    expect(cache.isDown('radarr')).toBe(false);
  });

  it('instances indépendantes entre elles et de l’entrée sans instance', () => {
    const cache = new ServiceHealthCache();
    cache.markDown('radarr', 'radarr-4k');
    expect(cache.isDown('radarr', 'radarr-4k')).toBe(true);
    expect(cache.isDown('radarr', 'radarr-1080p')).toBe(false);
    expect(cache.isDown('radarr')).toBe(false);

    cache.markDown('radarr', 'radarr-1080p');
    cache.clear('radarr', 'radarr-4k');
    expect(cache.isDown('radarr', 'radarr-1080p')).toBe(true);

    cache.markDown('seerr');
    expect(cache.isDown('seerr', 'radarr-1080p')).toBe(false);
  });

  it('clearService efface le service et toutes ses instances', () => {
    const cache = new ServiceHealthCache();
    cache.markDown('radarr');
    cache.markDown('radarr', 'a');
    cache.markDown('radarrx');
    cache.clearService('radarr');
    expect(cache.isDown('radarr')).toBe(false);
    expect(cache.isDown('radarr', 'a')).toBe(false);
    expect(cache.isDown('radarrx')).toBe(true);
  });
});
