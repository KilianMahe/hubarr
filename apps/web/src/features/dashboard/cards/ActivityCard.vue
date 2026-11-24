<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Activité en cours (`_plex_activity.html.twig`) : Tautulli, ou Tracearr selon
// la préférence ; onglets « En cours » / « Récemment vus » (le premier par
// défaut s'il y a des flux, le choix est gardé entre deux relectures), relu
// toutes les 10 s (onglet visible). Une lecture ouvre l'aperçu TMDB quand il
// est connu.
import { resolveActivitySource, type ActivitySession } from '@hubarr/shared';
import { msPlayCircleFill } from '../../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { openQuickLook } from '../../../app/overlays';
import { useSessionStore } from '../../../app/stores/session';
import ActivityPanel from '../../activity/ActivityPanel.vue';
import { LIVE_POLL_MS, dashboardApi, relativeDate } from '../dashboard-api';
import DashCard from './DashCard.vue';
import { useLiveQuery } from '../../../app/live';
import { isConfigured } from '../../../app/services';

const { t } = useI18n();
const session = useSessionStore();
const query = useQuery({
  queryKey: ['dashboard', 'activity'],
  queryFn: ({ signal }) => dashboardApi.activity(signal),
  // Relue à chaque relève du sujet de la source (lecture partagée côté serveur).
  refetchInterval: useLiveQuery({
    topic: () => {
      const source = resolveActivitySource(session.preferences.display_activity_source, (id) =>
        isConfigured(session.services, id),
      );
      return source === null ? null : `activity.${source}`;
    },
    queryKey: ['dashboard', 'activity'],
    fallbackMs: LIVE_POLL_MS,
  }),
  retry: false,
});
const tab = ref<'now' | 'recent' | null>(null);
watch(
  () => query.data.value,
  (data) => {
    if (data && tab.value === null)
      tab.value = (data.activity?.streamCount ?? 0) > 0 ? 'now' : 'recent';
  },
);
const source = computed(() => query.data.value?.source ?? 'tautulli');
const ago = (seconds: number) => {
  const rel = relativeDate(new Date(seconds * 1000).toISOString(), new Date());
  return rel ? t(rel.key, rel.count === undefined ? {} : { count: rel.count }) : '';
};
function openSession(item: ActivitySession): void {
  if (item.quickLook?.type && item.quickLook.id) {
    openQuickLook({ kind: 'tmdb', type: item.quickLook.type, id: item.quickLook.id });
  }
}
</script>

<template>
  <DashCard
    v-if="query.data.value?.available !== false"
    :title="t(source === 'tracearr' ? 'dashboard.plex.title_tracearr' : 'dashboard.plex.title')"
    :icon="msPlayCircleFill"
    :to="session.isAdmin ? { name: 'settings', hash: '#section-display' } : undefined"
    :link-label="t('dashboard.plex.settings_cta')"
    data-test="card-activity"
  >
    <v-tabs v-model="tab" density="compact" class="mb-2">
      <v-tab value="now">{{ t('dashboard.plex.tab.now') }}</v-tab>
      <v-tab value="recent">{{ t('dashboard.plex.tab.recent') }}</v-tab>
    </v-tabs>
    <ActivityPanel
      v-if="tab !== 'recent'"
      compact
      :activity="query.data.value?.activity ?? undefined"
      :service="source"
      empty-key="dashboard.plex.empty"
      @open="openSession"
    />
    <template v-else>
      <p v-if="(query.data.value?.history.length ?? 0) === 0" class="text-body-medium text-muted">
        {{ t('dashboard.plex.recent.empty') }}
      </p>
      <v-list density="compact" class="bg-transparent pa-0">
        <v-list-item
          v-for="(item, i) in query.data.value?.history ?? []"
          :key="i"
          :title="
            item.grandparentTitle
              ? `${item.grandparentTitle} · ${item.episodeCode ?? ''}`
              : (item.title ?? t('dashboard.plex.unknown_title'))
          "
          :subtitle="`${item.userDisplayName ?? ''} · ${ago(item.watchedAt)}`"
          class="px-0"
          @click="
            item.quickLook?.type && item.quickLook.id
              ? openQuickLook({ kind: 'tmdb', type: item.quickLook.type, id: item.quickLook.id })
              : undefined
          "
        >
          <template #prepend>
            <v-avatar rounded="sm" size="40" color="surface-alt"
              ><v-img v-if="item.poster" :src="item.poster" cover
            /></v-avatar>
          </template>
        </v-list-item>
      </v-list>
    </template>
  </DashCard>
</template>
