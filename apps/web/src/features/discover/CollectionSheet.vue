<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Films d'une collection TMDB (`/decouverte/collection/{id}`), avec leur état
// en bibliothèque.
import type { TmdbCard } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { discoverApi } from './discover-api';
import MediaCard from './MediaCard.vue';

const collectionId = defineModel<number | null>({ required: true });
const emit = defineEmits<{ open: [card: TmdbCard] }>();
const { t } = useI18n();
const open = computed({
  get: () => collectionId.value !== null,
  set: (value) => {
    if (!value) collectionId.value = null;
  },
});
const collection = useQuery({
  queryKey: computed(() => ['discover', 'collection', collectionId.value] as const),
  queryFn: ({ signal }) => discoverApi.collection(collectionId.value ?? 0, signal),
  enabled: computed(() => collectionId.value !== null),
  staleTime: 300_000,
  retry: false,
});
</script>

<template>
  <ResponsiveDialog v-model="open" :title="collection.data.value?.name ?? ''" :max-width="900">
    <v-progress-linear v-if="collection.isFetching.value" indeterminate color="primary" />
    <v-alert v-if="collection.isError.value" type="error" variant="tonal">{{
      t('decouverte.error.collection_not_found')
    }}</v-alert>
    <div v-if="collection.data.value" class="media-grid">
      <MediaCard
        v-for="card in collection.data.value.results"
        :key="card.id"
        :card="card"
        @open="emit('open', $event)"
      />
    </div>
  </ResponsiveDialog>
</template>

<style scoped>
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}
</style>
