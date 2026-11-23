<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Badge de sous-titres d'un film ou d'une série (`media/_subtitle_badge.html.twig`) :
// « … » tant que l'index se charge, « Manquant n » (film : ouvre la
// recherche ; série : mène aux épisodes dans Bazarr), « Sous-titres » si
// complet ; rien si Bazarr ne suit pas l'élément.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SubtitleBadgeStatus } from './bazarr-api';

const props = defineProps<{ kind: 'movie' | 'series'; id: number; status: SubtitleBadgeStatus }>();
const emit = defineEmits<{ search: [] }>();
const { t } = useI18n();
const missingTitle = computed(() =>
  props.status !== null && props.status !== 'pending'
    ? t(props.kind === 'movie' ? 'bazarr.badge.missing_count' : 'bazarr.badge.missing_episodes', {
        count: props.status.count,
      })
    : '',
);
</script>

<template>
  <span
    v-if="status === 'pending'"
    class="subtitle-badge subtitle-badge--pending"
    :title="t('bazarr.badge.pending')"
    data-test="subtitle-badge"
    >…</span
  >
  <template v-else-if="status !== null && status.state === 'missing'">
    <button
      v-if="kind === 'movie'"
      type="button"
      class="subtitle-badge subtitle-badge--missing"
      :title="missingTitle"
      data-test="subtitle-badge"
      @click.stop="emit('search')"
    >
      {{ t('bazarr.badge.missing') }} {{ status.count }}
    </button>
    <router-link
      v-else
      class="subtitle-badge subtitle-badge--missing"
      :to="{ name: 'bazarr-series-detail', params: { seriesId: id } }"
      :title="missingTitle"
      data-test="subtitle-badge"
      @click.stop
      >{{ t('bazarr.badge.missing') }} {{ status.count }}</router-link
    >
  </template>
  <span
    v-else-if="status !== null && status.state === 'complete'"
    class="subtitle-badge subtitle-badge--complete"
    :title="t('bazarr.badge.complete')"
    data-test="subtitle-badge"
    >{{ t('bazarr.badge.subs') }}</span
  >
</template>

<style scoped>
.subtitle-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border: 0;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.5;
  text-decoration: none;
  cursor: default;
}
.subtitle-badge--missing {
  color: rgb(var(--v-theme-warning));
  cursor: pointer;
}
.subtitle-badge--complete {
  color: rgb(var(--v-theme-success));
}
.subtitle-badge--pending {
  color: rgba(255, 255, 255, 0.7);
}
</style>
