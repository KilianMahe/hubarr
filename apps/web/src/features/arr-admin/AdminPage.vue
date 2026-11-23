<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Mise en page commune des pages d'administration Radarr/Sonarr (P3b) :
// bannière « injoignable », navigation de l'instance, titre et actions, alerte
// de chargement (`error_unreachable_<kind>`), bilan de la dernière action.
import type { ArrKind } from '@hubarr/shared';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import RadarrNav from '../movies/RadarrNav.vue';
import SonarrNav from '../series/SonarrNav.vue';
import type { AdminFeedback } from './admin-api';

defineProps<{
  kind: ArrKind;
  slug: string;
  /** Titre (texte traduit). */
  title: string;
  /** Nombre affiché à côté du titre. */
  count?: number | null;
  loading?: boolean;
  /** Message d'échec du chargement (texte traduit), `null` sinon. */
  error?: string | null;
}>();
const feedback = defineModel<AdminFeedback | null>('feedback', { default: null });
</script>

<template>
  <v-container fluid class="arr-admin-page" :data-test="`arr-admin-page-${kind}`">
    <ServiceDownBanner :service="kind" :instance="slug" />
    <RadarrNav v-if="kind === 'radarr'" />
    <SonarrNav v-else />
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <h2 class="text-title-medium" data-test="arr-admin-title">{{ title }}</h2>
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
      class="mb-3"
      data-test="arr-admin-feedback"
      @click:close="feedback = null"
      >{{ feedback.text }}</v-alert
    >
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-test="arr-admin-error"
      >{{ error }}</v-alert
    >
    <v-progress-linear v-if="loading" indeterminate color="service" class="mb-3" />
    <slot v-else-if="!error" />
  </v-container>
</template>
