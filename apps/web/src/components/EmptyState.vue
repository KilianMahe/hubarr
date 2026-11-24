<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// État vide ou d'erreur d'un écran : icône, titre, texte et actions. Variante
// `inline` (P5b.3) pour une liste vide dans une carte : plus compacte, icône
// « boîte vide » par défaut. Seule forme d'état vide de l'application.
import { msInbox } from './symbols';

defineProps<{ icon?: string; title: string; text?: string; inline?: boolean }>();
</script>

<template>
  <div
    class="d-flex flex-column align-center text-center ga-3"
    :class="inline ? 'pa-6' : 'pa-8'"
    data-test="empty-state"
  >
    <v-icon v-if="icon || inline" :icon="icon ?? msInbox" :size="inline ? 32 : 48" color="muted" />
    <component
      :is="inline ? 'p' : 'h2'"
      :class="inline ? 'text-body-large mb-0' : 'text-title-large'"
    >
      {{ title }}
    </component>
    <p v-if="text" class="text-body-medium text-muted" style="max-width: 32rem">{{ text }}</p>
    <div v-if="$slots.default" class="d-flex flex-wrap justify-center ga-2 mt-2">
      <slot />
    </div>
  </div>
</template>
