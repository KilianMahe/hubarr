// SPDX-License-Identifier: AGPL-3.0-or-later
// PWA : le worker est versionné par l'image Docker, sous le préfixe éventuel.
import { describe, expect, it } from 'vitest';
import { serviceWorkerUrl } from '../src/app/pwa';

describe('serviceWorkerUrl', () => {
  it('porte la version de l’image et suit la balise <base>', () => {
    expect(serviceWorkerUrl('1.0.0', 'https://media.example/').href).toBe(
      'https://media.example/sw.js?v=1.0.0',
    );
    expect(serviceWorkerUrl('1.2.0', 'https://media.example/hubarr/').href).toBe(
      'https://media.example/hubarr/sw.js?v=1.2.0',
    );
  });
});
