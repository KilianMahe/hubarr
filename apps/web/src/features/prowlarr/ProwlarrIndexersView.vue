<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Page des indexeurs Prowlarr (`prowlarr/index.html.twig`, route n° 238) :
// tuiles, santé, liste des indexeurs (tableau sur grand écran, cartes sur
// mobile) avec filtre, test, bascule, modification, suppression ; tester
// tout, synchroniser les applications, ajouter ; fiche d'un indexeur ;
// applications connectées. Hubarr ajoute la sélection et les actions en
// masse ; recherche multi-indexeurs et grab (P3c.2).
import {
  PROWLARR_INDEXER_FILTERS,
  type ProwlarrIndexer,
  type ProwlarrIndexerBulkRequest,
  type ProwlarrIndexerFilter,
  type ProwlarrOverview,
} from '@hubarr/shared';
import {
  msAdd,
  msCheck,
  msClose,
  msDelete,
  msDoneAll,
  msEdit,
  msScience,
  msSync,
  msWarning,
} from '../../components/symbols';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { apiErrorText } from '../../app/api/error-text';
import { useFormat } from '../../app/format';
import { fillLegacy } from '../../app/legacy-template';
import { useFabQueryAction } from '../../app/service-chrome';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import ServiceDownBanner from '../../components/ServiceDownBanner.vue';
import type { AdminFeedback } from '../arr-admin/admin-api';
import { useConfirmAction } from '../arr-admin/admin-api';
import { useArrCommand } from '../movies/useArrCommand';
import IndexerBulkDialog from './IndexerBulkDialog.vue';
import IndexerDialog from './IndexerDialog.vue';
import IndexerInfoDialog from './IndexerInfoDialog.vue';
import ProwlarrNav from './ProwlarrNav.vue';
import ProwlarrSearchCard from './ProwlarrSearchCard.vue';
import {
  filterIndexers,
  indexerHealth,
  indexerPayload,
  initialIndexerForm,
  withIndexerEnabled,
} from './indexers';
import { prowlarrApi, prowlarrKeys } from './prowlarr-api';
import StatTile from '../../components/ds/StatTile.vue';
import { vWrite } from '../../app/access';

const { t } = useI18n();
const format = useFormat();
const { mdAndDown, smAndDown } = useDisplay();
const queryClient = useQueryClient();
const confirm = useConfirmAction();

const overview = useQuery({
  queryKey: prowlarrKeys.overview,
  queryFn: ({ signal }) => prowlarrApi.overview(signal),
  placeholderData: keepPreviousData,
  retry: false,
});
const data = computed(() => overview.data.value ?? null);
const feedback = ref<AdminFeedback | null>(null);

// ── Filtre et sélection ──────────────────────────────────────────────────────

const filter = ref<ProwlarrIndexerFilter>('all');
const filterItems = computed(() =>
  PROWLARR_INDEXER_FILTERS.map((value) => ({ value, title: t(`prowlarr.index.filter_${value}`) })),
);
const indexers = computed(() => filterIndexers(data.value?.indexers ?? [], filter.value));
const selected = ref<number[]>([]);
watch([filter, () => data.value?.indexers], () => {
  const visible = new Set(indexers.value.map((indexer) => indexer.id));
  selected.value = selected.value.filter((id) => visible.has(id));
});
const allSelected = computed(
  () => indexers.value.length > 0 && selected.value.length === indexers.value.length,
);
function toggleAll(): void {
  selected.value = allSelected.value ? [] : indexers.value.map((indexer) => indexer.id);
}
function toggleSelected(id: number): void {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((item) => item !== id)
    : [...selected.value, id];
}

async function refresh(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: prowlarrKeys.all });
}

// ── Actions d'une ligne ──────────────────────────────────────────────────────

const rowTests = reactive(new Map<number, 'pending' | 'ok' | 'failed'>());
async function testIndexer(indexer: ProwlarrIndexer): Promise<void> {
  rowTests.set(indexer.id, 'pending');
  try {
    const raw = await prowlarrApi.indexer(indexer.id);
    const result = await prowlarrApi.testIndexer(indexerPayload(raw, initialIndexerForm(raw, [])));
    rowTests.set(indexer.id, result.ok ? 'ok' : 'failed');
    feedback.value = result.ok
      ? { type: 'success', text: `${indexer.name} — ${t('prowlarr.common.test_success')}` }
      : {
          type: 'error',
          text: `${indexer.name} — ${fillLegacy(t('prowlarr.common.test_failure_tpl'), {
            ERROR: result.message ?? '—',
          })}`,
        };
  } catch (failure) {
    rowTests.set(indexer.id, 'failed');
    feedback.value = {
      type: 'error',
      text: `${indexer.name} — ${apiErrorText(failure, t, 'prowlarr.common.error')}`,
    };
  }
  setTimeout(() => rowTests.delete(indexer.id), 3_000);
}

