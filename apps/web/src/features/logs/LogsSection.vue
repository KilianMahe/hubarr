<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Section « Journaux » des paramètres (`section-logs`, admins) : les dernières
// entrées gardées en mémoire par le serveur (secrets masqués), filtrables par
// niveau, service et texte, rafraîchies automatiquement tant que la section est
// affichée. Une entrée s'ouvre en détail (contexte complet, copie) ; la liste
// filtrée se télécharge en `.jsonl`. L'ancienne adresse `admin/logs` y mène.
import { LOG_LEVEL_NAMES, type LogEntry, type LogLevelName, type LogsFilter } from '@hubarr/shared';
import { msDownload, msFindInPage, msRefresh, msSearch } from '../../components/symbols';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../../app/format';
import EmptyState from '../../components/EmptyState.vue';
import LogEntryDialog from './LogEntryDialog.vue';
import {
  LOGS_KEY,
  LOGS_REFRESH_MS,
  fetchLogs,
  levelColor,
  logServiceLabel,
  logsExportHref,
} from './logs-api';

const { t } = useI18n();
const format = useFormat();

const level = ref<LogLevelName | null>(null);
const service = ref<string | null>(null);
// `null` quand la croix du champ l'efface.
const search = ref<string | null>('');
// Recherche envoyée au serveur 300 ms après la dernière frappe.
const query = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => (query.value = value ?? ''), 300);
});
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
});
const autoRefresh = ref(true);

const filter = computed<LogsFilter>(() => ({
  ...(level.value === null ? {} : { level: level.value }),
  ...(service.value === null ? {} : { service: service.value }),
  ...(query.value.trim() === '' ? {} : { q: query.value.trim() }),
}));

const logs = useInfiniteQuery({
  queryKey: computed(() => [...LOGS_KEY, filter.value] as const),
  queryFn: ({ pageParam, signal }) => fetchLogs(filter.value, pageParam, signal),
  initialPageParam: undefined as number | undefined,
  getNextPageParam: (last) => last.nextBefore ?? undefined,
  placeholderData: keepPreviousData,
  // Rafraîchi tant que seule la première page est affichée (le reste glisserait).
  // Calculé pour que le bouton arrête ou relance aussitôt le minuteur.
  refetchInterval: computed(() =>
    autoRefresh.value
      ? (current: { state: { data?: { pages: unknown[] } | undefined } }) =>
          (current.state.data?.pages.length ?? 1) <= 1 ? LOGS_REFRESH_MS : false
      : false,
  ),
});

const entries = computed<LogEntry[]>(
  () => logs.data.value?.pages.flatMap((page) => page.entries) ?? [],
);
const first = computed(() => logs.data.value?.pages[0]);
const services = computed(() => {
  const list = first.value?.services ?? [];
  // Le service filtré reste proposé même s'il a quitté le tampon.
  return service.value !== null && !list.includes(service.value) ? [...list, service.value] : list;
});
const subtitle = computed(() =>
  first.value
    ? t('admin.logs.subtitle', {
        count: first.value.total,
        capacity: first.value.capacity,
        level: t(`admin.logs.level.${first.value.level}`),
      })
    : null,
);
const levelItems = computed(() =>
  LOG_LEVEL_NAMES.map((value) => ({ value, title: t(`admin.logs.level.${value}`) })),
);
const serviceItems = computed(() =>
  services.value.map((value) => ({ value, title: logServiceLabel(value) })),
);
const filtered = computed(() => Object.keys(filter.value).length > 0);
const exportHref = computed(() => logsExportHref(filter.value));

const selected = ref<LogEntry | null>(null);
const detailOpen = computed({
  get: () => selected.value !== null,
  set: (value: boolean) => {
    if (!value) selected.value = null;
  },
});

function resetFilters(): void {
  level.value = null;
  service.value = null;
  search.value = '';
  clearTimeout(searchTimer);
  query.value = '';
}
</script>

