<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Ma watchlist (`sections/_watchlist.html.twig`) : 16 derniers titres, lus en
// base locale avec la page (aucun service requis) ; masquée si vide.
import type { DashboardPage } from '@hubarr/shared';
import { useI18n } from 'vue-i18n';
import { openQuickLook } from '../../../app/overlays';
import MediaRow from '../../discover/MediaRow.vue';
import PosterTile from './PosterTile.vue';

defineProps<{ items: DashboardPage['watchlist'] }>();
const { t } = useI18n();
</script>

<template>
  <MediaRow
    v-if="items.length"
    :title="t('dashboard.watchlist.title')"
    :to="{ name: 'tmdb-watchlist' }"
    :link-label="t('dashboard.watchlist.view_all')"
    data-test="card-watchlist"
  >
    <PosterTile
      v-for="w in items"
      :key="`${w.mediaType}-${w.tmdbId}`"
      :title="w.title"
      :subtitle="`${t(w.mediaType === 'tv' ? 'dashboard.type.series' : 'dashboard.type.film')}${w.year ? ` · ${w.year}` : ''}`"
      :poster="w.poster"
      :tv="w.mediaType === 'tv'"
      :vote="w.vote"
      @open="openQuickLook({ kind: 'tmdb', type: w.mediaType, id: w.tmdbId })"
    />
  </MediaRow>
</template>
