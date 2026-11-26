<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Page d'un client Usenet (`usenet/index.html.twig`, routes n° 598, 600-612) :
// compteurs (en cours, en attente, vitesse, temps restant, espace libre),
// tout mettre en pause / reprendre, limite de vitesse (Mo/s), ajout de NZB
// (URL une par ligne, fichiers `.nzb`), file filtrée, triée et relue toutes
// les 3 s (onglet visible), vues liste/tableau/compacte, sélection et actions
// groupées, fiche d'un téléchargement, historique récent avec « Tout voir ».
import type { UsenetDownload } from '@hubarr/shared';
import {
  msAdd,
  msArrowDownward,
  msDelete,
  msFormatListBulleted,
  msPauseFill,
  msPlayArrowFill,
  msSchedule,
  msSearch,
  msTable,
  msUploadFile,
  msViewHeadline,
} from '../../components/symbols';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import { apiErrorText } from '../../app/api/error-text';
import { useFormat } from '../../app/format';
import { useFabQueryAction } from '../../app/service-chrome';
import { useNotifyStore } from '../../app/stores/notify';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import EmptyState from '../../components/EmptyState.vue';
import ProgressRow from '../../components/ds/ProgressRow.vue';
import PullToRefresh from '../../components/ds/PullToRefresh.vue';
import StatusChip from '../../components/ds/StatusChip.vue';
import ViewModeMenu from '../../components/ds/ViewModeMenu.vue';
import type { ViewModeOption } from '../../components/ds/types';
import ResponsiveDialog from '../../components/ResponsiveDialog.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import { fileToBase64 } from '../downloads/torrents-api';
import UsenetHistoryList from './UsenetHistoryList.vue';
import {
  USENET_FILTERS,
  USENET_POLL_MS,
  formatEta,
  loadUsenetPrefs,
  nzbgetFailKey,
  saveUsenetPrefs,
  usenetApi,
  usenetKeys,
  visibleQueue,
  type UsenetSort,
} from './usenet';
import { useLiveQuery } from '../../app/live';
import StatTile from '../../components/ds/StatTile.vue';
import ServiceHeader from '../../components/ds/ServiceHeader.vue';
import { vWrite } from '../../app/access';

const route = useRoute();
const i18n = useI18n();
const { t } = i18n;
const format = useFormat();
const notify = useNotifyStore();
const queryClient = useQueryClient();
const client = computed(() => (route.params.client === 'nzbget' ? 'nzbget' : 'sabnzbd'));
const label = computed(() => (client.value === 'nzbget' ? 'NZBGet' : 'SABnzbd'));
const api = computed(() => usenetApi(client.value));

const prefs = reactive(loadUsenetPrefs(client.value));
const viewOptions = computed<ViewModeOption<typeof prefs.view>[]>(() => [
  { value: 'list', icon: msFormatListBulleted, label: t('usenet.view.list_title') },
  { value: 'table', icon: msTable, label: t('usenet.view.table_title') },
  { value: 'compact', icon: msViewHeadline, label: t('usenet.view.compact_title') },
]);
watch(prefs, () => {
  saveUsenetPrefs(client.value, { ...prefs });
});
const filter = ref('all');
const search = ref('');

const queueInterval = useLiveQuery({
  topic: () => `downloads.usenet.${client.value}`,
  queryKey: () => usenetKeys.queue(client.value),
  fallbackMs: USENET_POLL_MS,
});
const queue = useQuery({
  queryKey: computed(() => usenetKeys.queue(client.value)),
  queryFn: ({ signal }) => api.value.queue(signal),
  refetchInterval: queueInterval,
  retry: false,
});
const overview = useQuery({
  queryKey: computed(() => usenetKeys.overview(client.value)),
  queryFn: ({ signal }) => api.value.overview(signal),
  retry: false,
});
const items = computed(() =>
  visibleQueue(queue.data.value?.items ?? [], {
    filter: filter.value,
    search: search.value,
    sort: prefs.sort,
    desc: prefs.desc,
  }),
);

// Sélection, réduite aux téléchargements encore présents.
const selected = ref(new Set<string>());
watch(
  () => queue.data.value?.items,
  (list) => {
    const present = new Set((list ?? []).map((item) => item.id));
    selected.value = new Set([...selected.value].filter((id) => present.has(id)));
  },
);
function toggle(id: string): void {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}
const allSelected = computed(
  () => items.value.length > 0 && items.value.every((item) => selected.value.has(item.id)),
);
function toggleAll(): void {
  selected.value = allSelected.value ? new Set() : new Set(items.value.map((item) => item.id));
}

