<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Vue unique des clients torrent (P3d.1) : remplace les trois templates
// `qbittorrent/index`, `transmission/index` et `deluge/index` de l'original
// (≈ 140 Ko chacun). Pilotée par les capacités du client (`TORRENT_CAPABILITIES`).
//
// Liste paginée, filtrée et triée par le serveur, relue toutes les 3 s
// (suspendue quand l'onglet est caché, comme l'original) ; préférences
// (vue, taille de page, tri) mémorisées par client ; statistiques et VPN en
// tête ; sélection et actions groupées ; fiche, ajout, suppression, limites.
import {
  TORRENT_CAPABILITIES,
  TORRENT_FILTERS,
  type Torrent,
  type TorrentClientId,
  type TorrentSort,
} from '@hubarr/shared';
import {
  msAdd,
  msArrowDownwardAlt,
  msArrowUpwardAlt,
  msBolt,
  msCheckCircle,
  msDelete,
  msDoneAll,
  msError,
  msFolder,
  msFormatListBulleted,
  msPauseCircle,
  msPauseFill,
  msPlayArrowFill,
  msRefresh,
  msSearch,
  msSearchOff,
  msSell,
  msTable,
  msTimelapse,
  msViewHeadline,
} from '../../components/symbols';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useRouter } from 'vue-router';
import { apiErrorText } from '../../app/api/error-text';
import { useFabQueryAction } from '../../app/service-chrome';
import EmptyState from '../../components/EmptyState.vue';
import BulkActionBar from '../../components/ds/BulkActionBar.vue';
import FilterChips from '../../components/ds/FilterChips.vue';
import PullToRefresh from '../../components/ds/PullToRefresh.vue';
import ServiceHeader from '../../components/ds/ServiceHeader.vue';
import ViewModeMenu from '../../components/ds/ViewModeMenu.vue';
import type { FilterChipOption, ViewModeOption } from '../../components/ds/types';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import TorrentAddDialog from './TorrentAddDialog.vue';
import TorrentDeleteDialog from './TorrentDeleteDialog.vue';
import TorrentDetailDialog from './TorrentDetailDialog.vue';
import TorrentLimitsDialog from './TorrentLimitsDialog.vue';
import TorrentRows from './TorrentRows.vue';
import TorrentStatsPanel from './TorrentStatsPanel.vue';
import {
  PER_PAGE_OPTIONS,
  TORRENT_POLL_MS,
  VPN_POLL_MS,
  keepSelection,
  loadPrefs,
  savePrefs,
  type TorrentView,
} from './torrents';
import { torrentKeys, torrentsApi } from './torrents-api';
import { useTorrentI18n } from './use-torrent-i18n';
import { useLiveQuery } from '../../app/live';

const props = defineProps<{ client: TorrentClientId }>();
const router = useRouter();
const queryClient = useQueryClient();
const { t, tk, tl, say } = useTorrentI18n(() => props.client);
const caps = computed(() => TORRENT_CAPABILITIES[props.client]);
const api = computed(() => torrentsApi(props.client));

const { mdAndUp } = useDisplay();
// Tableau par défaut sur toutes les largeurs (P5c.7, V7, D142) ; le choix est mémorisé.
const prefs = reactive(loadPrefs(props.client, localStorage));
watch(prefs, () => {
  savePrefs(props.client, { ...prefs });
});
const state = reactive({ page: 1, filter: 'all', search: '', category: '', tag: '' });
const searchInput = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchInput, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = value;
    state.page = 1;
  }, 300);
});

const params = computed(() => ({
  page: state.page,
  perPage: prefs.perPage,
  filter: state.filter,
  search: state.search,
  category: state.category,
  tag: state.tag,
  sort: prefs.sort,
  desc: prefs.desc ? '1' : '0',
}));
// Relu à chaque relève du flux temps réel (`downloads.<client>`, liste servie
// par la lecture partagée du serveur), sinon toutes les 3 s.
const listInterval = useLiveQuery({
  topic: () => `downloads.${props.client}`,
  queryKey: () => torrentKeys.all(props.client),
  fallbackMs: TORRENT_POLL_MS,
});
const list = useQuery({
  queryKey: computed(() => torrentKeys.list(props.client, params.value)),
  queryFn: ({ signal }) => api.value.list(params.value, signal),
  placeholderData: keepPreviousData,
  refetchInterval: listInterval,
  retry: false,
});
const vpn = useQuery({
  queryKey: computed(() => torrentKeys.vpn(props.client)),
  queryFn: ({ signal }) => api.value.vpn(signal),
  enabled: computed(() => caps.value.vpn),
  refetchInterval: VPN_POLL_MS,
  retry: false,
});