const toggling = ref<number | null>(null);
async function toggleIndexer(indexer: ProwlarrIndexer): Promise<void> {
  toggling.value = indexer.id;
  try {
    const result = await prowlarrApi.toggleIndexer(indexer.id);
    queryClient.setQueryData<ProwlarrOverview>(prowlarrKeys.overview, (current) =>
      current ? withIndexerEnabled(current, indexer.id, result.enabled) : current,
    );
  } catch (failure) {
    feedback.value = {
      type: 'error',
      text: fillLegacy(t('prowlarr.common.error_tpl'), {
        ERROR: apiErrorText(failure, t, 'prowlarr.index.error_save_failed'),
      }),
    };
  } finally {
    toggling.value = null;
  }
}

function askDelete(id: number, name: string): void {
  confirm.ask(
    fillLegacy(t('prowlarr.index.confirm_delete_indexer_tpl'), { NAME: name }),
    async () => {
      try {
        await prowlarrApi.deleteIndexer(id);
        info.open = false;
        feedback.value = null;
        await refresh();
      } catch (failure) {
        feedback.value = {
          type: 'error',
          text: fillLegacy(t('prowlarr.common.error_tpl'), {
            ERROR: apiErrorText(failure, t, 'prowlarr.common.error'),
          }),
        };
      }
    },
  );
}

// ── Tester tout, synchroniser ────────────────────────────────────────────────

const testingAll = ref(false);
async function testAll(): Promise<void> {
  testingAll.value = true;
  try {
    const result = await prowlarrApi.testAll();
    const names = new Map(
      (data.value?.indexers ?? []).map((indexer) => [indexer.id, indexer.name]),
    );
    const failures = result.results
      .filter((item) => !item.isValid)
      .map(
        (item) =>
          `${names.get(item.id) ?? `#${item.id}`}${item.message ? ` : ${item.message}` : ''}`,
      );
    feedback.value = result.ok
      ? { type: 'success', text: t('prowlarr.index.test_all_ok') }
      : {
          type: 'warning',
          text: [t('prowlarr.index.test_all_errors'), ...failures].join('\n'),
        };
    await refresh();
  } catch (failure) {
    feedback.value = { type: 'error', text: apiErrorText(failure, t, 'prowlarr.common.error') };
  } finally {
    testingAll.value = false;
  }
}

const commands = useArrCommand({ statusOf: (_slug, id) => prowlarrApi.commandStatus(id) });
const sync = reactive<{ running: boolean; label: string | null }>({ running: false, label: null });
async function syncApps(): Promise<void> {
  sync.running = true;
  sync.label = null;
  try {
    const started = await prowlarrApi.command('ApplicationIndexerSync');
    if (started.cmdId !== null) {
      const result = await commands.follow('', started.cmdId, (tick) => {
        sync.label = tick.status.status;
      });
      if (result.outcome === 'stopped') return;
      feedback.value =
        result.outcome === 'completed'
          ? { type: 'success', text: t('prowlarr.index.sync_done') }
          : { type: 'error', text: t('prowlarr.index.sync_failed') };
    } else {
      feedback.value = { type: 'success', text: t('prowlarr.index.sync_done') };
    }
  } catch (failure) {
    feedback.value = {
      type: 'error',
      text: `${t('prowlarr.index.sync_failed')} — ${apiErrorText(failure, t, 'prowlarr.common.error')}`,
    };
  } finally {
    sync.running = false;
    sync.label = null;
  }
}

// ── Dialogues ────────────────────────────────────────────────────────────────

const editor = reactive<{ open: boolean; id: number | null }>({ open: false, id: null });
function openEditor(id: number | null): void {
  editor.id = id;
  editor.open = true;
}
// FAB du service (barre basse, mobile, P5b.4) : `?action=add`.
useFabQueryAction('add', () => {
  openEditor(null);
});
async function onSaved(message: string): Promise<void> {
  feedback.value = { type: 'success', text: message };
  await refresh();
}