const refresh = () => queryClient.invalidateQueries({ queryKey: usenetKeys.all(client.value) });
async function run(task: () => Promise<unknown>, successKey: string): Promise<boolean> {
  try {
    await task();
    notify.success(successKey);
    await refresh();
    return true;
  } catch (error) {
    notify.error('common.labels.text', { text: apiErrorText(error, t, 'usenet.toast.error') });
    return false;
  }
}

const speedInput = ref('');
watch(
  () => queue.data.value?.speedLimit,
  (limit) => {
    if (limit === undefined) return;
    speedInput.value = limit > 0 ? String(Math.round(limit / (1024 * 1024))) : '';
  },
  { immediate: true },
);
function applySpeed(): void {
  const mbps = Number(speedInput.value.replace(',', '.'));
  void run(
    () => api.value.speedLimit(Number.isFinite(mbps) && mbps > 0 ? mbps : 0),
    'usenet.toast.speed_set',
  );
}

function itemAction(item: UsenetDownload, verb: 'pause' | 'resume'): void {
  void run(
    () => api.value.item(item.id, verb),
    verb === 'pause' ? 'usenet.toast.paused' : 'usenet.toast.resumed',
  );
}
const deleteTarget = ref<string[]>([]);
const deleteOpen = ref(false);
function askDelete(ids: string[]): void {
  deleteTarget.value = ids;
  deleteOpen.value = true;
}
async function confirmDelete(): Promise<void> {
  const ids = [...deleteTarget.value];
  const [first] = ids;
  await run(
    () =>
      ids.length === 1 && first !== undefined
        ? api.value.item(first, 'delete')
        : api.value.bulk('delete', ids),
    'usenet.toast.deleted',
  );
  if (detail.value !== null && ids.includes(detail.value.id)) detail.value = null;
}
function bulk(verb: 'pause' | 'resume'): void {
  void run(
    () => api.value.bulk(verb, [...selected.value]),
    verb === 'pause' ? 'usenet.toast.paused' : 'usenet.toast.resumed',
  );
}

// Fiche.
const detail = ref<UsenetDownload | null>(null);
const detailOpen = computed({
  get: () => detail.value !== null,
  set: (value: boolean) => {
    if (!value) detail.value = null;
  },
});
const failText = (item: UsenetDownload) => {
  const key = nzbgetFailKey(client.value, item.fail);
  return key !== null && i18n.te(key) ? t(key) : item.fail;
};

// Ajout.
const addOpen = ref(false);
const addUrls = ref('');
const addCategory = ref<string | null>(null);
const addFiles = ref<File[]>([]);
const adding = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
function openAdd(): void {
  addUrls.value = '';
  addFiles.value = [];
  addOpen.value = true;
}
// FAB du service (barre basse, mobile, P5b.4) : `?action=add`.
useFabQueryAction('add', openAdd);
const { smAndDown } = useDisplay();

// Tirer pour rafraîchir (mobile).
const pulling = ref(false);
async function pullRefresh(): Promise<void> {
  pulling.value = true;
  try {
    await Promise.all([queue.refetch(), overview.refetch()]);
  } finally {
    pulling.value = false;
  }
}
async function submitAdd(): Promise<void> {
  const urls = addUrls.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (urls.length === 0 && addFiles.value.length === 0) {
    notify.error('usenet.modal_add.required');
    return;
  }
  adding.value = true;
  const trimmed = addCategory.value?.trim();
  const category = trimmed === undefined || trimmed === '' ? null : trimmed;
  let ok = true;
  try {
    if (addFiles.value.length > 0) {
      const files = await Promise.all(
        addFiles.value.map(async (file) => ({
          name: file.name,
          content: await fileToBase64(file),
        })),
      );
      ok = (await run(() => api.value.addFiles(files, category), 'usenet.toast.added')) && ok;
    }
    for (const url of urls)
      ok = (await run(() => api.value.addUrl(url, category), 'usenet.toast.added')) && ok;
  } finally {
    adding.value = false;
  }
  if (ok) addOpen.value = false;
}