const torrents = computed(() => list.data.value?.torrents ?? []);
const pagination = computed(() => list.data.value?.pagination ?? null);
watch(pagination, (value) => {
  if (value && value.page !== state.page) state.page = value.page;
});

// Pics de vitesse et durée de la session de la page (`peakDl`, `sessionStartTs`).
const sessionStart = Date.now();
const peaks = reactive({ dl: 0, up: 0 });
const uptimeMs = ref(0);
watch(
  () => list.data.value?.stats,
  (stats) => {
    if (!stats) return;
    peaks.dl = Math.max(peaks.dl, stats.dlSpeed);
    peaks.up = Math.max(peaks.up, stats.upSpeed);
    uptimeMs.value = Date.now() - sessionStart;
  },
);

// Sélection : réduite aux torrents affichés à chaque rafraîchissement.
const selected = ref(new Set<string>());
let anchor: string | null = null;
watch(torrents, (rows) => {
  selected.value = keepSelection(
    selected.value,
    rows.map((row) => row.hash),
  );
});
function toggle(hash: string, range: boolean): void {
  const next = new Set(selected.value);
  const hashes = torrents.value.map((row) => row.hash);
  if (range && anchor !== null && hashes.includes(anchor)) {
    const [a, b] = [hashes.indexOf(anchor), hashes.indexOf(hash)].sort((x, y) => x - y);
    for (const h of hashes.slice(a, (b ?? 0) + 1)) next.add(h);
  } else if (next.has(hash)) next.delete(hash);
  else next.add(hash);
  anchor = hash;
  selected.value = next;
}
const allSelected = computed(
  () => torrents.value.length > 0 && torrents.value.every((row) => selected.value.has(row.hash)),
);
function toggleAll(): void {
  selected.value = allSelected.value ? new Set() : new Set(torrents.value.map((row) => row.hash));
}

const filters = computed(() =>
  TORRENT_FILTERS.filter((filter) => filter !== 'stalled' || caps.value.stalled),
);
function setFilter(filter: string): void {
  state.filter = filter;
  state.page = 1;
}
function setCategory(category: string): void {
  state.category = category;
  state.page = 1;
}
function setTag(tag: string): void {
  state.tag = tag;
  state.page = 1;
}
const FILTER_ICONS: Record<string, string> = {
  all: msDoneAll,
  active: msBolt,
  downloading: msArrowDownwardAlt,
  seeding: msArrowUpwardAlt,
  stalled: msTimelapse,
  paused: msPauseCircle,
  completed: msCheckCircle,
  error: msError,
};
// Filtres avec compteurs (les tuiles de l'en-tête de P3d, P5b.1 Q1).
const filterOptions = computed<(FilterChipOption<string> & { count: number | null })[]>(() => {
  const stats = list.data.value?.stats;
  const counts: Record<string, number | undefined> = {
    all: stats?.total,
    downloading: stats?.downloading,
    seeding: stats?.seeding,
    stalled: stats?.stalled,
    paused: stats?.paused,
    error: stats?.errored,
  };
  return filters.value.map((filter) => ({
    value: filter,
    label: tk(`filters.${filter}`),
    icon: FILTER_ICONS[filter] ?? msDoneAll,
    count: counts[filter] ?? null,
  }));
});
const sortItems = computed(() =>
  (
    [
      ['added', true, 'sort.added_desc'],
      ['added', false, 'sort.added_asc'],
      ['name', false, 'sort.name_asc'],
      ['name', true, 'sort.name_desc'],
      ['size', true, 'sort.size_desc'],
      ['size', false, 'sort.size_asc'],
      ['progress', true, 'sort.progress_desc'],
      ['dlspeed', true, 'sort.dlspeed_desc'],
      ['upspeed', true, 'sort.upspeed_desc'],
      ['ratio', true, 'sort.ratio_desc'],
      ['seeds', true, 'sort.seeds_desc'],
    ] as const
  ).map(([sort, desc, label]) => ({ value: `${sort}:${desc ? '1' : '0'}`, title: tk(label) })),
);
const sortValue = computed({
  get: () => `${prefs.sort}:${prefs.desc ? '1' : '0'}`,
  set: (value: string) => {
    const [sort, desc] = value.split(':');
    prefs.sort = (sort ?? 'added') as TorrentSort;
    prefs.desc = desc === '1';
  },
});
function sortBy(sort: TorrentSort): void {
  if (prefs.sort === sort) prefs.desc = !prefs.desc;
  else {
    prefs.sort = sort;
    prefs.desc = sort !== 'name';
  }
}
const viewOptions = computed<ViewModeOption<TorrentView>[]>(() => [
  { value: 'list', icon: msFormatListBulleted, label: tk('view.list_title') },
  { value: 'table', icon: msTable, label: tk('view.table_title') },
  { value: 'compact', icon: msViewHeadline, label: tk('view.compact_title') },
]);

