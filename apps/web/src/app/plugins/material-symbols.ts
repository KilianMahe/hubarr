// SPDX-License-Identifier: AGPL-3.0-or-later
// Jeu d'icônes Vuetify des Material Symbols (`components/symbols.ts`) : comme
// le jeu `mdi-svg` de Vuetify, une icône est le tracé d'un SVG, mais sur la
// grille des Material Symbols (`0 -960 960 960`) au lieu de 24×24.

import { defineComponent, h, mergeProps, type PropType } from 'vue';
import type { IconSet } from 'vuetify';

const MaterialSymbolIcon = defineComponent({
  name: 'MaterialSymbolIcon',
  inheritAttrs: false,
  props: {
    // Tracé de l'icône ; les autres formes (composant, liste) ne sont pas utilisées.
    icon: { type: [String, Array, Object, Function] as PropType<unknown>, default: undefined },
    tag: { type: [String, Object, Function] as PropType<string>, required: true },
  },
  setup(props, { attrs }) {
    return () =>
      h(props.tag, mergeProps(attrs, { style: null }), [
        h(
          'svg',
          {
            class: 'v-icon__svg',
            xmlns: 'http://www.w3.org/2000/svg',
            viewBox: '0 -960 960 960',
            role: 'img',
            'aria-hidden': 'true',
          },
          [h('path', { d: typeof props.icon === 'string' ? props.icon : '' })],
        ),
      ]);
  },
});

// Conversion explicite : le composant reçoit bien `icon` et `tag` comme les jeux
// de Vuetify, mais son type déclaré (`DefineComponent`) ne recoupe pas
// `IconComponent`, défini par Vuetify pour ses propres composants.
export const materialSymbols: IconSet = {
  component: MaterialSymbolIcon as unknown as IconSet['component'],
};