const sortItems = computed(() =>
  (
    [
      ['name', false, 'usenet.sort.name_asc'],
      ['name', true, 'usenet.sort.name_desc'],
      ['size', true, 'usenet.sort.size_desc'],
      ['size', false, 'usenet.sort.size_asc'],
      ['progress', true, 'usenet.sort.progress_desc'],
      ['speed', true, 'usenet.sort.speed_desc'],
      ['eta', false, 'usenet.sort.eta_asc'],
    ] as const
  ).map(([sort, desc, key]) => ({ value: `${sort}:${desc ? '1' : '0'}`, title: t(key) })),
);
const sortValue = computed({
  get: () => `${prefs.sort}:${prefs.desc ? '1' : '0'}`,
  set: (value: string) => {
    const [sort, desc] = value.split(':');
    prefs.sort = (sort ?? 'name') as UsenetSort;
    prefs.desc = desc === '1';
  },
});
const stats = computed(() => {
  const q = queue.data.value;
  return [
    ['active', String(q?.active ?? 0)],
    ['queued', String(q?.queued ?? 0)],
    ['speed', q && q.speed > 0 ? format.speed(q.speed) : '—'],
    ['eta', formatEta(q?.eta ?? null)],
    ['free_space', format.bytes(q?.freeSpace ?? 0)],
  ] as const;
});
const statusColor = (item: UsenetDownload) =>
  item.status === 'downloading'
    ? 'info'
    : item.status === 'paused'
      ? 'warning'
      : item.status === 'failed'
        ? 'error'
        : item.status === 'completed'
          ? 'success'
          : 'secondary';
</script>

