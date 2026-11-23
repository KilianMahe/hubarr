<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Filmographie d'une personne (`/decouverte/person/{id}`) : photo, biographie,
// titres les plus populaires (distribution et équipe), état en bibliothèque.
import type { TmdbCard } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import { discoverApi } from './discover-api';
import MediaCard from './MediaCard.vue';

const personId = defineModel<number | null>({ required: true });
const props = defineProps<{ name?: string }>();
const emit = defineEmits<{ open: [card: TmdbCard] }>();
const { t } = useI18n();
const open = computed({
  get: () => personId.value !== null,
  set: (value) => {
    if (!value) personId.value = null;
  },
});
const person = useQuery({
  queryKey: computed(() => ['discover', 'person', personId.value] as const),
  queryFn: ({ signal }) => discoverApi.person(personId.value ?? 0, signal),
  enabled: computed(() => personId.value !== null),
  staleTime: 300_000,
  retry: false,
});
const title = computed(() => person.data.value?.name ?? props.name ?? '');
</script>

<template>
  <ResponsiveDialog v-model="open" :title="title" :max-width="900">
    <v-progress-linear v-if="person.isFetching.value" indeterminate color="primary" />
    <v-alert v-if="person.isError.value" type="error" variant="tonal">{{
      t('decouverte.error.person_not_found')
    }}</v-alert>
    <template v-if="person.data.value">
      <div class="d-flex ga-4 mb-4">
        <v-img
          v-if="person.data.value.profile"
          :src="person.data.value.profile"
          width="110"
          :aspect-ratio="2 / 3"
          rounded="lg"
          class="flex-grow-0"
        />
        <p class="text-body-medium bio">{{ person.data.value.bio }}</p>
      </div>
      <h3 class="text-title-medium mb-2">
        {{ t('decouverte.explorer.filmography') }} ·
        {{ t('decouverte.explorer.titles_count', { count: person.data.value.results.length }) }}
      </h3>
      <div class="media-grid">
        <MediaCard
          v-for="card in person.data.value.results"
          :key="`${card.type}-${card.id}`"
          :card="card"
          @open="emit('open', $event)"
        />
      </div>
    </template>
  </ResponsiveDialog>
</template>

<style scoped>
.bio {
  max-height: 10rem;
  overflow-y: auto;
  white-space: pre-line;
}
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}
</style>
