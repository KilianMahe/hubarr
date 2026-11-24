<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Demandes Seerr (`jellyseerr/index.html.twig`, routes n° 71, 72, 107-112,
// 115-117) : filtres d'état à compteurs, type et tri dans l'URL, filtre local
// par titre ou demandeur, cartes `SeerrRequestCard` (profil et dossier choisis
// sur la carte), actions approuver, refuser, relancer, supprimer (confirmée),
// modification complète (dialogue) ; pagination de 20.
import { SEERR_REQUEST_FILTERS, type SeerrRequest } from '@hubarr/shared';
import { msInbox, msSearch } from '../../../components/symbols';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { apiErrorText } from '../../../app/api/error-text';
import { useNotifyStore } from '../../../app/stores/notify';
import ConfirmDialog from '../../../components/ConfirmDialog.vue';
import EmptyState from '../../../components/EmptyState.vue';
import FilterChips from '../../../components/ds/FilterChips.vue';
import SeerrPage from '../SeerrPage.vue';
import SeerrRequestCard from '../SeerrRequestCard.vue';
import SeerrRequestEditDialog from '../SeerrRequestEditDialog.vue';
import { field, seerrApi } from '../seerr-api';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const params = computed(() => ({
  filter: typeof route.query.filter === 'string' ? route.query.filter : 'all',
  type: typeof route.query.type === 'string' ? route.query.type : '',
  sort: typeof route.query.sort === 'string' ? route.query.sort : 'added',
  page: Math.max(1, Number(route.query.page ?? 1) || 1),
}));
const page = useQuery({
  queryKey: computed(() => ['seerr', 'requests', params.value]),
  queryFn: ({ signal }) => seerrApi.requests(params.value, signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const setQuery = (patch: Record<string, string | number>) =>
  router.push({
    query: {
      ...route.query,
      page: '1',
      ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])),
    },
  });

const counts = computed(() => page.data.value?.counts ?? {});
const busy = ref<string | null>(null);
async function act(
  request: SeerrRequest,
  action: 'approve' | 'decline' | 'retry' | 'delete',
): Promise<void> {
  busy.value = `${request.id}-${action}`;
  try {
    await seerrApi.requestAction(request.id, action);
    notify.success('jellyseerr.common.saved');
    await queryClient.invalidateQueries({ queryKey: ['seerr'] });
  } catch (error) {
    notify.error('common.labels.text', {
      text: apiErrorText(error, t, 'jellyseerr.common.error_action_failed'),
    });
  } finally {
    busy.value = null;
  }
}
const deleteTarget = ref<SeerrRequest | null>(null);
const deleteOpen = ref(false);
const editTarget = ref<SeerrRequest | null>(null);
const requester = (r: SeerrRequest) =>
  field<string>(field(r, 'requestedBy', {}), 'displayName', '');

// Puces de filtre avec les compteurs connus (les tuiles de P3f, P5b.1 S2).
const FILTER_COUNTS: Partial<Record<string, string>> = {
  all: 'total',
  pending: 'pending',
  approved: 'approved',
  processing: 'processing',
};
const filterOptions = computed(() =>
  SEERR_REQUEST_FILTERS.map((filter) => {
    const key = FILTER_COUNTS[filter];
    return {
      value: filter,
      label: t(`jellyseerr.filters.${filter}`),
      count: key === undefined ? null : field(counts.value, key, 0),
    };
  }),
);
// Filtre local de la page affichée : titre ou demandeur (maquette P0, S3).
const search = ref<string | null>('');
const visible = computed(() => {
  const requests = page.data.value?.requests ?? [];
  const needle = (search.value ?? '').trim().toLocaleLowerCase();
  if (needle === '') return requests;
  return requests.filter((r) =>
    `${r.tmdb?.title ?? ''} ${requester(r)}`.toLocaleLowerCase().includes(needle),
  );
});

// Approbation depuis la carte : le profil ou le dossier modifiés sont
// enregistrés d'abord (corps de la modification complète, comme le dialogue).
async function approve(
  request: SeerrRequest,
  choice: { profileId: number | null; rootFolder: string | null } | null,
): Promise<void> {
  if (choice !== null) {
    busy.value = `${request.id}-approve`;
    try {
      await seerrApi.editRequest(request.id, {
        mediaType: request.type,
        serverId: field<number | null>(request, 'serverId', null),
        profileId: choice.profileId,
        rootFolder: choice.rootFolder,
        userId: field<number | null>(field(request, 'requestedBy', {}), 'id', null),
        ...(request.type === 'tv'
          ? {
              seasons: (field<unknown[]>(request, 'seasons', []) as Record<string, unknown>[])
                .map((s) => Number(s.seasonNumber))
                .filter((n) => Number.isFinite(n)),
            }
          : {}),
      });
    } catch (error) {
      busy.value = null;
      notify.error('common.labels.text', {
        text: apiErrorText(error, t, 'jellyseerr.common.error_action_failed'),
      });
      return;
    }
  }
  await act(request, 'approve');
}
</script>

<template>
  <SeerrPage
    :title="t('jellyseerr.index.request_title')"
    :subtitle="
      page.data.value
        ? t('jellyseerr.index.pending_count', { count: Number(field(counts, 'pending', 0)) })
        : null
    "
    :loading="page.isPending.value"
    :error="page.isError.value && !page.data.value"
  >
    <FilterChips
      :model-value="params.filter"
      :options="filterOptions"
      test-prefix="seerr-filter"
      class="mb-1"
      data-test="seerr-counts"
      @update:model-value="(v: string) => setQuery({ filter: v })"
    />
    <div class="seerr-toolbar mb-3">
      <v-filter-field
        v-model="search"
        :prepend-inner-icon="msSearch"
        :placeholder="t('jellyseerr.index.filter_placeholder')"
        :aria-label="t('jellyseerr.index.filter_placeholder')"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        class="seerr-toolbar__search"
        data-test="seerr-search"
      />
      <v-btn-toggle
        :model-value="params.type"
        density="compact"
        variant="outlined"
        divided
        mandatory
        @update:model-value="(v: string) => setQuery({ type: v })"
      >
        <v-btn value="" size="small">{{ t('jellyseerr.filters.type_all') }}</v-btn>
        <v-btn value="movie" size="small">{{ t('jellyseerr.filters.type_movie') }}</v-btn>
        <v-btn value="tv" size="small">{{ t('jellyseerr.filters.type_tv') }}</v-btn>
      </v-btn-toggle>
      <v-btn-toggle
        :model-value="params.sort"
        density="compact"
        variant="outlined"
        divided
        mandatory
        @update:model-value="(v: string) => setQuery({ sort: v })"
      >
        <v-btn value="added" size="small">{{ t('jellyseerr.filters.sort_added') }}</v-btn>
        <v-btn value="modified" size="small">{{ t('jellyseerr.filters.sort_modified') }}</v-btn>
      </v-btn-toggle>
    </div>

    <EmptyState
      v-if="page.data.value && visible.length === 0"
      :icon="msInbox"
      :title="
        t(
          params.filter === 'all' && !search
            ? 'jellyseerr.index.none'
            : 'jellyseerr.index.none_with_filter',
        )
      "
    />
    <div v-else class="seerr-grid">
      <SeerrRequestCard
        v-for="request in visible"
        :key="request.id"
        :request="request"
        :busy="busy"
        @approve="(choice) => approve(request, choice)"
        @decline="act(request, 'decline')"
        @retry="act(request, 'retry')"
        @edit="editTarget = request"
        @delete="
          deleteTarget = request;
          deleteOpen = true;
        "
      />
    </div>
    <v-pagination
      v-if="(page.data.value?.pageInfo.pages ?? 1) > 1"
      :model-value="params.page"
      :length="page.data.value?.pageInfo.pages ?? 1"
      :total-visible="5"
      density="compact"
      class="mt-3"
      @update:model-value="
        (p: number) => router.push({ query: { ...route.query, page: String(p) } })
      "
    />

    <ConfirmDialog
      v-model="deleteOpen"
      :message="t('jellyseerr.common.confirm_delete_request')"
      :confirm-label="t('jellyseerr.common.delete')"
      danger
      @confirm="deleteTarget && act(deleteTarget, 'delete')"
    />
    <SeerrRequestEditDialog :request="editTarget" @close="editTarget = null" />
  </SeerrPage>
</template>

<style scoped>
.seerr-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.seerr-toolbar__search {
  flex: 1 1 240px;
  max-width: 360px;
}
@media (max-width: 599px) {
  .seerr-toolbar__search {
    max-width: none;
    flex-basis: 100%;
  }
}
.seerr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
  gap: 12px;
}
</style>
