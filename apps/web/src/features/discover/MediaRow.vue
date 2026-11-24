<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Rangée horizontale de cartes (sections de la découverte, du dashboard) :
// titre, lien facultatif, commandes propres à la rangée (emplacement
// `actions`), défilement par les flèches de `ScrollRow` (sans barre).
import type { RouteLocationRaw } from 'vue-router';
import ScrollRow from '../../components/ScrollRow.vue';

defineProps<{
  title: string;
  subtitle?: string;
  to?: RouteLocationRaw;
  linkLabel?: string;
  loading?: boolean;
}>();
</script>

<template>
  <section class="mb-6">
    <div class="d-flex flex-wrap align-center mb-2 ga-2">
      <h2 class="text-title-large">{{ title }}</h2>
      <span v-if="subtitle" class="text-body-small text-muted">{{ subtitle }}</span>
      <v-spacer />
      <slot name="actions" />
      <v-btn v-if="to && linkLabel" :to="to" variant="text" size="small">{{ linkLabel }}</v-btn>
    </div>
    <ScrollRow>
      <template v-if="loading">
        <v-skeleton-loader v-for="i in 7" :key="i" type="image" width="150" height="225" />
      </template>
      <slot v-else />
    </ScrollRow>
  </section>
</template>
