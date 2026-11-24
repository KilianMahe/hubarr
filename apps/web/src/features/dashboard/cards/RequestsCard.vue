<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Demandes Seerr en attente (`_requests.html.twig`) : 5 au plus, titre et
// affiche, demandeur et date relative ; lien vers la gestion (admins).
import { msMoveToInbox } from '../../../components/symbols';
import { useQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { openQuickLook } from '../../../app/overlays';
import { useSessionStore } from '../../../app/stores/session';
import { dashboardApi, relativeDate } from '../dashboard-api';
import DashCard from './DashCard.vue';

const { t } = useI18n();
const session = useSessionStore();
const query = useQuery({
  queryKey: ['dashboard', 'requests'],
  queryFn: ({ signal }) => dashboardApi.requests(signal),
  staleTime: 45_000,
  retry: false,
});
const ago = (iso: string | null) => {
  const rel = relativeDate(iso, new Date());
  return rel ? t(rel.key, rel.count === undefined ? {} : { count: rel.count }) : '';
};
</script>

<template>
  <DashCard
    v-if="query.data.value?.available !== false"
    :title="t('dashboard.requests.title')"
    :icon="msMoveToInbox"
    :to="session.isAdmin ? { name: 'seerr' } : undefined"
    :link-label="t('dashboard.requests.manage_cta')"
    :loading="query.isFetching.value"
    data-test="card-requests"
  >
    <p
      v-if="query.data.value && query.data.value.items.length === 0"
      class="text-body-medium text-muted text-center py-4"
    >
      {{ t('dashboard.requests.empty') }}
    </p>
    <v-list v-else density="compact" class="bg-transparent pa-0">
      <v-list-item
        v-for="item in query.data.value?.items ?? []"
        :key="item.id"
        :title="item.title"
        :subtitle="`${t('dashboard.requests.by')} ${item.requestedBy} · ${ago(item.requestedAt)}`"
        class="px-0"
        @click="openQuickLook({ kind: 'tmdb', type: item.type, id: item.tmdbId })"
      >
        <template #prepend>
          <v-avatar rounded="sm" size="40" color="surface-alt"
            ><v-img v-if="item.poster" :src="item.poster" cover
          /></v-avatar>
        </template>
        <template #append>
          <v-chip size="x-small" color="warning" variant="tonal">{{
            t('dashboard.requests.status_pending')
          }}</v-chip>
        </template>
      </v-list-item>
    </v-list>
  </DashCard>
</template>
