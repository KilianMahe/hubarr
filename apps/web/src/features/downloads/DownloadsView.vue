<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Page Téléchargements agrégée (route n° 231, `/medias/:slug/telechargements`).
// L'original redirigeait vers qBittorrent ; Hubarr rassemble les clients de
// téléchargement configurés (torrent et Usenet) : téléchargements en cours,
// résumé relu toutes les 5 s (`poll-summary` de chaque client), lien vers la
// page du client.
import {
  TORRENT_CLIENTS,
  USENET_CLIENTS,
  torrentPollSummarySchema,
  usenetPollSummarySchema,
  type ServiceId,
} from '@hubarr/shared';
import { msArrowDownwardAlt } from '../../components/symbols';
import { useQueries, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RouteLocationRaw } from 'vue-router';
import { api } from '../../app/api/client';
import { isConfigured, serviceLabel } from '../../app/services';
import { useSessionStore } from '../../app/stores/session';
import EmptyState from '../../components/EmptyState.vue';
import { live, useLiveTopics } from '../../app/live';
import ServiceHeader from '../../components/ds/ServiceHeader.vue';

const { t } = useI18n();
const session = useSessionStore();

interface Entry {
  id: ServiceId;
  to: RouteLocationRaw;
  load: (signal: AbortSignal) => Promise<{ active: number; names: string[] }>;
}

const queryClient = useQueryClient();
const entries = computed<Entry[]>(() => [
  ...TORRENT_CLIENTS.filter((id) => isConfigured(session.services, id)).map((id) => ({
    id,
    to: { name: id },
    load: async (signal: AbortSignal) => {
      const summary = await api.get(`/api/${id}/poll-summary`, torrentPollSummarySchema, signal);
      return {
        active: summary.active,
        names: summary.items
          .filter((item) => item.state === 'downloading')
          .map((item) => item.name),
      };
    },
  })),
  ...USENET_CLIENTS.filter((id) => isConfigured(session.services, id)).map((id) => ({
    id,
    to: { name: 'usenet', params: { client: id } },
    load: async (signal: AbortSignal) => ({
      active: (await api.get(`/api/usenet/${id}/poll-summary`, usenetPollSummarySchema, signal))
        .active,
      names: [],
    }),
  })),
]);

const topicOf = (id: string) =>
  (USENET_CLIENTS as readonly string[]).includes(id) ? `downloads.usenet.${id}` : `downloads.${id}`;
// Chaque carte est relue à la relève de son sujet temps réel, sinon toutes les 5 s.
useLiveTopics(
  () => entries.value.map((entry) => topicOf(entry.id)),
  (topic) => {
    const entry = entries.value.find((e) => topicOf(e.id) === topic);
    if (entry) void queryClient.invalidateQueries({ queryKey: ['downloads', 'summary', entry.id] });
  },
  () => void queryClient.invalidateQueries({ queryKey: ['downloads', 'summary'] }),
);
const queries = useQueries({
  queries: computed(() =>
    entries.value.map((entry) => ({
      queryKey: ['downloads', 'summary', entry.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => entry.load(signal),
      refetchInterval: live.isLive(topicOf(entry.id)) ? (false as const) : 5_000,
      retry: false,
    })),
  ),
});
</script>

<template>
  <v-container fluid data-test="downloads-page">
    <ServiceHeader :title="t('qbittorrent.page_title')" />
    <EmptyState
      v-if="entries.length === 0"
      :title="t('downloads.none')"
      data-test="downloads-empty"
    />
    <v-row v-else density="compact">
      <v-col v-for="(entry, index) in entries" :key="entry.id" cols="12" sm="6" lg="4">
        <v-card variant="flat" border :to="entry.to" :data-test="`downloads-${entry.id}`">
          <v-card-title class="d-flex align-center text-title-medium">
            {{ serviceLabel(entry.id) }}
            <v-spacer />
            <v-chip
              v-if="queries[index]?.data"
              size="small"
              :color="(queries[index]?.data?.active ?? 0) > 0 ? 'info' : undefined"
              :prepend-icon="msArrowDownwardAlt"
              >{{ queries[index]?.data?.active ?? 0 }}</v-chip
            >
          </v-card-title>
          <v-card-text>
            <v-alert
              v-if="queries[index]?.isError"
              type="error"
              variant="tonal"
              density="compact"
              >{{
                t('error.service_banner.title_unreachable', { service: serviceLabel(entry.id) })
              }}</v-alert
            >
            <v-progress-linear
              v-else-if="queries[index]?.isPending"
              indeterminate
              color="service"
            />
            <template v-else>
              <div class="text-caption text-muted mb-1">
                {{ t('usenet.stats.active') }} : {{ queries[index]?.data?.active ?? 0 }}
              </div>
              <div
                v-for="name in (queries[index]?.data?.names ?? []).slice(0, 3)"
                :key="name"
                class="text-body-small text-truncate"
                :title="name"
              >
                {{ name }}
              </div>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
