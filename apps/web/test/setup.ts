// SPDX-License-Identifier: AGPL-3.0-or-later
// Compléments d'environnement pour happy-dom : les menus de Vuetify lisent
// `visualViewport`, absent de happy-dom.

if (!('visualViewport' in globalThis)) {
  Object.defineProperty(globalThis, 'visualViewport', {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      width: 1280,
      height: 800,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
    }),
  });
}
