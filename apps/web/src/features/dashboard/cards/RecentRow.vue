<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Derniers ajouts aux bibliothèques (`_recent_additions.html.twig`) : 16
// titres, toutes instances, date relative, badge « Téléchargé » ou chaîne.
import { useQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { openQuickLook } from '../../../app/overlays';
import MediaRow from '../../discover/MediaRow.vue';
import { dashboardApi, relativeDate } from '../dashboard-api';
import PosterTile from './PosterTile.vue';

const { t } = useI18n();
const query = useQuery({
  queryKey: ['dashboard', 'recent'],
  queryFn: ({ signal }) => dashboardApi.recent(signal),
  staleTime: 45_000,
  retry: false,
});
const ago = (iso: string | null) => {
  const rel = relativeDate(iso, new Date());
  return rel ? t(rel.key, rel.count === undefined ? {} : { count: rel.count }) : '';
};
</script>

<template>
  <MediaRow
    v-if="query.isPending.value || (query.data.value?.available && query.data.value.items.length)"
    :title="t('dashboard.recent.title')"
    :loading="query.isPending.value"
    data-test="card-recent"
  >
    <PosterTile
      v-for="item in query.data.value?.items ?? []"
      :key="`${item.type}-${item.slug}-${item.id}`"
      :title="item.title"
      :subtitle="ago(item.addedAt)"
      :poster="item.poster"
      :tv="item.type === 'series'"
      :badge="item.downloaded ? t('dashboard.lib_badge.downloaded') : item.network"
      :badge-color="item.downloaded ? 'success' : undefined"
      @open="openQuickLook({ kind: 'library', type: item.type, slug: item.slug, id: item.id })"
    />
  </MediaRow>
</template>