const refresh = () => queryClient.invalidateQueries({ queryKey: torrentKeys.all(props.client) });

async function run(task: () => Promise<unknown>, message: string): Promise<boolean> {
  try {
    await task();
    say.success(message);
    await refresh();
    return true;
  } catch (error) {
    say.error(apiErrorText(error, t, 'qbittorrent.toast.error_generic'));
    return false;
  }
}

// Fiche.
const detailHash = ref<string | null>(null);
const detailOpen = computed({
  get: () => detailHash.value !== null,
  set: (value: boolean) => {
    if (!value) detailHash.value = null;
  },
});
const detailTorrent = computed(
  () => torrents.value.find((row) => row.hash === detailHash.value) ?? null,
);

// Suppression.
const deleteOpen = ref(false);
const deleteTarget = ref<string[]>([]);
const deleteName = computed(() =>
  deleteTarget.value.length === 1
    ? (torrents.value.find((row) => row.hash === deleteTarget.value[0])?.name ?? null)
    : null,
);
function askDelete(hashes: string[]): void {
  deleteTarget.value = hashes;
  deleteOpen.value = true;
}
async function confirmDelete(deleteFiles: boolean): Promise<void> {
  const hashes = [...deleteTarget.value];
  const message =
    tk('toast.bulk_deleted_tpl', { count: hashes.length }) +
    (deleteFiles ? tk('toast.bulk_deleted_with_files_suffix') : '');
  const [first] = hashes;
  const ok = await run(
    () =>
      hashes.length === 1 && first !== undefined
        ? api.value.torrent(first, 'delete', { deleteFiles })
        : api.value.bulk('delete', hashes, { deleteFiles }),
    message,
  );
  if (ok) {
    if (detailHash.value !== null && hashes.includes(detailHash.value)) detailHash.value = null;
    selected.value = new Set([...selected.value].filter((hash) => !hashes.includes(hash)));
  }
}

function rowAction(hash: string, action: 'pause' | 'resume' | 'delete'): void {
  if (action === 'delete') askDelete([hash]);
  else
    void run(
      () => api.value.torrent(hash, action),
      tk(action === 'pause' ? 'toast.paused' : 'toast.resumed'),
    );
}

function bulk(action: 'pause' | 'resume' | 'recheck'): void {
  const hashes = [...selected.value];
  const label = {
    pause: 'toast.bulk_paused_tpl',
    resume: 'toast.bulk_resumed_tpl',
    recheck: 'toast.bulk_recheck_tpl',
  }[action];
  void run(() => api.value.bulk(action, hashes), tk(label, { count: hashes.length }));
}
const bulkCategory = ref<string | null>(null);
function applyBulkCategory(category: string | null): void {
  if (category === null) return;
  void run(
    () => api.value.bulk('category', [...selected.value], { category }),
    tk('toast.action_sent'),
  );
  bulkCategory.value = null;
}
function pauseAll(): void {
  void run(
    () => (caps.value.pauseAllRoute ? api.value.pauseAll() : api.value.bulk('pause', ['all'])),
    tk('toast.pause_all'),
  );
}
function resumeAll(): void {
  void run(
    () => (caps.value.pauseAllRoute ? api.value.resumeAll() : api.value.bulk('resume', ['all'])),
    tk('toast.resume_all'),
  );
}