const info = reactive<{ open: boolean; id: number | null }>({ open: false, id: null });
function openInfo(id: number): void {
  info.id = id;
  info.open = true;
}
function editFromInfo(id: number): void {
  info.open = false;
  openEditor(id);
}

// ── Actions en masse ─────────────────────────────────────────────────────────

const bulk = reactive({ editOpen: false, saving: false });
async function runBulk(action: () => Promise<unknown>, successText: string): Promise<boolean> {
  bulk.saving = true;
  try {
    await action();
    feedback.value = { type: 'success', text: successText };
    selected.value = [];
    await refresh();
    return true;
  } catch (failure) {
    feedback.value = {
      type: 'error',
      text: apiErrorText(failure, t, 'prowlarr.index.bulk.error'),
    };
    return false;
  } finally {
    bulk.saving = false;
  }
}
function bulkEnable(enable: boolean): void {
  const ids = [...selected.value];
  void runBulk(
    () => prowlarrApi.bulkUpdate({ ids, enable }),
    t('prowlarr.index.bulk.saved', { count: ids.length }),
  );
}
async function bulkSave(request: ProwlarrIndexerBulkRequest): Promise<void> {
  const ok = await runBulk(
    () => prowlarrApi.bulkUpdate(request),
    t('prowlarr.index.bulk.saved', { count: request.ids.length }),
  );
  if (ok) bulk.editOpen = false;
}
function bulkDelete(): void {
  const ids = [...selected.value];
  confirm.ask(t('prowlarr.index.bulk.confirm_delete', { count: ids.length }), () =>
    runBulk(
      () => prowlarrApi.bulkDelete(ids),
      t('prowlarr.index.bulk.deleted', { count: ids.length }),
    ),
  );
}

// ── Affichage ────────────────────────────────────────────────────────────────

const tiles = computed(() => {
  const totals = data.value?.totals;
  return [
    { key: 'indexers', value: totals?.total ?? 0, color: 'service-text' },
    { key: 'active', value: totals?.enabled ?? 0, color: 'success' },
    { key: 'failing', value: totals?.failing ?? 0, color: 'error' },
    { key: 'torrent', value: totals?.torrent ?? 0, color: 'primary' },
    { key: 'usenet', value: totals?.usenet ?? 0, color: 'info' },
    { key: 'apps', value: data.value?.applications.length ?? 0, color: 'success' },
  ];
});
const privacyKey = (privacy: string | null) =>
  privacy === 'private'
    ? 'prowlarr.index.privacy_private'
    : privacy === 'semiPrivate'
      ? 'prowlarr.index.privacy_semi'
      : 'prowlarr.index.privacy_public';
const privacyColor = (privacy: string | null) =>
  privacy === 'private' ? 'error' : privacy === 'semiPrivate' ? 'warning' : 'success';
const protocolLabel = (protocol: string) =>
  protocol === 'torrent' ? 'Torrent' : protocol === 'usenet' ? 'Usenet' : protocol;
const protocolColor = (protocol: string) =>
  protocol === 'torrent' ? 'primary' : protocol === 'usenet' ? 'info' : undefined;
const healthTitle = (indexer: ProwlarrIndexer) =>
  indexer.status?.disabledTill
    ? t('prowlarr.index.status_disabled_till', {
        date: format.dateTime(indexer.status.disabledTill),
      })
    : undefined;
const testIcon = (id: number) =>
  rowTests.get(id) === 'ok' ? msCheck : rowTests.get(id) === 'failed' ? msClose : msScience;
const testColor = (id: number) =>
  rowTests.get(id) === 'ok' ? 'success' : rowTests.get(id) === 'failed' ? 'error' : undefined;
</script>

