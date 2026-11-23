<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Onglet « File d'attente » d'une instance Radarr (P5c.6, V18) :
// films en téléchargement ou en attente d'import, avec les actions de la file
// (import forcé, téléchargement forcé, suppression) et, par ligne, la fiche du
// film, « Actualiser » et « Scanner ». Un film importé relance la bibliothèque.
import { useQueryClient } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import QueuePanel from './QueuePanel.vue';
import RadarrNav from './RadarrNav.vue';
import { moviesKeys } from './movies-api';
import { useRoutePage } from './useRoutePage';

const { t } = useI18n();
const { slug } = useRoutePage();
const queryClient = useQueryClient();

function onImported(): void {
  void queryClient.invalidateQueries({ queryKey: moviesKeys.all(slug.value) });
}
</script>

<template>
  <v-container fluid class="radarr-page" data-test="radarr-queue-page">
    <ServiceDownBanner service="radarr" :instance="slug" />
    <RadarrNav />
    <h2 class="text-title-medium mb-2">{{ t('media.queue_page.title') }}</h2>
    <QueuePanel :slug="slug" :manual-import-running="false" standalone @imported="onImported" />
  </v-container>
</template>
