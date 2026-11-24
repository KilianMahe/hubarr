<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Fiche détaillée d'un titre TMDB (`#tmdb-detail-modal` et `renderDetail`
// d'origine) : dialogue sur grand écran, feuille du bas sur mobile ; le corps
// est dans `TmdbDetailBody`. Les titres similaires remplacent la fiche.
import type { TmdbCard, TmdbDetail } from '@hubarr/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { VBottomSheet, VDialog } from 'vuetify/components';
import { discoverApi, type DetailTarget } from './discover-api';
import TmdbDetailBody from './TmdbDetailBody.vue';

const target = defineModel<DetailTarget | null>({ required: true });
defineProps<{ inlineAdd?: boolean }>();
const emit = defineEmits<{ viewed: [card: TmdbCard]; add: [detail: TmdbDetail] }>();
const { t } = useI18n();
const { smAndDown } = useDisplay();

const open = computed({
  get: () => target.value !== null,
  set: (value) => {
    if (!value) target.value = null;
  },
});
const detail = useQuery({
  queryKey: computed(() => ['discover', 'detail', target.value?.type, target.value?.id] as const),
  queryFn: ({ signal }) => {
    const current = target.value;
    if (current === null) throw new Error('no target');
    return discoverApi.detail(current.type, current.id, signal);
  },
  enabled: computed(() => target.value !== null),
  staleTime: 300_000,
  retry: false,
});
const d = computed(() => detail.data.value);

// Mémorise la fiche consultée (rangée « Consultés récemment » de la découverte).
watch(d, (value) => {
  if (value === undefined) return;
  emit('viewed', {
    id: value.id,
    type: value.type,
    title: value.title,
    year: value.year,
    release: value.release,
    overview: value.overview,
    poster: value.poster,
    posterHi: value.poster,
    backdrop: value.backdrop,
    vote: value.vote,
    voteCount: value.voteCount,
    popularity: value.popularity,
    inLibrary: value.inLibrary,
    libStatus: value.libStatus,
    libId: value.libId,
    libSlug: value.libSlug,
  });
});
function openSimilar(card: TmdbCard): void {
  target.value = { type: card.type, id: card.id };
}
</script>

<template>
  <component
    :is="smAndDown ? VBottomSheet : VDialog"
    v-model="open"
    :max-width="960"
    scrollable
    :close-on-back="false"
  >
    <v-card data-test="tmdb-detail">
      <v-progress-linear v-if="detail.isFetching.value" indeterminate color="primary" />
      <v-alert v-if="detail.isError.value" type="error" variant="tonal" class="ma-4">{{
        t('decouverte.error.not_found')
      }}</v-alert>
      <TmdbDetailBody
        v-if="d"
        :d="d"
        :inline-add="inlineAdd"
        @similar="openSimilar"
        @close="open = false"
        @add="emit('add', $event)"
      />
    </v-card>
  </component>
</template>
