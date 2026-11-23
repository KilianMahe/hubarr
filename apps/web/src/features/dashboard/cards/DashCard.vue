<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Gabarit d'une carte du tableau de bord : titre avec icône, lien d'action
// facultatif, état de chargement, contenu.
import type { RouteLocationRaw } from 'vue-router';

defineProps<{
  title: string;
  icon: string;
  to?: RouteLocationRaw | undefined;
  linkLabel?: string | undefined;
  loading?: boolean;
}>();
</script>

<template>
  <v-card rounded="xl" class="h-100">
    <div class="d-flex align-center pa-4 pb-2 ga-2">
      <v-icon :icon="icon" size="20" color="primary" />
      <h2 class="text-title-medium">{{ title }}</h2>
      <v-spacer />
      <slot name="append" />
      <v-btn v-if="to && linkLabel" :to="to" variant="text" size="small">{{ linkLabel }}</v-btn>
    </div>
    <v-progress-linear v-if="loading" indeterminate color="primary" />
    <div class="px-4 pb-4">
      <slot />
    </div>
  </v-card>
</template>
