<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Onglet « File d'attente » d'une instance Sonarr (P5c.6, V18) :
// épisodes en téléchargement ou en cours d'import, avec les actions de la file
// (forcer, supprimer, nettoyer les déjà importés, importer les bloqués) et, par
// ligne, la fiche de la série, « Actualiser » et « Scanner ».
import { useQueryClient } from '@tanstack/vue-query';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import { useRoutePage } from '../movies/useRoutePage';
import SeriesQueuePanel from './SeriesQueuePanel.vue';
import SonarrNav from './SonarrNav.vue';
import { seriesKeys } from './series-api';

const { t } = useI18n();
const { slug } = useRoutePage();
const queryClient = useQueryClient();
const banner = ref<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

/** Séries importées : bibliothèque et fiches à relire. */
function onLeft(): void {
  void queryClient.invalidateQueries({ queryKey: seriesKeys.all(slug.value) });
}
</script>

<template>
  <v-container fluid class="sonarr-page" data-test="sonarr-queue-page">
    <ServiceDownBanner service="sonarr" :instance="slug" />
    <SonarrNav />
    <h2 class="text-title-medium mb-2">{{ t('media.queue_page.title') }}</h2>
    <v-alert
      v-if="banner"
      :type="banner.type"
      variant="tonal"
      density="compact"
      closable
      class="mb-3"
      data-test="sonarr-queue-banner"
      @click:close="banner = null"
      >{{ banner.text }}</v-alert
    >
    <SeriesQueuePanel
      :slug="slug"
      standalone
      @left="onLeft"
      @notice="(type, text) => (banner = { type, text })"
    />
  </v-container>
</template>
