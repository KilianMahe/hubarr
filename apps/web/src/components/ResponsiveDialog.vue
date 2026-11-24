<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Dialogue sur desktop, bottom sheet sur mobile : titre et croix de
// fermeture, contenu, actions en pied.
import { useDisplay } from 'vuetify';
import { VBottomSheet, VDialog } from 'vuetify/components';
import DialogTitle from './DialogTitle.vue';

const open = defineModel<boolean>({ required: true });
defineProps<{ title: string; titleColor?: string; maxWidth?: number }>();
const { smAndDown } = useDisplay();
</script>

<template>
  <component :is="smAndDown ? VBottomSheet : VDialog" v-model="open" :max-width="maxWidth ?? 560">
    <v-card>
      <DialogTitle
        :title="title"
        :title-class="titleColor ? `text-${titleColor}` : undefined"
        @close="open = false"
      />
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
