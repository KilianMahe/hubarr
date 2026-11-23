<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Métadonnées d'un titre Plex (`dashboard/_plex_metadata.html.twig`, route
// n° 533) : titre, année, classification, durée, notes, genres, résumé,
// réalisation, scénario, distribution, studio et caractéristiques du fichier.
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { tautulliApi } from './activity-api';

const props = defineProps<{ ratingKey: string | null }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const open = computed({
  get: () => props.ratingKey !== null,
  set: (value: boolean) => {
    if (!value) emit('close');
  },
});
const metadata = useQuery({
  queryKey: computed(() => ['tautulli', 'metadata', props.ratingKey]),
  queryFn: ({ signal }) => tautulliApi.metadata(props.ratingKey ?? '', signal),
  enabled: computed(() => props.ratingKey !== null),
  retry: false,
});
const meta = computed(() => metadata.data.value?.metadata ?? null);
const minutes = computed(() => (meta.value ? Math.round(meta.value.durationMs / 60_000) : 0));
const title = computed(() => {
  const m = meta.value;
  if (!m) return '';
  if (m.mediaType === 'episode' && m.grandparentTitle) {
    const code =
      m.season !== null && m.episode !== null
        ? ` — S${String(m.season).padStart(2, '0')}E${String(m.episode).padStart(2, '0')}`
        : '';
    return `${m.grandparentTitle}${code} · ${m.title ?? ''}`;
  }
  return m.title ?? '';
});
</script>

<template>
  <ResponsiveDialog v-model="open" :title="title" :max-width="640">
    <div data-test="tautulli-metadata">
      <v-progress-linear v-if="metadata.isPending.value" indeterminate color="service" />
      <v-alert v-else-if="!meta" type="warning" variant="tonal" density="compact">{{
        t('dashboard.plex.modal.error')
      }}</v-alert>
      <template v-else>
        <div class="d-flex flex-wrap ga-1 mb-2">
          <v-chip v-if="meta.year" size="small" label>{{ meta.year }}</v-chip>
          <v-chip v-if="meta.contentRating" size="small" label>{{ meta.contentRating }}</v-chip>
          <v-chip v-if="minutes > 0" size="small" label>{{
            Math.floor(minutes / 60) > 0
              ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
              : `${minutes} min`
          }}</v-chip>
          <v-chip v-if="meta.ratings.critic !== null" size="small" label
            >{{ t('dashboard.plex.modal.critic') }} {{ meta.ratings.critic }}</v-chip
          >
          <v-chip v-for="genre in meta.genres" :key="genre" size="small" variant="outlined">{{
            genre
          }}</v-chip>
        </div>
        <p v-if="meta.tagline" class="text-body-medium font-italic mb-2">{{ meta.tagline }}</p>
        <p v-if="meta.summary" class="text-body-medium mb-3">{{ meta.summary }}</p>
        <div class="text-body-small">
          <div v-if="meta.directors.length">
            {{ t('dashboard.plex.modal.directors') }} {{ meta.directors.join(', ') }}
          </div>
          <div v-if="meta.writers.length">
            {{ t('dashboard.plex.modal.writers') }} {{ meta.writers.join(', ') }}
          </div>
          <div v-if="meta.cast.length">
            {{ t('dashboard.plex.modal.cast') }} {{ meta.cast.join(', ') }}
          </div>
          <div v-if="meta.studio">{{ t('dashboard.plex.modal.studio') }} {{ meta.studio }}</div>
          <div v-if="meta.media.resolution || meta.media.videoCodec" class="mt-2 text-muted">
            {{ t('dashboard.plex.modal.tech') }} :
            {{
              [
                meta.media.resolution,
                meta.media.videoCodec,
                meta.media.audioCodec,
                meta.media.container,
              ]
                .filter(Boolean)
                .join(' · ')
            }}
          </div>
        </div>
      </template>
    </div>
    <template #actions>
      <v-btn variant="text" @click="open = false">{{ t('common.action.close') }}</v-btn>
    </template>
  </ResponsiveDialog>
</template>
