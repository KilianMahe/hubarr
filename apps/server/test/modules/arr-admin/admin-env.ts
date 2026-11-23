// SPDX-License-Identifier: AGPL-3.0-or-later
// Environnement de test de l'administration *arr (P3b) : application, admin
// connecté et instance Radarr ou Sonarr sur un faux upstream ; `url()` vise
// `/api/medias/<slug>/<kind><chemin>`. Les tests tournent pour les deux
// services (`describe.each(ARR_KINDS)`) : un seul module les sert.

import type { ArrKind } from '@hubarr/shared';
import { radarrEnv, type FakeRadarr } from '../movies/radarr-env';
import { sonarrEnv } from '../series/sonarr-env';
import type { TestBrowser } from '../../helpers';
import type { FastifyInstance } from 'fastify';

export interface AdminEnv {
  kind: ArrKind;
  app: FastifyInstance;
  browser: TestBrowser;
  upstream: FakeRadarr;
  slug: string;
  url(path: string): string;
  close(): Promise<void>;
}

export async function adminEnv(kind: ArrKind): Promise<AdminEnv> {
  if (kind === 'radarr') {
    const env = await radarrEnv();
    return {
      kind,
      app: env.app,
      browser: env.browser,
      upstream: env.radarr,
      slug: env.instance.slug,
      url: (path) => `/api/medias/${env.instance.slug}/radarr${path}`,
      close: () => env.close(),
    };
  }
  const env = await sonarrEnv();
  return {
    kind,
    app: env.app,
    browser: env.browser,
    upstream: env.sonarr,
    slug: env.instance.slug,
    url: (path) => `/api/medias/${env.instance.slug}/sonarr${path}`,
    close: () => env.close(),
  };
}