<template>
  <v-container fluid :data-test="`usenet-${client}`">
    <ServiceDownBanner :service="client" />
    <ServiceHeader
      :service="client"
      :title="label"
      :subtitle="t('usenet.count_tpl', { count: queue.data.value?.items.length ?? 0 })"
    >
      <template #subtitle>
        <span data-test="usenet-count">{{
          t('usenet.count_tpl', { count: queue.data.value?.items.length ?? 0 })
        }}</span>
      </template>
    </ServiceHeader>
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <v-chip v-if="queue.data.value?.paused" size="small" color="warning" label>{{
        t('usenet.stats.paused')
      }}</v-chip>
      <v-spacer />
      <v-btn
        v-if="!smAndDown"
        v-write
        :prepend-icon="msAdd"
        color="service"
        variant="flat"
        data-test="usenet-add-open"
        @click="openAdd"
        >{{ t('usenet.toolbar.add_nzb') }}</v-btn
      >
      <v-btn
        v-if="queue.data.value?.paused"
        v-write
        :prepend-icon="msPlayArrowFill"
        variant="tonal"
        data-test="usenet-resume-all"
        @click="run(() => api.resumeAll(), 'usenet.toast.resumed')"
        >{{ t('usenet.toolbar.resume_all') }}</v-btn
      >
      <v-btn
        v-else
        v-write
        :prepend-icon="msPauseFill"
        variant="tonal"
        data-test="usenet-pause-all"
        @click="run(() => api.pauseAll(), 'usenet.toast.paused')"
        >{{ t('usenet.toolbar.pause_all') }}</v-btn
      >
      <v-text-field
        v-model="speedInput"
        v-write
        :label="t('usenet.toolbar.speed_limit')"
        :placeholder="t('usenet.toolbar.speed_limit_placeholder')"
        density="compact"
        hide-details
        inputmode="decimal"
        style="max-width: 190px"
        data-test="usenet-speed"
        @change="applySpeed"
        @keyup.enter="applySpeed"
      />
    </div>

    <v-alert
      v-if="queue.isError.value && !queue.data.value"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-test="usenet-error"
      >{{ t('usenet.error_unreachable', { client: label }) }}</v-alert
    >
    <v-progress-linear
      v-else-if="queue.isPending.value"
      indeterminate
      color="service"
      class="mb-3"
    />

    <template v-if="queue.data.value">
      <div class="stat-grid mb-3" data-test="usenet-stats">
        <StatTile
          v-for="[key, value] in stats"
          :key="key"
          :value="value"
          :label="t(`usenet.stats.${key}`)"
          dense
        />
      </div>

      <div class="d-flex flex-wrap align-center ga-2 mb-2">
        <v-checkbox-btn
          v-write
          :model-value="allSelected"
          :indeterminate="selected.size > 0 && !allSelected"
          density="compact"
          :aria-label="t('usenet.filters.select_all')"
          data-test="usenet-select-all"
          @click="toggleAll"
        />
        <v-filter-field
          v-model="search"
          :prepend-inner-icon="msSearch"
          :placeholder="t('usenet.filters.search_placeholder')"
          density="compact"
          hide-details
          clearable
          style="min-width: 180px; max-width: 280px"
        />
        <v-filter-select
          v-model="filter"
          :items="USENET_FILTERS.map((value) => ({ value, title: t(`usenet.filters.${value}`) }))"
          :label="t('usenet.filters.status_label')"
          density="compact"
          hide-details
          style="max-width: 180px"
          data-test="usenet-filter"
        />
        <v-filter-select
          v-model="sortValue"
          :items="sortItems"
          :label="t('usenet.filters.sort_label')"
          density="compact"
          hide-details
          style="max-width: 240px"
        />
        <v-spacer />
        <!-- Même sélecteur que Radarr et Sonarr (P5d.6, V28) -->
        <ViewModeMenu
          v-model="prefs.view"
          :options="viewOptions"
          :label="t('common.view_mode')"
          test-id="usenet-view"
        />
      </div>

      <PullToRefresh :loading="pulling" @refresh="pullRefresh">
        <v-card variant="flat" border class="mb-4">
          <EmptyState
            v-if="items.length === 0"
            :title="t('usenet.empty')"
            data-test="usenet-empty"
          />
          <v-table v-else-if="prefs.view === 'table'" density="compact" hover>
            <thead>
              <tr>
                <th style="width: 40px" />
                <th>{{ t('usenet.table.name') }}</th>
                <th>{{ t('usenet.table.category') }}</th>
                <th>{{ t('usenet.table.size') }}</th>
                <th>{{ t('usenet.table.progress') }}</th>
                <th>{{ t('usenet.table.speed') }}</th>
                <th>{{ t('usenet.table.eta') }}</th>
                <th>{{ t('usenet.table.status') }}</th>
                <th class="text-end">{{ t('usenet.table.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in items"
                :key="item.id"
                class="cursor-pointer"
                data-test="usenet-row"
                @click="detail = item"
              >
                <td @click.stop>
                  <v-checkbox-btn
                    v-write
                    :model-value="selected.has(item.id)"
                    density="compact"
                    :aria-label="item.name"
                    @click="toggle(item.id)"
                  />
                </td>
                <td class="text-truncate" style="max-width: 380px" :title="item.name">
                  {{ item.name }}
                </td>
                <td>{{ item.category || '—' }}</td>
                <td class="text-no-wrap">{{ format.bytes(item.size) }}</td>
                <td>{{ item.percentage.toFixed(0) }}%</td>
                <td class="text-no-wrap">{{ item.speed > 0 ? format.speed(item.speed) : '—' }}</td>
                <td>{{ formatEta(item.eta) }}</td>
                <td>{{ t(`usenet.status.${item.status}`) }}</td>
                <td class="text-end text-no-wrap" @click.stop>
                  <v-btn
                    v-write
                    :icon="item.status === 'paused' ? msPlayArrowFill : msPauseFill"
                    size="small"
                    variant="text"
                    :aria-label="
                      t(item.status === 'paused' ? 'usenet.actions.resume' : 'usenet.actions.pause')
                    "
                    @click="itemAction(item, item.status === 'paused' ? 'resume' : 'pause')"
                  />
                  <v-btn
                    v-write
                    :icon="msDelete"
                    size="small"
                    variant="text"
                    color="error"
                    :aria-label="t('usenet.actions.delete')"
                    @click="askDelete([item.id])"
                  />
                </td>
              </tr>
            </tbody>
          </v-table>
          <v-list v-else density="compact" class="py-0">
            <v-list-item
              v-for="item in items"
              :key="item.id"
              :active="selected.has(item.id)"
              data-test="usenet-row"
              @click="detail = item"
            >
              <template #prepend>
                <v-checkbox-btn
                  v-write
                  :model-value="selected.has(item.id)"
                  density="compact"
                  :aria-label="item.name"
                  @click.stop="toggle(item.id)"
                />
              </template>
              <div class="d-flex align-center ga-2">
                <span
                  class="text-body-medium font-weight-medium text-truncate"
                  :title="item.name"
                  >{{ item.name }}</span
                >
                <v-chip v-if="item.category" size="x-small" label>{{ item.category }}</v-chip>
                <v-spacer />
                <span v-if="prefs.view === 'compact'" class="text-caption">{{
                  item.status === 'fetching' && item.wait !== null
                    ? t('usenet.wait_tpl').replace('__SECONDS__', String(item.wait))
                    : `${item.percentage.toFixed(0)}%`
                }}</span>
              </div>
              <template v-if="prefs.view === 'list'">
                <ProgressRow :value="item.percentage" :color="statusColor(item)" class="my-1">
                  <span
                    >{{ format.bytes(item.size - item.remaining) }} /
                    {{ format.bytes(item.size) }}</span
                  >
                  <span v-if="item.speed > 0" class="text-info"
                    ><v-icon :icon="msArrowDownward" size="12" />{{
                      format.speed(item.speed)
                    }}</span
                  >
                  <span v-if="item.eta !== null"
                    ><v-icon :icon="msSchedule" size="12" />{{ formatEta(item.eta) }}</span
                  >
                  <span v-if="item.status === 'fetching' && item.wait !== null">{{
                    t('usenet.wait_tpl').replace('__SECONDS__', String(item.wait))
                  }}</span>
                  <span v-if="failText(item)" class="text-error">{{ failText(item) }}</span>
                </ProgressRow>
                <StatusChip
                  :label="t(`usenet.status.${item.status}`)"
                  :color="statusColor(item)"
                  data-test="usenet-status"
                />
              </template>
              <template #append>
                <v-btn
                  v-write
                  :icon="item.status === 'paused' ? msPlayArrowFill : msPauseFill"
                  size="small"
                  variant="text"
                  :aria-label="
                    t(item.status === 'paused' ? 'usenet.actions.resume' : 'usenet.actions.pause')
                  "
                  data-test="usenet-toggle"
                  @click.stop="itemAction(item, item.status === 'paused' ? 'resume' : 'pause')"
                />
                <v-btn
                  v-write
                  :icon="msDelete"
                  size="small"
                  variant="text"
                  color="error"
                  :aria-label="t('usenet.actions.delete')"
                  data-test="usenet-delete"
                  @click.stop="askDelete([item.id])"
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </PullToRefresh>
    </template>

    <v-card
      v-if="overview.data.value && overview.data.value.recentHistory.length > 0"
      variant="flat"
      border
      data-test="usenet-recent"
    >
      <v-card-title class="d-flex align-center text-title-medium">
        {{ t('usenet.history.recent_title') }}
        <v-spacer />
        <v-btn
          variant="text"
          size="small"
          :to="{ name: 'usenet-history', params: { client } }"
          data-test="usenet-history-link"
          >{{ t('usenet.history.view_all', { count: overview.data.value.historyTotal }) }}</v-btn
        >
      </v-card-title>
      <UsenetHistoryList :client="client" :items="overview.data.value.recentHistory" />
    </v-card>

    <v-slide-y-reverse-transition>
      <v-card
        v-if="selected.size > 0"
        v-write
        class="bulk-bar d-flex flex-wrap align-center ga-2 pa-2 mt-3"
        elevation="6"
        data-test="usenet-bulk"
      >
        <span class="text-body-medium ms-2">{{
          t('usenet.bulk.count', { count: selected.size })
        }}</span>
        <v-spacer />
        <v-btn size="small" variant="tonal" color="success" @click="bulk('resume')">{{
          t('usenet.actions.resume')
        }}</v-btn>
        <v-btn size="small" variant="tonal" color="warning" @click="bulk('pause')">{{
          t('usenet.actions.pause')
        }}</v-btn>
        <v-btn
          size="small"
          variant="tonal"
          color="error"
          data-test="usenet-bulk-delete"
          @click="askDelete([...selected])"
          >{{ t('usenet.actions.delete') }}</v-btn
        >
        <v-btn size="small" variant="text" @click="selected = new Set()">{{
          t('usenet.bulk.clear')
        }}</v-btn>
      </v-card>
    </v-slide-y-reverse-transition>

    <ResponsiveDialog v-model="detailOpen" :title="detail?.name ?? ''" :max-width="560">
      <v-table v-if="detail" density="compact" data-test="usenet-detail">
        <tbody>
          <tr>
            <th>{{ t('usenet.modal_detail.status') }}</th>
            <td>
              {{ t(`usenet.status.${detail.status}`) }}
              <span class="text-muted"
                >({{ detail.rawStatus || t('usenet.modal_detail.none') }})</span
              >
            </td>
          </tr>
          <tr>
            <th>{{ t('usenet.modal_detail.category') }}</th>
            <td>{{ detail.category || t('usenet.modal_detail.none') }}</td>
          </tr>
          <tr>
            <th>{{ t('usenet.modal_detail.size') }}</th>
            <td>{{ format.bytes(detail.size) }}</td>
          </tr>
          <tr>
            <th>{{ t('usenet.modal_detail.remaining') }}</th>
            <td>{{ format.bytes(detail.remaining) }}</td>
          </tr>
          <tr>
            <th>{{ t('usenet.modal_detail.progress') }}</th>
            <td>{{ detail.percentage.toFixed(1) }}%</td>
          </tr>
          <tr>
            <th>{{ t('usenet.modal_detail.speed') }}</th>
            <td>
              {{ detail.speed > 0 ? format.speed(detail.speed) : t('usenet.modal_detail.none') }}
            </td>
          </tr>
          <tr>
            <th>{{ t('usenet.modal_detail.eta') }}</th>
            <td>{{ formatEta(detail.eta) }}</td>
          </tr>
          <tr>
            <th>{{ t('usenet.modal_detail.id') }}</th>
            <td>
              <code>{{ detail.id }}</code>
            </td>
          </tr>
          <tr v-if="failText(detail)">
            <th>{{ t('usenet.modal_detail.fail') }}</th>
            <td class="text-error">{{ failText(detail) }}</td>
          </tr>
        </tbody>
      </v-table>
      <template #actions>
        <v-btn
          v-if="detail"
          v-write
          color="error"
          variant="tonal"
          @click="askDelete([detail.id])"
          >{{ t('usenet.actions.delete') }}</v-btn
        >
        <v-btn variant="text" @click="detail = null">{{ t('common.action.close') }}</v-btn>
      </template>
    </ResponsiveDialog>

    <ResponsiveDialog v-model="addOpen" :title="t('usenet.modal_add.title')" :max-width="600">
      <div data-test="usenet-add">
        <v-textarea
          v-model="addUrls"
          :label="t('usenet.modal_add.urls_label')"
          :placeholder="t('usenet.modal_add.urls_placeholder')"
          :hint="t('usenet.modal_add.urls_hint')"
          persistent-hint
          rows="3"
          auto-grow
          data-test="usenet-add-urls"
        />
        <div class="text-caption text-muted mt-4 mb-1">{{ t('usenet.modal_add.file_label') }}</div>
        <v-sheet
          border
          rounded
          class="pa-4 text-center cursor-pointer"
          @click="fileInput?.click()"
          @dragover.prevent
          @drop.prevent="
            addFiles.push(...Array.from(($event as DragEvent).dataTransfer?.files ?? []))
          "
        >
          <v-icon :icon="msUploadFile" size="28" />
          <div class="text-body-medium">{{ t('usenet.modal_add.drop_text') }}</div>
          <div class="text-caption text-muted">{{ t('usenet.modal_add.drop_browse') }}</div>
          <input
            ref="fileInput"
            type="file"
            accept=".nzb"
            multiple
            hidden
            @change="
              addFiles.push(...Array.from(($event.target as HTMLInputElement).files ?? []));
              ($event.target as HTMLInputElement).value = '';
            "
          />
        </v-sheet>
        <v-list v-if="addFiles.length > 0" density="compact">
          <v-list-item
            v-for="(file, index) in addFiles"
            :key="index"
            :title="file.name"
            :subtitle="format.bytes(file.size)"
          >
            <template #append>
              <v-btn
                :icon="msDelete"
                size="small"
                variant="text"
                :aria-label="t('usenet.modal_add.file_remove_title')"
                @click="addFiles.splice(index, 1)"
              />
            </template>
          </v-list-item>
        </v-list>
        <v-combobox
          v-model="addCategory"
          :items="overview.data.value?.categories ?? []"
          :label="t('usenet.modal_add.category_label')"
          :placeholder="t('usenet.modal_add.category_placeholder')"
          clearable
          density="compact"
          class="mt-3"
        />
      </div>
      <template #actions>
        <v-btn variant="text" @click="addOpen = false">{{ t('usenet.modal_add.cancel') }}</v-btn>
        <v-btn
          color="service"
          variant="flat"
          :loading="adding"
          data-test="usenet-add-submit"
          @click="submitAdd"
          >{{ t('usenet.modal_add.submit') }}</v-btn
        >
      </template>
    </ResponsiveDialog>

    <ConfirmDialog
      v-model="deleteOpen"
      :message="t('usenet.actions.delete_confirm')"
      :confirm-label="t('usenet.actions.delete')"
      danger
      @confirm="confirmDelete"
    />
  </v-container>
</template>

<style scoped>
.bulk-bar {
  position: sticky;
  bottom: 12px;
  z-index: 5;
}
</style>