<template>
  <v-container fluid class="prowlarr-indexers" data-test="prowlarr-indexers">
    <ServiceDownBanner service="prowlarr" />
    <ProwlarrNav />

    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <h2 class="text-title-medium">{{ t('prowlarr.index.indexers_card_title') }}</h2>
      <v-chip v-if="data" size="small" variant="tonal">{{ data.indexers.length }}</v-chip>
      <v-spacer />
      <v-btn
        v-write
        variant="text"
        size="small"
        :prepend-icon="msDoneAll"
        :loading="testingAll"
        :title="t('prowlarr.index.test_all_title')"
        :disabled="data === null"
        data-test="prowlarr-test-all"
        @click="testAll"
        >{{ t('prowlarr.index.test_all_btn') }}</v-btn
      >
      <v-btn
        v-write
        variant="text"
        size="small"
        :prepend-icon="msSync"
        :loading="sync.running && sync.label === null"
        :disabled="data === null || sync.running"
        :title="t('prowlarr.index.sync_apps_title')"
        data-test="prowlarr-sync"
        @click="syncApps"
        >{{ sync.label ?? t('prowlarr.index.sync_apps_btn') }}</v-btn
      >
      <v-filter-select
        v-model="filter"
        :items="filterItems"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 170px"
        data-test="prowlarr-filter"
      />
      <v-btn
        v-if="!smAndDown"
        v-write
        color="service"
        size="small"
        :prepend-icon="msAdd"
        :disabled="data === null"
        data-test="prowlarr-add"
        @click="openEditor(null)"
        >{{ t('prowlarr.common.add') }}</v-btn
      >
    </div>

    <v-alert
      v-if="feedback"
      :type="feedback.type"
      variant="tonal"
      density="compact"
      closable
      class="mb-3 prowlarr-indexers__feedback"
      data-test="prowlarr-feedback"
      @click:close="feedback = null"
      >{{ feedback.text }}</v-alert
    >
    <v-alert
      v-if="overview.isError.value"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-test="prowlarr-error"
      >{{ t('prowlarr.common.error_unreachable') }}</v-alert
    >
    <v-progress-linear v-else-if="overview.isPending.value" indeterminate color="service" />

    <template v-if="data">
      <!-- Tuiles -->
      <div class="prowlarr-indexers__tiles mb-4">
        <StatTile
          v-for="tile in tiles"
          :key="tile.key"
          :value="tile.value"
          :label="t(`prowlarr.index.stats_${tile.key}`)"
          :color="tile.color"
          :data-test="`prowlarr-tile-${tile.key}`"
        />
      </div>

      <!-- Santé -->
      <v-card
        v-if="data.health.length > 0"
        variant="flat"
        border
        class="mb-4"
        data-test="prowlarr-health"
      >
        <v-card-title class="text-title-medium d-flex align-center ga-2">
          <v-icon :icon="msWarning" color="warning" size="small" />
          {{ t('prowlarr.index.health_title') }}
          <v-chip size="x-small" color="warning" variant="tonal">{{ data.health.length }}</v-chip>
        </v-card-title>
        <v-card-text>
          <v-alert
            v-for="(item, index) in data.health"
            :key="index"
            :type="item.type === 'error' ? 'error' : 'warning'"
            variant="tonal"
            density="compact"
            border="start"
            class="mb-2"
          >
            <div class="text-body-medium">{{ item.message }}</div>
            <div v-if="item.source" class="text-body-small text-muted">{{ item.source }}</div>
          </v-alert>
        </v-card-text>
      </v-card>

      <!-- Indexeurs : tableau (grand écran) -->
      <v-card v-if="!mdAndDown" variant="flat" border class="mb-4">
        <v-table density="compact" class="prowlarr-indexers__table">
          <thead>
            <tr>
              <th style="width: 40px">
                <v-checkbox-btn
                  v-write
                  :model-value="allSelected"
                  :indeterminate="selected.length > 0 && !allSelected"
                  :aria-label="t('media.films.bulk.select_all')"
                  density="compact"
                  data-test="prowlarr-select-all"
                  @update:model-value="toggleAll"
                />
              </th>
              <th>{{ t('prowlarr.index.col_name') }}</th>
              <th>{{ t('prowlarr.index.col_protocol') }}</th>
              <th>{{ t('prowlarr.index.col_privacy') }}</th>
              <th>{{ t('prowlarr.index.col_priority') }}</th>
              <th>{{ t('prowlarr.index.col_functions') }}</th>
              <th>{{ t('prowlarr.index.col_categories') }}</th>
              <th>{{ t('prowlarr.index.col_queries') }}</th>
              <th>{{ t('prowlarr.index.col_grabs') }}</th>
              <th>{{ t('prowlarr.index.col_failures') }}</th>
              <th>{{ t('prowlarr.index.col_health') }}</th>
              <th>{{ t('prowlarr.index.col_added') }}</th>
              <th class="text-end">{{ t('prowlarr.index.col_actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="indexer in indexers"
              :key="indexer.id"
              :class="{ 'prowlarr-indexers__row--off': !indexer.enabled }"
              data-test="prowlarr-indexer-row"
            >
              <td>
                <v-checkbox-btn
                  v-write
                  :model-value="selected.includes(indexer.id)"
                  :aria-label="indexer.name"
                  density="compact"
                  data-test="prowlarr-select"
                  @update:model-value="toggleSelected(indexer.id)"
                />
              </td>
              <td>
                <a
                  href="#"
                  class="font-weight-medium text-service-text text-decoration-none"
                  data-test="prowlarr-indexer-name"
                  @click.prevent="openInfo(indexer.id)"
                  >{{ indexer.name }}</a
                >
                <div v-if="indexer.definitionName" class="text-body-small text-muted">
                  {{ indexer.definitionName }}
                </div>
              </td>
              <td>
                <v-chip
                  size="x-small"
                  label
                  variant="tonal"
                  :color="protocolColor(indexer.protocol)"
                  >{{ protocolLabel(indexer.protocol) }}</v-chip
                >
              </td>
              <td>
                <v-chip
                  size="x-small"
                  label
                  variant="tonal"
                  :color="privacyColor(indexer.privacy)"
                  >{{ t(privacyKey(indexer.privacy)) }}</v-chip
                >
              </td>
              <td class="text-muted">{{ indexer.priority }}</td>
              <td class="text-no-wrap">
                <v-chip
                  size="x-small"
                  label
                  variant="tonal"
                  :color="indexer.supportsRss ? 'success' : undefined"
                  class="me-1"
                  >RSS</v-chip
                >
                <v-chip
                  size="x-small"
                  label
                  variant="tonal"
                  :color="indexer.supportsSearch ? 'success' : undefined"
                  >{{ t('prowlarr.index.info_cap_search') }}</v-chip
                >
              </td>
              <td class="text-muted">{{ indexer.categoryCount }}</td>
              <td class="text-muted">{{ indexer.counters?.queries ?? '—' }}</td>
              <td :class="(indexer.counters?.grabs ?? 0) > 0 ? 'text-success' : 'text-muted'">
                {{ indexer.counters?.grabs ?? 0 }}
              </td>
              <td :class="(indexer.counters?.failures ?? 0) > 0 ? 'text-error' : 'text-muted'">
                {{ indexer.counters?.failures ?? 0 }}
              </td>
              <td>
                <span
                  class="prowlarr-indexers__health text-body-small"
                  :class="`prowlarr-indexers__health--${indexerHealth(indexer)}`"
                  :title="healthTitle(indexer)"
                  data-test="prowlarr-indexer-health"
                  >{{ t(`prowlarr.index.status_${indexerHealth(indexer)}`) }}</span
                >
              </td>
              <td class="text-no-wrap text-muted">
                {{ indexer.added ? format.date(indexer.added) : '—' }}
              </td>
              <td class="text-end text-no-wrap">
                <v-btn
                  v-write
                  :icon="msEdit"
                  variant="text"
                  size="small"
                  :aria-label="t('prowlarr.common.edit')"
                  :title="t('prowlarr.common.edit')"
                  data-test="prowlarr-indexer-edit"
                  @click="openEditor(indexer.id)"
                />
                <v-btn
                  v-write
                  :icon="testIcon(indexer.id)"
                  :color="testColor(indexer.id)"
                  variant="text"
                  size="small"
                  :loading="rowTests.get(indexer.id) === 'pending'"
                  :aria-label="t('prowlarr.common.test')"
                  :title="t('prowlarr.common.test')"
                  data-test="prowlarr-indexer-test"
                  @click="testIndexer(indexer)"
                />
                <v-btn
                  v-write
                  size="x-small"
                  variant="tonal"
                  :color="indexer.enabled ? 'success' : 'error'"
                  :loading="toggling === indexer.id"
                  :title="
                    t(
                      indexer.enabled
                        ? 'prowlarr.index.toggle_disable_title'
                        : 'prowlarr.index.toggle_enable_title',
                    )
                  "
                  class="mx-1"
                  data-test="prowlarr-indexer-toggle"
                  @click="toggleIndexer(indexer)"
                  >{{ t(indexer.enabled ? 'prowlarr.common.on' : 'prowlarr.common.off') }}</v-btn
                >
                <v-btn
                  v-write
                  :icon="msDelete"
                  variant="text"
                  color="error"
                  size="small"
                  :aria-label="t('prowlarr.common.delete')"
                  :title="t('prowlarr.common.delete')"
                  data-test="prowlarr-indexer-delete"
                  @click="askDelete(indexer.id, indexer.name)"
                />
              </td>
            </tr>
            <tr v-if="indexers.length === 0">
              <td colspan="13" class="text-center text-muted py-6" data-test="prowlarr-empty">
                {{ t('prowlarr.index.empty_indexers') }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <!-- Indexeurs : cartes (mobile) -->
      <div v-else class="mb-4">
        <p
          v-if="indexers.length === 0"
          class="text-center text-muted py-6"
          data-test="prowlarr-empty"
        >
          {{ t('prowlarr.index.empty_indexers') }}
        </p>
        <v-card
          v-for="indexer in indexers"
          :key="indexer.id"
          variant="flat"
          border
          class="mb-2"
          :class="{ 'prowlarr-indexers__row--off': !indexer.enabled }"
          data-test="prowlarr-indexer-row"
        >
          <div class="d-flex align-start pa-2 ga-1">
            <v-checkbox-btn
              v-write
              :model-value="selected.includes(indexer.id)"
              :aria-label="indexer.name"
              density="compact"
              data-test="prowlarr-select"
              @update:model-value="toggleSelected(indexer.id)"
            />
            <div class="flex-grow-1 min-w-0 pt-1" @click="openInfo(indexer.id)">
              <div
                class="font-weight-medium text-service-text text-truncate"
                data-test="prowlarr-indexer-name"
              >
                {{ indexer.name }}
              </div>
              <div class="d-flex flex-wrap align-center ga-1 mt-1">
                <v-chip
                  size="x-small"
                  label
                  variant="tonal"
                  :color="protocolColor(indexer.protocol)"
                  >{{ protocolLabel(indexer.protocol) }}</v-chip
                >
                <v-chip
                  size="x-small"
                  label
                  variant="tonal"
                  :color="privacyColor(indexer.privacy)"
                  >{{ t(privacyKey(indexer.privacy)) }}</v-chip
                >
                <span
                  class="prowlarr-indexers__health text-body-small ms-1"
                  :class="`prowlarr-indexers__health--${indexerHealth(indexer)}`"
                  data-test="prowlarr-indexer-health"
                  >{{ t(`prowlarr.index.status_${indexerHealth(indexer)}`) }}</span
                >
              </div>
              <div class="text-body-small text-muted mt-1">
                {{ t('prowlarr.index.col_queries') }} {{ indexer.counters?.queries ?? '—' }} ·
                {{ t('prowlarr.index.col_grabs') }} {{ indexer.counters?.grabs ?? 0 }} ·
                {{ t('prowlarr.index.col_failures') }} {{ indexer.counters?.failures ?? 0 }}
              </div>
            </div>
            <v-switch
              v-write
              :model-value="indexer.enabled"
              :loading="toggling === indexer.id"
              :aria-label="
                t(
                  indexer.enabled
                    ? 'prowlarr.index.toggle_disable_title'
                    : 'prowlarr.index.toggle_enable_title',
                )
              "
              color="success"
              density="compact"
              hide-details
              class="flex-grow-0"
              data-test="prowlarr-indexer-toggle"
              @update:model-value="toggleIndexer(indexer)"
            />
          </div>
          <v-divider />
          <div class="d-flex justify-end pa-1">
            <v-btn
              v-write
              :icon="msEdit"
              variant="text"
              size="small"
              :aria-label="t('prowlarr.common.edit')"
              data-test="prowlarr-indexer-edit"
              @click="openEditor(indexer.id)"
            />
            <v-btn
              v-write
              :icon="testIcon(indexer.id)"
              :color="testColor(indexer.id)"
              variant="text"
              size="small"
              :loading="rowTests.get(indexer.id) === 'pending'"
              :aria-label="t('prowlarr.common.test')"
              data-test="prowlarr-indexer-test"
              @click="testIndexer(indexer)"
            />
            <v-btn
              v-write
              :icon="msDelete"
              variant="text"
              color="error"
              size="small"
              :aria-label="t('prowlarr.common.delete')"
              data-test="prowlarr-indexer-delete"
              @click="askDelete(indexer.id, indexer.name)"
            />
          </div>
        </v-card>
      </div>

      <ProwlarrSearchCard :indexers="data.indexers" />

      <!-- Applications connectées -->
      <v-card variant="flat" border class="mb-4" data-test="prowlarr-apps">
        <v-card-title class="text-title-medium">{{
          t('prowlarr.index.apps_card_title')
        }}</v-card-title>
        <v-card-text>
          <p v-if="data.applications.length === 0" class="text-center text-muted">
            {{ t('prowlarr.index.apps_empty') }}
          </p>
          <div v-else class="prowlarr-indexers__apps">
            <v-sheet
              v-for="app in data.applications"
              :key="app.id"
              border
              rounded
              class="d-flex align-center pa-2 ga-2"
            >
              <div class="flex-grow-1 min-w-0">
                <div class="text-body-medium font-weight-medium text-truncate">{{ app.name }}</div>
                <div class="text-body-small text-muted">{{ app.implementationName ?? '' }}</div>
              </div>
              <v-chip size="x-small" color="success" variant="tonal">{{
                t('prowlarr.index.apps_connected')
              }}</v-chip>
            </v-sheet>
          </div>
        </v-card-text>
      </v-card>
    </template>

    <!-- Barre de sélection -->
    <v-sheet
      v-if="selected.length > 0"
      v-write
      class="prowlarr-indexers__bulk"
      elevation="8"
      rounded="lg"
      data-test="prowlarr-bulk-bar"
    >
      <div class="d-flex flex-wrap align-center ga-2">
        <v-btn
          size="small"
          variant="tonal"
          :loading="bulk.saving"
          data-test="prowlarr-bulk-enable"
          @click="bulkEnable(true)"
          >{{ t('prowlarr.index.bulk.enable') }}</v-btn
        >
        <v-btn
          size="small"
          variant="tonal"
          :loading="bulk.saving"
          data-test="prowlarr-bulk-disable"
          @click="bulkEnable(false)"
          >{{ t('prowlarr.index.bulk.disable') }}</v-btn
        >
        <v-btn
          size="small"
          variant="tonal"
          data-test="prowlarr-bulk-edit"
          @click="bulk.editOpen = true"
          >{{ t('prowlarr.index.bulk.edit') }}</v-btn
        >
        <v-btn
          size="small"
          variant="tonal"
          color="error"
          data-test="prowlarr-bulk-delete"
          @click="bulkDelete"
          >{{ t('prowlarr.index.bulk.delete') }}</v-btn
        >
        <v-spacer />
        <v-btn size="small" variant="text" @click="selected = []">{{
          t('media.films.bulk.clear')
        }}</v-btn>
        <span class="text-body-small text-muted" data-test="prowlarr-bulk-count">{{
          t('prowlarr.index.bulk.selected', { count: selected.length })
        }}</span>
      </div>
    </v-sheet>

    <IndexerDialog v-model="editor.open" :indexer-id="editor.id" @saved="onSaved" />
    <IndexerInfoDialog
      v-model="info.open"
      :indexer-id="info.id"
      @edit="editFromInfo"
      @delete="askDelete"
    />
    <IndexerBulkDialog
      v-model="bulk.editOpen"
      :ids="selected"
      :saving="bulk.saving"
      @save="bulkSave"
    />
    <ConfirmDialog
      v-model="confirm.open.value"
      :message="confirm.message.value"
      danger
      @confirm="confirm.confirm"
    />
  </v-container>
</template>

<style scoped>
.prowlarr-indexers__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}
.prowlarr-indexers__feedback {
  white-space: pre-line;
}
.prowlarr-indexers__row--off {
  opacity: 0.6;
}
.prowlarr-indexers__health::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
  background: currentColor;
}
.prowlarr-indexers__health--ok {
  color: rgb(var(--v-theme-success));
}
.prowlarr-indexers__health--error {
  color: rgb(var(--v-theme-error));
}
.prowlarr-indexers__health--disabled {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.prowlarr-indexers__apps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.prowlarr-indexers__bulk {
  position: sticky;
  bottom: 16px;
  margin-top: 16px;
  padding: 8px 12px;
  z-index: 5;
}
</style>