<template>
  <section id="section-logs" data-section="logs">
    <div class="logs-head mb-4">
      <div class="logs-head__text">
        <h2 class="text-title-large mb-1">{{ t('admin.logs.title') }}</h2>
        <p v-if="subtitle" class="text-body-medium text-muted" data-test="logs-subtitle">
          {{ subtitle }}
        </p>
      </div>
      <v-btn
        :icon="msRefresh"
        :aria-label="t('common.action.refresh')"
        :loading="logs.isFetching.value"
        variant="text"
        data-test="logs-refresh"
        @click="logs.refetch()"
      />
      <v-btn
        :icon="msDownload"
        :aria-label="t('admin.logs.download')"
        :href="exportHref"
        download
        variant="text"
        data-test="logs-download"
      />
    </div>

    <div class="logs-filters">
      <v-select
        v-model="level"
        :items="levelItems"
        :label="t('admin.logs.filter.level')"
        clearable
        density="compact"
        hide-details
        variant="outlined"
        data-test="logs-level"
      />
      <v-select
        v-model="service"
        :items="serviceItems"
        :label="t('admin.logs.filter.service')"
        :no-data-text="t('admin.logs.filter.no_service')"
        clearable
        density="compact"
        hide-details
        variant="outlined"
        data-test="logs-service"
      />
      <v-text-field
        v-model="search"
        :label="t('admin.logs.filter.search')"
        :prepend-inner-icon="msSearch"
        clearable
        density="compact"
        hide-details
        variant="outlined"
        class="logs-filters__search"
        data-test="logs-search"
      />
      <v-switch
        v-model="autoRefresh"
        :label="t('admin.logs.auto_refresh')"
        color="primary"
        density="compact"
        hide-details
        inset
        data-test="logs-auto-refresh"
      />
    </div>

    <v-progress-linear v-if="logs.isPending.value" indeterminate color="primary" />
    <v-alert v-else-if="logs.isError.value" type="error" variant="tonal">{{
      t('error.generic.message')
    }}</v-alert>
    <EmptyState
      v-else-if="entries.length === 0"
      :title="filtered ? t('admin.logs.empty.filtered') : t('admin.logs.empty.title')"
      :text="filtered ? '' : t('admin.logs.empty.text')"
      :icon="msFindInPage"
      data-test="logs-empty"
    >
      <v-btn v-if="filtered" variant="tonal" data-test="logs-reset" @click="resetFilters">{{
        t('common.action.reset')
      }}</v-btn>
    </EmptyState>
    <template v-else>
      <v-list lines="two" density="compact" class="bg-transparent pa-0" data-test="logs-list">
        <v-list-item
          v-for="entry in entries"
          :key="entry.id"
          rounded="lg"
          class="log-row"
          :data-test="`log-${entry.id}`"
          @click="selected = entry"
        >
          <template #prepend>
            <v-chip
              :color="levelColor(entry.level)"
              size="x-small"
              variant="tonal"
              label
              class="log-row__level me-3"
              >{{ t(`admin.logs.level.${entry.level}`) }}</v-chip
            >
          </template>
          <v-list-item-title class="log-row__msg">{{ entry.msg || '—' }}</v-list-item-title>
          <v-list-item-subtitle>
            {{ format.dateTime(entry.time, true)
            }}<template v-if="entry.service"> · {{ logServiceLabel(entry.service) }}</template>
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <div v-if="logs.hasNextPage.value" class="d-flex justify-center my-4">
        <v-btn
          variant="tonal"
          :loading="logs.isFetchingNextPage.value"
          data-test="logs-more"
          @click="logs.fetchNextPage()"
          >{{ t('common.action.view_more') }}</v-btn
        >
      </div>
    </template>

    <LogEntryDialog v-model="detailOpen" :entry="selected" />
  </section>
</template>

<style scoped>
.logs-head {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.logs-head__text {
  flex: 1;
  min-width: 0;
}
.logs-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}
.log-row__msg {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85rem;
  white-space: normal;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.log-row__level {
  min-width: 64px;
  justify-content: center;
}
</style>
