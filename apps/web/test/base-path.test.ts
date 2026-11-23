// SPDX-License-Identifier: AGPL-3.0-or-later
// Préfixe de chemin derrière un reverse proxy (matrice n° 65) : lu dans la
// balise `<base>` posée par le serveur.
import { describe, expect, it } from 'vitest';
import { appUrl, basePath } from '../src/app/base-path';
import { docsHref } from '../src/app/navigation';

describe('basePath', () => {
  it('lit le préfixe de la balise <base>, sans barre finale', () => {
    expect(basePath({ baseURI: 'https://media.example/' })).toBe('');
    expect(basePath({ baseURI: 'https://media.example/hubarr/' })).toBe('/hubarr');
    expect(basePath({ baseURI: 'https://media.example/apps/hubarr/' })).toBe('/apps/hubarr');
  });
});

describe('appUrl', () => {
  it('préfixe les chemins absolus de l’application, et eux seuls', () => {
    expect(appUrl('/api/bootstrap', '/hubarr')).toBe('/hubarr/api/bootstrap');
    expect(appUrl('/api/bootstrap', '')).toBe('/api/bootstrap');
    expect(appUrl('https://image.tmdb.org/t/p/w92/a.jpg', '/hubarr')).toBe(
      'https://image.tmdb.org/t/p/w92/a.jpg',
    );
    expect(appUrl('//cdn.example/x', '/hubarr')).toBe('//cdn.example/x');
    expect(appUrl('api/emby/image?item=1', '/hubarr')).toBe('api/emby/image?item=1');
  });
});

describe('docsHref', () => {
  it('ouvre la documentation dans la langue de l’interface', () => {
    expect(docsHref('en')).toBe('docs/');
    expect(docsHref('fr')).toBe('docs/fr/');
    expect(docsHref('fr-FR')).toBe('docs/fr/');
  });
});
