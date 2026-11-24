<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Lecture en cours sur Emby (`_emby_activity.html.twig`), relue toutes les
// 10 s (onglet visible).
import type { ActivitySession } from '@hubarr/shared';
import { msPlayCircle } from '../../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { openQuickLook } from '../../../app/overlays';
import ActivityPanel from '../../activity/ActivityPanel.vue';
import { LIVE_POLL_MS, dashboardApi } from '../dashboard-api';
import DashCard from './DashCard.vue';
import { useLiveQuery } from '../../../app/live';

const { t } = useI18n();
const query = useQuery({
  queryKey: ['dashboard', 'emby'],
  queryFn: ({ signal }) => dashboardApi.emby(signal),
  refetchInterval: useLiveQuery({
    topic: 'activity.emby',
    queryKey: ['dashboard', 'emby'],
    fallbackMs: LIVE_POLL_MS,
  }),
  retry: false,
});
function openSession(item: ActivitySession): void {
  if (item.quickLook?.type && item.quickLook.id) {
    openQuickLook({ kind: 'tmdb', type: item.quickLook.type, id: item.quickLook.id });
  }
}
</script>

<template>
  <DashCard
    v-if="query.data.value?.available !== false"
    :title="t('dashboard.emby.title')"
    :icon="msPlayCircle"
    data-test="card-emby"
  >
    <ActivityPanel
      compact
      :activity="query.data.value?.activity ?? undefined"
      service="tautulli"
      empty-key="dashboard.emby.empty"
      @open="openSession"
    />
  </DashCard>
</template>
