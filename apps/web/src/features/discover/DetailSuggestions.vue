<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Rangées « Recommandations » et « Similaires » (TMDB) de la fiche Hubarr
// d'un film ou d'une série. Un titre déjà en bibliothèque ouvre sa fiche
// Hubarr ; un autre ouvre la fiche TMDB, d'où l'ajouter. Rien n'est affiché
// sans TMDB, sans id TMDB, en cas d'erreur ou sans suggestion.
import type { TmdbCard, TmdbMediaType } from '@hubarr/shared';
import { msLink, msThumbUp } from '../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { mediaDetailLocation } from '../../app/media-links';
import { isConfigured } from '../../app/services';
import { useSessionStore } from '../../app/stores/session';
import DetailCard from '../../components/ds/DetailCard.vue';
import ScrollRow from '../../components/ScrollRow.vue';
import { discoverApi, type DetailTarget } from './discover-api';
import MediaCard from './MediaCard.vue';
import TmdbDetailDialog from './TmdbDetailDialog.vue';

const props = defineProps<{ type: TmdbMediaType; tmdbId: number | null }>();
const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();

const enabled = computed(
  () => props.tmdbId !== null && props.tmdbId > 0 && isConfigured(session.services, 'tmdb'),
);
const query = useQuery({
  queryKey: computed(() => ['discover', 'suggestions', props.type, props.tmdbId] as const),
  queryFn: ({ signal }) => discoverApi.suggestions(props.type, props.tmdbId ?? 0, signal),
  enabled,
  staleTime: 300_000,
  retry: false,
});
const rows = computed(() => {
  const data = query.data.value;
  if (!enabled.value || data === undefined) return [];
  return [
    {
      key: 'recommendations',
      title: t('decouverte.modal.recommendations'),
      icon: msThumbUp,
      cards: data.recommendations,
    },
    {
      key: 'similar',
      title: t('decouverte.modal.similar'),
      icon: msLink,
      cards: data.similar,
    },
  ].filter((row) => row.cards.length > 0);
});

const detail = ref<DetailTarget | null>(null);
function open(card: TmdbCard): void {
  if (card.inLibrary && card.libSlug !== null && card.libId !== null) {
    void router.push(mediaDetailLocation(card.type, card.libSlug, card.libId));
  } else {
    detail.value = { type: card.type, id: card.id };
  }
}
</script>

<template>
  <div v-if="rows.length > 0" class="detail-suggestions" data-test="detail-suggestions">
    <DetailCard
      v-for="row in rows"
      :key="row.key"
      :title="row.title"
      :icon="row.icon"
      :data-test="`suggestions-${row.key}`"
    >
      <ScrollRow>
        <MediaCard
          v-for="card in row.cards"
          :key="`${card.type}-${card.id}`"
          :card="card"
          width="130"
          @open="open"
        />
      </ScrollRow>
    </DetailCard>
    <TmdbDetailDialog v-model="detail" />
  </div>
</template>

<style scoped>
.detail-suggestions {
  display: grid;
  gap: 16px;
}
</style>
