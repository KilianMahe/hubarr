<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Mise en page des pages de Prowlarr (P3c.3) : bannière « injoignable »,
// navigation, titre et actions, bilan de la dernière action, alerte de
// chargement, contenu.
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import type { AdminFeedback } from '../arr-admin/admin-api';
import ProwlarrNav from './ProwlarrNav.vue';

defineProps<{
  title: string;
  count?: number | null;
  loading?: boolean;
  /** Échec du chargement (texte traduit), `null` sinon. */
  error?: string | null;
}>();
const feedback = defineModel<AdminFeedback | null>('feedback', { default: null });
</script>

<template>
  <v-container fluid class="prowlarr-page" data-test="prowlarr-page">
    <ServiceDownBanner service="prowlarr" />
    <ProwlarrNav />
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <h2 class="text-title-medium" data-test="prowlarr-page-title">{{ title }}</h2>
      <v-chip v-if="count !== undefined && count !== null" size="small" variant="tonal">{{
        count
      }}</v-chip>
      <v-spacer />
      <slot name="actions" />
    </div>
    <v-alert
      v-if="feedback"
      :type="feedback.type"
      variant="tonal"
      density="compact"
      closable
      class="mb-3 prowlarr-page__feedback"
      data-test="prowlarr-feedback"
      @click:close="feedback = null"
      >{{ feedback.text }}</v-alert
    >
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-test="prowlarr-error"
      >{{ error }}</v-alert
    >
    <v-progress-linear v-if="loading" indeterminate color="service" class="mb-3" />
    <slot v-else-if="!error" />
  </v-container>
</template>

<style scoped>
.prowlarr-page__feedback {
  white-space: pre-line;
}
</style>
