// SPDX-License-Identifier: AGPL-3.0-or-later
// Types des alias Vuetify des champs de filtre (P5c.2, V13, `app/plugins/vuetify.ts`).

import type { VAutocomplete, VSelect, VTextField } from 'vuetify/components';

declare module 'vue' {
  interface GlobalComponents {
    VFilterField: typeof VTextField;
    VFilterSelect: typeof VSelect;
    VFilterAutocomplete: typeof VAutocomplete;
  }
}

export {};
