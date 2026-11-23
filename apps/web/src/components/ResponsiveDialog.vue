<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Dialogue sur desktop, bottom sheet sur mobile : titre, contenu,
// actions en pied.
import { useDisplay } from 'vuetify';
import { VBottomSheet, VDialog } from 'vuetify/components';

const open = defineModel<boolean>({ required: true });
defineProps<{ title: string; titleColor?: string; maxWidth?: number }>();
const { smAndDown } = useDisplay();
</script>

<template>
  <component :is="smAndDown ? VBottomSheet : VDialog" v-model="open" :max-width="maxWidth ?? 560">
    <v-card>
      <v-card-title class="text-title-large pt-4" :class="titleColor ? `text-${titleColor}` : ''">{{
        title
      }}</v-card-title>
      <v-card-text>
        <slot />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <slot name="actions" />
      </v-card-actions>
    </v-card>
  </component>
</template>