// Badge Radarr/Sonarr : résolution puis ouverture de la fiche.
const resolving = ref<string | null>(null);
async function resolve(torrent: Torrent): Promise<void> {
  const pipeline = /^(films|movies|radarr)$/i.test(torrent.category) ? 'radarr' : 'sonarr';
  resolving.value = torrent.hash;
  try {
    const result = await api.value.resolve(pipeline, torrent.hash);
    if (result.found && result.url) await router.push(result.url);
    else say.info(tl('toast.cat_resolve_no_match_tpl', { NAME: torrent.name.slice(0, 50) }));
  } catch {
    say.error(tk('toast.cat_resolve_error'));
  } finally {
    resolving.value = null;
  }
}

const perPageItems: number[] = [...PER_PAGE_OPTIONS];
const addOpen = ref(false);
// Tirer pour rafraîchir (mobile).
const pulling = ref(false);
async function pullRefresh(): Promise<void> {
  pulling.value = true;
  try {
    await list.refetch();
  } finally {
    pulling.value = false;
  }
}
// FAB (mobile, P5b.4) : `?action=add`.
useFabQueryAction('add', () => (addOpen.value = true));
const limitsOpen = ref(false);
const categories = computed(() => list.data.value?.categories ?? []);
const tags = computed(() => list.data.value?.tags ?? []);
const title = computed(() => t(`sidebar.nav.${props.client}`));
const subtitle = computed(() =>
  pagination.value ? tk('count_tpl', { count: pagination.value.total }) : null,
);
const categoryOptions = computed(() => [
  { value: '', title: tk('filters.category_all') },
  ...categories.value.map((c) => ({ value: c, title: c })),
]);
const tagOptions = computed(() => [
  { value: '', title: tk('filters.tag_all') },
  ...tags.value.map((c) => ({ value: c, title: c })),
]);
</script>

