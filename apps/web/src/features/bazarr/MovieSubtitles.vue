<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Langues de sous-titres d'un film dans sa fiche (route n° 22) : présentes et
// manquantes (malentendants, forcés signalés), recherche manuelle. Rien hors
// Bazarr, ni pour un film qu'il ne suit pas.
import type { BazarrLang } from '@hubarr/shared';
import { msSearch } from '../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SubtitleSearchDialog from './SubtitleSearchDialog.vue';
import { bazarrApi, bazarrKeys, useBazarrAvailable } from './bazarr-api';

const props = defineProps<{ radarrId: number }>();
const { t } = useI18n();
const available = useBazarrAvailable();
const subtitles = useQuery({
  queryKey: computed(() => bazarrKeys.movieSubtitles(props.radarrId)),
  queryFn: ({ signal }) => bazarrApi.movieSubtitles(props.radarrId, signal),
  enabled: available,
  staleTime: 30_000,
  retry: false,
});
const searchOpen = ref(false);
const label = (lang: BazarrLang) =>
  `${lang.lang.toUpperCase()}${lang.hi ? ' HI' : ''}${lang.forced ? ' F' : ''}`;
const titleOf = (lang: BazarrLang) =>
  [lang.hi ? t('bazarr.chips.hi_title') : null, lang.forced ? t('bazarr.chips.forced_title') : null]
    .filter((part) => part !== null)
    .join(' · ') || undefined;
</script>

<template>
  <div
    v-if="subtitles.data.value?.tracked"
    class="d-flex flex-wrap align-center ga-1 mb-3"
    data-test="movie-subtitles"
  >
    <span class="text-body-small text-muted me-1">{{ t('bazarr.detail.subtitles') }}</span>
    <v-chip
      v-for="lang in subtitles.data.value.present"
      :key="`p-${label(lang)}`"
      size="x-small"
      color="success"
      variant="tonal"
      :title="titleOf(lang)"
      >{{ label(lang) }}</v-chip
    >
    <v-chip
      v-for="lang in subtitles.data.value.missing"
      :key="`m-${label(lang)}`"
      size="x-small"
      color="warning"
      variant="outlined"
      :title="titleOf(lang)"
      >{{ label(lang) }}</v-chip
    >
    <v-btn
      size="x-small"
      variant="text"
      color="service-text"
      :prepend-icon="msSearch"
      data-test="movie-subtitles-search"
      @click="searchOpen = true"
      >{{ t('bazarr.detail.search') }}</v-btn
    >
    <SubtitleSearchDialog
      v-model="searchOpen"
      kind="movie"
      :item-id="radarrId"
      @downloaded="subtitles.refetch()"
    />
  </div>
</template>
