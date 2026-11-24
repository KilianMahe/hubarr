<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Pagination des listes paginées par Radarr/Sonarr (manquants, cutoff,
// historique, liste de blocage) : « Page p — n sur total », précédent, suivant.
// Affichée seulement au-delà d'une page, comme l'original.
import { msChevronLeft, msChevronRight } from './symbols';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  page: number;
  count: number;
  total: number;
  pageSize: number;
  /** Préfixe des clés `pagination_summary`, `prev`, `next` (`media.films_missing`…). */
  i18nPrefix: string;
  /** Résumé « Page p / n » (`pagination_summary_tpl` des pages Sonarr) au lieu de « p — n sur total ». */
  pagesSummary?: boolean;
}>();
const emit = defineEmits<{ 'update:page': [page: number] }>();
const { t } = useI18n();
const hasNext = computed(() => props.page * props.pageSize < props.total);
const summary = computed(() =>
  props.pagesSummary
    ? t(`${props.i18nPrefix}.pagination_summary_tpl`, {
        page: props.page,
        total: Math.ceil(props.total / props.pageSize),
      })
    : t(`${props.i18nPrefix}.pagination_summary`, {
        page: props.page,
        count: props.count,
        total: props.total,
      }),
);
</script>

<template>
  <div
    v-if="total > pageSize"
    class="d-flex flex-wrap align-center ga-2 pa-3"
    data-test="arr-pager"
  >
    <span class="text-body-small text-muted">{{ summary }}</span>
    <v-spacer />
    <v-btn
      :prepend-icon="msChevronLeft"
      size="small"
      variant="text"
      :disabled="page <= 1"
      @click="emit('update:page', page - 1)"
      >{{ t(`${i18nPrefix}.prev`) }}</v-btn
    >
    <v-btn
      :append-icon="msChevronRight"
      size="small"
      variant="text"
      :disabled="!hasNext"
      data-test="arr-pager-next"
      @click="emit('update:page', page + 1)"
      >{{ t(`${i18nPrefix}.next`) }}</v-btn
    >
  </div>
</template>