<template>
  <v-container fluid :data-test="`torrents-${client}`">
    <ServiceDownBanner :service="client" />
    <ServiceHeader :service="client" :title="title" :subtitle="subtitle">
      <v-btn
        v-if="mdAndUp"
        :prepend-icon="msAdd"
        color="service"
        variant="flat"
        data-test="torrent-add-open"
        @click="addOpen = true"
        >{{ tk('toolbar.add') }}</v-btn
      >
      <v-btn
        :icon="msPauseFill"
        variant="tonal"
        size="small"
        :title="tk('toolbar.pause_all_title')"
        :aria-label="tk('toolbar.pause_all_title')"
        data-test="torrent-pause-all"
        @click="pauseAll"
      />
      <v-btn
        :icon="msPlayArrowFill"
        variant="tonal"
        size="small"
        :title="tk('toolbar.resume_all_title')"
        :aria-label="tk('toolbar.resume_all_title')"
        data-test="torrent-resume-all"
        @click="resumeAll"
      />
    </ServiceHeader>

    <v-alert
      v-if="list.isError.value && !list.data.value"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-test="torrents-error"
      >{{ t('error.service_banner.title_unreachable', { service: title }) }}</v-alert
    >
    <v-progress-linear
      v-else-if="list.isPending.value"
      indeterminate
      color="service"
      class="mb-3"
    />

    <template v-if="list.data.value">
      <TorrentStatsPanel
        :client="client"
        :stats="list.data.value.stats"
        :vpn="vpn.data.value ?? null"
        :peaks="peaks"
        :uptime-ms="uptimeMs"
        @limits="limitsOpen = true"
      />

      <div class="torrents-layout" :class="{ 'torrents-layout--panel': mdAndUp }">
        <!-- Panneau de filtres (desktop, D132) : états avec compteurs, catégories, étiquettes -->
        <aside v-if="mdAndUp" class="torrents-panel" data-test="torrent-panel">
          <v-list
            density="compact"
            nav
            class="py-0 bg-transparent"
            :selected="[state.filter]"
            color="service-text"
            mandatory
            @update:selected="(value: unknown[]) => setFilter(String(value[0] ?? 'all'))"
          >
            <v-list-item
              v-for="option in filterOptions"
              :key="option.value"
              :value="option.value"
              :prepend-icon="option.icon"
              :title="option.label"
              :data-test="`torrent-filter-${option.value}`"
            >
              <template v-if="option.count !== null" #append>
                <span class="text-caption">{{ option.count }}</span>
              </template>
            </v-list-item>
          </v-list>
          <template v-if="categories.length > 0">
            <div class="torrents-panel__title">{{ tk('filters.category_label') }}</div>
            <v-list
              density="compact"
              nav
              class="py-0 bg-transparent"
              :selected="[state.category]"
              color="service-text"
              mandatory
              @update:selected="(value: unknown[]) => setCategory(String(value[0] ?? ''))"
            >
              <v-list-item
                v-for="option in categoryOptions"
                :key="option.value"
                :value="option.value"
                :prepend-icon="msFolder"
                :title="option.title"
              />
            </v-list>
          </template>
          <template v-if="caps.tags && tags.length > 0">
            <div class="torrents-panel__title">{{ tk('filters.tag_label') }}</div>
            <v-list
              density="compact"
              nav
              class="py-0 bg-transparent"
              :selected="[state.tag]"
              color="service-text"
              mandatory
              @update:selected="(value: unknown[]) => setTag(String(value[0] ?? ''))"
            >
              <v-list-item
                v-for="option in tagOptions"
                :key="option.value"
                :value="option.value"
                :prepend-icon="msSell"
                :title="option.title"
              />
            </v-list>
          </template>
        </aside>

        <div class="torrents-main">
          <FilterChips
            v-if="!mdAndUp"
            :model-value="state.filter"
            :options="filterOptions"
            test-prefix="torrent-filter"
            class="mb-1"
            @update:model-value="setFilter"
          />
          <div class="d-flex flex-wrap align-center ga-2 mb-2">
            <v-checkbox-btn
              :model-value="allSelected"
              :indeterminate="selected.size > 0 && !allSelected"
              density="compact"
              class="flex-grow-0"
              :aria-label="tk('filters.select_all')"
              data-test="torrent-select-all"
              @click="toggleAll"
            />
            <v-filter-field
              v-model="searchInput"
              :prepend-inner-icon="msSearch"
              :placeholder="tk('filters.search_placeholder')"
              :aria-label="tk('filters.search_placeholder')"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              class="torrents-search"
              data-test="torrent-search"
            />
            <template v-if="!mdAndUp">
              <v-filter-select
                v-if="categories.length > 0"
                :model-value="state.category"
                :items="categoryOptions"
                :label="tk('filters.category_label')"
                density="compact"
                variant="outlined"
                hide-details
                class="torrents-select"
                @update:model-value="setCategory"
              />
              <v-filter-select
                v-if="caps.tags && tags.length > 0"
                :model-value="state.tag"
                :items="tagOptions"
                :label="tk('filters.tag_label')"
                density="compact"
                variant="outlined"
                hide-details
                class="torrents-select"
                @update:model-value="setTag"
              />
            </template>
            <v-filter-select
              v-if="prefs.view !== 'table'"
              v-model="sortValue"
              :items="sortItems"
              :label="tk('filters.sort_label')"
              density="compact"
              variant="outlined"
              hide-details
              class="torrents-select torrents-select--sort"
              data-test="torrent-sort"
            />
            <v-spacer />
            <!-- Même sélecteur que Radarr et Sonarr (P5d.6, V28) -->
            <ViewModeMenu
              v-model="prefs.view"
              :options="viewOptions"
              :label="t('common.view_mode')"
              test-id="torrent-view"
            />
          </div>

          <PullToRefresh :loading="pulling" @refresh="pullRefresh">
            <v-card variant="flat" border>
              <EmptyState
                v-if="torrents.length === 0"
                :icon="msSearchOff"
                :title="tk('empty.no_match')"
                data-test="torrents-empty"
              />
              <TorrentRows
                v-else
                :client="client"
                :torrents="torrents"
                :view="prefs.view"
                :selected="selected"
                :sort="prefs.sort"
                :desc="prefs.desc"
                :resolving="resolving"
                @open="detailHash = $event"
                @toggle="toggle"
                @action="rowAction"
                @resolve="resolve"
                @sort="sortBy"
              />
            </v-card>
          </PullToRefresh>

          <div
            v-if="pagination && pagination.total > 0"
            class="d-flex flex-wrap align-center ga-2 mt-2"
          >
            <span class="text-body-small text-muted">{{
              tl('pagination.info_tpl', {
                FROM: (pagination.page - 1) * pagination.perPage + 1,
                TO: Math.min(pagination.page * pagination.perPage, pagination.total),
                TOTAL: pagination.total,
              })
            }}</span>
            <v-spacer />
            <v-filter-select
              v-model="prefs.perPage"
              :items="perPageItems"
              :label="tk('pagination.per_page')"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 130px"
              @update:model-value="state.page = 1"
            />
            <v-pagination
              v-if="pagination.totalPages > 1"
              v-model="state.page"
              :length="pagination.totalPages"
              :total-visible="5"
              density="compact"
              data-test="torrent-pagination"
            />
          </div>

          <v-slide-y-reverse-transition>
            <BulkActionBar
              v-if="selected.size > 0"
              :count="selected.size"
              data-test="torrent-bulk"
              @clear="selected = new Set()"
            >
              <v-btn
                size="small"
                variant="tonal"
                color="success"
                :prepend-icon="msPlayArrowFill"
                data-test="bulk-resume"
                @click="bulk('resume')"
                >{{ tk('bulk.resume') }}</v-btn
              >
              <v-btn
                size="small"
                variant="tonal"
                color="warning"
                :prepend-icon="msPauseFill"
                data-test="bulk-pause"
                @click="bulk('pause')"
                >{{ tk('bulk.pause') }}</v-btn
              >
              <v-btn
                size="small"
                variant="tonal"
                :prepend-icon="msRefresh"
                @click="bulk('recheck')"
                >{{ tk('bulk.recheck') }}</v-btn
              >
              <v-select
                v-if="caps.setCategory && categories.length > 0"
                v-model="bulkCategory"
                :items="categories"
                :placeholder="tk('bulk.category_placeholder')"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 180px"
                @update:model-value="applyBulkCategory"
              />
              <v-btn
                size="small"
                variant="tonal"
                color="error"
                :prepend-icon="msDelete"
                data-test="bulk-delete"
                @click="askDelete([...selected])"
                >{{ tk('bulk.delete') }}</v-btn
              >
            </BulkActionBar>
          </v-slide-y-reverse-transition>
        </div>
      </div>
    </template>

    <TorrentDetailDialog
      v-model="detailOpen"
      :client="client"
      :torrent="detailTorrent"
      :categories="categories"
      @delete="askDelete([$event])"
      @changed="refresh"
    />
    <TorrentAddDialog
      v-model="addOpen"
      :client="client"
      :categories="categories"
      @added="refresh"
    />
    <TorrentDeleteDialog
      v-model="deleteOpen"
      :client="client"
      :count="deleteTarget.length"
      :name="deleteName"
      @confirm="confirmDelete"
    />
    <TorrentLimitsDialog
      v-model="limitsOpen"
      :client="client"
      :stats="list.data.value?.stats ?? null"
      @changed="refresh"
    />
  </v-container>
</template>

<style scoped>
.torrents-layout--panel {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.torrents-panel {
  position: sticky;
  top: 80px;
}
.torrents-panel__title {
  padding: 12px 8px 4px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.7;
}
.torrents-search {
  flex: 1 1 200px;
  max-width: 320px;
}
.torrents-select {
  flex: 0 1 180px;
}
.torrents-select--sort {
  flex-basis: 220px;
}
@media (max-width: 599px) {
  .torrents-search {
    max-width: none;
  }
}
</style>
